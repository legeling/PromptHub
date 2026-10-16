import { GENERATION_SCHEMA } from "./generation-schema";
import { PLUGIN_SCHEMA } from "./plugin";
import { RULE_SCHEMA } from "./rule-schema";
/**
 * 数据库表结构定义
 */

/**
 * Tables only — run BEFORE migrations so CREATE TABLE IF NOT EXISTS
 * is a safe no-op for existing databases.
 */
import { MCP_SCHEMA_TABLES } from "./mcp-schema";
import { STORAGE_PUBLICATION_SCHEMA } from "./storage-publication";
import { SYNC_TARGET_SCHEMA } from "./sync-target";

export const SCHEMA_TABLES =
  PLUGIN_SCHEMA +
  MCP_SCHEMA_TABLES +
  STORAGE_PUBLICATION_SCHEMA +
  SYNC_TARGET_SCHEMA +
  `
-- Prompts 表
CREATE TABLE IF NOT EXISTS prompts (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK(visibility IN ('private', 'shared')),
  title TEXT NOT NULL,
  description TEXT,
  prompt_type TEXT DEFAULT 'text',
  system_prompt TEXT,
  system_prompt_en TEXT,
  user_prompt TEXT NOT NULL,
  user_prompt_en TEXT,
  variables TEXT,
  tags TEXT,
  folder_id TEXT,
  parent_id TEXT,
  sort_order INTEGER DEFAULT 0,
  images TEXT,
  videos TEXT,
  is_favorite INTEGER DEFAULT 0,
  is_pinned INTEGER DEFAULT 0,
  current_version INTEGER DEFAULT 0,
  usage_count INTEGER DEFAULT 0,
  source TEXT,
  notes TEXT,
  last_ai_response TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL,
  FOREIGN KEY (parent_id) REFERENCES prompts(id) ON DELETE SET NULL
);

-- 版本表
CREATE TABLE IF NOT EXISTS prompt_versions (
  id TEXT PRIMARY KEY,
  prompt_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  system_prompt TEXT,
  system_prompt_en TEXT,
  user_prompt TEXT NOT NULL,
  user_prompt_en TEXT,
  variables TEXT,
  note TEXT,
  ai_response TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (prompt_id) REFERENCES prompts(id) ON DELETE CASCADE,
  UNIQUE(prompt_id, version)
);

-- Prompt relationships. The tree/grouping relationship is stored on
-- prompts.parent_id + prompts.sort_order; this table stores graph-style links.
CREATE TABLE IF NOT EXISTS prompt_relations (
  id TEXT PRIMARY KEY,
  source_prompt_id TEXT NOT NULL,
  target_prompt_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('related_to', 'variant_of', 'depends_on', 'next_step')),
  note TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (source_prompt_id) REFERENCES prompts(id) ON DELETE CASCADE,
  FOREIGN KEY (target_prompt_id) REFERENCES prompts(id) ON DELETE CASCADE,
  CHECK(source_prompt_id != target_prompt_id),
  UNIQUE(source_prompt_id, target_prompt_id, kind)
);

-- Custom output format items. Stores the ordered prompt list copied from a
-- source prompt when users need several prompts to become one clipboard text.
CREATE TABLE IF NOT EXISTS prompt_output_format_items (
  id TEXT PRIMARY KEY,
  source_prompt_id TEXT NOT NULL,
  target_prompt_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (source_prompt_id) REFERENCES prompts(id) ON DELETE CASCADE,
  FOREIGN KEY (target_prompt_id) REFERENCES prompts(id) ON DELETE CASCADE,
  UNIQUE(source_prompt_id, target_prompt_id)
);

-- 文件夹表
CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK(visibility IN ('private', 'shared')),
  name TEXT NOT NULL,
  icon TEXT,
  parent_id TEXT,
  sort_order INTEGER DEFAULT 0,
  is_private INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER,
  FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
);

-- 设置表
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Skills 表
CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK(visibility IN ('private', 'shared')),
  name TEXT NOT NULL,
  description TEXT,
  content TEXT,
  mcp_config TEXT,
  protocol_type TEXT DEFAULT 'mcp',
  version TEXT,
  author TEXT,
  tags TEXT,
  is_favorite INTEGER DEFAULT 0,
  source_url TEXT,
  source_id TEXT,
  source_label TEXT,
  source_branch TEXT,
  source_directory TEXT,
  canonical_skill_path TEXT,
  logical_name TEXT,
  variant_key TEXT,
  local_repo_path TEXT,
  directory_fingerprint TEXT,
  icon_url TEXT,
  icon_emoji TEXT,
  icon_background TEXT,
  category TEXT DEFAULT 'general',
  is_builtin INTEGER DEFAULT 0,
  registry_slug TEXT,
  content_url TEXT,
  installed_content_hash TEXT,
  installed_directory_fingerprint TEXT,
  fingerprint_algorithm TEXT,
  source_last_checked_at INTEGER,
  source_last_error TEXT,
  source_binding_state TEXT,
  installed_version TEXT,
  installed_at INTEGER,
  updated_from_store_at INTEGER,
  prerequisites TEXT,
  compatibility TEXT,
  original_tags TEXT,
  safety_level TEXT,
  safety_score INTEGER,
  safety_report TEXT,
  safety_scanned_at INTEGER,
  current_version INTEGER DEFAULT 0,
  version_tracking_enabled INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Skill 版本表
CREATE TABLE IF NOT EXISTS skill_versions (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  content TEXT,
  files_snapshot TEXT,
  note TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
  UNIQUE(skill_id, version)
);

${RULE_SCHEMA}

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin', 'user')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);

${GENERATION_SCHEMA}

CREATE TABLE IF NOT EXISTS agent_provider_profiles (
  id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  name TEXT NOT NULL,
  provider_kind TEXT NOT NULL,
  protocol TEXT NOT NULL,
  endpoint TEXT,
  config_json TEXT NOT NULL DEFAULT '{}',
  secret_ref TEXT,
  source TEXT NOT NULL CHECK(source IN ('manual', 'native-import', 'universal', 'import')),
  archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_provider_model_mappings (
  id TEXT PRIMARY KEY,
  provider_profile_id TEXT NOT NULL REFERENCES agent_provider_profiles(id) ON DELETE CASCADE,
  route_key TEXT NOT NULL,
  model_id TEXT NOT NULL,
  parameters_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE(provider_profile_id, route_key)
);

CREATE TABLE IF NOT EXISTS agent_provider_snapshots (
  id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  provider_profile_id TEXT REFERENCES agent_provider_profiles(id) ON DELETE SET NULL,
  native_digest TEXT NOT NULL,
  redacted_snapshot TEXT NOT NULL,
  backup_ref TEXT,
  operation TEXT NOT NULL CHECK(operation IN ('import', 'activate', 'backfill', 'restore')),
  result TEXT NOT NULL CHECK(result IN ('planned', 'applied', 'verified', 'rolled-back', 'failed')),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_session_sources (
  id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  root_path TEXT NOT NULL,
  adapter_id TEXT NOT NULL,
  adapter_version TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
  scan_cursor TEXT,
  last_status TEXT NOT NULL DEFAULT 'idle'
    CHECK(last_status IN ('idle', 'ok', 'partial', 'error')),
  last_scanned_at INTEGER,
  last_error_code TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(platform_id, root_path, adapter_id)
);

CREATE TABLE IF NOT EXISTS agent_session_index (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES agent_session_sources(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  project_path TEXT,
  created_at INTEGER,
  updated_at INTEGER,
  model TEXT,
  message_count INTEGER CHECK(message_count IS NULL OR message_count >= 0),
  redacted_preview TEXT,
  source_path TEXT NOT NULL,
  source_mtime_ms INTEGER,
  source_size_bytes INTEGER
    CHECK(source_size_bytes IS NULL OR source_size_bytes >= 0),
  source_digest TEXT,
  source_status TEXT NOT NULL
    CHECK(source_status IN ('present', 'missing', 'parse-error')),
  tags_json TEXT NOT NULL DEFAULT '[]',
  note TEXT,
  indexed_at INTEGER NOT NULL,
  annotation_updated_at INTEGER,
  UNIQUE(source_id, external_id)
);

CREATE TABLE IF NOT EXISTS agent_conversation_metadata (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  title TEXT,
  project_id TEXT,
  project_path TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  note TEXT,
  is_favorite INTEGER NOT NULL DEFAULT 0 CHECK(is_favorite IN (0, 1)),
  archived_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(agent_id, session_id)
);

CREATE TABLE IF NOT EXISTS agent_conversation_handoffs (
  id TEXT PRIMARY KEY,
  source_agent_id TEXT NOT NULL,
  source_session_id TEXT NOT NULL,
  target_agent_id TEXT NOT NULL,
  project_id TEXT,
  project_path TEXT,
  transport TEXT NOT NULL
    CHECK(transport IN ('direct', 'launch', 'unavailable')),
  payload_digest TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('planned', 'launched', 'failed')),
  target_session_id TEXT,
  error_code TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS canonical_resources (
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  revision INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  manifest_path TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(resource_type, resource_id)
);
`;

