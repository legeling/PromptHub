import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  root: "",
  sessionFetch: vi.fn<typeof fetch>(),
  manualFetch: vi.fn<typeof fetch>(),
  setProxy: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("electron", () => ({
  session: {
    defaultSession: { fetch: fixture.sessionFetch, setProxy: fixture.setProxy },
  },
}));
vi.mock("undici", async (importOriginal) => ({
  ...(await importOriginal<typeof import("undici")>()),
  fetch: fixture.manualFetch,
}));

const originalEnvironment = { ...process.env };
const directFetch = vi.fn<typeof fetch>();
let runtime: typeof import("../../../src/main/services/agent-usage-runtime");
let network: typeof import("../../../src/main/services/network-proxy");

function credentialPath(): string {
  return path.join(fixture.root, "agent-homes", "codex", "auth.json");
}

function usageResponse(usedPercent: number): Response {
  return new Response(
    JSON.stringify({
      plan_type: "plus",
      rate_limit: {
        primary_window: {
          used_percent: usedPercent,
          limit_window_seconds: 18_000,
          reset_at: 1_900_000_000,
        },
      },
    }),
  );
}

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubGlobal("fetch", directFetch);
  fixture.root = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-usage-network-"),
  );
  const { initializeAgentSettingsFixture } =
    await import("../../helpers/agent-settings");
  initializeAgentSettingsFixture(fixture.root);
  const codexRoot = path.dirname(credentialPath());
  fs.mkdirSync(codexRoot, { recursive: true });
  fs.writeFileSync(
    path.join(codexRoot, "config.toml"),
    'model_provider = "openai"',
  );
  fs.writeFileSync(
    credentialPath(),
    JSON.stringify({
      tokens: {
        access_token: "fixture-only-token",
        account_id: "fixture-account",
      },
    }),
  );
  // The production singleton is imported before startup applies saved proxy settings.
  runtime = await import("../../../src/main/services/agent-usage-runtime");
  network = await import("../../../src/main/services/network-proxy");
});

afterEach(async () => {
  await network?.applyNetworkProxySettings({ mode: "direct" });
  vi.unstubAllGlobals();
  process.env = { ...originalEnvironment };
  (await import("@prompthub/db")).closeDatabase();
  (await import("../../../src/main/runtime-paths")).resetRuntimePaths();
  fs.rmSync(fixture.root, { recursive: true, force: true });
});

it("reads quota through the current proxy mode after the singleton was created", async () => {
  fixture.sessionFetch.mockImplementation(async () => usageResponse(25));
  directFetch.mockImplementation(async () => usageResponse(60));
  await network.applyNetworkProxySettings({ mode: "system" });
  expect(fixture.setProxy).toHaveBeenLastCalledWith({ mode: "system" });
  const system = await runtime.agentUsageService.getUsage("codex");
  expect(system).toMatchObject({
    status: "ok",
    metrics: [{ value: { remainingPercent: 75 } }],
  });
  expect(directFetch).not.toHaveBeenCalled();
  expect(fixture.sessionFetch).toHaveBeenCalledWith(
    "https://chatgpt.com/backend-api/wham/usage",
    expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: "Bearer fixture-only-token",
        "ChatGPT-Account-Id": "fixture-account",
      }),
      signal: expect.any(AbortSignal),
    }),
  );

  await network.applyNetworkProxySettings({ mode: "direct" });
  const direct = await runtime.agentUsageService.getUsage("codex", {
    forceRefresh: true,
  });
  expect(direct).toMatchObject({
    status: "ok",
    metrics: [{ value: { remainingPercent: 40 } }],
  });
  await network.applyNetworkProxySettings({ mode: "system" });
  const restored = await runtime.agentUsageService.getUsage("codex", {
    forceRefresh: true,
  });
  expect(restored.metrics).toEqual(system.metrics);
  expect(fixture.sessionFetch).toHaveBeenCalledTimes(2);
  expect(directFetch).toHaveBeenCalledTimes(1);
});

it("reports transport failure without leaking details or retrying direct, then permits explicit retry", async () => {
  const credentials = fs.readFileSync(credentialPath());
  fixture.sessionFetch.mockRejectedValueOnce(
    new Error("fixture-secret-network-detail"),
  );
  await network.applyNetworkProxySettings({ mode: "system" });
  const failed = await runtime.agentUsageService.getUsage("codex");
  expect(failed).toMatchObject({
    status: "unavailable",
    errorCode: "network-error",
    metrics: [],
  });
  expect(JSON.stringify(failed)).not.toContain("fixture-secret");
  expect(directFetch).not.toHaveBeenCalled();
  fixture.sessionFetch.mockResolvedValueOnce(usageResponse(10));
  const retried = await runtime.agentUsageService.getUsage("codex", {
    forceRefresh: true,
  });
  expect(retried).toMatchObject({
    status: "ok",
    metrics: [{ value: { remainingPercent: 90 } }],
  });
  expect(fs.readFileSync(credentialPath())).toEqual(credentials);
});

it("uses a subsequently configured manual HTTP proxy instead of the captured startup fetch", async () => {
  fixture.manualFetch.mockResolvedValueOnce(usageResponse(20));
  await network.applyNetworkProxySettings({
    mode: "manual",
    protocol: "http",
    host: "127.0.0.1",
    port: 18081,
  });
  const quota = await runtime.agentUsageService.getUsage("codex", {
    forceRefresh: true,
  });
  expect(quota).toMatchObject({
    status: "ok",
    metrics: [{ value: { remainingPercent: 80 } }],
  });
  expect(fixture.manualFetch).toHaveBeenCalledWith(
    "https://chatgpt.com/backend-api/wham/usage",
    expect.objectContaining({ dispatcher: expect.any(Object) }),
  );
  expect(fixture.sessionFetch).not.toHaveBeenCalled();
  expect(directFetch).not.toHaveBeenCalled();
});
