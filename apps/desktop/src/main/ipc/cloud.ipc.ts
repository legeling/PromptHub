import { CloudBrowserLogin } from "../services/cloud-browser-login";
import { app, ipcMain, safeStorage, shell } from "electron";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import type {
  CloudStoreReportReason,
  CloudStoreInstallIntentInput,
  CloudStoreInstallStatusInput,
} from "@prompthub/shared/types";
import { CloudApiClient } from "../services/cloud-api";
import { createCloudCredentialStore } from "../services/cloud-auth-storage";

export interface CloudDesktopApi {
  getState: CloudApiClient["getState"];
  login: CloudApiClient["login"];
  completeBrowserLogin: CloudApiClient["completeBrowserLogin"];
  logout: CloudApiClient["logout"];
  getAccountOverview: CloudApiClient["getAccountOverview"];
  updateProfile: CloudApiClient["updateProfile"];
  changePassword: CloudApiClient["changePassword"];
  requestEmailVerification: CloudApiClient["requestEmailVerification"];
  listSessions: CloudApiClient["listSessions"];
  revokeSession: CloudApiClient["revokeSession"];
  revokeOtherSessions: CloudApiClient["revokeOtherSessions"];
  requestExport: CloudApiClient["requestExport"];
  getExportDownload: CloudApiClient["getExportDownload"];
  requestDeletion: CloudApiClient["requestDeletion"];
  cancelDeletion: CloudApiClient["cancelDeletion"];
  getEntitlements: CloudApiClient["getEntitlements"];
  listStoreFeed: CloudApiClient["listStoreFeed"];
  getStoreListing: CloudApiClient["getStoreListing"];
  getStorePackage: CloudApiClient["getStorePackage"];
  createInstallIntent: CloudApiClient["createInstallIntent"];
  updateInstallStatus: CloudApiClient["updateInstallStatus"];
  listInstallations: CloudApiClient["listInstallations"];
  likeStoreListing: CloudApiClient["likeStoreListing"];
  unlikeStoreListing: CloudApiClient["unlikeStoreListing"];
  favoriteStoreListing: CloudApiClient["favoriteStoreListing"];
  unfavoriteStoreListing: CloudApiClient["unfavoriteStoreListing"];
  reportStoreListing: CloudApiClient["reportStoreListing"];
}

function createDefaultCloudApi(): CloudDesktopApi {
  return new CloudApiClient({
    store: createCloudCredentialStore({
      userDataPath: app.getPath("userData"),
      encryption: safeStorage,
    }),
    clientVersion: app.getVersion(),
  });
}

export function registerCloudIPC(client: CloudDesktopApi = createDefaultCloudApi()): void {
  const browserLogin = new CloudBrowserLogin({ openExternal: url => shell.openExternal(url), exchange: input => client.completeBrowserLogin(input) });
  app.once("before-quit", () => browserLogin.cancel());
  ipcMain.handle(IPC_CHANNELS.CLOUD_AUTH_BROWSER_LOGIN, (_event, value: unknown) => browserLogin.start(parseRequiredString(value, "Cloud API URL is required")));
  ipcMain.handle(IPC_CHANNELS.CLOUD_AUTH_BROWSER_CANCEL, () => browserLogin.cancel());
  ipcMain.handle(IPC_CHANNELS.CLOUD_AUTH_GET_STATE, () => client.getState());
  ipcMain.handle(IPC_CHANNELS.CLOUD_AUTH_LOGIN, (_event, input: unknown) =>
    client.login(parseLoginInput(input)),
  );
  ipcMain.handle(IPC_CHANNELS.CLOUD_AUTH_LOGOUT, () => { browserLogin.cancel(); return client.logout(); });
  registerCloudAccountHandlers(client);
  registerCloudStoreHandlers(client);
}

function registerCloudAccountHandlers(client: CloudDesktopApi): void {
  ipcMain.handle(IPC_CHANNELS.CLOUD_ACCOUNT_OVERVIEW, () => client.getAccountOverview());
  ipcMain.handle(IPC_CHANNELS.CLOUD_ACCOUNT_PROFILE, (_event, input: unknown) => client.updateProfile(parseProfileInput(input)));
  ipcMain.handle(IPC_CHANNELS.CLOUD_ACCOUNT_PASSWORD, (_event, input: unknown) => client.changePassword(parsePasswordInput(input)));
  ipcMain.handle(IPC_CHANNELS.CLOUD_ACCOUNT_VERIFY_EMAIL, () => client.requestEmailVerification());
  ipcMain.handle(IPC_CHANNELS.CLOUD_ACCOUNT_SESSIONS, () => client.listSessions());
  ipcMain.handle(IPC_CHANNELS.CLOUD_ACCOUNT_REVOKE_SESSION, (_event, input: unknown) => client.revokeSession(parseRequiredString(input, "cloud:account:revokeSession requires a session id")));
  ipcMain.handle(IPC_CHANNELS.CLOUD_ACCOUNT_REVOKE_OTHERS, () => client.revokeOtherSessions());
  ipcMain.handle(IPC_CHANNELS.CLOUD_ACCOUNT_EXPORT, () => client.requestExport());
  ipcMain.handle(IPC_CHANNELS.CLOUD_ACCOUNT_EXPORT_DOWNLOAD, async (_event, input: unknown) => {
    const result = await client.getExportDownload(parseRequiredString(input, "cloud:account:exportDownload requires a job id"));
    const url = new URL(result.downloadUrl);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
      throw new Error("cloud:account:exportDownload returned an unsafe URL");
    }
    await shell.openExternal(url.toString());
  });
  ipcMain.handle(IPC_CHANNELS.CLOUD_ACCOUNT_DELETE, (_event, input: unknown) => client.requestDeletion(parseOptionalReason(input)));
  ipcMain.handle(IPC_CHANNELS.CLOUD_ACCOUNT_CANCEL_DELETE, () => client.cancelDeletion());
  ipcMain.handle(IPC_CHANNELS.CLOUD_ACCOUNT_ENTITLEMENTS, () => client.getEntitlements());
}

