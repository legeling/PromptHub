import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { SKILL_PLATFORMS } from "@prompthub/shared/constants/platforms";
import { createSkillPlatformService } from "../src/skills/platform-service";
import * as activation from "../src/skills/platform-activation";

it("preserves changed legacy targets and restores both names if rename publication fails", async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "prompthub-skill-rename-"),
  );
  const source = path.join(root, "source");
  const targets = path.join(root, "agent", "skills");
  const oldTarget = path.join(targets, "old-name");
  const newTarget = path.join(targets, "new-name");
  const stateFile = path.join(
    targets,
    activation.PLATFORM_ACTIVATION_STATE_FILE,
  );
  const platform = SKILL_PLATFORMS.find((item) => item.id === "claude");
  if (!platform) throw new Error("Claude platform fixture is unavailable");
  const service = createSkillPlatformService({
    getSupportedPlatforms: () => [platform],
    getPlatformSkillsDir: () => targets,
    getPlatformRootDir: () => path.dirname(targets),
    getSkillsDirAccessor: () => source,
    initSkillsDir: () =>
      fs.mkdir(source, { recursive: true }).then(() => undefined),
    saveContentToLocalRepo: async () => source,
  });
  const oldSkill = { id: "writer", name: "old-name", local_repo_path: source };
  const newSkill = { ...oldSkill, name: "new-name" };
  try {
    await fs.mkdir(source);
    await fs.writeFile(path.join(source, "SKILL.md"), "original instructions");
    const binary = Buffer.from([0, 128, 255]);
    await fs.writeFile(path.join(source, "asset.bin"), binary);
    await service.installSkillMdForSkill(
      oldSkill,
      "original instructions",
      "claude",
      source,
    );
    const originalState = await activation.readActivationState(stateFile);
    await fs.writeFile(path.join(oldTarget, "SKILL.md"), "external edits");
    await expect(
      service.installSkillMdForSkill(
        newSkill,
        "original instructions",
        "claude",
        source,
        ["old-name"],
      ),
    ).rejects.toThrow("external changes");
    expect(await fs.readFile(path.join(oldTarget, "SKILL.md"), "utf8")).toBe(
      "external edits",
    );
    await expect(fs.stat(newTarget)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await activation.readActivationState(stateFile)).toEqual(
      originalState,
    );

    await fs.writeFile(
      path.join(oldTarget, "SKILL.md"),
      "original instructions",
    );
    const publish = vi
      .spyOn(activation, "writeActivationState")
      .mockRejectedValueOnce(new Error("Activation publication failed"));
    await expect(
      service.installSkillMdForSkill(
        newSkill,
        "original instructions",
        "claude",
        source,
        ["old-name"],
      ),
    ).rejects.toThrow("Activation publication failed");
    publish.mockRestore();
    expect(await fs.readFile(path.join(oldTarget, "asset.bin"))).toEqual(
      binary,
    );
    await expect(fs.stat(newTarget)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await activation.readActivationState(stateFile)).toEqual(
      originalState,
    );

    await service.installSkillMdForSkill(
      newSkill,
      "original instructions",
      "claude",
      source,
      ["old-name"],
    );
    expect(await fs.readFile(path.join(newTarget, "SKILL.md"), "utf8")).toBe(
      "original instructions",
    );
    expect(await fs.readFile(path.join(newTarget, "asset.bin"))).toEqual(
      binary,
    );
    await expect(fs.stat(oldTarget)).rejects.toMatchObject({ code: "ENOENT" });
    expect(
      (await activation.readActivationState(stateFile))["new-name"].skillId,
    ).toBe("writer");
    expect(
      (await fs.readdir(targets)).filter((name) => name.includes("backup")),
    ).toEqual([]);
    expect(await fs.readFile(path.join(source, "asset.bin"))).toEqual(binary);
  } finally {
    vi.restoreAllMocks();
    await fs.rm(root, { recursive: true, force: true });
  }
});
