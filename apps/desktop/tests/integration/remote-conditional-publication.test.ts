import http from "node:http";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteWriteCondition } from "@prompthub/shared/types/remote-sync";
import { verifyConditionalPublication } from "@prompthub/core/remote-publication";
import { registerWebDAVIPC } from "../../src/main/webdav";
import { registerS3IPC } from "../../src/main/s3";
import "../../src/preload";

const transport = vi.hoisted(() => {
  const exposed: { electron?: Window["electron"] } = {};
  return {
    handlers: new Map<string, (...args: unknown[]) => unknown>(),
    exposed,
  };
});

// Replace Electron delivery only: real preload, handlers, HTTP and AWS SDK run.
vi.mock("electron", () => ({
  ipcMain: {
    handle(channel: string, handler: (...args: unknown[]) => unknown) {
      transport.handlers.set(channel, handler);
    },
  },
  ipcRenderer: {
    on: vi.fn(),
    async invoke(channel: string, ...args: unknown[]): Promise<unknown> {
      const handler = transport.handlers.get(channel);
      if (!handler) throw new Error(`Unregistered channel: ${channel}`);
      return structuredClone(await handler({}, ...structuredClone(args)));
    },
  },
  contextBridge: {
    exposeInMainWorld(name: string, value: Window["electron"]) {
      if (name === "electron") transport.exposed.electron = value;
    },
  },
  webUtils: {},
  app: {},
  session: {},
}));

let server: http.Server;
let endpoint: string;
let requestCount: number;
let nextWriteStatus: number | undefined;
let ignoreConditions: boolean;
const objects = new Map<string, { data: string; etag: string }>();

function reject(response: http.ServerResponse, status: number): void {
  response.writeHead(status, { "Content-Type": "application/xml" });
  response.end(
    `<Error><Code>${status === 412 ? "PreconditionFailed" : "ConditionalRequestConflict"}</Code><Message>Fixture conflict</Message></Error>`,
  );
}

async function serve(
  request: http.IncomingMessage,
  response: http.ServerResponse,
): Promise<void> {
  requestCount++;
  const key = new URL(request.url || "/", endpoint).pathname;
  if (request.method === "GET") {
    const current = objects.get(key);
    if (!current) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { ETag: current.etag }).end(current.data);
    return;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const current = objects.get(key);
  if (nextWriteStatus !== undefined) {
    const status = nextWriteStatus;
    nextWriteStatus = undefined;
    reject(response, status);
    return;
  }
  if (
    !ignoreConditions &&
    ((request.headers["if-none-match"] === "*" && current) ||
      (request.headers["if-match"] !== undefined &&
        request.headers["if-match"] !== current?.etag))
  ) {
    reject(response, 412);
    return;
  }
  if (request.method === "DELETE") {
    objects.delete(key);
    response.writeHead(204).end();
    return;
  }
  const data = Buffer.concat(chunks).toString("utf8");
  const etag = `"${createHash("sha256").update(data).digest("hex")}"`;
  objects.set(key, { data, etag });
  response.writeHead(200, { ETag: etag }).end();
}

beforeEach(async () => {
  transport.handlers.clear();
  objects.clear();
  requestCount = 0;
  nextWriteStatus = undefined;
  ignoreConditions = false;
  vi.stubEnv("PROMPTHUB_E2E", "0");
  server = http.createServer((request, response) => {
    void serve(request, response).catch(() => response.writeHead(500).end());
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing fixture address");
  endpoint = `http://127.0.0.1:${address.port}`;
  registerWebDAVIPC();
  registerS3IPC();
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, rejectClose) =>
    server.close((error) => (error ? rejectClose(error) : resolve())),
  );
  vi.unstubAllEnvs();
});

function client(kind: "WebDAV" | "S3") {
  const electron = transport.exposed.electron;
  if (!electron?.webdav || !electron.s3)
    throw new Error("Missing preload transport");
  const dav = electron.webdav;
  const s3 = electron.s3;
  const davConfig = { url: endpoint, username: "fixture", password: "fixture" };
  const s3Config = {
    endpoint,
    region: "us-east-1",
    bucket: "fixture",
    accessKeyId: "fixture",
    secretAccessKey: "fixture",
  };
  return {
    read: (path = "head") =>
      kind === "WebDAV"
        ? dav.download(`${endpoint}/${path}`, davConfig)
        : s3.download(path, s3Config),
    write: (
      content: string,
      condition?: RemoteWriteCondition,
      path = "head",
    ) =>
      kind === "WebDAV"
        ? dav.upload(`${endpoint}/${path}`, davConfig, content, condition)
        : s3.upload(path, s3Config, content, condition),
    remove: (path: string) =>
      kind === "WebDAV"
        ? dav.delete(`${endpoint}/${path}`, davConfig)
        : s3.delete(path, s3Config),
  };
}

