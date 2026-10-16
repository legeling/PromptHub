import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  closeDatabase,
  getDatabase,
  initDatabase,
  RuleDB,
} from "../src/database";
import { createRulesWorkspaceService } from "../src/rules-workspace";
import {
  configureRuntimePaths,
  getRulesDir,
  resetRuntimePaths,
} from "../src/runtime-paths";

let root: string;
function service() {
  return createRulesWorkspaceService({
    getRulesDir,
    createRuleDb: () => new RuleDB(getDatabase()),
    getPlatformRootDir: (platform) => path.join(root, "targets", platform.id),
    getPlatformGlobalRulePath: (platform) =>
      path.join(root, "targets", platform.id, "AGENTS.md"),
  });
}
function reopen() {
  closeDatabase();
  initDatabase();
  return service();
}
function ownedFiles(directory: string): Record<string, string> {
  if (!fs.existsSync(directory)) return {};
  const result: Record<string, string> = {};
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      for (const [relative, bytes] of Object.entries(ownedFiles(file)))
        result[path.join(entry.name, relative)] = bytes;
    } else result[entry.name] = fs.readFileSync(file).toString("hex");
  }
  return result;
}
async function createProject(id: string, content: string) {
  const workspace = service();
  await workspace.createProjectRule({
    id,
    name: id,
    rootPath: path.join(root, "targets", id),
  });
  return workspace.saveRuleContent(`project:${id}`, content);
}
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-rule-sqlite-"));
  configureRuntimePaths({ userDataPath: root });
  initDatabase();
});
afterEach(() => {
  closeDatabase();
  resetRuntimePaths();
  fs.rmSync(root, { recursive: true, force: true });
});

it("creates, edits and reopens Rule metadata in SQLite with one current body and file history", async () => {
  await createProject("first", "first body");
  const saved = await service().saveRuleContent("project:first", "second body");
  expect(saved.versions.map((version) => version.content)).toEqual([
    "second body",
    "first body",
  ]);
  expect(getRulesDir()).toBe(path.join(root, "data", "rule-files"));
  expect(
    Object.keys(ownedFiles(getRulesDir())).some((name) =>
      name.endsWith(".json"),
    ),
  ).toBe(false);
  expect(fs.existsSync(path.join(root, "data", "rules"))).toBe(false);
  getDatabase().run(
    "UPDATE rules SET description = ? WHERE id = ?",
    "SQL-owned annotation",
    "project:first",
  );
  const reopened = reopen();
  expect(await reopened.readRuleContent("project:first")).toMatchObject({
    description: "SQL-owned annotation",
    content: "second body",
    versions: saved.versions,
  });
  expect(
    (await reopened.listRuleDescriptors()).find(
      (rule) => rule.id === "project:first",
    )?.description,
  ).toBe("SQL-owned annotation");
  await reopened.deleteRuleVersion("project:first", saved.versions[1].id);
  expect((await reopen().readRuleContent("project:first")).versions).toEqual([
    saved.versions[0],
  ]);
  await service().removeProjectRule("first");
  expect(new RuleDB(getDatabase()).getVersions("project:first")).toEqual([]);
  expect(
    (await reopen().listRuleDescriptors()).some(
      (rule) => rule.id === "project:first",
    ),
  ).toBe(false);
  expect(
    fs.readFileSync(path.join(root, "targets", "first", "AGENTS.md"), "utf8"),
  ).toBe("second body");
});

it("preserves all local files, history and the external target when the SQL save fails", async () => {
  const first = await createProject("save-failure", "before");
  const before = ownedFiles(getRulesDir());
  getDatabase().exec(
    "CREATE TRIGGER reject_rule_update BEFORE UPDATE ON rules WHEN NEW.content_hash != OLD.content_hash BEGIN SELECT RAISE(ABORT, 'injected Rule SQL failure'); END",
  );
  await expect(
    service().saveRuleContent("project:save-failure", "after"),
  ).rejects.toThrow("injected Rule SQL failure");
  expect(ownedFiles(getRulesDir())).toEqual(before);
  expect(fs.readFileSync(first.targetPath!, "utf8")).toBe("before");
  getDatabase().exec("DROP TRIGGER reject_rule_update");
  expect(await reopen().readRuleContent("project:save-failure")).toMatchObject({
    content: "before",
    versions: first.versions,
  });
});

it("does not hide missing history or repopulate a lost managed body from a target", async () => {
  await createProject("missing", "keep history");
  const repository = new RuleDB(getDatabase());
  const record = repository.getById("project:missing")!;
  const versions = repository.getVersions(record.id);
  const history = fs.readFileSync(versions[0].filePath);
  fs.unlinkSync(versions[0].filePath);
  await expect(service().readRuleContent(record.id)).rejects.toThrow();
  expect(repository.getVersions(record.id)).toEqual(versions);
  fs.writeFileSync(versions[0].filePath, history);
  fs.unlinkSync(record.managedPath);
  await expect(service().readRuleContent(record.id)).rejects.toThrow();
  expect(fs.existsSync(record.managedPath)).toBe(false);
  expect(repository.getById(record.id)).toEqual(record);
});

it("rolls back the complete multi-Rule import when a later Rule fails", async () => {
  await createProject("one", "original one");
  await createProject("two", "original two");
  const records = (await service().exportRuleBackupRecords()).filter((record) =>
    record.id.startsWith("project:"),
  );
  const before = ownedFiles(getRulesDir());
  const sqlBefore = new RuleDB(getDatabase()).getAll();
  getDatabase().exec(
    "CREATE TRIGGER reject_second_rule BEFORE UPDATE ON rules WHEN NEW.id = 'project:two' AND NEW.content_hash != OLD.content_hash BEGIN SELECT RAISE(ABORT, 'injected second Rule failure'); END",
  );
  await expect(
    service().importRuleBackupRecords(
      records.map((record) => ({
        ...record,
        content: `imported ${record.id}`,
      })),
    ),
  ).rejects.toThrow("injected second Rule failure");
  expect(ownedFiles(getRulesDir())).toEqual(before);
  expect(new RuleDB(getDatabase()).getAll()).toEqual(sqlBefore);
  getDatabase().exec("DROP TRIGGER reject_second_rule");
  const reopened = reopen();
  expect((await reopened.readRuleContent("project:one")).content).toBe(
    "original one",
  );
  expect((await reopened.readRuleContent("project:two")).content).toBe(
    "original two",
  );
});

it("imports a new project as detached without reading or writing the source device target", async () => {
  const original = await createProject("source", "source body");
  const incoming = (await service().exportRuleBackupRecords()).find(
    (record) => record.id === original.id,
  )!;
  const foreign = path.join(root, "foreign", "AGENTS.md");
  await service().importRuleBackupRecords([
    {
      ...incoming,
      id: "project:imported",
      path: foreign,
      targetPath: foreign,
      projectRootPath: path.dirname(foreign),
      versions: [],
    },
  ]);
  expect(fs.existsSync(path.dirname(foreign))).toBe(false);
  expect(await reopen().readRuleContent("project:imported")).toMatchObject({
    content: "source body",
    targetPath: "",
    projectRootPath: null,
  });
});
