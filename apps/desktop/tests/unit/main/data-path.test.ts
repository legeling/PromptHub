import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import {
  getInstallScopedDataPath,
  hasExistingAppData,
  isDefaultPerUserInstallDir,
  isPathWritable,
  isProtectedInstallDir,
  readConfiguredDataPath,
  resolveInitialUserDataPath,
  writeConfiguredDataPath,
} from "../../../src/main/data-path";

describe("data path bootstrap", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("prefers persisted data path config when present", () => {
    const appDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-appdata-"),
    );
    tempDirs.push(appDataDir);

    const configuredPath = path.join(appDataDir, "external-data");
    writeConfiguredDataPath(appDataDir, configuredPath);

    expect(readConfiguredDataPath(appDataDir)).toBe(configuredPath);
    expect(
      resolveInitialUserDataPath({
        appDataPath: appDataDir,
        defaultUserDataPath: path.join(appDataDir, "PromptHub"),
        exePath: "C:\\toolkits\\PromptHub\\PromptHub.exe",
        isPackaged: true,
        platform: "win32",
      }),
    ).toBe(configuredPath);
  });

  it("keeps existing legacy userData for existing installs", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-legacy-"));
    tempDirs.push(rootDir);

    const legacyUserData = path.join(rootDir, "legacy");
    fs.mkdirSync(legacyUserData, { recursive: true });
    fs.writeFileSync(path.join(legacyUserData, "prompthub.db"), "", "utf8");

    expect(
      resolveInitialUserDataPath({
        appDataPath: path.join(rootDir, "appdata"),
        defaultUserDataPath: legacyUserData,
        exePath: "C:\\toolkits\\PromptHub\\PromptHub.exe",
        isPackaged: true,
        platform: "win32",
      }),
    ).toBe(legacyUserData);
  });

  it("uses install-dir data when install-scoped path already has user data", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-scoped-"));
    tempDirs.push(rootDir);

    const expectedPath = path.win32.join("D:\\toolkits\\PromptHub", "data");

    // Simulate: defaultUserDataPath has no data, install-scoped path has data
    const hasExistingAppDataMock = (targetPath: string): boolean =>
      targetPath === expectedPath;

    expect(
      resolveInitialUserDataPath(
        {
          appDataPath: path.join(rootDir, "appdata"),
          defaultUserDataPath: path.join(rootDir, "PromptHub"),
          exePath: "D:\\toolkits\\PromptHub\\PromptHub.exe",
          isPackaged: true,
          platform: "win32",
        },
        {
          readConfiguredDataPath: () => null,
          hasExistingAppData: hasExistingAppDataMock,
          isPathWritable: () => true,
        },
      ),
    ).toBe(expectedPath);
  });

  it("falls back to defaultUserDataPath when install-scoped path has no existing data (upgrade protection)", () => {
    const rootDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-upgrade-"),
    );
    tempDirs.push(rootDir);

    const defaultUserDataPath = path.join(rootDir, "PromptHub");

    // Simulate: neither path has data (fresh install scenario or upgrade from
    // old version where defaultUserDataPath was the only location).
    // With the upgrade protection fix, the resolver should NOT pick the
    // install-scoped path just because the install directory is writable.
    expect(
      resolveInitialUserDataPath(
        {
          appDataPath: path.join(rootDir, "appdata"),
          defaultUserDataPath,
          exePath: "D:\\toolkits\\PromptHub\\PromptHub.exe",
          isPackaged: true,
          platform: "win32",
        },
        {
          readConfiguredDataPath: () => null,
          hasExistingAppData: () => false,
          isPathWritable: () => true,
        },
      ),
    ).toBe(defaultUserDataPath);
  });

  it("falls back to default userData for default per-user Windows install locations", () => {
    const rootDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-per-user-"),
    );
    tempDirs.push(rootDir);

    const defaultUserDataPath = path.join(rootDir, "PromptHub");

    expect(
      isDefaultPerUserInstallDir(
        "C:\\Users\\Alice\\AppData\\Local\\Programs\\PromptHub",
        "win32",
      ),
    ).toBe(true);

    expect(
      resolveInitialUserDataPath(
        {
          appDataPath: path.join(rootDir, "appdata"),
          defaultUserDataPath,
          exePath:
            "C:\\Users\\Alice\\AppData\\Local\\Programs\\PromptHub\\PromptHub.exe",
          isPackaged: true,
          platform: "win32",
        },
        {
          readConfiguredDataPath: () => null,
          hasExistingAppData: () => false,
          isPathWritable: () => true,
        },
      ),
    ).toBe(defaultUserDataPath);
  });

  it("falls back to default userData for protected install locations", () => {
    expect(isProtectedInstallDir("C:\\Program Files\\PromptHub", "win32")).toBe(
      true,
    );
    expect(
      getInstallScopedDataPath(
        "C:\\Program Files\\PromptHub\\PromptHub.exe",
        "win32",
        true,
      ),
    ).toBeNull();
  });

  it("detects existing app data markers", () => {
    const userDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-data-"),
    );
    tempDirs.push(userDataDir);

    expect(hasExistingAppData(userDataDir)).toBe(false);
    fs.mkdirSync(path.join(userDataDir, "skills"), { recursive: true });
    expect(hasExistingAppData(userDataDir)).toBe(true);
  });

  it("detects existing renderer storage markers", () => {
    const userDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-renderer-data-"),
    );
    tempDirs.push(userDataDir);

    fs.mkdirSync(path.join(userDataDir, "IndexedDB"), { recursive: true });
    expect(hasExistingAppData(userDataDir)).toBe(true);
  });

  it("detects existing workspace markers", () => {
    const userDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-workspace-data-"),
    );
    tempDirs.push(userDataDir);

    fs.mkdirSync(path.join(userDataDir, "workspace"), { recursive: true });
    expect(hasExistingAppData(userDataDir)).toBe(true);
  });

  describe("isPathWritable", () => {
    it("returns true for an existing writable directory", () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-writable-"));
      tempDirs.push(dir);
      expect(isPathWritable(dir)).toBe(true);
    });

    it("returns false for a non-existent directory without creating it", () => {
      const dir = path.join(os.tmpdir(), `prompthub-nonexist-${Date.now()}`);
      expect(isPathWritable(dir)).toBe(false);
      // Verify the directory was NOT created as a side effect
      expect(fs.existsSync(dir)).toBe(false);
    });
  });

  describe("upgrade scenario: old version to v0.5.0", () => {
    it("does not redirect data to install-scoped path when existing data is in defaultUserDataPath", () => {
      const rootDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "prompthub-old-upgrade-"),
      );
      tempDirs.push(rootDir);

      const defaultUserDataPath = path.join(
        rootDir,
        "AppData",
        "Roaming",
        "PromptHub",
      );
      fs.mkdirSync(defaultUserDataPath, { recursive: true });
      fs.writeFileSync(
        path.join(defaultUserDataPath, "prompthub.db"),
        "data",
        "utf8",
      );

      // Custom install dir is writable but has no data
      const installDir = path.join(rootDir, "D_toolkits", "PromptHub");
      fs.mkdirSync(installDir, { recursive: true });

      expect(
        resolveInitialUserDataPath({
          appDataPath: path.join(rootDir, "AppData", "Roaming"),
          defaultUserDataPath,
          exePath: path.join(installDir, "PromptHub.exe"),
          isPackaged: true,
          platform: "win32",
        }),
      ).toBe(defaultUserDataPath);
    });

    it("prefers defaultUserDataPath even when install dir is writable and no data-path.json exists", () => {
      const rootDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "prompthub-nodatajson-"),
      );
      tempDirs.push(rootDir);

      const defaultUserDataPath = path.join(rootDir, "PromptHub");
      // No data in either location, no data-path.json
      // This simulates a clean install with a custom install dir
      // Result: should use defaultUserDataPath (safe default), not create
      // an empty data dir next to the exe

      expect(
        resolveInitialUserDataPath(
          {
            appDataPath: path.join(rootDir, "appdata"),
            defaultUserDataPath,
            exePath: "E:\\Apps\\PromptHub\\PromptHub.exe",
            isPackaged: true,
            platform: "win32",
          },
          {
            readConfiguredDataPath: () => null,
            hasExistingAppData: () => false,
            isPathWritable: () => true,
          },
        ),
      ).toBe(defaultUserDataPath);
    });
  });
});
