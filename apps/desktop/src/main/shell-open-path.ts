import type * as fs from "fs";
import path from "path";

export interface OpenDirectoryPathDeps {
  appDataPath: string;
  homePath: string;
  localAppDataPath?: string;
  lstatSync: typeof fs.lstatSync;
  openPath: (path: string) => Promise<string | void>;
  showItemInFolder: (path: string) => void;
  statSync: typeof fs.statSync;
}

export interface OpenDirectoryPathResult {
  success: boolean;
  error?: string;
}

export function expandShellOpenPath(
  folderPath: string,
  paths: { appDataPath: string; homePath: string; localAppDataPath?: string },
): string {
  const localAppDataPath =
    paths.localAppDataPath ||
    path.win32.join(paths.homePath, "AppData", "Local");

  return folderPath
    .replace(/^~(?=$|[/\\])/, paths.homePath)
    .replace(/%APPDATA%/gi, paths.appDataPath)
    .replace(/%LOCALAPPDATA%/gi, localAppDataPath);
}

export async function openDirectoryPath(
  folderPath: string,
  deps: OpenDirectoryPathDeps,
): Promise<OpenDirectoryPathResult> {
  if (typeof folderPath !== "string" || folderPath.trim().length === 0) {
    return {
      success: false,
      error: "shell:openPath requires a non-empty folderPath string",
    };
  }

  const realPath = expandShellOpenPath(folderPath, deps);

  try {
    const lstat = deps.lstatSync(realPath);
    if (lstat.isSymbolicLink()) {
      deps.showItemInFolder(realPath);
      return { success: true };
    }

    if (!deps.statSync(realPath).isDirectory()) {
      deps.showItemInFolder(realPath);
      return { success: true };
    }
  } catch {
    return {
      success: false,
      error: "Directory does not exist or cannot be accessed",
    };
  }

  try {
    const error = await deps.openPath(realPath);
    if (typeof error === "string" && error.trim().length > 0) {
      return { success: false, error };
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
