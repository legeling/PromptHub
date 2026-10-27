import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  initDatabase,
  closeDatabase,
  DatabaseAdapter,
  CURRENT_DATABASE_SCHEMA_VERSION,
} from "@prompthub/db";
import { writeRuntimeLayoutState } from "../src/runtime-storage-context";
import {
  createWorkspaceSnapshot,
  restoreWorkspaceSnapshot,
} from "../src/workspace-snapshot";

const roots: string[] = [];
function fixture(): string {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-full-snapshot-"),
  );
  roots.push(root);
  writeRuntimeLayoutState(root);
  const db = initDatabase(path.join(root, "data/prompthub.db"));
  db.exec(
    "CREATE TABLE extension_records (id TEXT PRIMARY KEY, payload BLOB, extra TEXT); ALTER TABLE prompts ADD COLUMN extension_value TEXT;",
  );
  db.run(
    "INSERT INTO extension_records VALUES (?, ?, ?)",
    "extension",
    Buffer.from([0, 255, 42]),
    "preserved",
  );
  db.run(
    "INSERT INTO settings (key,value) VALUES (?,?)",
    "futureSetting",
    JSON.stringify({ nested: 42 }),
  );
  db.run(
    "INSERT INTO settings (key,value) VALUES (?,?)",
    "webdavPassword",
    JSON.stringify("do-not-export"),
  );
  closeDatabase();
  fs.mkdirSync(path.join(root, "data/future-feature/nested"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(root, "data/future-feature/nested/file.bin"),
    Buffer.from([0, 255, 42]),
  );
  return root;
}
afterEach(() => {
  closeDatabase();
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

it("preserves unknown tables, columns, settings and files across roots and repeated restores", async () => {
  const source = fixture(),
    target = fixture();
  const snapshot = createWorkspaceSnapshot({
    activeRoot: source,
    destinationPath: path.join(source, "snapshot"),
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    await restoreWorkspaceSnapshot({
      snapshotPath: snapshot.path,
      activeRoot: target,
    });
    const db = initDatabase(path.join(target, "data/prompthub.db"));
    expect(db.get("SELECT extra FROM extension_records")).toEqual({
      extra: "preserved",
    });
    expect(db.pragma("table_info(prompts)")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "extension_value" }),
      ]),
    );
    expect(
      db.get("SELECT value FROM settings WHERE key=?", "futureSetting"),
    ).toEqual({ value: '{"nested":42}' });
    db.run("UPDATE extension_records SET extra=?", "editable");
    closeDatabase();
    const reopened = initDatabase(path.join(target, "data/prompthub.db"));
    expect(reopened.get("SELECT extra FROM extension_records")).toEqual({
      extra: "editable",
    });
    closeDatabase();
    expect(
      fs.readFileSync(path.join(target, "data/future-feature/nested/file.bin")),
    ).toEqual(Buffer.from([0, 255, 42]));
  }
  const exported = new DatabaseAdapter(
    path.join(snapshot.path, "data/prompthub.db"),
  );
  try {
    expect(
      exported.get("SELECT value FROM settings WHERE key=?", "webdavPassword"),
    ).toBeNull();
  } finally {
    exported.close();
  }
});

it("rolls back the complete root on publication failure and permits retry", async () => {
  const source = fixture(),
    target = fixture();
  fs.writeFileSync(
    path.join(target, "data/future-feature/nested/file.bin"),
    "original",
  );
  const snapshot = createWorkspaceSnapshot({
    activeRoot: source,
    destinationPath: path.join(source, "snapshot"),
  });
  await expect(
    restoreWorkspaceSnapshot({
      snapshotPath: snapshot.path,
      activeRoot: target,
      injectFailure(stage) {
        if (stage === "entry-swapped:data")
          throw new Error("publication failure");
      },
    }),
  ).rejects.toThrow("publication failure");
  expect(
    fs.readFileSync(
      path.join(target, "data/future-feature/nested/file.bin"),
      "utf8",
    ),
  ).toBe("original");
  await restoreWorkspaceSnapshot({
    snapshotPath: snapshot.path,
    activeRoot: target,
  });
  expect(
    fs.readFileSync(path.join(target, "data/future-feature/nested/file.bin")),
  ).toEqual(Buffer.from([0, 255, 42]));
});

