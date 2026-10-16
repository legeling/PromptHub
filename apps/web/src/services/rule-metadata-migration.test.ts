import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  ENV_KEYS,
  originalEnv,
  createTestApp,
  registerUser,
} from "../routes/import-export.test-helpers";
let root: string;
beforeEach(() => {
  vi.resetModules();
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ph-web-rule-upgrade-"));
});
afterEach(async () => {
  (await import("@prompthub/db")).closeDatabase();
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  fs.rmSync(root, { recursive: true, force: true });
});
function seed(owner: string, body: string): string {
  const directory = path.join(
    root,
    "data",
    "rules",
    owner,
    "projects",
    "original__project",
  );
  fs.mkdirSync(directory, { recursive: true });
  const meta = {
    id: "project:project",
    platformId: "workspace",
    platformName: "Original",
    platformIcon: "Folder",
    platformDescription: "Project",
    name: "AGENTS.md",
    description: "Keep annotation",
    path: "/client/AGENTS.md",
    managedPath: path.join(directory, "AGENTS.md"),
    targetPath: "/client/AGENTS.md",
    projectRootPath: "/client",
    syncStatus: "out-of-sync",
  };
  fs.writeFileSync(path.join(directory, "_rule.json"), JSON.stringify(meta));
  fs.writeFileSync(meta.managedPath, body);
  const versions = path.join(
    root,
    "data",
    "rules",
    owner,
    ".versions",
    encodeURIComponent(meta.id),
  );
  fs.mkdirSync(versions, { recursive: true });
  fs.writeFileSync(path.join(versions, "0001.md"), `${body} history`);
  fs.writeFileSync(
    path.join(versions, "index.json"),
    JSON.stringify([
      {
        id: "same-historical-version",
        savedAt: "2025-01-01T00:00:00.000Z",
        source: "create",
        fileName: "0001.md",
      },
    ]),
  );
  return directory;
}
async function historicalSetup() {
  const app = await createTestApp(root);
  const owner = (await registerUser(app, "owner", "fixture-password")).payload
    .data;
  const other = (await registerUser(app, "other", "fixture-password")).payload
    .data;
  const { getServerDatabase } = await import("../database");
  getServerDatabase().run(
    "DELETE FROM schema_migrations WHERE name = ?",
    "web-rule-metadata-v1",
  );
  seed(owner.user.id, "Owner body");
  seed(other.user.id, "Other body");
  return { owner, other, database: getServerDatabase() };
}
async function reopen() {
  (await import("@prompthub/db")).closeDatabase();
  vi.resetModules();
  return createTestApp(root);
}
it("converts both owners with stable same-ID history, exact recovery bytes and repeated-start deletion preservation", async () => {
  const { owner, other } = await historicalSetup();
  const metadata = fs.readFileSync(
    path.join(
      root,
      "data",
      "rules",
      owner.user.id,
      "projects",
      "original__project",
      "_rule.json",
    ),
  );
  await reopen();
  let workspace = await import("./rule-workspace");
  for (const [actor, body] of [
    [owner, "Owner body"],
    [other, "Other body"],
  ] as const) {
    expect(workspace.exportRuleBackupRecords(actor.user.id)).toMatchObject([
      {
        id: "project:project",
        description: "Keep annotation",
        content: body,
        versions: [
          { id: "same-historical-version", content: `${body} history` },
        ],
      },
    ]);
  }
  expect(fs.existsSync(path.join(root, "data", "rules"))).toBe(false);
  const recovery = path.join(root, "recovery", "web-rule-metadata-v1");
  const copies = fs.readdirSync(recovery);
  expect(copies).toHaveLength(1);
  expect(
    fs.readFileSync(
      path.join(
        recovery,
        copies[0],
        owner.user.id,
        "projects",
        "original__project",
        "_rule.json",
      ),
    ),
  ).toEqual(metadata);
  workspace.removeProjectRule(owner.user.id, "project");
  await reopen();
  workspace = await import("./rule-workspace");
  expect(workspace.exportRuleBackupRecords(owner.user.id)).toEqual([]);
  expect(workspace.exportRuleBackupRecords(other.user.id)[0].content).toBe(
    "Other body",
  );
}, 20000);
it("preserves historical sources and rolls back SQL on migration failure before a successful retry", async () => {
  const { owner, database } = await historicalSetup();
  database.exec(
    "CREATE TRIGGER reject_rule_migration BEFORE INSERT ON rules BEGIN SELECT RAISE(ABORT,'injected Web Rule migration failure'); END",
  );
  await expect(reopen()).rejects.toThrow("injected Web Rule migration failure");
  expect(
    fs.readFileSync(
      path.join(
        root,
        "data",
        "rules",
        owner.user.id,
        "projects",
        "original__project",
        "AGENTS.md",
      ),
      "utf8",
    ),
  ).toBe("Owner body");
  const { DatabaseAdapter } = await import("@prompthub/db");
  const probe = new DatabaseAdapter(path.join(root, "data", "prompthub.db"));
  try {
    expect(probe.all("SELECT id FROM rules")).toEqual([]);
    probe.exec("DROP TRIGGER reject_rule_migration");
  } finally {
    probe.close();
  }
  await reopen();
  expect(
    (await import("./rule-workspace")).exportRuleBackupRecords(owner.user.id)[0]
      .content,
  ).toBe("Owner body");
}, 20000);
it("rejects unknown historical owners without creating ownerless records", async () => {
  const { database } = await historicalSetup();
  seed("unknown-user", "Unknown body");
  expect(database.all("SELECT id FROM rules")).toEqual([]);
  await expect(reopen()).rejects.toThrow("unknown Rule owner");
  expect(fs.existsSync(path.join(root, "data", "rules", "unknown-user"))).toBe(
    true,
  );
}, 20000);

