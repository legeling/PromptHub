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
import { useTranslation } from "react-i18next";
import { SkillPlatformPanel } from "../../src/renderer/components/skill/SkillPlatformPanel";
import { useSkillPlatform } from "../../src/renderer/components/skill/use-skill-platform";
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
import { DESKTOP_TEST_TIMEOUT_MS } from "../helpers/test-config";

const showToast = vi.hoisted(() => vi.fn());
const copyFault = vi.hoisted((): { targetRoot: string | null } => ({
  targetRoot: null,
}));
vi.mock("fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    cp: async (...args: Parameters<typeof actual.cp>) => {
      if (
        copyFault.targetRoot &&
        String(args[1]).startsWith(copyFault.targetRoot)
      ) {
        copyFault.targetRoot = null;
        throw Object.assign(new Error("Injected write denial"), {
          code: "EACCES",
        });
      }
      return actual.cp(...args);
    },
  };
});
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

// Native storage reads share the test deadline instead of the UI library's one-second wait.
const storageWaitOptions = { timeout: DESKTOP_TEST_TIMEOUT_MS };

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

function Sidebar({ skill }: { skill: Skill }): JSX.Element {
  const state = useSkillPlatform(skill, "copy");
  const { t } = useTranslation();
  return (
    <SkillPlatformPanel
      availablePlatforms={state.availablePlatforms}
      selectedSkill={skill}
      t={t}
      handleExport={() => undefined}
      installMode="copy"
      setInstallMode={() => undefined}
      selectedPlatforms={state.selectedPlatforms}
      skillMdInstallStatus={state.installStatus}
      isLoading={state.isLoading}
      platformError={state.platformError}
      installProgress={state.installProgress}
      isBatchInstalling={state.isBatchInstalling}
      selectAllPlatforms={state.selectAllPlatforms}
      deselectAllPlatforms={state.deselectAllPlatforms}
      togglePlatformSelection={state.togglePlatformSelection}
      uninstalledPlatforms={state.uninstalledPlatforms}
      onBatchInstall={() => void state.applyPlatformChanges()}
    />
  );
}

