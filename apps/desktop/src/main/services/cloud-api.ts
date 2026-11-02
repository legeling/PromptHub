import type { BrowserExchangeInput } from "./cloud-browser-login";
import { PROMPTHUB_CLOUD_API_URL } from "@prompthub/shared/constants/cloud";
import type { CloudCredential, CloudCredentialStore } from "./cloud-auth-storage";
import type {
  CloudAuthState,
  CloudAccountOverview,
  CloudDeletionRequest,
  CloudExportJob,
  CloudEntitlementSnapshot,
  CloudInstallRecord,
  CloudSession,
  CloudStoreDiff,
  CloudStoreChecks,
  CloudStoreListing,
  CloudStoreListingDetails,
  CloudStoreMetrics,
  CloudStorePackage,
  CloudStorePackageFile,
  CloudStorePackageResponse,
  CloudStoreReportReason,
  CloudStoreRelease,
  CloudUser,
} from "@prompthub/shared/types";

export type CloudFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export class CloudApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(sanitizeErrorMessage(message));
  }
}

export class CloudApiClient {
  private readonly fetchImpl: CloudFetch;
  private readonly clientVersion: string;

  constructor(options: {
    store: CloudCredentialStore;
    fetchImpl?: CloudFetch;
    clientVersion: string;
  }) {
    this.store = options.store;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.clientVersion = options.clientVersion;
  }

  private readonly store: CloudCredentialStore;

