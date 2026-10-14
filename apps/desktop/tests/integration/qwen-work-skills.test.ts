/** @vitest-environment node */
import {
  createSkillTestRuntime,
  fileInventory,
  skillApi,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getDatabase } from "../../src/main/database";
import { invalidateCustomPathsCache } from "../../src/main/services/skill-installer-utils";
import { getSkillScanStatus } from "../../src/renderer/services/skill-scan-status";
import { isManagedRepoPath } from "../../src/main/services/skill-installer-repo";
import { getCanonicalSkillWorkspacesDir } from "@prompthub/core";

vi.mock("../../src/renderer/services/webdav-save-sync", () => ({
  scheduleAllSaveSync: vi.fn(),
}));
// Only the browser cache is replaced; package operations cross the real preload/IPC boundary.
const values = new Map<string, string>();
const cache: Storage = {
  get length() {
    return values.size;
  },
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => {
    values.set(key, value);
  },
  removeItem: (key) => {
    values.delete(key);
  },
  clear: () => values.clear(),
  key: (index) => [...values.keys()][index] ?? null,
};
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: cache,
});
vi.stubGlobal("window", { localStorage: cache });
const { useSkillStore } = await import("../../src/renderer/stores/skill.store");
let runtime: SkillTestRuntime;
let skillsDir: string;

function useNativeRoots(): void {
  getDatabase()
    .prepare("DELETE FROM settings WHERE key = ?")
    .run("builtinAgentOverrides");
  invalidateCustomPathsCache();
}

function writePackage(
  directory: string,
  name: string,
  version = "1.0.0",
): void {
  fs.mkdirSync(path.join(directory, "docs/nested"), { recursive: true });
  fs.writeFileSync(
    path.join(directory, "SKILL.md"),
    `---\nname: ${name}\ndescription: Qwen Work fixture\nversion: ${version}\n---\n# Qwen Work\n`,
  );
  fs.writeFileSync(
    path.join(directory, "docs/nested/note.txt"),
    `Resource ${version}\n`,
  );
  fs.writeFileSync(
    path.join(directory, "asset.bin"),
    Buffer.from([0, 255, 128, 3]),
  );
}

beforeEach(async () => {
  runtime = await createSkillTestRuntime();
  useNativeRoots();
  skillsDir = path.join(runtime.root, "home", ".qwenworkcn", "skills");
  Object.defineProperty(window, "api", {
    configurable: true,
    value: { skill: skillApi },
  });
  useSkillStore.setState({ skills: [] });
});
afterEach(() => {
  runtime?.dispose();
  useSkillStore.setState({ skills: [] });
  values.clear();
  vi.restoreAllMocks();
});

it("does not classify arbitrary cache folders or links escaping the managed workspace as owned", async () => {
  const workspaceRoot = getCanonicalSkillWorkspacesDir();
  const external = path.join(runtime.root, "external");
  fs.mkdirSync(workspaceRoot, { recursive: true });
  fs.mkdirSync(external);
  const escape = path.join(workspaceRoot, "external-link");
  fs.symlinkSync(
    external,
    escape,
    process.platform === "win32" ? "junction" : "dir",
  );
  expect(await isManagedRepoPath(workspaceRoot)).toBe(false);
  expect(await isManagedRepoPath(path.dirname(workspaceRoot))).toBe(false);
  expect(await isManagedRepoPath(escape)).toBe(false);
});

