import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import {
  getInstallScopedDataPath,
  hasExistingAppData,
  isDefaultPerUserInstallDir,
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
    const appDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-appdata-"));
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

  it("uses install-dir data for fresh packaged Windows installs outside protected folders", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-fresh-"));
    tempDirs.push(rootDir);

    const expectedPath = path.win32.join("D:\\toolkits\\PromptHub", "data");

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
          hasExistingAppData: () => false,
          isPathWritable: () => true,
        },
      ),
    ).toBe(expectedPath);
  });

  it("falls back to default userData for default per-user Windows install locations", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-per-user-"));
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
    expect(
      isProtectedInstallDir("C:\\Program Files\\PromptHub", "win32"),
    ).toBe(true);
    expect(
      getInstallScopedDataPath(
        "C:\\Program Files\\PromptHub\\PromptHub.exe",
        "win32",
        true,
      ),
    ).toBeNull();
  });

  it("detects existing app data markers", () => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-data-"));
    tempDirs.push(userDataDir);

    expect(hasExistingAppData(userDataDir)).toBe(false);
    fs.mkdirSync(path.join(userDataDir, "skills"), { recursive: true });
    expect(hasExistingAppData(userDataDir)).toBe(true);
  });
});
