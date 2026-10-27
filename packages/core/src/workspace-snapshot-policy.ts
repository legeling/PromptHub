import path from "node:path";
import type { DatabaseAdapter } from "@prompthub/db";
import {
  DEVICE_RENDERER_SETTING_KEYS,
  FLAT_SECRET_FIELDS,
} from "./renderer-persistence-policy";

// This is the device/credential boundary, not an enumeration of business data.
export const SNAPSHOT_DEVICE_SETTINGS = new Set([
  ...DEVICE_RENDERER_SETTING_KEYS,
  ...FLAT_SECRET_FIELDS,
  "master_password",
  "notificationUpdateReceipts",
  "desktopWindowState",
  "recoveryPaths",
  "selfHostedDeviceId",
]);
const ROOT_REFERENCE = "prompthub-root:/";
const RESOURCE_PATH_COLUMNS = [
  ["skills", "local_repo_path"],
  ["skills", "canonical_skill_path"],
  ["rules", "managed_path"],
  ["rule_versions", "file_path"],
  ["mcp_versions", "content_path"],
  ["canonical_resources", "manifest_path"],
] as const;

function columns(db: DatabaseAdapter.Database, table: string): Set<string> {
  // Table names come only from the owned static policy, never archive input.
  const rows = db.pragma(`table_info("${table}")`) as Array<{ name: string }>;
  return new Set(rows.map((row) => row.name));
}
function scrubSettings(db: DatabaseAdapter.Database): void {
  for (const key of SNAPSHOT_DEVICE_SETTINGS) {
    db.run("DELETE FROM settings WHERE key=?", key);
    db.run("DELETE FROM user_settings WHERE key=?", key);
  }
  for (const table of ["settings", "user_settings"]) {
    for (const key of ["aiProviders", "aiModels"]) {
      const rows = db.all(
        `SELECT rowid,value FROM "${table}" WHERE key=?`,
        key,
      ) as Array<{ rowid: number; value: string }>;
      for (const row of rows) {
        const entries: unknown = JSON.parse(row.value);
        if (!Array.isArray(entries))
          throw new Error("Invalid stored AI settings");
        for (const entry of entries) {
          if (!entry || typeof entry !== "object")
            throw new Error("Invalid stored AI entry");
          for (const field of ["apiKey", "apiKeyRef"]) delete entry[field];
        }
        db.run(
          `UPDATE "${table}" SET value=? WHERE rowid=?`,
          JSON.stringify(entries),
          row.rowid,
        );
      }
    }
  }
}

function relocatePath(value: string, root: string, exporting: boolean): string {
  if (exporting && path.isAbsolute(value)) {
    const relative = path.relative(root, value);
    if (
      relative === "" ||
      (!relative.startsWith(".." + path.sep) &&
        relative !== ".." &&
        !path.isAbsolute(relative))
    )
      return ROOT_REFERENCE + relative.split(path.sep).join("/");
  } else if (!exporting && value.startsWith(ROOT_REFERENCE)) {
    const relative = value.slice(ROOT_REFERENCE.length);
    if (
      relative.includes("\\") ||
      relative.split("/").includes("..") ||
      path.posix.isAbsolute(relative) ||
      relative.includes("\0")
    )
      throw new Error("Unsafe snapshot resource reference");
    return path.join(root, relative);
  }
  return value;
}
export function relocateSnapshotPaths(
  db: DatabaseAdapter.Database,
  root: string,
  exporting: boolean,
): void {
  for (const [table, column] of RESOURCE_PATH_COLUMNS) {
    if (!columns(db, table).has(column)) continue;
    const rows = db.all(
      `SELECT DISTINCT "${column}" AS value FROM "${table}" WHERE "${column}" IS NOT NULL`,
    ) as Array<{ value: string }>;
    for (const { value } of rows) {
      const replacement = relocatePath(value, root, exporting);
      if (replacement !== value)
        db.run(
          `UPDATE "${table}" SET "${column}"=? WHERE "${column}"=?`,
          replacement,
          value,
        );
    }
  }
  for (const table of ["plugins", "plugin_versions"]) {
    const rows = db.all(`SELECT id,metadata_json FROM "${table}"`) as Array<{
      id: string;
      metadata_json: string;
    }>;
    for (const row of rows) {
      const metadata: unknown = JSON.parse(row.metadata_json);
      if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
        throw new Error("Invalid Plugin metadata");
      if (
        !("localPackagePath" in metadata) ||
        typeof metadata.localPackagePath !== "string"
      )
        continue;
      const relocated = relocatePath(
        metadata.localPackagePath,
        root,
        exporting,
      );
      if (relocated === metadata.localPackagePath) continue;
      metadata.localPackagePath = relocated;
      db.run(
        `UPDATE "${table}" SET metadata_json=? WHERE id=?`,
        JSON.stringify(metadata),
        row.id,
      );
    }
  }
}

function detachRuleDeploymentPaths(db: DatabaseAdapter.Database): void {
  db.run(
    "UPDATE rules SET target_path='',project_root_path=NULL,sync_status='target-missing'",
  );
}

