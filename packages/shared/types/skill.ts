import type { AIProtocol } from "./ai";
import type { SkillPlatform } from "../constants/platforms";

export type SkillVisibility = "private" | "shared";

export interface Skill {
  id: string;
  ownerUserId?: string | null;
  visibility?: SkillVisibility;
  name: string;
  description?: string;
  instructions?: string; // System Prompt / SKILL.md content (alias for content)
  content?: string; // System Prompt / SKILL.md content
  mcp_config?: string; // JSON string (legacy, no longer used)
  protocol_type: "skill" | "mcp" | "claude-code"; // 'skill' is the default for SKILL.md
  version?: string;
  author?: string;
  source_url?: string; // GitHub URL or registry source
  source_id?: string; // Stable source identity for same-name variants
  source_label?: string; // Human-readable source label for variants
  source_branch?: string; // Source branch when imported from git-like stores
  source_directory?: string; // Source directory when imported from nested stores
  canonical_skill_path?: string; // Canonical skill path inside the source
  logical_name?: string; // Stable logical skill grouping name
  variant_key?: string; // Stable per-variant key within a logical skill
  local_repo_path?: string; // Absolute path to the cloned/saved local repo directory
  directory_fingerprint?: string; // Stable fingerprint of the full skill directory
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
  installed_content_hash?: string; // Hash of the last store-installed/updated content
  installed_version?: string; // Store version at the last install/update
  installed_at?: number; // Timestamp of initial store install
  updated_from_store_at?: number; // Timestamp of the latest store update
  prerequisites?: string[]; // Prerequisites for using this skill
  compatibility?: string[]; // Compatible platforms

  // Safety fields (persisted to DB)
  safetyReport?: SkillSafetyReport; // Latest safety scan result
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
  package_url?: string;
  packageUrl?: string;
  zip_url?: string;
  zipUrl?: string;
  download_url?: string;
  downloadUrl?: string;
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
  source_id?: string;
  source_label?: string;
  source_branch?: string;
  source_directory?: string;
  canonical_skill_path?: string;
  directory_fingerprint?: string;
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
  package_url?: string; // Remote package archive URL (for full-directory installs)
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
  type:
    | "official"
    | "community"
    | "marketplace-json"
    | "git-repo"
    | "local-dir";
  url: string;
  branch?: string;
  directory?: string;
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
  mimeType?: string;
  encoding?: "text" | "data-url" | "placeholder";
  previewKind?: "image" | "audio" | "video" | "pdf";
}

export interface SkillLocalFileBufferEntry {
  path: string;
  data: Uint8Array;
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

export type SkillInstallMode = "copy" | "symlink";

export interface SkillPlatformInstallResult {
  requestedMode: SkillInstallMode;
  effectiveMode: SkillInstallMode;
  fallbackReason?: string;
}

export interface SkillPlatformInstallStatus {
  installed: boolean;
  mode?: SkillInstallMode;
}

export type SkillPlatformInstallStatusMap = Record<
  string,
  SkillPlatformInstallStatus
>;

export interface SkillDeleteOptions {
  /**
   * Symlink distributions are always removed because they point back to the
   * PromptHub-managed source. Copy distributions can be preserved as detached
   * snapshots when this is false.
   */
  removeCopyInstallations?: boolean;
}

export interface SkillLocalPathStatus {
  exists: boolean;
  mode?: SkillInstallMode;
}

/**
 * Scanned local skill (not yet imported)
 * 扫描到的本地技能（尚未导入）
 */
/**
 * Result of a `scanLocal()` batch import operation.
 * Includes count of imported skills and names of skills that were
 * skipped due to name collisions with already-installed skills.
 */
export interface ScanLocalResult {
  imported: number;
  skipped: string[];
}

export interface SkillProject {
  id: string;
  name: string;
  rootPath: string;
  scanPaths: string[];
  deployTargets?: string[];
  createdAt: number;
  updatedAt: number;
  lastScannedAt?: number;
}

export type SkillSafetySeverity = "info" | "warn" | "high";

export type SkillSafetyLevel = "safe" | "warn" | "high-risk" | "blocked";

export interface SkillSafetyFinding {
  code: string;
  severity: SkillSafetySeverity;
  title: string;
  detail: string;
  filePath?: string;
  evidence?: string;
}

export interface SkillSafetyReport {
  level: SkillSafetyLevel;
  summary: string;
  findings: SkillSafetyFinding[];
  recommendedAction: "allow" | "review" | "block";
  scannedAt: number;
  checkedFileCount: number;
  /** Desktop safety scans are AI-generated. */
  scanMethod: "ai";
  /**
   * Numeric safety score 0-100 (higher = safer).
   * blocked=0-10, high-risk=20-40, warn=50-70, safe=80-100
   */
  score?: number;
}

/**
 * Minimal AI model config passed from renderer to main process
 * for AI-powered safety scanning.
 */
export interface SafetyScanAIConfig {
  provider: string;
  apiProtocol: AIProtocol;
  apiKey: string;
  apiUrl: string;
  model: string;
}

export interface SkillSafetyScanInput {
  name?: string;
  content?: string;
  sourceUrl?: string;
  contentUrl?: string;
  localRepoPath?: string;
  securityAudits?: string[];
  /** AI model config for safety scanning. Required for active safety scans. */
  aiConfig?: SafetyScanAIConfig;
}

export interface ScannedSkill {
  name: string;
  description: string;
  version?: string;
  author: string;
  tags: string[];
  instructions: string;
  directory_fingerprint?: string;
  /** Absolute path to the SKILL.md file; used for dedup and installed-check */
  filePath: string;
  /** Parent directory of the SKILL.md file (skill folder path) */
  localPath: string;
  /** How the skill folder is present in the scanned directory. */
  installMode?: SkillInstallMode;
  /** Resolved source directory when localPath is a symlink. */
  symlinkTargetPath?: string;
  /** True when the symlink target points into PromptHub-managed skill storage. */
  isPromptHubManagedLink?: boolean;
  platforms: string[];
  safetyReport?: SkillSafetyReport;
  /**
   * True when another scanned skill at a different path shares the same
   * name (case-insensitive).  Batch import will fail for all but the first
   * of such duplicates, so the UI should warn the user.
   */
  nameConflict?: boolean;
}

export interface AgentScannedSkill extends ScannedSkill {
  /** How the skill folder is present in the agent/platform skills directory. */
  installMode: SkillInstallMode;
  /** True when this skill is built into the owning agent platform itself. */
  isPlatformBuiltin?: boolean;
  /**
   * Absolute path to the concrete platform skill folder that should be removed
   * when uninstalling this agent-local skill.
   */
  platformSkillPath: string;
}

export interface SkillPlatformScanResult {
  platform: SkillPlatform;
  skillsDir: string;
  scannedSkills: AgentScannedSkill[];
}
