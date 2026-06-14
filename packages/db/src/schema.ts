/**
 * 数据库表结构定义
 */

/**
 * Tables only — run BEFORE migrations so CREATE TABLE IF NOT EXISTS
 * is a safe no-op for existing databases.
 */
export const SCHEMA_TABLES = `
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

CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK(scope IN ('global', 'project')),
  platform_id TEXT NOT NULL,
  platform_name TEXT NOT NULL,
  platform_icon TEXT NOT NULL,
  platform_description TEXT NOT NULL,
  canonical_file_name TEXT NOT NULL,
  description TEXT NOT NULL,
  managed_path TEXT NOT NULL,
  target_path TEXT NOT NULL,
  project_root_path TEXT,
  sync_status TEXT NOT NULL CHECK(sync_status IN ('synced', 'target-missing', 'out-of-sync', 'sync-error')),
  current_version INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rule_versions (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('manual-save', 'ai-rewrite', 'create')),
  created_at INTEGER NOT NULL,
  FOREIGN KEY (rule_id) REFERENCES rules(id) ON DELETE CASCADE,
  UNIQUE(rule_id, version)
);

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