export function sanitizeSnapshotDatabase(
  db: DatabaseAdapter.Database,
  root: string,
): void {
  db.transaction(() => {
    scrubSettings(db);
    db.run("DELETE FROM refresh_tokens");
    detachRuleDeploymentPaths(db);
    db.run("UPDATE users SET password_hash=''");
    // Reference identities survive; secret bytes and machine deployment bindings do not.
    db.run(
      "UPDATE mcp_secrets SET availability='unavailable',key_id=NULL,iv=NULL,ciphertext=NULL,auth_tag=NULL",
    );
    db.run("DELETE FROM mcp_binding_servers");
    db.run("DELETE FROM mcp_bindings");
    relocateSnapshotPaths(db, root, true);
  })();
  // Deleted credentials must not remain in free SQLite pages of a portable copy.
  db.exec("VACUUM");
}

export function retainSnapshotDeviceState(
  candidate: DatabaseAdapter.Database,
  local: DatabaseAdapter.Database,
): void {
  candidate.transaction(() => {
    detachRuleDeploymentPaths(candidate);
    for (const key of SNAPSHOT_DEVICE_SETTINGS) {
      candidate.run("DELETE FROM settings WHERE key=?", key);
      const row = local.get("SELECT value FROM settings WHERE key=?", key) as
        | { value: string }
        | undefined;
      if (row)
        candidate.run(
          "INSERT INTO settings (key,value) VALUES (?,?)",
          key,
          row.value,
        );
    }
    // Stable AI identities retain this device's credential references, without decrypting the vault.
    for (const key of ["aiProviders", "aiModels"]) {
      const incoming = candidate.get(
        "SELECT value FROM settings WHERE key=?",
        key,
      ) as { value: string } | undefined;
      const previous = local.get(
        "SELECT value FROM settings WHERE key=?",
        key,
      ) as { value: string } | undefined;
      if (!incoming || !previous) continue;
      const entries: Array<Record<string, unknown>> = JSON.parse(
        incoming.value,
      );
      const localEntries: Array<Record<string, unknown>> = JSON.parse(
        previous.value,
      );
      const refs = new Map(
        localEntries.map((entry) => [entry.id, entry.apiKeyRef]),
      );
      for (const entry of entries)
        if (typeof refs.get(entry.id) === "string")
          entry.apiKeyRef = refs.get(entry.id);
      candidate.run(
        "UPDATE settings SET value=? WHERE key=?",
        JSON.stringify(entries),
        key,
      );
    }
    // Rule deployment locations belong to this machine; unmatched imported projects stay detached.
    const ruleBindings = local.all(
      "SELECT owner_user_id,id,target_path,project_root_path FROM rules",
    ) as Array<{
      owner_user_id: string;
      id: string;
      target_path: string;
      project_root_path: string | null;
    }>;
    for (const binding of ruleBindings)
      candidate.run(
        "UPDATE rules SET target_path=?,project_root_path=? WHERE owner_user_id=? AND id=?",
        binding.target_path,
        binding.project_root_path,
        binding.owner_user_id,
        binding.id,
      );
    // Bindings describe this machine's deployment targets, never source-device targets.
    const bindings = local.all("SELECT * FROM mcp_bindings") as Array<
      Record<string, unknown>
    >;
    for (const binding of bindings) {
      candidate.run(
        "INSERT INTO mcp_bindings (id,target,scope,path,enabled,created_at,updated_at,last_applied_at) VALUES (?,?,?,?,?,?,?,?)",
        binding.id,
        binding.target,
        binding.scope,
        binding.path,
        binding.enabled,
        binding.created_at,
        binding.updated_at,
        binding.last_applied_at,
      );
    }
    const links = local.all("SELECT * FROM mcp_binding_servers") as Array<
      Record<string, unknown>
    >;
    for (const link of links) {
      if (
        candidate.get("SELECT id FROM mcp_servers WHERE id=?", link.server_id)
      )
        candidate.run(
          "INSERT INTO mcp_binding_servers (binding_id,server_id,position,entry_digest_json) VALUES (?,?,?,?)",
          link.binding_id,
          link.server_id,
          link.position,
          link.entry_digest_json,
        );
    }
    const state = local.get(
      "SELECT * FROM mcp_storage_state WHERE singleton=1",
    ) as Record<string, unknown> | null;
    if (state)
      candidate.run(
        "UPDATE mcp_storage_state SET device_id=?,key_id=? WHERE singleton=1",
        state.device_id,
        state.key_id,
      );
    const secrets = local.all("SELECT * FROM mcp_secrets") as Array<
      Record<string, unknown>
    >;
    for (const secret of secrets)
      candidate.run(
        "UPDATE mcp_secrets SET availability=?,key_id=?,iv=?,ciphertext=?,auth_tag=? WHERE ref=? AND server_id=?",
        secret.availability,
        secret.key_id,
        secret.iv,
        secret.ciphertext,
        secret.auth_tag,
        secret.ref,
        secret.server_id,
      );
  })();
}
