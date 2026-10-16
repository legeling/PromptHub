import { v4 as uuidv4 } from "uuid";
import type {
  AgentManagementBackup,
  AgentProviderModelMapping,
  AgentProviderProfile,
  AgentProviderProfileSource,
  AgentProviderSnapshot,
  AgentProviderSnapshotOperation,
  AgentProviderSnapshotResult,
  CreateAgentProviderModelMappingInput,
  CreateAgentProviderProfileInput,
  CreateAgentProviderSnapshotInput,
  UpdateAgentProviderProfileInput,
  UpsertAgentProviderModelMappingInput,
} from "@prompthub/shared";
import { parseAgentManagementBackup } from "@prompthub/shared/utils/agent-management-backup";
import {
  assertAgentProviderPublicConfig,
  normalizeAgentProviderEndpoint,
} from "@prompthub/shared/utils/agent-provider-config";
import Database from "./adapter";

interface AgentProviderProfileRow {
  id: string;
  platform_id: string;
  name: string;
  provider_kind: string;
  protocol: string;
  endpoint: string | null;
  config_json: string;
  secret_ref: string | null;
  source: AgentProviderProfileSource;
  archived: number;
  created_at: number;
  updated_at: number;
}

interface AgentProviderModelMappingRow {
  id: string;
  provider_profile_id: string;
  route_key: string;
  model_id: string;
  parameters_json: string;
}

interface AgentProviderSnapshotRow {
  id: string;
  platform_id: string;
  provider_profile_id: string | null;
  native_digest: string;
  redacted_snapshot: string;
  backup_ref: string | null;
  operation: AgentProviderSnapshotOperation;
  result: AgentProviderSnapshotResult;
  created_at: number;
}

const MODEL_MAPPING_QUERY_BATCH_SIZE = 400;

