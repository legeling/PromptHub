import os from "node:os";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { DatabaseAdapter } from "@prompthub/db";
import {
  getPlatformById,
  normalizeLegacySkillPathToRootTemplate,
} from "@prompthub/shared/constants/platforms";
import {
  AGENT_SETTING_KEYS,
  RETIRED_AGENT_SETTING_KEYS,
  parseAgentManagementSettings,
  requireAgentSettingsRecord,
} from "../agent-management/agent-settings-contract";
import {
  AgentSettingsRepository,
  type AgentManagementSettings,
} from "../agent-management/agent-settings-repository";
import { parseAgentDeviceConfigDocument } from "../agent-resource-schema";
import {
  publishCanonicalEntries,
  recoverCanonicalEntryPublication,
} from "../canonical-entry-publication";
import { assertStoragePathComponentsSafe } from "../runtime-storage-context";

const MIGRATION_NAME = "agent-settings-v1";
const LEGACY_KEYS: readonly string[] = RETIRED_AGENT_SETTING_KEYS;

function legacyRoots(input: Record<string, unknown>): Record<string, unknown> {
  if (input.customPlatformRootPaths !== undefined) {
    const roots = requireAgentSettingsRecord(
      input.customPlatformRootPaths,
      "legacy roots",
    );
    if (
      Object.keys(roots).length === 0 &&
      input.customSkillPlatformPaths !== undefined &&
      Object.keys(
        requireAgentSettingsRecord(
          input.customSkillPlatformPaths,
          "legacy Skill paths",
        ),
      ).length > 0
    )
      throw new Error(
        "Agent configuration conflict: empty roots and historical Skill paths",
      );
    return roots;
  }
  const skills = requireAgentSettingsRecord(
    input.customSkillPlatformPaths ?? {},
    "legacy Skill paths",
  );
  return Object.fromEntries(
    Object.entries(skills).map(([id, value]) => {
      if (typeof value !== "string")
        throw new Error("Invalid legacy Agent Skill path");
      const platform = getPlatformById(id);
      return [
        id,
        platform
          ? normalizeLegacySkillPathToRootTemplate(platform, value)
          : value,
      ];
    }),
  );
}

/** Used only by versioned upgrade/import boundaries, never by current readers. */
export function convertAgentSettingsV1(
  input: Record<string, unknown>,
): AgentManagementSettings {
  for (const key of AGENT_SETTING_KEYS) {
    if (input[key] === null)
      throw new Error(`Invalid Agent settings: ${key} cannot be null`);
  }
  const roots = legacyRoots(input);
  const overrides = input.builtinAgentOverrides;
  if (
    overrides !== undefined &&
    Object.keys(requireAgentSettingsRecord(overrides, "builtinAgentOverrides"))
      .length === 0 &&
    Object.keys(roots).length > 0
  ) {
    throw new Error(
      "Agent configuration conflict: empty current overrides and historical roots",
    );
  }
  const oldCustomRoots =
    input.customAgentRootPaths ?? input.customSkillScanPaths ?? [];
  if (!Array.isArray(oldCustomRoots))
    throw new Error("Invalid legacy custom Agent roots");
  if (
    Array.isArray(input.customAgentRootPaths) &&
    input.customAgentRootPaths.length === 0 &&
    Array.isArray(input.customSkillScanPaths) &&
    input.customSkillScanPaths.length > 0
  )
    throw new Error(
      "Agent configuration conflict: empty custom roots and historical Skill paths",
    );
  if (
    Array.isArray(input.customAgents) &&
    input.customAgents.length === 0 &&
    oldCustomRoots.length > 0
  ) {
    throw new Error(
      "Agent configuration conflict: empty customAgents and historical roots",
    );
  }
  const customAgents =
    input.customAgents ??
    [...new Set(oldCustomRoots)].map((rootPath, index) => ({
      id: `migrated_agent_${index}`,
      name: `Custom Agent ${index + 1}`,
      rootPath,
    }));
  const result = parseAgentManagementSettings({
    builtinAgentOverrides:
      overrides ??
      Object.fromEntries(
        Object.entries(roots).map(([id, rootPath]) => [id, { rootPath }]),
      ),
    customAgents,
    disabledPlatformIds:
      input.disabledPlatformIds ?? input.trackedRulePlatformIds ?? [],
    agentIdentityPreferences: input.agentIdentityPreferences ?? {},
  });
  for (const asset of [
    ...Object.values(result.builtinAgentOverrides),
    ...result.customAgents,
  ]) {
    if (asset.rootPath?.startsWith("~/"))
      asset.rootPath = path.join(os.homedir(), asset.rootPath.slice(2));
  }
  const trae = result.builtinAgentOverrides.trae;
  if (
    trae?.rootPath &&
    /(?:^|[\\/])\.trae-cn(?:$|[\\/])/i.test(trae.rootPath)
  ) {
    if (result.builtinAgentOverrides["trae-cn"])
      throw new Error("Agent configuration conflict: TRAE CN identities");
    result.builtinAgentOverrides["trae-cn"] = trae;
    delete result.builtinAgentOverrides.trae;
    result.disabledPlatformIds = [
      ...new Set(
        result.disabledPlatformIds.map((id) =>
          id === "trae" ? "trae-cn" : id,
        ),
      ),
    ];
  }
  return result;
}