it("rejects newer database versions and corrupt files before replacing local data", async () => {
  const source = fixture(),
    target = fixture();
  const db = new DatabaseAdapter(path.join(source, "data/prompthub.db"));
  db.pragma(`user_version = ${CURRENT_DATABASE_SCHEMA_VERSION + 1}`);
  db.close();
  expect(() =>
    createWorkspaceSnapshot({
      activeRoot: source,
      destinationPath: path.join(source, "future"),
    }),
  ).toThrow(/newer|unsupported/i);
  const current = new DatabaseAdapter(path.join(source, "data/prompthub.db"));
  current.pragma(`user_version = ${CURRENT_DATABASE_SCHEMA_VERSION}`);
  current.close();
  const snapshot = createWorkspaceSnapshot({
    activeRoot: source,
    destinationPath: path.join(source, "snapshot"),
  });
  fs.writeFileSync(
    path.join(snapshot.path, "data/future-feature/nested/file.bin"),
    "corrupt",
  );
  await expect(
    restoreWorkspaceSnapshot({
      snapshotPath: snapshot.path,
      activeRoot: target,
    }),
  ).rejects.toThrow();
  expect(
    fs.readFileSync(path.join(target, "data/future-feature/nested/file.bin")),
  ).toEqual(Buffer.from([0, 255, 42]));
});

it("keeps destination device settings and rejects a failed candidate migration without changing data", async () => {
  const source = fixture(),
    target = fixture();
  const local = new DatabaseAdapter(path.join(target, "data/prompthub.db"));
  local.run(
    "UPDATE settings SET value=? WHERE key=?",
    '"destination-only-secret"',
    "webdavPassword",
  );
  local.close();
  const snapshot = createWorkspaceSnapshot({
    activeRoot: source,
    destinationPath: path.join(source, "snapshot"),
  });
  expect(
    fs
      .readFileSync(path.join(snapshot.path, "data/prompthub.db"))
      .includes(Buffer.from("do-not-export")),
  ).toBe(false);
  await expect(
    restoreWorkspaceSnapshot({
      snapshotPath: snapshot.path,
      activeRoot: target,
      migrateCandidate(_root, db) {
        db.run("DELETE FROM extension_records");
        throw new Error("candidate migration failed");
      },
    }),
  ).rejects.toThrow("candidate migration failed");
  const unchanged = new DatabaseAdapter(path.join(target, "data/prompthub.db"));
  expect(unchanged.get("SELECT extra FROM extension_records")).toEqual({
    extra: "preserved",
  });
  unchanged.close();
  await restoreWorkspaceSnapshot({
    snapshotPath: snapshot.path,
    activeRoot: target,
  });
  const restored = new DatabaseAdapter(path.join(target, "data/prompthub.db"));
  expect(
    restored.get("SELECT value FROM settings WHERE key=?", "webdavPassword"),
  ).toEqual({ value: '"destination-only-secret"' });
  restored.close();
});