describe("Skill platform management through renderer and real storage", () => {
  let runtime: SkillTestRuntime;
  beforeEach(async () => {
    vi.clearAllMocks();
    copyFault.targetRoot = null;
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

  it.each(["dialog", "sidebar"])(
    "applies installation and staged removal from %s, preserving the source and reopened state",
    async (surface) => {
      const skill = await createPackage("manage-package");
      await skillApi.installMdSymlink(skill.id, skill.instructions, "codex");
      const sourceBefore = fileInventory(skill.local_repo_path!);
      const view = await renderWithI18n(
        surface === "dialog" ? (
          <SkillQuickInstall skill={skill} onClose={vi.fn()} />
        ) : (
          <Sidebar skill={skill} />
        ),
      );
      const codex = await screen.findByRole(
        "button",
        { name: /^Codex$/ },
        storageWaitOptions,
      );
      await waitFor(() =>
        expect(codex).toHaveAttribute("aria-pressed", "true"),
      );
      fireEvent.click(codex);
      fireEvent.click(screen.getByRole("button", { name: /Claude Code/ }));
      fireEvent.click(
        screen.getByRole("button", {
          name: "Apply changes",
        }),
      );
      const target = path.join(
        runtime.platformRoot("claude"),
        "skills",
        skill.name,
      );
      await waitFor(() =>
        expect(fs.existsSync(path.join(target, "docs/reference.txt"))).toBe(
          true,
        ),
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
      await renderWithI18n(
        surface === "dialog" ? (
          <SkillQuickInstall skill={skill} onClose={vi.fn()} />
        ) : (
          <Sidebar skill={skill} />
        ),
      );
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
          name: "Redistribute",
        }),
      ).toBeEnabled();
    },
  );

  it.each(["dialog", "sidebar"])(
    "redistributes current package bytes from %s to already installed targets",
    async (surface) => {
      const skill = await createPackage("redistribute-package");
      await skillApi.installMd(skill.id, skill.instructions, "claude");
      await skillApi.installMd(
        skill.id,
        skill.instructions,
        "agent-skills-global",
      );
      await skillApi.writeLocalFile(
        skill.id,
        "docs/reference.txt",
        "Updated package resource\n",
      );
      await renderWithI18n(
        surface === "dialog" ? (
          <SkillQuickInstall skill={skill} onClose={vi.fn()} />
        ) : (
          <Sidebar skill={skill} />
        ),
      );
      const button = await screen.findByRole(
        "button",
        { name: "Redistribute" },
        storageWaitOptions,
      );
      expect(button).toBeEnabled();
      fireEvent.click(button);
      const destinations = [
        path.join(runtime.platformRoot("claude"), "skills", skill.name),
        path.join(runtime.root, "home", ".agents/skills", skill.name),
      ];
      for (const destination of destinations) {
        await waitFor(
          () =>
            expect(
              fs.readFileSync(
                path.join(destination, "docs/reference.txt"),
                "utf8",
              ),
            ).toBe("Updated package resource\n"),
          storageWaitOptions,
        );
      }
      if (surface === "sidebar")
        await waitFor(
          () =>
            expect(
              screen.getByRole("button", { name: "Claude Code" }),
            ).toBeEnabled(),
          storageWaitOptions,
        );
      expect(
        screen.getByRole("button", { name: "Claude Code" }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(
        screen.getByRole("button", { name: "Shared Skill directory" }),
      ).toHaveAttribute("aria-pressed", "true");
    },
  );

  it("retains a failed installation for explicit retry and does not undo successful uninstall", async () => {
    const skill = await createPackage("partial-package");
    await skillApi.installMd(skill.id, skill.instructions, "codex");
    fs.mkdirSync(runtime.platformRoot("claude"), { recursive: true });
    fs.writeFileSync(
      path.join(runtime.platformRoot("claude"), "keep.txt"),
      "External file",
    );
    const onClose = vi.fn();
    await renderWithI18n(<SkillQuickInstall skill={skill} onClose={onClose} />);
    const codex = await screen.findByRole(
      "button",
      { name: /^Codex$/ },
      storageWaitOptions,
    );
    await waitFor(() => expect(codex).toHaveAttribute("aria-pressed", "true"));
    // Fail the copy after discovery. A file occupying skills/ instead raises
    // ENOTDIR during Linux status reads, before the install action is reachable.
    copyFault.targetRoot = runtime.platformRoot("claude");
    fireEvent.click(codex);
    fireEvent.click(screen.getByRole("button", { name: /Claude Code/ }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Apply changes",
      }),
    );
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        expect.stringContaining("Claude Code"),
        "warning",
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
        name: "Apply changes",
      }),
    ).toBeEnabled();
    expect(copyFault.targetRoot).toBeNull();
    expect(
      fs.existsSync(
        path.join(runtime.platformRoot("claude"), "skills", skill.name),
      ),
    ).toBe(false);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Apply changes",
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

  it("excludes shared storage from select-all and deploys it only after an explicit choice", async () => {
    const skill = await createPackage("shared-choice");
    await renderWithI18n(<Sidebar skill={skill} />);
    const selectAll = await screen.findByRole(
      "button",
      { name: "Select all platforms" },
      storageWaitOptions,
    );
    fireEvent.click(selectAll);
    const shared = screen.getByRole("button", {
      name: "Shared Skill directory",
    });
    expect(shared).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByText("Pending install 3 · Pending uninstall 0"),
    ).toBeVisible();
    const sharedPath = path.join(
      runtime.root,
      "home",
      ".agents",
      "skills",
      skill.name,
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply changes" }));
    await waitFor(
      () =>
        expect(
          screen.getByRole("button", { name: "Redistribute" }),
        ).toBeEnabled(),
      storageWaitOptions,
    );
    expect(fs.existsSync(sharedPath)).toBe(false);
    fireEvent.click(shared);
    fireEvent.click(selectAll);
    expect(shared).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByText("Pending install 1 · Pending uninstall 0"),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Apply changes" }));
    await waitFor(
      () =>
        expect(
          fs.readFileSync(path.join(sharedPath, "docs/reference.txt"), "utf8"),
        ).toBe("Preserve package resource\n"),
      storageWaitOptions,
    );
    await waitFor(
      () =>
        expect(
          screen.getByRole("button", { name: "Redistribute" }),
        ).toBeEnabled(),
      storageWaitOptions,
    );
    expect(await skillApi.getMdInstallStatusDetails(skill.id)).toMatchObject({
      "agent-skills-global": { installed: true },
    });
  });

  it("preserves an installed target after failed redistribution and retries without uninstalling", async () => {
    const skill = await createPackage("redistribute-retry");
    await skillApi.installMd(skill.id, skill.instructions, "claude");
    await skillApi.writeLocalFile(
      skill.id,
      "docs/reference.txt",
      "Revised package\n",
    );
    await renderWithI18n(<Sidebar skill={skill} />);
    const button = await screen.findByRole(
      "button",
      { name: "Redistribute" },
      storageWaitOptions,
    );
    // Fault injection only at the filesystem copy boundary, retaining real rollback and status reads.
    copyFault.targetRoot = runtime.platformRoot("claude");
    fireEvent.click(button);
    await waitFor(
      () =>
        expect(
          screen.getByRole("button", { name: "Redistribute" }),
        ).toBeEnabled(),
      storageWaitOptions,
    );
    const targetFile = path.join(
      runtime.platformRoot("claude"),
      "skills",
      skill.name,
      "docs/reference.txt",
    );
    expect(fs.readFileSync(targetFile, "utf8")).toBe(
      "Preserve package resource\n",
    );
    expect(copyFault.targetRoot).toBeNull();
    expect(screen.getByRole("button", { name: "Claude Code" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByText("Pending uninstall")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Redistribute" }));
    await waitFor(
      () =>
        expect(fs.readFileSync(targetFile, "utf8")).toBe("Revised package\n"),
      storageWaitOptions,
    );
    await waitFor(
      () =>
        expect(
          screen.getByRole("button", { name: "Redistribute" }),
        ).toBeEnabled(),
      storageWaitOptions,
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
    await screen.findByRole(
      "button",
      { name: /Claude Code/ },
      storageWaitOptions,
    );
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
