import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { AgentUsageQuota } from "@prompthub/shared/types";
import type { AntigravityLocalUsageResult } from "../../../src/main/services/agent-usage-antigravity-local";
import { createAgentUsageService } from "../../../src/main/services/agent-usage-service";
import type { KimiOAuthTokenService } from "../../../src/main/services/kimi-oauth-token-service";

const HOME = "/Users/tester";
const KIMI_ROOT = "/Users/tester/.kimi-code";
const INITIAL_CLOCK = 1_800_000_000_000;

const KIMI_TOKEN = "kimi-access-token-for-tests";
const ANTIGRAVITY_TOKEN = "antigravity-access-token-for-tests";
const GEMINI_TOKEN = "gemini-access-token-for-tests";
const COPILOT_TOKEN = "ghu_copilot-token-for-tests";

const ANTIGRAVITY_TOKEN_PATH = path.join(
  HOME,
  ".gemini",
  "antigravity-cli",
  "antigravity-oauth-token",
);
const GEMINI_CREDENTIALS_PATH = path.join(HOME, ".gemini", "oauth_creds.json");
const GH_HOSTS_PATH = path.join(HOME, ".config", "gh", "hosts.yml");
const COPILOT_HOSTS_PATH = path.join(
  HOME,
  ".config",
  "github-copilot",
  "hosts.json",
);
const CLOUDCODE_BASE = "https://cloudcode-pa.googleapis.com/v1internal";

interface Harness {
  service: ReturnType<typeof createAgentUsageService>;
  fetchImpl: ReturnType<typeof vi.fn>;
  antigravityLocalGetUsage: ReturnType<typeof vi.fn>;
  commandRunner: {
    resolve: ReturnType<typeof vi.fn>;
    run: ReturnType<typeof vi.fn>;
  };
  setFile: (filePath: string, raw: string | null) => void;
  setDir: (dirPath: string, entries: string[] | null) => void;
}

// The fetch mock only needs the Response surface the service consumes;
// the cast keeps the fixture minimal without pulling in a full Response.
function fakeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function createHarness(
  options: {
    platform?: NodeJS.Platform;
    antigravityLocalResult?: AntigravityLocalUsageResult;
    kimiOAuthTokenService?: KimiOAuthTokenService;
    pathExists?: boolean;
  } = {},
): Harness {
  const files = new Map<string, string>();
  const dirs = new Map<string, string[]>();
  const fetchImpl = vi.fn();
  const commandRunner = {
    resolve: vi.fn(async () => null),
    run: vi.fn(async () => ({ stdout: "", stderr: "" })),
  };
  const readFile = vi.fn(async (filePath: string): Promise<string> => {
    const raw = files.get(filePath);
    if (raw === undefined) throw new Error("ENOENT");
    return raw;
  });
  const readDir = vi.fn(async (dirPath: string): Promise<string[]> => {
    const entries = dirs.get(dirPath);
    if (entries === undefined) throw new Error("ENOENT");
    return entries;
  });
  const antigravityLocalGetUsage = vi.fn(
    async (): Promise<AntigravityLocalUsageResult> =>
      options.antigravityLocalResult ?? { kind: "not-running" },
  );
  const service = createAgentUsageService({
    resolveConfigRoot: (agentId: string) => {
      const roots: Record<string, string> = {
        kimi: KIMI_ROOT,
        antigravity: "/Users/tester/.config/antigravity",
        gemini: "/Users/tester/.gemini",
        copilot: "/Users/tester/.config/github-copilot",
      };
      const root = roots[agentId];
      if (!root) throw new Error(`Unknown Agent platform: ${agentId}`);
      return root;
    },
    fetchImpl: fetchImpl as unknown as typeof fetch,
    commandRunner,
    readFile,
    readDir,
    pathExists: vi.fn(async () => options.pathExists ?? true),
    now: () => INITIAL_CLOCK,
    homeDir: HOME,
    platform: options.platform ?? "linux",
    antigravityLocalClient: {
      getUsage: antigravityLocalGetUsage,
    },
    kimiOAuthTokenService: options.kimiOAuthTokenService,
  });
  return {
    service,
    fetchImpl,
    antigravityLocalGetUsage,
    commandRunner,
    setFile: (filePath, raw) => {
      if (raw === null) files.delete(filePath);
      else files.set(filePath, raw);
    },
    setDir: (dirPath, entries) => {
      if (entries === null) dirs.delete(dirPath);
      else dirs.set(dirPath, entries);
    },
  };
}

