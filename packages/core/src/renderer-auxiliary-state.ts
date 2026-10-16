import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { SettingsDB, type DatabaseAdapter } from "@prompthub/db";
import { assertStoragePathComponentsSafe } from "./runtime-storage-context";
import {
  publishSqliteEntries,
  recoverSqliteEntryPublication,
} from "./sqlite-entry-publication";
import {
  asRecord,
  normalizeDeviceId,
  parseRecoveryPaths,
  parseSources,
  type MarketplaceSourceRecord,
} from "./renderer-persistence-validation";

export const RENDERER_AUXILIARY_SETTING_KEYS = [
  "marketplaceSources",
  "recoveryPaths",
  "selfHostedDeviceId",
] as const;
const MIGRATION_NAME = "renderer-state-sqlite-v1";
const SOURCES = [
  {
    key: "marketplaceSources",
    file: "config/marketplace-sources.json",
    kind: "prompthub-marketplace-sources",
    field: "sources",
  },
  {
    key: "recoveryPaths",
    file: "config/recovery-paths.json",
    kind: "prompthub-recovery-path-registry",
    field: "paths",
  },
  {
    key: "selfHostedDeviceId",
    file: "config/devices/renderer.json",
    kind: "prompthub-renderer-devices",
    field: "selfHostedDeviceId",
  },
] as const;

export interface RendererAuxiliaryState {
  marketplaceSources: Record<
    "skill" | "mcp" | "plugin",
    MarketplaceSourceRecord[]
  >;
  recoveryPaths: string[];
  selfHostedDeviceId: string | null;
}

export function parseRendererAuxiliaryState(
  value: Record<string, unknown>,
): RendererAuxiliaryState {
  if (
    value.marketplaceSources !== undefined &&
    (value.marketplaceSources === null ||
      typeof value.marketplaceSources !== "object" ||
      Array.isArray(value.marketplaceSources))
  )
    throw new Error("Invalid renderer marketplace sources");
  const sources = asRecord(value.marketplaceSources);
  return {
    marketplaceSources: {
      skill: parseSources({ customStoreSources: sources.skill }),
      mcp: parseSources({ customStoreSources: sources.mcp }),
      plugin: parseSources({ customStoreSources: sources.plugin }),
    },
    recoveryPaths: parseRecoveryPaths(value.recoveryPaths),
    selfHostedDeviceId: normalizeDeviceId(value.selfHostedDeviceId),
  };
}

export function readRendererAuxiliaryState(
  database: DatabaseAdapter.Database,
): RendererAuxiliaryState {
  const settings = new SettingsDB(database);
  return parseRendererAuxiliaryState(
    Object.fromEntries(
      RENDERER_AUXILIARY_SETTING_KEYS.map((key) => {
        const value = settings.get(key);
        if (value === undefined)
          throw new Error(`Missing renderer setting: ${key}`);
        return [key, value];
      }),
    ),
  );
}

export function writeRendererAuxiliaryState(
  database: DatabaseAdapter.Database,
  state: RendererAuxiliaryState,
): void {
  const parsed = parseRendererAuxiliaryState({ ...state });
  new SettingsDB(database).set({ ...parsed });
}

interface HistoricalSource {
  file: string;
  bytes: Buffer;
}

function readHistoricalState(root: string): {
  values: Record<string, unknown>;
  sources: HistoricalSource[];
} {
  const values: Record<string, unknown> = {};
  const sources: HistoricalSource[] = [];
  for (const source of SOURCES) {
    const file = path.join(root, source.file);
    assertStoragePathComponentsSafe(root, file);
    if (!fs.existsSync(file)) continue;
    if (!fs.lstatSync(file).isFile())
      throw new Error(`Invalid renderer state file: ${source.file}`);
    const bytes = fs.readFileSync(file);
    const document = asRecord(JSON.parse(bytes.toString("utf8")));
    if (
      document.version !== 1 ||
      document.kind !== source.kind ||
      !(source.field in document)
    )
      throw new Error(`Invalid historical renderer state: ${source.file}`);
    values[source.key] = document[source.field];
    sources.push({ file, bytes });
  }
  return { values, sources };
}

export function migrateRendererAuxiliaryState(
  database: DatabaseAdapter.Database,
  root: string,
): void {
  recoverSqliteEntryPublication(database, root, MIGRATION_NAME);
  const historical = readHistoricalState(root);
  const completed = database
    .prepare("SELECT name FROM schema_migrations WHERE name = ?")
    .get(MIGRATION_NAME);
  if (completed) {
    if (historical.sources.length)
      throw new Error("Retired renderer state files require explicit recovery");
    readRendererAuxiliaryState(database);
    return;
  }
  const settings = new SettingsDB(database);
  const old = parseRendererAuxiliaryState(historical.values);
  const merged: Record<string, unknown> = {};
  for (const key of RENDERER_AUXILIARY_SETTING_KEYS) {
    const sql = settings.get(key);
    if (
      sql !== undefined &&
      key in historical.values &&
      !isDeepStrictEqual(sql, JSON.parse(JSON.stringify(old[key])))
    )
      throw new Error(`Renderer state migration conflict: ${key}`);
    merged[key] = sql === undefined ? old[key] : sql;
  }
  const state = parseRendererAuxiliaryState(merged);
  const digest = crypto.createHash("sha256");
  for (const source of historical.sources)
    digest.update(path.relative(root, source.file)).update(source.bytes);
  const recoveryRoot = path.join(
    root,
    "recovery",
    MIGRATION_NAME,
    digest.digest("hex"),
  );
  publishSqliteEntries(database, {
    rootPath: root,
    operationKey: MIGRATION_NAME,
    entries: historical.sources.flatMap((source) => [
      {
        targetPath: path.join(recoveryRoot, path.relative(root, source.file)),
        prepare: (stage: string) => {
          fs.mkdirSync(path.dirname(stage), { recursive: true, mode: 0o700 });
          fs.writeFileSync(stage, source.bytes, { mode: 0o600 });
          if (!fs.readFileSync(stage).equals(source.bytes))
            throw new Error("Renderer state recovery verification failed");
        },
      },
      { targetPath: source.file, delete: true },
    ]),
    commit: () => {
      writeRendererAuxiliaryState(database, state);
      database
        .prepare(
          "INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)",
        )
        .run(MIGRATION_NAME, Date.now());
    },
  });
}
