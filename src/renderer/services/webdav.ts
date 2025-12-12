/**
 * WebDAV 同步服务 - 支持图片同步和双向同步
 */

import { getAllPrompts, getAllFolders, restoreFromBackup } from './database';

interface WebDAVConfig {
  url: string;
  username: string;
  password: string;
}

interface SyncResult {
  success: boolean;
  message: string;
  timestamp?: string;
  details?: {
    promptsUploaded?: number;
    promptsDownloaded?: number;
    imagesUploaded?: number;
    imagesDownloaded?: number;
  };
}

interface BackupData {
  version: string;
  exportedAt: string;
  prompts: any[];
  folders: any[];
  versions?: any[];
  images?: { [fileName: string]: string }; // fileName -> base64
  // AI 配置（可选，用于同步）
  aiConfig?: {
    aiModels?: any[];
    aiProvider?: string;
    aiApiKey?: string;
    aiApiUrl?: string;
    aiModel?: string;
  };
  // 系统设置（可选，用于跨设备一致）
  settings?: any;
  settingsUpdatedAt?: string;
}

// WebDAV 文件路径
const BACKUP_FILENAME = 'prompthub-backup.json';
const IMAGES_DIR = 'prompthub-images';

/**
 * 确保远程目录存在 (MKCOL)
 */
async function ensureDirectory(url: string, authHeader: string) {
  try {
    // 尝试创建目录
    // 移除文件名部分，只保留目录路径
    // 如果 url 本身就是目录路径（比如用户填写的 WebDAV 地址），则直接使用
    // 注意：Nutstore 要求父目录必须存在。如果用户提供的路径是多级不存在的目录，这里简单的 MKCOL 可能失败。
    // 但通常用户提供的是根目录下的一个文件夹，或者已经存在的路径。
    // 我们只尝试对 config.url 进行 MKCOL。
    
    // 检查目录是否存在
    const checkRes = await fetch(url, {
      method: 'PROPFIND',
      headers: {
        'Authorization': authHeader,
        'Depth': '0',
        'User-Agent': 'PromptHub/1.0',
      }
    });

    if (checkRes.ok || checkRes.status === 207) {
      return; // 目录已存在
    }

    // 不存在则创建
    await fetch(url, {
      method: 'MKCOL',
      headers: {
        'Authorization': authHeader,
        'User-Agent': 'PromptHub/1.0',
      }
    });
  } catch (e) {
    console.warn('Failed to ensure directory:', e);
  }
}

/**
 * 测试 WebDAV 连接
 */
export async function testConnection(config: WebDAVConfig): Promise<SyncResult> {
  try {
    const response = await fetch(config.url, {
      method: 'PROPFIND',
      headers: {
        'Authorization': 'Basic ' + btoa(`${config.username}:${config.password}`),
        'Depth': '0',
        'User-Agent': 'PromptHub/1.0',
      },
    });

    if (response.ok || response.status === 207) {
      return { success: true, message: '连接成功' };
    } else if (response.status === 401) {
      return { success: false, message: '认证失败，请检查用户名和密码' };
    } else {
      return { success: false, message: `连接失败: ${response.status} ${response.statusText}` };
    }
  } catch (error) {
    return { success: false, message: `连接失败: ${error instanceof Error ? error.message : '未知错误'}` };
  }
}

/**
 * 收集所有需要同步的图片
 */
async function collectImages(prompts: any[]): Promise<{ [fileName: string]: string }> {
  const images: { [fileName: string]: string } = {};
  const imageFileNames = new Set<string>();

  // 收集所有 prompt 中引用的图片
  for (const prompt of prompts) {
    if (prompt.images && Array.isArray(prompt.images)) {
      for (const img of prompt.images) {
        imageFileNames.add(img);
      }
    }
  }

  // 读取图片为 Base64
  for (const fileName of imageFileNames) {
    try {
      const base64 = await window.electron?.readImageBase64?.(fileName);
      if (base64) {
        images[fileName] = base64;
      }
    } catch (error) {
      console.warn(`Failed to read image ${fileName}:`, error);
    }
  }

  return images;
}

/**
 * 获取 AI 配置（从 localStorage）
 */
function getAiConfig(): BackupData['aiConfig'] {
  try {
    const primary = localStorage.getItem('prompthub-settings');
    const legacy = localStorage.getItem('settings-storage');
    const raw = primary || legacy;
    if (!raw) return undefined;
    const data = JSON.parse(raw);
    const state = data?.state;
    if (!state) return undefined;
    return {
      aiModels: state.aiModels || [],
      aiProvider: state.aiProvider,
      aiApiKey: state.aiApiKey,
      aiApiUrl: state.aiApiUrl,
      aiModel: state.aiModel,
    };
  } catch (error) {
    console.warn('Failed to get AI config:', error);
  }
  return undefined;
}

/**
 * 获取系统设置快照（从 localStorage）
 */
