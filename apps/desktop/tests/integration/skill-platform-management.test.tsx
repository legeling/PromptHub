/** @vitest-environment jsdom */
// Register the runtime's native-boundary mocks before importing main services.
import {
  createSkillTestRuntime,
  fileInventory,
  skillApi,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import "@testing-library/jest-dom/vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SKILL_PLATFORMS } from "@prompthub/shared/constants/platforms";
import type { Skill } from "@prompthub/shared/types";
import { SkillQuickInstall } from "../../src/renderer/components/skill/SkillQuickInstall";
import { SkillBatchDeployDialog } from "../../src/renderer/components/skill/SkillBatchDeployDialog";
import { getDatabase } from "../../src/main/database";
import {
  getPlatformSkillsDir,
  invalidateCustomPathsCache,
} from "../../src/main/services/skill-installer-utils";
import { renderWithI18n } from "../helpers/i18n";

const showToast = vi.hoisted(() => vi.fn());
const refreshBadges = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast }),
}));
// Only unrelated UI preferences and badge refresh are substituted. The modal,
// hook, sync service, preload, IPC handlers, database and filesystem are real.
vi.mock("../../src/renderer/stores/settings.store", () => ({
  useSettingsStore: (selector: (state: object) => unknown) =>
    selector({
      skillInstallMethod: "copy",
      skillPlatformOrder: [],
      disabledPlatformIds: SKILL_PLATFORMS.filter(
        (p) => !["claude", "codex", "antigravity"].includes(p.id),
      ).map((p) => p.id),
    }),
}));
vi.mock("../../src/renderer/stores/skill.store", () => ({
  useSkillStore: (selector: (state: object) => unknown) =>
    selector({ loadDeployedStatus: refreshBadges }),
}));

async function createPackage(name: string): Promise<Skill> {
  const skill: Skill = await skillApi.create({
    name,
    instructions: "# Real package\n",
    protocol_type: "skill",
    is_favorite: false,
  });
  await skillApi.writeLocalFile(
    skill.id,
    "docs/reference.txt",
    "Preserve package resource\n",
  );
  return skill;
}

