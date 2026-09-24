import type { Context } from "hono";
import type { SyncSnapshot } from "@prompthub/shared/types/sync";
import { assertSkillSnapshotCapability, validateEncodedSkillSnapshots, SKILL_SNAPSHOT_SYNC_VERSION, SKILL_SNAPSHOT_CAPABILITY_HEADER, SKILL_SNAPSHOT_CAPABILITY } from "@prompthub/shared/utils/skill-file-snapshot";
import { ErrorCode, failure, HttpError, readJson, success } from "./response";
import type { AuthUser, Env } from "./types";

interface SyncPutBody {
  payload?: unknown;
}

const DEFAULT_SNAPSHOT_VERSION = "web-cloudflare-backup-v1";
const SUPPORTED_SNAPSHOT_VERSIONS = new Set([
  SKILL_SNAPSHOT_SYNC_VERSION,
  "1",
  "3.1",
  "4.0",
  "desktop-backup-v1",
  "web-backup-v2",
  "web-cloudflare-backup-v1",
  "prompthub-cli-workspace-v1",
  "prompthub-cli-workspace-v2",
]);
const MAX_SNAPSHOT_ENTRIES = 100_000;
const MAX_SNAPSHOT_BYTES = 50 * 1024 * 1024;

interface SnapshotRow {
  payload_json: string;
  exported_at: string;
  settings_updated_at: string | null;
}

interface SnapshotBinding {
  db: D1Database;
  userId: string;
  baselinePayload: string | null;
}

const snapshotBindings = new WeakMap<object, SnapshotBinding>();

export class SnapshotValidationError extends HttpError {
  constructor(message: string) {
    super(422, ErrorCode.VALIDATION_ERROR, message);
    this.name = "SnapshotValidationError";
  }
}

export class SnapshotConflictError extends HttpError {
  constructor(message = "Snapshot was changed by another request") {
    super(409, ErrorCode.CONFLICT, message);
    this.name = "SnapshotConflictError";
  }
}

export class SnapshotIdentityError extends HttpError {
  constructor() {
    super(
      403,
      ErrorCode.FORBIDDEN,
      "Snapshot identity does not match the requested tenant",
    );
    this.name = "SnapshotIdentityError";
  }
}

export class SnapshotOutcomeUnknownError extends HttpError {
  constructor(message = "Snapshot write outcome could not be confirmed") {
    super(500, ErrorCode.INTERNAL_ERROR, message);
    this.name = "SnapshotOutcomeUnknownError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new SnapshotValidationError(`${field} must be an object`);
  }
  return value;
}

function readArray(
  value: Record<string, unknown>,
  field: string,
  required = false,
): unknown[] {
  if (value[field] === undefined && !required) {
    return [];
  }
  if (!Array.isArray(value[field])) {
    throw new SnapshotValidationError(`${field} must be an array`);
  }
  const entries = value[field] as unknown[];
  for (const [index, entry] of entries.entries()) {
    if (!isRecord(entry)) {
      throw new SnapshotValidationError(`${field}[${index}] must be an object`);
    }
  }
  return entries;
}

function readOptionalArray(
  value: Record<string, unknown>,
  field: string,
): unknown[] | undefined {
  if (value[field] === undefined) {
    return undefined;
  }
  return readArray(value, field);
}

function readOptionalRecord(
  value: Record<string, unknown>,
  field: string,
): Record<string, unknown> | undefined {
  if (value[field] === undefined) {
    return undefined;
  }
  return assertRecord(value[field], field);
}

function normalizeVersion(value: unknown): string {
  const version =
    value === undefined
      ? DEFAULT_SNAPSHOT_VERSION
      : typeof value === "number" && value === 1
        ? "1"
        : value;
  if (
    typeof version !== "string" ||
    !SUPPORTED_SNAPSHOT_VERSIONS.has(version)
  ) {
    throw new SnapshotValidationError(
      `unsupported snapshot version: ${typeof version === "string" ? version : "invalid"}`,
    );
  }
  return version;
}

function normalizeTimestamp(value: unknown, field = "exportedAt"): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new SnapshotValidationError(`${field} must be a valid timestamp`);
  }
  return value;
}

