import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { closeDatabase } from "@prompthub/db";
import type { Prompt, PromptVersion } from "@prompthub/shared/types";
import { issueSolvedCaptcha } from "../test-helpers/auth-captcha";
import type { createApp } from "../app";

let root: string;
let app: ReturnType<typeof createApp>;
let headers: Record<string, string>;
beforeEach(async () => {
  vi.resetModules();
  root = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-web-prompt-content-"),
  );
  vi.stubEnv("DATA_ROOT", root);
  vi.stubEnv("JWT_SECRET", "prompt-content-test-secret-12345678901234567890");
  vi.stubEnv("ALLOW_REGISTRATION", "true");
  const module = await import("../app");
  app = module.createApp();
  const captcha = await issueSolvedCaptcha(app);
  const registration = await app.request("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "contentowner",
      password: "content-test-pass001",
      ...captcha,
    }),
  });
  expect(registration.status).toBe(201);
  const session: { data: { accessToken: string } } = await registration.json();
  headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.data.accessToken}`,
  };
});
afterEach(() => {
  closeDatabase();
  vi.unstubAllEnvs();
  if (root) fs.rmSync(root, { recursive: true, force: true });
});

async function request(
  method: string,
  route: string,
  body?: unknown,
): Promise<Response> {
  return app.request(`/api/prompts${route}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function data<T>(response: Response): Promise<T> {
  const payload: { data: T } = await response.json();
  return payload.data;
}

it.each([
  { systemPrompt: "Return JSON. 中文 🦌", userPrompt: "" },
  { systemPrompt: "", userPrompt: "Hello" },
  { systemPrompt: "Policy", userPrompt: "Question" },
])(
  "persists valid Prompt content through authenticated HTTP and reopen: %j (#225)",
  async (content) => {
    const response = await request("POST", "", {
      title: "Content",
      ...content,
    });
    expect(response.status).toBe(201);
    const prompt = await data<Prompt>(response);
    expect(
      await data<Prompt>(await request("GET", `/${prompt.id}`)),
    ).toMatchObject({
      systemPrompt: content.systemPrompt || null,
      userPrompt: content.userPrompt,
    });
    const versions = await data<PromptVersion[]>(
      await request("GET", `/${prompt.id}/versions`),
    );
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      systemPrompt: content.systemPrompt || null,
      userPrompt: content.userPrompt,
    });
    closeDatabase();
    vi.resetModules();
    app = (await import("../app")).createApp();
    expect(
      await data<Prompt>(await request("GET", `/${prompt.id}`)),
    ).toMatchObject({
      systemPrompt: content.systemPrompt || null,
      userPrompt: content.userPrompt,
    });
  },
);

it("rejects blank creation and merges partial updates without losing the last body or history (#225)", async () => {
  for (const blank of ["", " \n\t\u3000"]) {
    const response = await request("POST", "", {
      title: "Empty",
      systemPrompt: blank,
      userPrompt: blank,
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        message: expect.stringContaining("At least one"),
      },
    });
  }
  const created = await request("POST", "", {
    title: "Policy",
    systemPrompt: "Keep JSON",
    userPrompt: "",
  });
  expect(created.status).toBe(201);
  const prompt = await data<Prompt>(created);
  expect(
    (await request("PUT", `/${prompt.id}`, { title: "Renamed" })).status,
  ).toBe(200);
  expect(
    (await request("PUT", `/${prompt.id}`, { userPrompt: "" })).status,
  ).toBe(200);
  const before = await data<Prompt>(await request("GET", `/${prompt.id}`));
  const history = await data<PromptVersion[]>(
    await request("GET", `/${prompt.id}/versions`),
  );
  const rejected = await request("PUT", `/${prompt.id}`, {
    title: "Must not save",
    systemPrompt: " \n ",
  });
  expect(rejected.status).toBe(422);
  expect(await rejected.json()).toMatchObject({
    error: { code: "VALIDATION_ERROR" },
  });
  expect(await data<Prompt>(await request("GET", `/${prompt.id}`))).toEqual(
    before,
  );
  expect(
    await data<PromptVersion[]>(await request("GET", `/${prompt.id}/versions`)),
  ).toEqual(history);
  expect(
    (
      await request("PUT", `/${prompt.id}`, {
        systemPrompt: "",
        userPrompt: "User body",
      })
    ).status,
  ).toBe(200);
  expect(
    await data<Prompt>(await request("GET", `/${prompt.id}`)),
  ).toMatchObject({ systemPrompt: "", userPrompt: "User body" });
});

it("restores and inserts system-only Prompt/version snapshots without requiring a user body (#225)", async () => {
  const created = await request("POST", "", {
    title: "Policy",
    systemPrompt: "System snapshot",
    userPrompt: "",
  });
  expect(created.status).toBe(201);
  const prompt = await data<Prompt>(created);
  const versions = await data<PromptVersion[]>(
    await request("GET", `/${prompt.id}/versions`),
  );
  const restored = await request("POST", "/graph/restore", {
    prompts: [prompt],
    folders: [],
    versions,
  });
  expect(restored.status).toBe(200);
  expect(
    await data<Prompt>(await request("GET", `/${prompt.id}`)),
  ).toMatchObject({ systemPrompt: "System snapshot", userPrompt: "" });
  const inserted = await request("POST", "/direct-insert", {
    ...prompt,
    id: "direct-system-only",
  });
  expect(inserted.status).toBe(201);
  const version = await request("POST", "/versions/direct-insert", {
    ...versions[0],
    id: "direct-version",
    promptId: "direct-system-only",
  });
  expect(version.status).toBe(201);
  expect(
    await data<PromptVersion[]>(
      await request("GET", "/direct-system-only/versions"),
    ),
  ).toEqual([
    expect.objectContaining({
      systemPrompt: "System snapshot",
      userPrompt: "",
    }),
  ]);
});