it("upgrades a populated pre-Plugin database inside the restore candidate without losing extension data", async () => {
  const source = fixture(),
    target = fixture();
  const old = new DatabaseAdapter(path.join(source, "data/prompthub.db"));
  old.exec(
    "DROP TABLE plugin_versions; DROP TABLE plugins; DELETE FROM database_migration_history WHERE migration_id > 8; PRAGMA user_version = 8;",
  );
  old.close();
  const { createPortableSnapshot } = await import("../src/portable-snapshot");
  const snapshot = createPortableSnapshot({
    sourceRoot: source,
    destinationPath: path.join(source, "prior-snapshot"),
    scopes: [
      {
        id: "workspace",
        sourcePath: path.join(source, "data"),
        archivePath: "data",
      },
    ],
    generatedFiles: [
      {
        archivePath: "workspace-snapshot.json",
        content: Buffer.from(
          JSON.stringify({
            kind: "prompthub-workspace-snapshot",
            version: 1,
            databaseSchemaVersion: 8,
            layoutEpoch: 1,
          }),
        ),
      },
    ],
  });
  await restoreWorkspaceSnapshot({
    snapshotPath: snapshot.path,
    activeRoot: target,
  });
  const db = initDatabase(path.join(target, "data/prompthub.db"));
  expect(db.pragma("user_version")).toEqual([
    { user_version: CURRENT_DATABASE_SCHEMA_VERSION },
  ]);
  expect(db.all("SELECT * FROM plugins")).toEqual([]);
  expect(db.get("SELECT extra FROM extension_records")).toEqual({
    extra: "preserved",
  });
  expect(db.pragma("foreign_key_check")).toEqual([]);
});

it("measures a full snapshot with 32 MiB of managed resources and 10000 extension rows", async () => {
  const source = fixture(),
    target = fixture();
  const db = new DatabaseAdapter(path.join(source, "data/prompthub.db"));
  const rowCount = 10_000,
    fileBytes = 32 * 1024 * 1024,
    bufferBytes = 1024 * 1024;
  db.transaction(() => {
    for (let index = 0; index < rowCount; index++)
      db.run(
        "INSERT INTO extension_records VALUES (?,?,?)",
        `record-${index}`,
        null,
        `value-${index}`,
      );
  })();
  db.close();
  const file = path.join(source, "data/future-feature/large.bin");
  const fd = fs.openSync(file, "w");
  try {
    const buffer = Buffer.alloc(bufferBytes, 42);
    for (let written = 0; written < fileBytes; written += bufferBytes)
      fs.writeSync(fd, buffer);
  } finally {
    fs.closeSync(fd);
  }
  const started = performance.now();
  const snapshot = createWorkspaceSnapshot({
    activeRoot: source,
    destinationPath: path.join(source, "large-snapshot"),
  });
  const captured = performance.now();
  await restoreWorkspaceSnapshot({
    snapshotPath: snapshot.path,
    activeRoot: target,
  });
  const restored = new DatabaseAdapter(path.join(target, "data/prompthub.db"));
  expect(
    restored.get("SELECT count(*) AS count FROM extension_records"),
  ).toEqual({ count: rowCount + 1 });
  restored.close();
  expect(
    fs.statSync(path.join(target, "data/future-feature/large.bin")).size,
  ).toBe(fileBytes);
  console.info(
    "Workspace snapshot measurement",
    JSON.stringify({
      fileBytes,
      rowCount,
      captureMs: Math.round(captured - started),
      restoreMs: Math.round(performance.now() - captured),
      processMaxRssKiB: process.resourceUsage().maxRSS,
    }),
  );
}, 30_000);

it("rejects snapshot operations while the active database is open without changing its data", async () => {
  const root = fixture();
  const snapshot = createWorkspaceSnapshot({
    activeRoot: root,
    destinationPath: path.join(root, "snapshot"),
  });
  const database = initDatabase(path.join(root, "data/prompthub.db"));
  expect(() =>
    createWorkspaceSnapshot({
      activeRoot: root,
      destinationPath: path.join(root, "blocked"),
    }),
  ).toThrow(/Close the active database/);
  await expect(
    restoreWorkspaceSnapshot({ snapshotPath: snapshot.path, activeRoot: root }),
  ).rejects.toThrow(/Close the active database/);
  expect(
    database.get(
      "SELECT extra FROM extension_records WHERE id = ?",
      "extension",
    ),
  ).toEqual({ extra: "preserved" });
  expect(fs.existsSync(path.join(root, "blocked"))).toBe(false);
});