function assertNonEmptyString(
  record: Record<string, unknown>,
  field: string,
  context: string,
): void {
  if (typeof record[field] !== "string" || !(record[field] as string).trim()) {
    throw new SnapshotValidationError(
      `${context}.${field} must be a non-empty string`,
    );
  }
}

function assertString(
  record: Record<string, unknown>,
  field: string,
  context: string,
): void {
  if (typeof record[field] !== "string") {
    throw new SnapshotValidationError(`${context}.${field} must be a string`);
  }
}

function assertUniqueIds(
  entries: unknown[],
  collection: string,
  idField = "id",
): void {
  const ids = new Set<string>();
  for (const [index, entry] of entries.entries()) {
    const record = entry as Record<string, unknown>;
    const id = record[idField];
    if (typeof id !== "string" || !id.trim()) {
      throw new SnapshotValidationError(
        `${collection}[${index}].${idField} must be a non-empty string`,
      );
    }
    if (ids.has(id)) {
      throw new SnapshotValidationError(
        `duplicate identity in ${collection}: ${id}`,
      );
    }
    ids.add(id);
  }
}

function validatePromptRecords(entries: unknown[], collection: string): void {
  assertUniqueIds(entries, collection);
  for (const [index, entry] of entries.entries()) {
    const record = entry as Record<string, unknown>;
    const context = `${collection}[${index}]`;
    assertNonEmptyString(record, "title", context);
    assertString(record, "userPrompt", context);
  }
}

function validateFolderRecords(entries: unknown[], collection: string): void {
  assertUniqueIds(entries, collection);
  for (const [index, entry] of entries.entries()) {
    assertNonEmptyString(
      entry as Record<string, unknown>,
      "name",
      `${collection}[${index}]`,
    );
  }
}

function validateSkillRecords(entries: unknown[], collection: string): void {
  assertUniqueIds(entries, collection);
  for (const [index, entry] of entries.entries()) {
    const record = entry as Record<string, unknown>;
    const context = `${collection}[${index}]`;
    assertNonEmptyString(record, "name", context);
    if (
      record.protocol_type !== "skill" &&
      record.protocol_type !== "mcp" &&
      record.protocol_type !== "claude-code"
    ) {
      throw new SnapshotValidationError(
        `${context}.protocol_type must be skill, mcp, or claude-code`,
      );
    }
    if (record.content !== undefined && typeof record.content !== "string") {
      throw new SnapshotValidationError(`${context}.content must be a string`);
    }
    if (
      record.instructions !== undefined &&
      typeof record.instructions !== "string"
    ) {
      throw new SnapshotValidationError(
        `${context}.instructions must be a string`,
      );
    }
    if (
      typeof record.content !== "string" &&
      typeof record.instructions !== "string"
    ) {
      throw new SnapshotValidationError(
        `${context} must include content or instructions`,
      );
    }
  }
}

function validateVersionRecords(
  entries: unknown[],
  collection: string,
  ownerField: string,
): void {
  assertUniqueIds(entries, collection);
  for (const [index, entry] of entries.entries()) {
    const record = entry as Record<string, unknown>;
    const context = `${collection}[${index}]`;
    if (
      typeof record[ownerField] !== "string" ||
      !(record[ownerField] as string).trim()
    ) {
      throw new SnapshotValidationError(
        `${context}.${ownerField} must be a non-empty string`,
      );
    }
    if (!Number.isInteger(record.version) || (record.version as number) < 0) {
      throw new SnapshotValidationError(
        `${context}.version must be a non-negative integer`,
      );
    }
    if (collection === "promptVersions") {
      assertString(record, "userPrompt", context);
    }
  }
}

