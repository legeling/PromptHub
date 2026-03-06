/**
 * WebDAV main process handler module
 * Sends requests through main process to bypass CORS restrictions
 * WebDAV 主进程处理模块
 * 通过主进程发送请求以绕过 CORS 限制
 */

import { ipcMain } from "electron";
import https from "https";
import http from "http";

interface WebDAVConfig {
  url: string;
  username: string;
  password: string;
}

interface WebDAVResponse {
  success: boolean;
  status?: number;
  statusText?: string;
  data?: string;
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
      };

      const request = httpModule.request(options, (response) => {
        let responseData = "";

        response.on("data", (chunk) => {
          responseData += chunk.toString();
        });

        response.on("end", () => {
          const statusCode = response.statusCode || 0;
          resolve({
            success: statusCode >= 200 && statusCode < 400,
            status: statusCode,
            statusText: response.statusMessage || "",
            data: responseData,
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
  // Test connection
  // 测试连接
  ipcMain.handle(
    "webdav:testConnection",
    async (_event, config: WebDAVConfig) => {
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
    async (_event, fileUrl: string, config: WebDAVConfig, data: string) => {
      const authHeader =
        "Basic " +
        Buffer.from(`${config.username}:${config.password}`).toString("base64");

      const response = await sendWebDAVRequest(
        "PUT",
        fileUrl,
        authHeader,
        {
          "Content-Type": "application/json",
          "Content-Length": String(Buffer.byteLength(data, "utf8")),
        },
        data,
      );

      if (
        response.success ||
        response.status === 201 ||
        response.status === 204
      ) {
        return { success: true };
      } else {
        return {
          success: false,
          error: `${response.status} ${response.statusText || response.error}`,
        };
      }
    },
  );

  // Get file metadata (PROPFIND without downloading the full file)
  // 获取文件元数据（PROPFIND 无需下载完整文件）
  ipcMain.handle(
    "webdav:stat",
    async (_event, fileUrl: string, config: WebDAVConfig) => {
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
      const authHeader =
        "Basic " +
        Buffer.from(`${config.username}:${config.password}`).toString("base64");

      const response = await sendWebDAVRequest("GET", fileUrl, authHeader);

      if (response.status === 404) {
        return { success: false, notFound: true };
      }

      if (response.success) {
        return { success: true, data: response.data };
      } else {
        return {
          success: false,
          error: `${response.status} ${response.statusText || response.error}`,
        };
      }
    },
  );
}
