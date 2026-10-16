import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseAdapter, SCHEMA } from "@prompthub/db";
import { createRendererPersistenceStore } from "../src/renderer-persistence-migration";

describe("renderer auxiliary state SQLite authority", () => {
  let root: string;
  let database: DatabaseAdapter.Database;
  const source = {
    id: "local",
    name: "Local",
    type: "local-dir",
    url: "/skills",
    enabled: true,
    order: 0,
    createdAt: 1,
  };
  const encryption = {
    isEncryptionAvailable: () => false,
    encryptString: (): Buffer => {
      throw new Error("No fixture secrets");
    },
    decryptString: (): string => {
      throw new Error("No fixture secrets");
    },
  };
  const file = (relative: string) => path.join(root, relative);
  function store() {
    return createRendererPersistenceStore({
      rootPath: root,
      database,
      encryption,
    });
  }
  function seed(relative: string, value: unknown): string {
    const bytes = JSON.stringify(value, null, 2);
    fs.mkdirSync(path.dirname(file(relative)), { recursive: true });
    fs.writeFileSync(file(relative), bytes);
    return bytes;
  }
  function reopen(): void {
    database.close();
    database = new DatabaseAdapter(file("data/prompthub.db"));
  }
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-renderer-sqlite-"));
    fs.mkdirSync(file("data"));
    database = new DatabaseAdapter(file("data/prompthub.db"));
    database.transaction(() => {
      database.exec(SCHEMA);
      database.exec(
        "CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)",
      );
    })();
  });
  afterEach(() => {
    database.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("imports legacy files once, retires them, preserves recovery bytes and explicit clears after reopen", async () => {
    const bytes = seed("config/marketplace-sources.json", {
      kind: "prompthub-marketplace-sources",
      version: 1,
      sources: { skill: [source], mcp: [], plugin: [] },
    });
    seed("config/recovery-paths.json", {
      kind: "prompthub-recovery-path-registry",
      version: 1,
      paths: ["/recovery"],
    });
    seed("config/devices/renderer.json", {
      kind: "prompthub-renderer-devices",
      version: 1,
      selfHostedDeviceId: "desktop-stable",
    });
    const first = store();
    expect(first.readHydratedStateSync()).toMatchObject({
      marketplaceSources: { skill: [source] },
      recoveryPaths: ["/recovery"],
      selfHostedDeviceId: "desktop-stable",
    });
    expect(fs.existsSync(file("config/marketplace-sources.json"))).toBe(false);
    const recovery = fs.readdirSync(file("recovery/renderer-state-sqlite-v1"), {
      recursive: true,
    });
    expect(
      recovery.some(
        (entry) =>
          typeof entry === "string" &&
          entry.endsWith("marketplace-sources.json") &&
          fs.readFileSync(
            file(`recovery/renderer-state-sqlite-v1/${entry}`),
            "utf8",
          ) === bytes,
      ),
    ).toBe(true);
    await first.replaceMarketplaceSources("skill", []);
    await first.replaceRecoveryPaths([]);
    reopen();
    expect(store().readHydratedStateSync()).toMatchObject({
      marketplaceSources: { skill: [], mcp: [], plugin: [] },
      recoveryPaths: [],
      selfHostedDeviceId: "desktop-stable",
    });
    expect(await store().getOrCreateSelfHostedDeviceId()).toBe(
      "desktop-stable",
    );
    expect(fs.existsSync(file("config/recovery-paths.json"))).toBe(false);
  });

  it("rolls back SQL and source retirement together on a late SQL failure and permits retry", () => {
    const bytes = seed("config/recovery-paths.json", {
      kind: "prompthub-recovery-path-registry",
      version: 1,
      paths: ["/recovery"],
    });
    database.exec(
      "CREATE TRIGGER reject_renderer_state BEFORE INSERT ON settings WHEN NEW.key = 'selfHostedDeviceId' BEGIN SELECT RAISE(ABORT, 'injected renderer state'); END",
    );
    expect(store).toThrow(/injected renderer state/);
    expect(database.prepare("SELECT * FROM settings").all()).toEqual([]);
    expect(fs.readFileSync(file("config/recovery-paths.json"), "utf8")).toBe(
      bytes,
    );
    expect(
      database
        .prepare("SELECT * FROM schema_migrations WHERE name = ?")
        .get("renderer-state-sqlite-v1"),
    ).toBeFalsy();
    database.exec("DROP TRIGGER reject_renderer_state");
    expect(store().readHydratedStateSync().recoveryPaths).toEqual([
      "/recovery",
    ]);
  });

  it("rejects divergent SQL and legacy state without changing either source", () => {
    seed("config/devices/renderer.json", {
      kind: "prompthub-renderer-devices",
      version: 1,
      selfHostedDeviceId: "file-device",
    });
    database
      .prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
      .run("selfHostedDeviceId", JSON.stringify("sql-device"));
    expect(store).toThrow(/conflict/i);
    expect(fs.existsSync(file("config/devices/renderer.json"))).toBe(true);
    expect(
      database
        .prepare("SELECT value FROM settings WHERE key = ?")
        .get("selfHostedDeviceId"),
    ).toEqual({ value: JSON.stringify("sql-device") });
  });

  it("accepts an equal SQL source collection with omitted optional fields", () => {
    const sources = { skill: [source], mcp: [], plugin: [] };
    seed("config/marketplace-sources.json", {
      kind: "prompthub-marketplace-sources",
      version: 1,
      sources,
    });
    database
      .prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
      .run("marketplaceSources", JSON.stringify(sources));
    expect(store().readHydratedStateSync().marketplaceSources).toEqual(sources);
    expect(fs.existsSync(file("config/marketplace-sources.json"))).toBe(false);
  });

  it("does not resurrect a retired file after migration", async () => {
    const current = store();
    await current.replaceRecoveryPaths(["/current"]);
    seed("config/recovery-paths.json", {
      kind: "prompthub-recovery-path-registry",
      version: 1,
      paths: ["/stale"],
    });
    expect(current.readHydratedStateSync().recoveryPaths).toEqual(["/current"]);
    reopen();
    expect(store).toThrow(/retired/i);
  });

  it("rolls back initial renderer files and auxiliary rows when the SQL commit fails", async () => {
    const current = store();
    database.exec(
      "CREATE TRIGGER reject_renderer_import BEFORE INSERT ON settings WHEN NEW.key = 'recoveryPaths' BEGIN SELECT RAISE(ABORT, 'injected import'); END",
    );
    await expect(
      current.migrate({
        settings: { language: "fr" },
        recoveryPaths: ["/imported"],
      }),
    ).rejects.toThrow(/injected import/);
    expect(current.readHydratedStateSync()).toMatchObject({
      migrationComplete: false,
      recoveryPaths: [],
    });
    expect(fs.existsSync(file("config/app.json"))).toBe(false);
    database.exec("DROP TRIGGER reject_renderer_import");
    await current.migrate({
      settings: { language: "fr" },
      recoveryPaths: ["/imported"],
    });
    reopen();
    expect(store().readHydratedStateSync()).toMatchObject({
      migrationComplete: true,
      settings: { language: "fr" },
      recoveryPaths: ["/imported"],
    });
  });

  it.each([
    [
      "config/recovery-paths.json",
      "prompthub-recovery-path-registry",
      "paths",
      ["relative/path"],
    ],
    [
      "config/devices/renderer.json",
      "prompthub-renderer-devices",
      "selfHostedDeviceId",
      123,
    ],
    [
      "config/marketplace-sources.json",
      "prompthub-marketplace-sources",
      "sources",
      [],
    ],
  ])(
    "preserves invalid historical input at %s",
    (relative, kind, field, value) => {
      const bytes = seed(String(relative), {
        kind,
        version: 1,
        [String(field)]: value,
      });
      expect(store).toThrow(/invalid/i);
      expect(fs.readFileSync(file(String(relative)), "utf8")).toBe(bytes);
      expect(database.prepare("SELECT * FROM settings").all()).toEqual([]);
    },
  );
});