it("detaches source Rule deployment paths and retains matching destination bindings", async () => {
  const source = fixture(),
    target = fixture();
  function bind(root: string, id: string): void {
    const database = new DatabaseAdapter(path.join(root, "data/prompthub.db"));
    try {
      database.run(
        "INSERT INTO rules (id,scope,platform_id,platform_name,platform_icon,platform_description,canonical_file_name,description,managed_path,target_path,project_root_path,sync_status,content_hash,created_at,updated_at) VALUES (?, 'project', 'custom:fixture', 'Fixture', '', '', 'AGENTS.md', '', ?, ?, ?, 'target-missing', '', 1, 1)",
        id,
        path.join(root, "data/rules", id, "AGENTS.md"),
        path.join(root, "external", id, "AGENTS.md"),
        path.join(root, "external", id),
      );
    } finally {
      database.close();
    }
  }
  bind(source, "shared-rule");
  bind(source, "source-only");
  bind(target, "shared-rule");
  const snapshot = createWorkspaceSnapshot({
    activeRoot: source,
    destinationPath: path.join(source, "snapshot"),
  });
  const archived = new DatabaseAdapter(
    path.join(snapshot.path, "data/prompthub.db"),
  );
  try {
    expect(
      archived.all("SELECT target_path,project_root_path FROM rules"),
    ).toEqual([
      { target_path: "", project_root_path: null },
      { target_path: "", project_root_path: null },
    ]);
  } finally {
    archived.close();
  }
  await restoreWorkspaceSnapshot({
    snapshotPath: snapshot.path,
    activeRoot: target,
  });
  const restored = new DatabaseAdapter(path.join(target, "data/prompthub.db"));
  try {
    expect(
      restored.get(
        "SELECT target_path,project_root_path FROM rules WHERE id=?",
        "shared-rule",
      ),
    ).toEqual({
      target_path: path.join(target, "external/shared-rule/AGENTS.md"),
      project_root_path: path.join(target, "external/shared-rule"),
    });
    expect(
      restored.get(
        "SELECT target_path,project_root_path FROM rules WHERE id=?",
        "source-only",
      ),
    ).toEqual({ target_path: "", project_root_path: null });
  } finally {
    restored.close();
  }
  expect(fs.existsSync(path.join(source, "external"))).toBe(false);
  expect(fs.existsSync(path.join(target, "external"))).toBe(false);
});

it("excludes nested recovery copies and applies the existing ignore policy to external Skill packages", () => {
  const source = fixture(),
    externalRoot = fixture();
  const packageRoot = path.join(externalRoot, "external-skill");
  for (const [name, data] of Object.entries({
    "SKILL.md": "---\nname: external\n---\nContent",
    "assets/nested.bin": "binary",
    ".git/config": "local checkout",
    ".prompthub/state.json": "local state",
    ".prompthubignore": "private.txt\n",
    "private.txt": "ignored",
  })) {
    const file = path.join(packageRoot, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data);
  }
  const recovery = path.join(source, "data/recovery/nested/original.db");
  fs.mkdirSync(path.dirname(recovery), { recursive: true });
  fs.writeFileSync(recovery, "private original");
  const database = new DatabaseAdapter(path.join(source, "data/prompthub.db"));
  try {
    database.run(
      "INSERT INTO skills (id,name,local_repo_path,canonical_skill_path,created_at,updated_at) VALUES (?,?,?,?,1,1)",
      "external-skill",
      "External",
      packageRoot,
      path.join(packageRoot, "SKILL.md"),
    );
  } finally {
    database.close();
  }
  const snapshot = createWorkspaceSnapshot({
    activeRoot: source,
    destinationPath: path.join(source, "snapshot"),
  });
  const names = snapshot.manifest.entries.map((entry) => entry.path);
  expect(names.some((name) => name.startsWith("data/recovery/"))).toBe(false);
  expect(names.filter((name) => name.startsWith("data/skills/"))).toEqual([
    "data/skills/external-skill/files/.prompthubignore",
    "data/skills/external-skill/files/assets/nested.bin",
    "data/skills/external-skill/files/SKILL.md",
  ]);
  expect(fs.readFileSync(recovery, "utf8")).toBe("private original");
  expect(fs.readFileSync(path.join(packageRoot, "private.txt"), "utf8")).toBe(
    "ignored",
  );
});
