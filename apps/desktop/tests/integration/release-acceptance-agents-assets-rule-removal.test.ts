import {
  createSkillTestRuntime,
  fileInventory,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { RuleFileDescriptor } from "@prompthub/shared/types";
import { getDatabase, RuleDB } from "../../src/main/database";
import { getRulesDir } from "../../src/main/runtime-paths";
import { registerRulesIPC } from "../../src/main/ipc/rules.ipc";
import { rulesApi } from "../../src/preload/api/rules";

let runtime: SkillTestRuntime;
beforeEach(async () => {
  runtime = await createSkillTestRuntime();
  registerRulesIPC();
});
afterEach(() => {
  vi.restoreAllMocks();
  runtime?.dispose();
});
async function reopen(): Promise<void> {
  await runtime.reopen();
  registerRulesIPC();
}
async function project(
  id: string,
  kind: "workspace" | "cursor" = "workspace",
): Promise<RuleFileDescriptor> {
  const rootPath = path.join(runtime.root, id);
  fs.mkdirSync(rootPath);
  const descriptor = await rulesApi.addProject({
    id,
    name: "Same Display Name",
    rootPath,
    kind,
  });
  await rulesApi.save(descriptor.id, "# Keep external content\n");
  return descriptor;
}

it("rejects reusing a project ID for another target without overwriting the existing rule", async () => {
  const descriptor = await project("stable-id");
  const before = fileInventory(getRulesDir());
  const anotherRoot = path.join(runtime.root, "another-target");
  fs.mkdirSync(anotherRoot);
  await expect(
    rulesApi.addProject({
      id: "stable-id",
      name: "Other name",
      rootPath: anotherRoot,
    }),
  ).rejects.toThrow("Rule project id already exists");
  expect(fileInventory(getRulesDir())).toEqual(before);
  expect(fs.existsSync(path.join(anotherRoot, "AGENTS.md"))).toBe(false);
  await reopen();
  expect((await rulesApi.read(descriptor.id)).content).toBe(
    "# Keep external content\n",
  );
});
function copyBinding(
  descriptor: RuleFileDescriptor,
  directory: string,
  overrides: Record<string, unknown> = {},
): string {
  assert(descriptor.managedPath);
  const destination = path.join(getRulesDir(), "projects", directory);
  fs.mkdirSync(destination);
  const meta: Record<string, unknown> = JSON.parse(
    fs.readFileSync(
      path.join(path.dirname(descriptor.managedPath), "_rule.json"),
      "utf8",
    ),
  );
  fs.copyFileSync(
    descriptor.managedPath,
    path.join(destination, descriptor.name),
  );
  fs.writeFileSync(
    path.join(destination, "_rule.json"),
    JSON.stringify({
      ...meta,
      managedPath: path.join(destination, descriptor.name),
      ...overrides,
    }),
  );
  return destination;
}

it("removes every verified legacy binding by ID while retaining other projects and external files", async () => {
  const first = await project("remove-me");
  const other = await project("remove-me-other");
  const legacy = copyBinding(first, "same-display-name__remove-me");
  const unrelated = copyBinding(other, "remove-me__similar-name");
  const unrelatedBefore = fileInventory(unrelated);
  const unbound = path.join(getRulesDir(), "projects", "remove-me-unbound");
  fs.mkdirSync(unbound);
  fs.writeFileSync(path.join(unbound, "keep.txt"), "Unregistered content");
  await reopen();
  await rulesApi.removeProject("remove-me");
  expect(fs.existsSync(legacy)).toBe(false);
  expect(fs.readFileSync(path.join(unbound, "keep.txt"), "utf8")).toBe(
    "Unregistered content",
  );
  expect(fileInventory(unrelated)).toEqual(unrelatedBefore);
  expect(fs.readFileSync(first.path, "utf8")).toBe("# Keep external content\n");
  await reopen();
  expect((await rulesApi.list()).some((rule) => rule.id === first.id)).toBe(
    false,
  );
  expect((await rulesApi.read(other.id)).content).toBe(
    "# Keep external content\n",
  );
  expect(new RuleDB(getDatabase()).getVersions(first.id)).toEqual([]);
  await rulesApi.removeProject("remove-me");
  expect(fileInventory(unrelated)).toEqual(unrelatedBefore);
});

it("uses the same ID-derived managed path across create, reopen and Cursor removal", async () => {
  const descriptor = await project("cursor-project", "cursor");
  const expectedPath = path.join(
    getRulesDir(),
    "projects",
    "cursor-project",
    "prompthub.mdc",
  );
  expect(descriptor.managedPath).toBe(expectedPath);
  await reopen();
  expect((await rulesApi.read(descriptor.id)).managedPath).toBe(expectedPath);
  await rulesApi.removeProject("cursor-project");
  await reopen();
  expect(
    (await rulesApi.list()).some((rule) => rule.id === descriptor.id),
  ).toBe(false);
  expect(fs.readFileSync(descriptor.path, "utf8")).toBe(
    "# Keep external content\n",
  );
});

it("validates all same-ID bindings before deleting any managed or external content", async () => {
  const descriptor = await project("tampered");
  assert(descriptor.managedPath);
  const unsafe = copyBinding(descriptor, "zzz-tampered__tampered", {
    managedPath: descriptor.path,
  });
  const before = fileInventory(getRulesDir());
  await expect(rulesApi.removeProject("tampered")).rejects.toThrow(
    "Unsafe managed rule path",
  );
  expect(fileInventory(getRulesDir())).toEqual(before);
  expect(fs.existsSync(unsafe)).toBe(true);
  expect(new RuleDB(getDatabase()).getById(descriptor.id)).not.toBeNull();
  expect(fs.readFileSync(descriptor.path, "utf8")).toBe(
    "# Keep external content\n",
  );
});

it("rolls back a partial deletion publication and permits an explicit retry", async () => {
  const descriptor = await project("delete-failure");
  const legacy = copyBinding(descriptor, "zzz-legacy__delete-failure");
  const originalRename = fs.renameSync.bind(fs);
  const fault = vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
    if (String(from) === legacy)
      throw new Error("Injected Rule deletion failure");
    originalRename(from, to);
  });
  await expect(rulesApi.removeProject("delete-failure")).rejects.toThrow(
    "Injected Rule deletion failure",
  );
  fault.mockRestore();
  await reopen();
  expect((await rulesApi.read(descriptor.id)).content).toBe(
    "# Keep external content\n",
  );
  expect(fs.existsSync(legacy)).toBe(true);
  expect(fs.readFileSync(descriptor.path, "utf8")).toBe(
    "# Keep external content\n",
  );
  await rulesApi.removeProject("delete-failure");
  await reopen();
  expect(
    (await rulesApi.list()).some((rule) => rule.id === descriptor.id),
  ).toBe(false);
});

