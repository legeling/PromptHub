import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { IPC_CHANNELS } from "@prompthub/shared/constants";
import {
  configureRuntimePaths,
  getImagesDir,
  getVideosDir,
  resetRuntimePaths,
} from "@prompthub/core/runtime-paths";
import { registerAIIPC } from "../../src/main/ipc/ai.ipc";
import { registerImageIPC } from "../../src/main/ipc/image.ipc";
import { aiApi } from "../../src/preload/api/ai";
import {
  chatCompletion,
  generateImage,
  multiModelCompare,
} from "../../src/renderer/services/ai";
import type { AIConfig } from "../../src/renderer/services/ai-types";

type TransportListener = (event: unknown, payload: unknown) => void;
type TransportHandler = (
  event: { sender: { send: (channel: string, payload: unknown) => void } },
  ...args: unknown[]
) => unknown;

const transport = vi.hoisted(() => {
  const handlers = new Map<string, TransportHandler>();
  const listeners = new Map<string, Set<TransportListener>>();
  return {
    handlers,
    listeners,
    async invoke(channel: string, ...args: unknown[]): Promise<unknown> {
      const handler = handlers.get(channel);
      if (!handler)
        throw new Error(`Unregistered acceptance IPC channel: ${channel}`);
      const sender = {
        send(eventChannel: string, payload: unknown): void {
          for (const listener of listeners.get(eventChannel) ?? [])
            listener({}, payload);
        },
      };
      return structuredClone(
        await handler({ sender }, ...structuredClone(args)),
      );
    },
  };
});

// Only native transport is replaced. The HTTP client and protocol adapters
// talk to the local fixture over a real socket; media writes use real files.
vi.mock("electron", () => ({
  ipcMain: {
    handle(channel: string, handler: TransportHandler) {
      if (transport.handlers.has(channel))
        throw new Error(`Duplicate IPC: ${channel}`);
      transport.handlers.set(channel, handler);
    },
  },
  ipcRenderer: {
    invoke: transport.invoke,
    on(channel: string, listener: TransportListener) {
      const listeners =
        transport.listeners.get(channel) ?? new Set<TransportListener>();
      listeners.add(listener);
      transport.listeners.set(channel, listeners);
    },
    removeListener(channel: string, listener: TransportListener) {
      transport.listeners.get(channel)?.delete(listener);
    },
  },
  session: { defaultSession: { setProxy: async () => undefined } },
  BrowserWindow: {
    fromWebContents: () => {
      throw new Error("Native GUI is outside this test");
    },
  },
  dialog: {
    showOpenDialog: () => {
      throw new Error("Native GUI is outside this test");
    },
  },
  shell: {
    openPath: () => {
      throw new Error("Native GUI is outside this test");
    },
  },
}));

const imageBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=";
const requests: Array<{ pathname: string; body: unknown }> = [];
let root: string | undefined;
let server: http.Server | undefined;
let apiUrl: string;

async function respond(
  request: http.IncomingMessage,
  response: http.ServerResponse,
): Promise<void> {
  let text = "";
  for await (const chunk of request) text += String(chunk);
  const body: unknown = JSON.parse(text || "{}");
  if (typeof body !== "object" || body === null)
    throw new Error("Expected a JSON object request");
  requests.push({ pathname: request.url ?? "", body });
  if ("model" in body && body.model === "broken") {
    response.writeHead(401, { "content-type": "application/json" });
    response.end(
      JSON.stringify({ error: { message: "fixture unauthorized" } }),
    );
  } else if (request.url === "/v1/images/generations") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({ created: 1, data: [{ b64_json: imageBase64 }] }),
    );
  } else if ("stream" in body && body.stream === true) {
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.end(
      'data: {"choices":[{"delta":{"content":"fixture stream"}}]}\n\ndata: [DONE]\n\n',
    );
  } else {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({ choices: [{ message: { content: "fixture answer" } }] }),
    );
  }
}

beforeAll(async () => {
  root = fs.mkdtempSync(
    path.join(os.tmpdir(), "release-acceptance-prompts-ai-transport-"),
  );
  configureRuntimePaths({ userDataPath: root });
  registerAIIPC();
  registerImageIPC();
  vi.stubGlobal("window", { api: { ai: aiApi } });
  server = http.createServer((request, response) => {
    void respond(request, response).catch((error: unknown) =>
      response.destroy(
        error instanceof Error ? error : new Error(String(error)),
      ),
    );
  });
  const activeServer = server;
  await new Promise<void>((resolve, reject) => {
    activeServer.once("error", reject);
    activeServer.listen(0, "127.0.0.1", resolve);
  });
  const address = activeServer.address();
  if (!address || typeof address === "string")
    throw new Error("Local fixture has no TCP address");
  apiUrl = `http://127.0.0.1:${address.port}/v1`;
});

beforeEach(() => {
  if (!root) throw new Error("Media fixture root was not initialized");
  configureRuntimePaths({ userDataPath: root });
});

