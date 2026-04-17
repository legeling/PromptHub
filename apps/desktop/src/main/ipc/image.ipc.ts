import { ipcMain, dialog, shell } from "electron";
import path from "path";
import fs from "fs/promises";
import { v4 as uuidv4 } from "uuid";
import { IPC_CHANNELS } from "@prompthub/shared/constants";
import {
  resolvePublicAddress,
  isBlockedHostname,
} from "../services/skill-installer-remote";
import { getImagesDir, getVideosDir } from "../runtime-paths";

/**
 * Validate external URL to prevent SSRF attacks.
 * Uses DNS resolution to block private/internal IP addresses,
 * covering DNS rebinding, octal/hex/decimal IP, and IPv6-mapped IPv4.
 */
async function isValidExternalUrl(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url);

    // Only allow http/https protocols
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return false;
    }

    const host = parsed.hostname.toLowerCase();

    // Block obvious localhost aliases before DNS resolution
    if (isBlockedHostname(host)) {
      return false;
    }

    // Resolve hostname and verify all addresses are public
    await resolvePublicAddress(host);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate filename to prevent path traversal.
 */
function validateFileName(fileName: string, baseDir: string): string {
  // Only take the basename, removing any path components
  const safeName = path.basename(fileName);

  // Reject if filename differs from input or contains path traversal
  if (safeName !== fileName || fileName.includes("..")) {
    throw new Error("Invalid filename: path traversal detected");
  }

  const fullPath = path.join(baseDir, safeName);

  // Double-check the resolved path is within the base directory
  if (!fullPath.startsWith(baseDir + path.sep) && fullPath !== baseDir) {
    throw new Error("Invalid filename: path traversal detected");
  }

  return fullPath;
}

/**
 * Ensure a directory exists, creating it if necessary.
 */
async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Check if a path exists.
 */
