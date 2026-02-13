import { ipcMain, dialog, app, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

/**
 * Validate external URL to prevent SSRF attacks
 * 验证外部 URL 以防止 SSRF 攻击
 */
function isValidExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    
    // Only allow http/https protocols
    // 只允许 http/https 协议
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }
    
    const host = parsed.hostname.toLowerCase();
    
    // Block localhost
    // 禁止 localhost
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
      return false;
    }
    
    // Block private IP ranges (RFC 1918)
    // 禁止内网 IP 范围
    if (host.startsWith('10.') || 
        host.startsWith('192.168.') ||
        host.match(/^172\.(1[6-9]|2[0-9]|3[01])\./) ||
        host.startsWith('0.') ||
        host === '0.0.0.0') {
      return false;
    }
    
    // Block link-local and cloud metadata endpoints
    // 禁止链路本地和云元数据端点
    if (host.startsWith('169.254.') || host === '169.254.169.254') {
      return false;
    }
    
    // Block IPv6 localhost and link-local
    // 禁止 IPv6 本地地址
    if (host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate filename to prevent path traversal
 * 验证文件名以防止路径遍历
 */
function validateFileName(fileName: string, baseDir: string): string {
  // Only take the basename, removing any path components
  // 只取文件名部分，移除所有路径组件
  const safeName = path.basename(fileName);
  
  // Reject if filename differs from input or contains path traversal
  // 如果文件名与输入不同或包含路径遍历则拒绝
  if (safeName !== fileName || fileName.includes('..')) {
    throw new Error('Invalid filename: path traversal detected');
  }
  
  const fullPath = path.join(baseDir, safeName);
  
  // Double-check the resolved path is within the base directory
  // 二次验证解析后的路径在基础目录内
  if (!fullPath.startsWith(baseDir + path.sep) && fullPath !== baseDir) {
    throw new Error('Invalid filename: path traversal detected');
  }
  
  return fullPath;
}

export function registerImageIPC() {
    // Select images
    // 选择图片
    ipcMain.handle('dialog:selectImage', async () => {
        const result = await dialog.showOpenDialog({
            properties: ['openFile', 'multiSelections'],
            filters: [
                { name: 'Images', extensions: ['jpg', 'png', 'gif', 'jpeg', 'webp'] }
            ]
        });

        if (!result.canceled && result.filePaths.length > 0) {
            return result.filePaths;
        }
        return [];
    });

    // Save images to app data directory
    // 保存图片到应用数据目录
    ipcMain.handle('image:save', async (_event, filePaths: string[]) => {
        const userDataPath = app.getPath('userData');
        const imagesDir = path.join(userDataPath, 'images');

        if (!fs.existsSync(imagesDir)) {
            fs.mkdirSync(imagesDir, { recursive: true });
        }

        const savedImages: string[] = [];

        for (const filePath of filePaths) {
            try {
                const ext = path.extname(filePath);
                const fileName = `${uuidv4()}${ext}`;
                const destPath = path.join(imagesDir, fileName);

                fs.copyFileSync(filePath, destPath);
                savedImages.push(fileName);
            } catch (error) {
                console.error(`Failed to save image ${filePath}:`, error);
            }
        }

        return savedImages;
    });
    // Open image with default app
    // 使用默认应用打开图片
    ipcMain.handle('image:open', async (_event, fileName: string) => {
        const userDataPath = app.getPath('userData');
        const imagesDir = path.join(userDataPath, 'images');

        try {
            // Validate filename to prevent path traversal
            // 验证文件名以防止路径遍历
            const imagePath = validateFileName(fileName, imagesDir);
            await shell.openPath(imagePath);
            return true;
        } catch (error) {
            console.error(`Failed to open image ${fileName}:`, error);
            return false;
        }
    });
    // Save image buffer
    // 保存图片 buffer
    ipcMain.handle('image:save-buffer', async (_event, buffer: Buffer) => {
        const userDataPath = app.getPath('userData');
        const imagesDir = path.join(userDataPath, 'images');

        if (!fs.existsSync(imagesDir)) {
            fs.mkdirSync(imagesDir, { recursive: true });
        }

        try {
            const fileName = `${uuidv4()}.png`;
            const destPath = path.join(imagesDir, fileName);
            fs.writeFileSync(destPath, buffer);
            return fileName;
        } catch (error) {
            console.error('Failed to save image buffer:', error);
            return null;
        }
    });

    // Download image
    // 下载图片
    ipcMain.handle('image:download', async (_event, url: string) => {
        // Validate URL to prevent SSRF
        // 验证 URL 以防止 SSRF
        if (!isValidExternalUrl(url)) {
            console.error(`Blocked SSRF attempt: ${url}`);
            throw new Error('Invalid or blocked URL');
        }

        const userDataPath = app.getPath('userData');
        const imagesDir = path.join(userDataPath, 'images');

        if (!fs.existsSync(imagesDir)) {
            fs.mkdirSync(imagesDir, { recursive: true });
        }

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);

            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            // Try to get extension from URL, default to png
            // 尝试从 URL 获取扩展名，默认为 png
            let ext = path.extname(url).split('?')[0];
            if (!ext || ext.length > 5) ext = '.png';

            const fileName = `${uuidv4()}${ext}`;
            const destPath = path.join(imagesDir, fileName);

            fs.writeFileSync(destPath, buffer);
            return fileName;
        } catch (error) {
            console.error(`Failed to download image ${url}:`, error);
            return null;
        }
    });

    // Get list of all local image file names
    // 获取所有本地图片文件名列表
    ipcMain.handle('image:list', async () => {
        const userDataPath = app.getPath('userData');
        const imagesDir = path.join(userDataPath, 'images');

        if (!fs.existsSync(imagesDir)) {
            return [];
        }

        try {
            const files = fs.readdirSync(imagesDir);
            return files.filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
        } catch (error) {
            console.error('Failed to list images:', error);
            return [];
        }
    });

    // Read image as Base64
    // 读取图片为 Base64
    ipcMain.handle('image:readBase64', async (_event, fileName: string) => {
        const userDataPath = app.getPath('userData');
        const imagesDir = path.join(userDataPath, 'images');

        try {
            // Validate filename to prevent path traversal
            // 验证文件名以防止路径遍历
            const imagePath = validateFileName(fileName, imagesDir);
            if (!fs.existsSync(imagePath)) {
                return null;
            }
            const buffer = fs.readFileSync(imagePath);
            return buffer.toString('base64');
        } catch (error) {
            console.error(`Failed to read image ${fileName}:`, error);
            return null;
        }
    });

    // Save image from Base64 (for sync download)
    // 从 Base64 保存图片（用于同步下载）
    ipcMain.handle('image:saveBase64', async (_event, fileName: string, base64Data: string) => {
        const userDataPath = app.getPath('userData');
        const imagesDir = path.join(userDataPath, 'images');

        if (!fs.existsSync(imagesDir)) {
            fs.mkdirSync(imagesDir, { recursive: true });
        }

        try {
            // Validate filename to prevent path traversal
            // 验证文件名以防止路径遍历
            const destPath = validateFileName(fileName, imagesDir);
            // Skip if file already exists
            // 如果文件已存在，跳过
            if (fs.existsSync(destPath)) {
                return true;
            }
            const buffer = Buffer.from(base64Data, 'base64');
            fs.writeFileSync(destPath, buffer);
            return true;
        } catch (error) {
            console.error(`Failed to save image ${fileName}:`, error);
            return false;
        }
    });

    // Check if image exists
    // 检查图片是否存在
    ipcMain.handle('image:exists', async (_event, fileName: string) => {
        const userDataPath = app.getPath('userData');
        const imagesDir = path.join(userDataPath, 'images');
        try {
            // Validate filename to prevent path traversal
            // 验证文件名以防止路径遍历
            const imagePath = validateFileName(fileName, imagesDir);
            return fs.existsSync(imagePath);
        } catch {
            return false;
        }
    });
    
    // Clear all images
    // 清除所有图片
    ipcMain.handle('image:clear', async () => {
        try {
            const userDataPath = app.getPath('userData');
            const imagesDir = path.join(userDataPath, 'images');
            if (fs.existsSync(imagesDir)) {
                const files = fs.readdirSync(imagesDir);
                for (const file of files) {
                    fs.unlinkSync(path.join(imagesDir, file));
                }
                console.log(`Cleared ${files.length} images`);
            }
            return true;
        } catch (error) {
            console.error('Failed to clear images:', error);
            return false;
        }
    });

    // ==================== Video Support ====================
    // ==================== 视频支持 ====================

    // Select videos
    // 选择视频
    ipcMain.handle('dialog:selectVideo', async () => {
        const result = await dialog.showOpenDialog({
            properties: ['openFile', 'multiSelections'],
            filters: [
                { name: 'Videos', extensions: ['mp4', 'webm', 'mov', 'avi', 'mkv'] }
            ]
        });

        if (!result.canceled && result.filePaths.length > 0) {
            return result.filePaths;
        }
        return [];
    });

    // Save videos to app data directory
    // 保存视频到应用数据目录
    ipcMain.handle('video:save', async (_event, filePaths: string[]) => {
        const userDataPath = app.getPath('userData');
        const videosDir = path.join(userDataPath, 'videos');

        if (!fs.existsSync(videosDir)) {
            fs.mkdirSync(videosDir, { recursive: true });
        }

        const savedVideos: string[] = [];

        for (const filePath of filePaths) {
            try {
                const ext = path.extname(filePath);
                const fileName = `${uuidv4()}${ext}`;
                const destPath = path.join(videosDir, fileName);

                fs.copyFileSync(filePath, destPath);
                savedVideos.push(fileName);
            } catch (error) {
                console.error(`Failed to save video ${filePath}:`, error);
            }
        }

        return savedVideos;
    });

    // Open video with default app
    // 使用默认应用打开视频
    ipcMain.handle('video:open', async (_event, fileName: string) => {
        const userDataPath = app.getPath('userData');
        const videosDir = path.join(userDataPath, 'videos');

        try {
            // Validate filename to prevent path traversal
            // 验证文件名以防止路径遍历
            const videoPath = validateFileName(fileName, videosDir);
            await shell.openPath(videoPath);
            return true;
        } catch (error) {
            console.error(`Failed to open video ${fileName}:`, error);
            return false;
        }
    });

    // Get list of all local video file names
    // 获取所有本地视频文件名列表
    ipcMain.handle('video:list', async () => {
        const userDataPath = app.getPath('userData');
        const videosDir = path.join(userDataPath, 'videos');

        if (!fs.existsSync(videosDir)) {
            return [];
        }

        try {
            const files = fs.readdirSync(videosDir);
            return files.filter(f => /\.(mp4|webm|mov|avi|mkv)$/i.test(f));
        } catch (error) {
            console.error('Failed to list videos:', error);
            return [];
        }
    });

    // Read video as Base64
    // 读取视频为 Base64
    ipcMain.handle('video:readBase64', async (_event, fileName: string) => {
        const userDataPath = app.getPath('userData');
        const videosDir = path.join(userDataPath, 'videos');

        try {
            // Validate filename to prevent path traversal
            // 验证文件名以防止路径遍历
            const videoPath = validateFileName(fileName, videosDir);
            if (!fs.existsSync(videoPath)) {
                return null;
            }
            const buffer = fs.readFileSync(videoPath);
            return buffer.toString('base64');
        } catch (error) {
            console.error(`Failed to read video ${fileName}:`, error);
            return null;
        }
    });

    // Save video from Base64 (for sync download)
    // 从 Base64 保存视频（用于同步下载）
    ipcMain.handle('video:saveBase64', async (_event, fileName: string, base64Data: string) => {
        const userDataPath = app.getPath('userData');
        const videosDir = path.join(userDataPath, 'videos');

        if (!fs.existsSync(videosDir)) {
            fs.mkdirSync(videosDir, { recursive: true });
        }

        try {
            // Validate filename to prevent path traversal
            // 验证文件名以防止路径遍历
            const destPath = validateFileName(fileName, videosDir);
            // Skip if file already exists
            // 如果文件已存在，跳过
            if (fs.existsSync(destPath)) {
                return true;
            }
            const buffer = Buffer.from(base64Data, 'base64');
            fs.writeFileSync(destPath, buffer);
            return true;
        } catch (error) {
            console.error(`Failed to save video ${fileName}:`, error);
            return false;
        }
    });

    // Check if video exists
    // 检查视频是否存在
    ipcMain.handle('video:exists', async (_event, fileName: string) => {
        const userDataPath = app.getPath('userData');
        const videosDir = path.join(userDataPath, 'videos');
        try {
            // Validate filename to prevent path traversal
            // 验证文件名以防止路径遍历
            const videoPath = validateFileName(fileName, videosDir);
            return fs.existsSync(videoPath);
        } catch {
            return false;
        }
    });

    // Get video file path (for local protocol)
    // 获取视频文件路径（用于本地协议）
    ipcMain.handle('video:getPath', async (_event, fileName: string) => {
        const userDataPath = app.getPath('userData');
        const videosDir = path.join(userDataPath, 'videos');
        // Validate filename to prevent path traversal
        // 验证文件名以防止路径遍历
        return validateFileName(fileName, videosDir);
    });

    // Clear all videos
    // 清除所有视频
    ipcMain.handle('video:clear', async () => {
        try {
            const userDataPath = app.getPath('userData');
            const videosDir = path.join(userDataPath, 'videos');
            if (fs.existsSync(videosDir)) {
                const files = fs.readdirSync(videosDir);
                for (const file of files) {
                    fs.unlinkSync(path.join(videosDir, file));
                }
                console.log(`Cleared ${files.length} videos`);
            }
            return true;
        } catch (error) {
            console.error('Failed to clear videos:', error);
            return false;
        }
    });
}