afterAll(async () => {
  try {
    const activeServer = server;
    if (activeServer?.listening) {
      activeServer.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        activeServer.close((error) => (error ? reject(error) : resolve())),
      );
    }
  } finally {
    transport.handlers.clear();
    transport.listeners.clear();
    vi.unstubAllGlobals();
    resetRuntimePaths();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

function config(model = "fixture"): AIConfig {
  return {
    id: model,
    type: "chat",
    provider: "openai",
    apiProtocol: "openai",
    apiKey: "fixture-only",
    apiUrl,
    model,
    chatParams: { stream: false },
  };
}

describe("Prompt AI renderer/preload/IPC with a controlled HTTP server", () => {
  it("round-trips video bytes and clears only video files in the isolated profile", async () => {
    const videoBytes = Buffer.from(
      "000000186674797069736f6d0000020069736f6d69736f32",
      "hex",
    );
    const encoded = videoBytes.toString("base64");
    expect(
      await transport.invoke(
        IPC_CHANNELS.VIDEO_SAVE_BASE64,
        "fixture.mp4",
        encoded,
      ),
    ).toBe(true);
    expect(await transport.invoke(IPC_CHANNELS.VIDEO_LIST)).toEqual([
      "fixture.mp4",
    ]);
    expect(
      await transport.invoke(IPC_CHANNELS.VIDEO_GET_SIZE, "fixture.mp4"),
    ).toBe(videoBytes.length);
    expect(
      await transport.invoke(IPC_CHANNELS.VIDEO_READ_BASE64, "fixture.mp4"),
    ).toBe(encoded);
    expect(fs.readFileSync(path.join(getVideosDir(), "fixture.mp4"))).toEqual(
      videoBytes,
    );
    expect(
      await transport.invoke(
        IPC_CHANNELS.VIDEO_SAVE_BASE64,
        "../outside.mp4",
        encoded,
      ),
    ).toBe(false);
    expect(
      await transport.invoke(
        IPC_CHANNELS.VIDEO_SAVE_BASE64,
        "invalid.mp4",
        "%%%",
      ),
    ).toBe(false);
    expect(await transport.invoke(IPC_CHANNELS.VIDEO_LIST)).toEqual([
      "fixture.mp4",
    ]);
    await transport.invoke(
      IPC_CHANNELS.IMAGE_SAVE_BASE64,
      "retained.png",
      imageBase64,
    );
    await transport.invoke(IPC_CHANNELS.VIDEO_CLEAR);
    expect(await transport.invoke(IPC_CHANNELS.VIDEO_LIST)).toEqual([]);
    expect(
      await transport.invoke(IPC_CHANNELS.VIDEO_READ_BASE64, "fixture.mp4"),
    ).toBeNull();
    expect(fs.readFileSync(path.join(getImagesDir(), "retained.png"))).toEqual(
      Buffer.from(imageBase64, "base64"),
    );
    fs.unlinkSync(path.join(getImagesDir(), "retained.png"));
  });

  it("returns non-streaming and streaming content and releases event subscriptions", async () => {
    expect(
      await chatCompletion(config(), [{ role: "user", content: "hello" }], {
        stream: false,
      }),
    ).toMatchObject({ content: "fixture answer" });
    const chunks: string[] = [];
    const result = await chatCompletion(
      config(),
      [{ role: "user", content: "stream" }],
      {
        stream: true,
        streamCallbacks: {
          onContent: (chunk) => {
            chunks.push(chunk);
          },
        },
      },
    );
    expect(result.content).toBe("fixture stream");
    expect(chunks.join("")).toContain("fixture stream");
    expect(
      [...transport.listeners.values()].map((listeners) => listeners.size),
    ).toEqual([0, 0]);
    expect(requests.slice(-2)).toEqual([
      expect.objectContaining({
        pathname: "/v1/chat/completions",
        body: expect.objectContaining({
          messages: [{ role: "user", content: "hello" }],
        }),
      }),
      expect.objectContaining({
        pathname: "/v1/chat/completions",
        body: expect.objectContaining({ stream: true }),
      }),
    ]);
  });

  it("keeps another model's answer when one HTTP provider returns an authentication error", async () => {
    const result = await multiModelCompare(
      [config(), config("broken")],
      [{ role: "user", content: "compare" }],
    );
    expect(result.results).toMatchObject([
      { id: "fixture", success: true, response: "fixture answer" },
      {
        id: "broken",
        success: false,
        error: expect.stringContaining("fixture unauthorized"),
      },
    ]);
    expect(result.results).toHaveLength(2);
  });

  it("returns the provider image bytes through the real OpenAI-compatible adapter", async () => {
    const result = await generateImage(
      { ...config(), type: "image", model: "gpt-image-1" },
      "one pixel",
    );
    expect(result.data).toEqual([{ b64_json: imageBase64 }]);
    expect(requests.at(-1)).toMatchObject({
      pathname: "/v1/images/generations",
      body: { prompt: "one pixel", model: "gpt-image-1" },
    });
  });

  it("persists media bytes and rejects traversal and invalid payloads without partial files", async () => {
    const invoke = transport.invoke;
    await invoke(IPC_CHANNELS.IMAGE_SAVE_BASE64, "fixture.png", imageBase64);
    const imagesDir = getImagesDir();
    expect(fs.readFileSync(path.join(imagesDir, "fixture.png"))).toEqual(
      Buffer.from(imageBase64, "base64"),
    );
    expect(await invoke(IPC_CHANNELS.IMAGE_READ_BASE64, "fixture.png")).toBe(
      imageBase64,
    );
    expect(
      await invoke(
        IPC_CHANNELS.IMAGE_SAVE_BASE64,
        "../escape.png",
        imageBase64,
      ),
    ).toBe(false);
    expect(
      await invoke(IPC_CHANNELS.IMAGE_SAVE_BASE64, "invalid.png", "%%%"),
    ).toBe(false);
    expect(fs.readdirSync(imagesDir)).toEqual(["fixture.png"]);
    expect(
      fs.existsSync(path.join(path.dirname(imagesDir), "escape.png")),
    ).toBe(false);
    expect(
      await invoke(IPC_CHANNELS.IMAGE_READ_BASE64, "missing.png"),
    ).toBeNull();
    expect(await invoke(IPC_CHANNELS.IMAGE_READ_BASE64, "fixture.png")).toBe(
      imageBase64,
    );
  });
});
