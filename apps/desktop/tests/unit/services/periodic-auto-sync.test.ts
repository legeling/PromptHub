import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  registerPeriodicAutoSyncController,
  type PeriodicAutoSyncController,
  type PeriodicAutoSyncSettings,
} from "../../../src/renderer/services/periodic-auto-sync";

function createSettingsHarness(initial: PeriodicAutoSyncSettings) {
  let settings = initial;
  const listeners = new Set<
    (state: PeriodicAutoSyncSettings, previous: PeriodicAutoSyncSettings) => void
  >();

  return {
    getSettings: () => settings,
    setSettings: (next: PeriodicAutoSyncSettings) => {
      const previous = settings;
      settings = next;
      listeners.forEach((listener) => listener(settings, previous));
    },
    subscribe: (
      listener: (
        state: PeriodicAutoSyncSettings,
        previous: PeriodicAutoSyncSettings,
      ) => void,
    ) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const manualSettings: PeriodicAutoSyncSettings = {
  syncProvider: "manual",
  webdavEnabled: false,
  webdavUrl: "",
  webdavUsername: "",
  webdavPassword: "",
  webdavSyncOnStartup: false,
  webdavAutoSyncInterval: 0,
  selfHostedSyncEnabled: false,
  selfHostedSyncUrl: "",
  selfHostedSyncUsername: "",
  selfHostedSyncPassword: "",
  selfHostedSyncOnStartup: false,
  selfHostedAutoSyncInterval: 0,
  s3StorageEnabled: false,
  s3Endpoint: "",
  s3Region: "",
  s3Bucket: "",
  s3AccessKeyId: "",
  s3SecretAccessKey: "",
  s3SyncOnStartup: false,
  s3AutoSyncInterval: 0,
};

describe("periodic auto sync controller", () => {
  const controllers: PeriodicAutoSyncController[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    controllers.splice(0).forEach((controller) => controller.dispose());
    vi.useRealTimers();
  });

  it("starts periodic S3 upload scheduling when settings become valid after app startup", async () => {
    const harness = createSettingsHarness(manualSettings);
    const runS3 = vi.fn();

    controllers.push(
      registerPeriodicAutoSyncController({
        getSettings: harness.getSettings,
        subscribe: harness.subscribe,
        runWebDAV: vi.fn(),
        runS3,
        runSelfHosted: vi.fn(),
      }),
    );

    harness.setSettings({
      ...manualSettings,
      syncProvider: "s3",
      s3StorageEnabled: true,
      s3Endpoint: "https://s3.example.com",
      s3Region: "us-east-1",
      s3Bucket: "prompthub-backups",
      s3AccessKeyId: "access",
      s3SecretAccessKey: "secret",
      s3AutoSyncInterval: 0.001,
    });

    await vi.advanceTimersByTimeAsync(59);
    expect(runS3).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(runS3).toHaveBeenCalledTimes(1);

  });

  it("clears the previous provider interval when the active sync provider changes", async () => {
    const harness = createSettingsHarness({
      ...manualSettings,
      syncProvider: "webdav",
      webdavEnabled: true,
      webdavUrl: "https://dav.example.com",
      webdavUsername: "user",
      webdavPassword: "pass",
      webdavAutoSyncInterval: 0.001,
    });
    const runWebDAV = vi.fn();
    const runS3 = vi.fn();

    controllers.push(
      registerPeriodicAutoSyncController({
        getSettings: harness.getSettings,
        subscribe: harness.subscribe,
        runWebDAV,
        runS3,
        runSelfHosted: vi.fn(),
      }),
    );

    harness.setSettings({
      ...manualSettings,
      syncProvider: "s3",
      s3StorageEnabled: true,
      s3Endpoint: "https://s3.example.com",
      s3Region: "us-east-1",
      s3Bucket: "prompthub-backups",
      s3AccessKeyId: "access",
      s3SecretAccessKey: "secret",
      s3AutoSyncInterval: 0.001,
    });

    await vi.advanceTimersByTimeAsync(60);

    expect(runWebDAV).not.toHaveBeenCalled();
    expect(runS3).toHaveBeenCalledTimes(1);
  });

  it("stops periodic upload scheduling when the active interval is disabled", async () => {
    const harness = createSettingsHarness({
      ...manualSettings,
      syncProvider: "s3",
      s3StorageEnabled: true,
      s3Endpoint: "https://s3.example.com",
      s3Region: "us-east-1",
      s3Bucket: "prompthub-backups",
      s3AccessKeyId: "access",
      s3SecretAccessKey: "secret",
      s3AutoSyncInterval: 0.001,
    });
    const runS3 = vi.fn();

    controllers.push(
      registerPeriodicAutoSyncController({
        getSettings: harness.getSettings,
        subscribe: harness.subscribe,
        runWebDAV: vi.fn(),
        runS3,
        runSelfHosted: vi.fn(),
      }),
    );

    harness.setSettings({
      ...harness.getSettings(),
      s3AutoSyncInterval: 0,
    });

    await vi.advanceTimersByTimeAsync(120);

    expect(runS3).not.toHaveBeenCalled();
  });
});
