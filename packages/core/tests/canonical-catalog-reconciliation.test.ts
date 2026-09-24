import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  acquireDatabaseClientLease,
  acquireDatabaseMigrationIntent,
  CURRENT_DATABASE_SCHEMA_VERSION,
  DatabaseAdapter,
  FolderDB,
  PromptDB,
  PromptOutputFormatDB,
  PromptRelationDB,
  SCHEMA,
} from "@prompthub/db";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { reconcileCanonicalStorageCatalog } from "../src/canonical-catalog-reconciliation";
import {
  LOCAL_DATABASE_AUTHORITY_TABLES,
  materializeCanonicalStorageShadow,
  stageCanonicalStorageDatabase,
} from "../src/canonical-storage-shadow";
import { collectPromptCanonicalGraph } from "../src/prompt-canonical-export";
import { readPromptCanonicalGraph } from "../src/prompt-canonical-import";
import { writeCanonicalStorageAuthority } from "../src/canonical-storage-authority";
import {
  configureRuntimePaths,
  resetRuntimePaths,
  writeRuntimeLayoutState,
} from "../src/runtime-paths";
import { closeDatabase, getDatabase, initDatabase } from "../src/database";
import { publishCanonicalEntries } from "../src/canonical-entry-publication";
import { getStorageMaintenanceIntentPath } from "../src/storage-maintenance-intent";
import { runCli } from "../src/cli/run";

let root: string;
let dataPath: string;
let databasePath: string;
let firstId: string;
let originalGraph: ReturnType<typeof collectPromptCanonicalGraph>;
let originalFileGraph: ReturnType<typeof readPromptCanonicalGraph>["snapshot"];
const preservedTables = Object.values(LOCAL_DATABASE_AUTHORITY_TABLES).flat();

function withDatabase<T>(operation: (db: DatabaseAdapter.Database) => T): T {
  const db = new DatabaseAdapter(databasePath);
  try {
    return operation(db);
  } finally {
    db.close();
  }
}

function preservedRows() {
  return withDatabase((db) =>
    Object.fromEntries(
      preservedTables.map((table) => [table, db.all(`SELECT * FROM ${table}`)]),
    ),
  );
}

function seedOperationalState(): void {
  withDatabase((db) =>
    db.exec(`
    INSERT INTO settings VALUES ('theme', 'dark');
    INSERT INTO users VALUES ('user-1', 'fixture-user', 'fixture-hash', 'user', 1, 2);
    INSERT INTO refresh_tokens VALUES ('token-1', 'user-1', 'fixture-hash', 3, 1);
    INSERT INTO user_settings VALUES ('user-1', 'language', 'zh', 2);
    INSERT INTO agent_provider_snapshots
      (id, platform_id, native_digest, redacted_snapshot, operation, result, created_at)
      VALUES ('snapshot-1', 'codex', 'fixture-digest', '{}', 'import', 'verified', 1);
    INSERT INTO agent_session_sources
      (id, platform_id, root_path, adapter_id, adapter_version, created_at, updated_at)
      VALUES ('source-1', 'codex', '/fixture', 'fixture', '1', 1, 2);
    INSERT INTO agent_session_index
      (id, source_id, external_id, title, source_path, source_status, tags_json, note, indexed_at)
      VALUES ('index-1', 'source-1', 'session-1', 'Keep session', '/fixture/session', 'present', '["keep"]', 'Keep annotation', 1);
    INSERT INTO agent_conversation_metadata
      (id, agent_id, session_id, tags_json, note, is_favorite, created_at, updated_at)
      VALUES ('metadata-1', 'codex', 'session-1', '["keep"]', 'Keep note', 1, 1, 2);
    INSERT INTO agent_conversation_handoffs
      (id, source_agent_id, source_session_id, target_agent_id, transport, payload_digest, status, created_at, updated_at)
      VALUES ('handoff-1', 'codex', 'session-1', 'claude', 'launch', 'fixture-digest', 'launched', 1, 2);
  `),
  );
}

function reconcile(options = {}) {
  return reconcileCanonicalStorageCatalog({
    activeRoot: root,
    databasePath,
    ...options,
  });
}

function staleCatalog(): void {
  withDatabase((db) =>
    db.run("UPDATE prompts SET title = 'stale' WHERE id = ?", firstId),
  );
}