  async login(input: {
    baseUrl: string;
    email: string;
    password: string;
  }): Promise<{ user: CloudUser; baseUrl: string }> {
    const baseUrl = normalizeCloudBaseUrl(input.baseUrl);
    const payload = await this.requestJson<{ user: unknown; accessToken: unknown }>(
      baseUrl,
      "/api/v1/auth/desktop/login",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-prompthub-client-platform": "desktop",
          "x-prompthub-client-version": this.clientVersion,
        },
        body: JSON.stringify({ email: input.email.trim(), password: input.password }),
      },
    );
    const user = parseCloudUser(payload.user);
    if (typeof payload.accessToken !== "string" || !payload.accessToken.trim()) {
      throw new CloudApiError("Cloud login did not return a session", "cloud_auth_contract_invalid", 502);
    }
    await this.store.write({ baseUrl, token: payload.accessToken });
    return { user, baseUrl };
  }

  async completeBrowserLogin(input: BrowserExchangeInput): Promise<{ user: CloudUser; baseUrl: string }> {
    const baseUrl = normalizeCloudBaseUrl(input.baseUrl);
    const payload = await this.requestJson<{ user: unknown; accessToken: unknown }>(baseUrl, "/api/v1/auth/desktop/exchange", {
      method: "POST",
      headers: { "content-type": "application/json", "x-prompthub-client-version": this.clientVersion },
      body: JSON.stringify({ ticket: input.ticket, codeVerifier: input.codeVerifier }),
      signal: input.signal,
    });
    input.signal.throwIfAborted();
    const user = parseCloudUser(payload.user);
    if (typeof payload.accessToken !== "string" || !payload.accessToken.trim()) {
      throw new CloudApiError("Cloud login did not return a session", "cloud_auth_contract_invalid", 502);
    }
    await this.store.write({ baseUrl, token: payload.accessToken });
    return { user, baseUrl };
  }

  async getState(): Promise<CloudAuthState> {
    const credential = await this.store.read();
    if (!credential) {
      return { authenticated: false, user: null, baseUrl: null };
    }
    try {
      const payload = await this.requestJson<{ user: unknown }>(
        credential.baseUrl,
        "/api/v1/auth/me",
        { headers: { authorization: `Bearer ${credential.token}` } },
      );
      return {
        authenticated: true,
        user: parseCloudUser(payload.user),
        baseUrl: credential.baseUrl,
      };
    } catch (error) {
      if (error instanceof CloudApiError && [401, 403].includes(error.status)) {
        await this.store.clear();
        return { authenticated: false, user: null, baseUrl: null, errorCode: error.code };
      }
      return {
        authenticated: true,
        unavailable: true,
        user: null,
        baseUrl: credential.baseUrl,
        errorCode: error instanceof CloudApiError ? error.code : "cloud_network_unavailable",
      };
    }
  }

  async logout(): Promise<void> {
    const credential = await this.store.read();
    try {
      if (credential) {
        await this.requestJson(credential.baseUrl, "/api/v1/auth/logout", {
          method: "POST",
          headers: { authorization: `Bearer ${credential.token}` },
        });
      }
    } finally {
      await this.store.clear();
    }
  }

  async getAccountOverview(): Promise<CloudAccountOverview> {
    const payload = await this.requestAuthenticatedJson<{ account: unknown; exportJobs: unknown; notifications: unknown; subscription: unknown }>("/api/v1/account/overview");
    return parseCloudAccountOverview(payload);
  }

  async getEntitlements(): Promise<CloudEntitlementSnapshot> {
    const payload = await this.requestAuthenticatedJson<Record<string, unknown>>("/api/v1/entitlements/me");
    return parseCloudEntitlements(payload);
  }

  async updateProfile(input: { name?: string | null; avatarUrl?: string | null }): Promise<CloudUser> {
    const payload = await this.requestAuthenticatedJson<{ user: unknown }>("/api/v1/auth/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    return parseCloudUser(payload.user);
  }

  async changePassword(input: { currentPassword: string; newPassword: string; revokeOtherSessions?: boolean }): Promise<void> {
    await this.requestAuthenticatedJson("/api/v1/auth/password/change", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
  }

  async requestEmailVerification(): Promise<void> {
    await this.requestAuthenticatedJson("/api/v1/auth/email/verify/request", { method: "POST" });
  }

  async listSessions(): Promise<CloudSession[]> {
    const payload = await this.requestAuthenticatedJson<{ sessions: unknown }>("/api/v1/auth/sessions");
    return Array.isArray(payload.sessions) ? payload.sessions.map(parseCloudSession) : [];
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.requestAuthenticatedJson(`/api/v1/auth/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
  }

  async revokeOtherSessions(): Promise<number> {
    const payload = await this.requestAuthenticatedJson<{ revokedCount?: unknown }>("/api/v1/auth/sessions/revoke-others", { method: "POST" });
    return typeof payload.revokedCount === "number" ? payload.revokedCount : 0;
  }

  async requestExport(): Promise<CloudExportJob> {
    const payload = await this.requestAuthenticatedJson<{ job: unknown }>("/api/v1/account/exports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    return parseCloudExportJob(payload.job);
  }

  async getExportDownload(jobId: string): Promise<{ downloadUrl: string; expiresAt: string }> {
    const payload = await this.requestAuthenticatedJson<{ downloadUrl: unknown; expiresAt: unknown }>(`/api/v1/account/exports/${encodeURIComponent(jobId)}/download`);
    if (typeof payload.downloadUrl !== "string" || typeof payload.expiresAt !== "string") {
      throw new CloudApiError("Cloud returned an invalid export link", "cloud_account_contract_invalid", 502);
    }
    return { downloadUrl: payload.downloadUrl, expiresAt: payload.expiresAt };
  }

  async requestDeletion(reason?: string): Promise<CloudDeletionRequest> {
    const payload = await this.requestAuthenticatedJson<{ request: unknown }>("/api/v1/account/deletion-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: reason?.trim() || null }),
    });
    return parseCloudDeletionRequest(payload.request);
  }

  async cancelDeletion(): Promise<CloudDeletionRequest> {
    const payload = await this.requestAuthenticatedJson<{ request: unknown }>("/api/v1/account/deletion-requests/current", { method: "DELETE" });
    return parseCloudDeletionRequest(payload.request);
  }

  async listStoreFeed(query: { q?: string; limit?: number } = {}) {
    const credential = await this.store.read();
    const baseUrl = credential?.baseUrl ?? PROMPTHUB_CLOUD_API_URL;
    const params = new URLSearchParams({ sourceType: "skill" });
    if (query.q?.trim()) params.set("q", query.q.trim());
    if (query.limit) params.set("limit", String(query.limit));
    const payload = await this.requestJson<{ listings: unknown }>(
      baseUrl,
      `/api/v1/store/feed?${params.toString()}`,
    );
    return {
      listings: Array.isArray(payload.listings)
        ? payload.listings.map(parseCloudStoreListing)
        : [],
    };
  }

  async getStoreListing(slug: string): Promise<CloudStoreListingDetails> {
    const credential = await this.store.read();
    const baseUrl = credential?.baseUrl ?? PROMPTHUB_CLOUD_API_URL;
    const payload = await this.requestJson<{ listing: unknown; metrics: unknown; viewerState: unknown }>(
      baseUrl,
      `/api/v1/store/listings/${encodeURIComponent(slug)}`,
      credential
        ? { headers: { authorization: `Bearer ${credential.token}` } }
        : {},
    );
    return {
      listing: parseCloudStoreListing(payload.listing),
      metrics: parseCloudStoreMetrics(payload.metrics),
      viewerState: parseCloudStoreViewerState(payload.viewerState),
    };
  }

  async likeStoreListing(listingId: string): Promise<CloudStoreMetrics> {
    return this.updateStoreInteraction(listingId, "like", "POST");
  }

  async unlikeStoreListing(listingId: string): Promise<CloudStoreMetrics> {
    return this.updateStoreInteraction(listingId, "like", "DELETE");
  }

  async favoriteStoreListing(listingId: string): Promise<CloudStoreMetrics> {
    return this.updateStoreInteraction(listingId, "favorite", "POST");
  }

  async unfavoriteStoreListing(listingId: string): Promise<CloudStoreMetrics> {
    return this.updateStoreInteraction(listingId, "favorite", "DELETE");
  }

  async reportStoreListing(
    listingId: string,
    input: { reason: CloudStoreReportReason; details?: string },
  ): Promise<void> {
    const credential = await this.requireCredential();
    await this.requestJson(credential.baseUrl, `/api/v1/store/listings/${encodeURIComponent(listingId)}/report`, {
      method: "POST",
      headers: { authorization: `Bearer ${credential.token}`, "content-type": "application/json" },
      body: JSON.stringify({ reason: input.reason, details: input.details?.trim() || undefined }),
    });
  }

  private async updateStoreInteraction(
    listingId: string,
    interaction: "like" | "favorite",
    method: "POST" | "DELETE",
  ): Promise<CloudStoreMetrics> {
    const credential = await this.requireCredential();
    const payload = await this.requestJson<{ metrics: unknown }>(
      credential.baseUrl,
      `/api/v1/store/listings/${encodeURIComponent(listingId)}/${interaction}`,
      { method, headers: { authorization: `Bearer ${credential.token}` } },
    );
    return parseCloudStoreMetrics(payload.metrics);
  }

  async getStorePackage(listingId: string, currentFingerprint?: string) {
    const credential = await this.store.read();
    const baseUrl = credential?.baseUrl ?? PROMPTHUB_CLOUD_API_URL;
    const query = currentFingerprint
      ? `?currentFingerprint=${encodeURIComponent(currentFingerprint)}`
      : "";
    const payload = await this.requestJson<unknown>(
      baseUrl,
      `/api/v1/store/listings/${encodeURIComponent(listingId)}/package${query}`,
    );
    return parseCloudStorePackageResponse(payload);
  }

  async createInstallIntent(input: {
    listingId: string;
    operation: "install" | "update";
    idempotencyKey: string;
    expectedReleaseId: string;
    expectedFingerprint: string;
    currentFingerprint?: string;
    target: string;
  }) {
    const credential = await this.requireCredential();
    return this.requestJson<{
      install: CloudInstallRecord;
      listing: CloudStoreListing;
      release: CloudStoreRelease;
      package: CloudStorePackage;
    }>(credential.baseUrl, `/api/v1/store/listings/${encodeURIComponent(input.listingId)}/install-intents`, {
      method: "POST",
      headers: { authorization: `Bearer ${credential.token}`, "content-type": "application/json" },
      body: JSON.stringify({
        operation: input.operation,
        idempotencyKey: input.idempotencyKey,
        expectedReleaseId: input.expectedReleaseId,
        expectedFingerprint: input.expectedFingerprint,
        currentFingerprint: input.currentFingerprint,
        clientPlatform: "desktop",
        clientVersion: this.clientVersion,
        target: input.target,
      }),
    }).then((payload) => ({
      ...payload,
      install: parseCloudInstallRecord(payload.install),
      listing: parseCloudStoreListing(payload.listing),
      release: parseCloudStoreRelease(payload.release),
      package: parseCloudStorePackage(payload.package),
    }));
  }

  async updateInstallStatus(installId: string, input: {
    status: "started" | "succeeded" | "failed";
    failureCode?: string;
    failureSummary?: string;
  }) {
    const credential = await this.requireCredential();
    const payload = await this.requestJson<{ install: unknown }>(
      credential.baseUrl,
      `/api/v1/store/install-intents/${encodeURIComponent(installId)}/status`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${credential.token}`, "content-type": "application/json" },
        body: JSON.stringify(input),
      },
    );
    return parseCloudInstallRecord(payload.install);
  }

  async listInstallations() {
    const credential = await this.requireCredential();
    const payload = await this.requestJson<{ installations: unknown }>(
      credential.baseUrl,
      "/api/v1/store/installations",
      { headers: { authorization: `Bearer ${credential.token}` } },
    );
    return Array.isArray(payload.installations)
      ? payload.installations.map(parseCloudInstallRecord)
      : [];
  }

  private async requireCredential(): Promise<CloudCredential> {
    const credential = await this.store.read();
    if (!credential) {
      throw new CloudApiError("Cloud login required", "cloud_auth_required", 401);
    }
    return credential;
  }

  private async requestAuthenticatedJson<T>(endpoint: string, init: RequestInit = {}): Promise<T> {
    const credential = await this.requireCredential();
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${credential.token}`);
    return this.requestJson<T>(credential.baseUrl, endpoint, { ...init, headers });
  }

  private async requestJson<T>(baseUrl: string, endpoint: string, init: RequestInit = {}): Promise<T> {
    const url = `${normalizeCloudBaseUrl(baseUrl)}${endpoint}`;
    let response: Response;
    try {
      response = await this.fetchImpl(url, init);
    } catch {
      throw new CloudApiError("Unable to reach PromptHub Cloud", "cloud_network_unavailable", 503);
    }
    const text = await response.text();
    const payload = parseJson(text);
    if (!response.ok) {
      const record = isRecord(payload) ? payload : {};
      throw new CloudApiError(
        typeof record.error === "string" ? record.error : `Cloud request failed (${response.status})`,
        typeof record.code === "string" ? record.code : "cloud_request_failed",
        response.status,
      );
    }
    if (payload === null || payload === undefined) return {} as T;
    return payload as T;
  }
}

export function normalizeCloudBaseUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new CloudApiError("Invalid Cloud URL", "cloud_auth_url_invalid", 400);
  }
  const isLocalHttp =
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !isLocalHttp) {
    throw new CloudApiError("Cloud URL must use HTTPS", "CLOUD_AUTH_HTTPS_REQUIRED", 400);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new CloudApiError("Cloud URL cannot contain credentials or query data", "cloud_auth_url_invalid", 400);
  }
  return url.toString().replace(/\/$/, "");
}

function parseCloudUser(value: unknown): CloudUser {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.email !== "string") {
    throw new CloudApiError("Cloud returned an invalid user", "cloud_auth_contract_invalid", 502);
  }
  return {
    id: value.id,
    email: value.email,
    name: typeof value.name === "string" ? value.name : null,
    ...(typeof value.avatarUrl === "string"
      ? { avatarUrl: value.avatarUrl }
      : value.avatarUrl === null
        ? { avatarUrl: null }
        : {}),
    ...(typeof value.accountStatus === "string"
      ? { accountStatus: value.accountStatus }
      : {}),
    ...(typeof value.isDisabled === "boolean"
      ? { isDisabled: value.isDisabled }
      : {}),
  };
}

function parseCloudAccountOverview(value: unknown): CloudAccountOverview {
  if (!isRecord(value) || !isRecord(value.account)) {
    throw new CloudApiError("Cloud returned an invalid account overview", "cloud_account_contract_invalid", 502);
  }
  const account = value.account;
  if (typeof account.id !== "string" || typeof account.email !== "string") {
    throw new CloudApiError("Cloud returned an invalid account overview", "cloud_account_contract_invalid", 502);
  }
  return {
    account: {
      id: account.id,
      email: account.email,
      name: typeof account.name === "string" ? account.name : null,
      avatarUrl: typeof account.avatarUrl === "string" ? account.avatarUrl : null,
      status: typeof account.status === "string" ? account.status : "unknown",
      emailVerified: account.emailVerified === true,
      emailVerifiedAt: typeof account.emailVerifiedAt === "string" ? account.emailVerifiedAt : null,
      deletionRequest: account.deletionRequest ? parseCloudDeletionRequest(account.deletionRequest) : null,
      sessionCount: parseNonNegativeInteger(account.sessionCount),
      identities: Array.isArray(account.identities) ? account.identities.filter(isRecord).map(parseCloudIdentity) : [],
    },
    exportJobs: Array.isArray(value.exportJobs) ? value.exportJobs.map(parseCloudExportJob) : [],
    notifications: Array.isArray(value.notifications) ? value.notifications.map(parseCloudNotification) : [],
    subscription: value.subscription === null || value.subscription === undefined
      ? null
      : isRecord(value.subscription) ? value.subscription : null,
  };
}

function parseCloudEntitlements(value: Record<string, unknown>): CloudEntitlementSnapshot {
  const effectivePlan = parseEnum(value.effectivePlan, ["free", "pro", "team"], "cloud_account_contract_invalid");
  const source = parseEnum(value.source, ["free", "subscription", "plan_grant"], "cloud_account_contract_invalid");
  return {
    effectivePlan,
    source,
    cloudBackupEnabled: value.cloudBackupEnabled === true,
    maxSyncDevices: parseNonNegativeInteger(value.maxSyncDevices),
    maxCloudStorageBytes: parseNonNegativeInteger(value.maxCloudStorageBytes),
    officialAiEnabled: value.officialAiEnabled === true,
    includedTextTokensMonthly: parseNonNegativeInteger(value.includedTextTokensMonthly),
    includedImageGenerationsMonthly: parseNonNegativeInteger(value.includedImageGenerationsMonthly),
    activeSubscription: parseEntitlementSubscription(value.activeSubscription),
    activePlanGrant: parseEntitlementGrant(value.activePlanGrant),
  };
}

function parseEntitlementSubscription(value: unknown): CloudEntitlementSnapshot["activeSubscription"] {
  if (!isRecord(value)) return null;
  const plan = parseOptionalEnum(value.plan, ["pro", "team"]);
  if (!plan) return null;
  return { plan, status: typeof value.status === "string" ? value.status : "unknown" };
}

function parseEntitlementGrant(value: unknown): CloudEntitlementSnapshot["activePlanGrant"] {
  if (!isRecord(value)) return null;
  const plan = parseOptionalEnum(value.plan, ["pro", "team"]);
  if (!plan) return null;
  return { plan, expiresAt: typeof value.expiresAt === "string" ? value.expiresAt : null };
}

function parseCloudIdentity(value: Record<string, unknown>) {
  return {
    type: typeof value.type === "string" ? value.type : "unknown",
    provider: typeof value.provider === "string" ? value.provider : "unknown",
    ...(typeof value.linkedAt === "string" ? { linkedAt: value.linkedAt } : {}),
  };
}

function parseCloudSession(value: unknown): CloudSession {
  if (!isRecord(value) || typeof value.id !== "string") {
    throw new CloudApiError("Cloud returned an invalid session", "cloud_account_contract_invalid", 502);
  }
  return {
    id: value.id,
    clientPlatform: typeof value.clientPlatform === "string" ? value.clientPlatform : "unknown",
    clientVersion: typeof value.clientVersion === "string" ? value.clientVersion : null,
    createdAt: requireDateString(value.createdAt, "session.createdAt"),
    expiresAt: requireDateString(value.expiresAt, "session.expiresAt"),
    lastActiveAt: requireDateString(value.lastActiveAt, "session.lastActiveAt"),
    isCurrent: value.isCurrent === true,
  };
}

function parseCloudNotification(value: unknown) {
  if (!isRecord(value) || typeof value.id !== "string") {
    throw new CloudApiError("Cloud returned an invalid notification", "cloud_account_contract_invalid", 502);
  }
  return {
    id: value.id,
    type: typeof value.type === "string" ? value.type : "unknown",
    payload: parseScalarRecord(value.payload),
    readAt: typeof value.readAt === "string" ? value.readAt : null,
    createdAt: requireDateString(value.createdAt, "notification.createdAt"),
  };
}

function parseCloudExportJob(value: unknown): CloudExportJob {
  if (!isRecord(value) || typeof value.id !== "string") {
    throw new CloudApiError("Cloud returned an invalid export job", "cloud_account_contract_invalid", 502);
  }
  return {
    id: value.id,
    status: typeof value.status === "string" ? value.status : "unknown",
    format: typeof value.format === "string" ? value.format : "json",
    requestedAt: requireDateString(value.requestedAt, "export.requestedAt"),
    completedAt: typeof value.completedAt === "string" ? value.completedAt : null,
    expiresAt: typeof value.expiresAt === "string" ? value.expiresAt : null,
    errorCode: typeof value.errorCode === "string" ? value.errorCode : null,
  };
}

function parseCloudDeletionRequest(value: unknown): CloudDeletionRequest {
  if (!isRecord(value) || typeof value.id !== "string") {
    throw new CloudApiError("Cloud returned an invalid deletion request", "cloud_account_contract_invalid", 502);
  }
  return {
    id: value.id,
    status: typeof value.status === "string" ? value.status : "unknown",
    reason: typeof value.reason === "string" ? value.reason : null,
    requestedAt: requireDateString(value.requestedAt, "deletion.requestedAt"),
    executeAfter: requireDateString(value.executeAfter, "deletion.executeAfter"),
    cancelledAt: typeof value.cancelledAt === "string" ? value.cancelledAt : null,
    completedAt: typeof value.completedAt === "string" ? value.completedAt : null,
    errorCode: typeof value.errorCode === "string" ? value.errorCode : null,
  };
}

function parseScalarRecord(value: unknown): Record<string, string | number | boolean | null> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item === null || ["string", "number", "boolean"].includes(typeof item)),
  ) as Record<string, string | number | boolean | null>;
}

function requireDateString(value: unknown, field: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new CloudApiError(`Cloud returned an invalid account timestamp for ${field}`, "cloud_account_contract_invalid", 502);
  }
  return value;
}

function parseCloudStoreListing(value: unknown): CloudStoreListing {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.slug !== "string" || typeof value.title !== "string") {
    throw new CloudApiError("Cloud returned an invalid Store listing", "cloud_store_contract_invalid", 502);
  }
  return {
    id: value.id,
    sourceType: typeof value.sourceType === "string" ? value.sourceType : "skill",
    sourceId: typeof value.sourceId === "string" ? value.sourceId : value.id,
    slug: value.slug,
    title: value.title,
    summary: typeof value.summary === "string" ? value.summary : null,
    tags: Array.isArray(value.tags) ? value.tags.filter((tag): tag is string => typeof tag === "string") : [],
    coverImageUrl: typeof value.coverImageUrl === "string" ? value.coverImageUrl : null,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : undefined,
    publishedAt: typeof value.publishedAt === "string" ? value.publishedAt : undefined,
  };
}

function parseCloudStoreMetrics(value: unknown): CloudStoreMetrics {
  if (!isRecord(value)) {
    throw new CloudApiError("Cloud returned invalid Store metrics", "cloud_store_contract_invalid", 502);
  }
  return {
    likeCount: parseNonNegativeInteger(value.likeCount),
    favoriteCount: parseNonNegativeInteger(value.favoriteCount),
    installCount: parseNonNegativeInteger(value.installCount),
    downloadCount: parseNonNegativeInteger(value.downloadCount),
    viewCount: parseNonNegativeInteger(value.viewCount),
  };
}

function parseCloudStoreViewerState(value: unknown) {
  if (!isRecord(value)) {
    throw new CloudApiError("Cloud returned invalid Store viewer state", "cloud_store_contract_invalid", 502);
  }
  return { liked: value.liked === true, favorited: value.favorited === true };
}

function parseCloudStorePackageResponse(value: unknown): CloudStorePackageResponse {
  if (!isRecord(value)) throw new CloudApiError("Cloud returned an invalid package response", "cloud_store_contract_invalid", 502);
  return {
    listing: parseCloudStoreListing(value.listing),
    updateStatus: parseEnum(value.updateStatus, ["install_available", "update_available", "up_to_date"], "cloud_store_contract_invalid"),
    release: parseCloudStoreRelease(value.release),
    package: parseCloudStorePackage(value.package),
    checks: parseCloudStoreChecks(value.checks ?? { status: "not_available", warningCount: 0, blockingCount: 0 }),
  };
}

function parseCloudStoreChecks(value: unknown): CloudStoreChecks {
  if (!isRecord(value)) {
    throw new CloudApiError("Cloud returned an invalid Store check summary", "cloud_store_contract_invalid", 502);
  }
  return {
    status: parseEnum(value.status, ["running", "passed", "blocked", "failed", "not_available"], "cloud_store_contract_invalid"),
    checkerVersion: typeof value.checkerVersion === "string" ? value.checkerVersion : null,
    warningCount: parseNonNegativeInteger(value.warningCount),
    blockingCount: parseNonNegativeInteger(value.blockingCount),
  };
}

function parseCloudStorePackage(value: unknown): CloudStorePackage {
  if (!isRecord(value) || typeof value.schemaVersion !== "string" || !Array.isArray(value.files)) {
    throw new CloudApiError("Cloud returned an invalid package", "cloud_store_contract_invalid", 502);
  }
  return {
    schemaVersion: value.schemaVersion,
    version: typeof value.version === "string" ? value.version : null,
    metadata: isRecord(value.metadata) ? value.metadata : {},
    files: value.files.map(parseCloudStorePackageFile),
    compatibility: parseStringArray(value.compatibility),
    environment: parseStringArray(value.environment),
    permissions: parseStringArray(value.permissions),
  };
}

function parseCloudStorePackageFile(value: unknown): CloudStorePackageFile {
  if (!isRecord(value) || typeof value.path !== "string" || typeof value.content !== "string" || !isSafeRelativePath(value.path)) {
    throw new CloudApiError("Cloud returned an unsafe package path", "cloud_store_package_invalid", 502);
  }
  return { path: value.path, content: value.content };
}

function parseCloudStoreRelease(value: unknown): CloudStoreRelease {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.contentFingerprint !== "string") {
    throw new CloudApiError("Cloud returned an invalid Store release", "cloud_store_contract_invalid", 502);
  }
  return {
    id: value.id,
    packageVersionId: typeof value.packageVersionId === "string" ? value.packageVersionId : "",
    versionLabel: typeof value.versionLabel === "string" ? value.versionLabel : null,
    sourceRevision: typeof value.sourceRevision === "string" ? value.sourceRevision : null,
    fingerprintAlgorithm: typeof value.fingerprintAlgorithm === "string" ? value.fingerprintAlgorithm : "",
    contentFingerprint: value.contentFingerprint,
    diff: parseCloudStoreDiff(value.diff),
    publishedAt: typeof value.publishedAt === "string" ? value.publishedAt : null,
  };
}

function parseCloudStoreDiff(value: unknown): CloudStoreDiff {
  const record = isRecord(value) ? value : {};
  return {
    added: parseStringArray(record.added),
    removed: parseStringArray(record.removed),
    modified: parseStringArray(record.modified),
    metadataChanged: record.metadataChanged === true,
    compatibilityChanged: record.compatibilityChanged === true,
    environmentChanged: record.environmentChanged === true,
    permissionsChanged: record.permissionsChanged === true,
  };
}

function parseCloudInstallRecord(value: unknown): CloudInstallRecord {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.listingId !== "string") {
    throw new CloudApiError("Cloud returned an invalid install record", "cloud_store_contract_invalid", 502);
  }
  return value as unknown as CloudInstallRecord;
}

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function parseNonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

function parseEnum<T extends string>(value: unknown, values: readonly T[], code: string): T {
  if (typeof value === "string" && values.includes(value as T)) return value as T;
  throw new CloudApiError("Cloud returned an invalid enum value", code, 502);
}

function parseOptionalEnum<T extends string>(value: unknown, values: readonly T[]): T | null {
  return typeof value === "string" && values.includes(value as T) ? (value as T) : null;
}

function isSafeRelativePath(value: string): boolean {
  return Boolean(value.trim()) && !value.includes("\\") && !value.includes("\0") && !value.startsWith("/") && !value.split("/").some((part) => !part || part === "." || part === "..");
}

function parseJson(value: string): unknown {
  if (!value.trim()) return {};
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeErrorMessage(value: string): string {
  return value
    .replace(/Bearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
    .replace(/(password|token|secret|authorization)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .slice(0, 300);
}