function countSnapshotEntries(value: Record<string, unknown>): number {
  const collectionFields = [
    "prompts",
    "promptVersions",
    "versions",
    "folders",
    "rules",
    "skills",
    "skillVersions",
    "pluginPackages",
    "promptRelations",
    "outputFormatItems",
  ];
  let count = 0;
  for (const field of collectionFields) {
    if (Array.isArray(value[field])) {
      count += value[field].length;
    }
  }
  if (isRecord(value.skillFiles)) {
    for (const files of Object.values(value.skillFiles)) {
      if (Array.isArray(files)) count += files.length;
    }
  }
  if (isRecord(value.agentAssetFiles)) {
    for (const files of Object.values(value.agentAssetFiles)) {
      if (Array.isArray(files)) count += files.length;
    }
  }
  if (isRecord(value.mcpLibrary)) {
    for (const field of ["servers", "bindings"]) {
      if (Array.isArray(value.mcpLibrary[field]))
        count += value.mcpLibrary[field].length;
    }
  }
  if (
    isRecord(value.pluginLibrary) &&
    Array.isArray(value.pluginLibrary.plugins)
  ) {
    count += value.pluginLibrary.plugins.length;
  }
  return count;
}

function assertSnapshotCapacity(value: Record<string, unknown>): void {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new SnapshotValidationError("snapshot must be JSON serializable");
  }
  if (typeof serialized !== "string") {
    throw new SnapshotValidationError("snapshot must be JSON serializable");
  }
  if (new TextEncoder().encode(serialized).byteLength > MAX_SNAPSHOT_BYTES) {
    throw new SnapshotValidationError(
      `snapshot exceeds ${MAX_SNAPSHOT_BYTES} bytes`,
    );
  }
  const entries = countSnapshotEntries(value);
  if (entries > MAX_SNAPSHOT_ENTRIES) {
    throw new SnapshotValidationError(
      `snapshot exceeds ${MAX_SNAPSHOT_ENTRIES} entries`,
    );
  }
}