describe("Skill platform management through renderer and real storage", () => {
  let runtime: SkillTestRuntime;
  beforeEach(async () => {
    vi.clearAllMocks();
    runtime = await createSkillTestRuntime();
    Object.defineProperty(window, "api", {
      configurable: true,
      value: { skill: skillApi },
    });
  });
  afterEach(() => {
    cleanup();
    const claudeRoot = runtime?.platformRoot("claude");
    if (claudeRoot && fs.existsSync(claudeRoot))
      fs.chmodSync(claudeRoot, 0o700);
    runtime?.dispose();
    vi.restoreAllMocks();
  });

  it("applies an install and a deselection uninstall without deleting the source Skill", async () => {
    const skill = await createPackage("manage-package");
    await skillApi.installMdSymlink(skill.id, skill.instructions, "codex");
    const sourceBefore = fileInventory(skill.local_repo_path!);
    const view = await renderWithI18n(
      <SkillQuickInstall skill={skill} onClose={vi.fn()} />,
    );
    const codex = await screen.findByRole("button", { name: /^Codex$/ });
    await waitFor(() => expect(codex).toHaveAttribute("aria-pressed", "true"));
    fireEvent.click(codex);
    fireEvent.click(screen.getByRole("button", { name: /Claude Code/ }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Apply changes (install 1, uninstall 1)",
      }),
    );
    const target = path.join(
      runtime.platformRoot("claude"),
      "skills",
      skill.name,
    );
    await waitFor(() =>
      expect(fs.existsSync(path.join(target, "docs/reference.txt"))).toBe(true),
    );
    await waitFor(() =>
      expect(
        fs.existsSync(
          path.join(runtime.platformRoot("codex"), "skills", skill.name),
        ),
      ).toBe(false),
    );
    expect(
      fs.readFileSync(path.join(target, "docs/reference.txt"), "utf8"),
    ).toBe("Preserve package resource\n");
    expect(fileInventory(skill.local_repo_path!)).toEqual(sourceBefore);
    view.unmount();
    await runtime.reopen();
    expect(await skillApi.get(skill.id)).toMatchObject({
      id: skill.id,
      name: skill.name,
    });
    await renderWithI18n(<SkillQuickInstall skill={skill} onClose={vi.fn()} />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Claude Code/ }),
      ).toHaveAttribute("aria-pressed", "true"),
    );
    expect(screen.getByRole("button", { name: /^Codex$/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(
      screen.getByRole("button", {
        name: "Apply changes (install 0, uninstall 0)",
      }),
    ).toBeDisabled();
  });

  it("retains a failed installation for explicit retry and does not undo successful uninstall", async () => {
    const skill = await createPackage("partial-package");
    await skillApi.installMd(skill.id, skill.instructions, "codex");
    fs.mkdirSync(runtime.platformRoot("claude"), { recursive: true });
    fs.writeFileSync(
      path.join(runtime.platformRoot("claude"), "keep.txt"),
      "External file",
    );
    fs.chmodSync(runtime.platformRoot("claude"), 0o500);
    const onClose = vi.fn();
    await renderWithI18n(<SkillQuickInstall skill={skill} onClose={onClose} />);
    const codex = await screen.findByRole("button", { name: /^Codex$/ });
    await waitFor(() => expect(codex).toHaveAttribute("aria-pressed", "true"));
    fireEvent.click(codex);
    fireEvent.click(screen.getByRole("button", { name: /Claude Code/ }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Apply changes (install 1, uninstall 1)",
      }),
    );
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        expect.stringContaining("Claude Code"),
        "error",
      ),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(
      fs.readFileSync(
        path.join(runtime.platformRoot("claude"), "keep.txt"),
        "utf8",
      ),
    ).toBe("External file");
    expect(
      fs.existsSync(
        path.join(runtime.platformRoot("codex"), "skills", skill.name),
      ),
    ).toBe(false);
    expect(await skillApi.get(skill.id)).toMatchObject({ id: skill.id });
    expect(
      screen.getByRole("button", {
        name: "Apply changes (install 1, uninstall 0)",
      }),
    ).toBeEnabled();
    fs.chmodSync(runtime.platformRoot("claude"), 0o700);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Apply changes (install 1, uninstall 0)",
      }),
    );
    await waitFor(() =>
      expect(
        fs.existsSync(
          path.join(
            runtime.platformRoot("claude"),
            "skills",
            skill.name,
            "docs/reference.txt",
          ),
        ),
      ).toBe(true),
    );
  });

  it("batch uninstalls multiple packages from a selected platform while preserving My Skills", async () => {
    const skills = [
      await createPackage("batch-one"),
      await createPackage("batch-two"),
    ];
    for (const skill of skills)
      await skillApi.installMd(skill.id, skill.instructions, "claude");
    const onClose = vi.fn();
    await renderWithI18n(
      <SkillBatchDeployDialog skills={skills} onClose={onClose} />,
    );
    await screen.findByRole("button", { name: /Claude Code/ });
    fireEvent.click(
      screen.getByRole("button", { name: "Batch Uninstall from Platforms" }),
    );
    // Keep exactly the requested platform selected.
    for (const name of [/Codex/, /Antigravity/])
      fireEvent.click(screen.getByRole("button", { name }));
    fireEvent.click(
      screen
        .getAllByRole("button", { name: "Batch Uninstall from Platforms" })
        .at(-1)!,
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    for (const skill of skills) {
      expect(
        fs.existsSync(
          path.join(runtime.platformRoot("claude"), "skills", skill.name),
        ),
      ).toBe(false);
      expect(await skillApi.get(skill.id)).toMatchObject({ id: skill.id });
      expect(
        fs.readFileSync(
          path.join(skill.local_repo_path!, "docs/reference.txt"),
          "utf8",
        ),
      ).toBe("Preserve package resource\n");
    }
  });

  it("uses the current Antigravity default for a full package copy and uninstall", async () => {
    const overrides = Object.fromEntries(
      SKILL_PLATFORMS.filter((p) => p.id !== "antigravity").map((p) => [
        p.id,
        { rootPath: runtime.platformRoot(p.id) },
      ]),
    );
    getDatabase()
      .prepare("UPDATE settings SET value = ? WHERE key = ?")
      .run(JSON.stringify(overrides), "builtinAgentOverrides");
    invalidateCustomPathsCache();
    const platform = SKILL_PLATFORMS.find((p) => p.id === "antigravity")!;
    expect(getPlatformSkillsDir(platform)).toBe(
      path.join(runtime.root, "home/.gemini/config/skills"),
    );
    const skill = await createPackage("antigravity-package");
    await skillApi.installMd(skill.id, skill.instructions, "antigravity");
    const destination = path.join(
      os.homedir(),
      ".gemini/config/skills",
      skill.name,
    );
    expect(
      fs.readFileSync(path.join(destination, "docs/reference.txt"), "utf8"),
    ).toBe("Preserve package resource\n");
    expect(
      fs.existsSync(path.join(os.homedir(), ".gemini/skills", skill.name)),
    ).toBe(false);
    expect(
      fs.existsSync(
        path.join(os.homedir(), ".gemini/antigravity/skills", skill.name),
      ),
    ).toBe(false);
    expect(await skillApi.getMdInstallStatusDetails(skill.id)).toMatchObject({
      antigravity: { installed: true, mode: "copy" },
    });
    await skillApi.uninstallMd(skill.id, "antigravity");
    expect(fs.existsSync(destination)).toBe(false);
    expect(
      fs.existsSync(path.join(skill.local_repo_path!, "docs/reference.txt")),
    ).toBe(true);
  });
});