function getSettingsSnapshot(): { state?: any; settingsUpdatedAt?: string } | undefined {
  try {
    const raw = localStorage.getItem('prompthub-settings');
    if (!raw) return undefined;
    const data = JSON.parse(raw);
    const state = data?.state;
    if (!state) return undefined;
    return {
      state,
      settingsUpdatedAt: state.settingsUpdatedAt,
    };
  } catch (error) {
    console.warn('Failed to get settings snapshot:', error);
    return undefined;
  }
}

/**
 * 恢复 AI 配置（到 localStorage）
 */
function restoreAiConfig(aiConfig: BackupData['aiConfig']): void {
  if (!aiConfig) return;
  
  try {
    const primaryKey = 'prompthub-settings';
    const legacyKey = 'settings-storage';
    const storedPrimary = localStorage.getItem(primaryKey);
    const storedLegacy = localStorage.getItem(legacyKey);
    const targetKey = storedPrimary ? primaryKey : (storedLegacy ? legacyKey : primaryKey);
    const stored = storedPrimary || storedLegacy;
    const data = stored ? JSON.parse(stored) : { state: {} };
    if (!data.state) data.state = {};

    // 只更新 AI 相关配置
    if (aiConfig.aiModels) data.state.aiModels = aiConfig.aiModels;
    if (aiConfig.aiProvider) data.state.aiProvider = aiConfig.aiProvider;
    if (aiConfig.aiApiKey) data.state.aiApiKey = aiConfig.aiApiKey;
    if (aiConfig.aiApiUrl) data.state.aiApiUrl = aiConfig.aiApiUrl;
    if (aiConfig.aiModel) data.state.aiModel = aiConfig.aiModel;
    localStorage.setItem(targetKey, JSON.stringify(data));
  } catch (error) {
    console.warn('Failed to restore AI config:', error);
  }
}

/**
 * 恢复系统设置（到 localStorage）
 */
function restoreSettingsSnapshot(settings: BackupData['settings']): void {
  if (!settings?.state) return;
  try {
    localStorage.setItem('prompthub-settings', JSON.stringify({ state: settings.state }));
  } catch (error) {
    console.warn('Failed to restore settings snapshot:', error);
  }
}

/**
 * 上传数据到 WebDAV（包含图片和 AI 配置）
 */
export async function uploadToWebDAV(config: WebDAVConfig): Promise<SyncResult> {
  try {
    // 获取所有数据
    const prompts = await getAllPrompts();
    const folders = await getAllFolders();
    
    // 收集图片
    const images = await collectImages(prompts);
    const imagesCount = Object.keys(images).length;
    
    // 获取 AI 配置
    const aiConfig = getAiConfig();
    // 获取系统设置快照
    const settingsSnapshot = getSettingsSnapshot();
    
    const backupData: BackupData = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      prompts,
      folders,
      images,
      aiConfig,
      settings: settingsSnapshot ? { state: settingsSnapshot.state } : undefined,
      settingsUpdatedAt: settingsSnapshot?.settingsUpdatedAt,
    };

    const authHeader = 'Basic ' + btoa(`${config.username}:${config.password}`);

    // Ensure remote directory exists
    await ensureDirectory(config.url, authHeader);

    const fileUrl = `${config.url.replace(/\/$/, '')}/${BACKUP_FILENAME}`;
    
    const response = await fetch(fileUrl, {
      method: 'PUT',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'User-Agent': 'PromptHub/1.0',
      },
      body: JSON.stringify(backupData, null, 2),
    });

    if (response.ok || response.status === 201 || response.status === 204) {
      return { 
        success: true, 
        message: `上传成功 (${prompts.length} 条 Prompt, ${imagesCount} 张图片)`,
        timestamp: new Date().toISOString(),
        details: {
          promptsUploaded: prompts.length,
          imagesUploaded: imagesCount,
        },
      };
    } else {
      return { success: false, message: `上传失败: ${response.status} ${response.statusText}` };
    }
  } catch (error) {
    return { success: false, message: `上传失败: ${error instanceof Error ? error.message : '未知错误'}` };
  }
}

/**
 * 恢复图片到本地
 */
async function restoreImages(images: { [fileName: string]: string }): Promise<number> {
  let restoredCount = 0;
  
  for (const [fileName, base64] of Object.entries(images)) {
    try {
      const success = await window.electron?.saveImageBase64?.(fileName, base64);
      if (success) {
        restoredCount++;
      }
    } catch (error) {
      console.warn(`Failed to restore image ${fileName}:`, error);
    }
  }
  
  return restoredCount;
}

/**
 * 从 WebDAV 下载数据（包含图片）
 */
