import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CloudDesktopApi } from "../../../src/main/ipc/cloud.ipc";

const handleMock = vi.fn();

vi.mock("electron", () => ({
  app: { getPath: () => "/tmp/prompthub-test", getVersion: () => "0.5.9" },
  ipcMain: { handle: handleMock },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString(),
  },
}));

type RegisteredHandler = (...args: unknown[]) => Promise<unknown>;

function getHandlers(): Record<string, RegisteredHandler> {
  return Object.fromEntries(
    handleMock.mock.calls.map(([channel, handler]) => [channel, handler]),
  ) as Record<string, RegisteredHandler>;
}

describe("Cloud IPC", () => {
  beforeEach(() => {
    handleMock.mockReset();
  });

  it("exposes sanitized account and Store operations without a token argument", async () => {
    const client: CloudDesktopApi = {
      getState: vi.fn(async () => ({
        authenticated: true,
        user: { id: "user-1", email: "user@example.com", name: null },
        baseUrl: "https://api.prompthub.cloud",
      })),
      login: vi.fn(async () => ({
        user: { id: "user-1", email: "user@example.com", name: null },
        baseUrl: "https://api.prompthub.cloud",
      })),
      logout: vi.fn(async () => undefined),
      listStoreFeed: vi.fn(async () => ({ listings: [] })),
      getStoreListing: vi.fn(async () => ({
        listing: {
          id: "listing-1",
          sourceType: "skill",
          sourceId: "source-1",
          slug: "demo",
          title: "Demo",
          summary: null,
        },
        metrics: { likeCount: 0, favoriteCount: 0, installCount: 0, downloadCount: 0, viewCount: 0 },
        viewerState: { liked: false, favorited: false },
      })),
      getStorePackage: vi.fn<CloudDesktopApi["getStorePackage"]>(async () => ({
        listing: {
          id: "listing-1",
          sourceType: "skill",
          sourceId: "source-1",
          slug: "demo",
          title: "Demo",
          summary: null,
        },
        updateStatus: "install_available",
        release: {
          id: "release-1",
          packageVersionId: "version-1",
          versionLabel: "1.0.0",
          sourceRevision: null,
          fingerprintAlgorithm: "store-package-sha256-v1",
          contentFingerprint: "hash",
          diff: {
            added: [],
            removed: [],
            modified: [],
            metadataChanged: false,
            compatibilityChanged: false,
            environmentChanged: false,
            permissionsChanged: false,
          },
          publishedAt: null,
        },
        package: {
          schemaVersion: "prompthub-store-package.v1",
          version: "1.0.0",
          metadata: {},
          files: [{ path: "SKILL.md", content: "# Demo" }],
          compatibility: [],
          environment: [],
          permissions: [],
        },
        checks: {
          status: "passed",
          checkerVersion: "store-checks-v1",
          warningCount: 0,
          blockingCount: 0,
        },
      })),
      getAccountOverview: vi.fn(async () => ({ account: { id: "user-1", email: "user@example.com", name: null, avatarUrl: null, status: "active", emailVerified: true, emailVerifiedAt: null, deletionRequest: null, sessionCount: 1, identities: [] }, exportJobs: [], notifications: [], subscription: null })),
      updateProfile: vi.fn(async () => ({ id: "user-1", email: "user@example.com", name: null })),
      changePassword: vi.fn(async () => undefined),
      requestEmailVerification: vi.fn(async () => undefined),
      listSessions: vi.fn(async () => []),
      revokeSession: vi.fn(async () => undefined),
      revokeOtherSessions: vi.fn(async () => 0),
      requestExport: vi.fn(async () => ({ id: "export-1", status: "queued", format: "json", requestedAt: "2026-07-12T00:00:00.000Z", completedAt: null, expiresAt: null, errorCode: null })),
      getExportDownload: vi.fn(async () => ({ downloadUrl: "https://download.example/export", expiresAt: "2026-07-13T00:00:00.000Z" })),
      requestDeletion: vi.fn(async () => ({ id: "delete-1", status: "pending", reason: null, requestedAt: "2026-07-12T00:00:00.000Z", executeAfter: "2026-08-11T00:00:00.000Z", cancelledAt: null, completedAt: null, errorCode: null })),
      cancelDeletion: vi.fn(async () => ({ id: "delete-1", status: "cancelled", reason: null, requestedAt: "2026-07-12T00:00:00.000Z", executeAfter: "2026-08-11T00:00:00.000Z", cancelledAt: "2026-07-12T00:00:00.000Z", completedAt: null, errorCode: null })),
      getEntitlements: vi.fn<CloudDesktopApi["getEntitlements"]>(async () => ({ effectivePlan: "free", source: "free", cloudBackupEnabled: false, maxSyncDevices: 0, maxCloudStorageBytes: 0, officialAiEnabled: false, includedTextTokensMonthly: 0, includedImageGenerationsMonthly: 0, activeSubscription: null, activePlanGrant: null })),
      createInstallIntent: vi.fn(async () => {
        throw new Error("not used");
      }),
      updateInstallStatus: vi.fn(async () => {
        throw new Error("not used");
      }),
      listInstallations: vi.fn(async () => []),
      likeStoreListing: vi.fn(async () => ({ likeCount: 1, favoriteCount: 0, installCount: 0, downloadCount: 0, viewCount: 0 })),
      unlikeStoreListing: vi.fn(async () => ({ likeCount: 0, favoriteCount: 0, installCount: 0, downloadCount: 0, viewCount: 0 })),
      favoriteStoreListing: vi.fn(async () => ({ likeCount: 0, favoriteCount: 1, installCount: 0, downloadCount: 0, viewCount: 0 })),
      unfavoriteStoreListing: vi.fn(async () => ({ likeCount: 0, favoriteCount: 0, installCount: 0, downloadCount: 0, viewCount: 0 })),
      reportStoreListing: vi.fn(async () => undefined),
    };

    const { registerCloudIPC } = await import("../../../src/main/ipc/cloud.ipc");
    const { IPC_CHANNELS } = await import("@prompthub/shared/constants/ipc-channels");
    registerCloudIPC(client);
    const handlers = getHandlers();

    await expect(handlers[IPC_CHANNELS.CLOUD_AUTH_GET_STATE](null)).resolves.toMatchObject({
      authenticated: true,
      user: { email: "user@example.com" },
    });
    await expect(
      handlers[IPC_CHANNELS.CLOUD_AUTH_LOGIN](null, {
        baseUrl: "https://api.prompthub.cloud",
        email: "user@example.com",
        password: "password",
      }),
    ).resolves.toMatchObject({ user: { id: "user-1" } });
    await expect(handlers[IPC_CHANNELS.CLOUD_STORE_FEED](null, { q: "demo" })).resolves.toEqual({ listings: [] });
    expect(client.login).toHaveBeenCalledWith({
      baseUrl: "https://api.prompthub.cloud",
      email: "user@example.com",
      password: "password",
    });
  });

  it("rejects malformed login input at the process boundary", async () => {
    const client = {
      getState: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      listStoreFeed: vi.fn(),
      getStoreListing: vi.fn(),
      getStorePackage: vi.fn(),
      getAccountOverview: vi.fn(),
      updateProfile: vi.fn(),
      changePassword: vi.fn(),
      requestEmailVerification: vi.fn(),
      listSessions: vi.fn(),
      revokeSession: vi.fn(),
      revokeOtherSessions: vi.fn(),
      requestExport: vi.fn(),
      getExportDownload: vi.fn(),
      requestDeletion: vi.fn(),
      cancelDeletion: vi.fn(),
      createInstallIntent: vi.fn(),
      updateInstallStatus: vi.fn(),
      listInstallations: vi.fn(),
    } as unknown as CloudDesktopApi;
    const { registerCloudIPC } = await import("../../../src/main/ipc/cloud.ipc");
    const { IPC_CHANNELS } = await import("@prompthub/shared/constants/ipc-channels");
    registerCloudIPC(client);
    const handlers = getHandlers();

    expect(() =>
      handlers[IPC_CHANNELS.CLOUD_AUTH_LOGIN](null, {
        email: "not-an-email",
        password: "",
      }),
    ).toThrow("cloud:auth:login requires a valid payload");
    expect(client.login).not.toHaveBeenCalled();
  });

  it("rejects unsafe Store report input before invoking the client", async () => {
    const client = {
      getState: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      listStoreFeed: vi.fn(),
      getStoreListing: vi.fn(),
      getStorePackage: vi.fn(),
      getAccountOverview: vi.fn(),
      updateProfile: vi.fn(),
      changePassword: vi.fn(),
      requestEmailVerification: vi.fn(),
      listSessions: vi.fn(),
      revokeSession: vi.fn(),
      revokeOtherSessions: vi.fn(),
      requestExport: vi.fn(),
      getExportDownload: vi.fn(),
      requestDeletion: vi.fn(),
      cancelDeletion: vi.fn(),
      createInstallIntent: vi.fn(),
      updateInstallStatus: vi.fn(),
      listInstallations: vi.fn(),
      likeStoreListing: vi.fn(),
      unlikeStoreListing: vi.fn(),
      favoriteStoreListing: vi.fn(),
      unfavoriteStoreListing: vi.fn(),
      reportStoreListing: vi.fn(),
    } as unknown as CloudDesktopApi;
    const { registerCloudIPC } = await import("../../../src/main/ipc/cloud.ipc");
    const { IPC_CHANNELS } = await import("@prompthub/shared/constants/ipc-channels");
    registerCloudIPC(client);
    const handlers = getHandlers();

    expect(() =>
      handlers[IPC_CHANNELS.CLOUD_STORE_REPORT](null, "listing-1", { reason: "not-a-reason" }),
    ).toThrow("cloud:store:report requires a valid reason");
    expect(client.reportStoreListing).not.toHaveBeenCalled();
  });
});
