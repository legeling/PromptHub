import { ipcMain, dialog, shell } from "electron";
import * as http from "http";
import * as https from "https";
import path from "path";
import fs from "fs/promises";
import { v4 as uuidv4 } from "uuid";
import { IPC_CHANNELS } from "@prompthub/shared/constants";
import {
  resolvePublicAddress,
  isBlockedHostname,
} from "../services/skill-installer-remote";
import { getHttpRequestAgent } from "../services/network-proxy";
import { getImagesDir, getVideosDir } from "../runtime-paths";

const IMAGE_DOWNLOAD_TIMEOUT_MS = 30_000;
const IMAGE_DOWNLOAD_MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_DOWNLOAD_MAX_REDIRECTS = 5;
const MEDIA_SAVE_MAX_BYTES = 20 * 1024 * 1024;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".avi", ".mkv"]);

let lastSelectedImagePaths = new Set<string>();
let lastSelectedVideoPaths = new Set<string>();

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

function getRequestModule(protocol: string): typeof http | typeof https {
  return protocol === "https:" ? https : http;
}

function getSingleHeaderValue(
  header: string | string[] | undefined,
): string | undefined {
  return Array.isArray(header) ? header[0] : header;
}

function inferImageExtension(url: string, contentType?: string): string | null {
  const fromUrl = path.extname(new URL(url).pathname).toLowerCase();
  if (IMAGE_EXTENSIONS.has(fromUrl)) {
    return fromUrl;
  }

  switch ((contentType || "").split(";")[0].trim().toLowerCase()) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/gif":
      return ".gif";
    case "image/webp":
      return ".webp";
    default:
      return null;
  }
}

async function downloadImageBuffer(
  targetUrl: string,
  redirectCount = 0,
): Promise<{ buffer: Buffer; finalUrl: string; contentType?: string }> {
  if (redirectCount > IMAGE_DOWNLOAD_MAX_REDIRECTS) {
    throw new Error("Too many redirects while downloading image");
  }

  const parsedUrl = new URL(targetUrl);
  if (!(["http:", "https:"] as const).includes(parsedUrl.protocol as "http:" | "https:")) {
    throw new Error("Invalid or blocked URL");
  }

  if (isBlockedHostname(parsedUrl.hostname.toLowerCase())) {
    throw new Error("Invalid or blocked URL");
  }

  const resolvedAddress = await resolvePublicAddress(parsedUrl.hostname);
  const requestModule = getRequestModule(parsedUrl.protocol);
  const agent = getHttpRequestAgent(parsedUrl);

  return new Promise((resolve, reject) => {
    const request = requestModule.request(
      {
        protocol: parsedUrl.protocol,
        hostname: resolvedAddress.address,
        family: resolvedAddress.family,
        servername: parsedUrl.hostname,
        port: parsedUrl.port
          ? Number(parsedUrl.port)
          : parsedUrl.protocol === "https:"
            ? 443
            : 80,
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        method: "GET",
        headers: {
          Host: parsedUrl.host,
          "User-Agent": "PromptHub/image-download",
          Accept: "image/*",
        },
        agent,
        timeout: IMAGE_DOWNLOAD_TIMEOUT_MS,
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;
        const location = getSingleHeaderValue(response.headers.location);

        if (statusCode >= 300 && statusCode < 400 && location) {
          response.resume();
          const nextUrl = new URL(location, parsedUrl).toString();
          void downloadImageBuffer(nextUrl, redirectCount + 1)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (statusCode !== 200) {
          response.resume();
          reject(new Error(`Failed to fetch image: HTTP ${statusCode}`));
          return;
        }

        const contentType = getSingleHeaderValue(response.headers["content-type"]);
        if (contentType && !contentType.toLowerCase().startsWith("image/")) {
          response.resume();
          reject(new Error("Remote resource is not an image"));
          return;
        }

        const contentLengthHeader = getSingleHeaderValue(
          response.headers["content-length"],
        );
        const contentLength = Number.parseInt(contentLengthHeader ?? "", 10);
        if (
          Number.isFinite(contentLength) &&
          contentLength > IMAGE_DOWNLOAD_MAX_BYTES
        ) {
          response.resume();
          reject(new Error("Remote image exceeds size limit"));
          return;
        }

        let receivedBytes = 0;
        const chunks: Buffer[] = [];

        response.on("data", (chunk: Buffer) => {
          receivedBytes += chunk.length;
          if (receivedBytes > IMAGE_DOWNLOAD_MAX_BYTES) {
            response.destroy(new Error("Remote image exceeds size limit"));
            return;
          }
          chunks.push(chunk);
        });

        response.on("end", () => {
          resolve({
            buffer: Buffer.concat(chunks),
            finalUrl: parsedUrl.toString(),
            contentType,
          });
        });

        response.on("error", (error) => reject(error));
      },
    );

    request.on("timeout", () => {
      request.destroy(new Error("Remote image request timed out"));
    });
    request.on("error", (error) => reject(error));
    request.end();
  });
}

function isAllowedSelectedImagePath(filePath: string): boolean {
  return lastSelectedImagePaths.has(path.resolve(filePath));
}

function isAllowedSelectedVideoPath(filePath: string): boolean {
  return lastSelectedVideoPaths.has(path.resolve(filePath));
}

/**
 * Validate filename to prevent path traversal.
 */
function validateFileName(fileName: string, baseDir: string): string {
  if (
    typeof fileName !== "string" ||
    fileName.length === 0 ||
    fileName === "." ||
    fileName === ".." ||
    fileName.includes("..") ||
    /[/\\:\u0000-\u001F\u007F]/u.test(fileName)
  ) {
    throw new Error("Invalid filename: path traversal detected");
  }

  const resolvedBase = path.resolve(baseDir);
  const fullPath = path.resolve(resolvedBase, fileName);
  const relative = path.relative(resolvedBase, fullPath);

  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Invalid filename: path traversal detected");
  }

  return fullPath;
}

