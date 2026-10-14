export const MCP_SCHEMA_TABLES = `
CREATE TABLE IF NOT EXISTS mcp_storage_state (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  format_version INTEGER NOT NULL CHECK(format_version = 1),
  device_id TEXT NOT NULL, key_id TEXT NOT NULL, adopted_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY, name TEXT COLLATE BINARY NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  transport TEXT NOT NULL CHECK(transport IN ('stdio', 'streamable-http', 'sse')),
  enabled INTEGER NOT NULL CHECK(enabled IN (0, 1)),
  is_favorite INTEGER NOT NULL CHECK(is_favorite IN (0, 1)),
  tags_json TEXT, notes TEXT, config_json TEXT NOT NULL, source_json TEXT NOT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  current_version INTEGER NOT NULL CHECK(current_version > 0),
  max_version INTEGER NOT NULL CHECK(max_version >= current_version),
  FOREIGN KEY(id, current_version) REFERENCES mcp_versions(server_id, version)
    ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE IF NOT EXISTS mcp_versions (
  server_id TEXT NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  version INTEGER NOT NULL CHECK(version > 0), created_at TEXT NOT NULL,
  note TEXT, restored_from_version INTEGER,
  semantic_digest TEXT NOT NULL, content_sha256 TEXT NOT NULL,
  content_path TEXT NOT NULL UNIQUE,
  PRIMARY KEY(server_id, version)
);
CREATE TABLE IF NOT EXISTS mcp_secrets (
  ref TEXT PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  availability TEXT NOT NULL CHECK(availability IN ('available', 'unavailable')),
  key_id TEXT, iv TEXT, ciphertext TEXT, auth_tag TEXT,
  CHECK((availability = 'available' AND key_id IS NOT NULL AND iv IS NOT NULL AND ciphertext IS NOT NULL AND auth_tag IS NOT NULL)
     OR (availability = 'unavailable' AND key_id IS NULL AND iv IS NULL AND ciphertext IS NULL AND auth_tag IS NULL)),
  UNIQUE(server_id, ref)
);
CREATE TABLE IF NOT EXISTS mcp_version_secrets (
  server_id TEXT NOT NULL, version INTEGER NOT NULL,
  field TEXT NOT NULL CHECK(field IN ('env', 'headers', 'oauth')),
  entry_key TEXT NOT NULL, secret_ref TEXT NOT NULL,
  PRIMARY KEY(server_id, version, field, entry_key),
  FOREIGN KEY(server_id, version) REFERENCES mcp_versions(server_id, version) ON DELETE CASCADE,
  FOREIGN KEY(server_id, secret_ref) REFERENCES mcp_secrets(server_id, ref)
    ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE IF NOT EXISTS mcp_bindings (
  id TEXT PRIMARY KEY, target TEXT NOT NULL, scope TEXT NOT NULL,
  path TEXT NOT NULL, enabled INTEGER NOT NULL CHECK(enabled IN (0, 1)),
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, last_applied_at INTEGER
);
CREATE TABLE IF NOT EXISTS mcp_binding_servers (
  binding_id TEXT NOT NULL REFERENCES mcp_bindings(id) ON DELETE CASCADE,
  server_id TEXT NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK(position >= 0), entry_digest_json TEXT,
  PRIMARY KEY(binding_id, server_id), UNIQUE(binding_id, position)
);
`;
