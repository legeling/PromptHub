export interface Skill {
  id: string;
  name: string;
  description?: string;
  instructions?: string; // System Prompt / SKILL.md content (alias for content)
  content?: string; // System Prompt / SKILL.md content
  mcp_config?: string; // JSON string (legacy, no longer used)
  protocol_type: "skill" | "mcp" | "claude-code"; // 'skill' is the default for SKILL.md
  version?: string;
  author?: string;
  source_url?: string; // GitHub URL or registry source
  local_repo_path?: string; // Absolute path to the cloned/saved local repo directory
  tags?: string[]; // stored as JSON string in DB, parsed array in runtime
  original_tags?: string[]; // tags at import time; user-added tags = tags - original_tags
  is_favorite: boolean;
  currentVersion?: number;
  versionTrackingEnabled?: boolean;
  created_at: number;
  updated_at: number;

  // Skill Store fields
  // 技能商店字段
  icon_url?: string; // Skill icon URL (PNG/SVG/WebP)
  icon_emoji?: string; // Emoji icon fallback
  icon_background?: string; // Icon background color (hex/rgb/css color)
  category?: SkillCategory; // Skill category
  is_builtin?: boolean; // Whether this is a built-in skill from registry
  registry_slug?: string; // Unique slug in the registry
  content_url?: string; // Remote SKILL.md URL
  prerequisites?: string[]; // Prerequisites for using this skill
  compatibility?: string[]; // Compatible platforms
}

export type SkillCategory =
  | "general"
  | "office"
  | "dev"
  | "ai"
  | "data"
  | "management"
  | "deploy"
  | "design"
  | "security"
  | "meta";

export type CreateSkillParams = Omit<Skill, "id" | "created_at" | "updated_at">;
export type UpdateSkillParams = Partial<
  Omit<Skill, "id" | "created_at" | "updated_at">
>;

export interface MCPServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface SkillMCPConfig {
  servers: Record<string, MCPServerConfig>;
}

export interface SkillChatParams {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stream?: boolean;
  enableThinking?: boolean;
  customParams?: Record<string, string | number | boolean>;
}

export interface SkillManifest {
  name?: string;
  description?: string;
  version?: string;
  author?: string;
  tags?: string[];
  instructions?: string;
}

export interface GitHubRepoOwner {
  login?: string;
}

export interface GitHubRepoMetadata {
  default_branch?: string;
  owner?: GitHubRepoOwner;
}

export interface GitHubTreeEntry {
  path?: string;
  type?: string;
}

export interface GitHubTreeResponse {
  tree?: GitHubTreeEntry[];
}

export interface MarketplaceReferenceEntry {
  url?: string;
  index?: string;
  manifest?: string;
}

export interface MarketplaceSkillEntry {
  slug?: string;
  id?: string;
  name?: string;
  title?: string;
  install_name?: string;
  installName?: string;
  description?: string;
  category?: SkillCategory;
  icon_url?: string;
  icon_background?: string;
  iconUrl?: string;
  icon_emoji?: string;
  iconEmoji?: string;
  author?: string;
  source_url?: string;
  sourceUrl?: string;
  repo_url?: string;
  repoUrl?: string;
  repository?: string;
  repo?: string;
  content_url?: string;
  contentUrl?: string;
  skill_url?: string;
  skillUrl?: string;
  raw_url?: string;
  rawUrl?: string;
  content?: string;
  tags?: string[];
  version?: string | number;
  prerequisites?: string[];
  compatibility?: string[];
  store_url?: string;
  storeUrl?: string;
  weekly_installs?: string;
  weeklyInstalls?: string;
  github_stars?: string;
  githubStars?: string;
  installed_on?: string[];
  installedOn?: string[];
  security_audits?: string[];
  securityAudits?: string[];
}

export interface MarketplaceRegistryDocument {
  skills?: MarketplaceSkillEntry[];
  marketplaces?: Array<string | MarketplaceReferenceEntry>;
  sources?: Array<string | MarketplaceReferenceEntry>;
  registries?: Array<string | MarketplaceReferenceEntry>;
}

/**
 * Registry skill definition (from built-in or remote registry)
 * 注册表技能定义（来自内置或远程注册表）
 */
export interface RegistrySkill {
  slug: string;
  name: string;
  install_name?: string;
  description: string;
  category: SkillCategory;
  icon_url?: string;
  icon_background?: string;
  icon_emoji?: string;
  author: string;
  source_url: string;
  store_url?: string;
  tags: string[];
  version: string;
  content: string; // Embedded SKILL.md content
  content_url?: string; // Remote SKILL.md URL (for updates)
  prerequisites?: string[];
  compatibility?: string[];
  weekly_installs?: string;
  github_stars?: string;
  installed_on?: string[];
  security_audits?: string[];
}

export interface SkillStoreSource {
  id: string;
  name: string;
  type: "official" | "community" | "marketplace-json" | "git-repo" | "local-dir";
  url: string;
  enabled: boolean;
  order?: number;
  createdAt: number;
}

export interface SkillRegistry {
  version: string;
  updated_at: string;
  skills: RegistrySkill[];
}

/**
 * Skill version snapshot
 * Skill 版本快照
 */
export interface SkillVersion {
  id: string;
  skillId: string;
  version: number;
  content?: string;
  filesSnapshot?: SkillFileSnapshot[];
  note?: string;
  createdAt: string;
}

/**
 * Skill file snapshot (for multi-file skills)
 * Skill 文件快照（用于多文件 skill）
 */
export interface SkillFileSnapshot {
  relativePath: string;
  content: string;
}

/**
 * Local repo file entry from the main process
 * 主进程返回的本地仓库文件条目
 */
export interface SkillLocalFileEntry {
  path: string;
  content: string;
  isDirectory: boolean;
}

/**
 * Local repo file tree entry metadata.
 * 本地仓库文件树元数据。
 */
export interface SkillLocalFileTreeEntry {
  path: string;
  isDirectory: boolean;
  size?: number;
}

/**
 * Scanned local skill (not yet imported)
 * 扫描到的本地技能（尚未导入）
 */
export interface ScannedSkill {
  name: string;
  description: string;
  version?: string;
  author: string;
  tags: string[];
  instructions: string;
  /** Absolute path to the SKILL.md file; used for dedup and installed-check */
  filePath: string;
  /** Parent directory of the SKILL.md file (skill folder path) */
  localPath: string;
  platforms: string[];
}