/**
 * Indexes, FTS, and triggers — run AFTER migrations so all columns exist.
 */
export const SCHEMA_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_prompts_folder ON prompts(folder_id);
CREATE INDEX IF NOT EXISTS idx_prompts_owner ON prompts(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_prompts_visibility ON prompts(visibility);
CREATE INDEX IF NOT EXISTS idx_prompts_updated ON prompts(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_prompts_favorite ON prompts(is_favorite);
CREATE INDEX IF NOT EXISTS idx_versions_prompt ON prompt_versions(prompt_id);
CREATE INDEX IF NOT EXISTS idx_prompt_relations_source ON prompt_relations(source_prompt_id);
CREATE INDEX IF NOT EXISTS idx_prompt_relations_target ON prompt_relations(target_prompt_id);
CREATE INDEX IF NOT EXISTS idx_prompt_relations_kind ON prompt_relations(kind);
CREATE INDEX IF NOT EXISTS idx_prompt_output_format_source ON prompt_output_format_items(source_prompt_id);
CREATE INDEX IF NOT EXISTS idx_prompt_output_format_target ON prompt_output_format_items(target_prompt_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_prompt_output_format_self_unique
  ON prompt_output_format_items(source_prompt_id)
  WHERE target_prompt_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_folders_owner ON folders(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_folders_visibility ON folders(visibility);
CREATE INDEX IF NOT EXISTS idx_skills_updated ON skills(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_skills_owner ON skills(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_skills_visibility ON skills(visibility);
CREATE INDEX IF NOT EXISTS idx_skills_favorite ON skills(is_favorite);
CREATE UNIQUE INDEX IF NOT EXISTS idx_skills_source_id ON skills(source_id) WHERE source_id IS NOT NULL AND source_id != '';
CREATE INDEX IF NOT EXISTS idx_skill_versions_skill ON skill_versions(skill_id);
CREATE INDEX IF NOT EXISTS idx_rules_scope ON rules(scope);
CREATE INDEX IF NOT EXISTS idx_rules_platform ON rules(platform_id);
CREATE INDEX IF NOT EXISTS idx_rules_updated ON rules(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_rules_project_root ON rules(project_root_path);
CREATE INDEX IF NOT EXISTS idx_rule_versions_rule ON rule_versions(rule_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users(LOWER(username));
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_settings_user ON user_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_generation_batches_created ON generation_batches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generation_batches_status ON generation_batches(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_generation_batches_source ON generation_batches(source_prompt_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generation_outputs_batch ON generation_outputs(batch_id, slot_index);
CREATE INDEX IF NOT EXISTS idx_generation_outputs_favorite ON generation_outputs(favorite, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_canonical_resources_type_updated
  ON canonical_resources(resource_type, updated_at DESC, resource_id);
CREATE INDEX IF NOT EXISTS idx_agent_provider_profiles_platform
  ON agent_provider_profiles(platform_id, archived, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_provider_model_mappings_profile
  ON agent_provider_model_mappings(provider_profile_id, route_key);
CREATE INDEX IF NOT EXISTS idx_agent_provider_snapshots_platform_created
  ON agent_provider_snapshots(platform_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_provider_snapshots_profile_created
  ON agent_provider_snapshots(provider_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_session_sources_platform
  ON agent_session_sources(platform_id, enabled, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_session_index_source_updated
  ON agent_session_index(
    source_id,
    COALESCE(updated_at, created_at, 0) DESC,
    external_id
  );
CREATE INDEX IF NOT EXISTS idx_agent_session_index_source_status
  ON agent_session_index(source_id, source_status, indexed_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_conversation_metadata_agent_updated
  ON agent_conversation_metadata(agent_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_conversation_metadata_project
  ON agent_conversation_metadata(project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_conversation_handoffs_source
  ON agent_conversation_handoffs(
    source_agent_id,
    source_session_id,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_prompts_pinned ON prompts(is_pinned);
CREATE INDEX IF NOT EXISTS idx_prompts_created ON prompts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prompts_usage ON prompts(usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_folders_sort ON folders(sort_order);

CREATE INDEX IF NOT EXISTS idx_prompts_folder_favorite ON prompts(folder_id, is_favorite);
CREATE INDEX IF NOT EXISTS idx_prompts_folder_updated ON prompts(folder_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_prompts_parent ON prompts(parent_id);
CREATE INDEX IF NOT EXISTS idx_prompts_sort_order ON prompts(sort_order);

-- 全文搜索 (FTS5)
CREATE VIRTUAL TABLE IF NOT EXISTS prompts_fts USING fts5(
  title, description, system_prompt, user_prompt, tags,
  content='prompts', content_rowid='rowid'
);

-- FTS 触发器：插入
CREATE TRIGGER IF NOT EXISTS prompts_ai AFTER INSERT ON prompts BEGIN
  INSERT INTO prompts_fts(rowid, title, description, system_prompt, user_prompt, tags)
  VALUES (NEW.rowid, NEW.title, NEW.description, NEW.system_prompt, NEW.user_prompt, NEW.tags);
END;

-- FTS 触发器：删除
CREATE TRIGGER IF NOT EXISTS prompts_ad AFTER DELETE ON prompts BEGIN
  INSERT INTO prompts_fts(prompts_fts, rowid, title, description, system_prompt, user_prompt, tags)
  VALUES ('delete', OLD.rowid, OLD.title, OLD.description, OLD.system_prompt, OLD.user_prompt, OLD.tags);
END;

-- FTS 触发器：更新
CREATE TRIGGER IF NOT EXISTS prompts_au AFTER UPDATE ON prompts BEGIN
  INSERT INTO prompts_fts(prompts_fts, rowid, title, description, system_prompt, user_prompt, tags)
  VALUES ('delete', OLD.rowid, OLD.title, OLD.description, OLD.system_prompt, OLD.user_prompt, OLD.tags);
  INSERT INTO prompts_fts(rowid, title, description, system_prompt, user_prompt, tags)
  VALUES (NEW.rowid, NEW.title, NEW.description, NEW.system_prompt, NEW.user_prompt, NEW.tags);
END;
`;

/** @deprecated Use SCHEMA_TABLES + SCHEMA_INDEXES instead */
export const SCHEMA = SCHEMA_TABLES + SCHEMA_INDEXES;
