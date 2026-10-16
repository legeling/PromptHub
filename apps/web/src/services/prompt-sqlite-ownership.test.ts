import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ph-web-sql-authority-"));
});
afterEach(async () => {
  (await import("@prompthub/db")).closeDatabase();
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  fs.rmSync(root, { recursive: true, force: true });
});

describe("Web Prompt SQLite ownership", () => {
  it(
    "persists authenticated edits and deletion without Markdown mirrors across reopen",
    async () => {
      let app = await createTestApp(root);
      const owner = (await registerUser(app, "owner", "fixture-password"))
        .payload.data;
      const other = (await registerUser(app, "other", "fixture-password"))
        .payload.data;
      const create = await app.request(
        new Request("http://local/api/prompts", {
          method: "POST",
          headers: authHeaders(owner.accessToken),
          body: JSON.stringify({ title: "Original", userPrompt: "Body one" }),
        }),
      );
      expect(create.status).toBe(201);
      const { data: prompt } = (await create.json()) as {
        data: { id: string };
      };
      const update = await app.request(
        new Request(`http://local/api/prompts/${prompt.id}`, {
          method: "PUT",
          headers: authHeaders(owner.accessToken),
          body: JSON.stringify({ userPrompt: "Body two" }),
        }),
      );
      expect(update.status).toBe(200);
      expect(fs.existsSync(path.join(root, "data", "prompts"))).toBe(false);
      expect(fs.existsSync(path.join(root, "cache", "prompt-workspace"))).toBe(
        false,
      );
      (await import("@prompthub/db")).closeDatabase();
      vi.resetModules();
      app = await createTestApp(root);
      const read = await app.request(
        new Request(`http://local/api/prompts/${prompt.id}`, {
          headers: authHeaders(owner.accessToken),
        }),
      );
      expect(await read.json()).toMatchObject({
        data: {
          userPrompt: "Body two",
          ownerUserId: owner.user.id,
          visibility: "private",
        },
      });
      const denied = await app.request(
        new Request(`http://local/api/prompts/${prompt.id}`, {
          headers: authHeaders(other.accessToken),
        }),
      );
      expect(denied.status).toBe(404);
      const history = await app.request(
        new Request(`http://local/api/prompts/${prompt.id}/versions`, {
          headers: authHeaders(owner.accessToken),
        }),
      );
      expect(((await history.json()) as { data: unknown[] }).data).toHaveLength(
        2,
      );
      const deleted = await app.request(
        new Request(`http://local/api/prompts/${prompt.id}`, {
          method: "DELETE",
          headers: authHeaders(owner.accessToken),
        }),
      );
      expect(deleted.status).toBe(200);
      (await import("@prompthub/db")).closeDatabase();
      vi.resetModules();
      app = await createTestApp(root);
      expect(
        (
          await app.request(
            new Request(`http://local/api/prompts/${prompt.id}`, {
              headers: authHeaders(owner.accessToken),
            }),
          )
        ).status,
      ).toBe(404);
      expect(fs.existsSync(path.join(root, "data", "prompts"))).toBe(false);
    },
    TEST_TIMEOUT,
  );

  it.each(["prompts", "folders"])(
    "rolls back %s creation when persisting ownership fails",
    async (table) => {
      const app = await createTestApp(root);
      const owner = (await registerUser(app, "owner", "fixture-password"))
        .payload.data;
      const { getServerDatabase } = await import("../database");
      const database = getServerDatabase();
      if (table === "prompts")
        database.exec(
          "CREATE TRIGGER reject_owner BEFORE UPDATE OF owner_user_id ON prompts BEGIN SELECT RAISE(ABORT, 'injected owner failure'); END",
        );
      else
        database.exec(
          "CREATE TRIGGER reject_owner BEFORE UPDATE OF owner_user_id ON folders BEGIN SELECT RAISE(ABORT, 'injected owner failure'); END",
        );
      const body =
        table === "prompts"
          ? { title: "Atomic", userPrompt: "Body" }
          : { name: "Atomic" };
      const response = await app.request(
        new Request(`http://local/api/${table}`, {
          method: "POST",
          headers: authHeaders(owner.accessToken),
          body: JSON.stringify(body),
        }),
      );
      expect(response.status).toBe(500);
      expect(database.all("SELECT id FROM prompts")).toEqual([]);
      expect(database.all("SELECT id FROM prompt_versions")).toEqual([]);
      expect(database.all("SELECT id FROM folders")).toEqual([]);
      database.exec("DROP TRIGGER reject_owner");
      expect(
        (
          await app.request(
            new Request(`http://local/api/${table}`, {
              method: "POST",
              headers: authHeaders(owner.accessToken),
              body: JSON.stringify(body),
            }),
          )
        ).status,
      ).toBe(201);
    },
    TEST_TIMEOUT,
  );

  it.each(["prompts", "folders"])(
    "rejects a direct %s overwrite by a different owner",
    async (table) => {
      const app = await createTestApp(root);
      const owner = (await registerUser(app, "owner", "fixture-password"))
        .payload.data;
      const other = (await registerUser(app, "other", "fixture-password"))
        .payload.data;
      const body =
        table === "prompts"
          ? { title: "Private", userPrompt: "Keep private" }
          : { name: "Private" };
      const created = await app.request(
        new Request(`http://local/api/${table}`, {
          method: "POST",
          headers: authHeaders(owner.accessToken),
          body: JSON.stringify(body),
        }),
      );
      expect(created.status).toBe(201);
      const { data } = (await created.json()) as {
        data: Record<string, unknown> & { id: string };
      };
      const attempt = await app.request(
        new Request(`http://local/api/${table}/direct-insert`, {
          method: "POST",
          headers: authHeaders(other.accessToken),
          body: JSON.stringify(data),
        }),
      );
      expect(attempt.status).toBe(404);
      expect(await attempt.json()).toMatchObject({
        error: { code: "NOT_FOUND" },
      });
      const read = await app.request(
        new Request(table === "folders" ? "http://local/api/folders?scope=private" : `http://local/api/prompts/${data.id}`, {
          headers: authHeaders(owner.accessToken),
        }),
      );
      expect(read.status).toBe(200);
      const retained = {
        id: data.id,
        ownerUserId: owner.user.id,
        visibility: "private",
      };
      expect(await read.json()).toMatchObject({
        data: table === "folders" ? [retained] : retained,
      });
    },
    TEST_TIMEOUT,
  );
});