function requireText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${field} is required`);
  }
  return normalized;
}

function serializeObject(
  value: Record<string, unknown>,
  field: string,
  requirePublicConfig = false,
): string {
  if (
    value === null ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    throw new Error(`${field} must be a plain object`);
  }
  if (requirePublicConfig) assertAgentProviderPublicConfig(value);
  return JSON.stringify(value);
}

function parseObject(value: string, field: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value);
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error(`Invalid ${field} in database`);
  }
  return parsed as Record<string, unknown>;
}

function parsePublicObject(
  value: string,
  field: string,
): Record<string, unknown> {
  const parsed = parseObject(value, field);
  assertAgentProviderPublicConfig(parsed);
  return parsed;
}

export class AgentProviderProfileDB {
  constructor(protected readonly db: Database.Database) {}

  createProfile(input: CreateAgentProviderProfileInput): AgentProviderProfile {
    const id = uuidv4();
    const now = Date.now();
    this.db.run(
      `INSERT INTO agent_provider_profiles (
        id, platform_id, name, provider_kind, protocol, endpoint, config_json,
        secret_ref, source, archived, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      id,
      requireText(input.platformId, "platformId"),
      requireText(input.name, "name"),
      requireText(input.providerKind, "providerKind"),
      requireText(input.protocol, "protocol"),
      normalizeAgentProviderEndpoint(input.endpoint),
      serializeObject(input.config, "config", true),
      input.secretRef?.trim() || null,
      input.source,
      now,
      now,
    );
    return this.getRequiredProfile(id);
  }

  createProfileWithMappings(
    input: CreateAgentProviderProfileInput,
    mappings: CreateAgentProviderModelMappingInput[],
  ): AgentProviderProfile {
    return this.db.transaction(() => {
      const profile = this.createProfile(input);
      for (const mapping of mappings) {
        this.upsertModelMapping({
          providerProfileId: profile.id,
          ...mapping,
        });
      }
      return profile;
    })();
  }

  getProfileById(id: string): AgentProviderProfile | null {
    const row = this.db.get(
      "SELECT * FROM agent_provider_profiles WHERE id = ?",
      id,
    ) as AgentProviderProfileRow | undefined;
    return row ? this.profileFromRow(row) : null;
  }

  listProfiles(
    options: {
      platformId?: string;
      includeArchived?: boolean;
    } = {},
  ): AgentProviderProfile[] {
    const where: string[] = [];
    const params: unknown[] = [];
    if (options.platformId) {
      where.push("platform_id = ?");
      params.push(options.platformId);
    }
    if (!options.includeArchived) {
      where.push("archived = 0");
    }
    const rows = this.db.all(
      `SELECT * FROM agent_provider_profiles
       ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY updated_at DESC, id ASC`,
      ...params,
    ) as AgentProviderProfileRow[];
    return rows.map((row) => this.profileFromRow(row));
  }

  updateProfile(
    id: string,
    input: UpdateAgentProviderProfileInput,
    expectedUpdatedAt: number,
  ): AgentProviderProfile {
    const existing = this.getRequiredProfile(id);
    const assignments: string[] = [];
    const params: unknown[] = [];

    const add = (column: string, value: unknown): void => {
      assignments.push(`${column} = ?`);
      params.push(value);
    };
    if (input.name !== undefined) add("name", requireText(input.name, "name"));
    if (input.providerKind !== undefined) {
      add("provider_kind", requireText(input.providerKind, "providerKind"));
    }
    if (input.protocol !== undefined) {
      add("protocol", requireText(input.protocol, "protocol"));
    }
    if (input.endpoint !== undefined) {
      add("endpoint", normalizeAgentProviderEndpoint(input.endpoint));
    }
    if (input.config !== undefined) {
      add("config_json", serializeObject(input.config, "config", true));
    }
    if (input.secretRef !== undefined) {
      add("secret_ref", input.secretRef?.trim() || null);
    }
    if (input.source !== undefined) add("source", input.source);
    if (assignments.length === 0) return existing;

    const updatedAt = Math.max(Date.now(), existing.updatedAt + 1);
    assignments.push("updated_at = ?");
    params.push(updatedAt, id, expectedUpdatedAt);
    const result = this.db.run(
      `UPDATE agent_provider_profiles
       SET ${assignments.join(", ")}
       WHERE id = ? AND updated_at = ?`,
      ...params,
    );
    if (result.changes !== 1) {
      throw new Error("Provider profile changed externally");
    }
    return this.getRequiredProfile(id);
  }

  updateProfileWithMappings(
    id: string,
    input: UpdateAgentProviderProfileInput,
    expectedUpdatedAt: number,
    mappings?: CreateAgentProviderModelMappingInput[],
  ): AgentProviderProfile {
    return this.db.transaction(() => {
      let updated: AgentProviderProfile;
      if (Object.keys(input).length > 0) {
        updated = this.updateProfile(id, input, expectedUpdatedAt);
      } else if (mappings !== undefined) {
        const existing = this.getRequiredProfile(id);
        const updatedAt = Math.max(Date.now(), existing.updatedAt + 1);
        const result = this.db.run(
          `UPDATE agent_provider_profiles
           SET updated_at = ?
           WHERE id = ? AND updated_at = ?`,
          updatedAt,
          id,
          expectedUpdatedAt,
        );
        if (result.changes !== 1) {
          throw new Error("Provider profile changed externally");
        }
        updated = this.getRequiredProfile(id);
      } else {
        updated = this.getRequiredProfile(id);
        if (updated.updatedAt !== expectedUpdatedAt) {
          throw new Error("Provider profile changed externally");
        }
      }

      if (mappings !== undefined) {
        this.db.run(
          "DELETE FROM agent_provider_model_mappings WHERE provider_profile_id = ?",
          id,
        );
        for (const mapping of mappings) {
          this.upsertModelMapping({
            providerProfileId: id,
            ...mapping,
          });
        }
      }
      return updated;
    })();
  }

  archiveProfile(id: string, expectedUpdatedAt: number): AgentProviderProfile {
    const existing = this.getRequiredProfile(id);
    if (existing.archived) return existing;
    const updatedAt = Math.max(Date.now(), existing.updatedAt + 1);
    const result = this.db.run(
      `UPDATE agent_provider_profiles
       SET archived = 1, updated_at = ?
       WHERE id = ? AND updated_at = ?`,
      updatedAt,
      id,
      expectedUpdatedAt,
    );
    if (result.changes !== 1) {
      throw new Error("Provider profile changed externally");
    }
    return this.getRequiredProfile(id);
  }

  deleteProfile(id: string): boolean {
    return (
      this.db.run("DELETE FROM agent_provider_profiles WHERE id = ?", id)
        .changes === 1
    );
  }

  upsertModelMapping(
    input: UpsertAgentProviderModelMappingInput,
  ): AgentProviderModelMapping {
    const providerProfileId = requireText(
      input.providerProfileId,
      "providerProfileId",
    );
    const routeKey = requireText(input.routeKey, "routeKey");
    const modelId = requireText(input.modelId, "modelId");
    const existing = this.db.get(
      `SELECT id FROM agent_provider_model_mappings
       WHERE provider_profile_id = ? AND route_key = ?`,
      providerProfileId,
      routeKey,
    ) as { id: string } | undefined;
    const id = existing?.id ?? uuidv4();

    this.db.run(
      `INSERT INTO agent_provider_model_mappings (
        id, provider_profile_id, route_key, model_id, parameters_json
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(provider_profile_id, route_key) DO UPDATE SET
        model_id = excluded.model_id,
        parameters_json = excluded.parameters_json`,
      id,
      providerProfileId,
      routeKey,
      modelId,
      serializeObject(input.parameters, "parameters", true),
    );
    return this.getRequiredModelMapping(id);
  }

  listModelMappings(providerProfileId: string): AgentProviderModelMapping[] {
    const rows = this.db.all(
      `SELECT * FROM agent_provider_model_mappings
       WHERE provider_profile_id = ?
       ORDER BY route_key ASC`,
      providerProfileId,
    ) as AgentProviderModelMappingRow[];
    return rows.map((row) => this.mappingFromRow(row));
  }

  listModelMappingsForProfiles(
    providerProfileIds: string[],
  ): AgentProviderModelMapping[] {
    const ids = Array.from(
      new Set(
        providerProfileIds.map((id) => requireText(id, "providerProfileId")),
      ),
    );
    const mappings: AgentProviderModelMapping[] = [];
    for (
      let offset = 0;
      offset < ids.length;
      offset += MODEL_MAPPING_QUERY_BATCH_SIZE
    ) {
      const batch = ids.slice(offset, offset + MODEL_MAPPING_QUERY_BATCH_SIZE);
      const placeholders = batch.map(() => "?").join(", ");
      const rows = this.db.all(
        `SELECT * FROM agent_provider_model_mappings
         WHERE provider_profile_id IN (${placeholders})
         ORDER BY provider_profile_id ASC, route_key ASC`,
        ...batch,
      ) as AgentProviderModelMappingRow[];
      mappings.push(...rows.map((row) => this.mappingFromRow(row)));
    }
    return mappings;
  }

  createSnapshot(
    input: CreateAgentProviderSnapshotInput,
  ): AgentProviderSnapshot {
    const id = uuidv4();
    const createdAt = Date.now();
    this.db.run(
      `INSERT INTO agent_provider_snapshots (
        id, platform_id, provider_profile_id, native_digest,
        redacted_snapshot, backup_ref, operation, result, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      requireText(input.platformId, "platformId"),
      input.providerProfileId || null,
      requireText(input.nativeDigest, "nativeDigest"),
      serializeObject(input.redactedSnapshot, "redactedSnapshot", true),
      input.backupRef?.trim() || null,
      input.operation,
      input.result,
      createdAt,
    );
    return this.getRequiredSnapshot(id);
  }

  listSnapshots(options: {
    platformId: string;
    limit?: number;
  }): AgentProviderSnapshot[] {
    const limit = options.limit ?? 100;
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new Error("Snapshot limit must be between 1 and 500");
    }
    const rows = this.db.all(
      `SELECT * FROM agent_provider_snapshots
       WHERE platform_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
      requireText(options.platformId, "platformId"),
      limit,
    ) as AgentProviderSnapshotRow[];
    return rows.map((row) => this.snapshotFromRow(row));
  }

  listSnapshotsForBackup(limit = 5_000): AgentProviderSnapshot[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 5_000) {
      throw new Error("Snapshot backup limit must be between 1 and 5000");
    }
    const rows = this.db.all(
      `SELECT * FROM agent_provider_snapshots
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
      limit,
    ) as AgentProviderSnapshotRow[];
    return rows.map((row) => this.snapshotFromRow(row));
  }

  replacePortableBackup(input: AgentManagementBackup): void {
    const backup = parseAgentManagementBackup(input);
    this.db.transaction(() => {
      this.db.run("DELETE FROM agent_provider_snapshots");
      this.db.run("DELETE FROM agent_provider_model_mappings");
      this.db.run("DELETE FROM agent_provider_profiles");
      for (const item of backup.providerProfiles) {
        this.insertPortableProfile(item);
      }
      for (const snapshot of backup.snapshots) {
        this.db.run(
          `INSERT INTO agent_provider_snapshots (
            id, platform_id, provider_profile_id, native_digest,
            redacted_snapshot, backup_ref, operation, result, created_at
          ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
          snapshot.id,
          snapshot.platformId,
          snapshot.providerProfileId,
          snapshot.nativeDigest,
          serializeObject(snapshot.redactedSnapshot, "redactedSnapshot", true),
          snapshot.operation,
          snapshot.result,
          snapshot.createdAt,
        );
      }
    })();
  }

  insertProfileGraphDirect(
    profile: AgentProviderProfile,
    mappings: AgentProviderModelMapping[],
  ): void {
    this.db.transaction(() => {
      this.db.run(
        `INSERT INTO agent_provider_profiles (
          id, platform_id, name, provider_kind, protocol, endpoint, config_json,
          secret_ref, source, archived, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        profile.id,
        requireText(profile.platformId, "platformId"),
        requireText(profile.name, "name"),
        requireText(profile.providerKind, "providerKind"),
        requireText(profile.protocol, "protocol"),
        normalizeAgentProviderEndpoint(profile.endpoint),
        serializeObject(profile.config, "config", true),
        profile.secretRef?.trim() || null,
        profile.source,
        profile.archived ? 1 : 0,
        profile.createdAt,
        profile.updatedAt,
      );
      for (const mapping of mappings) {
        if (mapping.providerProfileId !== profile.id) {
          throw new Error("Provider model mapping does not belong to profile");
        }
        this.db.run(
          `INSERT INTO agent_provider_model_mappings (
            id, provider_profile_id, route_key, model_id, parameters_json
          ) VALUES (?, ?, ?, ?, ?)`,
          mapping.id,
          profile.id,
          requireText(mapping.routeKey, "routeKey"),
          requireText(mapping.modelId, "modelId"),
          serializeObject(mapping.parameters, "parameters", true),
        );
      }
    })();
  }

  /** Replaces public graph data without deleting the profile's local snapshot links. */
  replaceProfileGraphDirect(
    profile: AgentProviderProfile,
    mappings: AgentProviderModelMapping[],
  ): void {
    this.db.transaction(() => {
      if (!this.getProfileById(profile.id)) {
        this.insertProfileGraphDirect(profile, mappings);
        return;
      }
      this.db.run(
        `UPDATE agent_provider_profiles SET
          platform_id = ?, name = ?, provider_kind = ?, protocol = ?, endpoint = ?,
          config_json = ?, secret_ref = ?, source = ?, archived = ?, created_at = ?, updated_at = ?
         WHERE id = ?`,
        requireText(profile.platformId, "platformId"), requireText(profile.name, "name"),
        requireText(profile.providerKind, "providerKind"), requireText(profile.protocol, "protocol"),
        normalizeAgentProviderEndpoint(profile.endpoint), serializeObject(profile.config, "config", true),
        profile.secretRef?.trim() || null, profile.source, profile.archived ? 1 : 0,
        profile.createdAt, profile.updatedAt, profile.id,
      );
      this.db.run("DELETE FROM agent_provider_model_mappings WHERE provider_profile_id = ?", profile.id);
      for (const mapping of mappings) {
        if (mapping.providerProfileId !== profile.id)
          throw new Error("Provider model mapping does not belong to profile");
        this.db.run(
          `INSERT INTO agent_provider_model_mappings
           (id, provider_profile_id, route_key, model_id, parameters_json) VALUES (?, ?, ?, ?, ?)`,
          mapping.id, profile.id, requireText(mapping.routeKey, "routeKey"),
          requireText(mapping.modelId, "modelId"), serializeObject(mapping.parameters, "parameters", true),
        );
      }
    })();
  }

  getLatestVerifiedSnapshot(platformId: string): AgentProviderSnapshot | null {
    const row = this.db.get(
      `SELECT * FROM agent_provider_snapshots
       WHERE platform_id = ? AND result = 'verified'
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      requireText(platformId, "platformId"),
    ) as AgentProviderSnapshotRow | undefined;
    return row ? this.snapshotFromRow(row) : null;
  }

  private insertPortableProfile(
    item: AgentManagementBackup["providerProfiles"][number],
  ): void {
    const { profile } = item;
    this.db.run(
      `INSERT INTO agent_provider_profiles (
        id, platform_id, name, provider_kind, protocol, endpoint, config_json,
        secret_ref, source, archived, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      item.id,
      profile.platformId,
      profile.name,
      profile.providerKind,
      profile.protocol,
      normalizeAgentProviderEndpoint(profile.endpoint),
      serializeObject(profile.config, "config", true),
      item.requiresSecret ? `agent-provider:${item.id}` : null,
      profile.source,
      item.archived ? 1 : 0,
      item.createdAt,
      item.updatedAt,
    );
    for (const mapping of item.modelMappings) {
      this.db.run(
        `INSERT INTO agent_provider_model_mappings (
          id, provider_profile_id, route_key, model_id, parameters_json
        ) VALUES (?, ?, ?, ?, ?)`,
        uuidv4(),
        item.id,
        mapping.routeKey,
        mapping.modelId,
        serializeObject(mapping.parameters, "parameters", true),
      );
    }
  }

  private getRequiredProfile(id: string): AgentProviderProfile {
    const profile = this.getProfileById(id);
    if (!profile) throw new Error("Provider profile not found");
    return profile;
  }

  private getRequiredModelMapping(id: string): AgentProviderModelMapping {
    const row = this.db.get(
      "SELECT * FROM agent_provider_model_mappings WHERE id = ?",
      id,
    ) as AgentProviderModelMappingRow | undefined;
    if (!row) throw new Error("Provider model mapping not found");
    return this.mappingFromRow(row);
  }

  private getRequiredSnapshot(id: string): AgentProviderSnapshot {
    const row = this.db.get(
      "SELECT * FROM agent_provider_snapshots WHERE id = ?",
      id,
    ) as AgentProviderSnapshotRow | undefined;
    if (!row) throw new Error("Provider snapshot not found");
    return this.snapshotFromRow(row);
  }

  private profileFromRow(row: AgentProviderProfileRow): AgentProviderProfile {
    return {
      id: row.id,
      platformId: row.platform_id,
      name: row.name,
      providerKind: row.provider_kind,
      protocol: row.protocol,
      endpoint: normalizeAgentProviderEndpoint(row.endpoint),
      config: parsePublicObject(row.config_json, "provider config"),
      secretRef: row.secret_ref,
      source: row.source,
      archived: row.archived === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mappingFromRow(
    row: AgentProviderModelMappingRow,
  ): AgentProviderModelMapping {
    return {
      id: row.id,
      providerProfileId: row.provider_profile_id,
      routeKey: row.route_key,
      modelId: row.model_id,
      parameters: parsePublicObject(row.parameters_json, "mapping parameters"),
    };
  }

  private snapshotFromRow(
    row: AgentProviderSnapshotRow,
  ): AgentProviderSnapshot {
    return {
      id: row.id,
      platformId: row.platform_id,
      providerProfileId: row.provider_profile_id,
      nativeDigest: row.native_digest,
      redactedSnapshot: parsePublicObject(
        row.redacted_snapshot,
        "redacted snapshot",
      ),
      backupRef: row.backup_ref,
      operation: row.operation,
      result: row.result,
      createdAt: row.created_at,
    };
  }
}