function normalizeSnapshotInput(input: unknown): SyncSnapshot {
  const value = assertRecord(input, "snapshot");
  assertSnapshotCapacity(value);
  const prompts = readArray(value, "prompts", true);
  const folders = readArray(value, "folders", true);
  const skills = readArray(value, "skills", true);
  const promptVersions =
    value.promptVersions === undefined
      ? readArray(value, "versions")
      : readArray(value, "promptVersions");
  const versions =
    value.versions === undefined
      ? promptVersions
      : readArray(value, "versions");
  const rules =
    value.rules === undefined ? undefined : readArray(value, "rules");
  const skillVersions =
    value.skillVersions === undefined ? [] : readArray(value, "skillVersions");
  const promptRelations = readOptionalArray(value, "promptRelations");
  const outputFormatItems = readOptionalArray(value, "outputFormatItems");
  const pluginPackages = readOptionalArray(value, "pluginPackages");
  const skillFiles = readOptionalRecord(value, "skillFiles");
  const mcpLibraryInput = readOptionalRecord(value, "mcpLibrary");
  const pluginLibraryInput = readOptionalRecord(value, "pluginLibrary");
  const storeSources = readOptionalRecord(value, "storeSources");
  const agentAssetFiles = readOptionalRecord(value, "agentAssetFiles");
  const settings =
    value.settings === undefined
      ? undefined
      : assertRecord(value.settings, "settings");
  const images = readOptionalRecord(value, "images");
  const videos = readOptionalRecord(value, "videos");

  if (
    mcpLibraryInput &&
    mcpLibraryInput.servers !== undefined &&
    !Array.isArray(mcpLibraryInput.servers)
  ) {
    throw new SnapshotValidationError("mcpLibrary.servers must be an array");
  }
  if (
    mcpLibraryInput &&
    mcpLibraryInput.bindings !== undefined &&
    !Array.isArray(mcpLibraryInput.bindings)
  ) {
    throw new SnapshotValidationError("mcpLibrary.bindings must be an array");
  }
  const mcpLibrary = mcpLibraryInput
    ? {
        ...mcpLibraryInput,
        servers: mcpLibraryInput.servers ?? [],
        bindings: mcpLibraryInput.bindings ?? [],
      }
    : undefined;
  if (
    pluginLibraryInput &&
    pluginLibraryInput.plugins !== undefined &&
    !Array.isArray(pluginLibraryInput.plugins)
  ) {
    throw new SnapshotValidationError("pluginLibrary.plugins must be an array");
  }
  const pluginLibrary = pluginLibraryInput
    ? { ...pluginLibraryInput, plugins: pluginLibraryInput.plugins ?? [] }
    : undefined;
  if (storeSources) {
    for (const field of ["skills", "mcp", "plugins"]) {
      const source = storeSources[field];
      if (source === undefined) continue;
      const sourceRecord = assertRecord(source, `storeSources.${field}`);
      if (
        sourceRecord.customStoreSources !== undefined &&
        !Array.isArray(sourceRecord.customStoreSources)
      ) {
        throw new SnapshotValidationError(
          `storeSources.${field}.customStoreSources must be an array`,
        );
      }
    }
  }
  if (skillFiles) {
    for (const [skillId, files] of Object.entries(skillFiles)) {
      if (!Array.isArray(files)) {
        throw new SnapshotValidationError(
          `skillFiles.${skillId} must be an array`,
        );
      }
    }
  }
  if (agentAssetFiles) {
    for (const field of ["mcp", "plugins"]) {
      if (
        agentAssetFiles[field] !== undefined &&
        !Array.isArray(agentAssetFiles[field])
      ) {
        throw new SnapshotValidationError(
          `agentAssetFiles.${field} must be an array`,
        );
      }
    }
  }
  validatePromptRecords(prompts, "prompts");
  validateFolderRecords(folders, "folders");
  validateSkillRecords(skills, "skills");
  validateVersionRecords(promptVersions, "promptVersions", "promptId");
  validateVersionRecords(skillVersions, "skillVersions", "skillId");
  if (versions !== promptVersions) {
    validateVersionRecords(versions, "versions", "promptId");
  }
  if (rules) {
    assertUniqueIds(rules, "rules");
  }
  if (promptRelations) {
    assertUniqueIds(promptRelations, "promptRelations");
  }
  if (outputFormatItems) {
    assertUniqueIds(outputFormatItems, "outputFormatItems");
  }
  if (pluginPackages) {
    assertUniqueIds(pluginPackages, "pluginPackages", "pluginId");
  }
  for (const [field, map] of [
    ["images", images],
    ["videos", videos],
  ] as const) {
    if (map && Object.values(map).some((entry) => typeof entry !== "string")) {
      throw new SnapshotValidationError(`${field} values must be strings`);
    }
  }

  return {
    version: normalizeVersion(value.version),
    exportedAt: normalizeTimestamp(value.exportedAt),
    prompts: prompts as SyncSnapshot["prompts"],
    promptVersions: promptVersions as SyncSnapshot["promptVersions"],
    versions: versions as SyncSnapshot["versions"],
    folders: folders as SyncSnapshot["folders"],
    rules: rules as SyncSnapshot["rules"],
    skills: skills as SyncSnapshot["skills"],
    skillVersions: skillVersions as SyncSnapshot["skillVersions"],
    skillFiles: skillFiles as SyncSnapshot["skillFiles"],
    mcpLibrary: mcpLibrary as SyncSnapshot["mcpLibrary"],
    pluginLibrary: pluginLibrary as SyncSnapshot["pluginLibrary"],
    pluginPackages: pluginPackages as SyncSnapshot["pluginPackages"],
    storeSources: storeSources as SyncSnapshot["storeSources"],
    agentAssetFiles: agentAssetFiles as SyncSnapshot["agentAssetFiles"],
    settings: settings as SyncSnapshot["settings"],
    settingsUpdatedAt:
      value.settingsUpdatedAt === undefined
        ? undefined
        : normalizeTimestamp(value.settingsUpdatedAt, "settingsUpdatedAt"),
    images: images as SyncSnapshot["images"],
    videos: videos as SyncSnapshot["videos"],
    promptRelations: promptRelations as SyncSnapshot["promptRelations"],
    outputFormatItems: outputFormatItems as SyncSnapshot["outputFormatItems"],
  };
}

export function emptySnapshot(): SyncSnapshot {
  const now = new Date().toISOString();
  return {
    version: "web-cloudflare-backup-v1",
    exportedAt: now,
    prompts: [],
    promptVersions: [],
    versions: [],
    folders: [],
    rules: [],
    skills: [],
    skillVersions: [],
    settings: {
      theme: "system",
      language: "zh",
      autoSave: true,
    },
    settingsUpdatedAt: now,
  };
}

export function normalizeSnapshot(input: unknown): SyncSnapshot {
  validateEncodedSkillSnapshots(input);
  return normalizeSnapshotInput(input);
}

