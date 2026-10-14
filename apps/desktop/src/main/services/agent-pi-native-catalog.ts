import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { getAgentDefinitionById } from "@prompthub/shared/constants/agent-definitions";
import {
  createNativeCommandRunner,
  type NativeCommandRunner,
} from "./native-command";
import { fileExists, readTextConfig } from "./agent-model-config-io";

type CatalogRecord = Record<string, unknown>;
function isRecord(value: unknown): value is CatalogRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
async function installedDataDirectory(
  executable: string,
): Promise<string | null> {
  const resolved = await fs.realpath(executable);
  const packageRoot = path.dirname(path.dirname(resolved));
  const manifestPath = path.join(packageRoot, "package.json");
  if (!(await fileExists(manifestPath))) return null;
  const manifest: unknown = JSON.parse(await readTextConfig(manifestPath));
  if (
    !isRecord(manifest) ||
    manifest.name !== "@earendil-works/pi-coding-agent"
  )
    return null;
  const requireFromPi = createRequire(manifestPath);
  // Pi AI is import-only; require.resolve would incorrectly require a CJS export.
  for (const searchRoot of requireFromPi.resolve.paths(
    "@earendil-works/pi-ai",
  ) ?? []) {
    const dependencyManifest = path.join(
      searchRoot,
      "@earendil-works/pi-ai/package.json",
    );
    if (!(await fileExists(dependencyManifest))) continue;
    const dependency: unknown = JSON.parse(
      await readTextConfig(dependencyManifest),
    );
    if (!isRecord(dependency) || dependency.name !== "@earendil-works/pi-ai")
      throw new Error("AGENT_PI_NATIVE_CATALOG_INVALID");
    const directory = path.join(
      path.dirname(dependencyManifest),
      "dist/providers/data",
    );
    return (await fileExists(directory)) ? directory : null;
  }
  return null;
}
function modelsFromNativeData(value: unknown): unknown[] {
  if (!isRecord(value)) throw new Error("AGENT_PI_NATIVE_CATALOG_INVALID");
  const models = new Map<string, unknown>();
  for (const group of Object.values(value)) {
    if (!isRecord(group)) throw new Error("AGENT_PI_NATIVE_CATALOG_INVALID");
    for (const [id, model] of Object.entries(group)) models.set(id, model);
  }
  return [...models.values()];
}
/** Read shipped data without executing Pi's CLI, SDK, extensions or credential commands. */
export async function readPiNativeCatalog(
  resolveExecutable: NativeCommandRunner["resolve"] = createNativeCommandRunner()
    .resolve,
): Promise<CatalogRecord> {
  const candidate =
    getAgentDefinitionById("pi")?.platform.cli?.executableCandidates[0];
  if (!candidate) return {};
  const executable = await resolveExecutable(candidate);
  if (!executable) return {};
  const directory = await installedDataDirectory(executable);
  if (!directory) return {};
  const catalog: CatalogRecord = {};
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.name === ".manifest.json" || !entry.name.endsWith(".json"))
      continue;
    const value: unknown = JSON.parse(
      await readTextConfig(path.join(directory, entry.name)),
    );
    catalog[entry.name.slice(0, -".json".length)] = {
      models: modelsFromNativeData(value),
    };
  }
  return catalog;
}