function assertBufferWithinMediaLimit(buffer: Buffer | Uint8Array): void {
  if (buffer.byteLength === 0) {
    throw new Error("Media content is empty");
  }
  if (buffer.byteLength > MEDIA_SAVE_MAX_BYTES) {
    throw new Error("Media content exceeds size limit");
  }
}

function toMediaBuffer(input: unknown): Buffer {
  if (Buffer.isBuffer(input)) {
    return input;
  }
  if (input instanceof ArrayBuffer) {
    return Buffer.from(input);
  }
  if (ArrayBuffer.isView(input)) {
    return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  }

  throw new Error("Invalid media buffer");
}

function decodedBase64Length(payload: string): number {
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return (payload.length / 4) * 3 - padding;
}

function decodeMediaBase64(base64Data: string): Buffer {
  if (typeof base64Data !== "string") {
    throw new Error("Invalid base64 media payload");
  }

  const payload = base64Data.trim();
  if (payload.length === 0 || payload.length % 4 !== 0) {
    throw new Error("Invalid base64 media payload");
  }
  if (decodedBase64Length(payload) > MEDIA_SAVE_MAX_BYTES) {
    throw new Error("Media content exceeds size limit");
  }
  if (!BASE64_PATTERN.test(payload)) {
    throw new Error("Invalid base64 media payload");
  }

  const buffer = Buffer.from(payload, "base64");
  assertBufferWithinMediaLimit(buffer);
  return buffer;
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

async function clearMediaDirectory(
  mediaDir: string,
  label: "images" | "videos",
): Promise<boolean> {
  try {
    if (!(await pathExists(mediaDir))) {
      return true;
    }

    const files = await fs.readdir(mediaDir);
    let removedCount = 0;
    for (const file of files) {
      try {
        await fs.unlink(path.join(mediaDir, file));
        removedCount++;
      } catch (error) {
        console.warn(`Skipped ${label} entry during clear: ${file}`, error);
      }
    }

    console.log(`Cleared ${removedCount} ${label}`);
    return true;
  } catch (error) {
    console.error(`Failed to clear ${label}:`, error);
    return false;
  }
}

async function openPathWithResult(filePath: string): Promise<boolean> {
  const error = await shell.openPath(filePath);
  return !(typeof error === "string" && error.trim().length > 0);
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
      lastSelectedImagePaths = new Set(
        result.filePaths.map((filePath) => path.resolve(filePath)),
      );
      return result.filePaths;
    }
    lastSelectedImagePaths = new Set();
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
          const resolvedFilePath = path.resolve(filePath);
          if (!isAllowedSelectedImagePath(resolvedFilePath)) {
            throw new Error("Image path was not selected through the file picker");
          }

          const ext = path.extname(filePath);
          if (!IMAGE_EXTENSIONS.has(ext.toLowerCase())) {
            throw new Error("Unsupported image type");
          }
          const fileName = `${uuidv4()}${ext}`;
          const destPath = path.join(imagesDir, fileName);

          await fs.copyFile(resolvedFilePath, destPath);
          savedImages.push(fileName);
        } catch (error) {
          console.error(`Failed to save image ${filePath}:`, error);
        }
      }

      lastSelectedImagePaths = new Set();

      return savedImages;
    },
  );

  // Open image with default app
  ipcMain.handle(IPC_CHANNELS.IMAGE_OPEN, async (_event, fileName: string) => {
    const imagesDir = getImagesDir();

    try {
      const imagePath = validateFileName(fileName, imagesDir);
      return await openPathWithResult(imagePath);
    } catch (error) {
      console.error(`Failed to open image ${fileName}:`, error);
      return false;
    }
  });

  // Save image buffer
  ipcMain.handle(
    IPC_CHANNELS.IMAGE_SAVE_BUFFER,
    async (_event, bufferInput: unknown) => {
      const imagesDir = getImagesDir();

      await ensureDir(imagesDir);

      try {
        const buffer = toMediaBuffer(bufferInput);
        assertBufferWithinMediaLimit(buffer);
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
      const { buffer, finalUrl, contentType } = await downloadImageBuffer(url);
      const ext = inferImageExtension(finalUrl, contentType);
      if (!ext) {
        throw new Error("Remote resource is not a supported image");
      }

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
        const buffer = decodeMediaBase64(base64Data);
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
    return clearMediaDirectory(getImagesDir(), "images");
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
      lastSelectedVideoPaths = new Set(
        result.filePaths.map((filePath) => path.resolve(filePath)),
      );
      return result.filePaths;
    }
    lastSelectedVideoPaths = new Set();
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
          const resolvedFilePath = path.resolve(filePath);
          if (!isAllowedSelectedVideoPath(resolvedFilePath)) {
            throw new Error("Video path was not selected through the file picker");
          }

          const ext = path.extname(filePath);
          if (!VIDEO_EXTENSIONS.has(ext.toLowerCase())) {
            throw new Error("Unsupported video type");
          }
          const fileName = `${uuidv4()}${ext}`;
          const destPath = path.join(videosDir, fileName);

          await fs.copyFile(resolvedFilePath, destPath);
          savedVideos.push(fileName);
        } catch (error) {
          console.error(`Failed to save video ${filePath}:`, error);
        }
      }

      lastSelectedVideoPaths = new Set();

      return savedVideos;
    },
  );

  // Open video with default app
  ipcMain.handle(IPC_CHANNELS.VIDEO_OPEN, async (_event, fileName: string) => {
    const videosDir = getVideosDir();

    try {
      const videoPath = validateFileName(fileName, videosDir);
      return await openPathWithResult(videoPath);
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
        const buffer = decodeMediaBase64(base64Data);
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
      try {
        return validateFileName(fileName, videosDir);
      } catch {
        return null;
      }
    },
  );

  // Clear all videos
  ipcMain.handle(IPC_CHANNELS.VIDEO_CLEAR, async () => {
    return clearMediaDirectory(getVideosDir(), "videos");
  });
}