function registerCloudStoreHandlers(client: CloudDesktopApi): void {
  ipcMain.handle(IPC_CHANNELS.CLOUD_STORE_FEED, (_event, input: unknown) =>
    client.listStoreFeed(parseFeedInput(input)),
  );
  ipcMain.handle(IPC_CHANNELS.CLOUD_STORE_LISTING, (_event, slug: unknown) =>
    client.getStoreListing(parseRequiredString(slug, "cloud:store:listing requires a slug")),
  );
  ipcMain.handle(IPC_CHANNELS.CLOUD_STORE_PACKAGE, (_event, input: unknown) =>
    client.getStorePackage(
      parseRequiredRecordString(input, "listingId", "cloud:store:package requires a listingId"),
      parseOptionalRecordString(input, "currentFingerprint"),
    ),
  );
  ipcMain.handle(IPC_CHANNELS.CLOUD_STORE_INSTALL_INTENT, (_event, input: unknown) =>
    client.createInstallIntent(parseInstallIntentInput(input)),
  );
  ipcMain.handle(IPC_CHANNELS.CLOUD_STORE_INSTALL_STATUS, (_event, installId: unknown, input: unknown) =>
    client.updateInstallStatus(
      parseRequiredString(installId, "cloud:store:installStatus requires an install id"),
      parseInstallStatusInput(input),
    ),
  );
  ipcMain.handle(IPC_CHANNELS.CLOUD_STORE_INSTALLATIONS, () => client.listInstallations());
  ipcMain.handle(IPC_CHANNELS.CLOUD_STORE_LIKE, (_event, listingId: unknown) =>
    client.likeStoreListing(parseRequiredString(listingId, "cloud:store:like requires a listing id")),
  );
  ipcMain.handle(IPC_CHANNELS.CLOUD_STORE_UNLIKE, (_event, listingId: unknown) =>
    client.unlikeStoreListing(parseRequiredString(listingId, "cloud:store:unlike requires a listing id")),
  );
  ipcMain.handle(IPC_CHANNELS.CLOUD_STORE_FAVORITE, (_event, listingId: unknown) =>
    client.favoriteStoreListing(parseRequiredString(listingId, "cloud:store:favorite requires a listing id")),
  );
  ipcMain.handle(IPC_CHANNELS.CLOUD_STORE_UNFAVORITE, (_event, listingId: unknown) =>
    client.unfavoriteStoreListing(parseRequiredString(listingId, "cloud:store:unfavorite requires a listing id")),
  );
  ipcMain.handle(IPC_CHANNELS.CLOUD_STORE_REPORT, (_event, listingId: unknown, input: unknown) =>
    client.reportStoreListing(
      parseRequiredString(listingId, "cloud:store:report requires a listing id"),
      parseReportInput(input),
    ),
  );
}

function parseLoginInput(value: unknown) {
  const record = requireRecord(value, "cloud:auth:login requires a valid payload");
  const email = requireRecordString(record, "email", "cloud:auth:login requires a valid payload");
  const password = requireRecordString(record, "password", "cloud:auth:login requires a valid payload");
  const baseUrl = requireRecordString(record, "baseUrl", "cloud:auth:login requires a valid payload");
  if (!email.includes("@") || password.length < 8) {
    throw new Error("cloud:auth:login requires a valid payload");
  }
  return { baseUrl, email, password };
}

function parseFeedInput(value: unknown): { q?: string; limit?: number } {
  if (value === undefined || value === null) return {};
  const record = requireRecord(value, "cloud:store:feed requires an object payload");
  if (record.q !== undefined && typeof record.q !== "string") {
    throw new Error("cloud:store:feed requires a valid query");
  }
  if (
    record.limit !== undefined &&
    (typeof record.limit !== "number" ||
      !Number.isInteger(record.limit) ||
      record.limit < 1 ||
      record.limit > 100)
  ) {
    throw new Error("cloud:store:feed requires a valid limit");
  }
  return {
    ...(typeof record.q === "string" ? { q: record.q } : {}),
    ...(typeof record.limit === "number" ? { limit: record.limit } : {}),
  };
}

