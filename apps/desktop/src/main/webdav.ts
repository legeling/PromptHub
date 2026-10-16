/**
 * WebDAV main process handler module
 * Sends requests through main process to bypass CORS restrictions
 * WebDAV 主进程处理模块
 * 通过主进程发送请求以绕过 CORS 限制
 */

import { ipcMain } from "electron";
import https from "https";
import http from "http";
import {
  getE2EWebDAVMode,
  handleE2EWebDAVRequest,
  isE2EEnabled,
} from "./testing/e2e";
import { getHttpRequestAgent } from "./services/network-proxy";
import { parseRemoteWriteCondition, remoteWriteHeaders } from "@prompthub/shared/utils/remote-write-condition";
import type { RemoteTextStorage, RemoteUploadResult } from "@prompthub/shared/types/remote-sync";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";

export interface WebDAVConfig {
  url: string;
  username: string;
  password: string;
}

interface WebDAVResponse {
  success: boolean;
  status?: number;
  statusText?: string;
  data?: string;
  etag?: string;
  error?: string;
}

/**
 * Send WebDAV request (using Node.js http/https modules)
 * 发送 WebDAV 请求（使用 Node.js http/https 模块）
 */
async function sendWebDAVRequest(
  method: string,
  urlString: string,
  authHeader: string,
  headers: Record<string, string> = {},
  body?: string,
): Promise<WebDAVResponse> {
  return new Promise((resolve) => {
    try {
      const url = new URL(urlString);
      const isHttps = url.protocol === "https:";
      const httpModule = isHttps ? https : http;
      const agent = getHttpRequestAgent(url);

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method,
        headers: {
          Authorization: authHeader,
          "User-Agent": "PromptHub/1.0",
          ...headers,
        },
        agent,
      };

      const request = httpModule.request(options, (response) => {
        let responseData = "";
        // Decode across network chunks so split UTF-8 sequences stay intact.
        response.setEncoding("utf8");

        response.on("data", (chunk: string) => {
          responseData += chunk;
        });

        response.on("end", () => {
          const statusCode = response.statusCode || 0;
          resolve({
            success: statusCode >= 200 && statusCode < 400,
            status: statusCode,
            statusText: response.statusMessage || "",
            data: responseData,
            etag: response.headers.etag,
          });
        });

        response.on("error", (error) => {
          resolve({
            success: false,
            status: response.statusCode,
            error: error.message,
          });
        });
      });

      request.on("error", (error) => {
        resolve({
          success: false,
          error: error.message,
        });
      });

      if (body) {
        request.write(body, "utf8");
      }

      request.end();
    } catch (error) {
      resolve({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
}

/**
 * Register WebDAV IPC handlers
 * 注册 WebDAV IPC 处理器
 */
export function registerWebDAVIPC() {
  const useE2EWebDAVMock = isE2EEnabled() && getE2EWebDAVMode() !== "off";
  registerWebDAVDelete(useE2EWebDAVMock);

  // Test connection
  // 测试连接
  ipcMain.handle(
    "webdav:testConnection",
    async (_event, config: WebDAVConfig) => {
      if (useE2EWebDAVMock) {
        return handleE2EWebDAVRequest("testConnection", config.url);
      }

      const authHeader =
        "Basic " +
        Buffer.from(`${config.username}:${config.password}`).toString("base64");

      const response = await sendWebDAVRequest(
        "PROPFIND",
        config.url,
        authHeader,
        { Depth: "0" },
      );

      if (response.success || response.status === 207) {
        return { success: true, message: "Connection successful" };
        // 连接成功
      } else if (response.status === 401) {
        return {
          success: false,
          message: "Authentication failed, please check username and password",
        };
        // 认证失败，请检查用户名和密码
      } else {
        return {
          success: false,
          message: `Connection failed: ${response.status} ${response.statusText || response.error}`,
        };
      }
    },
  );

  // Ensure directory exists
  // 确保目录存在
  ipcMain.handle(
    "webdav:ensureDirectory",
    async (_event, url: string, config: WebDAVConfig) => {
      if (useE2EWebDAVMock) {
        return handleE2EWebDAVRequest("ensureDirectory", url);
      }

      const authHeader =
        "Basic " +
        Buffer.from(`${config.username}:${config.password}`).toString("base64");

      // Check whether directory exists
      // 检查目录是否存在
      const checkRes = await sendWebDAVRequest("PROPFIND", url, authHeader, {
        Depth: "0",
      });

      if (checkRes.success || checkRes.status === 207) {
        return { success: true }; // Directory already exists
        // 目录已存在
      }

      // Create if missing
      // 不存在则创建
      const mkcolRes = await sendWebDAVRequest("MKCOL", url, authHeader);

      return { success: mkcolRes.success || mkcolRes.status === 201 };
    },
  );

  // Upload file
  // 上传文件
  ipcMain.handle(
    "webdav:upload",
    async (
      _event,
      fileUrl: string,
      config: WebDAVConfig,
      data: string,
      condition?: unknown,
    ): Promise<RemoteUploadResult> => {
      let parsedCondition: ReturnType<typeof parseRemoteWriteCondition>;
      try {
        parsedCondition = parseRemoteWriteCondition(condition);
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : "Invalid write condition",
        };
      }
      if (useE2EWebDAVMock) {
        const result = handleE2EWebDAVRequest("upload", fileUrl);
        return {
          success: result.success === true,
          error: typeof result.error === "string" ? result.error : undefined,
        };
      }

      return createWebDAVTextStorage(config).uploadText(fileUrl, data, parsedCondition);
    },
  );

  // Get file metadata (PROPFIND without downloading the full file)
  // 获取文件元数据（PROPFIND 无需下载完整文件）
  ipcMain.handle(
    "webdav:stat",
    async (_event, fileUrl: string, config: WebDAVConfig) => {
      if (useE2EWebDAVMock) {
        return handleE2EWebDAVRequest("stat", fileUrl);
      }

      const authHeader =
        "Basic " +
        Buffer.from(`${config.username}:${config.password}`).toString("base64");

      const response = await sendWebDAVRequest(
        "PROPFIND",
        fileUrl,
        authHeader,
        { Depth: "0" },
      );

      if (response.status === 404) {
        return { success: false, notFound: true };
      }

      if (response.success || response.status === 207) {
        // Parse the PROPFIND XML response to extract getlastmodified
        // 解析 PROPFIND XML 响应以提取 getlastmodified
        let lastModified: string | undefined;
        if (response.data) {
          const lastModMatch = response.data.match(
            /<(?:[a-zA-Z]+:)?getlastmodified>([^<]+)<\/(?:[a-zA-Z]+:)?getlastmodified>/,
          );
          if (lastModMatch) {
            lastModified = lastModMatch[1];
          }
        }
        return { success: true, lastModified };
      }

      return {
        success: false,
        error: `${response.status} ${response.statusText || response.error}`,
      };
    },
  );

  // Download file
  // 下载文件
  ipcMain.handle(
    "webdav:download",
    async (_event, fileUrl: string, config: WebDAVConfig) => {
      if (useE2EWebDAVMock) {
        return handleE2EWebDAVRequest("download", fileUrl);
      }

      return createWebDAVTextStorage(config).downloadText(fileUrl);
    },
  );
}

function registerWebDAVDelete(useE2EWebDAVMock: boolean): void {
  ipcMain.handle(
    IPC_CHANNELS.WEBDAV_DELETE,
    async (_event, fileUrl: string, config: WebDAVConfig) => {
      if (
        typeof fileUrl !== "string" ||
        !fileUrl ||
        !config ||
        typeof config.url !== "string" ||
        typeof config.username !== "string" ||
        typeof config.password !== "string"
      ) {
        return { success: false, error: "Invalid WebDAV deletion request" };
      }
      if (useE2EWebDAVMock)
        return {
          success: false,
          error: "WebDAV probe deletion is unavailable in the E2E fixture",
        };
      return createWebDAVTextStorage(config).deleteText(fileUrl);
    },
  );
}

export function createWebDAVTextStorage(config: WebDAVConfig): RemoteTextStorage {
  const authHeader = "Basic " + Buffer.from(config.username + ":" + config.password).toString("base64");
  return {
    async uploadText(fileUrl, data, condition) {
      const conditionalHeaders = remoteWriteHeaders(condition);
      const response = await sendWebDAVRequest(
        "PUT",
        fileUrl,
        authHeader,
        {
          "Content-Type": "application/json",
          "Content-Length": String(Buffer.byteLength(data, "utf8")),
          ...conditionalHeaders,
        },
        data,
      );

      if (
        response.success ||
        response.status === 201 ||
        response.status === 204
      ) {
        return { success: true, etag: response.etag };
      } else {
        return {
          success: false,
          ...(condition !== undefined &&
          [404, 409, 412].includes(response.status ?? 0)
            ? { conflict: true }
            : {}),
          error: `${response.status} ${response.statusText || response.error}`,
        };
      }
    },
    async downloadText(fileUrl) {
      const response = await sendWebDAVRequest("GET", fileUrl, authHeader);
      if (response.status === 404) return { success: false, notFound: true };
      return response.success ? { success: true, data: response.data, etag: response.etag } : { success: false, error: response.error ?? response.statusText };
    },
    async deleteText(fileUrl) {
      const response = await sendWebDAVRequest("DELETE", fileUrl, authHeader);
      return response.success || response.status === 404 ? { success: true } : { success: false, error: response.error ?? response.statusText };
    },
  };
}

export async function ensureWebDAVDirectory(config: WebDAVConfig, directory: string): Promise<void> {
  const authHeader = "Basic " + Buffer.from(config.username + ":" + config.password).toString("base64");
  const check = await sendWebDAVRequest("PROPFIND", directory, authHeader, { Depth: "0" });
  if (check.success || check.status === 207) return;
  const created = await sendWebDAVRequest("MKCOL", directory, authHeader);
  if (!created.success && created.status !== 405) throw new Error("WebDAV sync directory creation failed");
}
