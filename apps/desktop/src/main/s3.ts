import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { ipcMain } from "electron";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import { getHttpRequestAgent } from "./services/network-proxy";
import { parseRemoteWriteCondition } from "@prompthub/shared/utils/remote-write-condition";
import type {
  RemoteTextStorage,
  RemoteDownloadResult,
  RemoteUploadResult,
} from "@prompthub/shared/types/remote-sync";

export interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

interface S3ConnectionResult {
  success: boolean;
  message: string;
}

interface S3StatResult {
  success: boolean;
  lastModified?: string;
  notFound?: boolean;
  error?: string;
}

function createS3Client(config: S3Config): {
  client: S3Client;
  ownsAgent: boolean;
} {
  const endpoint = new URL(config.endpoint);
  const agent = getHttpRequestAgent(endpoint);
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    ...(agent
      ? {
          requestHandler: new NodeHttpHandler(
            endpoint.protocol === "https:"
              ? { httpsAgent: agent }
              : { httpAgent: agent },
          ),
        }
      : {}),
  });
  return { client, ownsAgent: agent === undefined };
}

async function usingS3Client<T>(
  config: S3Config,
  operation: (client: S3Client) => Promise<T>,
): Promise<T> {
  const { client, ownsAgent } = createS3Client(config);
  try {
    return await operation(client);
  } finally {
    // Proxy agents belong to network-proxy and are shared by other requests.
    // Only the SDK's private connections can be destroyed by this operation.
    if (ownsAgent) client.destroy();
  }
}

function normalizeKey(key: string): string {
  return key.replace(/^\/+/, "");
}

function getS3ErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof S3ServiceException) {
    return error.message || fallback;
  }

  if (error instanceof Error) {
    return error.message || fallback;
  }

  return fallback;
}

function isNotFoundError(error: unknown): boolean {
  if (!(error instanceof S3ServiceException)) {
    return false;
  }

  return (
    error.name === "NotFound" ||
    error.name === "NoSuchKey" ||
    error.name === "NoSuchBucket" ||
    error.$metadata?.httpStatusCode === 404
  );
}

export function registerS3IPC(): void {
  registerS3Delete();
  ipcMain.handle(
    IPC_CHANNELS.S3_TEST_CONNECTION,
    async (_event, config: S3Config): Promise<S3ConnectionResult> => {
      try {
        await usingS3Client(config, (client) =>
          client.send(new HeadBucketCommand({ Bucket: config.bucket })),
        );
        return {
          success: true,
          message: "Connection successful",
        };
      } catch (error) {
        return {
          success: false,
          message: `Connection failed: ${getS3ErrorMessage(error, "Unknown S3 error")}`,
        };
      }
    },
  );

  ipcMain.handle(IPC_CHANNELS.S3_UPLOAD, async (_event, key: string, config: S3Config, data: string, condition?: unknown): Promise<RemoteUploadResult> => {
    try { return await createS3TextStorage(config).uploadText(key, data, parseRemoteWriteCondition(condition)); }
    catch { return {success:false,error:"Invalid S3 write condition"}; }
  });
  ipcMain.handle(IPC_CHANNELS.S3_DOWNLOAD, (_event, key: string, config: S3Config) => createS3TextStorage(config).downloadText(key));

  ipcMain.handle(
    IPC_CHANNELS.S3_STAT,
    async (_event, key: string, config: S3Config): Promise<S3StatResult> => {
      try {
        const response = await usingS3Client(config, (client) =>
          client.send(
            new HeadObjectCommand({
              Bucket: config.bucket,
              Key: normalizeKey(key),
            }),
          ),
        );

        return {
          success: true,
          lastModified: response.LastModified?.toISOString(),
        };
      } catch (error) {
        if (isNotFoundError(error)) {
          return { success: false, notFound: true };
        }

        return {
          success: false,
          error: getS3ErrorMessage(error, "Unknown S3 stat error"),
        };
      }
    },
  );
}

function registerS3Delete(): void {
  ipcMain.handle(
    IPC_CHANNELS.S3_DELETE,
    async (_event, key: string, config: S3Config) => {
      try {
        if (
          typeof key !== "string" ||
          !key ||
          !config ||
          [
            config.endpoint,
            config.region,
            config.bucket,
            config.accessKeyId,
            config.secretAccessKey,
          ].some((value) => typeof value !== "string")
        ) {
          return { success: false, error: "Invalid S3 deletion request" };
        }
        return createS3TextStorage(config).deleteText(key);
      } catch (error) {
        if (isNotFoundError(error)) return { success: true };
        return {
          success: false,
          error: getS3ErrorMessage(error, "S3 probe deletion failed"),
        };
      }
    },
  );
}

export function createS3TextStorage(config: S3Config): RemoteTextStorage {
  return {
    async uploadText(key, data, conditionInput): Promise<RemoteUploadResult> {
      try {
        const condition = parseRemoteWriteCondition(conditionInput);
        const response = await usingS3Client(config, (client) =>
          client.send(
            new PutObjectCommand({
              Bucket: config.bucket,
              Key: normalizeKey(key),
              Body: data,
              ContentType: "application/json; charset=utf-8",
              ...(condition && "ifMatch" in condition
                ? { IfMatch: condition.ifMatch }
                : {}),
              ...(condition && "ifNoneMatch" in condition
                ? { IfNoneMatch: condition.ifNoneMatch }
                : {}),
            }),
          ),
        );

        return { success: true, etag: response.ETag };
      } catch (error) {
        return {
          success: false,
          ...(conditionInput !== undefined &&
          error instanceof S3ServiceException &&
          [404, 409, 412].includes(error.$metadata.httpStatusCode ?? 0)
            ? { conflict: true }
            : {}),
          error: getS3ErrorMessage(error, "Unknown S3 upload error"),
        };
      }
    },
    async downloadText(key): Promise<RemoteDownloadResult> {
      try {
        return await usingS3Client(config, async (client) => {
          const response = await client.send(
            new GetObjectCommand({
              Bucket: config.bucket,
              Key: normalizeKey(key),
            }),
          );

          const data = await response.Body?.transformToString();
          if (typeof data !== "string") {
            return {
              success: false,
              error: "S3 object body is empty",
            };
          }

          return { success: true, data, etag: response.ETag };
        });
      } catch (error) {
        if (isNotFoundError(error)) {
          return { success: false, notFound: true };
        }

        return {
          success: false,
          error: getS3ErrorMessage(error, "Unknown S3 download error"),
        };
      }
    },
    async deleteText(key) {
      try {
        await usingS3Client(config, client => client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: normalizeKey(key) })));
        return { success: true };
      } catch (error) {
        if (isNotFoundError(error)) return { success: true };
        return { success: false, error: getS3ErrorMessage(error, "S3 deletion failed") };
      }
    },
  };
}