async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function registerImageIPC(): void {
  // Select images
  ipcMain.handle(IPC_CHANNELS.DIALOG_SELECT_IMAGE, async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "Images", extensions: ["jpg", "png", "gif", "jpeg", "webp"] },
      ],
    });

    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths;
    }
    return [];
  });

  // Save images to app data directory
  ipcMain.handle(
    IPC_CHANNELS.IMAGE_SAVE,
    async (_event, filePaths: string[]) => {
      const imagesDir = getImagesDir();

      await ensureDir(imagesDir);

      const savedImages: string[] = [];

      for (const filePath of filePaths) {
        try {
          const ext = path.extname(filePath);
          const fileName = `${uuidv4()}${ext}`;
          const destPath = path.join(imagesDir, fileName);

          await fs.copyFile(filePath, destPath);
          savedImages.push(fileName);
        } catch (error) {
          console.error(`Failed to save image ${filePath}:`, error);
        }
      }

      return savedImages;
    },
  );

  // Open image with default app
  ipcMain.handle(IPC_CHANNELS.IMAGE_OPEN, async (_event, fileName: string) => {
    const imagesDir = getImagesDir();

    try {
      const imagePath = validateFileName(fileName, imagesDir);
      await shell.openPath(imagePath);
      return true;
    } catch (error) {
      console.error(`Failed to open image ${fileName}:`, error);
      return false;
    }
  });

  // Save image buffer
  ipcMain.handle(
    IPC_CHANNELS.IMAGE_SAVE_BUFFER,
    async (_event, buffer: Buffer) => {
      const imagesDir = getImagesDir();

      await ensureDir(imagesDir);

      try {
        const fileName = `${uuidv4()}.png`;
        const destPath = path.join(imagesDir, fileName);
        await fs.writeFile(destPath, buffer);
        return fileName;
      } catch (error) {
        console.error("Failed to save image buffer:", error);
        return null;
      }
    },
  );

  // Download image (with SSRF protection via DNS resolution)
  ipcMain.handle(IPC_CHANNELS.IMAGE_DOWNLOAD, async (_event, url: string) => {
    // Validate URL to prevent SSRF (resolves DNS to block private IPs)
    if (!(await isValidExternalUrl(url))) {
      console.error(`Blocked SSRF attempt: ${url}`);
      throw new Error("Invalid or blocked URL");
    }

    const imagesDir = getImagesDir();

    await ensureDir(imagesDir);

    try {
      const response = await fetch(url);
      if (!response.ok)
        throw new Error(`Failed to fetch image: ${response.statusText}`);

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Try to get extension from URL, default to png
      let ext = path.extname(url).split("?")[0];
      if (!ext || ext.length > 5) ext = ".png";

      const fileName = `${uuidv4()}${ext}`;
      const destPath = path.join(imagesDir, fileName);

      await fs.writeFile(destPath, buffer);
      return fileName;
    } catch (error) {
      console.error(`Failed to download image ${url}:`, error);
      return null;
    }
  });

  // Get list of all local image file names
  ipcMain.handle(IPC_CHANNELS.IMAGE_LIST, async () => {
    const imagesDir = getImagesDir();

    if (!(await pathExists(imagesDir))) {
      return [];
    }

    try {
      const files = await fs.readdir(imagesDir);
      return files.filter((f) => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
    } catch (error) {
      console.error("Failed to list images:", error);
      return [];
    }
  });

  // Get image file size in bytes
  ipcMain.handle(
    IPC_CHANNELS.IMAGE_GET_SIZE,
    async (_event, fileName: string) => {
      const imagesDir = getImagesDir();
      try {
        const imagePath = validateFileName(fileName, imagesDir);
        if (!(await pathExists(imagePath))) {
          return null;
        }
        const stat = await fs.stat(imagePath);
        return stat.size;
      } catch (error) {
        console.error(`Failed to get image size ${fileName}:`, error);
        return null;
      }
    },
  );

  // Read image as Base64
  ipcMain.handle(
    IPC_CHANNELS.IMAGE_READ_BASE64,
    async (_event, fileName: string) => {
      const imagesDir = getImagesDir();

      try {
        const imagePath = validateFileName(fileName, imagesDir);
        if (!(await pathExists(imagePath))) {
          return null;
        }
        const buffer = await fs.readFile(imagePath);
        return buffer.toString("base64");
      } catch (error) {
        console.error(`Failed to read image ${fileName}:`, error);
        return null;
      }
    },
  );

  // Save image from Base64 (for sync download)
  ipcMain.handle(
    IPC_CHANNELS.IMAGE_SAVE_BASE64,
    async (_event, fileName: string, base64Data: string) => {
      const imagesDir = getImagesDir();

      await ensureDir(imagesDir);

      try {
        const destPath = validateFileName(fileName, imagesDir);
        // Skip if file already exists
        if (await pathExists(destPath)) {
          return true;
        }
        const buffer = Buffer.from(base64Data, "base64");
        await fs.writeFile(destPath, buffer);
        return true;
      } catch (error) {
        console.error(`Failed to save image ${fileName}:`, error);
        return false;
      }
    },
  );

  // Check if image exists
  ipcMain.handle(
    IPC_CHANNELS.IMAGE_EXISTS,
    async (_event, fileName: string) => {
      const imagesDir = getImagesDir();
      try {
        const imagePath = validateFileName(fileName, imagesDir);
        return await pathExists(imagePath);
      } catch {
        return false;
      }
    },
  );

  // Clear all images
  ipcMain.handle(IPC_CHANNELS.IMAGE_CLEAR, async () => {
    try {
      const imagesDir = getImagesDir();
      if (await pathExists(imagesDir)) {
        const files = await fs.readdir(imagesDir);
        await Promise.all(
          files.map((file) => fs.unlink(path.join(imagesDir, file))),
        );
        console.log(`Cleared ${files.length} images`);
      }
      return true;
    } catch (error) {
      console.error("Failed to clear images:", error);
      return false;
    }
  });

  // ==================== Video Support ====================

  // Select videos
  ipcMain.handle(IPC_CHANNELS.DIALOG_SELECT_VIDEO, async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "Videos", extensions: ["mp4", "webm", "mov", "avi", "mkv"] },
      ],
    });

    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths;
    }
    return [];
  });

  // Save videos to app data directory
  ipcMain.handle(
    IPC_CHANNELS.VIDEO_SAVE,
    async (_event, filePaths: string[]) => {
      const videosDir = getVideosDir();

      await ensureDir(videosDir);

      const savedVideos: string[] = [];

      for (const filePath of filePaths) {
        try {
          const ext = path.extname(filePath);
          const fileName = `${uuidv4()}${ext}`;
          const destPath = path.join(videosDir, fileName);

          await fs.copyFile(filePath, destPath);
          savedVideos.push(fileName);
        } catch (error) {
          console.error(`Failed to save video ${filePath}:`, error);
        }
      }

      return savedVideos;
    },
  );

  // Open video with default app
  ipcMain.handle(IPC_CHANNELS.VIDEO_OPEN, async (_event, fileName: string) => {
    const videosDir = getVideosDir();

    try {
      const videoPath = validateFileName(fileName, videosDir);
      await shell.openPath(videoPath);
      return true;
    } catch (error) {
      console.error(`Failed to open video ${fileName}:`, error);
      return false;
    }
  });

  // Get list of all local video file names
  ipcMain.handle(IPC_CHANNELS.VIDEO_LIST, async () => {
    const videosDir = getVideosDir();

    if (!(await pathExists(videosDir))) {
      return [];
    }

    try {
      const files = await fs.readdir(videosDir);
      return files.filter((f) => /\.(mp4|webm|mov|avi|mkv)$/i.test(f));
    } catch (error) {
      console.error("Failed to list videos:", error);
      return [];
    }
  });

  // Get video file size in bytes
  ipcMain.handle(
    IPC_CHANNELS.VIDEO_GET_SIZE,
    async (_event, fileName: string) => {
      const videosDir = getVideosDir();
      try {
        const videoPath = validateFileName(fileName, videosDir);
        if (!(await pathExists(videoPath))) {
          return null;
        }
        const stat = await fs.stat(videoPath);
        return stat.size;
      } catch (error) {
        console.error(`Failed to get video size ${fileName}:`, error);
        return null;
      }
    },
  );

  // Read video as Base64
  ipcMain.handle(
    IPC_CHANNELS.VIDEO_READ_BASE64,
    async (_event, fileName: string) => {
      const videosDir = getVideosDir();

      try {
        const videoPath = validateFileName(fileName, videosDir);
        if (!(await pathExists(videoPath))) {
          return null;
        }
        const buffer = await fs.readFile(videoPath);
        return buffer.toString("base64");
      } catch (error) {
        console.error(`Failed to read video ${fileName}:`, error);
        return null;
      }
    },
  );

  // Save video from Base64 (for sync download)
  ipcMain.handle(
    IPC_CHANNELS.VIDEO_SAVE_BASE64,
    async (_event, fileName: string, base64Data: string) => {
      const videosDir = getVideosDir();

      await ensureDir(videosDir);

      try {
        const destPath = validateFileName(fileName, videosDir);
        // Skip if file already exists
        if (await pathExists(destPath)) {
          return true;
        }
        const buffer = Buffer.from(base64Data, "base64");
        await fs.writeFile(destPath, buffer);
        return true;
      } catch (error) {
        console.error(`Failed to save video ${fileName}:`, error);
        return false;
      }
    },
  );

  // Check if video exists
  ipcMain.handle(
    IPC_CHANNELS.VIDEO_EXISTS,
    async (_event, fileName: string) => {
      const videosDir = getVideosDir();
      try {
        const videoPath = validateFileName(fileName, videosDir);
        return await pathExists(videoPath);
      } catch {
        return false;
      }
    },
  );

  // Get video file path (for local protocol)
  ipcMain.handle(
    IPC_CHANNELS.VIDEO_GET_PATH,
    async (_event, fileName: string) => {
      const videosDir = getVideosDir();
      return validateFileName(fileName, videosDir);
    },
  );

  // Clear all videos
  ipcMain.handle(IPC_CHANNELS.VIDEO_CLEAR, async () => {
    try {
      const videosDir = getVideosDir();
      if (await pathExists(videosDir)) {
        const files = await fs.readdir(videosDir);
        await Promise.all(
          files.map((file) => fs.unlink(path.join(videosDir, file))),
        );
        console.log(`Cleared ${files.length} videos`);
      }
      return true;
    } catch (error) {
      console.error("Failed to clear videos:", error);
      return false;
    }
  });
}
