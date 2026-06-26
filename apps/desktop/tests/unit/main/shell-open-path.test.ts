/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  expandShellOpenPath,
  openDirectoryPath,
} from "../../../src/main/shell-open-path";

function createDeps() {
  return {
    appDataPath: "/Users/test/Library/Application Support",
    homePath: "/Users/test",
    lstatSync: vi.fn(),
    openPath: vi.fn().mockResolvedValue(""),
    showItemInFolder: vi.fn(),
    statSync: vi.fn(),
  };
}

const tokenPaths = {
  appDataPath: "/Users/test/Library/Application Support",
  homePath: "/Users/test",
  localAppDataPath: "C:\\Users\\test\\AppData\\Local",
};

describe("expandShellOpenPath", () => {
  it("expands bare home tokens only when they represent the current user home", () => {
    expect(expandShellOpenPath("~", tokenPaths)).toBe("/Users/test");
    expect(expandShellOpenPath("~/skills", tokenPaths)).toBe(
      "/Users/test/skills",
    );
    expect(expandShellOpenPath("~\\skills", tokenPaths)).toBe(
      "/Users/test\\skills",
    );
    expect(expandShellOpenPath("~team/skills", tokenPaths)).toBe(
      "~team/skills",
    );
  });

  it("expands APPDATA tokens case-insensitively", () => {
    expect(expandShellOpenPath("%APPDATA%\\PromptHub", tokenPaths)).toBe(
      "/Users/test/Library/Application Support\\PromptHub",
    );
    expect(expandShellOpenPath("%appdata%\\PromptHub", tokenPaths)).toBe(
      "/Users/test/Library/Application Support\\PromptHub",
    );
  });

  it("expands LOCALAPPDATA tokens case-insensitively", () => {
    expect(expandShellOpenPath("%LOCALAPPDATA%\\hermes", tokenPaths)).toBe(
      "C:\\Users\\test\\AppData\\Local\\hermes",
    );
    expect(expandShellOpenPath("%localappdata%\\hermes", tokenPaths)).toBe(
      "C:\\Users\\test\\AppData\\Local\\hermes",
    );
  });

  it("falls back to the Windows local app data path when no LOCALAPPDATA path is provided", () => {
    expect(
      expandShellOpenPath("%LOCALAPPDATA%\\hermes", {
        appDataPath: "C:\\Users\\test\\AppData\\Roaming",
        homePath: "C:\\Users\\test",
      }),
    ).toBe("C:\\Users\\test\\AppData\\Local\\hermes");
  });
});

describe("openDirectoryPath", () => {
  let deps: ReturnType<typeof createDeps>;

  beforeEach(() => {
    deps = createDeps();
  });

  it("reveals a symlink directory entry instead of opening its resolved target", async () => {
    deps.lstatSync.mockReturnValue({ isSymbolicLink: () => true });

    const result = await openDirectoryPath(
      "/Users/test/.cline/skills/unity-project",
      deps,
    );

    expect(result).toEqual({ success: true });
    expect(deps.showItemInFolder).toHaveBeenCalledWith(
      "/Users/test/.cline/skills/unity-project",
    );
    expect(deps.openPath).not.toHaveBeenCalled();
  });

  it("opens normal directories after expanding home tokens", async () => {
    deps.lstatSync.mockReturnValue({ isSymbolicLink: () => false });
    deps.statSync.mockReturnValue({ isDirectory: () => true });

    const result = await openDirectoryPath("~/skills", deps);

    expect(result).toEqual({ success: true });
    expect(deps.openPath).toHaveBeenCalledWith("/Users/test/skills");
  });

  it("reveals existing file paths in the system file manager", async () => {
    deps.lstatSync.mockReturnValue({ isSymbolicLink: () => false });
    deps.statSync.mockReturnValue({ isDirectory: () => false });

    await expect(openDirectoryPath("/tmp/file.txt", deps)).resolves.toEqual({
      success: true,
    });
    expect(deps.showItemInFolder).toHaveBeenCalledWith("/tmp/file.txt");
    expect(deps.openPath).not.toHaveBeenCalled();
  });

  it("rejects missing paths before invoking the OS shell", async () => {
    deps.lstatSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    await expect(
      openDirectoryPath("/tmp/missing-folder", deps),
    ).resolves.toEqual({
      success: false,
      error: "Directory does not exist or cannot be accessed",
    });
    expect(deps.openPath).not.toHaveBeenCalled();
  });

  it("rejects URL-like input as a directory path", async () => {
    deps.lstatSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    await expect(
      openDirectoryPath("https://example.com", deps),
    ).resolves.toEqual({
      success: false,
      error: "Directory does not exist or cannot be accessed",
    });
    expect(deps.openPath).not.toHaveBeenCalled();
  });
});
