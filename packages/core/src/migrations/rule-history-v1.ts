import fs from "node:fs";
import path from "node:path";
import type {
  RuleFileId,
  RuleVersionSnapshot,
  RuleVersionRecord,
} from "@prompthub/shared/types";
import { type CanonicalEntryMutation } from "../canonical-entry-publication";
import { validateRuleVersionSnapshot } from "../rule-resource-schema";
import { getUserDataPath } from "../runtime-paths";
import { assertStoragePathComponentsSafe } from "../runtime-storage-context";
import {
  LEGACY_RULE_HISTORY_DIR_NAME,
  encodeRuleId,
  hashContent,
  isRecord,
  normalizeLegacySavedAt,
  normalizeRuleVersionSource,
  type StoredRuleMeta,
  type StoredRuleVersionIndexEntry,
} from "../rules-workspace-support";

const MIGRATION_NAME = "rule-history-v1";
interface HistoricalSource {
  file: string;
  content: string;
}
interface MigratedRule {
  meta: StoredRuleMeta;
  content: string;
  index: StoredRuleVersionIndexEntry[];
}
interface MigrationInput {
  getRules: () => StoredRuleMeta[];
  getVersionsDir: (ruleId: RuleFileId) => string;
  getCurrentVersions: () => RuleVersionRecord[];
  commit: (
    migrationName: string,
    records: MigratedRule[],
    entries: CanonicalEntryMutation[],
  ) => void;
}

function readOwnedFile(file: string): string {
  assertStoragePathComponentsSafe(getUserDataPath(), file);
  if (!fs.lstatSync(file).isFile())
    throw new Error("Historical Rule path is not a regular file");
  const bytes = fs.readFileSync(file);
  const content = bytes.toString("utf8");
  if (!Buffer.from(content, "utf8").equals(bytes))
    throw new Error("Historical Rule input is not valid UTF-8");
  return content;
}

function normalizeVersion(
  ruleId: RuleFileId,
  value: Record<string, unknown>,
): RuleVersionSnapshot {
  const savedAt = [
    value.savedAt,
    value.createdAt,
    value.updatedAt,
    value.timestamp,
    value.date,
  ]
    .map(normalizeLegacySavedAt)
    .find((date) => date !== null);
  if (!savedAt || typeof value.content !== "string")
    throw new Error(`Invalid historical Rule version: ${ruleId}`);
  const id =
    typeof value.id === "string" && value.id.trim()
      ? value.id
      : `legacy-${hashContent(`${ruleId}\n${savedAt}\n${value.content}`).slice(0, 16)}`;
  return validateRuleVersionSnapshot({
    id,
    savedAt,
    content: value.content,
    source: normalizeRuleVersionSource(value.source),
  });
}

function collectVersions(
  value: unknown,
  scope: RuleFileId | undefined,
  aliases: Map<string, RuleFileId>,
  result: Map<RuleFileId, RuleVersionSnapshot[]>,
): void {
  if (Array.isArray(value)) {
    for (const entry of value) collectVersions(entry, scope, aliases, result);
    return;
  }
  if (!isRecord(value))
    throw new Error("Invalid historical Rule history record");
  const declared = value.ruleId ?? value.fileId ?? value.ruleFileId;
  const ruleId =
    declared === undefined
      ? scope
      : typeof declared === "string"
        ? aliases.get(declared)
        : undefined;
  if (declared !== undefined && (!ruleId || (scope && ruleId !== scope)))
    throw new Error("Unknown or conflicting historical Rule identity");
  if (Array.isArray(value.versions)) {
    collectVersions(value.versions, ruleId, aliases, result);
  } else if (typeof value.content === "string") {
    if (!ruleId)
      throw new Error("Historical Rule version has no known identity");
    const versions = result.get(ruleId) ?? [];
    versions.push(normalizeVersion(ruleId, value));
    result.set(ruleId, versions);
  } else {
    for (const [key, entries] of Object.entries(value)) {
      const mapped = aliases.get(key);
      if (!mapped) throw new Error("Unknown historical Rule history key");
      collectVersions(entries, mapped, aliases, result);
    }
  }
}

