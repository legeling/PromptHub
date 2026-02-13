import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { app } from 'electron';
import { SkillDB } from '../database/skill';
import * as os from 'os';
import { parseSkillMd, validateSkillName } from './skill-validator';
import { SKILL_PLATFORMS, SkillPlatform } from '../../shared/constants/platforms';

/**
 * Execute git command safely using spawn (prevents command injection)
 * 使用 spawn 安全执行 git 命令（防止命令注入）
 */
function gitClone(url: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('git', ['clone', '--depth', '1', url, destDir], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    let stderr = '';
    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Git clone failed with code ${code}: ${stderr}`));
      }
    });
    
    proc.on('error', (err) => {
      reject(new Error(`Git clone error: ${err.message}`));
    });
  });
}

/**
 * Resolve platform path template to actual path
 * 解析平台路径模板为实际路径
 */
function resolvePlatformPath(template: string): string {
  const home = os.homedir();
  return template
    .replace(/^~/, home)
    .replace(/%USERPROFILE%/gi, home)
    .replace(/%APPDATA%/gi, path.join(home, 'AppData', 'Roaming'));
}

/**
 * Get the skills directory path for a platform on current OS
 * 获取当前操作系统上平台的 skills 目录路径
 */
function getPlatformSkillsDir(platform: SkillPlatform): string {
  const osKey = process.platform as 'darwin' | 'win32' | 'linux';
  const template = platform.skillsDir[osKey] || platform.skillsDir.linux;
  return resolvePlatformPath(template);
}

/**
 * Represents a locally discovered skill (not yet imported)
 * 代表一个本地发现的技能（尚未导入）
 */
export interface ScannedSkill {
  name: string;
  description: string;
  version: string;
  author: string;
  tags: string[];
  instructions: string;
  /** Absolute path to the first SKILL.md file found */
  filePath: string;
  /** All platform directories where this skill was found */
  platforms: string[];
}

export class SkillInstaller {
  private static get skillsDir() {
    return path.join(app.getPath('userData'), 'skills');
  }

  static async init() {
    try {
      await fs.mkdir(this.skillsDir, { recursive: true });
    } catch (e) {
      console.error('Failed to create skills directory', e);
    }
  }

  static async installFromGithub(url: string, db: SkillDB): Promise<string> {
    await this.init();
    
    // Extract repo name
    const matches = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!matches) {
       throw new Error('Invalid GitHub URL');
    }
    const userDir = matches[1];
    const repoName = matches[2].replace(/\.git$/, '');
    const installDir = path.join(this.skillsDir, `${userDir}-${repoName}`);

    // Check if skill already installed (by directory existence)
    try {
        await fs.access(installDir);
        // If exists, maybe pull? For now, throw error or just update DB if missing
        // Let's assume re-install is not supported yet without delete
        throw new Error(`Skill ${userDir}/${repoName} already exists. Please delete it first.`);
    } catch (e: any) {
        if (e.code !== 'ENOENT') throw e;
    }

    try {
        console.log(`Cloning ${url} to ${installDir}`);
        await gitClone(url, installDir);
        
        // Parse metadata
        const manifest = await this.readManifest(installDir);
        
        // Load instructions from SKILL.md if not in manifest
        if (!manifest.instructions) {
             try {
                 manifest.instructions = await fs.readFile(path.join(installDir, 'SKILL.md'), 'utf-8');
             } catch {}
        }

        // If still no instructions, maybe README.md?
        if (!manifest.instructions) {
             try {
                 manifest.instructions = await fs.readFile(path.join(installDir, 'README.md'), 'utf-8');
             } catch {}
        }

        // Create Skill in DB
        const skill = db.create({
            name: manifest.name || repoName,
            description: manifest.description || `Installed from ${url}`,
            version: manifest.version || '1.0.0',
            author: manifest.author || userDir,
            content: manifest.instructions || '', 
            instructions: manifest.instructions || '',
            protocol_type: 'skill',
            source_url: url,
            is_favorite: false,
            tags: manifest.tags || ['github']
        });
        
        return skill.id;
    } catch (error) {
        console.error('Installation failed:', error);
        // Clean up
        try {
            await fs.rm(installDir, { recursive: true, force: true });
        } catch {}
        throw error;
    }
  }

  /**
   * Scan local SKILL.md files from various AI tool directories
   * 扫描本地各 AI 工具目录下的 SKILL.md 文件
   * 
   * Note: This method only scans SKILL.md format skills, NOT MCP configurations
   * 注意：此方法只扫描 SKILL.md 格式的技能，不扫描 MCP 配置
   */
  static async scanLocal(db: SkillDB): Promise<number> {
    let count = 0;
    const homeDir = os.homedir();
    
    // Dynamically build scan paths from all supported platforms
    // 从所有已支持的平台动态构建扫描路径
    const platform = process.platform as 'darwin' | 'win32' | 'linux';
    const scanPaths: string[] = [];
    for (const p of SKILL_PLATFORMS) {
      const dir = p.skillsDir[platform] || p.skillsDir.darwin;
      if (dir) {
        const resolved = dir
          .replace(/^~/, homeDir)
          .replace(/%USERPROFILE%/g, homeDir)
          .replace(/%APPDATA%/g, path.join(homeDir, 'AppData', 'Roaming'));
        if (!scanPaths.includes(resolved)) {
          scanPaths.push(resolved);
        }
      }
    }

    for (const scanPath of scanPaths) {
        if (!(await this.fileExists(scanPath))) {
            console.log(`Scan path does not exist, skipping: ${scanPath}`);
            continue;
        }
        
        try {
            console.log(`Scanning path for skills: ${scanPath}`);
            const entries = await fs.readdir(scanPath, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const skillFolderPath = path.join(scanPath, entry.name);
                    const skillMdPath = path.join(skillFolderPath, 'SKILL.md');
                    
                    if (await this.fileExists(skillMdPath)) {
                        try {
                            const instructions = await fs.readFile(skillMdPath, 'utf-8');
                            const manifest = await this.readManifest(skillFolderPath);
                            
                            // Use the skill-validator to parse SKILL.md frontmatter
                            // 使用 skill-validator 解析 SKILL.md frontmatter
                            const parsed = parseSkillMd(instructions);
                            
                            let name = parsed?.frontmatter.name || manifest.name || entry.name;
                            let description = parsed?.frontmatter.description || manifest.description || `Local skill found in ${entry.name}`;
                            let version = parsed?.frontmatter.version || manifest.version || '1.0.0';
                            let author = parsed?.frontmatter.author || manifest.author || 'Local';
                            let tags = parsed?.frontmatter.tags || ['local', 'discovered'];
                            
                            // Add source tag based on which platform directory this was found in
                            const matchedPlatform = SKILL_PLATFORMS.find(pl => {
                              const dir = pl.skillsDir[platform] || pl.skillsDir.darwin;
                              const resolved = dir
                                .replace(/^~/, homeDir)
                                .replace(/%USERPROFILE%/g, homeDir)
                                .replace(/%APPDATA%/g, path.join(homeDir, 'AppData', 'Roaming'));
                              return scanPath === resolved;
                            });
                            if (matchedPlatform && !tags.includes(matchedPlatform.id)) {
                              tags.push(matchedPlatform.id);
                            }

                            db.create({
                                name,
                                description,
                                version,
                                author,
                                instructions: instructions,
                                content: instructions,
                                protocol_type: 'skill',
                                is_favorite: false,
                                tags
                            });
                            count++;
                            console.log(`Discovered local skill via SKILL.md: ${name} in ${entry.name}`);
                        } catch (err) {
                            // 忽略重复创建错误
                        }
                    }
                }
            }
        } catch (e) {
            console.error(`Failed to scan path: ${scanPath}`, e);
        }
    }
    
    return count;
  }

  /**
   * Scan local SKILL.md files and return them as a preview list (without importing)
   * 扫描本地 SKILL.md 文件并返回预览列表（不导入）
   */
  static async scanLocalPreview(): Promise<ScannedSkill[]> {
    // Use a map keyed by skill name to deduplicate across platforms
    // 使用按技能名称为键的 map 来跨平台去重
    const skillMap = new Map<string, ScannedSkill>();
    const homeDir = os.homedir();
    const osPlatform = process.platform as 'darwin' | 'win32' | 'linux';

    // Build scan paths from all supported platforms
    const scanEntries: { path: string; platformName: string }[] = [];
    for (const p of SKILL_PLATFORMS) {
      const dir = p.skillsDir[osPlatform] || p.skillsDir.darwin;
      if (dir) {
        const resolved = dir
          .replace(/^~/, homeDir)
          .replace(/%USERPROFILE%/g, homeDir)
          .replace(/%APPDATA%/g, path.join(homeDir, 'AppData', 'Roaming'));
        // Avoid scanning the same directory twice
        if (!scanEntries.find(e => e.path === resolved)) {
          scanEntries.push({ path: resolved, platformName: p.name });
        }
      }
    }

    for (const { path: scanPath, platformName } of scanEntries) {
      if (!(await this.fileExists(scanPath))) {
        continue;
      }

      try {
        const entries = await fs.readdir(scanPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const skillFolderPath = path.join(scanPath, entry.name);
            const skillMdPath = path.join(skillFolderPath, 'SKILL.md');

            if (await this.fileExists(skillMdPath)) {
              try {
                const instructions = await fs.readFile(skillMdPath, 'utf-8');
                const manifest = await this.readManifest(skillFolderPath);
                const parsed = parseSkillMd(instructions);

                const name = parsed?.frontmatter.name || manifest.name || entry.name;

                // If this skill name already exists, just add the platform
                const existing = skillMap.get(name);
                if (existing) {
                  if (!existing.platforms.includes(platformName)) {
                    existing.platforms.push(platformName);
                  }
                } else {
                  skillMap.set(name, {
                    name,
                    description: parsed?.frontmatter.description || manifest.description || `Local skill found in ${entry.name}`,
                    version: parsed?.frontmatter.version || manifest.version || '1.0.0',
                    author: parsed?.frontmatter.author || manifest.author || 'Local',
                    tags: parsed?.frontmatter.tags || ['local', 'discovered'],
                    instructions,
                    filePath: skillMdPath,
                    platforms: [platformName],
                  });
                }
              } catch (err) {
                console.warn(`Failed to parse skill at ${skillMdPath}:`, err);
              }
            }
          }
        }
      } catch (e) {
        console.error(`Failed to scan path: ${scanPath}`, e);
      }
    }

    return Array.from(skillMap.values());
  }

  static async installToPlatform(platform: 'claude' | 'cursor', name: string, mcpConfig: any): Promise<void> {
    const homeDir = os.homedir();
    const configPath = platform === 'claude' 
      ? path.join(homeDir, 'Library/Application Support/Claude/claude_desktop_config.json')
      : path.join(homeDir, '.cursor/mcp.json');

    if (!(await this.fileExists(configPath))) {
        // If file doesn't exist, create a basic one
        const dir = path.dirname(configPath);
        await fs.mkdir(dir, { recursive: true });
        const initialConfig = { mcpServers: {} };
        await fs.writeFile(configPath, JSON.stringify(initialConfig, null, 2));
    }

    try {
        const content = await fs.readFile(configPath, 'utf-8');
        const config = JSON.parse(content);
        
        // Handle different key variations
        if (!config.mcpServers && !config.mcp_servers && !config.servers) {
            config.mcpServers = {};
        }
        
        const serversKey = config.mcpServers ? 'mcpServers' : (config.mcp_servers ? 'mcp_servers' : 'servers');
        
        // Merge config
        // mcpConfig is expected to be { servers: { name: config } }
        const sourceServers = mcpConfig.servers || { [name]: mcpConfig };
        config[serversKey] = { ...config[serversKey], ...sourceServers };

        await fs.writeFile(configPath, JSON.stringify(config, null, 2));
        console.log(`Successfully installed skill ${name} to ${platform}`);
    } catch (e) {
        console.error(`Failed to install to ${platform}:`, e);
        throw e;
    }
  }

  static async uninstallFromPlatform(platform: 'claude' | 'cursor', name: string): Promise<void> {
    const homeDir = os.homedir();
    const configPath = platform === 'claude' 
      ? path.join(homeDir, 'Library/Application Support/Claude/claude_desktop_config.json')
      : path.join(homeDir, '.cursor/mcp.json');

    if (!(await this.fileExists(configPath))) return;

    try {
        const content = await fs.readFile(configPath, 'utf-8');
        const config = JSON.parse(content);
        
        const serversKey = config.mcpServers ? 'mcpServers' : (config.mcp_servers ? 'mcp_servers' : 'servers');
        
        if (config[serversKey] && config[serversKey][name]) {
            delete config[serversKey][name];
            await fs.writeFile(configPath, JSON.stringify(config, null, 2));
            console.log(`Successfully uninstalled skill ${name} from ${platform}`);
        }
    } catch (e) {
        console.error(`Failed to uninstall from ${platform}:`, e);
        throw e;
    }
  }

  static async getPlatformStatus(name: string): Promise<Record<string, boolean>> {
      const homeDir = os.homedir();
      const status: Record<string, boolean> = { claude: false, cursor: false };
      
      const check = async (platform: 'claude' | 'cursor', configPath: string) => {
          if (!(await this.fileExists(configPath))) return;
          try {
              const content = await fs.readFile(configPath, 'utf-8');
              const config = JSON.parse(content);
              const servers = config.mcpServers || config.mcp_servers || config.servers || {};
              if (servers[name]) status[platform] = true;
          } catch {}
      };

      await check('claude', path.join(homeDir, 'Library/Application Support/Claude/claude_desktop_config.json'));
      await check('cursor', path.join(homeDir, '.cursor/mcp.json'));
      
      return status;
  }

  private static async fileExists(filePath: string): Promise<boolean> {
      try {
          await fs.access(filePath);
          return true;
      } catch {
          return false;
      }
  }

  private static async readManifest(dir: string): Promise<any> {
    try {
        const content = await fs.readFile(path.join(dir, 'manifest.json'), 'utf-8');
        return JSON.parse(content);
    } catch (e) {
        return {};
    }
  }

  /**
   * Export skill as SKILL.md format (Claude compatible)
   * 导出技能为 SKILL.md 格式（兼容 Claude）
   */
  static exportAsSkillMd(skill: {
    name: string;
    description?: string;
    version?: string;
    author?: string;
    tags?: string[];
    instructions?: string;
  }): string {
    // Build YAML frontmatter
    const frontmatter: string[] = ['---'];
    frontmatter.push(`name: ${skill.name}`);
    if (skill.description) {
      frontmatter.push(`description: ${skill.description}`);
    }
    if (skill.version) {
      frontmatter.push(`version: ${skill.version}`);
    }
    if (skill.author) {
      frontmatter.push(`author: ${skill.author}`);
    }
    if (skill.tags && skill.tags.length > 0) {
      frontmatter.push(`tags: [${skill.tags.join(', ')}]`);
    }
    frontmatter.push('compatibility: prompthub');
    frontmatter.push('---');
    frontmatter.push('');

    // Add instructions content
    const content = skill.instructions || '';
    
    return frontmatter.join('\n') + content;
  }

  /**
   * Export skill as JSON (for backup/sharing)
   * 导出技能为 JSON 格式（用于备份/分享）
   */
  static exportAsJson(skill: {
    name: string;
    description?: string;
    version?: string;
    author?: string;
    tags?: string[];
    instructions?: string;
    protocol_type?: string;
  }): string {
    const exportData = {
      name: skill.name,
      description: skill.description || '',
      version: skill.version || '1.0.0',
      author: skill.author || '',
      tags: skill.tags || [],
      instructions: skill.instructions || '',
      protocol_type: skill.protocol_type || 'skill',
      exported_at: new Date().toISOString(),
      format_version: '1.0'
    };
    
    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Import skill from JSON
   * 从 JSON 导入技能
   */
  static async importFromJson(jsonContent: string, db: SkillDB): Promise<string> {
    try {
      const data = JSON.parse(jsonContent);
      
      if (!data.name) {
        throw new Error('Invalid skill JSON: missing name');
      }

      const skill = db.create({
        name: data.name,
        description: data.description || '',
        version: data.version || '1.0.0',
        author: data.author || 'Imported',
        instructions: data.instructions || '',
        content: data.instructions || '',
        protocol_type: data.protocol_type || 'skill',
        tags: data.tags || ['imported'],
        is_favorite: false,
      });

      return skill.id;
    } catch (error) {
      console.error('Failed to import skill from JSON:', error);
      throw error;
    }
  }

  // ==================== SKILL.md Multi-Platform Installation ====================
  // ==================== SKILL.md 多平台安装功能 ====================

  /**
   * Get list of supported platforms
   * 获取支持的平台列表
   */
  static getSupportedPlatforms(): SkillPlatform[] {
    return SKILL_PLATFORMS;
  }

  /**
   * Detect which AI tools are installed on the system
   * 检测系统上安装了哪些 AI 工具
   */
  static async detectInstalledPlatforms(): Promise<string[]> {
    const installed: string[] = [];
    
    for (const platform of SKILL_PLATFORMS) {
      const skillsDir = getPlatformSkillsDir(platform);
      // Check if the parent directory exists (e.g., ~/.claude exists means Claude Code is installed)
      // 检查父目录是否存在（如 ~/.claude 存在说明安装了 Claude Code）
      const parentDir = path.dirname(skillsDir);
      
      if (await this.fileExists(parentDir)) {
        installed.push(platform.id);
      }
    }
    
    return installed;
  }

  /**
   * Install SKILL.md to a specific platform
   * 安装 SKILL.md 到指定平台
   */
  static async installSkillMd(
    skillName: string,
    skillMdContent: string,
    platformId: string
  ): Promise<void> {
    const platform = SKILL_PLATFORMS.find(p => p.id === platformId);
    if (!platform) {
      throw new Error(`Unknown platform: ${platformId}`);
    }

    const skillsDir = getPlatformSkillsDir(platform);
    const skillDir = path.join(skillsDir, skillName);

    try {
      // Create skill directory
      // 创建技能目录
      await fs.mkdir(skillDir, { recursive: true });
      
      // Write SKILL.md file
      // 写入 SKILL.md 文件
      await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillMdContent, 'utf-8');
      
      console.log(`Successfully installed SKILL.md for "${skillName}" to ${platform.name} at ${skillDir}`);
    } catch (error) {
      console.error(`Failed to install SKILL.md to ${platform.name}:`, error);
      throw error;
    }
  }

  /**
   * Uninstall SKILL.md from a specific platform
   * 从指定平台卸载 SKILL.md
   */
  static async uninstallSkillMd(
    skillName: string,
    platformId: string
  ): Promise<void> {
    const platform = SKILL_PLATFORMS.find(p => p.id === platformId);
    if (!platform) {
      throw new Error(`Unknown platform: ${platformId}`);
    }

    const skillsDir = getPlatformSkillsDir(platform);
    const skillDir = path.join(skillsDir, skillName);

    try {
      // Check if skill directory exists
      // 检查技能目录是否存在
      if (await this.fileExists(skillDir)) {
        await fs.rm(skillDir, { recursive: true, force: true });
        console.log(`Successfully uninstalled SKILL.md for "${skillName}" from ${platform.name}`);
      }
    } catch (error) {
      console.error(`Failed to uninstall SKILL.md from ${platform.name}:`, error);
      throw error;
    }
  }

  /**
   * Get SKILL.md installation status across all platforms
   * 获取 SKILL.md 在所有平台的安装状态
   */
  static async getSkillMdInstallStatus(skillName: string): Promise<Record<string, boolean>> {
    const status: Record<string, boolean> = {};

    for (const platform of SKILL_PLATFORMS) {
      const skillsDir = getPlatformSkillsDir(platform);
      const skillMdPath = path.join(skillsDir, skillName, 'SKILL.md');
      
      status[platform.id] = await this.fileExists(skillMdPath);
    }

    return status;
  }

  /**
   * Install SKILL.md to a platform via symlink (soft install)
   * 通过符号链接安装 SKILL.md 到平台（软安装）
   * 
   * Creates a symlink from the platform skills directory to the
   * central PromptHub skills directory, so all platforms share
   * the same source file and updates propagate automatically.
   */
  static async installSkillMdSymlink(
    skillName: string,
    skillMdContent: string,
    platformId: string
  ): Promise<void> {
    const platform = SKILL_PLATFORMS.find(p => p.id === platformId);
    if (!platform) {
      throw new Error(`Unknown platform: ${platformId}`);
    }

    await this.init();

    // 1. Write the canonical copy into PromptHub's own skills dir
    const canonicalDir = path.join(this.skillsDir, skillName);
    await fs.mkdir(canonicalDir, { recursive: true });
    await fs.writeFile(path.join(canonicalDir, 'SKILL.md'), skillMdContent, 'utf-8');

    // 2. Create a symlink from the platform dir → canonical dir
    const platformSkillsDir = getPlatformSkillsDir(platform);
    const platformSkillDir = path.join(platformSkillsDir, skillName);

    try {
      // Ensure parent exists
      await fs.mkdir(platformSkillsDir, { recursive: true });

      // Remove existing target if present (file, dir, or broken symlink)
      try {
        const stat = await fs.lstat(platformSkillDir);
        if (stat.isSymbolicLink() || stat.isDirectory() || stat.isFile()) {
          await fs.rm(platformSkillDir, { recursive: true, force: true });
        }
      } catch (e: any) {
        if (e.code !== 'ENOENT') throw e;
      }

      // Create directory symlink
      await fs.symlink(canonicalDir, platformSkillDir, 'dir');
      console.log(`Symlinked "${skillName}" → ${platform.name}: ${canonicalDir} → ${platformSkillDir}`);
    } catch (error) {
      console.error(`Failed to create symlink for "${skillName}" to ${platform.name}:`, error);
      throw error;
    }
  }

  /**
   * Fetch remote SKILL.md content from a URL
   * 从远程 URL 获取 SKILL.md 内容
   */
  static async fetchRemoteContent(url: string): Promise<string> {
    try {
      const { net } = await import('electron');
      return new Promise((resolve, reject) => {
        const request = net.request(url);
        let body = '';
        request.on('response', (response) => {
          if (response.statusCode !== 200) {
            reject(new Error(`HTTP ${response.statusCode} fetching ${url}`));
            return;
          }
          response.on('data', (chunk) => {
            body += chunk.toString();
          });
          response.on('end', () => {
            resolve(body);
          });
          response.on('error', (err) => reject(err));
        });
        request.on('error', (err) => reject(err));
        request.end();
      });
    } catch (error) {
      console.error(`Failed to fetch remote content from ${url}:`, error);
      throw error;
    }
  }
}
