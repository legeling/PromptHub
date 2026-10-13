import { createHash } from "node:crypto";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { NativeCommandRunner } from "../../../src/main/services/native-command";
import { createAgentUsageService } from "../../../src/main/services/agent-usage-service";

const TOKEN = "sk-ant-oat01-secret-token-for-tests";
const CONFIG_ROOT = "/Users/tester/.claude";
const INITIAL_CLOCK = 1_800_000_000_000;

interface Harness {
  service: ReturnType<typeof createAgentUsageService>;
  runnerResolve: ReturnType<typeof vi.fn>;
  runnerRun: ReturnType<typeof vi.fn>;
  fetchImpl: ReturnType<typeof vi.fn>;
  readFile: ReturnType<typeof vi.fn>;
  setClock: (value: number) => void;
}

function keychainPayload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    claudeAiOauth: {
      accessToken: TOKEN,
      subscriptionType: "max",
      ...overrides,
    },
  });
}

function usagePayload(overrides: Record<string, unknown> = {}) {
  return {
    five_hour: { utilization: 12.5, resets_at: "2027-01-01T12:00:00.000Z" },
    seven_day: { utilization: 40, resets_at: "2027-01-08T00:00:00.000Z" },
    seven_day_opus: { utilization: 3, resets_at: null },
    ...overrides,
  };
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
  overrides: {
    resolveConfigRoot?: (agentId: string) => string;
    platform?: NodeJS.Platform;
    environment?: NodeJS.ProcessEnv;
  } = {},
): Harness {
  let clock = INITIAL_CLOCK;
  const runnerResolve = vi.fn().mockResolvedValue("/usr/bin/security");
  const runnerRun = vi.fn();
  const fetchImpl = vi.fn();
  const readFile = vi.fn();
  const commandRunner: NativeCommandRunner = {
    resolve: runnerResolve,
    run: runnerRun,
  };
  const service = createAgentUsageService({
    homeDir: "/Users/tester",
    environment: overrides.environment ?? {},
    resolveConfigRoot:
      overrides.resolveConfigRoot ??
      ((agentId: string) => {
        if (agentId !== "claude") {
          throw new Error(`Unknown Agent platform: ${agentId}`);
        }
        return CONFIG_ROOT;
      }),
    commandRunner,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    readFile,
    pathExists: vi.fn(async () => true),
    now: () => clock,
    platform: overrides.platform ?? "darwin",
  });
  return {
    service,
    runnerResolve,
    runnerRun,
    fetchImpl,
    readFile,
    setClock: (value: number) => {
      clock = value;
    },
  };
}

function expectNoTokenLeak(value: unknown): void {
  expect(JSON.stringify(value)).not.toContain(TOKEN);
}