it("scans, imports, updates and redistributes a complete native Qwen Work package across reopen (#224)", async () => {
  const source = path.join(skillsDir, "work-writer");
  writePackage(source, "work-writer");
  const scan = await skillApi.scanPlatformSkills("qwen-work");
  expect(scan.skillsDir).toBe(skillsDir);
  expect(scan.scannedSkills).toHaveLength(1);
  const scanned = scan.scannedSkills[0];
  expect(scanned).toMatchObject({
    name: "work-writer",
    description: "Qwen Work fixture",
    version: "1.0.0",
    installMode: "copy",
  });
  expect(getSkillScanStatus(scanned, []).isExternalInstall).toBe(true);
  const imported = await useSkillStore
    .getState()
    .importScannedSkills([scanned], {}, "copy");
  expect(imported.failed).toEqual([]);
  expect(imported.importedCount).toBe(1);
  const skill = imported.importedSkills[0];
  expect(fileInventory(skill.local_repo_path)).toEqual(fileInventory(source));
  expect(getSkillScanStatus(scanned, [skill])).toMatchObject({
    isInMySkills: true,
    installBadge: "copy",
  });
  expect(
    (await skillApi.readLocalFiles(skill.id)).filter(
      (file) => !file.isDirectory,
    ),
  ).toHaveLength(3);

  writePackage(source, "work-writer", "2.0.0");
  expect(
    await useSkillStore
      .getState()
      .getInstalledSkillSourceUpdateStatus(skill.id),
  ).toMatchObject({ status: "update-available" });
  expect(
    await useSkillStore.getState().updateInstalledSkillFromSource(skill.id),
  ).toMatchObject({ status: "updated" });
  const updated = await skillApi.get(skill.id);
  expect(fileInventory(updated.local_repo_path)).toEqual(fileInventory(source));
  await skillApi.writeLocalFile(
    skill.id,
    "docs/nested/note.txt",
    "Edited in PromptHub\n",
  );
  await skillApi.installMd(skill.id, updated.instructions, "qwen-work");
  expect(
    fs.readFileSync(path.join(source, "docs/nested/note.txt"), "utf8"),
  ).toBe("Edited in PromptHub\n");
  await runtime.reopen();
  useNativeRoots();
  const reopened = await skillApi.get(skill.id);
  const rescanned = await skillApi.scanPlatformSkills("qwen-work");
  expect(fileInventory(reopened.local_repo_path)).toEqual(
    fileInventory(source),
  );
  expect(
    getSkillScanStatus(rescanned.scannedSkills[0], [reopened]),
  ).toMatchObject({ isInMySkills: true, installBadge: "copy" });
  expect(fs.existsSync(path.join(runtime.root, "home", ".qwen"))).toBe(false);
});

it("distinguishes native copies, external Junctions and managed links without deleting their sources (#224)", async () => {
  const external = path.join(runtime.root, "external");
  writePackage(external, "external-writer");
  fs.mkdirSync(skillsDir, { recursive: true });
  const shortcut = path.join(skillsDir, "external-writer");
  fs.symlinkSync(
    external,
    shortcut,
    process.platform === "win32" ? "junction" : "dir",
  );
  const scan = await skillApi.scanPlatformSkills("qwen-work");
  expect(scan.scannedSkills[0]).toMatchObject({
    installMode: "symlink",
    symlinkTargetPath: external,
    isPromptHubManagedLink: false,
  });
  const skill = await skillApi.create({
    name: "managed-writer",
    instructions: "# Managed writer\n",
    protocol_type: "skill",
    is_favorite: false,
  });
  await skillApi.writeLocalFile(
    skill.id,
    "docs/note.txt",
    "Managed resource\n",
  );
  await skillApi.installMdSymlink(skill.id, skill.instructions, "qwen-work");
  const managed = (
    await skillApi.scanPlatformSkills("qwen-work")
  ).scannedSkills.find((entry) => entry.name === skill.name);
  expect(managed).toMatchObject({
    installMode: "symlink",
    isPromptHubManagedLink: true,
  });
  await runtime.reopen();
  useNativeRoots();
  expect(
    (await skillApi.scanPlatformSkills("qwen-work")).scannedSkills,
  ).toHaveLength(2);
  await skillApi.uninstallMd(skill.id, "qwen-work");
  await skillApi.uninstallPlatformSkill("qwen-work", shortcut);
  expect(fs.existsSync(path.join(external, "SKILL.md"))).toBe(true);
  expect(
    fileInventory((await skillApi.get(skill.id)).local_repo_path),
  ).toHaveProperty("docs/note.txt");
  expect(
    (await skillApi.scanPlatformSkills("qwen-work")).scannedSkills,
  ).toEqual([]);
});
