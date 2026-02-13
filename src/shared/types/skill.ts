export interface Skill {
  id: string;
  name: string;
  description?: string;
  instructions?: string; // System Prompt / SKILL.md content (alias for content)
  content?: string; // System Prompt / SKILL.md content
  mcp_config?: string; // JSON string (legacy, no longer used)
  protocol_type: 'skill' | 'mcp' | 'claude-code'; // 'skill' is the default for SKILL.md
  version?: string;
  author?: string;
  source_url?: string; // GitHub URL or registry source
  tags?: string[]; // stored as JSON string in DB, parsed array in runtime
  is_favorite: boolean;
  created_at: number;
  updated_at: number;

  // Skill Store fields
  // 技能商店字段
  icon_url?: string;        // Skill icon URL (PNG/SVG/WebP)
  icon_emoji?: string;      // Emoji icon fallback
  category?: SkillCategory; // Skill category
  is_builtin?: boolean;     // Whether this is a built-in skill from registry
  registry_slug?: string;   // Unique slug in the registry
  content_url?: string;     // Remote SKILL.md URL
  prerequisites?: string[]; // Prerequisites for using this skill
  compatibility?: string[]; // Compatible platforms
}

export type SkillCategory = 'general' | 'office' | 'dev' | 'ai' | 'data' | 'management' | 'deploy' | 'design' | 'security' | 'meta';

export type CreateSkillParams = Omit<Skill, 'id' | 'created_at' | 'updated_at'>;
export type UpdateSkillParams = Partial<Omit<Skill, 'id' | 'created_at' | 'updated_at'>>;

export interface MCPServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface SkillMCPConfig {
  servers: Record<string, MCPServerConfig>;
}

/**
 * Registry skill definition (from built-in or remote registry)
 * 注册表技能定义（来自内置或远程注册表）
 */
export interface RegistrySkill {
  slug: string;
  name: string;
  description: string;
  category: SkillCategory;
  icon_url?: string;
  icon_emoji?: string;
  author: string;
  source_url: string;
  tags: string[];
  version: string;
  content: string;          // Embedded SKILL.md content
  content_url?: string;     // Remote SKILL.md URL (for updates)
  prerequisites?: string[];
  compatibility?: string[];
}

export interface SkillRegistry {
  version: string;
  updated_at: string;
  skills: RegistrySkill[];
}
