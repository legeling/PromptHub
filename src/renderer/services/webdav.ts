/**
 * WebDAV 同步服务
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
}

// WebDAV 文件路径
const BACKUP_FILENAME = 'prompthub-backup.json';

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
 * 上传数据到 WebDAV
 */
export async function uploadToWebDAV(config: WebDAVConfig): Promise<SyncResult> {
  try {
    // 获取所有数据
    const prompts = await getAllPrompts();
    const folders = await getAllFolders();
    
    const backupData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      prompts,
      folders,
    };

    const fileUrl = `${config.url.replace(/\/$/, '')}/${BACKUP_FILENAME}`;
    
    const response = await fetch(fileUrl, {
      method: 'PUT',
      headers: {
        'Authorization': 'Basic ' + btoa(`${config.username}:${config.password}`),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(backupData, null, 2),
    });

    if (response.ok || response.status === 201 || response.status === 204) {
      return { 
        success: true, 
        message: '上传成功',
        timestamp: new Date().toISOString(),
      };
    } else {
      return { success: false, message: `上传失败: ${response.status} ${response.statusText}` };
    }
  } catch (error) {
    return { success: false, message: `上传失败: ${error instanceof Error ? error.message : '未知错误'}` };
  }
}

/**
 * 从 WebDAV 下载数据
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

    const data = await response.json();
    
    // 恢复数据
    await restoreFromBackup(data);
    
    return { 
      success: true, 
      message: '下载并恢复成功',
      timestamp: data.exportedAt,
    };
  } catch (error) {
    return { success: false, message: `下载失败: ${error instanceof Error ? error.message : '未知错误'}` };
  }
}

/**
 * 获取远程备份信息
 */
export async function getRemoteBackupInfo(config: WebDAVConfig): Promise<{ exists: boolean; timestamp?: string }> {
  try {
    const fileUrl = `${config.url.replace(/\/$/, '')}/${BACKUP_FILENAME}`;
    
    const response = await fetch(fileUrl, {
      method: 'HEAD',
      headers: {
        'Authorization': 'Basic ' + btoa(`${config.username}:${config.password}`),
      },
    });

    if (response.status === 404) {
      return { exists: false };
    }

    if (response.ok) {
      const lastModified = response.headers.get('Last-Modified');
      return { 
        exists: true, 
        timestamp: lastModified ? new Date(lastModified).toISOString() : undefined,
      };
    }

    return { exists: false };
  } catch {
    return { exists: false };
  }
}