export async function downloadFromWebDAV(config: WebDAVConfig): Promise<SyncResult> {
  try {
    const fileUrl = `${config.url.replace(/\/$/, '')}/${BACKUP_FILENAME}`;
    
    const response = await fetch(fileUrl, {
      method: 'GET',
      headers: {
        'Authorization': 'Basic ' + btoa(`${config.username}:${config.password}`),
      },
    });

    if (response.status === 404) {
      return { success: false, message: '远程没有备份文件' };
    }

    if (!response.ok) {
      return { success: false, message: `下载失败: ${response.status} ${response.statusText}` };
    }

    const data: BackupData = await response.json();
    
    // 恢复数据 - 转换为 DatabaseBackup 格式
    await restoreFromBackup({
      version: typeof data.version === 'string' ? parseInt(data.version) || 1 : data.version as number,
      exportedAt: data.exportedAt,
      prompts: data.prompts,
      folders: data.folders,
      versions: data.versions || [],
    });
    
    // 恢复图片
    let imagesRestored = 0;
    if (data.images && Object.keys(data.images).length > 0) {
      imagesRestored = await restoreImages(data.images);
    }
    
    // 恢复 AI 配置
    if (data.aiConfig) {
      restoreAiConfig(data.aiConfig);
    }

    // 恢复系统设置
    if (data.settings) {
      restoreSettingsSnapshot(data.settings);
    }
    
    return { 
      success: true, 
      message: `下载成功 (${data.prompts?.length || 0} 条 Prompt, ${imagesRestored} 张图片${data.aiConfig ? ', AI配置已同步' : ''}${data.settings ? ', 设置已同步' : ''})`,
      timestamp: data.exportedAt,
      details: {
        promptsDownloaded: data.prompts?.length || 0,
        imagesDownloaded: imagesRestored,
      },
    };
  } catch (error) {
    return { success: false, message: `下载失败: ${error instanceof Error ? error.message : '未知错误'}` };
  }
}

/**
 * 获取远程备份信息（包含详细数据）
 */
export async function getRemoteBackupInfo(config: WebDAVConfig): Promise<{ 
  exists: boolean; 
  timestamp?: string;
  data?: BackupData;
}> {
  try {
    const fileUrl = `${config.url.replace(/\/$/, '')}/${BACKUP_FILENAME}`;
    
    const response = await fetch(fileUrl, {
      method: 'GET',
      headers: {
        'Authorization': 'Basic ' + btoa(`${config.username}:${config.password}`),
      },
    });

    if (response.status === 404) {
      return { exists: false };
    }

    if (response.ok) {
      const data: BackupData = await response.json();
      return { 
        exists: true, 
        timestamp: data.exportedAt,
        data,
      };
    }

    return { exists: false };
  } catch {
    return { exists: false };
  }
}

/**
 * 双向智能同步
 * 比较本地和远程数据的时间戳，自动决定同步方向
 */
export async function bidirectionalSync(config: WebDAVConfig): Promise<SyncResult> {
  try {
    // 获取本地数据
    const localPrompts = await getAllPrompts();
    const localFolders = await getAllFolders();
    
    // 获取本地最新更新时间
    let localLatestTime = new Date(0);
    for (const prompt of localPrompts) {
      const updatedAt = new Date(prompt.updatedAt);
      if (updatedAt > localLatestTime) {
        localLatestTime = updatedAt;
      }
    }
    for (const folder of localFolders) {
      const updatedAt = new Date(folder.updatedAt);
      if (updatedAt > localLatestTime) {
        localLatestTime = updatedAt;
      }
    }

    // 设置更新时间也纳入比较（保证换设备配置一致）
    try {
      const raw = localStorage.getItem('prompthub-settings');
      if (raw) {
        const data = JSON.parse(raw);
        const settingsUpdatedAt = data?.state?.settingsUpdatedAt;
        if (settingsUpdatedAt) {
          const t = new Date(settingsUpdatedAt);
          if (t > localLatestTime) localLatestTime = t;
        }
      }
    } catch {
      // ignore
    }
    
    // 获取远程备份信息
    const remoteInfo = await getRemoteBackupInfo(config);
    
    // 如果远程没有数据，上传本地数据
    if (!remoteInfo.exists || !remoteInfo.data) {
      console.log('🔄 Remote is empty, uploading local data...');
      return await uploadToWebDAV(config);
    }
    
    const remoteTime = new Date(remoteInfo.timestamp || 0);
    
    // 比较时间戳决定同步方向
    if (remoteTime > localLatestTime) {
      // 远程数据更新，下载
      console.log('🔄 Remote is newer, downloading...');
      return await downloadFromWebDAV(config);
    } else if (localLatestTime > remoteTime) {
      // 本地数据更新，上传
      console.log('🔄 Local is newer, uploading...');
      return await uploadToWebDAV(config);
    } else {
      // 数据一致，无需同步
      return {
        success: true,
        message: '数据已是最新，无需同步',
        timestamp: new Date().toISOString(),
      };
    }
  } catch (error) {
    return { 
      success: false, 
      message: `同步失败: ${error instanceof Error ? error.message : '未知错误'}` 
    };
  }
}

/**
 * 自动同步（用于启动时和定时同步）
 * 默认采用双向同步策略
 */
export async function autoSync(config: WebDAVConfig): Promise<SyncResult> {
  return await bidirectionalSync(config);
}