describe("Agent usage service", () => {
  describe("credential resolution order", () => {
    it("uses the legacy keychain entry when it yields credentials", async () => {
      const h = createHarness();
      h.runnerRun.mockResolvedValue({ stdout: keychainPayload(), stderr: "" });
      h.fetchImpl.mockResolvedValue(fakeResponse(200, usagePayload()));

      const quota = await h.service.getUsage("claude");

      expect(quota.status).toBe("ok");
      expect(h.runnerResolve).toHaveBeenCalledWith("security");
      expect(h.runnerRun).toHaveBeenCalledTimes(1);
      expect(h.runnerRun).toHaveBeenCalledWith(
        "/usr/bin/security",
        ["find-generic-password", "-s", "Claude Code-credentials", "-w"],
        expect.objectContaining({ timeout: 10_000 }),
      );
      expect(h.readFile).toHaveBeenCalledTimes(1);
      expect(h.readFile).toHaveBeenCalledWith(
        path.join(CONFIG_ROOT, "settings.json"),
      );
    });

    it("uses the scoped keychain entry when the default directory is explicitly selected", async () => {
      const h = createHarness({
        environment: { CLAUDE_CONFIG_DIR: CONFIG_ROOT },
      });
      h.runnerRun.mockResolvedValue({ stdout: keychainPayload(), stderr: "" });
      h.fetchImpl.mockResolvedValue(fakeResponse(200, usagePayload()));

      const quota = await h.service.getUsage("claude");

      expect(quota.status).toBe("ok");
      const expectedHash = createHash("sha256")
        .update(CONFIG_ROOT)
        .digest("hex")
        .slice(0, 8);
      expect(h.runnerRun).toHaveBeenCalledTimes(1);
      expect(h.runnerRun).toHaveBeenNthCalledWith(
        1,
        "/usr/bin/security",
        [
          "find-generic-password",
          "-s",
          `Claude Code-credentials-${expectedHash}`,
          "-w",
        ],
        expect.objectContaining({ timeout: 10_000 }),
      );
      expect(h.readFile).toHaveBeenCalledTimes(1);
      expect(h.readFile).toHaveBeenCalledWith(
        path.join(CONFIG_ROOT, "settings.json"),
      );
    });

    it("computes the hashed service name as sha256(expandedRoot).slice(0, 8)", async () => {
      const customRoot = "/custom/expanded/claude-root";
      const h = createHarness({
        resolveConfigRoot: () => customRoot,
      });
      h.runnerRun
        .mockRejectedValueOnce(new Error("not found"))
        .mockRejectedValueOnce(new Error("not found"));
      h.readFile.mockResolvedValue(keychainPayload());
      h.fetchImpl.mockResolvedValue(fakeResponse(200, usagePayload()));

      await h.service.getUsage("claude");

      const expectedServiceName = `Claude Code-credentials-${createHash(
        "sha256",
      )
        .update(customRoot)
        .digest("hex")
        .slice(0, 8)}`;
      expect(h.runnerRun).toHaveBeenNthCalledWith(
        1,
        "/usr/bin/security",
        ["find-generic-password", "-s", expectedServiceName, "-w"],
        expect.objectContaining({ timeout: 10_000 }),
      );
    });

    it("falls back to the credentials file when every keychain lookup fails", async () => {
      const h = createHarness();
      h.runnerRun.mockRejectedValue(new Error("not found"));
      h.readFile.mockResolvedValue(keychainPayload());
      h.fetchImpl.mockResolvedValue(fakeResponse(200, usagePayload()));

      const quota = await h.service.getUsage("claude");

      expect(quota.status).toBe("ok");
      expect(h.runnerRun).toHaveBeenCalledTimes(1);
      expect(h.readFile).toHaveBeenCalledWith(
        path.join(CONFIG_ROOT, ".credentials.json"),
      );
    });

    it("returns no-credentials without a network call when every source is missing", async () => {
      const h = createHarness();
      h.runnerRun.mockRejectedValue(new Error("not found"));
      h.readFile.mockRejectedValue(new Error("ENOENT"));

      const quota = await h.service.getUsage("claude");

      expect(quota).toMatchObject({
        agentId: "claude",
        adapter: "claude-oauth-v1",
        status: "no-credentials",
        source: "provider",
        metrics: [],
        plan: null,
        fetchedAt: INITIAL_CLOCK,
      });
      expect(h.fetchImpl).not.toHaveBeenCalled();
    });

    it("skips the keychain entirely when the security binary cannot be resolved", async () => {
      const h = createHarness();
      h.runnerResolve.mockResolvedValue(null);
      h.readFile.mockResolvedValue(keychainPayload());
      h.fetchImpl.mockResolvedValue(fakeResponse(200, usagePayload()));

      const quota = await h.service.getUsage("claude");

      expect(quota.status).toBe("ok");
      expect(h.runnerRun).not.toHaveBeenCalled();
      expect(h.readFile).toHaveBeenCalledTimes(2);
    });

    it("does not consult the keychain on non-macOS platforms", async () => {
      const h = createHarness({ platform: "linux" });
      h.readFile.mockResolvedValue(keychainPayload());
      h.fetchImpl.mockResolvedValue(fakeResponse(200, usagePayload()));

      const quota = await h.service.getUsage("claude");

      expect(quota.status).toBe("ok");
      expect(h.runnerResolve).not.toHaveBeenCalled();
      expect(h.runnerRun).not.toHaveBeenCalled();
    });
  });

  describe("credential parsing", () => {
    it("treats malformed keychain JSON as a miss and continues the fallback chain", async () => {
      const h = createHarness();
      h.runnerRun.mockResolvedValue({ stdout: "{ not-json", stderr: "" });
      h.readFile.mockResolvedValue(keychainPayload());
      h.fetchImpl.mockResolvedValue(fakeResponse(200, usagePayload()));

      const quota = await h.service.getUsage("claude");

      expect(quota.status).toBe("ok");
      expect(h.readFile).toHaveBeenCalledTimes(2);
    });

    it("returns no-credentials when no source exposes a usable token", async () => {
      const h = createHarness();
      h.runnerRun.mockRejectedValue(new Error("not found"));
      h.readFile.mockResolvedValue(
        JSON.stringify({ claudeAiOauth: { subscriptionType: "pro" } }),
      );

      const quota = await h.service.getUsage("claude");

      expect(quota.status).toBe("no-credentials");
      expect(quota.plan).toBeNull();
      expect(h.fetchImpl).not.toHaveBeenCalled();
    });

    it("accepts a top-level accessToken when claudeAiOauth is absent", async () => {
      const h = createHarness();
      h.runnerRun.mockResolvedValue({
        stdout: JSON.stringify({ accessToken: TOKEN }),
        stderr: "",
      });
      h.fetchImpl.mockResolvedValue(fakeResponse(200, usagePayload()));

      const quota = await h.service.getUsage("claude");

      expect(quota.status).toBe("ok");
      expect(quota.plan).toBeNull();
      expect(h.fetchImpl).toHaveBeenCalledWith(
        "https://api.anthropic.com/api/oauth/usage",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${TOKEN}`,
          }),
        }),
      );
    });

    it("short-circuits to expired when expiresAt is in the past, without a network call", async () => {
      const h = createHarness();
      h.runnerRun.mockResolvedValue({
        stdout: keychainPayload({ expiresAt: INITIAL_CLOCK - 1 }),
        stderr: "",
      });

      const quota = await h.service.getUsage("claude");

      expect(quota).toMatchObject({
        status: "expired",
        plan: "max",
        metrics: [],
        fetchedAt: INITIAL_CLOCK,
      });
      expect(h.fetchImpl).not.toHaveBeenCalled();
    });
  });

  describe("usage response mapping", () => {
    it("maps windows, plan, and timestamps from a 200 response", async () => {
      const h = createHarness();
      h.runnerRun.mockResolvedValue({ stdout: keychainPayload(), stderr: "" });
      h.fetchImpl.mockResolvedValue(fakeResponse(200, usagePayload()));

      const quota = await h.service.getUsage("claude");

      expect(quota).toEqual({
        schemaVersion: 2,
        agentId: "claude",
        adapter: "claude-oauth-v1",
        status: "ok",
        source: "provider",
        metrics: [
          {
            id: "fiveHour",
            label: "5-hour window",
            scope: { kind: "account" },
            period: { kind: "rolling", durationSeconds: 18_000 },
            value: { kind: "percentage", remainingPercent: 87.5 },
            resetsAt: Date.parse("2027-01-01T12:00:00.000Z"),
          },
          {
            id: "sevenDay",
            label: "7-day window",
            scope: { kind: "account" },
            period: { kind: "rolling", durationSeconds: 604_800 },
            value: { kind: "percentage", remainingPercent: 60 },
            resetsAt: Date.parse("2027-01-08T00:00:00.000Z"),
          },
          {
            id: "sevenDayOpus",
            label: "7-day Opus window",
            scope: { kind: "model-group", id: "opus", label: "Opus" },
            period: { kind: "rolling", durationSeconds: 604_800 },
            value: { kind: "percentage", remainingPercent: 97 },
            resetsAt: null,
          },
        ],
        plan: "max",
        fetchedAt: INITIAL_CLOCK,
      });
      expect(h.fetchImpl).toHaveBeenCalledWith(
        "https://api.anthropic.com/api/oauth/usage",
        expect.objectContaining({
          method: "GET",
          headers: {
            Authorization: `Bearer ${TOKEN}`,
            "anthropic-beta": "oauth-2025-04-20",
            "Content-Type": "application/json",
          },
        }),
      );
    });

    it("maps missing windows to null instead of fabricating values", async () => {
      const h = createHarness();
      h.runnerRun.mockResolvedValue({ stdout: keychainPayload(), stderr: "" });
      h.fetchImpl.mockResolvedValue(
        fakeResponse(200, {
          five_hour: { utilization: 7, resets_at: "not-a-date" },
        }),
      );

      const quota = await h.service.getUsage("claude");

      expect(quota.status).toBe("ok");
      expect(quota.metrics).toEqual([
        {
          id: "fiveHour",
          label: "5-hour window",
          scope: { kind: "account" },
          period: { kind: "rolling", durationSeconds: 18_000 },
          value: { kind: "percentage", remainingPercent: 93 },
          resetsAt: null,
        },
      ]);
    });
  });

  describe("error mapping", () => {
    async function seedCredentials(h: Harness): Promise<void> {
      h.runnerRun.mockResolvedValue({ stdout: keychainPayload(), stderr: "" });
    }

    it("maps HTTP 401 to expired", async () => {
      const h = createHarness();
      await seedCredentials(h);
      h.fetchImpl.mockResolvedValue(fakeResponse(401, { error: "nope" }));

      const quota = await h.service.getUsage("claude");

      expect(quota).toMatchObject({
        status: "expired",
        plan: "max",
        fetchedAt: INITIAL_CLOCK,
      });
    });

    it("maps HTTP 500 to unavailable with http-error", async () => {
      const h = createHarness();
      await seedCredentials(h);
      h.fetchImpl.mockResolvedValue(fakeResponse(500, {}));

      const quota = await h.service.getUsage("claude");

      expect(quota).toMatchObject({
        status: "unavailable",
        errorCode: "http-error",
        plan: "max",
      });
    });

    it("maps a rejected fetch to unavailable with network-error", async () => {
      const h = createHarness();
      await seedCredentials(h);
      h.fetchImpl.mockRejectedValue(new Error("socket hang up"));

      const quota = await h.service.getUsage("claude");

      expect(quota).toMatchObject({
        status: "unavailable",
        errorCode: "network-error",
      });
    });

    it("maps an abort to unavailable with timeout", async () => {
      const h = createHarness();
      await seedCredentials(h);
      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";
      h.fetchImpl.mockRejectedValue(abortError);

      const quota = await h.service.getUsage("claude");

      expect(quota).toMatchObject({
        status: "unavailable",
        errorCode: "timeout",
      });
    });
  });

  describe("result cache", () => {
    it("serves a cached result within 60 seconds without a second request", async () => {
      const h = createHarness();
      h.runnerRun.mockResolvedValue({ stdout: keychainPayload(), stderr: "" });
      h.fetchImpl.mockResolvedValue(fakeResponse(200, usagePayload()));

      const first = await h.service.getUsage("claude");
      const second = await h.service.getUsage("claude");

      expect(second).toBe(first);
      expect(h.fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("refetches once the cache entry is older than 60 seconds", async () => {
      const h = createHarness();
      h.runnerRun.mockResolvedValue({ stdout: keychainPayload(), stderr: "" });
      h.fetchImpl.mockResolvedValue(fakeResponse(200, usagePayload()));

      await h.service.getUsage("claude");
      h.setClock(INITIAL_CLOCK + 60_001);
      const refreshed = await h.service.getUsage("claude");

      expect(h.fetchImpl).toHaveBeenCalledTimes(2);
      expect(refreshed.fetchedAt).toBe(INITIAL_CLOCK + 60_001);
    });

    it("bypasses the cache when forceRefresh is set", async () => {
      const h = createHarness();
      h.runnerRun.mockResolvedValue({ stdout: keychainPayload(), stderr: "" });
      h.fetchImpl.mockResolvedValue(fakeResponse(200, usagePayload()));

      await h.service.getUsage("claude");
      await h.service.getUsage("claude", { forceRefresh: true });

      expect(h.fetchImpl).toHaveBeenCalledTimes(2);
    });
  });

  describe("agent id validation", () => {
    it("rejects a non-string or empty agentId", async () => {
      const h = createHarness();

      await expect(h.service.getUsage(42 as unknown as string)).rejects.toThrow(
        "Agent usage query requires a non-empty agentId",
      );
      await expect(h.service.getUsage("  ")).rejects.toThrow(
        "Agent usage query requires a non-empty agentId",
      );
      expect(h.fetchImpl).not.toHaveBeenCalled();
    });

    it("rejects an unregistered agent id before any credential lookup", async () => {
      const h = createHarness();

      await expect(h.service.getUsage("evil-agent")).rejects.toThrow(
        "Unknown Agent platform: evil-agent",
      );
      expect(h.runnerRun).not.toHaveBeenCalled();
      expect(h.readFile).not.toHaveBeenCalled();
      expect(h.fetchImpl).not.toHaveBeenCalled();
    });

    it("returns unsupported-agent for registered agents without a usage adapter", async () => {
      const h = createHarness({
        resolveConfigRoot: (agentId: string) => {
          if (agentId === "claude") return CONFIG_ROOT;
          if (agentId === "cursor") return "/Users/tester/.cursor";
          throw new Error(`Unknown Agent platform: ${agentId}`);
        },
      });

      const quota = await h.service.getUsage("cursor");

      expect(quota).toMatchObject({
        agentId: "cursor",
        adapter: "unsupported",
        status: "unavailable",
        errorCode: "unsupported-agent",
      });
      expect(h.runnerRun).not.toHaveBeenCalled();
      expect(h.fetchImpl).not.toHaveBeenCalled();
    });
  });

  describe("secret isolation", () => {
    it("never exposes the token in returned quotas across every status", async () => {
      const scenarios: Array<{
        name: string;
        arrange: (h: Harness) => void;
      }> = [
        {
          name: "ok",
          arrange: (h) =>
            h.fetchImpl.mockResolvedValue(fakeResponse(200, usagePayload())),
        },
        {
          name: "expired",
          arrange: (h) => h.fetchImpl.mockResolvedValue(fakeResponse(401, {})),
        },
        {
          name: "unavailable",
          arrange: (h) =>
            h.fetchImpl.mockRejectedValue(new Error("connection reset")),
        },
      ];

      for (const scenario of scenarios) {
        const h = createHarness();
        h.runnerRun.mockResolvedValue({
          stdout: keychainPayload(),
          stderr: "",
        });
        scenario.arrange(h);
        const quota = await h.service.getUsage("claude");
        expectNoTokenLeak(quota);
      }
    });

    it("never exposes the token when credential lookups fail", async () => {
      const h = createHarness();
      h.runnerRun.mockRejectedValue(
        new Error(`lookup failed for bearer ${TOKEN}`),
      );
      h.readFile.mockRejectedValue(new Error(`cannot read token ${TOKEN}`));

      const quota = await h.service.getUsage("claude");

      expect(quota.status).toBe("no-credentials");
      expectNoTokenLeak(quota);
    });
  });

  describe("custom gateway short-circuit", () => {
    it("returns custom-provider-active without network or keychain access when ANTHROPIC_BASE_URL is set", async () => {
      const h = createHarness();
      h.readFile.mockResolvedValue(
        JSON.stringify({
          env: { ANTHROPIC_BASE_URL: "https://api.krill-ai.com" },
        }),
      );

      const quota = await h.service.getUsage("claude");

      expect(quota.status).toBe("unavailable");
      expect(quota.errorCode).toBe("custom-provider-active");
      expect(h.runnerRun).not.toHaveBeenCalled();
      expect(h.fetchImpl).not.toHaveBeenCalled();
      expect(h.readFile).toHaveBeenCalledWith(`${CONFIG_ROOT}/settings.json`);
    });

    it("returns custom-provider-active when a cloud provider flag is set", async () => {
      const h = createHarness();
      h.readFile.mockResolvedValue(
        JSON.stringify({ env: { CLAUDE_CODE_USE_BEDROCK: "1" } }),
      );

      const quota = await h.service.getUsage("claude");

      expect(quota.status).toBe("unavailable");
      expect(quota.errorCode).toBe("custom-provider-active");
      expect(h.fetchImpl).not.toHaveBeenCalled();
    });

    it("proceeds with the official flow when settings.json is missing or has no gateway", async () => {
      const h = createHarness();
      h.readFile.mockRejectedValue(new Error("ENOENT"));
      h.runnerRun.mockResolvedValue({ stdout: keychainPayload(), stderr: "" });
      h.fetchImpl.mockResolvedValue(fakeResponse(200, usagePayload()));

      const quota = await h.service.getUsage("claude");

      expect(quota.status).toBe("ok");
      expect(h.fetchImpl).toHaveBeenCalledTimes(1);
    });
  });
});
