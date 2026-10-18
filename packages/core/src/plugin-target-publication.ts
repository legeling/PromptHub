import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { computePluginPackageFingerprint } from "./plugin-library/package-materialization";

const RECEIPT = ".prompthub-plugin-target.json";
const ignored = [RECEIPT, ".prompthub-shared-plugin.json"];
export type PluginTargetContentState =
  | "synced"
  | "needs-sync"
  | "conflict"
  | "unverified";

export function pluginTargetStat(target: string): fs.Stats | undefined {
  try {
    return fs.lstatSync(target);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return undefined;
    throw error;
  }
}

function fingerprint(target: string): string {
  const value = computePluginPackageFingerprint(target, ignored);
  if (!value) throw new Error("Plugin package fingerprint is unavailable");
  return value;
}

function samePath(a: string, b: string): boolean {
  const normalize = (value: string) =>
    process.platform === "win32"
      ? path.resolve(value).toLowerCase()
      : path.resolve(value);
  return normalize(a) === normalize(b);
}

export function inspectPluginTargetContent(
  source: string,
  target: string,
  pluginId: string,
): PluginTargetContentState {
  const stat = pluginTargetStat(target);
  if (!stat) return "unverified";
  if (stat.isSymbolicLink())
    return samePath(
      path.resolve(path.dirname(target), fs.readlinkSync(target)),
      source,
    )
      ? "synced"
      : "conflict";
  if (!stat.isDirectory()) return "conflict";
  const receipt = path.join(target, RECEIPT);
  const current = fingerprint(target);
  if (!pluginTargetStat(receipt))
    return current === fingerprint(source) ? "synced" : "unverified";
  if (fs.lstatSync(receipt).isSymbolicLink()) return "conflict";
  const value: unknown = JSON.parse(fs.readFileSync(receipt, "utf8"));
  if (
    !value ||
    typeof value !== "object" ||
    !("pluginId" in value) ||
    value.pluginId !== pluginId ||
    !("installedHash" in value) ||
    value.installedHash !== current
  )
    return "conflict";
  return "sourceHash" in value && value.sourceHash === fingerprint(source)
    ? "synced"
    : "needs-sync";
}

export function assertPluginTargetWritable(
  source: string,
  target: string,
  pluginId: string,
): void {
  let parent = path.dirname(path.resolve(target));
  while (parent !== path.dirname(parent)) {
    if (pluginTargetStat(parent)?.isSymbolicLink())
      throw new Error("Plugin target parent must not be a symlink");
    parent = path.dirname(parent);
  }
  const overlaps = (a: string, b: string): boolean => {
    const relative = path.relative(a, b);
    return (
      !path.isAbsolute(relative) &&
      relative !== ".." &&
      !relative.startsWith(`..${path.sep}`)
    );
  };
  if (overlaps(source, target) || overlaps(target, source))
    throw new Error("Plugin target conflict: source and target paths overlap");
  if (!pluginTargetStat(target)) return;
  const state = inspectPluginTargetContent(source, target, pluginId);
  if (state === "conflict" || state === "unverified")
    throw new Error(
      "Plugin target content conflict: preserve or resolve external changes before retrying",
    );
}

/** Prepare the entire package and its receipt before replacing an existing target. */
export function publishPluginTarget(
  source: string,
  target: string,
  pluginId: string,
  prepare: (stage: string) => void,
): void {
  if (pluginTargetStat(path.join(source, RECEIPT)))
    throw new Error("Plugin source contains a reserved distribution receipt");
  assertPluginTargetWritable(source, target, pluginId);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const stage = `${target}.staging-${randomUUID()}`,
    backup = `${target}.backup-${randomUUID()}`;
  let moved = false;
  try {
    prepare(stage);
    if (!fs.lstatSync(stage).isSymbolicLink())
      fs.writeFileSync(
        path.join(stage, RECEIPT),
        JSON.stringify({
          pluginId,
          sourceHash: fingerprint(source),
          installedHash: fingerprint(stage),
        }),
        { flag: "wx" },
      );
    if (pluginTargetStat(target)) {
      fs.renameSync(target, backup);
      moved = true;
    }
    try {
      fs.renameSync(stage, target);
    } catch (error) {
      if (moved) fs.renameSync(backup, target);
      throw error;
    }
    if (moved) fs.rmSync(backup, { recursive: true, force: true });
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}
