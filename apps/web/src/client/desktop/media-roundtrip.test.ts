// @vitest-environment node
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CreatePromptDTO, Prompt } from "@prompthub/shared/types";
import type { createApp } from "../../app";
import { issueSolvedCaptcha } from "../../test-helpers/auth-captcha";

// Keep Node's crypto/typed-array realm for real JWT signing; only DOM APIs are substituted.
const {
  JSDOM,
}: {
  JSDOM: new (
    html: string,
    options: { url: string },
  ) => { window: Window & typeof globalThis };
} = createRequire(import.meta.url)("jsdom");
let dom: InstanceType<typeof JSDOM>;

interface MediaBridge {
  saveImageBuffer(buffer: ArrayBuffer): Promise<string>;
  selectImage(): Promise<string[]>;
  selectVideo(): Promise<string[]>;
  readImageBase64(name: string): Promise<string>;
  listImages(): Promise<string[]>;
}

interface PromptBridge {
  prompt: {
    create(input: CreatePromptDTO): Promise<Prompt>;
    get(id: string): Promise<Prompt>;
  };
}

let root: string;
let app: ReturnType<typeof createApp>;
let closeDatabase: () => void;
let media: MediaBridge;
let api: PromptBridge;
let token: string;

async function openServer(): Promise<void> {
  const db = await import("@prompthub/db");
  closeDatabase = db.closeDatabase;
  app = (await import("../../app")).createApp();
}

beforeEach(async () => {
  vi.resetModules();
  dom = new JSDOM("", { url: "http://local" });
  for (const key of [
    "window",
    "document",
    "navigator",
    "HTMLInputElement",
    "Event",
    "File",
  ]) {
    vi.stubGlobal(key, Reflect.get(dom.window, key));
  }
  root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-media-bridge-"));
  vi.stubEnv("DATA_ROOT", root);
  vi.stubEnv("JWT_SECRET", "media-bridge-regression-test-secret-107");
  vi.stubEnv("ALLOW_REGISTRATION", "true");
  await openServer();
  const captcha = await issueSolvedCaptcha(app);
  const registration = await app.request("http://local/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "media107",
      password: "fixture-password-107",
      ...captcha,
    }),
  });
  expect(registration.status).toBe(201);
  const payload = await registration.json();
  token = payload.data.accessToken;
  // Only HTTP delivery is substituted; authentication, routes, SQL and files are real.
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      return app.request(new Request(new URL(url, "http://local"), init));
    },
  );
  const { storeAuthSession } = await import("../api/auth-session");
  storeAuthSession(token, payload.data.refreshToken);
  (await import("./install-bridge")).installDesktopBridge();
  // These bridges are installed dynamically, outside the Web Window declaration.
  media = Reflect.get(window, "electron") as MediaBridge;
  api = Reflect.get(window, "api") as PromptBridge;
});

afterEach(() => {
  closeDatabase?.();
  vi.restoreAllMocks();
  dom?.window.close();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  if (root) fs.rmSync(root, { recursive: true, force: true });
});

it.each([false, true])(
  "#107 retains uploaded clipboard bytes and Prompt references after reopen (UUID unavailable: %s)",
  async (withoutUUID) => {
    if (withoutUUID)
      vi.stubGlobal("crypto", {
        subtle: globalThis.crypto.subtle,
        getRandomValues: globalThis.crypto.getRandomValues.bind(
          globalThis.crypto,
        ),
      });
    const bytes = new Uint8Array([137, 80, 78, 71, 0, 128, 255]);
    const fileName = await media.saveImageBuffer(bytes.buffer);
    expect(await media.listImages()).toEqual([fileName]);
    expect(await media.readImageBase64(fileName)).toBe(
      Buffer.from(bytes).toString("base64"),
    );
    const prompt = await api.prompt.create({
      title: "Clipboard media",
      userPrompt: "Describe this",
      images: [fileName],
    });
    closeDatabase();
    vi.resetModules();
    await openServer();
    expect((await api.prompt.get(prompt.id)).images).toEqual([fileName]);
    expect(await media.readImageBase64(fileName)).toBe(
      Buffer.from(bytes).toString("base64"),
    );
    expect(await media.listImages()).toEqual([fileName]);
  },
);

it.each(["images", "videos"] as const)(
  "#107 file selection retains the stored %s name and bytes",
  async (kind) => {
    const bytes = new Uint8Array([0, 128, 255, 42]);
    const name = kind === "images" ? "selected.png" : "selected.mp4";
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(
      function (this: HTMLInputElement) {
        const file = new File([bytes], name);
        // jsdom models selection, not the native picker or File.arrayBuffer implementation.
        Object.defineProperty(file, "arrayBuffer", {
          value: async () => bytes.buffer,
        });
        Object.defineProperty(this, "files", { value: [file] });
        this.dispatchEvent(new Event("change"));
      },
    );
    const names = await (kind === "images"
      ? media.selectImage()
      : media.selectVideo());
    expect(names).toHaveLength(1);
    expect(names[0]).not.toBe(name);
    expect(document.querySelectorAll('input[type="file"]')).toHaveLength(0);
    const response = await app.request(
      `http://local/api/media/${kind}/${names[0]}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(
      Buffer.from(bytes),
    );
  },
);

it("#107 rejects failed clipboard uploads without changing existing media or Prompt references", async () => {
  const bytes = new Uint8Array([1, 2, 255]);
  const fileName = await media.saveImageBuffer(bytes.buffer);
  const prompt = await api.prompt.create({
    title: "Existing media",
    userPrompt: "Keep this",
    images: [fileName],
  });
  await expect(media.saveImageBuffer(new ArrayBuffer(0))).rejects.toThrow();
  expect(await media.listImages()).toEqual([fileName]);
  expect((await api.prompt.get(prompt.id)).images).toEqual([fileName]);
  expect(await media.readImageBase64(fileName)).toBe(
    Buffer.from(bytes).toString("base64"),
  );
});
