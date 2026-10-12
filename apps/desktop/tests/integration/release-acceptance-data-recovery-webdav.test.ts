import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerWebDAVIPC } from "../../src/main/webdav";
import "../../src/preload";

const transport = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const exposed: { electron?: Window["electron"] } = {};
  return { handlers, exposed };
});

// Only Electron message delivery is replaced. The preload, registered handlers,
// proxy selection, Node HTTP client and fixture disk IO execute normally.
vi.mock("electron", () => ({
  ipcMain: {
    handle(channel: string, handler: (...args: unknown[]) => unknown) {
      if (transport.handlers.has(channel))
        throw new Error(`Duplicate ${channel}`);
      transport.handlers.set(channel, handler);
    },
  },
  ipcRenderer: {
    on: vi.fn(),
    async invoke(channel: string, ...args: unknown[]): Promise<unknown> {
      const handler = transport.handlers.get(channel);
      if (!handler) throw new Error(`Unregistered IPC channel: ${channel}`);
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

const CHUNK_GAP_MS = 20;
const LAST_MODIFIED = "Sun, 04 Oct 2026 00:00:00 GMT";
let root: string;
let server: http.Server;
let config: { url: string; username: string; password: string };
let splitAfterBytes: number | null;
let rejectUploads: boolean;
const pendingChunks = new Set<ReturnType<typeof setTimeout>>();

function webdav(): NonNullable<Window["electron"]["webdav"]> {
  const bridge = transport.exposed.electron?.webdav;
  if (!bridge) throw new Error("The real preload did not expose WebDAV");
  return bridge;
}

function digest(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sendObject(response: http.ServerResponse): void {
  const bytes = fs.readFileSync(path.join(root, "backup.json"));
  response.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
  });
  if (splitAfterBytes === null) {
    response.end(bytes);
    return;
  }
  const split = splitAfterBytes;
  response.write(bytes.subarray(0, split));
  // Model separate network arrivals, not a sleep before an assertion. Splitting
  // within a valid UTF-8 sequence is legal HTTP and must not change the text.
  const timer = setTimeout(() => {
    pendingChunks.delete(timer);
    response.end(bytes.subarray(split));
  }, CHUNK_GAP_MS);
  pendingChunks.add(timer);
}

async function serve(
  request: http.IncomingMessage,
  response: http.ServerResponse,
): Promise<void> {
  const objectPath = path.join(root, "backup.json");
  if (request.url === "/unauthorized") {
    response.writeHead(401).end();
  } else if (request.url === "/missing") {
    response.writeHead(404).end();
  } else if (request.method === "PUT" && rejectUploads) {
    request.resume();
    response.writeHead(503).end("fixture write unavailable");
  } else if (request.method === "PUT") {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    fs.writeFileSync(objectPath, Buffer.concat(chunks));
    response.writeHead(201).end();
  } else if (request.method === "PROPFIND") {
    response
      .writeHead(207)
      .end(
        `<d:multistatus xmlns:d="DAV:"><d:getlastmodified>${LAST_MODIFIED}</d:getlastmodified></d:multistatus>`,
      );
  } else if (request.method === "GET" && fs.existsSync(objectPath)) {
    sendObject(response);
  } else {
    response.writeHead(404).end();
  }
}

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-acceptance-webdav-"));
  transport.handlers.clear();
  vi.stubEnv("PROMPTHUB_E2E", "0");
  splitAfterBytes = null;
  rejectUploads = false;
  server = http.createServer((request, response) => {
    void serve(request, response).catch((error: unknown) => {
      response.destroy(
        error instanceof Error ? error : new Error(String(error)),
      );
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No fixture TCP port");
  config = {
    url: `http://127.0.0.1:${address.port}/`,
    username: "fixture",
    password: "fixture",
  };
  registerWebDAVIPC();
});

afterEach(async () => {
  for (const timer of pendingChunks) clearTimeout(timer);
  pendingChunks.clear();
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  transport.handlers.clear();
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("release acceptance: WebDAV data integrity (D1)", () => {
  it("round-trips Unicode through preload, registered HTTP handlers and disk", async () => {
    const text = JSON.stringify({
      title: "\u6570\u636e \u{1f512}",
      versions: [1, 2],
    });
    expect(await webdav().testConnection(config)).toEqual({
      success: true,
      message: "Connection successful",
    });
    expect(await webdav().upload(config.url, config, text)).toEqual({
      success: true,
    });
    expect(fs.readFileSync(path.join(root, "backup.json"), "utf8")).toBe(text);
    const downloaded = await webdav().download(config.url, config);
    expect(downloaded).toEqual({ success: true, data: text });
    expect(digest(downloaded.data ?? "")).toBe(digest(text));
    expect(await webdav().stat(config.url, config)).toEqual({
      success: true,
      lastModified: LAST_MODIFIED,
    });
  });

  it("preserves the committed file on failed writes and can read and replace it after recovery", async () => {
    const original = JSON.stringify({ title: "committed", versions: [1] });
    await webdav().upload(config.url, config, original);
    const before = fs.readFileSync(path.join(root, "backup.json"));
    rejectUploads = true;
    expect(await webdav().upload(config.url, config, "replacement")).toEqual({
      success: false,
      error: "503 Service Unavailable",
    });
    expect(fs.readFileSync(path.join(root, "backup.json"))).toEqual(before);
    expect(fs.readdirSync(root)).toEqual(["backup.json"]);
    expect(await webdav().download(config.url, config)).toEqual({
      success: true,
      data: original,
    });
    expect(await webdav().download(`${config.url}missing`, config)).toEqual({
      success: false,
      notFound: true,
    });
    expect(
      await webdav().testConnection({
        ...config,
        url: `${config.url}unauthorized`,
      }),
    ).toEqual({
      success: false,
      message: "Authentication failed, please check username and password",
    });
    rejectUploads = false;
    const replacement = JSON.stringify({
      title: "recovered",
      versions: [1, 2],
    });
    await webdav().upload(config.url, config, replacement);
    expect(await webdav().download(config.url, config)).toEqual({
      success: true,
      data: replacement,
    });
    expect(fs.readFileSync(path.join(root, "backup.json"), "utf8")).toBe(
      replacement,
    );
  });

  it.each([
    { label: "CJK after byte 1", character: "\u6c49", offset: 1 },
    { label: "CJK after byte 2", character: "\u6c49", offset: 2 },
    { label: "emoji after byte 1", character: "\u{1f512}", offset: 1 },
    { label: "emoji after byte 2", character: "\u{1f512}", offset: 2 },
    { label: "emoji after byte 3", character: "\u{1f512}", offset: 3 },
  ])("preserves valid UTF-8 split at $label", async ({ character, offset }) => {
    const text = JSON.stringify({ title: `data ${character} end` });
    await webdav().upload(config.url, config, text);
    splitAfterBytes =
      Buffer.from(text).indexOf(Buffer.from(character)) + offset;
    const downloaded = await webdav().download(config.url, config);
    // A broken reader must not be mistaken for a broken fixture or lost source.
    expect(fs.readFileSync(path.join(root, "backup.json"), "utf8")).toBe(text);
    expect(fs.readdirSync(root)).toEqual(["backup.json"]);
    splitAfterBytes = null;
    expect(await webdav().download(config.url, config)).toEqual({
      success: true,
      data: text,
    });
    expect(downloaded).toEqual({ success: true, data: text });
  });
});