function readSources(): HistoricalSource[] {
  const directory = path.join(getUserDataPath(), LEGACY_RULE_HISTORY_DIR_NAME);
  assertStoragePathComponentsSafe(getUserDataPath(), directory);
  if (!fs.existsSync(directory)) return [];
  if (!fs.lstatSync(directory).isDirectory())
    throw new Error("Historical Rule history directory is unsafe");
  return fs
    .readdirSync(directory)
    .sort()
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .map((name) => {
      const file = path.join(directory, name);
      return { file, content: readOwnedFile(file) };
    });
}

function parseSources(
  sources: HistoricalSource[],
  rules: StoredRuleMeta[],
): Map<RuleFileId, RuleVersionSnapshot[]> {
  const aliases = new Map<string, RuleFileId>();
  for (const rule of rules) {
    for (const alias of [
      rule.id,
      encodeRuleId(rule.id),
      rule.id.replace(/[^A-Za-z0-9._-]+/gu, "_"),
    ]) {
      if (aliases.has(alias) && aliases.get(alias) !== rule.id)
        throw new Error("Ambiguous historical Rule identity");
      aliases.set(alias, rule.id);
    }
  }
  const versions = new Map<RuleFileId, RuleVersionSnapshot[]>();
  for (const source of sources) {
    const raw: unknown = JSON.parse(source.content);
    collectVersions(
      raw,
      aliases.get(path.basename(source.file).slice(0, -5)),
      aliases,
      versions,
    );
  }
  return versions;
}

function readCurrentVersions(
  ruleId: RuleFileId,
  records: RuleVersionRecord[],
): RuleVersionSnapshot[] {
  return records
    .filter((record) => record.ruleId === ruleId)
    .map((record) => ({
      id: record.id,
      savedAt: record.createdAt,
      source: record.source,
      content: readOwnedFile(record.filePath),
    }));
}

function mergeVersions(
  ruleId: RuleFileId,
  current: RuleVersionSnapshot[],
  historical: RuleVersionSnapshot[],
): RuleVersionSnapshot[] {
  const merged = new Map<string, RuleVersionSnapshot>();
  for (const version of [...current, ...historical]) {
    const previous = merged.get(version.id);
    if (
      previous &&
      (previous.savedAt !== version.savedAt ||
        previous.content !== version.content ||
        previous.source !== version.source)
    ) {
      throw new Error(
        `Historical Rule version conflict: ${ruleId}/${version.id}`,
      );
    }
    merged.set(version.id, version);
  }
  return [...merged.values()].sort(
    (left, right) =>
      left.savedAt.localeCompare(right.savedAt) ||
      left.id.localeCompare(right.id),
  );
}

function textMutation(
  targetPath: string,
  content: string,
): CanonicalEntryMutation {
  return {
    targetPath,
    prepare(stagePath) {
      fs.writeFileSync(stagePath, content, { mode: 0o600 });
    },
  };
}

function versionMutation(
  directory: string,
  versions: RuleVersionSnapshot[],
): {
  entry: CanonicalEntryMutation;
  index: StoredRuleVersionIndexEntry[];
} {
  const index = versions.map((version) => ({
    id: version.id,
    savedAt: version.savedAt,
    source: version.source,
    fileName: `${hashContent(version.id)}.md`,
  }));
  return {
    index: [...index].reverse(),
    entry: {
      targetPath: directory,
      prepare(stagePath) {
        fs.mkdirSync(stagePath, { recursive: true, mode: 0o700 });
        for (const [position, version] of versions.entries()) {
          fs.writeFileSync(
            path.join(stagePath, index[position].fileName),
            version.content,
            { mode: 0o600 },
          );
        }
      },
    },
  };
}

