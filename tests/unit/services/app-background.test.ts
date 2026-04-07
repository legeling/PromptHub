import { describe, expect, it } from "vitest";
import {
  hasValidWebDAVConfig,
  shouldRunBackgroundUpdateCheck,
  shouldRunPeriodicWebDAVSync,
  shouldRunStartupWebDAVSync,
} from "../../../src/renderer/services/app-background";

const baseSettings = {
  webdavEnabled: true,
  webdavUrl: "https://example.com/dav",
  webdavUsername: "user",
  webdavPassword: "pass",
  webdavSyncOnStartup: true,
  webdavAutoSyncInterval: 15,
};

describe("app-background", () => {
  it("validates required WebDAV configuration", () => {
    expect(hasValidWebDAVConfig(baseSettings)).toBe(true);
    expect(
      hasValidWebDAVConfig({
        ...baseSettings,
        webdavPassword: "",
      }),
    ).toBe(false);
  });

  it("runs update checks only when visible, online, and idle", () => {
    expect(
      shouldRunBackgroundUpdateCheck(true, {
        isVisible: true,
        isOnline: true,
        isRunning: false,
      }),
    ).toBe(true);

    expect(
      shouldRunBackgroundUpdateCheck(true, {
        isVisible: false,
        isOnline: true,
        isRunning: false,
      }),
    ).toBe(false);

    expect(
      shouldRunBackgroundUpdateCheck(true, {
        isVisible: true,
        isOnline: false,
        isRunning: false,
      }),
    ).toBe(false);
  });

  it("blocks WebDAV sync while hidden or already running", () => {
    expect(
      shouldRunStartupWebDAVSync(baseSettings, {
        isVisible: true,
        isOnline: true,
        isRunning: false,
      }),
    ).toBe(true);

    expect(
      shouldRunStartupWebDAVSync(baseSettings, {
        isVisible: false,
        isOnline: true,
        isRunning: false,
      }),
    ).toBe(false);

    expect(
      shouldRunPeriodicWebDAVSync(baseSettings, {
        isVisible: true,
        isOnline: true,
        isRunning: true,
      }),
    ).toBe(false);
  });

  it("requires a positive interval for periodic WebDAV sync", () => {
    expect(
      shouldRunPeriodicWebDAVSync(
        {
          ...baseSettings,
          webdavAutoSyncInterval: 0,
        },
        {
          isVisible: true,
          isOnline: true,
          isRunning: false,
        },
      ),
    ).toBe(false);
  });
});
