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
const TEST_TIMEOUT = 20000;
const MIGRATION_NAME = "web-settings-sqlite-v1";
beforeEach(() => {
  vi.resetModules();
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ph-web-settings-migration-"));
});
afterEach(async () => {
  (await import("@prompthub/db")).closeDatabase();
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  fs.rmSync(root, { recursive: true, force: true });
});
function seed(id: string, value: unknown): string {
  const file = path.join(root, "config", "settings", `${id}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
  return file;
}
async function setup() {
  const app = await createTestApp(root);
  const owner = (await registerUser(app, "owner", "fixture-password")).payload
    .data;
  const other = (await registerUser(app, "other", "fixture-password")).payload
    .data;
  const { getServerDatabase } = await import("../database");
  const db = getServerDatabase();
  db.run("DELETE FROM schema_migrations WHERE name = ?", MIGRATION_NAME);
  return { owner, other, db };
}
async function reopen() {
  (await import("@prompthub/db")).closeDatabase();
  vi.resetModules();
  return createTestApp(root);
}
it(
  "migrates file-only owners, preserves existing SQL precedence and exact recovery bytes, and never replays deleted settings",
  async () => {
    const { owner, other, db } = await setup();
    const historical = {
      theme: "dark",
      language: "ja",
      autoSave: false,
      sync: {
        enabled: true,
        provider: "webdav",
        endpoint: "https://dav.example.com",
        username: "fixture-user",
        password: "fixture-secret",
        autoSync: false,
      },
      historicalAnnotation: { preserve: true },
    };
    const source = seed(owner.user.id, historical);
    const bytes = fs.readFileSync(source);
    seed(other.user.id, { theme: "light", language: "fr", autoSave: false });
    db.run(
      "INSERT INTO user_settings (user_id,key,value,updated_at) VALUES (?,?,?,?)",
      other.user.id,
      "theme",
      '"dark"',
      123,
    );
    await reopen();
    let { SettingsService } = await import("./settings.service");
    expect(new SettingsService().get(owner.user.id)).toMatchObject(historical);
    expect(new SettingsService().get(other.user.id)).toMatchObject({
      theme: "dark",
      language: "zh",
      autoSave: true,
    });
    const recovery = path.join(root, "recovery", MIGRATION_NAME);
    const copies = fs.readdirSync(recovery);
    expect(copies).toHaveLength(1);
    const recovered = path.join(recovery, copies[0], `${owner.user.id}.json`);
    expect(fs.readFileSync(recovered)).toEqual(bytes);
    if (process.platform !== "win32")
      expect(fs.statSync(recovered).mode & 0o777).toBe(0o600);
    expect(fs.existsSync(path.join(root, "config", "settings"))).toBe(false);
    const current = (await import("../database")).getServerDatabase();
    expect(
      current.get(
        "SELECT updated_at FROM user_settings WHERE user_id = ?",
        other.user.id,
      ),
    ).toEqual({ updated_at: 123 });
    current.run("DELETE FROM user_settings WHERE user_id = ?", owner.user.id);
    await reopen();
    ({ SettingsService } = await import("./settings.service"));
    expect(new SettingsService().get(owner.user.id).theme).toBe("system");
    expect(fs.readdirSync(recovery)).toEqual(copies);
  },
  TEST_TIMEOUT,
);

it(
  "rolls back all users, source retirement and ledger when SQL fails, then retries from the original files",
  async () => {
    const { owner, other, db } = await setup();
    const source = seed(owner.user.id, {
      theme: "dark",
      language: "ja",
      autoSave: false,
    });
    seed(other.user.id, { theme: "light", language: "fr", autoSave: true });
    const bytes = fs.readFileSync(source);
    db.exec(
      "CREATE TRIGGER reject_settings_migration BEFORE INSERT ON user_settings WHEN NEW.key = 'language' BEGIN SELECT RAISE(ABORT,'injected settings migration failure'); END",
    );
    await expect(reopen()).rejects.toThrow(
      "injected settings migration failure",
    );
    expect(fs.readFileSync(source)).toEqual(bytes);
    const { DatabaseAdapter } = await import("@prompthub/db");
    const probe = new DatabaseAdapter(path.join(root, "data", "prompthub.db"));
    try {
      expect(probe.all("SELECT * FROM user_settings")).toEqual([]);
      expect(
        probe.get(
          "SELECT name FROM schema_migrations WHERE name = ?",
          MIGRATION_NAME,
        ),
      ).toBeNull();
      probe.exec("DROP TRIGGER reject_settings_migration");
    } finally {
      probe.close();
    }
    await reopen();
    const { SettingsService } = await import("./settings.service");
    expect(new SettingsService().get(owner.user.id).theme).toBe("dark");
    expect(new SettingsService().get(other.user.id).language).toBe("fr");
  },
  TEST_TIMEOUT,
);

it.each([
  "unknown-owner",
  "invalid-json",
  "invalid-setting",
  "symlink",
] as const)(
  "rejects %s while preserving historical files",
  async (failure) => {
    const { owner } = await setup();
    const source = seed(
      failure === "unknown-owner" ? "unknown-user" : owner.user.id,
      { theme: "dark" },
    );
    const protectedFile = path.join(root, "protected.json");
    fs.writeFileSync(protectedFile, '{"theme":"light"}');
    if (failure === "invalid-json") fs.writeFileSync(source, "{");
    if (failure === "invalid-setting")
      fs.writeFileSync(source, '{"theme":"unrecognized"}');
    if (failure === "symlink") {
      fs.unlinkSync(source);
      fs.symlinkSync(protectedFile, source);
    }
    const before = fs.readFileSync(source);
    await expect(reopen()).rejects.toThrow();
    expect(fs.readFileSync(source)).toEqual(before);
    expect(fs.readFileSync(protectedFile, "utf8")).toBe('{"theme":"light"}');
  },
  TEST_TIMEOUT,
);

it(
  "requires explicit recovery for a source reintroduced after completion",
  async () => {
    const { owner } = await setup();
    seed(owner.user.id, { theme: "dark" });
    await reopen();
    const retired = seed(owner.user.id, { theme: "light" });
    await expect(reopen()).rejects.toThrow(
      "Retired Web settings source requires explicit recovery",
    );
    expect(fs.readFileSync(retired, "utf8")).toContain("light");
  },
  TEST_TIMEOUT,
);

it(
  "preserves SQL and historical source bytes when recovery staging fails",
  async () => {
    const { owner, db } = await setup();
    const source = seed(owner.user.id, { theme: "dark" });
    const before = fs.readFileSync(source);
    const originalWrite = fs.writeFileSync.bind(fs);
    const failure = vi
      .spyOn(fs, "writeFileSync")
      .mockImplementation((file, data, options) => {
        if (
          String(file).includes(
            `${path.sep}recovery${path.sep}${MIGRATION_NAME}${path.sep}`,
          )
        )
          throw new Error("injected settings recovery write failure");
        return originalWrite(file, data, options);
      });
    const { migrateWebSettings } = await import("./settings-migration");
    try {
      expect(() =>
        migrateWebSettings(db, root, path.join(root, "data", "prompthub.db")),
      ).toThrow("injected settings recovery write failure");
    } finally {
      failure.mockRestore();
    }
    expect(fs.readFileSync(source)).toEqual(before);
    expect(db.all("SELECT * FROM user_settings")).toEqual([]);
    expect(
      db.get(
        "SELECT name FROM schema_migrations WHERE name = ?",
        MIGRATION_NAME,
      ),
    ).toBeNull();
    migrateWebSettings(db, root, path.join(root, "data", "prompthub.db"));
    const { SettingsService } = await import("./settings.service");
    expect(new SettingsService().get(owner.user.id).theme).toBe("dark");
  },
  TEST_TIMEOUT,
);

it.each(["null-byte", "prototype"] as const)(
  "rejects an unsafe %s setting key without changing its source",
  async (kind) => {
    const { owner } = await setup();
    const source = seed(owner.user.id, { theme: "dark" });
    const value =
      kind === "null-byte"
        ? '{"theme":"dark","bad\\u0000key":true}'
        : '{"theme":"dark","__proto__":{"language":"fr"}}';
    fs.writeFileSync(source, value);
    await expect(reopen()).rejects.toThrow(
      "Historical Web setting key is unsafe",
    );
    expect(fs.readFileSync(source, "utf8")).toBe(value);
  },
  TEST_TIMEOUT,
);
