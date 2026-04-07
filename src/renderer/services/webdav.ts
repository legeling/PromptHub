/**
 * WebDAV Sync Service - Support incremental backup, image sync, version history and bidirectional sync
 * WebDAV 同步服务 - 支持增量备份、图片同步、版本历史和双向同步
 *
 * Incremental backup architecture:
 * 增量备份架构：
 * prompthub-backup/
 * ├── manifest.json          # Index file, recording hash and timestamp of all files
 *                          # 索引文件，记录所有文件的 hash 和时间戳
 * ├── data.json              # Core data (prompts, folders, versions, config)
 *                          # 核心数据（prompts, folders, versions, config）
 * └── images/
 *     ├── {hash1}.base64     # Images stored by content hash
 *                          # 图片按内容 hash 存储
 *     └── ...
 */

import {
  getAllPrompts,
  getAllFolders,
} from "./database";
import { exportDatabase, restoreFromBackup } from "./database-backup";
import {
  getAiConfigSnapshot,
  getSettingsStateSnapshot,
  restoreAiConfigSnapshot,
  restoreSettingsStateSnapshot,
  SENSITIVE_SETTINGS_FIELDS,
} from "./settings-snapshot";
import type { PromptVersion } from "../../shared/types";

interface WebDAVConfig {
  url: string;
  username: string;
  password: string;
}

export interface SyncResult {
  success: boolean;
  message: string;
  timestamp?: string;
  localChanged?: boolean;
  details?: {
    promptsUploaded?: number;
    promptsDownloaded?: number;
    imagesUploaded?: number;
    imagesDownloaded?: number;
    videosUploaded?: number;
    videosDownloaded?: number;
    skillsDownloaded?: number;
    skipped?: number; // Skipped files (unchanged) / 跳过的文件数（未变化）
  };
}

// Incremental backup Manifest structure
// 增量备份 Manifest 结构
interface BackupManifest {
  version: string; // Backup format version / 备份格式版本
  createdAt: string; // First creation time / 首次创建时间
  updatedAt: string; // Last update time / 最后更新时间
  dataHash: string; // Hash of data.json / data.json 的 hash
  images: {
    // Image index / 图片索引
    [fileName: string]: {
      hash: string; // Content hash / 内容 hash
      size: number; // File size / 文件大小
      uploadedAt: string; // Upload time / 上传时间
    };
  };
  videos: {
    // Video index / 视频索引
    [fileName: string]: {
      hash: string; // Content hash / 内容 hash
      size: number; // File size / 文件大小
      uploadedAt: string; // Upload time / 上传时间
    };
  };
  encrypted?: boolean; // Whether encrypted / 是否加密
}

interface BackupData {
  version: string;
  exportedAt: string;
  prompts: any[];
  folders: any[];
  versions?: PromptVersion[]; // Version history / 版本历史
  images?: { [fileName: string]: string }; // fileName -> base64 (legacy compatible) / fileName -> base64（兼容旧版）
  videos?: { [fileName: string]: string }; // fileName -> base64 (for video sync) / fileName -> base64（用于视频同步）
  // AI configuration (optional, for sync)
  // AI 配置（可选，用于同步）
  aiConfig?: {
    aiModels?: any[];
    aiProvider?: string;
    aiApiKey?: string;
    aiApiUrl?: string;
    aiModel?: string;
  };
  // System settings (optional, for cross-device consistency)
  // 系统设置（可选，用于跨设备一致）
  settings?: any;
  settingsUpdatedAt?: string;
  // Encryption flag
  // 加密标记
  encrypted?: boolean;
  // Skills (stored in main process SQLite)
  // 技能（存储在主进程 SQLite）
  skills?: any[];
  skillVersions?: any[];
  skillFiles?: Record<string, any[]>;
}

// WebDAV sync options
// WebDAV 同步选项
export interface WebDAVSyncOptions {
  includeImages?: boolean; // Whether to include images (full backup) / 是否包含图片（全量备份）
  encryptionPassword?: string; // Encryption password (experimental) / 加密密码（实验性）
  incrementalSync?: boolean; // Whether to use incremental sync (default true) / 是否使用增量同步（默认 true）
}

// WebDAV file paths
// WebDAV 文件路径
const BACKUP_DIR = "prompthub-backup";
const MANIFEST_FILENAME = "manifest.json";
const DATA_FILENAME = "data.json";
const IMAGES_DIR = "images";
const VIDEOS_DIR = "videos";
// Compatible with legacy single-file backup
// 兼容旧版单文件备份
const LEGACY_BACKUP_FILENAME = "prompthub-backup.json";
// Temporary compatibility: keep old constant name
// 临时兼容：保持旧的常量名
const BACKUP_FILENAME = LEGACY_BACKUP_FILENAME;

/**
 * Uint8Array to Base64 (avoid stack overflow)
 * Uint8Array 转 Base64（避免栈溢出）
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000; // 32KB chunks
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

/**
 * Base64 to Uint8Array
 * Base64 转 Uint8Array
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Simple AES-GCM encryption (experimental feature)
 * 简单的 AES-GCM 加密（实验性功能）
 * WARNING: Forgetting the password will make data unrecoverable!
 * 警告：忘记密码将无法恢复数据！
 * NOTE: Only encrypts JSON data, not images
 * 注意：只加密 JSON 数据，不加密图片
 */
