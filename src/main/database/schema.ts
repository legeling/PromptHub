/**
 * 数据库表结构定义
 */

export const SCHEMA = `
-- Prompts 表
CREATE TABLE IF NOT EXISTS prompts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT,
  user_prompt TEXT NOT NULL,
  variables TEXT,
  tags TEXT,
  folder_id TEXT,
  images TEXT,
  is_favorite INTEGER DEFAULT 0,
  is_pinned INTEGER DEFAULT 0,
  current_version INTEGER DEFAULT 1,
  usage_count INTEGER DEFAULT 0,
  source TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
);

-- 版本表
CREATE TABLE IF NOT EXISTS prompt_versions (
  id TEXT PRIMARY KEY,
  prompt_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  system_prompt TEXT,
  user_prompt TEXT NOT NULL,
  variables TEXT,
  note TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (prompt_id) REFERENCES prompts(id) ON DELETE CASCADE,
  UNIQUE(prompt_id, version)
);

-- 文件夹表
CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
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
  name TEXT NOT NULL,
  description TEXT,
  content TEXT, -- System Prompt / SKILL.md content
  mcp_config TEXT, -- JSON string for MCP servers config
  protocol_type TEXT DEFAULT 'mcp', -- e.g., 'mcp', 'claude-code'
  version TEXT,
  author TEXT,
  tags TEXT,
  is_favorite INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_prompts_folder ON prompts(folder_id);
CREATE INDEX IF NOT EXISTS idx_prompts_updated ON prompts(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_prompts_favorite ON prompts(is_favorite);
CREATE INDEX IF NOT EXISTS idx_versions_prompt ON prompt_versions(prompt_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_skills_updated ON skills(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_skills_favorite ON skills(is_favorite);

-- 排序字段索引（性能优化）
-- Sorting field indexes (performance optimization)
CREATE INDEX IF NOT EXISTS idx_prompts_pinned ON prompts(is_pinned);
CREATE INDEX IF NOT EXISTS idx_prompts_created ON prompts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prompts_usage ON prompts(usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_folders_sort ON folders(sort_order);

-- 复合索引（性能优化）
-- Composite indexes (performance optimization)
CREATE INDEX IF NOT EXISTS idx_prompts_folder_favorite ON prompts(folder_id, is_favorite);
CREATE INDEX IF NOT EXISTS idx_prompts_folder_updated ON prompts(folder_id, updated_at DESC);

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
