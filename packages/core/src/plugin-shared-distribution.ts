import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  PluginDistributeMode,
  PluginLibraryEntry,
} from "@prompthub/shared/types/plugin";

const OWNER_FILE = ".prompthub-shared-plugin.json";

function existingStat(filePath: string): fs.Stats | undefined {
  try {
    return fs.lstatSync(filePath);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return undefined;
    throw error;
  }
}

function assertParents(targetPath: string): void {
  let current = path.dirname(path.resolve(targetPath));
  while (current !== path.dirname(current)) {
    const stat = existingStat(current);
    if (stat?.isSymbolicLink())
      throw new Error(`Shared Plugin parent must not be a symlink: ${current}`);
    current = path.dirname(current);
  }
}

export function assertSharedPluginOwnership(
  targetPath: string,
  plugin: PluginLibraryEntry,
): void {
  assertParents(targetPath);
  const stat = existingStat(targetPath);
  if (!stat) return;
  if (stat.isSymbolicLink()) {
    const source = plugin.localPackagePath ?? plugin.source.localPackagePath;
    if (
      source &&
      path.resolve(path.dirname(targetPath), fs.readlinkSync(targetPath)) ===
        path.resolve(source)
    )
      return;
  } else if (stat.isDirectory()) {
    const marker = path.join(targetPath, OWNER_FILE);
    const markerStat = existingStat(marker);
    if (markerStat?.isFile() && !markerStat.isSymbolicLink()) {
      const owner: unknown = JSON.parse(fs.readFileSync(marker, "utf8"));
      if (
        owner &&
        typeof owner === "object" &&
        "pluginId" in owner &&
        owner.pluginId === plugin.id
      )
        return;
    }
  }
  throw new Error(
    `Shared Plugin target conflict: directory is not owned by ${plugin.id}: ${targetPath}`,
  );
}

function stagePackage(
  sourcePath: string,
  staging: string,
  mode: PluginDistributeMode,
  pluginId: string,
): void {
  if (mode === "symlink") {
    fs.symlinkSync(
      sourcePath,
      staging,
      process.platform === "win32" ? "junction" : "dir",
    );
  } else {
    fs.cpSync(sourcePath, staging, { recursive: true, dereference: false });
    const marker = path.join(staging, OWNER_FILE);
    if (existingStat(marker))
      throw new Error(
        "Plugin package uses a reserved shared ownership filename",
      );
    fs.writeFileSync(marker, JSON.stringify({ pluginId }), { flag: "wx" });
  }
}

export function writeSharedPluginPackage(
  sourcePath: string,
  targetPath: string,
  mode: PluginDistributeMode,
  plugin: PluginLibraryEntry,
): void {
  assertSharedPluginOwnership(targetPath, plugin);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const staging = `${targetPath}.staging-${randomUUID()}`;
  const backup = `${targetPath}.backup-${randomUUID()}`;
  let backedUp = false;
  try {
    stagePackage(sourcePath, staging, mode, plugin.id);
    if (existingStat(targetPath)) {
      fs.renameSync(targetPath, backup);
      backedUp = true;
    }
    try {
      fs.renameSync(staging, targetPath);
    } catch (error) {
      if (backedUp) fs.renameSync(backup, targetPath);
      throw error;
    }
    if (backedUp) fs.rmSync(backup, { recursive: true, force: true });
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}