function expectNoTokenLeak(value: unknown, token: string): void {
  expect(JSON.stringify(value)).not.toContain(token);
}

function metricById(quota: AgentUsageQuota, id: string) {
  return quota.metrics.find((metric) => metric.id === id);
}

function abortError(): Error {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}

function kimiCredentialsPayload(
  overrides: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    access_token: KIMI_TOKEN,
    expires_at: "2027-06-01T00:00:00.000Z",
    ...overrides,
  });
}

function kimiUsagePayload(overrides: Record<string, unknown> = {}) {
  return {
    usage: {
      limit: 100,
      remaining: 58,
      resetTime: "2027-01-15T00:00:00.000Z",
    },
    limits: [
      {
        detail: {
          limit: 50,
          remaining: 40,
          resetTime: "2027-01-08T12:00:00.000Z",
        },
        window: { duration: 300, timeUnit: "TIME_UNIT_MINUTE" },
      },
    ],
    totalQuota: { limit: 999, remaining: 999 },
    user: { membership: { level: "LEVEL_INTERMEDIATE" } },
    ...overrides,
  };
}

describe("Agent usage service (Kimi adapter)", () => {
  describe("credential resolution", () => {
    it("queries quota with an access token renewed by the current Kimi credential service", async () => {
      const getAccessToken = vi.fn().mockResolvedValue({
        kind: "ok",
        accessToken: "renewed-kimi-access-token",
      });
      const h = createHarness({
        kimiOAuthTokenService: { getAccessToken },
      });
      h.fetchImpl.mockResolvedValue(fakeResponse(200, kimiUsagePayload()));

      const quota = await h.service.getUsage("kimi");

      expect(quota.status).toBe("ok");
      expect(getAccessToken).toHaveBeenCalledWith(KIMI_ROOT);
      expect(h.fetchImpl).toHaveBeenCalledWith(
        "https://api.kimi.com/coding/v1/usages",
        expect.objectContaining({
          headers: { Authorization: "Bearer renewed-kimi-access-token" },
        }),
      );
    });

    it("keeps Kimi renewal failures explicit and sanitized", async () => {
      const h = createHarness({
        kimiOAuthTokenService: {
          getAccessToken: vi.fn().mockResolvedValue({
            kind: "unavailable",
            errorCode: "credential-write-error",
          }),
        },
      });

      const quota = await h.service.getUsage("kimi");

      expect(quota).toMatchObject({
        status: "unavailable",
        errorCode: "credential-write-error",
      });
      expect(h.fetchImpl).not.toHaveBeenCalled();
    });

    it("forces one token renewal and retries usage after an accepted token returns 401", async () => {
      const getAccessToken = vi
        .fn()
        .mockResolvedValueOnce({ kind: "ok", accessToken: KIMI_TOKEN })
        .mockResolvedValueOnce({
          kind: "ok",
          accessToken: "renewed-kimi-access-token",
        });
      const h = createHarness({
        kimiOAuthTokenService: { getAccessToken },
      });
      h.fetchImpl
        .mockResolvedValueOnce(fakeResponse(401, {}))
        .mockResolvedValueOnce(fakeResponse(200, kimiUsagePayload()));

      const quota = await h.service.getUsage("kimi");

      expect(quota.status).toBe("ok");
      expect(getAccessToken).toHaveBeenNthCalledWith(1, KIMI_ROOT);
      expect(getAccessToken).toHaveBeenNthCalledWith(2, KIMI_ROOT, {
        forceRefresh: true,
      });
      expect(h.fetchImpl).toHaveBeenCalledTimes(2);
    });

    it("returns no-credentials without a network call when no credential file exists", async () => {
      const h = createHarness();

      const quota = await h.service.getUsage("kimi");

      expect(quota).toMatchObject({
        agentId: "kimi",
        adapter: "kimi-oauth-v1",
        status: "no-credentials",
        metrics: [],
        plan: null,
        fetchedAt: INITIAL_CLOCK,
      });
      expect(h.fetchImpl).not.toHaveBeenCalled();
    });

    it("returns no-credentials for malformed credential JSON", async () => {
      const h = createHarness();
      h.setFile(
        path.join(KIMI_ROOT, "credentials", "kimi-code.json"),
        "{ nope",
      );

      const quota = await h.service.getUsage("kimi");

      expect(quota.status).toBe("no-credentials");
      expect(h.fetchImpl).not.toHaveBeenCalled();
    });

    it("returns no-credentials when access_token is blank", async () => {
      const h = createHarness();
      h.setFile(
        path.join(KIMI_ROOT, "credentials", "kimi-code.json"),
        kimiCredentialsPayload({ access_token: "   " }),
      );

      const quota = await h.service.getUsage("kimi");

      expect(quota.status).toBe("no-credentials");
      expect(h.fetchImpl).not.toHaveBeenCalled();
    });

    it("falls back to json files under the oauth directory", async () => {
      const h = createHarness();
      h.setDir(path.join(KIMI_ROOT, "oauth"), ["notes.txt", "kimi-code.json"]);
      h.setFile(
        path.join(KIMI_ROOT, "oauth", "kimi-code.json"),
        kimiCredentialsPayload(),
      );
      h.fetchImpl.mockResolvedValue(fakeResponse(200, kimiUsagePayload()));

      const quota = await h.service.getUsage("kimi");

      expect(quota.status).toBe("ok");
      expect(h.fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("short-circuits to expired when expires_at is in the past, without a network call", async () => {
      const h = createHarness();
      h.setFile(
        path.join(KIMI_ROOT, "credentials", "kimi-code.json"),
        kimiCredentialsPayload({ expires_at: "2020-01-01T00:00:00.000Z" }),
      );

      const quota = await h.service.getUsage("kimi");

      expect(quota).toMatchObject({ status: "expired", metrics: [] });
      expect(h.fetchImpl).not.toHaveBeenCalled();
    });

    it("accepts expires_at as epoch seconds", async () => {
      const h = createHarness();
      h.setFile(
        path.join(KIMI_ROOT, "credentials", "kimi-code.json"),
        kimiCredentialsPayload({ expires_at: INITIAL_CLOCK / 1000 + 3600 }),
      );
      h.fetchImpl.mockResolvedValue(fakeResponse(200, kimiUsagePayload()));

      const quota = await h.service.getUsage("kimi");

      expect(quota.status).toBe("ok");
    });
  });

  describe("request and response mapping", () => {
    it("requests the usages endpoint with a Bearer header", async () => {
      const h = createHarness();
      h.setFile(
        path.join(KIMI_ROOT, "credentials", "kimi-code.json"),
        kimiCredentialsPayload(),
      );
      h.fetchImpl.mockResolvedValue(fakeResponse(200, kimiUsagePayload()));

      await h.service.getUsage("kimi");

      expect(h.fetchImpl).toHaveBeenCalledWith(
        "https://api.kimi.com/coding/v1/usages",
        expect.objectContaining({
          method: "GET",
          headers: { Authorization: `Bearer ${KIMI_TOKEN}` },
        }),
      );
    });

    it("maps the live usage shape to weekly and rolling metrics plus plan", async () => {
      const h = createHarness();
      h.setFile(
        path.join(KIMI_ROOT, "credentials", "kimi-code.json"),
        kimiCredentialsPayload(),
      );
      h.fetchImpl.mockResolvedValue(fakeResponse(200, kimiUsagePayload()));

      const quota = await h.service.getUsage("kimi");

      expect(quota).toMatchObject({
        agentId: "kimi",
        adapter: "kimi-oauth-v1",
        status: "ok",
        plan: "LEVEL_INTERMEDIATE",
        fetchedAt: INITIAL_CLOCK,
      });
      expect(metricById(quota, "weekly")).toEqual({
        id: "weekly",
        label: "Weekly quota",
        scope: { kind: "account" },
        period: { kind: "calendar", unit: "week" },
        value: {
          kind: "amount",
          remainingPercent: 58,
          remainingAmount: 58,
          limitAmount: 100,
          unit: "requests",
        },
        resetsAt: Date.parse("2027-01-15T00:00:00.000Z"),
      });
      expect(metricById(quota, "rolling")).toEqual({
        id: "rolling",
        label: "Rolling window",
        scope: { kind: "account" },
        period: { kind: "rolling", durationSeconds: 18_000 },
        value: {
          kind: "amount",
          remainingPercent: 80,
          remainingAmount: 40,
          limitAmount: 50,
          unit: "requests",
        },
        resetsAt: Date.parse("2027-01-08T12:00:00.000Z"),
      });
      expect(quota.metrics).toHaveLength(2);
    });

    it("keeps compatibility with Kimi payloads that report used amounts and plain time units", async () => {
      const h = createHarness();
      h.setFile(
        path.join(KIMI_ROOT, "credentials", "kimi-code.json"),
        kimiCredentialsPayload(),
      );
      h.fetchImpl.mockResolvedValue(
        fakeResponse(
          200,
          kimiUsagePayload({
            usage: {
              limit: 100,
              used: 42,
              resetTime: "2027-01-15T00:00:00.000Z",
            },
            limits: [
              {
                detail: { used: 10, limit: 50 },
                window: { duration: 5, timeUnit: "hours" },
              },
            ],
          }),
        ),
      );

      const quota = await h.service.getUsage("kimi");

      expect(metricById(quota, "weekly")).toMatchObject({
        value: { remainingPercent: 58, remainingAmount: 58 },
      });
      expect(metricById(quota, "rolling")).toMatchObject({
        period: { kind: "rolling", durationSeconds: 18_000 },
        value: { remainingPercent: 80, remainingAmount: 40 },
      });
    });

    it("omits amounts and reports zero utilization when the weekly limit is 0", async () => {
      const h = createHarness();
      h.setFile(
        path.join(KIMI_ROOT, "credentials", "kimi-code.json"),
        kimiCredentialsPayload(),
      );
      h.fetchImpl.mockResolvedValue(
        fakeResponse(200, kimiUsagePayload({ usage: { limit: 0, used: 0 } })),
      );

      const quota = await h.service.getUsage("kimi");

      expect(metricById(quota, "weekly")).toMatchObject({
        value: { kind: "unknown" },
      });
    });

    it("keeps incomplete Kimi quota rows unknown instead of inventing values", async () => {
      const h = createHarness();
      h.setFile(
        path.join(KIMI_ROOT, "credentials", "kimi-code.json"),
        kimiCredentialsPayload(),
      );
      h.fetchImpl.mockResolvedValue(
        fakeResponse(
          200,
          kimiUsagePayload({
            usage: { limit: 100 },
            limits: [
              {
                detail: { remaining: 40 },
                window: { duration: 300, timeUnit: "TIME_UNIT_MINUTE" },
              },
            ],
          }),
        ),
      );

      const quota = await h.service.getUsage("kimi");

      expect(metricById(quota, "weekly")).toMatchObject({
        value: { kind: "unknown" },
      });
      expect(quota.metrics.some((metric) => metric.id === "rolling")).toBe(
        false,
      );
    });
  });

  describe("error mapping and secret isolation", () => {
    function seedCredentials(h: Harness): void {
      h.setFile(
        path.join(KIMI_ROOT, "credentials", "kimi-code.json"),
        kimiCredentialsPayload(),
      );
    }

    it.each([401, 403])("maps HTTP %i to expired", async (status) => {
      const h = createHarness();
      seedCredentials(h);
      h.fetchImpl.mockResolvedValue(fakeResponse(status, {}));

      const quota = await h.service.getUsage("kimi");

      expect(quota).toMatchObject({ status: "expired" });
      expectNoTokenLeak(quota, KIMI_TOKEN);
    });

    it("maps HTTP 500 to unavailable with http-error", async () => {
      const h = createHarness();
      seedCredentials(h);
      h.fetchImpl.mockResolvedValue(fakeResponse(500, {}));

      const quota = await h.service.getUsage("kimi");

      expect(quota).toMatchObject({
        status: "unavailable",
        errorCode: "http-error",
      });
    });

    it("maps a rejected fetch to network-error and an abort to timeout", async () => {
      const h = createHarness();
      seedCredentials(h);
      h.fetchImpl.mockRejectedValueOnce(new Error("socket hang up"));

      const network = await h.service.getUsage("kimi");
      expect(network).toMatchObject({
        status: "unavailable",
        errorCode: "network-error",
      });

      h.fetchImpl.mockRejectedValueOnce(abortError());
      const timeout = await h.service.getUsage("kimi", {
        forceRefresh: true,
      });
      expect(timeout).toMatchObject({
        status: "unavailable",
        errorCode: "timeout",
      });
    });

    it("never exposes the token in returned quotas", async () => {
      const h = createHarness();
      seedCredentials(h);
      h.fetchImpl.mockResolvedValue(fakeResponse(200, kimiUsagePayload()));

      const quota = await h.service.getUsage("kimi");

      expectNoTokenLeak(quota, KIMI_TOKEN);
    });
  });
});

function antigravityTokenPayload(
  overrides: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    token: {
      access_token: ANTIGRAVITY_TOKEN,
      expiry: "2027-06-01T00:00:00.000Z",
      ...overrides,
    },
  });
}

function antigravityKeychainPayload(
  overrides: Record<string, unknown> = {},
): string {
  const payload = antigravityTokenPayload(overrides);
  return `account-reference:${Buffer.from(payload).toString("base64url")}`;
}

function loadCodeAssistPayload(overrides: Record<string, unknown> = {}) {
  return {
    cloudaicompanionProject: "projects/proj-123",
    currentTier: { id: "tier-pro", name: "Pro" },
    ...overrides,
  };
}

function antigravityModelsPayload() {
  return {
    models: {
      "gemini-2.5-pro": {
        quotaInfo: {
          remainingFraction: 0.25,
          resetTime: "2027-01-02T00:00:00.000Z",
        },
      },
      "gemini-2.5-flash": {
        quotaInfo: { remainingFraction: 1 },
      },
    },
  };
}

describe("Agent usage service (Antigravity adapter)", () => {
  describe("credential resolution", () => {
    it("does not probe an Agent whose configured root is not detected", async () => {
      const h = createHarness({
        pathExists: false,
        platform: "darwin",
        antigravityLocalResult: {
          kind: "ok",
          plan: "Pro",
          metrics: [],
        },
      });

      await expect(h.service.getUsage("antigravity")).resolves.toMatchObject({
        agentId: "antigravity",
        adapter: "agent-installation-guard-v1",
        status: "unavailable",
        errorCode: "agent-not-installed",
      });
      expect(h.antigravityLocalGetUsage).not.toHaveBeenCalled();
      expect(h.commandRunner.resolve).not.toHaveBeenCalled();
      expect(h.fetchImpl).not.toHaveBeenCalled();
    });

    it("prefers the running Antigravity desktop session over stale stored tokens", async () => {
      const h = createHarness({
        platform: "darwin",
        antigravityLocalResult: {
          kind: "ok",
          plan: "Pro",
          metrics: [
            {
              id: "antigravity:gemini-weekly:weekly",
              label: "Weekly quota",
              scope: {
                kind: "model-group",
                id: "group-0",
                label: "Gemini Models",
              },
              period: { kind: "calendar", unit: "week" },
              value: { kind: "percentage", remainingPercent: 75 },
              resetsAt: null,
            },
          ],
        },
      });
      h.commandRunner.resolve.mockResolvedValue("/usr/bin/security");
      h.commandRunner.run.mockResolvedValue({
        stdout: antigravityKeychainPayload({
          expiry: "2020-01-01T00:00:00.000Z",
        }),
        stderr: "",
      });

      const quota = await h.service.getUsage("antigravity");

      expect(quota).toMatchObject({
        status: "ok",
        adapter: "antigravity-local-v1",
        plan: "Pro",
      });
      expect(
        metricById(quota, "antigravity:gemini-weekly:weekly"),
      ).toMatchObject({
        value: { kind: "percentage", remainingPercent: 75 },
      });
      expect(metricById(quota, "promptCredits")).toBeUndefined();
      expect(h.fetchImpl).not.toHaveBeenCalled();
      expect(h.commandRunner.resolve).not.toHaveBeenCalled();
    });

    it("keeps the open-app fallback when the local helper is unavailable for a renewable session", async () => {
      const h = createHarness({
        platform: "darwin",
        antigravityLocalResult: { kind: "not-running" },
      });
      h.commandRunner.resolve.mockResolvedValue("/usr/bin/security");
      h.commandRunner.run.mockResolvedValue({
        stdout: antigravityKeychainPayload({
          expiry: "2020-01-01T00:00:00.000Z",
          refresh_token: "refresh-token-for-tests",
        }),
        stderr: "",
      });

      const quota = await h.service.getUsage("antigravity");

      expect(quota).toMatchObject({
        status: "unavailable",
        errorCode: "antigravity-not-running",
      });
      expect(JSON.stringify(quota)).not.toContain("refresh-token-for-tests");
      expect(h.fetchImpl).not.toHaveBeenCalled();
    });

    it("uses the current Antigravity macOS Keychain session before stale legacy files", async () => {
      const h = createHarness({ platform: "darwin" });
      h.commandRunner.resolve.mockResolvedValue("/usr/bin/security");
      h.commandRunner.run.mockResolvedValue({
        stdout: antigravityKeychainPayload(),
        stderr: "",
      });
      h.setFile(
        ANTIGRAVITY_TOKEN_PATH,
        antigravityTokenPayload({ expiry: "2020-01-01T00:00:00.000Z" }),
      );
      h.fetchImpl
        .mockResolvedValueOnce(fakeResponse(200, loadCodeAssistPayload()))
        .mockResolvedValueOnce(fakeResponse(200, antigravityModelsPayload()));

      const quota = await h.service.getUsage("antigravity");

      expect(quota.status).toBe("ok");
      expect(h.commandRunner.run).toHaveBeenCalledWith(
        "/usr/bin/security",
        ["find-generic-password", "-s", "gemini", "-a", "antigravity", "-w"],
        expect.objectContaining({ timeout: 10_000 }),
      );
      expectNoTokenLeak(quota, ANTIGRAVITY_TOKEN);
    });

    it("continues past an expired legacy token to a valid shared credential", async () => {
      const h = createHarness();
      h.setFile(
        ANTIGRAVITY_TOKEN_PATH,
        antigravityTokenPayload({ expiry: "2020-01-01T00:00:00.000Z" }),
      );
      h.setFile(GEMINI_CREDENTIALS_PATH, geminiCredentialsPayload());
      h.fetchImpl
        .mockResolvedValueOnce(fakeResponse(200, loadCodeAssistPayload()))
        .mockResolvedValueOnce(fakeResponse(200, antigravityModelsPayload()));

      const quota = await h.service.getUsage("antigravity");

      expect(quota.status).toBe("ok");
      expect(h.fetchImpl).toHaveBeenCalledTimes(2);
    });

    it("falls back when the Keychain item is malformed instead of claiming the session expired", async () => {
      const h = createHarness({ platform: "darwin" });
      h.commandRunner.resolve.mockResolvedValue("/usr/bin/security");
      h.commandRunner.run.mockResolvedValue({
        stdout: "account-reference:not-valid-json",
        stderr: "",
      });
      h.setFile(GEMINI_CREDENTIALS_PATH, geminiCredentialsPayload());
      h.fetchImpl
        .mockResolvedValueOnce(fakeResponse(200, loadCodeAssistPayload()))
        .mockResolvedValueOnce(fakeResponse(200, antigravityModelsPayload()));

      const quota = await h.service.getUsage("antigravity");

      expect(quota.status).toBe("ok");
    });

    it("returns no-credentials without a network call when the token file is missing", async () => {
      const h = createHarness();

      const quota = await h.service.getUsage("antigravity");

      expect(quota).toMatchObject({
        agentId: "antigravity",
        adapter: "antigravity-oauth-v1",
        status: "no-credentials",
        metrics: [],
      });
      expect(h.fetchImpl).not.toHaveBeenCalled();
    });

    it("returns no-credentials for a token file without token.access_token", async () => {
      const h = createHarness();
      h.setFile(ANTIGRAVITY_TOKEN_PATH, JSON.stringify({ token: {} }));

      const quota = await h.service.getUsage("antigravity");

      expect(quota.status).toBe("no-credentials");
      expect(h.fetchImpl).not.toHaveBeenCalled();
    });

    it("short-circuits to expired when the token expiry has passed, without a network call", async () => {
      const h = createHarness();
      h.setFile(
        ANTIGRAVITY_TOKEN_PATH,
        antigravityTokenPayload({ expiry: "2020-01-01T00:00:00.000Z" }),
      );

      const quota = await h.service.getUsage("antigravity");

      expect(quota).toMatchObject({ status: "expired", metrics: [] });
      expect(h.fetchImpl).not.toHaveBeenCalled();
    });

    it("falls back to the shared Gemini credential file for Antigravity 2.0 installs", async () => {
      const h = createHarness();
      h.setFile(GEMINI_CREDENTIALS_PATH, geminiCredentialsPayload());
      h.fetchImpl
        .mockResolvedValueOnce(fakeResponse(200, loadCodeAssistPayload()))
        .mockResolvedValueOnce(fakeResponse(200, antigravityModelsPayload()));

      const quota = await h.service.getUsage("antigravity");

      expect(quota.status).toBe("ok");
      expect(h.fetchImpl).toHaveBeenCalledTimes(2);
      expect(h.fetchImpl).toHaveBeenNthCalledWith(
        1,
        `${CLOUDCODE_BASE}:loadCodeAssist`,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${GEMINI_TOKEN}`,
          }),
        }),
      );
    });

    it("returns no-credentials when both the Antigravity token and the shared Gemini file are missing", async () => {
      const h = createHarness();

      const quota = await h.service.getUsage("antigravity");

      expect(quota.status).toBe("no-credentials");
      expect(h.fetchImpl).not.toHaveBeenCalled();
    });
  });

  describe("request and response mapping", () => {
    it("calls loadCodeAssist then fetchAvailableModels with Bearer auth", async () => {
      const h = createHarness();
      h.setFile(ANTIGRAVITY_TOKEN_PATH, antigravityTokenPayload());
      h.fetchImpl
        .mockResolvedValueOnce(fakeResponse(200, loadCodeAssistPayload()))
        .mockResolvedValueOnce(fakeResponse(200, antigravityModelsPayload()));

      await h.service.getUsage("antigravity");

      expect(h.fetchImpl).toHaveBeenCalledTimes(2);
      expect(h.fetchImpl).toHaveBeenNthCalledWith(
        1,
        `${CLOUDCODE_BASE}:loadCodeAssist`,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: `Bearer ${ANTIGRAVITY_TOKEN}`,
          }),
          body: JSON.stringify({ metadata: { ideType: "ANTIGRAVITY" } }),
        }),
      );
      expect(h.fetchImpl).toHaveBeenNthCalledWith(
        2,
        `${CLOUDCODE_BASE}:fetchAvailableModels`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ project: "projects/proj-123" }),
        }),
      );
    });

    it("maps the models dict to per-model quota metrics and the tier to plan", async () => {
      const h = createHarness();
      h.setFile(ANTIGRAVITY_TOKEN_PATH, antigravityTokenPayload());
      h.fetchImpl
        .mockResolvedValueOnce(fakeResponse(200, loadCodeAssistPayload()))
        .mockResolvedValueOnce(fakeResponse(200, antigravityModelsPayload()));

      const quota = await h.service.getUsage("antigravity");

      expect(quota).toMatchObject({
        agentId: "antigravity",
        adapter: "antigravity-oauth-v1",
        status: "ok",
        plan: "Pro",
      });
      expect(metricById(quota, "model:gemini-2.5-pro")).toEqual({
        id: "model:gemini-2.5-pro",
        label: "Model quota",
        scope: {
          kind: "model",
          id: "gemini-2.5-pro",
          label: "gemini-2.5-pro",
        },
        period: { kind: "provider-defined", label: "Provider quota" },
        value: { kind: "percentage", remainingPercent: 25 },
        resetsAt: Date.parse("2027-01-02T00:00:00.000Z"),
      });
      expect(metricById(quota, "model:gemini-2.5-flash")).toEqual({
        id: "model:gemini-2.5-flash",
        label: "Model quota",
        scope: {
          kind: "model",
          id: "gemini-2.5-flash",
          label: "gemini-2.5-flash",
        },
        period: { kind: "provider-defined", label: "Provider quota" },
        value: { kind: "percentage", remainingPercent: 100 },
        resetsAt: null,
      });
    });

    it("accepts a project object and a models list defensively", async () => {
      const h = createHarness();
      h.setFile(ANTIGRAVITY_TOKEN_PATH, antigravityTokenPayload());
      h.fetchImpl
        .mockResolvedValueOnce(
          fakeResponse(
            200,
            loadCodeAssistPayload({
              cloudaicompanionProject: { id: "proj-obj" },
              currentTier: { id: "tier-free" },
            }),
          ),
        )
        .mockResolvedValueOnce(
          fakeResponse(200, {
            models: [
              { name: "gemini-2.5-pro", quotaInfo: { remainingFraction: 0.5 } },
            ],
          }),
        );

      const quota = await h.service.getUsage("antigravity");

      expect(quota.status).toBe("ok");
      expect(quota.plan).toBe("tier-free");
      expect(metricById(quota, "model:gemini-2.5-pro")).toMatchObject({
        value: { kind: "percentage", remainingPercent: 50 },
      });
      expect(h.fetchImpl).toHaveBeenNthCalledWith(
        2,
        `${CLOUDCODE_BASE}:fetchAvailableModels`,
        expect.objectContaining({
          body: JSON.stringify({ project: "proj-obj" }),
        }),
      );
    });
  });

  describe("error mapping and secret isolation", () => {
    it("maps a 401 from loadCodeAssist to expired", async () => {
      const h = createHarness();
      h.setFile(ANTIGRAVITY_TOKEN_PATH, antigravityTokenPayload());
      h.fetchImpl.mockResolvedValueOnce(fakeResponse(401, {}));

      const quota = await h.service.getUsage("antigravity");

      expect(quota).toMatchObject({ status: "expired" });
      expect(h.fetchImpl).toHaveBeenCalledTimes(1);
      expectNoTokenLeak(quota, ANTIGRAVITY_TOKEN);
    });

    it("maps an HTTP 500 from fetchAvailableModels to unavailable with http-error", async () => {
      const h = createHarness();
      h.setFile(ANTIGRAVITY_TOKEN_PATH, antigravityTokenPayload());
      h.fetchImpl
        .mockResolvedValueOnce(fakeResponse(200, loadCodeAssistPayload()))
        .mockResolvedValueOnce(fakeResponse(500, {}));

      const quota = await h.service.getUsage("antigravity");

      expect(quota).toMatchObject({
        status: "unavailable",
        errorCode: "http-error",
      });
    });

    it("maps a rejected fetch to network-error and an abort to timeout", async () => {
      const h = createHarness();
      h.setFile(ANTIGRAVITY_TOKEN_PATH, antigravityTokenPayload());
      h.fetchImpl.mockRejectedValueOnce(new Error("socket hang up"));

      const network = await h.service.getUsage("antigravity");
      expect(network).toMatchObject({
        status: "unavailable",
        errorCode: "network-error",
      });

      h.fetchImpl.mockRejectedValueOnce(abortError());
      const timeout = await h.service.getUsage("antigravity", {
        forceRefresh: true,
      });
      expect(timeout).toMatchObject({
        status: "unavailable",
        errorCode: "timeout",
      });
    });
  });
});

function geminiCredentialsPayload(
  overrides: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    access_token: GEMINI_TOKEN,
    expiry_date: INITIAL_CLOCK + 3_600_000,
    ...overrides,
  });
}

describe("temporarily unsupported quota providers", () => {
  it.each(["gemini", "copilot"])(
    "does not query %s even when native credentials exist",
    async (agentId) => {
      const h = createHarness();
      h.setFile(
        GEMINI_CREDENTIALS_PATH,
        JSON.stringify({ access_token: GEMINI_TOKEN }),
      );
      h.setFile(
        GH_HOSTS_PATH,
        `github.com:\n  oauth_token: ${COPILOT_TOKEN}\n`,
      );
      h.setFile(
        COPILOT_HOSTS_PATH,
        JSON.stringify({ "github.com": { oauth_token: COPILOT_TOKEN } }),
      );
      const quota = await h.service.getUsage(agentId, { forceRefresh: true });
      expect(quota).toMatchObject({
        agentId,
        adapter: "unsupported",
        status: "unavailable",
        errorCode: "unsupported-agent",
        metrics: [],
      });
      expect(h.fetchImpl).not.toHaveBeenCalled();
      expect(h.commandRunner.run).not.toHaveBeenCalled();
    },
  );
});