async function encryptData(data: string, password: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);

  // Derive key from password
  // 从密码派生密钥
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"],
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    dataBuffer,
  );

  // Combine salt + iv + encrypted data, convert to base64
  // 组合 salt + iv + 加密数据，转为 base64
  const combined = new Uint8Array(
    salt.length + iv.length + encrypted.byteLength,
  );
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encrypted), salt.length + iv.length);

  return uint8ArrayToBase64(combined);
}

/**
 * Decrypt data
 * 解密数据
 */
async function decryptData(
  encryptedBase64: string,
  password: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  // Decode base64
  // 解码 base64
  const combined = base64ToUint8Array(encryptedBase64);

  const salt = combined.slice(0, 16);
  const iv = combined.slice(16, 28);
  const encrypted = combined.slice(28);

  // Derive key from password
  // 从密码派生密钥
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"],
  );

  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    encrypted,
  );

  return decoder.decode(decrypted);
}

/**
 * Calculate simple hash of string (for incremental sync)
 * 计算字符串的简单 hash（用于增量同步）
 */
async function computeHash(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .substring(0, 16);
}

/**
 * Upload single file to WebDAV
 * 上传单个文件到 WebDAV
 */
async function uploadFile(
  url: string,
  config: WebDAVConfig,
  content: string,
): Promise<boolean> {
  try {
    if (window.electron?.webdav?.upload) {
      const result = await window.electron.webdav.upload(url, config, content);
      return result.success;
    }

    const authHeader = "Basic " + btoa(`${config.username}:${config.password}`);
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        "User-Agent": "PromptHub/1.0",
      },
      body: content,
    });
    return response.ok || response.status === 201 || response.status === 204;
  } catch (error) {
    console.error("Upload file failed:", error);
    return false;
  }
}

/**
 * Download single file from WebDAV
 * 下载单个文件从 WebDAV
 */
async function downloadFile(
  url: string,
  config: WebDAVConfig,
): Promise<{ success: boolean; data?: string; notFound?: boolean }> {
  try {
    if (window.electron?.webdav?.download) {
      return await window.electron.webdav.download(url, config);
    }

    const authHeader = "Basic " + btoa(`${config.username}:${config.password}`);
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: authHeader,
        "User-Agent": "PromptHub/1.0",
      },
    });

    if (response.status === 404) {
      return { success: false, notFound: true };
    }

    if (response.ok) {
      const data = await response.text();
      return { success: true, data };
    }

    return { success: false };
  } catch (error) {
    console.error("Download file failed:", error);
    return { success: false };
  }
}

/**
 * Delete remote file
 * 删除远程文件
 */
async function deleteFile(url: string, config: WebDAVConfig): Promise<boolean> {
  try {
    const authHeader = "Basic " + btoa(`${config.username}:${config.password}`);
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: authHeader,
        "User-Agent": "PromptHub/1.0",
      },
    });
    return response.ok || response.status === 204 || response.status === 404;
  } catch {
    return false;
  }
}

/**
 * Ensure remote directory exists (MKCOL)
 * 确保远程目录存在 (MKCOL)
 * Prefer main process IPC to bypass CORS
 * 优先使用主进程 IPC 绕过 CORS
 */
async function ensureDirectory(url: string, config: WebDAVConfig) {
  try {
    // Prefer main process IPC (bypass CORS)
    // 优先使用主进程 IPC（绕过 CORS）
    if (window.electron?.webdav?.ensureDirectory) {
      await window.electron.webdav.ensureDirectory(url, config);
      return;
    }

    // Fallback to fetch (only effective in packaged Electron)
    // 回退到 fetch（仅在打包后的 Electron 中有效）
    const authHeader = "Basic " + btoa(`${config.username}:${config.password}`);
    const checkRes = await fetch(url, {
      method: "PROPFIND",
      headers: {
        Authorization: authHeader,
        Depth: "0",
        "User-Agent": "PromptHub/1.0",
      },
    });

    if (checkRes.ok || checkRes.status === 207) {
      return;
    }

    await fetch(url, {
      method: "MKCOL",
      headers: {
        Authorization: authHeader,
        "User-Agent": "PromptHub/1.0",
      },
    });
  } catch (e) {
    console.warn("Failed to ensure directory:", e);
  }
}

/**
 * Test WebDAV connection
 * 测试 WebDAV 连接
 * Prefer main process IPC to bypass CORS
 * 优先使用主进程 IPC 绕过 CORS
 */
export async function testConnection(
  config: WebDAVConfig,
): Promise<SyncResult> {
  try {
    // Prefer main process IPC (bypass CORS)
    // 优先使用主进程 IPC（绕过 CORS）
    if (window.electron?.webdav?.testConnection) {
      const result = await window.electron.webdav.testConnection(config);
      return result;
    }

    // Fallback to fetch (only effective in packaged Electron)
    // 回退到 fetch（仅在打包后的 Electron 中有效）
    const response = await fetch(config.url, {
      method: "PROPFIND",
      headers: {
        Authorization: "Basic " + btoa(`${config.username}:${config.password}`),
        Depth: "0",
        "User-Agent": "PromptHub/1.0",
      },
    });

    if (response.ok || response.status === 207) {
      return { success: true, message: "Connection successful / 连接成功" };
    } else if (response.status === 401) {
      return {
        success: false,
        message:
          "Authentication failed, please check username and password / 认证失败，请检查用户名和密码",
      };
    } else {
      return {
        success: false,
        message: `Connection failed: ${response.status} ${response.statusText} / 连接失败: ${response.status} ${response.statusText}`,
      };
    }
  } catch (error) {
    return {
      success: false,
      message: `Connection failed: ${error instanceof Error ? error.message : "Unknown error"} / 连接失败: ${error instanceof Error ? error.message : "未知错误"}`,
    };
  }
}

