import { beforeEach, describe, expect, it, vi } from "vitest";

import { installWindowMocks } from "../../helpers/window";
import {
  AUTO_SYNC_HISTORY_LIMIT,
  normalizeAutoSyncHistory,
  recordAutoSyncHistory,
} from "../../../src/renderer/services/sync-history";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";

describe("sync-history", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    useSettingsStore.setState({ autoSyncHistory: [] });
  });

  it("normalizes automatic and manual sync history entries", () => {
    const history = normalizeAutoSyncHistory([
      {
        id: "ok",
        provider: "webdav",
        reason: "startup",
        status: "success",
        startedAt: "2026-07-01T00:00:00.000Z",
        finishedAt: "2026-07-01T00:00:01.000Z",
        message: "synced",
        localChanged: true,
      },
      {
        id: "manual",
        provider: "webdav",
        reason: "manual",
        status: "success",
        startedAt: "2026-07-01T00:00:00.000Z",
        finishedAt: "2026-07-01T00:00:01.000Z",
        message: "manual backup",
      },
      {
        provider: "manual",
        reason: "manual",
        status: "success",
        startedAt: "2026-07-01T00:00:00.000Z",
        finishedAt: "2026-07-01T00:00:01.000Z",
        message: "invalid provider",
      },
      null,
      "bad",
    ]);

    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({
      id: "ok",
      provider: "webdav",
      reason: "startup",
      status: "success",
      message: "synced",
      localChanged: true,
    });
    expect(history[1]).toMatchObject({
      id: "manual",
      provider: "webdav",
      reason: "manual",
      message: "manual backup",
    });
  });

  it("records a bounded sanitized automatic sync history entry", async () => {
    const setSettings = vi.fn().mockResolvedValue(undefined);
    const appendAutoSyncLog = vi.fn().mockResolvedValue({ success: true });
    const existing = Array.from(
      { length: AUTO_SYNC_HISTORY_LIMIT },
      (_, index) => ({
        id: `old-${index}`,
        provider: "s3",
        reason: "interval",
        status: "success",
        startedAt: "2026-07-01T00:00:00.000Z",
        finishedAt: "2026-07-01T00:00:01.000Z",
        message: `old ${index}`,
      }),
    );
    installWindowMocks({
      api: {
        settings: {
          get: vi.fn().mockResolvedValue({ autoSyncHistory: existing }),
          set: setSettings,
        },
      },
      electron: {
        appendAutoSyncLog,
      },
    });

    const entry = await recordAutoSyncHistory({
      provider: "self-hosted",
      reason: "startup-resume",
      status: "failed",
      message:
        "Failed to reach https://example.com/sync/data for owner@example.com",
    });

    expect(entry?.message).toBe("Failed to reach [url] for [email]");
    expect(setSettings).toHaveBeenCalledTimes(1);
    const payload = setSettings.mock.calls[0][0] as {
      autoSyncHistory: Array<{ message: string }>;
    };
    expect(payload.autoSyncHistory).toHaveLength(AUTO_SYNC_HISTORY_LIMIT);
    expect(payload.autoSyncHistory[0].message).toBe(
      "Failed to reach [url] for [email]",
    );
    expect(payload.autoSyncHistory.at(-1)?.message).toBe("old 18");
    expect(appendAutoSyncLog).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "self-hosted",
        reason: "startup-resume",
        status: "failed",
        message: "Failed to reach [url] for [email]",
      }),
    );
  });

  it("updates the durable and live automatic sync history", async () => {
    const setSettings = vi.fn().mockResolvedValue(undefined);
    installWindowMocks({
      api: {
        settings: {
          get: vi.fn().mockResolvedValue({ autoSyncHistory: [] }),
          set: setSettings,
        },
      },
      electron: {
        appendAutoSyncLog: vi.fn().mockResolvedValue({ success: true }),
      },
    });

    await recordAutoSyncHistory({
      provider: "webdav",
      reason: "startup-resume",
      status: "success",
      message: "uploaded",
    });

    expect(setSettings).toHaveBeenCalledWith({
      autoSyncHistory: [
        expect.objectContaining({
          provider: "webdav",
          reason: "startup-resume",
          status: "success",
          message: "uploaded",
        }),
      ],
    });
    expect(useSettingsStore.getState().autoSyncHistory).toEqual([
      expect.objectContaining({
        provider: "webdav",
        reason: "startup-resume",
        status: "success",
      }),
    ]);
  });
});