function expectNoMaintenanceArtifacts(): void {
  expect(fs.existsSync(getStorageMaintenanceIntentPath(root))).toBe(false);
  expect(fs.existsSync(`${databasePath}.migration-intent.json`)).toBe(false);
  expect(
    fs
      .readdirSync(dataPath)
      .filter(
        (name) =>
          name.startsWith(".catalog-") ||
          name.includes(".stage-") ||
          name.includes(".prior-"),
      ),
  ).toEqual([]);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-catalog-reconcile-"));
  dataPath = path.join(root, "data");
  databasePath = path.join(dataPath, "prompthub.db");
  const source = new DatabaseAdapter(":memory:");
  try {
    source.exec(SCHEMA);
    source.pragma("foreign_keys = ON");
    const folders = new FolderDB(source);
    const prompts = new PromptDB(source);
    const folder = folders.create({ name: "Keep folder" });
    const first = prompts.create({
      title: "Canonical first",
      userPrompt: "Version one",
      folderId: folder.id,
      tags: ["保留", "quote'"],
    });
    firstId = first.id;
    prompts.update(firstId, {
      userPrompt: "Version two",
      notes: "Keep note",
      isFavorite: true,
    });
    const second = prompts.create({
      title: "Canonical second",
      userPrompt: "Second",
      parentId: firstId,
    });
    new PromptRelationDB(source).create({
      sourcePromptId: firstId,
      targetPromptId: second.id,
      kind: "depends_on",
      note: "Keep relation",
    });
    new PromptOutputFormatDB(source).create({
      sourcePromptId: firstId,
      targetPromptId: second.id,
    });
    originalGraph = collectPromptCanonicalGraph(prompts, folders, source);
    materializeCanonicalStorageShadow({
      targetPath: dataPath,
      prompts: originalGraph,
    });
    originalFileGraph = readPromptCanonicalGraph(dataPath).snapshot;
  } finally {
    source.close();
  }
  stageCanonicalStorageDatabase(dataPath, databasePath);
  seedOperationalState();
  configureRuntimePaths({ userDataPath: root });
  writeRuntimeLayoutState(root);
  writeCanonicalStorageAuthority(root, {
    consistencyId: "c".repeat(64),
    operationId: "catalog-test",
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  closeDatabase();
  resetRuntimePaths();
  fs.rmSync(root, { recursive: true, force: true });
});

it("rebuilds a stale graph, preserving histories, relationships and every registered operational table", () => {
  const preserved = preservedRows();
  staleCatalog();
  withDatabase((db) =>
    db.run("DELETE FROM prompt_versions WHERE prompt_id = ?", firstId),
  );
  expect(reconcile()).toEqual({ status: "rebuilt" });
  expect(
    withDatabase((db) =>
      collectPromptCanonicalGraph(new PromptDB(db), new FolderDB(db), db),
    ),
  ).toEqual(originalGraph);
  expect(preservedRows()).toEqual(preserved);
  expect(readPromptCanonicalGraph(dataPath).snapshot).toEqual(
    originalFileGraph,
  );
  expectNoMaintenanceArtifacts();
});

it("does not replace a current database and cleans the unused stage", () => {
  const before = fs.readFileSync(databasePath);
  const inode = fs.statSync(databasePath).ino;
  expect(reconcile()).toEqual({ status: "current" });
  expect(fs.readFileSync(databasePath)).toEqual(before);
  expect(fs.statSync(databasePath).ino).toBe(inode);
  expectNoMaintenanceArtifacts();
});

it("rebuilds when only the resource catalog is stale", () => {
  withDatabase((db) => db.run("DELETE FROM canonical_resources"));
  expect(reconcile()).toEqual({ status: "rebuilt" });
  expect(
    withDatabase((db) => db.all("SELECT resource_id FROM canonical_resources")),
  ).toHaveLength(2);
});

it("rebuilds a missing database without publishing an empty writable graph", () => {
  fs.unlinkSync(databasePath);
  const db = initDatabase();
  expect(new PromptDB(db).getById(firstId)?.title).toBe("Canonical first");
  expect(readPromptCanonicalGraph(dataPath).snapshot).toEqual(
    originalFileGraph,
  );
});

it("Core startup repairs stale state once and reuses its open handle", () => {
  const preserved = preservedRows();
  staleCatalog();
  const db = initDatabase();
  expect(new PromptDB(db).getById(firstId)?.title).toBe("Canonical first");
  const inode = fs.statSync(databasePath).ino;
  expect(initDatabase()).toBe(db);
  expect(fs.statSync(databasePath).ino).toBe(inode);
  closeDatabase();
  expect(preservedRows()).toEqual(preserved);
  expect(initDatabase()).not.toBe(db);
});

it("CLI lists the recovered content and releases its database lease", async () => {
  staleCatalog();
  const output: string[] = [];
  const errors: string[] = [];
  expect(
    await runCli(["--data-dir", root, "prompt", "list"], {
      stdout: (value) => output.push(value),
      stderr: (value) => errors.push(value),
    }),
  ).toBe(0);
  expect(errors).toEqual([]);
  expect(output.join("\n")).toContain("Canonical first");
  expect(output.join("\n")).not.toContain('"title":"stale"');
  expect(() => getDatabase()).toThrow(/not initialized/);
  expectNoMaintenanceArtifacts();
});

it("invalidates and closes an already-open stale handle without overwriting the files", () => {
  const db = initDatabase();
  db.run("UPDATE prompts SET title = 'stale'");
  expect(() => initDatabase()).toThrow(/catalog.*recovery/);
  expect(() => getDatabase()).toThrow(/not initialized/);
  expect(readPromptCanonicalGraph(dataPath).snapshot).toEqual(
    originalFileGraph,
  );
  expect(new PromptDB(initDatabase()).getById(firstId)?.title).toBe(
    "Canonical first",
  );
});

it("keeps legacy database-authority startup behavior", () => {
  const legacyRoot = path.join(root, "legacy");
  resetRuntimePaths();
  configureRuntimePaths({ userDataPath: legacyRoot });
  expect(new PromptDB(initDatabase()).getAll()).toEqual([]);
});

it.each(["missing", "malformed"])(
  "rejects a %s canonical graph before opening or replacing the DB",
  (state) => {
    const manifest = path.join(dataPath, "catalog.json");
    if (state === "missing") fs.unlinkSync(manifest);
    else fs.writeFileSync(manifest, "{broken");
    const before = fs.readFileSync(databasePath);
    expect(() => initDatabase()).toThrow();
    expect(() => getDatabase()).toThrow(/not initialized/);
    expect(fs.readFileSync(databasePath)).toEqual(before);
    expectNoMaintenanceArtifacts();
  },
);

it("does not create a database when both the database and canonical graph are missing", () => {
  fs.unlinkSync(databasePath);
  fs.unlinkSync(path.join(dataPath, "catalog.json"));
  expect(() => initDatabase()).toThrow();
  expect(fs.existsSync(databasePath)).toBe(false);
  expectNoMaintenanceArtifacts();
});

it("preserves an unreadable database in headless mode", () => {
  fs.writeFileSync(databasePath, "unreadable operational records");
  expect(() => initDatabase()).toThrow(/preserv|readable/i);
  expect(fs.readFileSync(databasePath, "utf8")).toBe(
    "unreadable operational records",
  );
  expectNoMaintenanceArtifacts();
});

it("rejects a directory substituted for the database", () => {
  fs.unlinkSync(databasePath);
  fs.mkdirSync(databasePath);
  expect(() => reconcile()).toThrow(/not a regular file/);
  expect(fs.statSync(databasePath).isDirectory()).toBe(true);
  expectNoMaintenanceArtifacts();
});

it.each([
  { rows: [] },
  { rows: [{ quick_check: "corrupt" }] },
  { rows: [undefined] },
])("preserves a database that fails quick_check: %j", ({ rows }) => {
  const before = fs.readFileSync(databasePath);
  const pragma = DatabaseAdapter.prototype.pragma;
  vi.spyOn(DatabaseAdapter.prototype, "pragma").mockImplementation(
    function (query) {
      return query === "quick_check" ? rows : pragma.call(this, query);
    },
  );
  expect(() => reconcile()).toThrow(/not readable/);
  expect(fs.readFileSync(databasePath)).toEqual(before);
  expectNoMaintenanceArtifacts();
});

it("retains the Desktop compatibility policy for unreadable catalogs", () => {
  fs.writeFileSync(databasePath, "corrupt catalog");
  expect(reconcile({ unreadableDatabase: "rebuild" })).toEqual({
    status: "rebuilt",
  });
  expect(withDatabase((db) => new PromptDB(db).getById(firstId)?.title)).toBe(
    "Canonical first",
  );
});

it("rejects future database versions without downgrading them", () => {
  withDatabase((db) =>
    db.pragma(`user_version = ${CURRENT_DATABASE_SCHEMA_VERSION + 1}`),
  );
  const before = fs.readFileSync(databasePath);
  expect(() => reconcile()).toThrow(/newer.*schema/i);
  expect(fs.readFileSync(databasePath)).toEqual(before);
  expectNoMaintenanceArtifacts();
});

it("preserves incompatible operational tables instead of replacing them", () => {
  withDatabase((db) =>
    db.exec("ALTER TABLE settings ADD COLUMN future_field TEXT"),
  );
  staleCatalog();
  const before = fs.readFileSync(databasePath);
  expect(() => reconcile()).toThrow(/preserve incompatible table/);
  expect(fs.readFileSync(databasePath)).toEqual(before);
  expectNoMaintenanceArtifacts();
});

it.each(["-wal", "-journal", "-shm"])(
  "preserves orphan %s recovery material when the primary DB is missing",
  (suffix) => {
    fs.unlinkSync(databasePath);
    fs.writeFileSync(`${databasePath}${suffix}`, "recovery material");
    expect(() => reconcile()).toThrow(/sidecar|recovery material/i);
    expect(fs.existsSync(databasePath)).toBe(false);
    expect(fs.readFileSync(`${databasePath}${suffix}`, "utf8")).toBe(
      "recovery material",
    );
  },
);

it("rejects a live client and releases its own maintenance intent", () => {
  const lease = acquireDatabaseClientLease(databasePath, {
    registerExitHandler: false,
  });
  try {
    expect(() => reconcile()).toThrow(/clients.*closed/);
    expectNoMaintenanceArtifacts();
  } finally {
    lease.release();
  }
});

it("rejects an unknown client entry", () => {
  fs.mkdirSync(path.join(`${databasePath}.clients`, "unknown"), {
    recursive: true,
  });
  expect(() => reconcile()).toThrow(/clients.*closed/);
  expectNoMaintenanceArtifacts();
});

it("does not take over another migration intent", () => {
  const intent = acquireDatabaseMigrationIntent(databasePath);
  try {
    expect(() => reconcile()).toThrow(/migration/i);
    expect(fs.existsSync(intent.intentPath)).toBe(true);
    expect(fs.existsSync(getStorageMaintenanceIntentPath(root))).toBe(false);
  } finally {
    intent.release();
  }
});

it("rejects an out-of-root database path before creating maintenance artifacts", () => {
  expect(() =>
    reconcile({ databasePath: path.join(root, "..", "outside.db") }),
  ).toThrow(/bound|path|root/);
  expectNoMaintenanceArtifacts();
});

it.each(["database", "data-directory"])(
  "rejects a symlinked %s without touching its target",
  (target) => {
    const external = path.join(root, "external");
    const original = target === "database" ? databasePath : dataPath;
    fs.renameSync(original, external);
    fs.symlinkSync(external, original, target === "database" ? "file" : "dir");
    const before = fs.readFileSync(
      target === "database" ? external : path.join(external, "prompthub.db"),
    );
    expect(() => reconcile()).toThrow(/symbolic|regular|unsafe/i);
    expect(
      fs.readFileSync(
        target === "database" ? external : path.join(external, "prompthub.db"),
      ),
    ).toEqual(before);
  },
);

it("rejects malformed non-Prompt bundles before publication", () => {
  fs.mkdirSync(path.join(dataPath, "skills", "invalid"), { recursive: true });
  staleCatalog();
  const before = fs.readFileSync(databasePath);
  expect(() => reconcile()).toThrow();
  expect(fs.readFileSync(databasePath)).toEqual(before);
  expectNoMaintenanceArtifacts();
});

it("rolls back a failed replacement and succeeds on the next startup", () => {
  staleCatalog();
  const before = fs.readFileSync(databasePath);
  const rename = fs.renameSync.bind(fs);
  let failed = false;
  vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
    if (
      !failed &&
      String(from).includes(".stage-") &&
      String(to) === databasePath
    ) {
      failed = true;
      throw new Error("catalog replacement failed");
    }
    return rename(from, to);
  });
  expect(() => reconcile()).toThrow(/catalog replacement failed/);
  expect(failed).toBe(true);
  expect(fs.readFileSync(databasePath)).toEqual(before);
  expectNoMaintenanceArtifacts();
  expect(reconcile()).toEqual({ status: "rebuilt" });
});

it("rolls back if verification finds a mismatched published catalog", () => {
  staleCatalog();
  const before = fs.readFileSync(databasePath);
  const rename = fs.renameSync.bind(fs);
  vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
    const result = rename(from, to);
    if (String(from).includes(".stage-") && String(to) === databasePath) {
      withDatabase((db) => db.run("DELETE FROM canonical_resources"));
    }
    return result;
  });
  expect(() => reconcile()).toThrow(/verification failed/);
  expect(fs.readFileSync(databasePath)).toEqual(before);
  expectNoMaintenanceArtifacts();
});

it("recovers committed publication evidence before validating the next startup", () => {
  const staged = path.join(root, "new-catalog.db");
  fs.copyFileSync(databasePath, staged);
  expect(() =>
    publishCanonicalEntries({
      rootPath: root,
      operationKey: "canonical-catalog",
      entries: [
        {
          targetPath: databasePath,
          prepare(stage) {
            fs.copyFileSync(staged, stage);
          },
        },
      ],
      afterCommit() {
        throw new Error("interrupted after commit");
      },
    }),
  ).toThrow(/committed/i);
  expect(reconcile()).toEqual({ status: "current" });
  expectNoMaintenanceArtifacts();
});
