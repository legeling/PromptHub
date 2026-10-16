import crypto from "node:crypto";
import type { DatabaseAdapter } from "@prompthub/db";
import type {
  DesktopCausalSyncRequest,
  DesktopCausalSyncResult,
} from "@prompthub/shared/types/causal-sync";
import type { CoreSettingsStore } from "@prompthub/core/settings-store";
import { createDesktopSyncWorkspace } from "@prompthub/core/causal-sync/desktop-workspace";
import { runCausalSync } from "@prompthub/core/causal-sync/workflow";
import { encryptedSyncStorage } from "@prompthub/core/causal-sync/encrypted-storage";
import { createS3TextStorage } from "../s3";
import { createWebDAVTextStorage, ensureWebDAVDirectory } from "../webdav";

const SYNC_DIRECTORY = "prompthub-sync";
const HEAD_FILENAME = "head.json";

function text(
  settings: Record<string, unknown>,
  key: string,
  empty = false,
): string {
  const value = settings[key];
  if (typeof value !== "string" || (!empty && !value.trim()))
    throw new Error(`Missing sync configuration: ${key}`);
  return value;
}
function endpoint(value: string): string {
  const url = new URL(value);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("Invalid sync endpoint");
  return url.toString().replace(/\/+$/u, "");
}
function transport(
  provider: DesktopCausalSyncRequest["provider"],
  settings: Record<string, unknown>,
) {
  if (provider === "webdav") {
    const config = {
      url: endpoint(text(settings, "webdavUrl")),
      username: text(settings, "webdavUsername", true),
      password: text(settings, "webdavPassword", true),
    };
    const directory = `${config.url}/${SYNC_DIRECTORY}`,
      headPath = `${directory}/${HEAD_FILENAME}`;
    return {
      store: createWebDAVTextStorage(config),
      headPath,
      identity: [provider, config.url, config.username],
      prepare: async () => {
        for (const url of [
          directory,
          `${headPath}.objects`,
          `${headPath}.generations`,
        ])
          await ensureWebDAVDirectory(config, url);
      },
    };
  }
  const config = {
    endpoint: endpoint(text(settings, "s3Endpoint")),
    region: text(settings, "s3Region"),
    bucket: text(settings, "s3Bucket"),
    accessKeyId: text(settings, "s3AccessKeyId"),
    secretAccessKey: text(settings, "s3SecretAccessKey"),
  };
  const prefix =
    typeof settings.s3BackupPrefix === "string"
      ? settings.s3BackupPrefix.trim().replace(/^\/+|\/+$/gu, "")
      : "";
  const headPath = [prefix, SYNC_DIRECTORY, HEAD_FILENAME]
    .filter(Boolean)
    .join("/");
  return {
    store: createS3TextStorage(config),
    headPath,
    identity: [provider, config.endpoint, config.bucket, prefix],
    prepare: async () => {},
  };
}

export interface DesktopCausalSyncContext {
  database: DatabaseAdapter.Database;
  rootPath: string;
  settings: CoreSettingsStore;
}

/** One in-flight invocation owns each persisted target operation. */
export class DesktopCausalSyncService {
  private readonly running = new Map<
    string,
    Promise<DesktopCausalSyncResult>
  >();
  run(
    request: DesktopCausalSyncRequest,
    context: DesktopCausalSyncContext,
  ): Promise<DesktopCausalSyncResult> {
    const settings = context.settings.read(),
      remote = transport(request.provider, settings);
    const targetId = crypto
      .createHash("sha256")
      .update(JSON.stringify(remote.identity))
      .digest("hex");
    const key = `${context.rootPath}:${targetId}`,
      existing = this.running.get(key);
    if (existing) return existing;
    const result = this.execute(
      request,
      context,
      settings,
      remote,
      targetId,
    ).finally(() => this.running.delete(key));
    this.running.set(key, result);
    return result;
  }
  private async execute(
    request: DesktopCausalSyncRequest,
    context: DesktopCausalSyncContext,
    settings: Record<string, unknown>,
    remote: ReturnType<typeof transport>,
    targetId: string,
  ): Promise<DesktopCausalSyncResult> {
    await remote.prepare();
    const encrypted = settings[`${request.provider}EncryptionEnabled`] === true;
    const store = encrypted
      ? encryptedSyncStorage(
          remote.store,
          text(settings, `${request.provider}EncryptionPassword`),
        )
      : remote.store;
    const result = await runCausalSync({
      database: context.database,
      rootPath: context.rootPath,
      targetId,
      headPath: remote.headPath,
      store,
      workspace: createDesktopSyncWorkspace(
        context.database,
        context.rootPath,
        context.settings,
      ),
      resolution: request.resolution,
    });
    if (result.status === "unsupported")
      return { status: "unsupported", reason: result.capability.reason };
    if (result.status === "conflict" && !("conflicts" in result))
      return { status: "remote-changed" };
    if (result.status === "uncertain") return { status: "uncertain" };
    return result;
  }
}
