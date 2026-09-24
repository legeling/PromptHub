import type { CloudCredentialStore } from "../../../src/main/services/cloud-auth-storage";
import { describe, expect, it, vi } from "vitest";
import {
  CloudApiClient,
  CloudApiError,
} from "../../../src/main/services/cloud-api";

function createStore(
  initial: { baseUrl: string; token: string } | null = null,
) {
  let value = initial;
  const store: CloudCredentialStore = {
    read: vi.fn(async () => value),
    write: vi.fn(async (next) => {
      value = next;
    }),
    clear: vi.fn(async () => {
      value = null;
    }),
  };
  return { store, getValue: () => value };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("CloudApiClient", () => {
  it("stores the desktop session but only returns sanitized user state", async () => {
    const { store, getValue } = createStore();
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe(
          "https://api.prompthub.cloud/api/v1/auth/desktop/login",
        );
        expect(init?.headers).toMatchObject({
          "content-type": "application/json",
          "x-prompthub-client-platform": "desktop",
        });
        return jsonResponse({
          user: { id: "user-1", email: "user@example.com", name: "User" },
          accessToken: "secret-session-token",
          expiresAt: "2026-08-01T00:00:00.000Z",
        });
      },
    );
    const client = new CloudApiClient({
      store,
      fetchImpl,
      clientVersion: "0.5.9",
    });

    await expect(
      client.login({
        baseUrl: "https://api.prompthub.cloud",
        email: "user@example.com",
        password: "password",
      }),
    ).resolves.toEqual({
      user: { id: "user-1", email: "user@example.com", name: "User" },
      baseUrl: "https://api.prompthub.cloud",
    });
    expect(getValue()).toEqual({
      baseUrl: "https://api.prompthub.cloud",
      token: "secret-session-token",
    });
  });

  it("uses bearer auth for private requests and keeps public store reads unauthenticated", async () => {
    const { store } = createStore({
      baseUrl: "https://api.prompthub.cloud",
      token: "secret-session-token",
    });
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith("/auth/me")) {
          expect(init?.headers).toMatchObject({
            authorization: "Bearer secret-session-token",
          });
          return jsonResponse({
            user: { id: "user-1", email: "user@example.com" },
          });
        }
        expect(String(input)).toContain("/store/feed");
        expect(init?.headers ?? {}).not.toHaveProperty("authorization");
        return jsonResponse({ listings: [] });
      },
    );
    const client = new CloudApiClient({
      store,
      fetchImpl,
      clientVersion: "0.5.9",
    });

    await expect(client.getState()).resolves.toMatchObject({
      authenticated: true,
      user: { id: "user-1" },
    });
    await expect(client.listStoreFeed()).resolves.toEqual({ listings: [] });
  });

  it("keeps desktop account actions in the main process and parses only safe summaries", async () => {
    const { store } = createStore({
      baseUrl: "https://api.prompthub.cloud",
      token: "secret-session-token",
    });
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(new Headers(init?.headers).get("authorization")).toBe(
          "Bearer secret-session-token",
        );
        const url = String(input);
        if (url.endsWith("/account/overview")) {
          return jsonResponse({
            account: {
              id: "user-1",
              email: "user@example.com",
              name: "User",
              avatarUrl: null,
              status: "active",
              emailVerified: false,
              emailVerifiedAt: null,
              deletionRequest: null,
              sessionCount: 1,
              identities: [{ type: "password", provider: "password" }],
            },
            exportJobs: [],
            notifications: [
              {
                id: "notification-1",
                type: "account.session_started",
                payload: { clientPlatform: "desktop" },
                readAt: null,
                createdAt: "2026-07-12T00:00:00.000Z",
              },
            ],
            subscription: null,
          });
        }
        if (url.endsWith("/auth/sessions")) {
          return jsonResponse({
            sessions: [
              {
                id: "session-1",
                clientPlatform: "desktop",
                clientVersion: "0.5.9",
                createdAt: "2026-07-12T00:00:00.000Z",
                expiresAt: "2026-08-12T00:00:00.000Z",
                lastActiveAt: "2026-07-12T00:00:00.000Z",
                isCurrent: true,
              },
            ],
          });
        }
        if (url.endsWith("/auth/me")) {
          return jsonResponse({
            user: { id: "user-1", email: "user@example.com", name: "Renamed" },
          });
        }
        if (url.endsWith("/account/exports")) {
          return jsonResponse({
            job: {
              id: "export-1",
              status: "queued",
              format: "json",
              requestedAt: "2026-07-12T00:00:00.000Z",
              completedAt: null,
              expiresAt: null,
              errorCode: null,
            },
          });
        }
        return jsonResponse({ success: true, revokedCount: 1 });
      },
    );
    const client = new CloudApiClient({
      store,
      fetchImpl,
      clientVersion: "0.5.9",
    });

    await expect(client.getAccountOverview()).resolves.toMatchObject({
      account: { email: "user@example.com", emailVerified: false },
      notifications: [{ type: "account.session_started" }],
    });
    await expect(client.listSessions()).resolves.toEqual([
      expect.objectContaining({ id: "session-1", isCurrent: true }),
    ]);
    await expect(
      client.updateProfile({ name: "Renamed" }),
    ).resolves.toMatchObject({ name: "Renamed" });
    await expect(client.requestExport()).resolves.toMatchObject({
      id: "export-1",
      status: "queued",
    });
    await expect(client.revokeOtherSessions()).resolves.toBe(1);
  });

  it("normalizes endpoint errors without returning authorization details", async () => {
    const { store } = createStore();
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        {
          code: "invalid_credentials",
          error: "Authorization: Bearer secret-session-token",
        },
        401,
      ),
    );
    const client = new CloudApiClient({
      store,
      fetchImpl,
      clientVersion: "0.5.9",
    });

    await expect(
      client.login({
        baseUrl: "https://api.prompthub.cloud",
        email: "user@example.com",
        password: "password",
      }),
    ).rejects.toMatchObject({
      code: "invalid_credentials",
      status: 401,
    } satisfies Partial<CloudApiError>);
    await expect(
      client.login({
        baseUrl: "https://api.prompthub.cloud",
        email: "user@example.com",
        password: "password",
      }),
    ).rejects.not.toThrow("secret-session-token");
  });

  it("rejects insecure non-local Cloud endpoints", async () => {
    const { store } = createStore();
    const client = new CloudApiClient({
      store,
      fetchImpl: vi.fn(),
      clientVersion: "0.5.9",
    });

    await expect(
      client.login({
        baseUrl: "http://api.prompthub.cloud",
        email: "user@example.com",
        password: "password",
      }),
    ).rejects.toMatchObject({ code: "CLOUD_AUTH_HTTPS_REQUIRED" });
    expect(client).toBeTruthy();
  });

  it("clears an invalid bearer session but retains credentials on network outage", async () => {
    const invalid = createStore({
      baseUrl: "https://api.prompthub.cloud",
      token: "expired-session",
    });
    const invalidClient = new CloudApiClient({
      store: invalid.store,
      fetchImpl: vi.fn(async () =>
        jsonResponse({ code: "session_invalid" }, 401),
      ),
      clientVersion: "0.5.9",
    });

    await expect(invalidClient.getState()).resolves.toMatchObject({
      authenticated: false,
      errorCode: "session_invalid",
    });
    expect(invalid.getValue()).toBeNull();

    const unavailable = createStore({
      baseUrl: "https://api.prompthub.cloud",
      token: "network-session",
    });
    const unavailableClient = new CloudApiClient({
      store: unavailable.store,
      fetchImpl: vi.fn(async () => {
        throw new Error("offline");
      }),
      clientVersion: "0.5.9",
    });

    await expect(unavailableClient.getState()).resolves.toMatchObject({
      authenticated: true,
      unavailable: true,
      baseUrl: "https://api.prompthub.cloud",
    });
    expect(unavailable.getValue()).toEqual({
      baseUrl: "https://api.prompthub.cloud",
      token: "network-session",
    });
  });

  it("keeps Store engagement in the main process and returns only safe public state", async () => {
    const { store } = createStore({
      baseUrl: "https://api.prompthub.cloud",
      token: "secret-session-token",
    });
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        expect(new Headers(init?.headers).get("authorization")).toBe(
          "Bearer secret-session-token",
        );
        if (url.endsWith("/store/listings/example-skill")) {
          return jsonResponse({
            listing: {
              id: "listing-1",
              sourceType: "skill",
              slug: "example-skill",
              title: "Example Skill",
            },
            metrics: {
              likeCount: 3,
              favoriteCount: 2,
              installCount: 8,
              downloadCount: 9,
              viewCount: 20,
            },
            viewerState: { liked: false, favorited: true },
          });
        }
        if (url.endsWith("/like") || url.endsWith("/favorite")) {
          return jsonResponse({
            metrics: {
              likeCount: 4,
              favoriteCount: 2,
              installCount: 8,
              downloadCount: 9,
              viewCount: 20,
            },
          });
        }
        if (url.endsWith("/report")) {
          expect(init?.method).toBe("POST");
          expect(JSON.parse(String(init?.body))).toEqual({
            reason: "security",
            details: "contains an unsafe command",
          });
          return jsonResponse({ report: { id: "report-1" } }, 201);
        }
        throw new Error(`unexpected URL: ${url}`);
      },
    );
    const client = new CloudApiClient({
      store,
      fetchImpl,
      clientVersion: "0.5.9",
    });

    await expect(
      client.getStoreListing("example-skill"),
    ).resolves.toMatchObject({
      listing: { id: "listing-1", slug: "example-skill" },
      metrics: { likeCount: 3, favoriteCount: 2 },
      viewerState: { liked: false, favorited: true },
    });
    await expect(client.likeStoreListing("listing-1")).resolves.toMatchObject({
      likeCount: 4,
    });
    await expect(
      client.unfavoriteStoreListing("listing-1"),
    ).resolves.toMatchObject({ likeCount: 4 });
    await expect(
      client.reportStoreListing("listing-1", {
        reason: "security",
        details: "contains an unsafe command",
      }),
    ).resolves.toBeUndefined();
  });

  it("parses the account entitlement snapshot without exposing billing internals", async () => {
    const { store } = createStore({
      baseUrl: "https://api.prompthub.cloud",
      token: "secret-session-token",
    });
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(new Headers(init?.headers).get("authorization")).toBe(
          "Bearer secret-session-token",
        );
        return jsonResponse({
          userId: "user-1",
          effectivePlan: "pro",
          source: "subscription",
          cloudBackupEnabled: true,
          maxSyncDevices: 3,
          maxCloudStorageBytes: 10_737_418_240,
          officialAiEnabled: true,
          includedTextTokensMonthly: 2_000_000,
          includedImageGenerationsMonthly: 300,
          activeSubscription: {
            id: "subscription-1",
            plan: "pro",
            status: "active",
            stripeCustomerId: "secret-customer",
          },
          activePlanGrant: null,
        });
      },
    );
    const client = new CloudApiClient({
      store,
      fetchImpl,
      clientVersion: "0.5.9",
    });

    await expect(client.getEntitlements()).resolves.toEqual({
      effectivePlan: "pro",
      source: "subscription",
      cloudBackupEnabled: true,
      maxSyncDevices: 3,
      maxCloudStorageBytes: 10_737_418_240,
      officialAiEnabled: true,
      includedTextTokensMonthly: 2_000_000,
      includedImageGenerationsMonthly: 300,
      activeSubscription: { plan: "pro", status: "active" },
      activePlanGrant: null,
    });
  });
});
