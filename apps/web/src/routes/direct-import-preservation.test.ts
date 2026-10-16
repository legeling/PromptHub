import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Folder, Prompt, PromptVersion } from "@prompthub/shared";
import {
  ENV_KEYS,
  originalEnv,
  createTestApp,
  registerUser,
  authHeaders,
} from "./import-export.test-helpers";

let root: string;
beforeEach(() => {
  vi.resetModules();
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ph-web-direct-import-"));
});
afterEach(async () => {
  (await import("@prompthub/db")).closeDatabase();
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  fs.rmSync(root, { recursive: true, force: true });
});

it("keeps nested folders, Prompt placement and history through authenticated direct import and reopen", async () => {
  let app = await createTestApp(root);
  const owner = (await registerUser(app, "owner", "fixture-password")).payload
    .data;
  async function post<T>(route: string, payload: unknown): Promise<T> {
    const response = await app.request(
      new Request(`http://local/api/${route}`, {
        method: "POST",
        headers: authHeaders(owner.accessToken),
        body: JSON.stringify(payload),
      }),
    );
    expect(response.status).toBe(201);
    // The request goes through the actual route schema; JSON is untyped here.
    return ((await response.json()) as { data: T }).data;
  }
  const parent = await post<Folder>("folders", { name: "Parent" });
  const child = await post<Folder>("folders", {
    name: "Child",
    parentId: parent.id,
  });
  const prompt = await post<Prompt>("prompts", {
    title: "Original",
    userPrompt: "Body",
    folderId: child.id,
  });
  const historyUrl = `http://local/api/prompts/${prompt.id}/versions`;
  const historyBefore = await (
    await app.request(
      new Request(historyUrl, {
        headers: authHeaders(owner.accessToken),
      }),
    )
  ).json();
  expect(historyBefore).toMatchObject({
    data: [expect.objectContaining({ promptId: prompt.id })],
  });
  await post<Folder>("folders/direct-insert", { ...parent, name: "Renamed" });
  await post<Prompt>("prompts/direct-insert", {
    ...prompt,
    title: "Imported title",
  });

  (await import("@prompthub/db")).closeDatabase();
  vi.resetModules();
  app = await createTestApp(root);
  const folders = await app.request(
    new Request("http://local/api/folders?scope=private", {
      headers: authHeaders(owner.accessToken),
    }),
  );
  expect(folders.status).toBe(200);
  expect(await folders.json()).toMatchObject({
    data: expect.arrayContaining([
      expect.objectContaining({ id: parent.id, name: "Renamed" }),
      expect.objectContaining({ id: child.id, parentId: parent.id }),
    ]),
  });
  const read = await app.request(
    new Request(`http://local/api/prompts/${prompt.id}`, {
      headers: authHeaders(owner.accessToken),
    }),
  );
  expect(read.status).toBe(200);
  expect(await read.json()).toMatchObject({
    data: {
      id: prompt.id,
      title: "Imported title",
      folderId: child.id,
      ownerUserId: owner.user.id,
      visibility: "private",
    },
  });
  const history = await app.request(
    new Request(historyUrl, { headers: authHeaders(owner.accessToken) }),
  );
  expect(history.status).toBe(200);
  expect(await history.json()).toEqual(historyBefore);
}, 20000);

it("returns a conflict for unsaved version content and accepts an identical retry", async () => {
  const app = await createTestApp(root);
  const owner = (await registerUser(app, "owner", "fixture-password")).payload
    .data;
  const created = await app.request(
    new Request("http://local/api/prompts", {
      method: "POST",
      headers: authHeaders(owner.accessToken),
      body: JSON.stringify({ title: "Version import", userPrompt: "Original" }),
    }),
  );
  expect(created.status).toBe(201);
  // The authenticated routes validate these DTOs before their JSON response.
  const { data: prompt } = (await created.json()) as { data: Prompt };
  const historyUrl = `http://local/api/prompts/${prompt.id}/versions`;
  const history = await app.request(
    new Request(historyUrl, { headers: authHeaders(owner.accessToken) }),
  );
  const { data: versions } = (await history.json()) as {
    data: PromptVersion[];
  };
  expect(versions).toHaveLength(1);
  const original = versions[0];
  for (const [version, status] of [
    [{ ...original, userPrompt: "Unsaved conflict" }, 409],
    [original, 201],
  ] as const) {
    const response = await app.request(
      new Request("http://local/api/prompts/versions/direct-insert", {
        method: "POST",
        headers: authHeaders(owner.accessToken),
        body: JSON.stringify(version),
      }),
    );
    expect(response.status).toBe(status);
    if (status === 409)
      expect(await response.json()).toMatchObject({
        error: { code: "CONFLICT" },
      });
    else expect(await response.json()).toMatchObject({ data: original });
  }
  const retained = await app.request(
    new Request(historyUrl, { headers: authHeaders(owner.accessToken) }),
  );
  expect(await retained.json()).toMatchObject({ data: [original] });
}, 20000);