it("cleans a failed project import at its actual managed path without modifying the external file", async () => {
  const rootPath = path.join(runtime.root, "import-project");
  fs.mkdirSync(rootPath);
  const targetPath = path.join(rootPath, "AGENTS.md");
  fs.writeFileSync(targetPath, "# External before import\n");
  const originalWrite = fsp.writeFile.bind(fsp);
  const fault = vi
    .spyOn(fsp, "writeFile")
    .mockImplementation(async (file, data, options) => {
      if (data === "# Imported body\n")
        throw new Error("Injected imported body failure");
      return originalWrite(file, data, options);
    });
  await expect(
    rulesApi.importRecords([
      {
        id: "project:failed-import",
        platformId: "workspace",
        platformName: "Imported Name",
        platformIcon: "FolderRoot",
        platformDescription: "Fixture",
        name: "AGENTS.md",
        description: "Fixture",
        path: targetPath,
        targetPath,
        projectRootPath: rootPath,
        content: "# Imported body\n",
        versions: [],
      },
    ]),
  ).rejects.toThrow("Injected imported body failure");
  fault.mockRestore();
  expect(
    fs.existsSync(path.join(getRulesDir(), "projects", "failed-import")),
  ).toBe(false);
  expect(
    fs.existsSync(
      path.join(getRulesDir(), "projects", "imported-name__failed-import"),
    ),
  ).toBe(false);
  expect(fs.readFileSync(targetPath, "utf8")).toBe(
    "# External before import\n",
  );
  await reopen();
  expect(
    (await rulesApi.list()).some((rule) => rule.id === "project:failed-import"),
  ).toBe(false);
});

it("cleans only missing selected projects and persists a deleted history version", async () => {
  const missing = await project("missing-project");
  const present = await project("present-project");
  await rulesApi.save(present.id, "# Later version\n");
  const before = await rulesApi.read(present.id);
  const earlier = before.versions.find(
    (version) => version.content === "# Keep external content\n",
  );
  assert(earlier);
  await rulesApi.deleteVersion(present.id, earlier.id);
  fs.rmSync(missing.path);
  expect(
    await rulesApi.removeMissingProjects([
      missing.id,
      missing.id,
      present.id,
      "project:../unsafe",
    ]),
  ).toEqual({
    removed: [missing.id],
    skipped: [present.id, "project:../unsafe"],
    failed: [],
  });
  await reopen();
  const after = await rulesApi.read(present.id);
  expect(after.content).toBe("# Later version\n");
  expect(after.versions.some((version) => version.id === earlier.id)).toBe(
    false,
  );
  expect((await rulesApi.list()).some((rule) => rule.id === missing.id)).toBe(
    false,
  );
  expect(fs.readFileSync(present.path, "utf8")).toBe("# Later version\n");
});