function readDevice(root: string, file: string): string | null {
  assertStoragePathComponentsSafe(root, file);
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new Error("Invalid legacy Agent device file");
    return fs.readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function deviceSettings(content: string): AgentManagementSettings {
  const header = requireAgentSettingsRecord(
    JSON.parse(content),
    "device document",
  );
  if (typeof header.deviceId !== "string")
    throw new Error("Invalid legacy Agent device identity");
  const document = parseAgentDeviceConfigDocument(content, {
    expectedDeviceId: header.deviceId,
  });
  return parseAgentManagementSettings(document);
}

function backup(
  root: string,
  settings: Record<string, unknown>,
  deviceDocument: string | null,
): void {
  const content = JSON.stringify(
    { version: 1, settings, deviceDocument },
    null,
    2,
  );
  const hash = crypto.createHash("sha256").update(content).digest("hex");
  const file = path.join(root, "recovery", MIGRATION_NAME, `${hash}.json`);
  assertStoragePathComponentsSafe(root, file);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  if (fs.existsSync(file)) {
    if (fs.readFileSync(file, "utf8") !== content)
      throw new Error("Agent settings recovery backup mismatch");
    return;
  }
  const stage = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    const descriptor = fs.openSync(stage, "wx", 0o600);
    try {
      fs.writeFileSync(descriptor, content);
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    fs.renameSync(stage, file);
  } finally {
    fs.rmSync(stage, { force: true });
  }
}

/** A restored old document is new migration input even when this database was upgraded before. */
export function migrateAgentSettingsV1(
  database: DatabaseAdapter.Database,
  root: string,
): void {
  recoverCanonicalEntryPublication(root, MIGRATION_NAME);
  const file = path.join(root, "config/devices/agents.json");
  const content = readDevice(root, file);
  const rows = database.prepare("SELECT key, value FROM settings").all() as {
    key: string;
    value: string;
  }[];
  const relevant = rows.filter((row) =>
    [...AGENT_SETTING_KEYS, ...LEGACY_KEYS].includes(row.key),
  );
  database.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)",
  );
  const completed = database
    .prepare("SELECT name FROM schema_migrations WHERE name = ?")
    .get(MIGRATION_NAME);
  if (
    completed &&
    content === null &&
    !relevant.some((row) => LEGACY_KEYS.includes(row.key))
  )
    return;
  const source = Object.fromEntries(
    relevant.map((row) => [row.key, JSON.parse(row.value)]),
  );
  const next =
    content === null ? convertAgentSettingsV1(source) : deviceSettings(content);
  backup(root, source, content);
  const commit = database.transaction(() => {
    const put = database.prepare(
      "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
    );
    for (const key of AGENT_SETTING_KEYS)
      put.run(key, JSON.stringify(next[key]));
    for (const key of LEGACY_KEYS)
      database.prepare("DELETE FROM settings WHERE key = ?").run(key);
    database
      .prepare(
        "INSERT OR REPLACE INTO schema_migrations (name, applied_at) VALUES (?, ?)",
      )
      .run(MIGRATION_NAME, Date.now());
  });
  if (content === null) commit();
  else
    publishCanonicalEntries({
      rootPath: root,
      operationKey: MIGRATION_NAME,
      entries: [{ targetPath: file, delete: true }],
      commit,
    });
}

export function importAgentSettingsV1(
  database: DatabaseAdapter.Database,
  input: Record<string, unknown>,
): void {
  if (
    ![...AGENT_SETTING_KEYS, ...LEGACY_KEYS].some((key) =>
      Object.prototype.hasOwnProperty.call(input, key),
    )
  )
    return;
  new AgentSettingsRepository(database).patch(convertAgentSettingsV1(input));
}
