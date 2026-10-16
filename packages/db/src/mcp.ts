import Database from "./adapter";
import { MCP_DATABASE_COPY_BATCH_ROWS } from "./mcp-transfer";
import type {
  McpServerConfig,
  McpTargetBinding,
} from "@prompthub/shared/types/mcp";
import type {
  McpEncryptedSecret,
  McpStoredSecret,
  McpStorageState,
  McpStoredServer,
  McpStoredVersion,
} from "@prompthub/shared/types/mcp-storage";

interface ServerRow {
  id: string;
  name: string;
  display_name: string;
  transport: McpServerConfig["transport"];
  enabled: number;
  is_favorite: number;
  tags_json: string | null;
  notes: string | null;
  config_json: string;
  source_json: string;
  created_at: number;
  updated_at: number;
  current_version: number;
  max_version: number;
}
interface VersionRow {
  server_id: string;
  version: number;
  created_at: string;
  note: string | null;
  restored_from_version: number | null;
  semantic_digest: string;
  content_sha256: string;
  content_path: string;
}
interface ReferenceRow {
  field: "env" | "headers" | "oauth";
  entry_key: string;
  secret_ref: string;
}
interface BindingRow {
  id: string;
  target: McpTargetBinding["target"];
  scope: McpTargetBinding["scope"];
  path: string;
  enabled: number;
  created_at: number;
  updated_at: number;
  last_applied_at: number | null;
}
interface BindingServerRow {
  server_id: string;
  entry_digest_json: string | null;
}
interface SecretRow {
  ref: string;
  server_id: string;
  availability: "available" | "unavailable";
  key_id: string;
  iv: string;
  ciphertext: string;
  auth_tag: string;
}
interface StateRow {
  format_version: 1;
  device_id: string;
  key_id: string;
  adopted_at: string;
}