export function snapshotCounts(snapshot: SyncSnapshot): {
  prompts: number;
  folders: number;
  rules: number;
  skills: number;
  mcpServers: number;
  plugins: number;
} {
  return {
    prompts: snapshot.prompts.length,
    folders: snapshot.folders.length,
    rules: snapshot.rules?.length ?? 0,
    skills: snapshot.skills.length,
    mcpServers: snapshot.mcpLibrary?.servers.length ?? 0,
    plugins: snapshot.pluginLibrary?.plugins.length ?? 0,
  };
}

async function getSnapshotRow(
  db: D1Database,
  userId: string,
): Promise<SnapshotRow | null> {
  return await db
    .prepare(
      "SELECT payload_json, exported_at, settings_updated_at FROM sync_snapshots WHERE user_id = ?",
    )
    .bind(userId)
    .first<{
      payload_json: string;
      exported_at: string;
      settings_updated_at: string | null;
    }>();
}

function parseStoredSnapshot(payloadJson: string): SyncSnapshot {
  if (new TextEncoder().encode(payloadJson).byteLength > MAX_SNAPSHOT_BYTES) {
    throw new HttpError(
      500,
      ErrorCode.INTERNAL_ERROR,
      "Stored snapshot exceeds the size limit",
    );
  }
  try {
    return normalizeSnapshot(JSON.parse(payloadJson));
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(
      500,
      ErrorCode.INTERNAL_ERROR,
      "Stored snapshot is not valid JSON",
    );
  }
}

export async function loadSnapshot(
  db: D1Database,
  userId: string,
): Promise<SyncSnapshot> {
  const row = await getSnapshotRow(db, userId);
  if (!row) {
    const snapshot = emptySnapshot();
    snapshotBindings.set(snapshot, { db, userId, baselinePayload: null });
    return snapshot;
  }
  const snapshot = parseStoredSnapshot(row.payload_json);
  snapshotBindings.set(snapshot, {
    db,
    userId,
    baselinePayload: row.payload_json,
  });
  return snapshot;
}

export async function saveSnapshot(
  db: D1Database,
  userId: string,
  snapshotInput: SyncSnapshot,
): Promise<ReturnType<typeof snapshotCounts>> {
  if (!isRecord(snapshotInput)) {
    throw new SnapshotValidationError("snapshot must be an object");
  }
  const binding = snapshotBindings.get(snapshotInput);
  if (!binding) {
    throw new SnapshotOutcomeUnknownError(
      "Snapshot must be loaded before it can be saved",
    );
  }
  if (binding && (binding.db !== db || binding.userId !== userId)) {
    throw new SnapshotIdentityError();
  }
  const snapshot = normalizeSnapshot(snapshotInput);
  const summary = snapshotCounts(snapshot);
  const updatedAt = Date.now();

  const baselinePayload = binding.baselinePayload;
  const payloadJson = JSON.stringify(snapshot);
  if (typeof payloadJson !== "string") {
    throw new SnapshotValidationError("snapshot must be JSON serializable");
  }
  const statement =
    baselinePayload === null
      ? db
          .prepare(
            `INSERT INTO sync_snapshots (
        user_id, payload_json, exported_at, settings_updated_at,
        prompts_count, folders_count, rules_count, skills_count, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO NOTHING`,
          )
          .bind(
            userId,
            payloadJson,
            snapshot.exportedAt,
            snapshot.settingsUpdatedAt ?? null,
            summary.prompts,
            summary.folders,
            summary.rules,
            summary.skills,
            updatedAt,
          )
      : db
          .prepare(
            `UPDATE sync_snapshots SET
        payload_json = ?, exported_at = ?, settings_updated_at = ?,
        prompts_count = ?, folders_count = ?, rules_count = ?, skills_count = ?, updated_at = ?
      WHERE user_id = ? AND payload_json = ?`,
          )
          .bind(
            payloadJson,
            snapshot.exportedAt,
            snapshot.settingsUpdatedAt ?? null,
            summary.prompts,
            summary.folders,
            summary.rules,
            summary.skills,
            updatedAt,
            userId,
            baselinePayload,
          );
  const result = await statement.run();
  const writeResult = result as unknown as {
    success?: unknown;
    meta?: { changes?: unknown };
  };
  const changes = writeResult.meta?.changes;
  if (changes === 0) {
    throw new SnapshotConflictError();
  }
  if (writeResult.success === false || changes !== 1) {
    throw new SnapshotOutcomeUnknownError();
  }
  snapshotBindings.set(snapshotInput, {
    db,
    userId,
    baselinePayload: payloadJson,
  });

  return summary;
}

