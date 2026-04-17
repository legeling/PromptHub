import fs from "fs";
import path from "path";

import { createUpgradeDataSnapshot } from "./upgrade-backup";

const LAYOUT_MIGRATION_MARKER = ".data-layout-v0.5.5.json";

const ROOT_TO_DATA_DIRS = ["workspace", "skills", "images", "videos"] as const;
const ROOT_TO_CONFIG_FILES = ["shortcuts.json", "shortcut-mode.json"] as const;

export type DataLayoutMigrationStatus =
  | "already-migrated"
  | "no-legacy-data"
  | "migrated";

export interface DataLayoutMigrationResult {
  status: DataLayoutMigrationStatus;
  backupId: string | null;
  movedEntries: string[];
  markerPath: string;
}

interface LayoutMarkerRecord {
  version: string;
  migratedAt: string;
  movedEntries: string[];
  backupId?: string;
}

function getMarkerPath(userDataPath: string): string {
  return path.join(path.resolve(userDataPath), LAYOUT_MIGRATION_MARKER);
}

function hasDataEntries(targetPath: string): boolean {
  if (!fs.existsSync(targetPath)) {
    return false;
  }

  try {
    const stat = fs.statSync(targetPath);
    if (!stat.isDirectory()) {
      return stat.size > 0;
    }

    return fs.readdirSync(targetPath).length > 0;
  } catch {
    return false;
  }
}

function ensureDir(targetPath: string): void {
  fs.mkdirSync(targetPath, { recursive: true });
}

function copyDirRecursive(sourcePath: string, targetPath: string): void {
  ensureDir(targetPath);

  const entries = fs.readdirSync(sourcePath, { withFileTypes: true });
  for (const entry of entries) {
    const fromPath = path.join(sourcePath, entry.name);
    const toPath = path.join(targetPath, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(fromPath, toPath);
      continue;
    }

    if (!fs.existsSync(toPath)) {
      fs.copyFileSync(fromPath, toPath);
    }
  }
}

function moveDirectory(sourcePath: string, targetPath: string): void {
  if (!fs.existsSync(sourcePath)) {
    return;
  }

  if (!fs.existsSync(targetPath)) {
    ensureDir(path.dirname(targetPath));
    fs.renameSync(sourcePath, targetPath);
    return;
  }

  copyDirRecursive(sourcePath, targetPath);
  fs.rmSync(sourcePath, { recursive: true, force: true });
}

function moveFile(sourcePath: string, targetPath: string): void {
  if (!fs.existsSync(sourcePath)) {
    return;
  }

  ensureDir(path.dirname(targetPath));

  if (!fs.existsSync(targetPath)) {
    fs.renameSync(sourcePath, targetPath);
    return;
  }

  fs.copyFileSync(sourcePath, targetPath);
  fs.rmSync(sourcePath, { force: true });
}

function getTargetPath(userDataPath: string, entryName: string): string {
  if (entryName === "workspace") {
    return path.join(userDataPath, "data");
  }
  if (entryName === "skills") {
    return path.join(userDataPath, "data", "skills");
  }
  if (entryName === "images") {
    return path.join(userDataPath, "data", "assets", "images");
  }
  if (entryName === "videos") {
    return path.join(userDataPath, "data", "assets", "videos");
  }
  if (entryName === "shortcuts.json" || entryName === "shortcut-mode.json") {
    return path.join(userDataPath, "config", entryName);
  }

  return path.join(userDataPath, entryName);
}

function detectLegacyEntries(userDataPath: string): string[] {
  const entries: string[] = [];

  for (const dirName of ROOT_TO_DATA_DIRS) {
    if (hasDataEntries(path.join(userDataPath, dirName))) {
      entries.push(dirName);
    }
  }

  for (const fileName of ROOT_TO_CONFIG_FILES) {
    if (hasDataEntries(path.join(userDataPath, fileName))) {
      entries.push(fileName);
    }
  }

  return entries;
}

function writeMarker(
  userDataPath: string,
  movedEntries: string[],
  backupId: string | null,
): string {
  const markerPath = getMarkerPath(userDataPath);
  const payload: LayoutMarkerRecord = {
    version: "0.5.5",
    migratedAt: new Date().toISOString(),
    movedEntries,
    ...(backupId ? { backupId } : {}),
  };

  fs.writeFileSync(markerPath, JSON.stringify(payload, null, 2), "utf8");
  return markerPath;
}

export function getDataLayoutMigrationMarkerPath(userDataPath: string): string {
  return getMarkerPath(userDataPath);
}

export async function migrateLegacyDataLayout(
  userDataPath: string,
  currentVersion: string,
): Promise<DataLayoutMigrationResult> {
  const resolvedUserDataPath = path.resolve(userDataPath);
  const markerPath = getMarkerPath(resolvedUserDataPath);

  if (fs.existsSync(markerPath)) {
    return {
      status: "already-migrated",
      backupId: null,
      movedEntries: [],
      markerPath,
    };
  }

  const legacyEntries = detectLegacyEntries(resolvedUserDataPath);
  if (legacyEntries.length === 0) {
    return {
      status: "no-legacy-data",
      backupId: null,
      movedEntries: [],
      markerPath,
    };
  }

  const snapshot = await createUpgradeDataSnapshot(resolvedUserDataPath, {
    fromVersion: `${currentVersion}-pre-layout-migration`,
    toVersion: currentVersion,
  });

  for (const entryName of legacyEntries) {
    const sourcePath = path.join(resolvedUserDataPath, entryName);
    const targetPath = getTargetPath(resolvedUserDataPath, entryName);

    if (fs.statSync(sourcePath).isDirectory()) {
      moveDirectory(sourcePath, targetPath);
    } else {
      moveFile(sourcePath, targetPath);
    }
  }

  ensureDir(path.join(resolvedUserDataPath, "data"));
  ensureDir(path.join(resolvedUserDataPath, "config"));
  ensureDir(path.join(resolvedUserDataPath, "logs"));

  const writtenMarkerPath = writeMarker(
    resolvedUserDataPath,
    legacyEntries,
    snapshot.backupId,
  );

  return {
    status: "migrated",
    backupId: snapshot.backupId,
    movedEntries: legacyEntries,
    markerPath: writtenMarkerPath,
  };
}
