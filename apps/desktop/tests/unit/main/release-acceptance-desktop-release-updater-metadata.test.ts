/** @vitest-environment node */
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const transport = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  get: vi.fn(),
}));
const nativeUpdater = vi.hoisted(() => ({
  checkForUpdates: vi.fn<() => Promise<unknown>>(),
  setFeedURL: vi.fn(),
}));

vi.mock("electron", () => ({
  app: { isPackaged: true, getVersion: () => "1.0.0" },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      transport.handlers.set(channel, handler);
    },
    removeHandler: (channel: string) => transport.handlers.delete(channel),
  },
}));
vi.mock("electron-updater", () => ({ autoUpdater: nativeUpdater }));
vi.mock("https", () => ({ default: { get: transport.get } }));
vi.mock("../../../src/main/services/network-proxy", () => ({
  getHttpRequestAgent: vi.fn(),
}));
vi.mock("../../../src/main/services/upgrade-backup", () => ({
  createUpgradeDataSnapshot: vi.fn(),
}));

import { registerUpdaterIPC } from "../../../src/main/updater";

class MetadataResponse extends EventEmitter {
  setEncoding = vi.fn();

  constructor(readonly statusCode: number) {
    super();
  }
}

class MetadataRequest extends EventEmitter {
  // The test emits an explicit outcome without opening a socket or a timer.
  setTimeout = vi.fn();

  destroy(error: Error): void {
    this.emit("error", error);
  }
}

function respondWith(body: string, statusCode = 200): void {
  transport.get.mockImplementationOnce(
    (_options: unknown, onResponse: (response: MetadataResponse) => void) => {
      const request = new MetadataRequest();
      queueMicrotask(() => {
        const response = new MetadataResponse(statusCode);
        onResponse(response);
        const midpoint = Math.floor(body.length / 2);
        response.emit("data", body.slice(0, midpoint));
        response.emit("data", body.slice(midpoint));
        response.emit("end");
      });
      return request;
    },
  );
}

async function checkPreview(): Promise<unknown> {
  const handler = transport.handlers.get("updater:check");
  if (!handler) throw new Error("Updater check IPC was not registered");
  return handler({}, { source: "official", channel: "preview" });
}

const releaseBody = JSON.stringify([
  { tag_name: "v9.0.0", draft: false, prerelease: false },
  { tag_name: "v2.0.0-beta.1", draft: true, prerelease: true },
  { tag_name: "v1.1.0-beta.2", draft: false, prerelease: true },
]);
const updateInfo = {
  version: "9.0.0",
  files: [],
  releaseDate: "2026-10-01T00:00:00.000Z",
};

describe("release acceptance: updater metadata at the registered IPC boundary", () => {
  beforeEach(() => {
    transport.handlers.clear();
    transport.get.mockReset();
    nativeUpdater.setFeedURL.mockReset();
    nativeUpdater.checkForUpdates.mockReset();
    registerUpdaterIPC();
  });

  afterEach(() => {
    transport.handlers.clear();
    vi.restoreAllMocks();
  });

  it.each([true, false])(
    "returns the consumed native version and updateAvailable=%s after preview metadata selection",
    async (isUpdateAvailable) => {
      respondWith(releaseBody);
      const nativeResult = { updateInfo, isUpdateAvailable };
      nativeUpdater.checkForUpdates.mockResolvedValueOnce(nativeResult);

      expect(await checkPreview()).toEqual({
        success: true,
        updateAvailable: isUpdateAvailable,
        result: nativeResult,
      });
      expect(nativeUpdater.setFeedURL).toHaveBeenCalledWith({
        provider: "generic",
        channel: undefined,
        url: "https://github.com/legeling/PromptHub/releases/download/v9.0.0",
      });
      expect(nativeUpdater.checkForUpdates).toHaveBeenCalledOnce();
    },
  );

  it("returns a failed check on HTTP failure and can check successfully after recovery", async () => {
    respondWith("Unavailable", 503);

    expect(await checkPreview()).toEqual({
      success: false,
      error: "Preview release lookup failed with HTTP 503",
    });
    expect(nativeUpdater.setFeedURL).not.toHaveBeenCalled();
    expect(nativeUpdater.checkForUpdates).not.toHaveBeenCalled();

    respondWith(releaseBody);
    nativeUpdater.checkForUpdates.mockResolvedValueOnce({
      updateInfo,
      isUpdateAvailable: true,
    });
    expect(await checkPreview()).toEqual({
      success: true,
      updateAvailable: true,
      result: { updateInfo, isUpdateAvailable: true },
    });
  });

  it("returns a failed check for a transport error instead of claiming no update", async () => {
    transport.get.mockImplementationOnce(() => {
      const request = new MetadataRequest();
      queueMicrotask(() => request.emit("error", new Error("fixture offline")));
      return request;
    });

    expect(await checkPreview()).toEqual({
      success: false,
      error: "fixture offline",
    });
    expect(nativeUpdater.checkForUpdates).not.toHaveBeenCalled();
  });

  it("rejects malformed metadata without forwarding a candidate to the native updater", async () => {
    respondWith("not JSON");

    expect(await checkPreview()).toEqual({
      success: false,
      error: expect.stringMatching(/JSON/),
    });
    expect(nativeUpdater.setFeedURL).not.toHaveBeenCalled();
    expect(nativeUpdater.checkForUpdates).not.toHaveBeenCalled();
  });

  it("fails explicitly when metadata has no published version candidate", async () => {
    respondWith(
      JSON.stringify([{ tag_name: "v2.0.0", prerelease: false, draft: true }]),
    );

    expect(await checkPreview()).toEqual({
      success: false,
      error:
        "Update check failed: No published release is currently available for preview updates.",
    });
    expect(nativeUpdater.checkForUpdates).not.toHaveBeenCalled();
  });

  it("returns the native manifest check failure without reporting a successful check", async () => {
    respondWith(releaseBody);
    nativeUpdater.checkForUpdates.mockRejectedValueOnce(
      new Error("fixture manifest invalid"),
    );
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(await checkPreview()).toEqual({
      success: false,
      error: "Update check failed: fixture manifest invalid",
    });
    expect(nativeUpdater.checkForUpdates).toHaveBeenCalledOnce();
  });
});
