import type { CausalSyncResolution } from "@prompthub/shared/types/causal-sync";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DatabaseAdapter } from "@prompthub/db";
import { CoreSettingsStore } from "@prompthub/core/settings-store";
import { resetRuntimePaths } from "@prompthub/core/runtime-paths";
import { createDesktopSyncWorkspace } from "@prompthub/core/causal-sync/desktop-workspace";
import { registerCausalSyncIPC } from "../../src/main/ipc/causal-sync.ipc";
import { seedSyncProfile, syncProfile } from "../helpers/causal-sync-profile";
import "../../src/preload";

const bridge = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  exposed: {} as { electron?: Window["electron"] },
}));
vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
      bridge.handlers.set(channel, handler),
  },
  ipcRenderer: {
    on: vi.fn(),
    invoke: async (channel: string, ...args: unknown[]) => {
      const handler = bridge.handlers.get(channel);
      if (!handler) throw new Error(`Unregistered ${channel}`);
      return structuredClone(await handler({}, ...structuredClone(args)));
    },
  },
  contextBridge: {
    exposeInMainWorld: (name: string, value: Window["electron"]) => {
      if (name === "electron") bridge.exposed.electron = value;
    },
  },
  webUtils: {},
  app: {},
  session: {},
  safeStorage: {},
}));

let server: http.Server,
  endpoint: string,
  root: string,
  current: ReturnType<typeof syncProfile>;
const profiles: ReturnType<typeof syncProfile>[] = [],
  objects = new Map<string, { data: string; etag: string }>();
let ignoreConditions = false;
async function serve(
  request: http.IncomingMessage,
  response: http.ServerResponse,
): Promise<void> {
  const key = new URL(request.url ?? "/", endpoint).pathname;
  if (request.method === "PROPFIND") {
    response.writeHead(207).end();
    return;
  }
  if (request.method === "GET") {
    const item = objects.get(key);
    if (!item) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { ETag: item.etag }).end(item.data);
    return;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const existing = objects.get(key);
  if (
    !ignoreConditions &&
    ((request.headers["if-none-match"] === "*" && existing) ||
      (request.headers["if-match"] &&
        request.headers["if-match"] !== existing?.etag))
  ) {
    response
      .writeHead(412, { "Content-Type": "application/xml" })
      .end("<Error><Code>PreconditionFailed</Code></Error>");
    return;
  }
  if (request.method === "DELETE") {
    objects.delete(key);
    response.writeHead(204).end();
    return;
  }
  const data = Buffer.concat(chunks).toString("utf8"),
    etag = `"${createHash("sha256").update(data).digest("hex")}"`;
  objects.set(key, { data, etag });
  response.writeHead(200, { ETag: etag }).end();
}
beforeEach(async () => {
  root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "ph-causal-entry-")),
  );
  objects.clear();
  ignoreConditions = false;
  bridge.handlers.clear();
  vi.stubEnv("PROMPTHUB_E2E", "0");
  server = http.createServer((req, res) => {
    void serve(req, res).catch(() => res.writeHead(500).end());
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing test port");
  endpoint = `http://127.0.0.1:${address.port}`;
  registerCausalSyncIPC(() => current);
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  for (const profile of profiles.splice(0)) profile.database.close();
  resetRuntimePaths();
  fs.rmSync(root, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
function device(name: string, provider: "webdav" | "s3", encrypted = false) {
  const value = syncProfile(
    path.join(root, name),
    endpoint,
    provider,
    encrypted,
  );
  profiles.push(value);
  return value;
}
function run(
  profile: ReturnType<typeof syncProfile>,
  provider: "webdav" | "s3",
  resolution?: CausalSyncResolution,
) {
  current = profile;
  const call = bridge.exposed.electron?.causalSync;
  if (!call) throw new Error("Missing causal sync bridge");
  return call({ provider, resolution });
}

it.each(["webdav", "s3"] as const)(
  "synchronizes all nonempty owners through %s preload, HTTP and two independent profiles",
  async (provider) => {
    const a = device("source", provider, provider === "s3"),
      b = device("destination", provider, provider === "s3");
    seedSyncProfile(a);
    const expected = a.workspace.capture();
    expect(new Set(expected.map((item) => item.resourceType))).toEqual(
      new Set([
        "prompt",
        "skill",
        "rule",
        "mcp",
        "plugin",
        "agent-provider",
        "generation",
        "settings",
        "marketplace-sources",
      ]),
    );
    expect(await run(a, provider)).toMatchObject({ status: "committed" });
    const review = await run(b, provider);
    if (review.status !== "baseline-required")
      throw new Error(JSON.stringify(review));
    expect(
      await run(b, provider, {
        kind: "baseline",
        token: review.token,
        choice: "remote",
      }),
    ).toMatchObject({ status: "committed", localChanged: true });
    expect(b.workspace.capture()).toEqual(expected);
    const remoteText = [...objects.values()]
      .map((item) => item.data)
      .join("\n");
    expect(remoteText).not.toContain("device-only-test-secret");
    expect(remoteText).not.toContain(a.rootPath);
    if (provider === "s3") expect(remoteText).not.toContain("source prompt");
    const original = a.prompts.getAll()[0];
    a.prompts.update(original.id, { userPrompt: "remote edit" });
    b.prompts.update(original.id, { userPrompt: "local edit" });
    await run(a, provider);
    const conflict = await run(b, provider);
    if (conflict.status !== "conflict")
      throw new Error(JSON.stringify(conflict));
    expect(
      await run(b, provider, {
        kind: "conflicts",
        token: conflict.token,
        choices: [
          { resourceType: "prompt", resourceId: original.id, choice: "local" },
        ],
      }),
    ).toMatchObject({ status: "committed" });
    await run(a, provider);
    expect(a.prompts.getById(original.id)?.userPrompt).toBe("local edit");
    for (let reopen = 0; reopen < 2; reopen++) {
      const db = new DatabaseAdapter(path.join(b.rootPath, "profile.sqlite"));
      try {
        const settings = new CoreSettingsStore({
          database: db,
          rootPath: b.rootPath,
          masterKeyStore: b.masterKeyStore,
        });
        expect(
          createDesktopSyncWorkspace(db, b.rootPath, settings).capture(),
        ).toEqual(b.workspace.capture());
        expect(db.get("PRAGMA quick_check")).toEqual({ quick_check: "ok" });
        expect(db.all("PRAGMA foreign_key_check")).toEqual([]);
        expect(
          new (await import("@prompthub/db")).PromptDB(db).getById(original.id)
            ?.userPrompt,
        ).toBe("local edit");
      } finally {
        db.close();
      }
    }
  },
  120000,
);

it("rejects malformed IPC and targets that ignore conditions without replacing local content", async () => {
  const a = device("source", "webdav");
  seedSyncProfile(a);
  const before = a.workspace.capture();
  ignoreConditions = true;
  expect(await run(a, "webdav")).toMatchObject({ status: "unsupported" });
  expect(a.workspace.capture()).toEqual(before);
  const handler = bridge.handlers.get("sync:run-causal");
  expect(
    await handler?.(
      {},
      {
        provider: "webdav",
        resolution: { kind: "baseline", token: "bad", choice: "remote" },
      },
    ),
  ).toMatchObject({ status: "failed" });
  expect([...objects.keys()].some((key) => key.endsWith("head.json"))).toBe(
    false,
  );
});
