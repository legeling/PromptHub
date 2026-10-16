import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { closeDatabase, getDatabase, initDatabase } from "../src/database";
import { configureRuntimePaths, resetRuntimePaths } from "../src/runtime-paths";
import {
  getRuleManagedPath,
  RuleStorageDB,
  type RuleStorageGraph,
} from "../src/rule-storage";
import { hashContent } from "../src/rules-workspace-support";

let root: string;
function graph(body: string): RuleStorageGraph {
  const id = "project:receipt";
  const savedAt = "2026-01-01T00:00:00.000Z";
  return {
    rule: {
      id,
      scope: "project",
      platformId: "workspace",
      platformName: "Receipt",
      platformIcon: "Folder",
      platformDescription: "Project",
      canonicalFileName: "AGENTS.md",
      description: "Rule storage",
      managedPath: getRuleManagedPath({
        id,
        scope: "project",
        canonicalFileName: "AGENTS.md",
      }),
      targetPath: "",
      projectRootPath: null,
      syncStatus: "target-missing",
      currentVersion: 1,
      contentHash: hashContent(body),
      createdAt: savedAt,
      updatedAt: savedAt,
    },
    content: body,
    versions: [
      { id: "receipt-version", savedAt, source: "create", content: body },
    ],
  };
}
function repository() {
  return new RuleStorageDB(getDatabase());
}
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-rule-storage-"));
  configureRuntimePaths({ userDataPath: root });
  initDatabase();
});
afterEach(() => {
  vi.restoreAllMocks();
  closeDatabase();
  resetRuntimePaths();
  fs.rmSync(root, { recursive: true, force: true });
});

it("preserves long nested Claude scoped identities and history across reopen", () => {
  const current = graph("---\npaths: src/**\n---\nScoped body");
  const fileName = `${"a".repeat(220)}.md`;
  current.rule.id = `custom:claude-rule:${Buffer.from(`nested/${fileName}`).toString("base64url")}`;
  current.rule.scope = "global";
  current.rule.platformId = "claude";
  current.rule.canonicalFileName = fileName;
  current.rule.managedPath = getRuleManagedPath(current.rule);
  repository().publishGraphs([current]);
  closeDatabase();
  initDatabase();
  expect(repository().readContent(repository().getById(current.rule.id)!)).toBe(current.content);
  expect(repository().readVersions(current.rule.id)).toEqual(current.versions);
  repository().delete(current.rule.id);
  expect(fs.existsSync(current.rule.managedPath)).toBe(false);
});

it("reopens committed Rule files and SQL after a failed commit journal marker", () => {
  repository().publishGraphs([graph("before")]);
  const rename = fs.renameSync.bind(fs);
  const fault = vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
    if (
      String(to).endsWith("rule-storage-publication.json") &&
      JSON.parse(fs.readFileSync(from, "utf8")).state === "committed"
    )
      throw new Error("injected Rule commit marker failure");
    return rename(from, to);
  });
  expect(() => repository().publishGraphs([graph("after")])).toThrow(
    /outcome is unknown/,
  );
  fault.mockRestore();
  closeDatabase();
  initDatabase();
  const current = repository().getById("project:receipt")!;
  expect(repository().readContent(current)).toBe("after");
  expect(repository().readVersions(current.id)).toEqual(
    graph("after").versions,
  );
});

it("preserves the entire graph on interrupted file staging and then accepts retry", () => {
  repository().publishGraphs([graph("before")]);
  const write = fs.writeFileSync.bind(fs);
  const fault = vi
    .spyOn(fs, "writeFileSync")
    .mockImplementation((file, data, options) => {
      if (data === "after") {
        write(file, "partial", options);
        throw new Error("injected body staging failure");
      }
      return write(file, data, options);
    });
  expect(() => repository().publishGraphs([graph("after")])).toThrow(
    "injected body staging failure",
  );
  fault.mockRestore();
  closeDatabase();
  initDatabase();
  expect(
    repository().readContent(repository().getById("project:receipt")!),
  ).toBe("before");
  expect(repository().readVersions("project:receipt")).toEqual(
    graph("before").versions,
  );
  repository().publishGraphs([graph("after")]);
  expect(
    repository().readContent(repository().getById("project:receipt")!),
  ).toBe("after");
});

it("rejects a metadata null byte and a path outside the Rule identity without changing files", () => {
  const original = graph("before");
  repository().publishGraphs([original]);
  const invalid = graph("after");
  invalid.rule.description = "invalid\0annotation";
  expect(() => repository().publishGraphs([invalid])).toThrow(/null byte/);
  invalid.rule.description = "valid";
  invalid.rule.managedPath = path.join(root, "protected.md");
  fs.writeFileSync(invalid.rule.managedPath, "protected");
  expect(() => repository().publishGraphs([invalid])).toThrow(/identity/);
  expect(fs.readFileSync(invalid.rule.managedPath, "utf8")).toBe("protected");
  expect(
    repository().readContent(repository().getById(original.rule.id)!),
  ).toBe("before");
  expect(repository().readVersions(original.rule.id)).toEqual(
    original.versions,
  );
  getDatabase().run(
    "UPDATE rules SET managed_path = ? WHERE id = ?",
    invalid.rule.managedPath,
    original.rule.id,
  );
  expect(() =>
    repository().readContent(repository().getById(original.rule.id)!),
  ).toThrow(/identity/);
  getDatabase().run(
    "UPDATE rule_versions SET file_path = ? WHERE rule_id = ?",
    invalid.rule.managedPath,
    original.rule.id,
  );
  expect(() => repository().readVersions(original.rule.id)).toThrow(/identity/);
  expect(fs.readFileSync(invalid.rule.managedPath, "utf8")).toBe("protected");
});
