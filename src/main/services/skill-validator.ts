/**
 * Skill Validator
 * 技能验证器 - 用于验证 SKILL.md 格式和技能名称
 */

/**
 * Skill name validation regex
 * 技能名称验证正则：小写字母数字 + 单个连字符分隔
 * - Length: 1-64 characters
 * - Format: lowercase alphanumeric with single hyphen separators
 * - Cannot start or end with `-`
 * - Cannot contain consecutive `--`
 */
const SKILL_NAME_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Skill frontmatter interface
 * 技能 frontmatter 接口
 */
export interface SkillFrontmatter {
  name: string;
  description?: string;
  version?: string;
  author?: string;
  license?: string;
  compatibility?: string;
  tags?: string[];
  metadata?: Record<string, string>;
}

/**
 * Parsed SKILL.md result
 * 解析 SKILL.md 结果
 */
export interface ParsedSkillMd {
  frontmatter: SkillFrontmatter;
  body: string;
  raw: string;
}

/**
 * Validation result
 * 验证结果
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  data?: ParsedSkillMd;
}

/**
 * Validate skill name format
 * 验证技能名称格式
 * 
 * @param name - Skill name to validate
 * @returns true if valid, false otherwise
 */
export function validateSkillName(name: string): boolean {
  if (!name || typeof name !== 'string') {
    return false;
  }
  
  // Check length
  if (name.length < 1 || name.length > 64) {
    return false;
  }
  
  // Check format
  return SKILL_NAME_REGEX.test(name);
}

/**
 * Get skill name validation error message
 * 获取技能名称验证错误信息
 * 
 * @param name - Skill name to validate
 * @returns Error message or null if valid
 */
export function getSkillNameError(name: string): string | null {
  if (!name || typeof name !== 'string') {
    return 'Skill name is required';
  }
  
  if (name.length < 1) {
    return 'Skill name cannot be empty';
  }
  
  if (name.length > 64) {
    return 'Skill name cannot exceed 64 characters';
  }
  
  if (!SKILL_NAME_REGEX.test(name)) {
    if (name !== name.toLowerCase()) {
      return 'Skill name must be lowercase';
    }
    if (name.startsWith('-') || name.endsWith('-')) {
      return 'Skill name cannot start or end with a hyphen';
    }
    if (name.includes('--')) {
      return 'Skill name cannot contain consecutive hyphens';
    }
    if (/[^a-z0-9-]/.test(name)) {
      return 'Skill name can only contain lowercase letters, numbers, and hyphens';
    }
    return 'Invalid skill name format';
  }
  
  return null;
}

/**
 * Parse SKILL.md content to extract frontmatter and body
 * 解析 SKILL.md 内容，提取 frontmatter 和正文
 * 
 * @param content - Raw SKILL.md content
 * @returns Parsed result or null if parsing fails
 */