/**
 * Collect all images that need to be synced
 * 收集所有需要同步的图片
 */
async function collectImages(
  prompts: any[],
): Promise<{ [fileName: string]: string }> {
  const images: { [fileName: string]: string } = {};
  const imageFileNames = new Set<string>();

  // Collect all images referenced in prompts
  // 收集所有 prompt 中引用的图片
  for (const prompt of prompts) {
    if (prompt.images && Array.isArray(prompt.images)) {
      for (const img of prompt.images) {
        imageFileNames.add(img);
      }
    }
  }

  // Read images as Base64
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
 * Get AI config (from localStorage)
 * 获取 AI 配置（从 localStorage）
 */
/**
 * Upload data to WebDAV (including images, version history and AI configuration)
 * 上传数据到 WebDAV（包含图片、版本历史和 AI 配置）
 * Prefer main process IPC to bypass CORS
 * 优先使用主进程 IPC 绕过 CORS
 * @param config WebDAV config
 * @param options Sync options (optional)
 */
export async function uploadToWebDAV(
  config: WebDAVConfig,
  options?: WebDAVSyncOptions,
): Promise<SyncResult> {
  // Use incremental sync by default
  // 默认使用增量同步
  if (options?.incrementalSync !== false) {
    return await incrementalUpload(config, options);
  }

  try {
    // Full backup mode (legacy compatible)
    // 全量备份模式（兼容旧版）
    const fullBackup = await exportDatabase();

    // Decide whether to include images based on options
    // 根据选项决定是否包含图片
    const includeImages = options?.includeImages ?? true;
    const images = includeImages ? fullBackup.images : undefined;
    const videos = includeImages ? fullBackup.videos : undefined;
    const imagesCount = images ? Object.keys(images).length : 0;
    const videosCount = videos ? Object.keys(videos).length : 0;

    const backupData: BackupData = {
      version: "3.1", // Upgrade version / 升级版本号（添加 skills 支持）
      exportedAt: new Date().toISOString(),
      prompts: fullBackup.prompts,
      folders: fullBackup.folders,
      versions: fullBackup.versions, // Include version history / 包含版本历史
      images,
      videos,
      aiConfig: fullBackup.aiConfig,
      settings: fullBackup.settings,
      settingsUpdatedAt: fullBackup.settingsUpdatedAt,
      skills: fullBackup.skills,
      skillVersions: fullBackup.skillVersions,
      skillFiles: fullBackup.skillFiles,
    };

    // Ensure remote directory exists
    await ensureDirectory(config.url, config);

    const fileUrl = `${config.url.replace(/\/$/, "")}/${BACKUP_FILENAME}`;
    let bodyString: string;

    // If encryption password is provided, only encrypt non-image data
    // 如果提供了加密密码，则只加密非图片数据
    if (options?.encryptionPassword) {
      try {
        // Separate image data, only encrypt other data
        // 分离图片数据，只加密其他数据
        const dataToEncrypt = {
          version: backupData.version,
          exportedAt: backupData.exportedAt,
          prompts: backupData.prompts,
          folders: backupData.folders,
          versions: backupData.versions,
          aiConfig: backupData.aiConfig,
          settings: backupData.settings,
          settingsUpdatedAt: backupData.settingsUpdatedAt,
          skills: backupData.skills,
          skillVersions: backupData.skillVersions,
          skillFiles: backupData.skillFiles,
        };
        const encryptedContent = await encryptData(
          JSON.stringify(dataToEncrypt),
          options.encryptionPassword,
        );
        // Images are not encrypted, stored separately
        // 图片不加密，单独存储
        bodyString = JSON.stringify({
          encrypted: true,
          data: encryptedContent,
          images: backupData.images,
        });
      } catch (error) {
        return {
          success: false,
          message: `Encryption failed: ${error instanceof Error ? error.message : "Unknown error"} / 加密失败: ${error instanceof Error ? error.message : "未知错误"}`,
        };
      }
    } else {
      bodyString = JSON.stringify(backupData, null, 2);
    }

    const promptsCount = fullBackup.prompts.length;
    const versionsCount = fullBackup.versions?.length || 0;

    // Prefer main process IPC (bypass CORS)
    // 优先使用主进程 IPC（绕过 CORS）
    if (window.electron?.webdav?.upload) {
      const result = await window.electron.webdav.upload(
        fileUrl,
        config,
        bodyString,
      );
      if (result.success) {
        return {
          success: true,
          message: `Upload successful (${promptsCount} prompts, ${versionsCount} versions, ${imagesCount} images, ${videosCount} videos) / 上传成功 (${promptsCount} 条 Prompt, ${versionsCount} 个版本, ${imagesCount} 张图片, ${videosCount} 个视频)`,
          timestamp: new Date().toISOString(),
          localChanged: false,
          details: {
            promptsUploaded: promptsCount,
            imagesUploaded: imagesCount,
          },
        };
      } else {
        return {
          success: false,
          message: `Upload failed: ${result.error} / 上传失败: ${result.error}`,
        };
      }
    }

    // Fallback to fetch (only effective in packaged Electron)
    // 回退到 fetch（仅在打包后的 Electron 中有效）
    const authHeader = "Basic " + btoa(`${config.username}:${config.password}`);
    const bodyBlob = new Blob([bodyString], { type: "application/json" });

    const response = await fetch(fileUrl, {
      method: "PUT",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        "Content-Length": String(bodyBlob.size),
        "User-Agent": "PromptHub/1.0",
      },
      body: bodyBlob,
    });

    if (response.ok || response.status === 201 || response.status === 204) {
      return {
        success: true,
        message: `Upload successful (${promptsCount} prompts, ${versionsCount} versions, ${imagesCount} images, ${videosCount} videos) / 上传成功 (${promptsCount} 条 Prompt, ${versionsCount} 个版本, ${imagesCount} 张图片, ${videosCount} 个视频)`,
        timestamp: new Date().toISOString(),
        localChanged: false,
        details: {
          promptsUploaded: promptsCount,
          imagesUploaded: imagesCount,
        },
      };
    } else {
      return {
        success: false,
        message: `Upload failed: ${response.status} ${response.statusText} / 上传失败: ${response.status} ${response.statusText}`,
      };
    }
  } catch (error) {
    return {
      success: false,
      message: `Upload failed: ${error instanceof Error ? error.message : "Unknown error"} / 上传失败: ${error instanceof Error ? error.message : "未知错误"}`,
    };
  }
}

