import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  initDatabase as initializeSql,
  RuleDB as SqlRuleDB,
  closeDatabase,
} from "@prompthub/db";
import { initDatabase, RuleDB } from "../src/database";
import {
  configureRuntimePaths,
  getDatabasePath,
  getRulesDir,
  resetRuntimePaths,
} from "../src/runtime-paths";
import { encodeCanonicalResourceDirectory } from "../src/canonical-resource-path";
import { materializeRuleResourceBundle } from "../src/rule-resource-schema";
import { hashContent } from "../src/rules-workspace-support";
import type { RuleRecord } from "@prompthub/shared/types";

let root: string;
const id = "project:historical";
const savedAt = "2025-01-01T00:00:00.000Z";
const version = {
  id: "original-history",
  savedAt,
  content: "historical body",
  source: "create" as const,
};
function seed(bundleOnly = false): string {
  const bundle = path.join(
    root,
    "data",
    "rules",
    encodeCanonicalResourceDirectory(id),
  );
  materializeRuleResourceBundle({
    bundlePath: bundle,
    rule: {
      id,
      platformId: "workspace",
      platformName: "Historical project",
      platformIcon: "Folder",
      platformDescription: "Project",
      name: "AGENTS.md",
      description: "keep description",
      group: "workspace",
      path: "",
      targetPath: "",
      projectRootPath: null,
      exists: false,
      content: version.content,
      versions: [version],
    },
  });
  if (!bundleOnly) {
    const database = initializeSql(getDatabasePath());
    const managedPath = path.join(
      root,
      "cache",
      "rules-workspace",
      "projects",
      "historical",
      "AGENTS.md",
    );
    fs.mkdirSync(path.dirname(managedPath), { recursive: true });
    fs.writeFileSync(managedPath, version.content);
    const record: RuleRecord = {
      id,
      scope: "project",
      platformId: "workspace",
      platformName: "Historical project",
      platformIcon: "Folder",
      platformDescription: "Project",
      canonicalFileName: "AGENTS.md",
      description: "keep description",
      managedPath,
      targetPath: "",
      projectRootPath: null,
      syncStatus: "target-missing",
      currentVersion: 1,
      contentHash: hashContent(version.content),
      createdAt: savedAt,
      updatedAt: savedAt,
    };
    fs.writeFileSync(
      path.join(path.dirname(managedPath), "_rule.json"),
      JSON.stringify(record),
    );
    const history = path.join(
      root,
      "cache",
      "rules-workspace",
      ".versions",
      encodeURIComponent(id),
    );
    fs.mkdirSync(history, { recursive: true });
    fs.writeFileSync(path.join(history, "0001.md"), version.content);
    fs.writeFileSync(
      path.join(history, "index.json"),
      JSON.stringify([{ ...version, fileName: "0001.md" }]),
    );
    const repository = new SqlRuleDB(database);
    repository.upsert(record);
    repository.replaceVersions(id, [
      {
        id: version.id,
        ruleId: id,
        version: 1,
        filePath: path.join(history, "0001.md"),
        source: version.source,
        createdAt: savedAt,
      },
    ]);
    closeDatabase();
  }
  return bundle;
}
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-rule-metadata-"));
  configureRuntimePaths({ userDataPath: root });
});
afterEach(() => {
  closeDatabase();
  resetRuntimePaths();
  fs.rmSync(root, { recursive: true, force: true });
});

it.each([false, true])(
  "preserves historical Rule identity, detached placement and bodies through two starts (bundle only %s)",
  (bundleOnly) => {
    const bundle = seed(bundleOnly);
    for (let startup = 0; startup < 2; startup += 1) {
      const database = initDatabase();
      const repository = new RuleDB(database);
      const rule = repository.getById(id)!;
      expect(rule).toMatchObject({
        id,
        targetPath: "",
        projectRootPath: null,
        description: "keep description",
      });
      expect(rule.managedPath.startsWith(getRulesDir())).toBe(true);
      expect(repository.readContent(rule)).toBe(version.content);
      expect(repository.readVersions(id)).toEqual([version]);
      expect(fs.existsSync(bundle)).toBe(false);
      expect(fs.existsSync(path.join(root, "cache", "rules-workspace"))).toBe(
        false,
      );
      closeDatabase();
    }
    expect(
      fs.readdirSync(path.join(root, "recovery", "rule-metadata-v1")).length,
    ).toBeGreaterThan(0);
  },
);

it("preserves every source and refuses startup when current bodies disagree", () => {
  const bundle = seed();
  const managed = path.join(
    root,
    "cache",
    "rules-workspace",
    "projects",
    "historical",
    "AGENTS.md",
  );
  fs.writeFileSync(managed, "divergent local body");
  expect(() => initDatabase()).toThrow(/Rule.*conflict/i);
  expect(fs.existsSync(bundle)).toBe(true);
  expect(fs.readFileSync(managed, "utf8")).toBe("divergent local body");
  expect(fs.existsSync(getRulesDir())).toBe(false);
});

it("keeps old data and can retry after a SQL migration failure", () => {
  const bundle = seed();
  const database = initializeSql(getDatabasePath());
  database.exec(
    "CREATE TRIGGER fail_rule_migration BEFORE UPDATE ON rules BEGIN SELECT RAISE(ABORT, 'injected Rule migration failure'); END",
  );
  closeDatabase();
  expect(() => initDatabase()).toThrow("injected Rule migration failure");
  expect(fs.existsSync(bundle)).toBe(true);
  const reopened = initializeSql(getDatabasePath());
  expect(new SqlRuleDB(reopened).getVersions(id)).toHaveLength(1);
  reopened.exec("DROP TRIGGER fail_rule_migration");
  closeDatabase();
  const repository = new RuleDB(initDatabase());
  expect(repository.readContent(repository.getById(id)!)).toBe(version.content);
  expect(repository.readVersions(id)).toEqual([version]);
});

it("adopts a historical workspace project binding lost by the old SQL projection without deploying it", () => {
  seed();
  const metadata = path.join(
    root,
    "cache",
    "rules-workspace",
    "projects",
    "historical",
    "_rule.json",
  );
  const binding = JSON.parse(fs.readFileSync(metadata, "utf8"));
  const targetPath = path.join(root, "old-project", "AGENTS.md");
  fs.writeFileSync(
    metadata,
    JSON.stringify({
      ...binding,
      targetPath,
      projectRootPath: path.dirname(targetPath),
    }),
  );
  const repository = new RuleDB(initDatabase());
  expect(repository.getById(id)).toMatchObject({
    targetPath,
    projectRootPath: path.dirname(targetPath),
  });
  expect(fs.existsSync(path.dirname(targetPath))).toBe(false);
});