function parseProfileInput(value: unknown): { name?: string | null; avatarUrl?: string | null } {
  const record = requireRecord(value, "cloud:account:profile requires an object payload");
  if (record.name !== undefined && record.name !== null && typeof record.name !== "string") {
    throw new Error("cloud:account:profile requires a valid name");
  }
  if (record.avatarUrl !== undefined && record.avatarUrl !== null && typeof record.avatarUrl !== "string") {
    throw new Error("cloud:account:profile requires a valid avatar URL");
  }
  if (record.name === undefined && record.avatarUrl === undefined) {
    throw new Error("cloud:account:profile requires a profile field");
  }
  return {
    ...(record.name === undefined ? {} : { name: record.name as string | null }),
    ...(record.avatarUrl === undefined ? {} : { avatarUrl: record.avatarUrl as string | null }),
  };
}

function parsePasswordInput(value: unknown): { currentPassword: string; newPassword: string; revokeOtherSessions?: boolean } {
  const record = requireRecord(value, "cloud:account:password requires an object payload");
  const currentPassword = requireRecordString(record, "currentPassword", "cloud:account:password requires a valid payload");
  const newPassword = requireRecordString(record, "newPassword", "cloud:account:password requires a valid payload");
  if (currentPassword.length < 8 || newPassword.length < 8) throw new Error("cloud:account:password requires a valid payload");
  if (record.revokeOtherSessions !== undefined && typeof record.revokeOtherSessions !== "boolean") throw new Error("cloud:account:password requires a valid payload");
  return { currentPassword, newPassword, ...(typeof record.revokeOtherSessions === "boolean" ? { revokeOtherSessions: record.revokeOtherSessions } : {}) };
}

function parseOptionalReason(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const record = requireRecord(value, "cloud:account:delete requires an object payload");
  if (record.reason !== undefined && record.reason !== null && typeof record.reason !== "string") throw new Error("cloud:account:delete requires a valid reason");
  return typeof record.reason === "string" ? record.reason : undefined;
}

function parseInstallIntentInput(value: unknown): CloudStoreInstallIntentInput {
  const record = requireRecord(value, "cloud:store:installIntent requires a valid payload");
  const operation = record.operation;
  if (operation !== "install" && operation !== "update") {
    throw new Error("cloud:store:installIntent requires a valid payload");
  }
  return {
    listingId: requireRecordString(record, "listingId", "cloud:store:installIntent requires a valid payload"),
    operation,
    idempotencyKey: requireRecordString(record, "idempotencyKey", "cloud:store:installIntent requires a valid payload"),
    expectedReleaseId: requireRecordString(record, "expectedReleaseId", "cloud:store:installIntent requires a valid payload"),
    expectedFingerprint: requireRecordString(record, "expectedFingerprint", "cloud:store:installIntent requires a valid payload"),
    currentFingerprint: parseOptionalRecordString(value, "currentFingerprint"),
    target: requireRecordString(record, "target", "cloud:store:installIntent requires a valid payload"),
  };
}

function parseInstallStatusInput(value: unknown): CloudStoreInstallStatusInput {
  const record = requireRecord(value, "cloud:store:installStatus requires a valid payload");
  if (record.status !== "started" && record.status !== "succeeded" && record.status !== "failed") {
    throw new Error("cloud:store:installStatus requires a valid payload");
  }
  if (record.failureCode !== undefined && typeof record.failureCode !== "string") {
    throw new Error("cloud:store:installStatus requires a valid payload");
  }
  if (record.failureSummary !== undefined && typeof record.failureSummary !== "string") {
    throw new Error("cloud:store:installStatus requires a valid payload");
  }
  return {
    status: record.status,
    ...(typeof record.failureCode === "string" ? { failureCode: record.failureCode } : {}),
    ...(typeof record.failureSummary === "string" ? { failureSummary: record.failureSummary } : {}),
  };
}

function parseReportInput(value: unknown): { reason: CloudStoreReportReason; details?: string } {
  const record = requireRecord(value, "cloud:store:report requires a valid payload");
  const reason = record.reason;
  if (reason !== "security" && reason !== "copyright" && reason !== "misleading" && reason !== "spam" && reason !== "other") {
    throw new Error("cloud:store:report requires a valid reason");
  }
  if (record.details !== undefined && typeof record.details !== "string") {
    throw new Error("cloud:store:report requires valid details");
  }
  const details = typeof record.details === "string" ? record.details.trim() : "";
  if (details.length > 2000) throw new Error("cloud:store:report details are too long");
  return details ? { reason, details } : { reason };
}

function parseRequiredRecordString(value: unknown, key: string, message: string): string {
  return requireRecordString(requireRecord(value, message), key, message);
}

function parseOptionalRecordString(value: unknown, key: string): string | undefined {
  if (!isRecord(value) || value[key] === undefined) return undefined;
  if (typeof value[key] !== "string") throw new Error(`cloud:store:package ${key} must be a string`);
  return value[key] as string;
}

function parseRequiredString(value: unknown, message: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(message);
  return value.trim();
}

function requireRecordString(record: Record<string, unknown>, key: string, message: string): string {
  return parseRequiredString(record[key], message);
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(message);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
