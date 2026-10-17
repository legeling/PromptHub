import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { initDatabase, closeDatabase, SettingsDB } from "@prompthub/db";
import { createNotificationManager } from "../../src/main/notification-manager";
import { normalizeNotificationPreferences } from "@prompthub/shared/utils/notifications";

const roots: string[] = [];
afterEach(() => {
  closeDatabase();
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

it("reads persisted delivery preferences, suppresses foreground desktop alerts and deduplicates updates across reopen", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-notification-manager-"),
  );
  roots.push(root);
  const filename = path.join(root, "settings.db");
  let settings = new SettingsDB(initDatabase(filename));
  const prefs = normalizeNotificationPreferences(undefined);
  settings.set({ notificationPreferences: prefs, enableNotifications: true });
  let focused = true;
  const system = vi.fn().mockResolvedValue(true);
  const inApp = vi.fn();
  const create = () =>
    createNotificationManager({
      readSetting: (key) => settings.get(key),
      writeSetting: (key, value) => settings.set({ [key]: value }),
      isForeground: () => focused,
      format: (event) => ({ event, title: "PromptHub", body: "Task finished" }),
      showSystem: system,
      showInApp: inApp,
    });
  let manager = create();
  await expect(
    manager.publish({
      category: "promptTest",
      outcome: "success",
      id: "single-1",
    }),
  ).resolves.toBe("inApp");
  expect(system).not.toHaveBeenCalled();
  expect(inApp).toHaveBeenCalledOnce();
  focused = false;
  const event = {
    category: "appUpdate",
    outcome: "available",
    id: "0.7.0",
  } as const;
  await expect(manager.publish(event)).resolves.toBe("system");
  expect(system).toHaveBeenCalledOnce();
  closeDatabase();
  settings = new SettingsDB(initDatabase(filename));
  manager = create();
  await expect(manager.publish(event)).resolves.toBe("off");
  prefs.delivery.promptTest = "off";
  settings.set({ notificationPreferences: prefs });
  await expect(
    manager.publish({
      category: "promptTest",
      outcome: "error",
      id: "compare-1",
    }),
  ).resolves.toBe("off");
  expect(system).toHaveBeenCalledOnce();
});

it("falls back to in-app feedback on native failure and never publishes private error text", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const inApp = vi.fn();
  const manager = createNotificationManager({
    readSetting: () => undefined,
    writeSetting: () => undefined,
    isForeground: () => false,
    format: (event) => ({ event, title: "PromptHub", body: "Task failed" }),
    showSystem: async () => {
      throw new Error("native unavailable");
    },
    showInApp: inApp,
  });
  try {
    await expect(
      manager.publish({ category: "promptTest", outcome: "error", id: "1" }),
    ).resolves.toBe("inApp");
    expect(inApp).toHaveBeenCalledWith(
      expect.objectContaining({ body: "Task failed" }),
    );
  } finally {
    error.mockRestore();
  }
});

it("coalesces concurrent deliveries, cools down repeated sync errors and respects inline diagnostics", async () => {
  let now = 0;
  let finish: (value: boolean) => void = () => undefined;
  const inApp = vi.fn();
  const system = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
  );
  const manager = createNotificationManager({
    readSetting: () => undefined,
    writeSetting: () => undefined,
    isForeground: () => false,
    format: (event) => ({ event, title: "PromptHub", body: "Task failed" }),
    showSystem: system,
    showInApp: inApp,
    now: () => now,
  });
  const event = {
    category: "syncFailure",
    outcome: "error",
    id: "webdav",
    inAppHandled: true,
  } as const;
  const first = manager.publish(event);
  await expect(manager.publish(event)).resolves.toBe("off");
  finish(false);
  await first;
  expect(inApp).not.toHaveBeenCalled();
  await expect(manager.publish(event)).resolves.toBe("off");
  now = 600_001;
  const next = manager.publish(event);
  finish(true);
  await expect(next).resolves.toBe("system");
  expect(system).toHaveBeenCalledTimes(2);
});