export function parseSkillMd(content: string): ParsedSkillMd | null {
  if (!content || typeof content !== 'string') {
    return null;
  }
  
  // Match YAML frontmatter
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  
  if (!frontmatterMatch) {
    // No frontmatter, return body only
    return {
      frontmatter: { name: '' },
      body: content.trim(),
      raw: content,
    };
  }
  
  const yamlContent = frontmatterMatch[1];
  const body = content.slice(frontmatterMatch[0].length).trim();
  
  // Parse YAML manually (simple parser)
  const frontmatter: SkillFrontmatter = { name: '' };
  const metadata: Record<string, string> = {};
  let inMetadata = false;
  
  const lines = yamlContent.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    
    // Check for metadata block
    if (trimmed === 'metadata:') {
      inMetadata = true;
      continue;
    }
    
    // Parse key-value pairs
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) {
      continue;
    }
    
    const key = trimmed.slice(0, colonIndex).trim();
    let value = trimmed.slice(colonIndex + 1).trim();
    
    // Handle indented metadata entries
    if (inMetadata && line.startsWith('  ')) {
      metadata[key] = value;
      continue;
    } else if (!line.startsWith('  ')) {
      inMetadata = false;
    }
    
    // Remove quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) || 
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    
    // Handle array values [a, b, c]
    if (value.startsWith('[') && value.endsWith(']')) {
      const arrayContent = value.slice(1, -1);
      const items = arrayContent.split(',').map(item => item.trim().replace(/^['"]|['"]$/g, ''));
      if (key === 'tags') {
        frontmatter.tags = items.filter(Boolean);
      }
      continue;
    }
    
    // Map to frontmatter fields
    switch (key) {
      case 'name':
        frontmatter.name = value;
        break;
      case 'description':
        frontmatter.description = value;
        break;
      case 'version':
        frontmatter.version = value;
        break;
      case 'author':
        frontmatter.author = value;
        break;
      case 'license':
        frontmatter.license = value;
        break;
      case 'compatibility':
        frontmatter.compatibility = value;
        break;
      case 'tags':
        // Already handled above for array format
        if (!frontmatter.tags) {
          frontmatter.tags = value.split(',').map(t => t.trim()).filter(Boolean);
        }
        break;
    }
  }
  
  if (Object.keys(metadata).length > 0) {
    frontmatter.metadata = metadata;
  }
  
  return {
    frontmatter,
    body,
    raw: content,
  };
}

/**
 * Validate a SKILL.md file content
 * 验证 SKILL.md 文件内容
 * 
 * @param content - Raw SKILL.md content
 * @param directoryName - Optional directory name to match against skill name
 * @returns Validation result with errors and warnings
 */
export function validateSkillMd(content: string, directoryName?: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Parse content
  const parsed = parseSkillMd(content);
  
  if (!parsed) {
    return {
      valid: false,
      errors: ['Failed to parse SKILL.md content'],
      warnings: [],
    };
  }
  
  // Validate name
  if (!parsed.frontmatter.name) {
    errors.push('Missing required field: name');
  } else {
    const nameError = getSkillNameError(parsed.frontmatter.name);
    if (nameError) {
      errors.push(`Invalid name: ${nameError}`);
    }
    
    // Check if name matches directory name
    if (directoryName && parsed.frontmatter.name !== directoryName) {
      warnings.push(`Skill name "${parsed.frontmatter.name}" does not match directory name "${directoryName}"`);
    }
  }
  
  // Validate description
  if (!parsed.frontmatter.description) {
    warnings.push('Missing recommended field: description');
  } else if (parsed.frontmatter.description.length > 1024) {
    errors.push('Description cannot exceed 1024 characters');
  }
  
  // Check for body content
  if (!parsed.body || parsed.body.length === 0) {
    warnings.push('SKILL.md has no content after frontmatter');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    data: parsed,
  };
}

/**
 * Validate a complete skill package (folder structure)
 * 验证完整的技能包（文件夹结构）
 * 
 * @param folderPath - Path to skill folder
 * @returns Validation result
 */
export async function validateSkillPackage(
  folderPath: string,
  fs: { 
    readFile: (path: string, encoding: string) => Promise<string>;
    access: (path: string) => Promise<void>;
    stat: (path: string) => Promise<{ isDirectory: () => boolean }>;
  },
  path: { join: (...args: string[]) => string; basename: (p: string) => string }
): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  try {
    // Check if folder exists and is a directory
    const stat = await fs.stat(folderPath);
    if (!stat.isDirectory()) {
      return {
        valid: false,
        errors: ['Path is not a directory'],
        warnings: [],
      };
    }
    
    const directoryName = path.basename(folderPath);
    
    // Check for SKILL.md
    const skillMdPath = path.join(folderPath, 'SKILL.md');
    let skillMdContent: string;
    
    try {
      skillMdContent = await fs.readFile(skillMdPath, 'utf-8');
    } catch {
      return {
        valid: false,
        errors: ['SKILL.md file not found'],
        warnings: [],
      };
    }
    
    // Validate SKILL.md
    const skillMdResult = validateSkillMd(skillMdContent, directoryName);
    errors.push(...skillMdResult.errors);
    warnings.push(...skillMdResult.warnings);
    
    // Check for optional manifest.json
    try {
      const manifestPath = path.join(folderPath, 'manifest.json');
      const manifestContent = await fs.readFile(manifestPath, 'utf-8');
      try {
        JSON.parse(manifestContent);
      } catch {
        warnings.push('manifest.json contains invalid JSON');
      }
    } catch {
      // manifest.json is optional
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      data: skillMdResult.data,
    };
  } catch (error) {
    return {
      valid: false,
      errors: [`Failed to validate skill package: ${error}`],
      warnings: [],
    };
  }
}
