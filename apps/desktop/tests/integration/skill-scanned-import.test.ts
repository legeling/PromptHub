/** @vitest-environment jsdom */
import fs from "node:fs";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import {
  createSkillTestRuntime,
  fileInventory,
  skillApi,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import type { ScannedSkill } from "@prompthub/shared/types";
import { CanonicalSkillDB } from "@prompthub/core";

vi.mock("../../src/renderer/services/webdav-save-sync", () => ({
  scheduleAllSaveSync: vi.fn(),
}));
// Browser cache is unrelated to the real package persistence exercised here.
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
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: cache,
});
const { useSkillStore } = await import("../../src/renderer/stores/skill.store");
let runtime: SkillTestRuntime | undefined;
afterEach(() => {
  runtime?.dispose();
  vi.restoreAllMocks();
  runtime = undefined;
  useSkillStore.setState({ skills: [] });
});

function writeSource(directory: string, name: string): ScannedSkill {
  fs.mkdirSync(path.join(directory, "docs/nested"), { recursive: true });
  const content = `---\nname: ${name}\ndescription: Scanned package\nversion: 1.0.0\ntags: [source-tag]\n---\n# Scanned\n`;
  fs.writeFileSync(path.join(directory, "SKILL.md"), content);
  fs.writeFileSync(
    path.join(directory, "docs/nested/note.txt"),
    "Nested bytes\n",
  );
  fs.writeFileSync(
    path.join(directory, "asset.bin"),
    Buffer.from([0, 255, 128, 3]),
  );
  return {
    name,
    description: "Scanned package",
    author: "Fixture",
    instructions: content,
    tags: ["source-tag"],
    localPath: directory,
    filePath: path.join(directory, "SKILL.md"),
    platforms: ["codex"],
  };
}

it.each(["copy", "symlink"] as const)(
  "imports a complete scanned %s package, retains ownership after reopen, and deletes only owned files",
  async (mode) => {
    runtime = await createSkillTestRuntime();
    Object.defineProperty(window, "api", {
      configurable: true,
      value: { skill: skillApi },
    });
    const scanned = writeSource(runtime.source, "scanned-writer");
    const original = fileInventory(runtime.source);
    const result = await useSkillStore
      .getState()
      .importScannedSkills([scanned], { [runtime.source]: ["user-tag"] }, mode);
    expect(result.failed).toEqual([]);
    expect(result.importedCount).toBe(1);
    const skill = result.importedSkills[0];
    expect(skill).toMatchObject({
      source_url: runtime.source,
      tags: ["user-tag"],
      original_tags: ["source-tag"],
      source_binding_state: "bound",
      is_builtin: false,
    });
    expect(fileInventory(skill.local_repo_path)).toEqual(original);
    expect(skill.local_repo_path === runtime.source).toBe(mode === "symlink");
    await runtime.reopen();
    const reopened = await skillApi.get(skill.id);
    expect(reopened?.local_repo_path).toBe(skill.local_repo_path);
    expect(fileInventory(reopened?.local_repo_path)).toEqual(original);
    await skillApi.writeLocalFile(
      skill.id,
      "docs/nested/note.txt",
      "Edited package\n",
    );
    expect(
      fs.readFileSync(
        path.join(skill.local_repo_path!, "docs/nested/note.txt"),
        "utf8",
      ),
    ).toBe("Edited package\n");
    expect(
      fs.readFileSync(
        path.join(runtime.source, "docs/nested/note.txt"),
        "utf8",
      ),
    ).toBe(mode === "symlink" ? "Edited package\n" : "Nested bytes\n");
    const edited = await skillApi.update(skill.id, {
      description: "Edited metadata",
    });
    expect(edited.local_repo_path).toBe(skill.local_repo_path);
    expect(
      fs.readFileSync(path.join(edited.local_repo_path, "SKILL.md"), "utf8"),
    ).toContain("description: Edited metadata");
    if (mode === "symlink")
      expect(
        fs.readFileSync(path.join(runtime.source, "SKILL.md"), "utf8"),
      ).toContain("description: Edited metadata");
    await runtime.reopen();
    expect((await skillApi.get(skill.id)).local_repo_path).toBe(
      skill.local_repo_path,
    );
    expect(await skillApi.delete(skill.id)).toBe(true);
    expect(fs.existsSync(path.join(runtime.source, "SKILL.md"))).toBe(true);
    await runtime.reopen();
    expect(await skillApi.getAll()).toEqual([]);
  },
);

it("rejects a source whose entrypoint disappeared and leaves existing packages intact", async () => {
  runtime = await createSkillTestRuntime();
  Object.defineProperty(window, "api", {
    configurable: true,
    value: { skill: skillApi },
  });
  const scanned = writeSource(runtime.source, "missing-source");
  fs.unlinkSync(scanned.filePath);
  const before = fileInventory(runtime.source);
  const result = await useSkillStore
    .getState()
    .importScannedSkills([scanned], {}, "copy");
  expect(result.importedCount).toBe(0);
  expect(result.failed).toHaveLength(1);
  expect(await skillApi.getAll()).toEqual([]);
  expect(fileInventory(runtime.source)).toEqual(before);
  await runtime.reopen();
  expect(await skillApi.getAll()).toEqual([]);
});

it("restores a linked entrypoint if metadata finalization fails, then permits retry", async () => {
  runtime = await createSkillTestRuntime();
  Object.defineProperty(window, "api", {
    configurable: true,
    value: { skill: skillApi },
  });
  const scanned = writeSource(runtime.source, "linked-rollback");
  const result = await useSkillStore
    .getState()
    .importScannedSkills([scanned], {}, "symlink");
  expect(result.importedCount).toBe(1);
  const skill = result.importedSkills[0];
  const before = fileInventory(runtime.source);
  const finalize = vi
    .spyOn(CanonicalSkillDB.prototype, "finalizePackageUpdate")
    .mockImplementationOnce(() => {
      throw new Error("Injected finalization failure");
    });
  await expect(
    skillApi.update(skill.id, { description: "Rejected change" }),
  ).rejects.toThrow("Injected finalization failure");
  expect(fileInventory(runtime.source)).toEqual(before);
  expect(await skillApi.get(skill.id)).toMatchObject({
    description: "Scanned package",
    local_repo_path: runtime.source,
  });
  finalize.mockRestore();
  await runtime.reopen();
  expect(fileInventory(runtime.source)).toEqual(before);
  const edited = await skillApi.update(skill.id, {
    description: "Retried change",
  });
  expect(edited.local_repo_path).toBe(runtime.source);
  expect(
    fs.readFileSync(path.join(runtime.source, "SKILL.md"), "utf8"),
  ).toContain("description: Retried change");
});
