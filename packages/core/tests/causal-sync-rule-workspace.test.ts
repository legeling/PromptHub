import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { DatabaseAdapter, SCHEMA } from "@prompthub/db";
import {
  RuleStorageDB,
  getRuleManagedPath,
  type RuleStorageGraph,
} from "../src/rule-storage";
import { RuleCausalSyncWorkspace } from "../src/causal-sync/rule-workspace";
import { publishSqliteEntries } from "../src/sqlite-entry-publication";
import { hashContent } from "../src/rules-workspace-support";
import { syncPayload } from "../src/causal-sync/payload";

const devices: ReturnType<typeof device>[] = [];
function device() {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "ph-sync-rules-")),
  );
  const database = new DatabaseAdapter(path.join(root, "db.sqlite"));
  database.exec(SCHEMA);
  const context = {
    rootPath: root,
    rulesRoot: path.join(root, "data", "rule-files"),
    ownerUserId: "",
  };
  return {
    root,
    database,
    context,
    rules: new RuleStorageDB(database, context),
    workspace: new RuleCausalSyncWorkspace(database, context),
  };
}
function createDevice() {
  const result = device();
  devices.push(result);
  return result;
}
afterEach(() => {
  for (const d of devices.splice(0)) {
    d.database.close();
    fs.rmSync(d.root, { recursive: true, force: true });
  }
});

function graph(d: ReturnType<typeof device>): RuleStorageGraph {
  const at = "2026-10-15T00:00:00.000Z",
    content = "中文 rule";
  const rule: RuleStorageGraph["rule"] = {
    id: "project:shared",
    scope: "project",
    platformId: "workspace",
    platformName: "Shared",
    platformIcon: "Folder",
    platformDescription: "Project",
    canonicalFileName: "AGENTS.md",
    description: "sync",
    managedPath: "",
    targetPath: path.join(d.root, "external", "AGENTS.md"),
    projectRootPath: path.join(d.root, "external"),
    syncStatus: "synced",
    currentVersion: 1,
    contentHash: hashContent(content),
    createdAt: at,
    updatedAt: at,
  };
  rule.managedPath = getRuleManagedPath(rule, d.context.rulesRoot);
  return {
    rule,
    content,
    versions: [{ id: "version", savedAt: at, source: "create", content }],
  };
}
function apply(
  d: ReturnType<typeof device>,
  resources: ReturnType<RuleCausalSyncWorkspace["capture"]>,
) {
  const plan = d.workspace.prepareApplication(resources);
  publishSqliteEntries(d.database, {
    rootPath: d.root,
    operationKey: "test-sync-rules",
    entries: plan.entries,
    commit: plan.apply,
  });
}

it("synchronizes Rule metadata, current files and complete history without deploying external files", () => {
  const a = createDevice(),
    b = createDevice();
  a.rules.publishGraphs([graph(a)]);
  const resources = a.workspace.capture();
  expect(resources[0].text).not.toContain(a.root);
  apply(b, resources);
  expect(b.workspace.capture()).toEqual(resources);
  const restored = b.rules.getById("project:shared")!;
  expect(restored.targetPath).toBe("");
  expect(b.rules.readContent(restored)).toBe("中文 rule");
  const reopened = new DatabaseAdapter(path.join(b.root, "db.sqlite"));
  try {
    expect(new RuleCausalSyncWorkspace(reopened, b.context).capture()).toEqual(
      resources,
    );
  } finally {
    reopened.close();
  }
  apply(b, []);
  expect(b.rules.getAll()).toEqual([]);
  expect(fs.existsSync(restored.managedPath)).toBe(false);
});

it("preserves the destination's deployment binding and rejects invalid content hashes before application", () => {
  const a = createDevice(),
    b = createDevice();
  a.rules.publishGraphs([graph(a)]);
  b.rules.publishGraphs([graph(b)]);
  const original = b.rules.getById("project:shared")!;
  const value = JSON.parse(a.workspace.capture()[0].text);
  value.rule.description = "remote description";
  apply(b, [syncPayload("rule", value.rule.id, value)]);
  expect(b.rules.getById(original.id)?.targetPath).toBe(original.targetPath);
  value.content = "tampered";
  expect(() =>
    b.workspace.prepareApplication([syncPayload("rule", value.rule.id, value)]),
  ).toThrow(/hash/i);
  expect(b.rules.readContent(b.rules.getById(original.id)!)).toBe("中文 rule");
});
