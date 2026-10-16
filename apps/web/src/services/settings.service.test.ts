import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  ENV_KEYS,
  originalEnv,
  createTestApp,
  registerUser,
  authHeaders,
} from "../routes/import-export.test-helpers";

let root: string;
const TEST_TIMEOUT = 20000;
beforeEach(() => {
  vi.resetModules();
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ph-web-settings-sql-"));
});
afterEach(async () => {
  (await import("@prompthub/db")).closeDatabase();
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  fs.rmSync(root, { recursive: true, force: true });
});
async function setup() {
  const app = await createTestApp(root);
  const owner = (await registerUser(app, "owner", "fixture-password")).payload
    .data;
  const other = (await registerUser(app, "other", "fixture-password")).payload
    .data;
  const { SettingsService } = await import("./settings.service");
  const { getServerDatabase } = await import("../database");
  return {
    app,
    owner,
    other,
    service: new SettingsService(),
    db: getServerDatabase(),
  };
}
async function reopen() {
  (await import("@prompthub/db")).closeDatabase();
  vi.resetModules();
  return createTestApp(root);
}
it(
  "reads defaults without creating settings rows or files",
  async () => {
    const { service, owner, db } = await setup();
    expect(service.get(owner.user.id)).toMatchObject({
      theme: "system",
      language: "zh",
      autoSave: true,
    });
    expect(db.all("SELECT * FROM user_settings")).toEqual([]);
    expect(fs.existsSync(path.join(root, "config", "settings"))).toBe(false);
  },
  TEST_TIMEOUT,
);

it(
  "persists tenant HTTP patches and explicit clears through reopen without a file mirror",
  async () => {
    const { app, owner, other, service, db } = await setup();
    const put = (patch: unknown) =>
      app.request(
        new Request("http://local/api/settings", {
          method: "PUT",
          headers: authHeaders(owner.accessToken),
          body: JSON.stringify(patch),
        }),
      );
    expect(
      (
        await put({
          theme: "dark",
          language: "fr",
          defaultFolderId: "folder",
          sync: {
            enabled: true,
            provider: "webdav",
            endpoint: "https://dav.example.com",
            username: "fixture-user",
            password: "fixture-secret",
            autoSync: true,
          },
        })
      ).status,
    ).toBe(200);
    expect(
      (await put({ defaultFolderId: null, sync: { autoSync: false } })).status,
    ).toBe(200);
    expect(service.get(other.user.id).theme).toBe("system");
    expect(
      db.get(
        "SELECT value FROM user_settings WHERE user_id = ? AND key = ?",
        owner.user.id,
        "theme",
      ),
    ).toEqual({ value: '"dark"' });
    expect(
      db.get(
        "SELECT value FROM user_settings WHERE user_id = ? AND key = ?",
        owner.user.id,
        "defaultFolderId",
      ),
    ).toBeNull();
    const next = await reopen();
    const response = await next.request(
      new Request("http://local/api/settings", {
        headers: authHeaders(owner.accessToken),
      }),
    );
    const value = await response.json();
    expect(value).toMatchObject({
      data: {
        theme: "dark",
        language: "fr",
        sync: {
          username: "fixture-user",
          password: "fixture-secret",
          autoSync: false,
        },
      },
    });
    expect(value.data.defaultFolderId).toBeUndefined();
    expect(fs.existsSync(path.join(root, "config", "settings"))).toBe(false);
  },
  TEST_TIMEOUT,
);

it(
  "preserves every setting and timestamp when a later SQL write fails, then accepts a retry",
  async () => {
    const { owner, service, db } = await setup();
    service.set(owner.user.id, {
      theme: "light",
      language: "en",
      defaultFolderId: "folder",
    });
    const before = db.all("SELECT * FROM user_settings ORDER BY key");
    db.exec(
      "CREATE TRIGGER reject_settings BEFORE INSERT ON user_settings WHEN NEW.key = 'language' BEGIN SELECT RAISE(ABORT,'injected settings failure'); END",
    );
    expect(() =>
      service.set(owner.user.id, {
        theme: "dark",
        language: "fr",
        defaultFolderId: null,
      }),
    ).toThrow("injected settings failure");
    expect(db.all("SELECT * FROM user_settings ORDER BY key")).toEqual(before);
    db.exec("DROP TRIGGER reject_settings");
    service.set(owner.user.id, {
      theme: "dark",
      language: "fr",
      defaultFolderId: null,
    });
    expect(service.get(owner.user.id)).toMatchObject({
      theme: "dark",
      language: "fr",
    });
  },
  TEST_TIMEOUT,
);

it(
  "does not resurrect retired files after clearing SQL and fails explicitly on corrupted JSON rows",
  async () => {
    const { owner, service, db } = await setup();
    const retired = path.join(
      root,
      "config",
      "settings",
      `${owner.user.id}.json`,
    );
    fs.mkdirSync(path.dirname(retired), { recursive: true });
    fs.writeFileSync(
      retired,
      '{"theme":"dark","language":"ja","autoSave":false}',
    );
    expect(service.get(owner.user.id)).toMatchObject({
      theme: "system",
      language: "zh",
    });
    expect(service.has(owner.user.id)).toBe(false);
    service.set(owner.user.id, { autoSave: false });
    expect(service.get(owner.user.id)).toMatchObject({
      theme: "system",
      language: "zh",
      autoSave: false,
    });
    db.run(
      "UPDATE user_settings SET value = ? WHERE user_id = ? AND key = ?",
      "{",
      owner.user.id,
      "theme",
    );
    expect(() => service.get(owner.user.id)).toThrow(
      "Invalid stored Web setting",
    );
    expect(fs.readFileSync(retired, "utf8")).toBe(
      '{"theme":"dark","language":"ja","autoSave":false}',
    );
  },
  TEST_TIMEOUT,
);
