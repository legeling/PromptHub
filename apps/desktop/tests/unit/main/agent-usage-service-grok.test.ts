import { expect, it, vi } from "vitest";
import { createAgentUsageService } from "../../../src/main/services/agent-usage-service";

it("keeps Grok quota unavailable without touching existing native credentials", async () => {
  const readFile = vi.fn(async () =>
    JSON.stringify({
      "https://auth.x.ai::grok-build-client": { key: "fixture-token" },
    }),
  );
  const fetchImpl = vi.fn();
  const service = createAgentUsageService({
    resolveConfigRoot: () => "/isolated/grok",
    readFile,
    fetchImpl,
    pathExists: vi.fn(async () => true),
  });
  await expect(
    service.getUsage("grok", { forceRefresh: true }),
  ).resolves.toMatchObject({
    agentId: "grok",
    status: "unavailable",
    adapter: "unsupported",
    errorCode: "unsupported-agent",
    metrics: [],
  });
  expect(readFile).not.toHaveBeenCalled();
  expect(fetchImpl).not.toHaveBeenCalled();
});