describe.each(["WebDAV", "S3"] as const)(
  "%s conditional publication through preload",
  (kind) => {
    it("probes actual conditional behavior and removes its own probe for supported and ignoring servers", async () => {
      const remote = client(kind);
      await remote.write("existing user snapshot");
      const before = [...objects];
      const store = {
        downloadText: remote.read,
        uploadText: (
          path: string,
          data: string,
          condition?: RemoteWriteCondition,
        ) => remote.write(data, condition, path),
        deleteText: remote.remove,
      };
      expect(await verifyConditionalPublication(store, "head")).toEqual({
        supported: true,
      });
      expect([...objects]).toEqual(before);
      ignoreConditions = true;
      expect(await verifyConditionalPublication(store, "head")).toEqual({
        supported: false,
        reason: "condition-not-enforced",
      });
      expect([...objects]).toEqual(before);
    });
    it("creates once, reads an opaque ETag, and rejects the losing concurrent writer without changing the winner", async () => {
      const remote = client(kind);
      expect(await remote.read()).toMatchObject({
        success: false,
        notFound: true,
      });
      expect(
        await remote.write("base 中文", { ifNoneMatch: "*" }),
      ).toMatchObject({ success: true });
      const base = await remote.read();
      expect(base.data).toBe("base 中文");
      expect(base.etag).toMatch(/^".+"$/);
      if (!base.etag) throw new Error("Missing ETag");
      expect(
        await remote.write("duplicate", { ifNoneMatch: "*" }),
      ).toMatchObject({ success: false, conflict: true });
      const outcomes = await Promise.all([
        remote.write("first candidate", { ifMatch: base.etag }),
        remote.write("second candidate", { ifMatch: base.etag }),
      ]);
      expect(outcomes.filter((result) => result.success)).toHaveLength(1);
      expect(outcomes.filter((result) => result.conflict)).toHaveLength(1);
      const winner = await remote.read();
      expect(winner.data).toBe(
        outcomes[0].success ? "first candidate" : "second candidate",
      );
      expect(winner.etag).not.toBe(base.etag);
      expect(
        await remote.write("stale overwrite", { ifMatch: base.etag }),
      ).toMatchObject({ success: false, conflict: true });
      expect(await remote.read()).toEqual(winner);
      if (!winner.etag) throw new Error("Missing winner ETag");
      expect(
        await remote.write("next revision", { ifMatch: winner.etag }),
      ).toMatchObject({ success: true });
      expect((await remote.read()).data).toBe("next revision");
    });

    it("rejects malformed conditions before network IO and preserves the current object", async () => {
      const remote = client(kind);
      await remote.write("preserved", { ifNoneMatch: "*" });
      const before = requestCount;
      const channel = kind === "WebDAV" ? "webdav:upload" : "s3:upload";
      const handler = transport.handlers.get(channel);
      if (!handler) throw new Error("Missing upload handler");
      for (const condition of [
        null,
        {},
        { ifMatch: "*" },
        { ifMatch: 'W/"weak"' },
        { ifMatch: '"a"\r\nX: injected' },
        { ifNoneMatch: "other" },
        { ifMatch: '"a"', ifNoneMatch: "*" },
      ]) {
        expect(
          await handler({}, "unused", {}, "overwrite", condition),
        ).toMatchObject({ success: false });
      }
      expect(requestCount).toBe(before);
      const deleteHandler = transport.handlers.get(kind === "WebDAV" ? "webdav:delete" : "s3:delete");
      if (!deleteHandler) throw new Error("Missing delete handler");
      expect(await deleteHandler({}, undefined, undefined)).toMatchObject({ success: false });
      expect(requestCount).toBe(before);
      expect((await remote.read()).data).toBe("preserved");
    });

    it("reports a conditional race without retrying an unconditional overwrite", async () => {
      const remote = client(kind);
      await remote.write("preserved", { ifNoneMatch: "*" });
      const base = await remote.read();
      if (!base.etag) throw new Error("Missing ETag");
      nextWriteStatus = 409;
      const before = requestCount;
      expect(await remote.write("lost", { ifMatch: base.etag })).toMatchObject({
        success: false,
        conflict: true,
      });
      expect(requestCount - before).toBe(1);
      expect((await remote.read()).data).toBe("preserved");
    });
  },
);