function preserveCurrentBody(
  ruleId: RuleFileId,
  content: string,
  versions: RuleVersionSnapshot[],
): void {
  if (versions.at(-1)?.content === content) return;
  // Historical clocks can be ahead of this device. Current content must still
  // remain the final snapshot without rewriting any original timestamp.
  const savedAt = new Date(
    Math.max(
      Date.now(),
      Date.parse(versions.at(-1)?.savedAt ?? "1970-01-01") + 1,
    ),
  ).toISOString();
  versions.push({
    id: `initial-${hashContent(`${ruleId}\n${savedAt}\n${content}`)}`,
    savedAt,
    content,
    source: "create",
  });
}

function prepareRule(
  meta: StoredRuleMeta,
  historical: RuleVersionSnapshot[],
  getVersionsDir: MigrationInput["getVersionsDir"],
  currentVersions: RuleVersionRecord[],
): { entries: CanonicalEntryMutation[]; record: MigratedRule } | null {
  const directory = getVersionsDir(meta.id);
  const versions = mergeVersions(
    meta.id,
    readCurrentVersions(meta.id, currentVersions),
    historical,
  );
  const content = fs.existsSync(meta.managedPath)
    ? readOwnedFile(meta.managedPath)
    : fs.existsSync(meta.targetPath)
      ? fs.readFileSync(meta.targetPath, "utf8")
      : versions.at(-1)?.content;
  if (content === undefined) return null;
  preserveCurrentBody(meta.id, content, versions);
  const versionFiles = versionMutation(directory, versions);
  const mutations = [
    textMutation(meta.managedPath, content),
    versionFiles.entry,
  ];
  return {
    entries: mutations,
    record: { meta, content, index: versionFiles.index },
  };
}

function assertVersionOwners(
  records: MigratedRule[],
  current: RuleVersionRecord[],
): void {
  const owners = new Map(
    current.map((version) => [version.id, version.ruleId]),
  );
  for (const record of records) {
    for (const version of record.index) {
      const owner = owners.get(version.id);
      if (owner && owner !== record.meta.id)
        throw new Error(
          `Historical Rule version identity belongs to another Rule: ${version.id}`,
        );
      owners.set(version.id, record.meta.id);
    }
  }
}

/** Startup/restore boundary only; ordinary Rules reads must never invoke this conversion. */
export function migrateRuleHistoryV1(input: MigrationInput): void {
  const sources = readSources();
  if (sources.length === 0) return;
  const rules = input.getRules();
  const versions = parseSources(sources, rules);
  const entries: CanonicalEntryMutation[] = [];
  const records: MigratedRule[] = [];
  const currentVersions = input.getCurrentVersions();
  const versionsByRule = new Map<RuleFileId, RuleVersionRecord[]>();
  for (const version of currentVersions) {
    const list = versionsByRule.get(version.ruleId) ?? [];
    list.push(version);
    versionsByRule.set(version.ruleId, list);
  }
  for (const rule of rules) {
    const historical = versions.get(rule.id);
    const plan = historical
      ? prepareRule(
          rule,
          historical,
          input.getVersionsDir,
          versionsByRule.get(rule.id) ?? [],
        )
      : null;
    if (plan) {
      entries.push(...plan.entries);
      records.push(plan.record);
    }
  }
  assertVersionOwners(records, currentVersions);
  const recoveryPaths = new Set<string>();
  for (const source of sources) {
    const recovery = path.join(
      getUserDataPath(),
      "recovery",
      MIGRATION_NAME,
      `${hashContent(source.content)}.json`,
    );
    if (fs.existsSync(recovery) && readOwnedFile(recovery) !== source.content)
      throw new Error("Historical Rule recovery backup mismatch");
    if (!recoveryPaths.has(recovery))
      entries.push(textMutation(recovery, source.content));
    recoveryPaths.add(recovery);
    entries.push({ targetPath: source.file, delete: true });
  }
  input.commit(MIGRATION_NAME, records, entries);
}