export async function getSyncData(
  c: Context<{ Bindings: Env; Variables: { authUser: AuthUser } }>,
): Promise<Response> {
  const user = c.get("authUser");
  const snapshot = await loadSnapshot(c.env.DB, user.userId);
  try { assertSkillSnapshotCapability(snapshot, c.req.header(SKILL_SNAPSHOT_CAPABILITY_HEADER)); }
  catch (error) { return failure(c, 422, ErrorCode.VALIDATION_ERROR, error instanceof Error ? error.message : "Lossless Skill snapshot support is required"); }
  c.header(SKILL_SNAPSHOT_CAPABILITY_HEADER, SKILL_SNAPSHOT_CAPABILITY);
  return success(c, snapshot);
}

export async function getManifest(
  c: Context<{ Bindings: Env; Variables: { authUser: AuthUser } }>,
): Promise<Response> {
  const user = c.get("authUser");
  const row = await c.env.DB.prepare(
    "SELECT payload_json, exported_at, settings_updated_at, prompts_count, folders_count, rules_count, skills_count FROM sync_snapshots WHERE user_id = ?",
  )
    .bind(user.userId)
    .first<{
      exported_at: string;
      payload_json: string;
      settings_updated_at: string | null;
      prompts_count: number;
      folders_count: number;
      rules_count: number;
      skills_count: number;
    }>();

  const payloadCounts = row?.payload_json
    ? snapshotCounts(parseStoredSnapshot(row.payload_json))
    : undefined;

  return success(c, {
    version: "web-cloudflare-backup-v1",
    skillSnapshotCapability: SKILL_SNAPSHOT_CAPABILITY,
    exportedAt: row?.exported_at ?? new Date(0).toISOString(),
    counts: {
      prompts: row?.prompts_count ?? 0,
      folders: row?.folders_count ?? 0,
      rules: row?.rules_count ?? 0,
      skills: row?.skills_count ?? 0,
      mcpServers: payloadCounts?.mcpServers ?? 0,
      plugins: payloadCounts?.plugins ?? 0,
    },
    settingsUpdatedAt: row?.settings_updated_at ?? undefined,
    actor: {
      userId: user.userId,
      username: user.username,
      role: user.role,
    },
  });
}

export async function putSyncData(
  c: Context<{ Bindings: Env; Variables: { authUser: AuthUser } }>,
): Promise<Response> {
  const user = c.get("authUser");
  const body = await readJson<SyncPutBody>(c, { maxBytes: MAX_SNAPSHOT_BYTES });
  if (!isRecord(body) || body.payload === undefined) {
    return failure(c, 400, ErrorCode.BAD_REQUEST, "payload is required");
  }

  const snapshot = await loadSnapshot(c.env.DB, user.userId);
  let replacement: SyncSnapshot;
  try {
    replacement = normalizeSnapshot(body.payload);
    const capability = c.req.header(SKILL_SNAPSHOT_CAPABILITY_HEADER);
    assertSkillSnapshotCapability(snapshot, capability);
    assertSkillSnapshotCapability(replacement, capability);
  } catch (error) { return failure(c, 422, ErrorCode.VALIDATION_ERROR, error instanceof Error ? error.message : "Lossless Skill snapshot support is required"); }
  for (const key of Object.keys(snapshot)) {
    delete (snapshot as unknown as Record<string, unknown>)[key];
  }
  Object.assign(snapshot, replacement);
  const summary = await saveSnapshot(c.env.DB, user.userId, snapshot);

  return success(c, {
    ok: true,
    promptsImported: summary.prompts,
    foldersImported: summary.folders,
    rulesImported: summary.rules,
    skillsImported: summary.skills,
    mcpServersImported: summary.mcpServers,
    pluginsImported: summary.plugins,
    settingsUpdated: !!snapshot.settings,
    summary,
  });
}
