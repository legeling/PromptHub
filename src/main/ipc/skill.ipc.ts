import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import { SkillDB } from '../database/skill';
import type { CreateSkillParams, UpdateSkillParams } from '../../shared/types';

/**
 * Register Skill-related IPC handlers
 * 注册 Skill 相关 IPC 处理器
 */
import { SkillInstaller } from '../services/skill-installer';

/**
 * Register Skill-related IPC handlers
 * 注册 Skill 相关 IPC 处理器
 */
export function registerSkillIPC(db: SkillDB): void {
  // Create Skill
  ipcMain.handle(IPC_CHANNELS.SKILL_CREATE, async (_, data: CreateSkillParams) => {
    // If it's a GitHub URL AND no content is provided, use the installer to clone & parse
    // Registry installs already have content, so they skip this path
    // 如果是 GitHub URL 且没有提供内容，使用安装器克隆和解析
    // 注册表安装已经有内容，所以跳过此路径
    if (data.source_url && data.source_url.includes('github.com') && !data.content && !data.instructions) {
       try {
         const id = await SkillInstaller.installFromGithub(data.source_url, db);
         return db.getById(id);
       } catch (error) {
         console.error('Failed to install from GitHub, falling back to basic creation:', error);
         throw error;
       }
    }
    return db.create(data);
  });

  // Get single Skill
  ipcMain.handle(IPC_CHANNELS.SKILL_GET, async (_, id: string) => {
    return db.getById(id);
  });

  // Get all Skills
  ipcMain.handle(IPC_CHANNELS.SKILL_GET_ALL, async () => {
    return db.getAll();
  });

  // Update Skill
  ipcMain.handle(IPC_CHANNELS.SKILL_UPDATE, async (_, id: string, data: UpdateSkillParams) => {
    return db.update(id, data);
  });

  // Delete Skill
  ipcMain.handle(IPC_CHANNELS.SKILL_DELETE, async (_, id: string) => {
    return db.delete(id);
  });
  
  // Scan Local Skills
  ipcMain.handle(IPC_CHANNELS.SKILL_SCAN_LOCAL, async () => {
    return SkillInstaller.scanLocal(db);
  });

  // Scan Local Skills (preview mode - returns list without importing)
  ipcMain.handle(IPC_CHANNELS.SKILL_SCAN_LOCAL_PREVIEW, async () => {
    return SkillInstaller.scanLocalPreview();
  });

  // Install to external platform
  ipcMain.handle(IPC_CHANNELS.SKILL_INSTALL_TO_PLATFORM, async (_, platform: 'claude' | 'cursor', name: string, mcpConfig: any) => {
    return SkillInstaller.installToPlatform(platform, name, mcpConfig);
  });

  // Uninstall from external platform
  ipcMain.handle(IPC_CHANNELS.SKILL_UNINSTALL_FROM_PLATFORM, async (_, platform: 'claude' | 'cursor', name: string) => {
    return SkillInstaller.uninstallFromPlatform(platform, name);
  });

  // Get platform status
  ipcMain.handle(IPC_CHANNELS.SKILL_GET_PLATFORM_STATUS, async (_, name: string) => {
    return SkillInstaller.getPlatformStatus(name);
  });

  // Export skill as SKILL.md format
  ipcMain.handle(IPC_CHANNELS.SKILL_EXPORT, async (_, id: string, format: 'skillmd' | 'json') => {
    const skill = db.getById(id);
    if (!skill) {
      throw new Error('Skill not found');
    }
    
    if (format === 'skillmd') {
      return SkillInstaller.exportAsSkillMd(skill);
    } else {
      return SkillInstaller.exportAsJson(skill);
    }
  });

  // Import skill from JSON
  ipcMain.handle(IPC_CHANNELS.SKILL_IMPORT, async (_, jsonContent: string) => {
    const id = await SkillInstaller.importFromJson(jsonContent, db);
    return db.getById(id);
  });

  // ==================== SKILL.md Multi-Platform Installation ====================
  // ==================== SKILL.md 多平台安装 IPC ====================

  // Get supported platforms list
  // 获取支持的平台列表
  ipcMain.handle(IPC_CHANNELS.SKILL_GET_SUPPORTED_PLATFORMS, async () => {
    return SkillInstaller.getSupportedPlatforms();
  });

  // Detect installed platforms
  // 检测已安装的平台
  ipcMain.handle(IPC_CHANNELS.SKILL_DETECT_PLATFORMS, async () => {
    return SkillInstaller.detectInstalledPlatforms();
  });

  // Install SKILL.md to a platform
  // 安装 SKILL.md 到指定平台
  ipcMain.handle(IPC_CHANNELS.SKILL_INSTALL_MD, async (_, skillName: string, skillMdContent: string, platformId: string) => {
    return SkillInstaller.installSkillMd(skillName, skillMdContent, platformId);
  });

  // Uninstall SKILL.md from a platform
  // 从指定平台卸载 SKILL.md
  ipcMain.handle(IPC_CHANNELS.SKILL_UNINSTALL_MD, async (_, skillName: string, platformId: string) => {
    return SkillInstaller.uninstallSkillMd(skillName, platformId);
  });

  // Get SKILL.md installation status across all platforms
  // 获取 SKILL.md 在所有平台的安装状态
  ipcMain.handle(IPC_CHANNELS.SKILL_GET_MD_INSTALL_STATUS, async (_, skillName: string) => {
    return SkillInstaller.getSkillMdInstallStatus(skillName);
  });

  // Install SKILL.md to a platform via symlink (soft install)
  // 通过符号链接安装 SKILL.md 到平台（软安装）
  ipcMain.handle(IPC_CHANNELS.SKILL_INSTALL_MD_SYMLINK, async (_, skillName: string, skillMdContent: string, platformId: string) => {
    return SkillInstaller.installSkillMdSymlink(skillName, skillMdContent, platformId);
  });

  // Fetch remote SKILL.md content from a URL
  // 从远程 URL 获取 SKILL.md 内容（404 等错误静默返回 null）
  ipcMain.handle(IPC_CHANNELS.SKILL_FETCH_REMOTE_CONTENT, async (_, url: string) => {
    try {
      return await SkillInstaller.fetchRemoteContent(url);
    } catch (e) {
      // Silently return null for 404s and other fetch failures
      // The renderer will fall back to embedded content
      return null;
    }
  });
}