function rejectNullBytes(value: unknown): void {
  if (typeof value === "string" && value.includes("\0"))
    throw new Error("MCP storage input contains a null byte");
  if (Array.isArray(value)) value.forEach(rejectNullBytes);
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      rejectNullBytes(key);
      rejectNullBytes(item);
    }
  }
}
function serverFromRow(row: ServerRow): McpStoredServer {
  // SQLite rows and JSON are decoded only at this storage boundary; Core validates the domain contract.
  const config: Partial<McpServerConfig> = JSON.parse(row.config_json);
  return {
    server: {
      ...config,
      id: row.id,
      name: row.name,
      displayName: row.display_name,
      transport: row.transport,
      enabled: row.enabled === 1,
      isFavorite: row.is_favorite === 1,
      ...(row.tags_json === null ? {} : { tags: JSON.parse(row.tags_json) }),
      ...(row.notes === null ? {} : { notes: row.notes }),
      source: JSON.parse(row.source_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    currentVersion: row.current_version,
    maxVersion: row.max_version,
  };
}

export class McpDB {
  constructor(private readonly database: Database.Database) {}

  transaction<T>(operation: () => T): T {
    return this.database.transaction(() => {
      // Reserve the SQLite writer before reading a mutable MCP graph.
      this.database.run(
        "UPDATE mcp_storage_state SET adopted_at = adopted_at WHERE singleton = 1",
      );
      return operation();
    })();
  }
  state(): McpStorageState | null {
    // Adapter returns untyped SQLite rows; the schema fixes these columns and types.
    const row = this.database.get(
      "SELECT * FROM mcp_storage_state WHERE singleton = 1",
    ) as StateRow | undefined;
    return row
      ? {
          formatVersion: row.format_version,
          deviceId: row.device_id,
          keyId: row.key_id,
          adoptedAt: row.adopted_at,
        }
      : null;
  }
  putState(state: McpStorageState): void {
    rejectNullBytes(state);
    this.database.run(
      `INSERT INTO mcp_storage_state VALUES (1, ?, ?, ?, ?)
       ON CONFLICT(singleton) DO UPDATE SET format_version = excluded.format_version,
         device_id = excluded.device_id, key_id = excluded.key_id, adopted_at = excluded.adopted_at`,
      state.formatVersion,
      state.deviceId,
      state.keyId,
      state.adoptedAt,
    );
  }
  server(identifier: string): McpStoredServer | null {
    rejectNullBytes(identifier);
    // Adapter rows are typed at the schema boundary.
    const row = this.database.get(
      "SELECT * FROM mcp_servers WHERE id = ? OR name = ? ORDER BY id = ? DESC LIMIT 1",
      identifier,
      identifier,
      identifier,
    ) as ServerRow | undefined;
    return row ? serverFromRow(row) : null;
  }
  servers(): McpStoredServer[] {
    // Adapter rows are typed at the schema boundary.
    return (
      this.database.all("SELECT * FROM mcp_servers ORDER BY id") as ServerRow[]
    ).map(serverFromRow);
  }
  nameExists(name: string, exceptId: string): boolean {
    rejectNullBytes([name, exceptId]);
    return Boolean(
      this.database.get(
        "SELECT 1 FROM mcp_servers WHERE name = ? AND id <> ? LIMIT 1",
        name,
        exceptId,
      ),
    );
  }
  putServers(inputs: McpStoredServer[]): void {
    rejectNullBytes(inputs);
    this.database.transaction(() => {
      const occupied = new Set([
        ...this.servers().map((row) => row.server.name),
        ...inputs.map((row) => row.server.name),
      ]);
      let sequence = 0;
      // Release changed names inside this transaction without deleting rows or their credentials.
      for (const input of inputs) {
        let temporary: string;
        do {
          temporary = `__prompthub_name_transfer_${sequence++}`;
        } while (occupied.has(temporary));
        occupied.add(temporary);
        this.database.run(
          "UPDATE mcp_servers SET name = ? WHERE id = ?",
          temporary,
          input.server.id,
        );
      }
      for (const input of inputs) this.putServer(input);
    })();
  }
  putServer(input: McpStoredServer): void {
    rejectNullBytes(input);
    const {
      id,
      name,
      displayName,
      transport,
      enabled,
      isFavorite,
      tags,
      notes,
      source,
      createdAt,
      updatedAt,
      ...config
    } = input.server;
    this.database.run(
      `INSERT INTO mcp_servers (id, name, display_name, transport, enabled, is_favorite,
       tags_json, notes, config_json, source_json, created_at, updated_at, current_version, max_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, display_name = excluded.display_name,
       transport = excluded.transport, enabled = excluded.enabled, is_favorite = excluded.is_favorite,
       tags_json = excluded.tags_json, notes = excluded.notes, config_json = excluded.config_json,
       source_json = excluded.source_json, updated_at = excluded.updated_at,
       current_version = excluded.current_version, max_version = excluded.max_version`,
      id,
      name,
      displayName,
      transport,
      Number(enabled),
      Number(isFavorite ?? false),
      tags === undefined ? null : JSON.stringify(tags),
      notes ?? null,
      JSON.stringify(config),
      JSON.stringify(source),
      createdAt,
      updatedAt,
      input.currentVersion,
      input.maxVersion,
    );
  }
  deleteServer(id: string): void {
    this.database.run("DELETE FROM mcp_servers WHERE id = ?", id);
  }

  private versionFromRow(row: VersionRow): McpStoredVersion {
    const secretReferences: McpStoredVersion["secretReferences"] = {
      env: {},
      headers: {},
    };
    // Adapter rows are typed at the schema boundary.
    const refs = this.database.all(
      "SELECT field, entry_key, secret_ref FROM mcp_version_secrets WHERE server_id = ? AND version = ?",
      row.server_id,
      row.version,
    ) as ReferenceRow[];
    for (const ref of refs)
      Object.defineProperty(
        (secretReferences[ref.field] ??= {}),
        ref.entry_key,
        {
          value: ref.secret_ref,
          enumerable: true,
          writable: true,
          configurable: true,
        },
      );
    return {
      serverId: row.server_id,
      version: row.version,
      createdAt: row.created_at,
      ...(row.note === null ? {} : { note: row.note }),
      ...(row.restored_from_version === null
        ? {}
        : { restoredFromVersion: row.restored_from_version }),
      semanticDigest: row.semantic_digest,
      contentSha256: row.content_sha256,
      contentPath: row.content_path,
      secretReferences,
    };
  }
  version(id: string, version: number): McpStoredVersion | null {
    // Adapter rows are typed at the schema boundary.
    const row = this.database.get(
      "SELECT * FROM mcp_versions WHERE server_id = ? AND version = ?",
      id,
      version,
    ) as VersionRow | undefined;
    return row ? this.versionFromRow(row) : null;
  }
  versionPage(
    id: string,
    offset: number,
    limit: number,
  ): { total: number; items: McpStoredVersion[] } {
    // Adapter rows are typed at the schema boundary.
    const total = this.database.get(
      "SELECT COUNT(*) AS count FROM mcp_versions WHERE server_id = ?",
      id,
    ) as { count: number };
    const rows = this.database.all(
      "SELECT * FROM mcp_versions WHERE server_id = ? ORDER BY version DESC LIMIT ? OFFSET ?",
      id,
      limit,
      offset,
    ) as VersionRow[];
    return {
      total: total.count,
      items: rows.map((row) => this.versionFromRow(row)),
    };
  }
  putVersion(version: McpStoredVersion): void {
    rejectNullBytes(version);
    this.database.run(
      "INSERT INTO mcp_versions VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      version.serverId,
      version.version,
      version.createdAt,
      version.note ?? null,
      version.restoredFromVersion ?? null,
      version.semanticDigest,
      version.contentSha256,
      version.contentPath,
    );
    for (const field of ["env", "headers", "oauth"] as const) {
      for (const [key, ref] of Object.entries(
        version.secretReferences[field] ?? {},
      )) {
        this.database.run(
          "INSERT INTO mcp_version_secrets VALUES (?, ?, ?, ?, ?)",
          version.serverId,
          version.version,
          field,
          key,
          ref,
        );
      }
    }
  }
  updateVersionNote(id: string, version: number, note: string): void {
    rejectNullBytes(note);
    this.database.run(
      "UPDATE mcp_versions SET note = ? WHERE server_id = ? AND version = ?",
      note,
      id,
      version,
    );
  }
  deleteVersion(id: string, version: number): void {
    this.database.run(
      "DELETE FROM mcp_versions WHERE server_id = ? AND version = ?",
      id,
      version,
    );
  }
  hasContentPath(contentPath: string): boolean {
    return Boolean(
      this.database.get(
        "SELECT 1 FROM mcp_versions WHERE content_path = ?",
        contentPath,
      ),
    );
  }
  changeContentPath(previousPath: string, nextPath: string): void {
    rejectNullBytes(nextPath);
    this.database.run(
      "UPDATE mcp_versions SET content_path = ? WHERE content_path = ?",
      nextPath,
      previousPath,
    );
  }
  *historicalContents(): Generator<
    Pick<
      McpStoredVersion,
      "serverId" | "version" | "contentPath" | "contentSha256"
    >
  > {
    let cursor = 0;
    for (;;) {
      // Adapter rows are typed at the schema boundary; rowid is used only for bounded iteration.
      const rows = this.database.all(
        "SELECT rowid AS position, server_id, version, content_path, content_sha256 FROM mcp_versions WHERE rowid > ? ORDER BY rowid LIMIT ?",
        cursor,
        MCP_DATABASE_COPY_BATCH_ROWS,
      ) as Array<{
        position: number;
        server_id: string;
        version: number;
        content_path: string;
        content_sha256: string;
      }>;
      if (!rows.length) return;
      for (const row of rows) {
        cursor = row.position;
        yield {
          serverId: row.server_id,
          version: row.version,
          contentPath: row.content_path,
          contentSha256: row.content_sha256,
        };
      }
    }
  }
  pruneSecrets(): void {
    this.database.run(
      "DELETE FROM mcp_secrets WHERE ref NOT IN (SELECT secret_ref FROM mcp_version_secrets)",
    );
  }
  secret(ref: string): McpStoredSecret | null {
    // Adapter rows are typed at the schema boundary.
    const row = this.database.get(
      "SELECT * FROM mcp_secrets WHERE ref = ?",
      ref,
    ) as SecretRow | undefined;
    if (!row) return null;
    if (row.availability === "unavailable")
      return {
        ref: row.ref,
        serverId: row.server_id,
        availability: "unavailable",
      };
    return {
      ref: row.ref,
      serverId: row.server_id,
      availability: "available",
      keyId: row.key_id,
      iv: row.iv,
      ciphertext: row.ciphertext,
      authTag: row.auth_tag,
    };
  }
  hasSecretsForKey(keyId: string): boolean {
    return Boolean(
      this.database.get(
        "SELECT 1 FROM mcp_secrets WHERE key_id = ? LIMIT 1",
        keyId,
      ),
    );
  }
  putSecret(secret: McpEncryptedSecret): void {
    rejectNullBytes(secret);
    this.database.run(
      "INSERT INTO mcp_secrets VALUES (?, ?, 'available', ?, ?, ?, ?)",
      secret.ref,
      secret.serverId,
      secret.keyId,
      secret.iv,
      secret.ciphertext,
      secret.authTag,
    );
  }
  putUnavailableSecret(ref: string, serverId: string): void {
    rejectNullBytes([ref, serverId]);
    this.database.run(
      "INSERT INTO mcp_secrets VALUES (?, ?, 'unavailable', NULL, NULL, NULL, NULL)",
      ref,
      serverId,
    );
  }
  resolveUnavailableSecret(secret: McpEncryptedSecret): void {
    rejectNullBytes(secret);
    this.database.run(
      "UPDATE mcp_secrets SET availability = 'available', key_id = ?, iv = ?, ciphertext = ?, auth_tag = ? WHERE ref = ? AND server_id = ? AND availability = 'unavailable'",
      secret.keyId,
      secret.iv,
      secret.ciphertext,
      secret.authTag,
      secret.ref,
      secret.serverId,
    );
  }
  unavailableSecrets(): Array<{ ref: string; serverId: string }> {
    // Adapter rows are typed at the schema boundary.
    const rows = this.database.all(
      "SELECT ref, server_id FROM mcp_secrets WHERE availability = 'unavailable'",
    ) as Array<{ ref: string; server_id: string }>;
    return rows.map((row) => ({ ref: row.ref, serverId: row.server_id }));
  }
  hasUnavailableSecrets(): boolean {
    return Boolean(
      this.database.get(
        "SELECT 1 FROM mcp_secrets WHERE availability = 'unavailable' LIMIT 1",
      ),
    );
  }
  bindings(): McpTargetBinding[] {
    // Adapter rows are typed at the schema boundary.
    return (
      this.database.all(
        "SELECT * FROM mcp_bindings ORDER BY id",
      ) as BindingRow[]
    ).map((row) => {
      const servers = this.database.all(
        "SELECT server_id, entry_digest_json FROM mcp_binding_servers WHERE binding_id = ? ORDER BY position",
        row.id,
      ) as BindingServerRow[];
      const entryDigests = Object.fromEntries(
        servers
          .filter((entry) => entry.entry_digest_json !== null)
          .map((entry) => [
            entry.server_id,
            JSON.parse(entry.entry_digest_json!),
          ]),
      );
      return {
        id: row.id,
        target: row.target,
        scope: row.scope,
        path: row.path,
        enabled: row.enabled === 1,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        serverIds: servers.map((entry) => entry.server_id),
        ...(Object.keys(entryDigests).length === 0 ? {} : { entryDigests }),
        ...(row.last_applied_at === null
          ? {}
          : { lastAppliedAt: row.last_applied_at }),
      };
    });
  }
  putBinding(binding: McpTargetBinding): void {
    rejectNullBytes(binding);
    this.database.run(
      "INSERT OR REPLACE INTO mcp_bindings VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      binding.id,
      binding.target,
      binding.scope,
      binding.path,
      Number(binding.enabled),
      binding.createdAt,
      binding.updatedAt,
      binding.lastAppliedAt ?? null,
    );
    binding.serverIds.forEach((id, position) =>
      this.database.run(
        "INSERT INTO mcp_binding_servers VALUES (?, ?, ?, ?)",
        binding.id,
        id,
        position,
        binding.entryDigests?.[id] === undefined
          ? null
          : JSON.stringify(binding.entryDigests[id]),
      ),
    );
  }
  clearBindings(): void {
    this.database.run("DELETE FROM mcp_bindings");
  }
}
