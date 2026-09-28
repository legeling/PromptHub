/** @vitest-environment node */
import {
  createSkillTestRuntime,
  fileInventory,
  skillApi,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SKILL_PLATFORMS } from "@prompthub/shared/constants/platforms";
import { getDatabase } from "../../src/main/database";
import { invalidateCustomPathsCache } from "../../src/main/services/skill-installer-utils";
import { PLATFORM_ACTIVATION_STATE_FILE } from "../../src/main/services/skill-installer-platform";
import { upgradeSkillPlatformDataOnStartup } from "../../src/main/services/skill-platform-data-upgrade";

describe("Antigravity managed link upgrade [ISS-20260928-001]", () => {
  let runtime: SkillTestRuntime;
  let oldRoot: string;
  let newRoot: string;
  beforeEach(async () => {
    runtime = await createSkillTestRuntime();
    oldRoot = path.join(runtime.root, "home/.gemini/antigravity/skills");
    newRoot = path.join(runtime.root, "home/.gemini/config/skills");
    useDefaultPath();
  });
  afterEach(() => runtime?.dispose());

  function useDefaultPath() {
    getDatabase()
      .prepare("UPDATE settings SET value = ? WHERE key = ?")
      .run(
        JSON.stringify(
          Object.fromEntries(
            SKILL_PLATFORMS.filter((p) => p.id !== "antigravity").map((p) => [
              p.id,
              { rootPath: runtime.platformRoot(p.id) },
            ]),
          ),
        ),
        "builtinAgentOverrides",
      );
    invalidateCustomPathsCache();
  }

  // Historical layout and activation shape pinned to v0.5.9; current package
  // creation remains real. This is a reduced upgrade fixture, not a full old DB.
  async function oldInstallation(name = "migration-package") {
    const skill = await skillApi.create({
      name,
      instructions: "# Migration package\n",
      protocol_type: "skill",
      is_favorite: false,
    });
    await skillApi.writeLocalFile(
      skill.id,
      "docs/guide.txt",
      "Whole package survives\n",
    );
    fs.mkdirSync(oldRoot, { recursive: true });
    const source = path.join(oldRoot, name);
    fs.symlinkSync(
      path.join(
        runtime.profile,
        "data/skills",
        `${name}--${skill.id.slice(0, 8)}`,
        "repo",
      ),
      source,
      "dir",
    );
    const statePath = path.join(oldRoot, PLATFORM_ACTIVATION_STATE_FILE);
    const state = fs.existsSync(statePath)
      ? JSON.parse(fs.readFileSync(statePath, "utf8"))
      : {};
    state[name] = { skillId: skill.id, skillName: name };
    fs.writeFileSync(statePath, JSON.stringify(state));
    return { skill, source, target: path.join(newRoot, name) };
  }

  it("upgrades a broken old link, exposes the whole package, reopens, and permits uninstall", async () => {
    const { skill, source, target } = await oldInstallation();
    const inventory = fileInventory(skill.local_repo_path!);
    expect(fs.existsSync(source)).toBe(false);
    expect(await skillApi.getMdInstallStatusDetails(skill.id)).toMatchObject({
      antigravity: { installed: false },
    });
    upgradeSkillPlatformDataOnStartup(getDatabase());
    expect(fs.lstatSync(target).isSymbolicLink()).toBe(true);
    expect(fileInventory(target)).toEqual(inventory);
    expect(() => fs.lstatSync(source)).toThrow();
    expect(await skillApi.getMdInstallStatusDetails(skill.id)).toMatchObject({
      antigravity: { installed: true, mode: "symlink" },
    });
    await runtime.reopen();
    useDefaultPath();
    expect(
      getDatabase()
        .prepare("SELECT 1 FROM schema_migrations WHERE name = ?")
        .get("antigravity-skill-links-v1"),
    ).toBeDefined();
    expect(upgradeSkillPlatformDataOnStartup(getDatabase())).toBe(0);
    expect(fileInventory(target)).toEqual(inventory);
    await skillApi.uninstallMd(skill.id, "antigravity");
    expect(fs.existsSync(target)).toBe(false);
    expect(upgradeSkillPlatformDataOnStartup(getDatabase())).toBe(0);
    expect(fileInventory(skill.local_repo_path!)).toEqual(inventory);
  });

  it("preserves source and conflicting target then completes after the conflict is removed", async () => {
    const { source, target } = await oldInstallation();
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, "SKILL.md"), "User owned");
    const original = fs.readlinkSync(source);
    expect(() => upgradeSkillPlatformDataOnStartup(getDatabase())).toThrow(
      /conflict/i,
    );
    expect(fs.readlinkSync(source)).toBe(original);
    expect(fs.readFileSync(path.join(target, "SKILL.md"), "utf8")).toBe(
      "User owned",
    );
    fs.rmSync(target, { recursive: true });
    expect(upgradeSkillPlatformDataOnStartup(getDatabase())).toBe(1);
  });

  it.each(["links-published", "ownership-published", "sources-retired"])(
    "resumes after interruption at %s",
    async (failurePhase) => {
      const { source, target } = await oldInstallation();
      expect(() =>
        upgradeSkillPlatformDataOnStartup(getDatabase(), (phase) => {
          if (phase === failurePhase) throw new Error("Injected interruption");
        }),
      ).toThrow(/Injected interruption/);
      expect(
        fs.lstatSync(source, { throwIfNoEntry: false })?.isSymbolicLink() ??
          false,
      ).toBe(failurePhase !== "sources-retired");
      expect(fs.lstatSync(target).isSymbolicLink()).toBe(true);
      await runtime.reopen();
      useDefaultPath();
      // A published link from an interrupted run is accepted only with its recovery receipt.
      expect(upgradeSkillPlatformDataOnStartup(getDatabase())).toBe(1);
      expect(fs.readFileSync(path.join(target, "docs/guide.txt"), "utf8")).toBe(
        "Whole package survives\n",
      );
    },
  );

  it("preserves custom paths and unmanaged entries", async () => {
    const { source } = await oldInstallation();
    getDatabase()
      .prepare("UPDATE settings SET value = ? WHERE key = ?")
      .run(
        JSON.stringify({
          antigravity: { rootPath: runtime.platformRoot("antigravity") },
        }),
        "builtinAgentOverrides",
      );
    invalidateCustomPathsCache();
    expect(upgradeSkillPlatformDataOnStartup(getDatabase())).toBe(0);
    expect(fs.lstatSync(source).isSymbolicLink()).toBe(true);
    useDefaultPath();
    const unrelated = path.join(oldRoot, "external");
    fs.symlinkSync(
      path.join(runtime.root, "external-missing"),
      unrelated,
      "dir",
    );
    expect(upgradeSkillPlatformDataOnStartup(getDatabase())).toBe(1);
    expect(fs.lstatSync(unrelated).isSymbolicLink()).toBe(true);
  });

  it("rejects traversal activation data without touching files outside the old root", async () => {
    await oldInstallation();
    fs.writeFileSync(
      path.join(oldRoot, PLATFORM_ACTIVATION_STATE_FILE),
      JSON.stringify({
        "../escape": { skillId: "id", skillName: "../escape" },
      }),
    );
    expect(() => upgradeSkillPlatformDataOnStartup(getDatabase())).toThrow(
      /name|path/i,
    );
    expect(fs.existsSync(newRoot)).toBe(false);
  });

  it("accepts an existing symlink for the configured skills root", async () => {
    const { target } = await oldInstallation();
    const actual = path.join(runtime.root, "shared-skills");
    fs.mkdirSync(actual);
    fs.mkdirSync(path.dirname(newRoot), { recursive: true });
    fs.symlinkSync(actual, newRoot, "dir");
    expect(upgradeSkillPlatformDataOnStartup(getDatabase())).toBe(1);
    expect(fs.readFileSync(path.join(target, "docs/guide.txt"), "utf8")).toBe(
      "Whole package survives\n",
    );
  });
});