it("preserves all historical snapshots beyond the daily edit retention policy", async () => {
  const { owner } = await historicalSetup();
  const directory = path.join(
    root,
    "data",
    "rules",
    owner.user.id,
    ".versions",
    encodeURIComponent("project:project"),
  );
  const historyCount = 25;
  const index = Array.from({ length: historyCount }, (_, position) => ({
    id: `history-${position}`,
    savedAt: new Date(Date.UTC(2025, 0, position + 1)).toISOString(),
    source: "manual-save",
    fileName: `${position}.md`,
  }));
  for (const entry of index)
    fs.writeFileSync(path.join(directory, entry.fileName), entry.id);
  fs.writeFileSync(path.join(directory, "index.json"), JSON.stringify(index));
  await reopen();
  const record = (await import("./rule-workspace")).exportRuleBackupRecords(
    owner.user.id,
  )[0];
  expect(record.content).toBe("Owner body");
  expect(record.versions.map((version) => version.id)).toEqual(
    index.map((entry) => entry.id).reverse(),
  );
}, 20000);

it("rejects conflicting current SQL content without altering either source", async () => {
  const { owner } = await historicalSetup();
  const workspace = await import("./rule-workspace");
  workspace.importRuleBackupRecords(owner.user.id, [
    {
      id: "project:project",
      platformId: "workspace",
      platformName: "Original",
      platformIcon: "Folder",
      platformDescription: "Project",
      name: "AGENTS.md",
      description: "Keep annotation",
      path: "/client/AGENTS.md",
      targetPath: "/client/AGENTS.md",
      projectRootPath: "/client",
      syncStatus: "out-of-sync",
      content: "Current SQL body",
      versions: [],
    },
  ]);
  const current = workspace.exportRuleBackupRecords(owner.user.id)[0];
  await expect(reopen()).rejects.toThrow("conflicts with SQLite");
  expect(fs.readFileSync(current.managedPath!, "utf8")).toBe(
    "Current SQL body",
  );
  expect(
    fs.readFileSync(
      path.join(
        root,
        "data",
        "rules",
        owner.user.id,
        "projects",
        "original__project",
        "AGENTS.md",
      ),
      "utf8",
    ),
  ).toBe("Owner body");
}, 20000);

it("rejects a historical symlink without touching its target", async () => {
  const { owner } = await historicalSetup();
  const protectedFile = path.join(root, "protected.md");
  fs.writeFileSync(protectedFile, "Protected");
  const source = path.join(
    root,
    "data",
    "rules",
    owner.user.id,
    "projects",
    "original__project",
    "AGENTS.md",
  );
  fs.unlinkSync(source);
  fs.symlinkSync(protectedFile, source);
  await expect(reopen()).rejects.toThrow("symbolic link");
  expect(fs.readFileSync(protectedFile, "utf8")).toBe("Protected");
  expect(fs.lstatSync(source).isSymbolicLink()).toBe(true);
}, 20000);
