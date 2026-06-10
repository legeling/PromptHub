import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import {
  copyDataPathItem,
  getHistoricalDefaultUserDataPath,
  getInstallScopedDataPath,
  hasExistingAppData,
  inspectDataPath,
  isDefaultPerUserInstallDir,
  isLinkSafeDataPathRoot,
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

  it("always uses PromptHub as the historical default userData directory name", () => {
    expect(
      getHistoricalDefaultUserDataPath(
        "C:\\Users\\Alice\\AppData\\Roaming",
        "win32",
      ),
    ).toBe("C:\\Users\\Alice\\AppData\\Roaming\\PromptHub");
    expect(
      getHistoricalDefaultUserDataPath(
        "/Users/alice/Library/Application Support",
        "darwin",
      ),
    ).toBe("/Users/alice/Library/Application Support/PromptHub");
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

  it("reports existing data markers for a copied target directory", () => {
    const userDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-copied-target-"),
    );
    tempDirs.push(userDataDir);

    fs.writeFileSync(path.join(userDataDir, "prompthub.db"), "old-db", "utf8");
    fs.mkdirSync(path.join(userDataDir, "data", "skills"), {
      recursive: true,
    });

    const inspection = inspectDataPath(userDataDir);

    expect(inspection.exists).toBe(true);
    expect(inspection.hasPromptHubData).toBe(true);
    expect(inspection.markers.map((marker) => marker.name)).toEqual(
      expect.arrayContaining(["prompthub.db", "data"]),
    );
  });

  it("prefers unified database markers inside data directory", () => {
    const userDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-unified-target-"),
    );
    tempDirs.push(userDataDir);

    fs.mkdirSync(path.join(userDataDir, "data"), { recursive: true });
    fs.writeFileSync(
      path.join(userDataDir, "data", "prompthub.db"),
      "db",
      "utf8",
    );

    const inspection = inspectDataPath(userDataDir);

    expect(inspection.markers.map((marker) => marker.name)).toEqual(
      expect.arrayContaining(["data", "data/prompthub.db"]),
    );
    expect(inspection.markers.map((marker) => marker.name)).not.toContain(
      "prompthub.db",
    );
  });

  it("does not report data markers for a missing target directory", () => {
    const userDataDir = path.join(
      os.tmpdir(),
      `prompthub-missing-target-${Date.now()}`,
    );

    const inspection = inspectDataPath(userDataDir);

    expect(inspection.exists).toBe(false);
    expect(inspection.hasPromptHubData).toBe(false);
    expect(inspection.markers).toEqual([]);
  });

  it("does not report symlinked marker directories as existing app data", () => {
    const userDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-symlink-marker-"),
    );
    const externalDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-external-marker-"),
    );
    tempDirs.push(userDataDir, externalDir);
    fs.writeFileSync(path.join(externalDir, "secret.txt"), "secret", "utf8");
    fs.symlinkSync(externalDir, path.join(userDataDir, "workspace"), "dir");

    const inspection = inspectDataPath(userDataDir);

    expect(inspection.exists).toBe(true);
    expect(inspection.hasPromptHubData).toBe(false);
    expect(inspection.markers).toEqual([]);
  });

  it("does not report symlinked database markers as existing app data", () => {
    const userDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-symlink-db-"),
    );
    const externalDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-external-db-"),
    );
    tempDirs.push(userDataDir, externalDir);
    fs.writeFileSync(path.join(externalDir, "prompthub.db"), "db", "utf8");
    fs.symlinkSync(
      path.join(externalDir, "prompthub.db"),
      path.join(userDataDir, "prompthub.db"),
      "file",
    );

    const inspection = inspectDataPath(userDataDir);

    expect(inspection.exists).toBe(true);
    expect(inspection.hasPromptHubData).toBe(false);
    expect(inspection.markers).toEqual([]);
  });

  it("does not inspect through a symlinked data path root", () => {
    const realDataRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-real-data-root-"),
    );
    const parentDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-linked-data-parent-"),
    );
    tempDirs.push(realDataRoot, parentDir);
    fs.mkdirSync(path.join(realDataRoot, "workspace"), { recursive: true });
    fs.writeFileSync(path.join(realDataRoot, "prompthub.db"), "db", "utf8");
    const linkedDataRoot = path.join(parentDir, "PromptHub-linked");
    fs.symlinkSync(realDataRoot, linkedDataRoot, "dir");

    const inspection = inspectDataPath(linkedDataRoot);

    expect(isLinkSafeDataPathRoot(linkedDataRoot)).toBe(false);
    expect(inspection.exists).toBe(true);
    expect(inspection.hasPromptHubData).toBe(false);
    expect(inspection.markers).toEqual([]);
  });

  it("accepts regular directories as link-safe data path roots", () => {
    const userDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-regular-root-"),
    );
    tempDirs.push(userDataDir);

    expect(isLinkSafeDataPathRoot(userDataDir)).toBe(true);
  });

  describe("copyDataPathItem", () => {
    it("copies regular files and directories", () => {
      const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-copy-"));
      tempDirs.push(rootDir);
      const sourceDir = path.join(rootDir, "source");
      const targetDir = path.join(rootDir, "target");
      fs.mkdirSync(path.join(sourceDir, "data", "skills", "writer"), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(sourceDir, "data", "skills", "writer", "SKILL.md"),
        "# Writer",
        "utf8",
      );

      expect(
        copyDataPathItem(
          path.join(sourceDir, "data"),
          path.join(targetDir, "data"),
          false,
        ),
      ).toBe(true);
      expect(
        fs.readFileSync(
          path.join(targetDir, "data", "skills", "writer", "SKILL.md"),
          "utf8",
        ),
      ).toBe("# Writer");
    });

    it("skips root symlink items instead of copying external content", () => {
      const rootDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "prompthub-copy-root-link-"),
      );
      tempDirs.push(rootDir);
      const externalDir = path.join(rootDir, "external");
      const sourceDir = path.join(rootDir, "source");
      const targetDir = path.join(rootDir, "target");
      fs.mkdirSync(externalDir, { recursive: true });
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.writeFileSync(path.join(externalDir, "secret.txt"), "secret", "utf8");
      fs.symlinkSync(externalDir, path.join(sourceDir, "data"), "dir");

      expect(
        copyDataPathItem(
          path.join(sourceDir, "data"),
          path.join(targetDir, "data"),
          false,
        ),
      ).toBe(false);
      expect(fs.existsSync(path.join(targetDir, "data", "secret.txt"))).toBe(
        false,
      );
    });

    it("skips nested symlink entries while copying regular data", () => {
      const rootDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "prompthub-copy-nested-link-"),
      );
      tempDirs.push(rootDir);
      const externalFile = path.join(rootDir, "outside.txt");
      const sourceDir = path.join(rootDir, "source");
      const targetDir = path.join(rootDir, "target");
      fs.mkdirSync(path.join(sourceDir, "data", "assets"), { recursive: true });
      fs.writeFileSync(path.join(sourceDir, "data", "safe.txt"), "safe", "utf8");
      fs.writeFileSync(externalFile, "secret", "utf8");
      fs.symlinkSync(
        externalFile,
        path.join(sourceDir, "data", "assets", "linked.txt"),
        "file",
      );

      expect(
        copyDataPathItem(
          path.join(sourceDir, "data"),
          path.join(targetDir, "data"),
          false,
        ),
      ).toBe(true);
      expect(fs.readFileSync(path.join(targetDir, "data", "safe.txt"), "utf8")).toBe(
        "safe",
      );
      expect(
        fs.existsSync(path.join(targetDir, "data", "assets", "linked.txt")),
      ).toBe(false);
      expect(fs.readFileSync(externalFile, "utf8")).toBe("secret");
    });
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