/**
 * Restore images to local
 * 恢复图片到本地
 */
async function restoreImages(images: {
  [fileName: string]: string;
}): Promise<number> {
  let restoredCount = 0;

  for (const [fileName, base64] of Object.entries(images)) {
    try {
      const success = await window.electron?.saveImageBase64?.(
        fileName,
        base64,
      );
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
 * Incremental upload to WebDAV
 * 增量上传到 WebDAV
 * Only upload changed files to significantly reduce traffic
 * 只上传有变化的文件，大幅减少流量消耗
 */
export async function incrementalUpload(
  config: WebDAVConfig,
  options?: WebDAVSyncOptions,
): Promise<SyncResult> {
  try {
    const baseUrl = config.url.replace(/\/$/, "");
    const backupDirUrl = `${baseUrl}/${BACKUP_DIR}`;
    const imagesDirUrl = `${backupDirUrl}/${IMAGES_DIR}`;
    const manifestUrl = `${backupDirUrl}/${MANIFEST_FILENAME}`;
    const dataUrl = `${backupDirUrl}/${DATA_FILENAME}`;

    // Ensure directory structure exists
    // 确保目录结构存在
    await ensureDirectory(backupDirUrl, config);
    const includeImages = options?.includeImages !== false;

    if (includeImages) {
      await ensureDirectory(imagesDirUrl, config);
      await ensureDirectory(`${backupDirUrl}/${VIDEOS_DIR}`, config);
    }

    // Get full data but skip video content to save memory
    // 获取全量数据但跳过视频内容以节省内存
    const fullBackup = await exportDatabase({ skipVideoContent: true });

    // Keep images in memory as they are usually small
    // 保持图片在内存中，因为它们通常比较小

    // Prepare core data (without images)
    // 准备核心数据（不含图片）
    const coreData = {
      version: "4.0",
      exportedAt: new Date().toISOString(),
      prompts: fullBackup.prompts,
      folders: fullBackup.folders,
      versions: fullBackup.versions,
      aiConfig: fullBackup.aiConfig,
      settings: fullBackup.settings,
      settingsUpdatedAt: fullBackup.settingsUpdatedAt,
      skills: fullBackup.skills,
      skillVersions: fullBackup.skillVersions,
      skillFiles: fullBackup.skillFiles,
    };

    let dataString = JSON.stringify(coreData);

    // Encryption
    // 加密处理
    if (options?.encryptionPassword) {
      const encryptedContent = await encryptData(
        dataString,
        options.encryptionPassword,
      );
      dataString = JSON.stringify({ encrypted: true, data: encryptedContent });
    }

    const dataHash = await computeHash(dataString);

    // Get remote manifest
    // 获取远程 manifest
    let remoteManifest: BackupManifest | null = null;
    const manifestResult = await downloadFile(manifestUrl, config);
    if (manifestResult.success && manifestResult.data) {
      try {
        remoteManifest = JSON.parse(manifestResult.data);
      } catch {
        remoteManifest = null;
      }
    }

    let uploadedCount = 0;
    let skippedCount = 0;
    let imagesUploaded = 0;

    // Check if data needs update
    // 检查数据是否需要更新
    if (!remoteManifest || remoteManifest.dataHash !== dataHash) {
      const success = await uploadFile(dataUrl, config, dataString);
      if (!success) {
        return {
          success: false,
          message: "Failed to upload data file / 上传数据文件失败",
        };
      }
      uploadedCount++;
      console.log("📤 Uploaded data.json (changed)");
    } else {
      skippedCount++;
      console.log("⏭️ Skipped data.json (unchanged)");
    }

    // Incremental image upload
    // 处理图片增量上传
    const newImageManifest: BackupManifest["images"] = {};

    if (includeImages && fullBackup.images) {
      for (const [fileName, base64] of Object.entries(fullBackup.images)) {
        const imageHash = await computeHash(base64);
        const remoteImage = remoteManifest?.images?.[fileName];

        // Check if image needs update
        // 检查图片是否需要更新
        if (!remoteImage || remoteImage.hash !== imageHash) {
          const imageUrl = `${imagesDirUrl}/${encodeURIComponent(fileName)}.base64`;
          const success = await uploadFile(imageUrl, config, base64);
          if (success) {
            imagesUploaded++;
            console.log(`📤 Uploaded image: ${fileName}`);
          }
        } else {
          skippedCount++;
          console.log(`⏭️ Skipped image: ${fileName} (unchanged)`);
        }

        newImageManifest[fileName] = {
          hash: imageHash,
          size: base64.length,
          uploadedAt: new Date().toISOString(),
        };
      }
    }

    // Incremental video upload
    // 处理视频增量上传
    const newVideoManifest: BackupManifest["videos"] = {};
    const videosDirUrl = `${backupDirUrl}/${VIDEOS_DIR}`;
    let videosUploaded = 0;

    // Stream-like processing for videos to avoid OOM
    // 流式处理视频以避免 OOM
    if (includeImages) {
      // 1. Collect video filenames
      const videoFiles = new Set<string>();
      fullBackup.prompts.forEach((p) =>
        p.videos?.forEach((v) => videoFiles.add(v)),
      );

      // 2. Process one by one
      for (const fileName of videoFiles) {
        try {
          // Read on demand
          const base64 = await window.electron?.readVideoBase64?.(fileName);
          if (!base64) {
            console.warn(
              `[WebDAV] Skipped video ${fileName}: File not found or empty`,
            );
            continue;
          }

          const videoHash = await computeHash(base64);
          const remoteVideo = remoteManifest?.videos?.[fileName];

          if (!remoteVideo || remoteVideo.hash !== videoHash) {
            const videoUrl = `${videosDirUrl}/${encodeURIComponent(fileName)}.base64`;
            // Upload immediately and release memory
            const success = await uploadFile(videoUrl, config, base64);
            if (success) {
              videosUploaded++;
              console.log(`📤 Uploaded video: ${fileName}`);
            }
          } else {
            skippedCount++;
            console.log(`⏭️ Skipped video: ${fileName} (unchanged)`);
          }

          newVideoManifest[fileName] = {
            hash: videoHash,
            size: base64.length,
            uploadedAt: new Date().toISOString(),
          };
        } catch (videoError) {
          console.error(
            `[WebDAV] Failed to process video ${fileName}:`,
            videoError,
          );
        }
      }
    }

    const promptsCount = fullBackup.prompts.length;
    const versionsCount = fullBackup.versions?.length || 0;
    const totalImages = Object.keys(newImageManifest).length;
    const totalVideos = Object.keys(newVideoManifest).length;
    const hasRemoteChanges =
      uploadedCount > 0 || imagesUploaded > 0 || videosUploaded > 0;

    if (!hasRemoteChanges) {
      return {
        success: true,
        message:
          "Already up to date, no sync needed / 数据已是最新，无需同步",
        timestamp: new Date().toISOString(),
        localChanged: false,
        details: {
          promptsUploaded: 0,
          imagesUploaded: 0,
          videosUploaded: 0,
          skipped: skippedCount,
        },
      };
    }

    // Update manifest only when the remote backup actually changed.
    // 仅当远端备份确实发生变化时才更新 manifest。
    const newManifest: BackupManifest = {
      version: "4.0",
      createdAt: remoteManifest?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      dataHash,
      images: newImageManifest,
      videos: newVideoManifest,
      encrypted: !!options?.encryptionPassword,
    };

    const manifestSuccess = await uploadFile(
      manifestUrl,
      config,
      JSON.stringify(newManifest, null, 2),
    );
    if (!manifestSuccess) {
      return {
        success: false,
        message: "Failed to upload manifest / 上传 manifest 失败",
      };
    }

    return {
      success: true,
      message: `Incremental upload completed (${promptsCount} prompts, ${versionsCount} versions, ${imagesUploaded}/${totalImages} images updated, ${videosUploaded}/${totalVideos} videos updated, ${skippedCount} files skipped) / 增量上传完成 (${promptsCount} 条 Prompt, ${versionsCount} 个版本, ${imagesUploaded}/${totalImages} 张图片更新, ${videosUploaded}/${totalVideos} 个视频更新, ${skippedCount} 个文件跳过)`,
      timestamp: new Date().toISOString(),
      localChanged: false,
      details: {
        promptsUploaded: promptsCount,
        imagesUploaded,
        videosUploaded,
        skipped: skippedCount,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: `Incremental upload failed: ${error instanceof Error ? error.message : "Unknown error"} / 增量上传失败: ${error instanceof Error ? error.message : "未知错误"}`,
    };
  }
}

/**
 * Incremental download from WebDAV
 * 增量下载从 WebDAV
 * Only download changed files
 * 只下载有变化的文件
 */
export async function incrementalDownload(
  config: WebDAVConfig,
  options?: WebDAVSyncOptions,
): Promise<SyncResult> {
  try {
    const baseUrl = config.url.replace(/\/$/, "");
    const backupDirUrl = `${baseUrl}/${BACKUP_DIR}`;
    const imagesDirUrl = `${backupDirUrl}/${IMAGES_DIR}`;
    const manifestUrl = `${backupDirUrl}/${MANIFEST_FILENAME}`;
    const dataUrl = `${backupDirUrl}/${DATA_FILENAME}`;

    // Download manifest
    // 下载 manifest
    const manifestResult = await downloadFile(manifestUrl, config);
    if (!manifestResult.success || !manifestResult.data) {
      // Try legacy single-file backup compatibility
      // 尝试兼容旧版单文件备份
      return await downloadFromWebDAV(config, options);
    }

    let manifest: BackupManifest;
    try {
      // Clean up data: remove BOM and whitespace
      // 清理数据：移除 BOM 和空白字符
      let cleanData = manifestResult.data;

      // Remove BOM if present
      if (cleanData.charCodeAt(0) === 0xfeff) {
        cleanData = cleanData.slice(1);
      }

      // Aggressively find JSON boundaries (handle garbage before/after)
      // 激进地查找 JSON 边界（处理前后的垃圾字符）
      const firstBrace = cleanData.indexOf("{");
      const lastBrace = cleanData.lastIndexOf("}");

      if (firstBrace !== -1 && lastBrace !== -1) {
        cleanData = cleanData.substring(firstBrace, lastBrace + 1);
      }

      cleanData = cleanData.trim();
      manifest = JSON.parse(cleanData);
    } catch (parseError) {
      // Log detailed error info for debugging
      // 记录详细错误信息用于调试
      const preview = manifestResult.data.substring(0, 200);
      console.error("[WebDAV] Failed to parse manifest.json:", parseError);
      console.error("[WebDAV] Received data preview:", preview);
      console.error("[WebDAV] Data length:", manifestResult.data.length);

      // Check if it's an HTML error page from the server
      // 检查是否是服务器返回的 HTML 错误页面
      if (manifestResult.data.trim().startsWith("<")) {
        return {
          success: false,
          message:
            "Server returned HTML instead of JSON, please check WebDAV server status / 服务器返回了 HTML 而非 JSON，请检查 WebDAV 服务器状态",
        };
      }

      return {
        success: false,
        message: `Invalid manifest file format / manifest 文件格式错误 (${preview.substring(0, 50)}...)`,
      };
    }

    // Download data file
    // 下载数据文件
    const dataResult = await downloadFile(dataUrl, config);
    if (!dataResult.success || !dataResult.data) {
      return {
        success: false,
        message: "Failed to download data file / 下载数据文件失败",
      };
    }

    let coreData: any;

    // Encryption
    // 处理加密
    if (manifest.encrypted) {
      if (!options?.encryptionPassword) {
        return {
          success: false,
          message:
            "Data is encrypted, please provide decryption password / 数据已加密，请提供解密密码",
        };
      }
      try {
        const parsed = JSON.parse(dataResult.data);
        const decrypted = await decryptData(
          parsed.data,
          options.encryptionPassword,
        );
        coreData = JSON.parse(decrypted);
      } catch {
        return {
          success: false,
          message:
            "Decryption failed, password may be incorrect / 解密失败，密码可能不正确",
        };
      }
    } else {
      coreData = JSON.parse(dataResult.data);
    }

    // Restore core data
    // 恢复核心数据
    await restoreFromBackup({
      version:
        typeof coreData.version === "string"
          ? parseInt(coreData.version) || 1
          : (coreData.version as number),
      exportedAt: coreData.exportedAt,
      prompts: coreData.prompts,
      folders: coreData.folders,
      versions: coreData.versions || [],
      skills: coreData.skills,
      skillVersions: coreData.skillVersions,
      skillFiles: coreData.skillFiles,
    });

    // Download images
    // 下载图片
    let imagesDownloaded = 0;
    if (manifest.images && Object.keys(manifest.images).length > 0) {
      for (const [fileName] of Object.entries(manifest.images)) {
        const imageUrl = `${imagesDirUrl}/${encodeURIComponent(fileName)}.base64`;
        const imageResult = await downloadFile(imageUrl, config);
        if (imageResult.success && imageResult.data) {
          const success = await window.electron?.saveImageBase64?.(
            fileName,
            imageResult.data,
          );
          if (success) {
            imagesDownloaded++;
          }
        }
      }
    }

    // Download videos
    // 下载视频
    let videosDownloaded = 0;
    const videosDirUrl = `${backupDirUrl}/${VIDEOS_DIR}`;
    if (manifest.videos && Object.keys(manifest.videos).length > 0) {
      for (const [fileName] of Object.entries(manifest.videos)) {
        const videoUrl = `${videosDirUrl}/${encodeURIComponent(fileName)}.base64`;
        const videoResult = await downloadFile(videoUrl, config);
        if (videoResult.success && videoResult.data) {
          const success = await window.electron?.saveVideoBase64?.(
            fileName,
            videoResult.data,
          );
          if (success) {
            videosDownloaded++;
          }
        }
      }
    }

    // Restore AI config and settings
    // 恢复 AI 配置和设置
    if (coreData.aiConfig) {
      restoreAiConfigSnapshot(coreData.aiConfig);
    }
    if (coreData.settings) {
      restoreSettingsStateSnapshot(coreData.settings, {
        preserveLocalFields: SENSITIVE_SETTINGS_FIELDS,
      });
    }

    return {
      success: true,
      message: `Incremental download completed (${coreData.prompts?.length || 0} prompts, ${imagesDownloaded} images, ${videosDownloaded} videos) / 增量下载完成 (${coreData.prompts?.length || 0} 条 Prompt, ${imagesDownloaded} 张图片, ${videosDownloaded} 个视频)`,
      timestamp: coreData.exportedAt,
      localChanged: true,
      details: {
        promptsDownloaded: coreData.prompts?.length || 0,
        imagesDownloaded,
        videosDownloaded,
        skillsDownloaded: coreData.skills?.length || 0,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: `Incremental download failed: ${error instanceof Error ? error.message : "Unknown error"} / 增量下载失败: ${error instanceof Error ? error.message : "未知错误"}`,
    };
  }
}

/**
 * Download data from WebDAV (including images, version history)
 * 从 WebDAV 下载数据（包含图片、版本历史）
 * Prefer main process IPC to bypass CORS
 * 优先使用主进程 IPC 绕过 CORS
 * @param config WebDAV config
 * @param options Sync options (optional, for decryption)
 */
export async function downloadFromWebDAV(
  config: WebDAVConfig,
  options?: WebDAVSyncOptions,
): Promise<SyncResult> {
  // Use incremental sync by default
  // 默认使用增量同步
  if (options?.incrementalSync !== false) {
    // Try incremental download first
    // 先尝试增量下载
    const baseUrl = config.url.replace(/\/$/, "");
    const manifestUrl = `${baseUrl}/${BACKUP_DIR}/${MANIFEST_FILENAME}`;
    const manifestResult = await downloadFile(manifestUrl, config);
    if (manifestResult.success && manifestResult.data) {
      return await incrementalDownload(config, options);
    }
    // If no incremental backup exists, fallback to legacy mode
    // 如果没有增量备份，回退到旧版
  }

  try {
    const fileUrl = `${config.url.replace(/\/$/, "")}/${BACKUP_FILENAME}`;

    let data: BackupData;
    let rawData: string;

    // Prefer main process IPC (bypass CORS)
    // 优先使用主进程 IPC（绕过 CORS）
    if (window.electron?.webdav?.download) {
      const result = await window.electron.webdav.download(fileUrl, config);
      if (result.notFound) {
        return {
          success: false,
          message: "No remote backup found / 远程没有备份文件",
        };
      }
      if (!result.success || !result.data) {
        return {
          success: false,
          message: `Download failed: ${result.error} / 下载失败: ${result.error}`,
        };
      }
      rawData = result.data;
    } else {
      // Fallback to fetch (only effective in packaged Electron)
      // 回退到 fetch（仅在打包后的 Electron 中有效）
      const response = await fetch(fileUrl, {
        method: "GET",
        headers: {
          Authorization:
            "Basic " + btoa(`${config.username}:${config.password}`),
        },
      });

      if (response.status === 404) {
        return {
          success: false,
          message: "No remote backup found / 远程没有备份文件",
        };
      }

      if (!response.ok) {
        return {
          success: false,
          message: `Download failed: ${response.status} ${response.statusText} / 下载失败: ${response.status} ${response.statusText}`,
        };
      }

      rawData = await response.text();
    }

    // Parse data and check if encrypted
    // 解析数据，检查是否加密
    const parsed = JSON.parse(rawData);
    let images: { [fileName: string]: string } | undefined;

    if (parsed.encrypted && parsed.data) {
      // Data is encrypted, needs decryption
      // 数据已加密，需要解密
      if (!options?.encryptionPassword) {
        return {
          success: false,
          message:
            "Data is encrypted, please provide decryption password / 数据已加密，请提供解密密码",
        };
      }
      try {
        const decrypted = await decryptData(
          parsed.data,
          options.encryptionPassword,
        );
        data = JSON.parse(decrypted);
        // Images are not encrypted; read from parsed
        // 图片是未加密的，从 parsed 中获取
        images = parsed.images;
      } catch (error) {
        return {
          success: false,
          message:
            "Decryption failed, password may be incorrect / 解密失败，密码可能不正确",
        };
      }
    } else {
      data = parsed;
      images = data.images;
    }

    const videos = parsed.videos || data?.videos;

    // Restore data (convert to DatabaseBackup format)
    // 恢复数据 - 转换为 DatabaseBackup 格式
    await restoreFromBackup({
      version:
        typeof data.version === "string"
          ? parseInt(data.version) || 1
          : (data.version as number),
      exportedAt: data.exportedAt,
      prompts: data.prompts,
      folders: data.folders,
      versions: data.versions || [],
      videos: videos || {},
      skills: data.skills,
      skillVersions: data.skillVersions,
      skillFiles: data.skillFiles,
    });

    // Restore images (using the correct image data source)
    // 恢复图片（使用正确的图片数据源）
    let imagesRestored = 0;
    if (images && Object.keys(images).length > 0) {
      imagesRestored = await restoreImages(images);
    }

    // Restore AI config
    // 恢复 AI 配置
    if (data.aiConfig) {
      restoreAiConfigSnapshot(data.aiConfig);
    }

    // Restore system settings
    // 恢复系统设置
    if (data.settings) {
      restoreSettingsStateSnapshot(data.settings, {
        preserveLocalFields: SENSITIVE_SETTINGS_FIELDS,
      });
    }

    return {
      success: true,
      message: `Download successful (${data.prompts?.length || 0} prompts, ${imagesRestored} images, ${Object.keys(videos || {}).length} videos${data.aiConfig ? ", AI config synced" : ""}${data.settings ? ", settings synced" : ""}) / 下载成功 (${data.prompts?.length || 0} 条 Prompt, ${imagesRestored} 张图片, ${Object.keys(videos || {}).length} 个视频${data.aiConfig ? ", AI配置已同步" : ""}${data.settings ? ", 设置已同步" : ""})`,
      timestamp: data.exportedAt,
      localChanged: true,
      details: {
        promptsDownloaded: data.prompts?.length || 0,
        imagesDownloaded: imagesRestored,
        skillsDownloaded: data.skills?.length || 0,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: `Download failed: ${error instanceof Error ? error.message : "Unknown error"} / 下载失败: ${error instanceof Error ? error.message : "未知错误"}`,
    };
  }
}

/**
 * Get remote backup info (including detailed data)
 * 获取远程备份信息（包含详细数据）
 * Prefer main process IPC to bypass CORS
 * 优先使用主进程 IPC 绕过 CORS
 */
export async function getRemoteBackupInfo(config: WebDAVConfig): Promise<{
  exists: boolean;
  timestamp?: string;
  data?: BackupData;
}> {
  try {
    const fileUrl = `${config.url.replace(/\/$/, "")}/${BACKUP_FILENAME}`;

    // Prefer main process IPC (bypass CORS)
    // 优先使用主进程 IPC（绕过 CORS）
    if (window.electron?.webdav?.download) {
      const result = await window.electron.webdav.download(fileUrl, config);
      if (result.notFound || !result.success || !result.data) {
        return { exists: false };
      }
      const data: BackupData = JSON.parse(result.data);
      return {
        exists: true,
        timestamp: data.exportedAt,
        data,
      };
    }

    // Fallback to fetch (only effective in packaged Electron)
    // 回退到 fetch（仅在打包后的 Electron 中有效）
    const response = await fetch(fileUrl, {
      method: "GET",
      headers: {
        Authorization: "Basic " + btoa(`${config.username}:${config.password}`),
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
 * Get remote backup timestamp without downloading the full file
 * 获取远程备份时间戳，无需下载完整文件
 * Uses WebDAV PROPFIND to get file metadata (lastmodified)
 * 使用 WebDAV PROPFIND 获取文件元数据（lastmodified）
 */
export async function getRemoteBackupTimestamp(config: WebDAVConfig): Promise<{
  exists: boolean;
  lastModified?: string;
}> {
  try {
    const fileUrl = `${config.url.replace(/\/$/, "")}/${BACKUP_FILENAME}`;

    // Prefer main process IPC (bypass CORS)
    // 优先使用主进程 IPC（绕过 CORS）
    if (window.electron?.webdav?.stat) {
      const result = await window.electron.webdav.stat(fileUrl, config);
      if (result.notFound || !result.success) {
        return { exists: false };
      }
      return {
        exists: true,
        lastModified: result.lastModified,
      };
    }

    // Fallback to fetch HEAD request (only effective in packaged Electron)
    // 回退到 fetch HEAD 请求（仅在打包后的 Electron 中有效）
    const response = await fetch(fileUrl, {
      method: "HEAD",
      headers: {
        Authorization: "Basic " + btoa(`${config.username}:${config.password}`),
      },
    });

    if (response.status === 404) {
      return { exists: false };
    }

    if (response.ok) {
      const lastModified = response.headers.get("Last-Modified") ?? undefined;
      return {
        exists: true,
        lastModified,
      };
    }

    return { exists: false };
  } catch {
    return { exists: false };
  }
}

/**
 * Bidirectional smart sync
 * 双向智能同步
 * Compare timestamps of local and remote data to decide sync direction automatically
 * 比较本地和远程数据的时间戳，自动决定同步方向
 * @param config WebDAV config
 * @param options Sync options (optional)
 */
export async function bidirectionalSync(
  config: WebDAVConfig,
  options?: WebDAVSyncOptions,
): Promise<SyncResult> {
  try {
    // Get local data
    // 获取本地数据
    const localPrompts = await getAllPrompts();
    const localFolders = await getAllFolders();

    // Get latest local update time
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

    // Include settings update time in comparison (for cross-device consistency)
    // 设置更新时间也纳入比较（保证换设备配置一致）
    try {
      const raw = localStorage.getItem("prompthub-settings");
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

    // Get remote backup timestamp via PROPFIND (lightweight, no full download)
    // 通过 PROPFIND 获取远程备份时间戳（轻量级，无需下载完整文件）
    const remoteTimestamp = await getRemoteBackupTimestamp(config);

    // If remote is empty, upload local data
    // 如果远程没有数据，上传本地数据
    if (!remoteTimestamp.exists) {
      console.log("🔄 Remote is empty, uploading local data...");
      return await uploadToWebDAV(config, options);
    }

    const remoteTime = new Date(remoteTimestamp.lastModified || 0);

    // Compare timestamps to decide sync direction
    // 比较时间戳决定同步方向
    if (remoteTime > localLatestTime) {
      // Remote is newer, download
      // 远程数据更新，下载
      console.log("🔄 Remote is newer, downloading...");
      return await downloadFromWebDAV(config, options);
    } else if (localLatestTime > remoteTime) {
      // Local is newer, upload
      // 本地数据更新，上传
      console.log("🔄 Local is newer, uploading...");
      return await uploadToWebDAV(config, options);
    } else {
      // Data is up to date, no sync needed
      // 数据一致，无需同步
      return {
        success: true,
        message: "Already up to date, no sync needed / 数据已是最新，无需同步",
        timestamp: new Date().toISOString(),
        localChanged: false,
      };
    }
  } catch (error) {
    return {
      success: false,
      message: `Sync failed: ${error instanceof Error ? error.message : "Unknown error"} / 同步失败: ${error instanceof Error ? error.message : "未知错误"}`,
    };
  }
}

/**
 * Auto sync (for startup and scheduled sync)
 * 自动同步（用于启动时和定时同步）
 * Default uses bidirectional sync strategy
 * 默认采用双向同步策略
 * @param config WebDAV config
 * @param options Sync options (optional)
 */
export async function autoSync(
  config: WebDAVConfig,
  options?: WebDAVSyncOptions,
): Promise<SyncResult> {
  return await bidirectionalSync(config, options);
}
