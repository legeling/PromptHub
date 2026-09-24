import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { closeDatabase } from "@prompthub/db";
import { issueSolvedCaptcha } from "../test-helpers/auth-captcha";

let root: string | undefined;
afterEach(() => {
  closeDatabase();
  vi.unstubAllEnvs();
  if (root) fs.rmSync(root, { recursive: true, force: true });
});

it("restores a graph through the authenticated route and rejects invalid input without losing data", async () => {
  vi.resetModules();
  root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-graph-route-"));
  vi.stubEnv("DATA_ROOT", root);
  vi.stubEnv("JWT_SECRET", "graph-route-test-secret-12345678901234567890");
  vi.stubEnv("ALLOW_REGISTRATION", "true");
  const { createApp } = await import("../app");
  const app = createApp();
  const captcha = await issueSolvedCaptcha(app);
  const registration = await app.request("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "graphowner",
      password: "graph-test-pass001",
      ...captcha,
    }),
  });
  expect(registration.status).toBe(201);
  const { data: session } = await registration.json();
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.accessToken}`,
  };
  const created = await app.request("/api/prompts", {
    method: "POST",
    headers,
    body: JSON.stringify({ title: "Original", userPrompt: "Body" }),
  });
  expect(created.status).toBe(201);
  const { data: prompt } = await created.json();
  const versionsResponse = await app.request(
    `/api/prompts/${prompt.id}/versions`,
    { headers },
  );
  expect(versionsResponse.status).toBe(200);
  const { data: versions } = await versionsResponse.json();
  const graph = {
    prompts: [{ ...prompt, title: "Restored" }],
    folders: [],
    versions,
  };
  const restore = (body: unknown) =>
    app.request("/api/prompts/graph/restore", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  const result = await restore(graph);
  expect(result.status).toBe(200);
  expect((await result.json()).data).toMatchObject({
    promptCount: 1,
    versionCount: versions.length,
  });
  const read = () => app.request(`/api/prompts/${prompt.id}`, { headers });
  expect((await (await read()).json()).data.title).toBe("Restored");
  expect(
    (await restore({ ...graph, prompts: [{ ...prompt, folderId: "missing" }] }))
      .status,
  ).toBe(422);
  expect(
    (await restore({ prompts: "invalid", folders: [], versions: [] })).status,
  ).toBe(422);
  expect(
    (
      await app.request("/api/prompts/graph/restore", {
        method: "POST",
        body: JSON.stringify(graph),
      })
    ).status,
  ).toBe(401);
  expect((await (await read()).json()).data.title).toBe("Restored");
  const bodyPerPrompt = "x".repeat(90_000);
  const restoredPromptCount = 12;
  const largeGraph = {
    folders: [],
    prompts: Array.from({ length: restoredPromptCount }, (_, index) => ({
      ...prompt,
      id: `large-${index}`,
      userPrompt: bodyPerPrompt,
    })),
    versions: Array.from({ length: restoredPromptCount }, (_, index) => ({
      ...versions[0],
      id: `large-version-${index}`,
      promptId: `large-${index}`,
      userPrompt: bodyPerPrompt,
    })),
  };
  const largeRestore = await restore(largeGraph);
  expect(largeRestore.status).toBe(200);
  expect((await largeRestore.json()).data.promptCount).toBe(
    restoredPromptCount,
  );
  const reread = await app.request("/api/prompts/large-11", { headers });
  expect((await reread.json()).data.userPrompt).toBe(bodyPerPrompt);
}, 30000);
