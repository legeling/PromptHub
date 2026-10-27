/** @vitest-environment node */
import { describe, expect, it, vi } from "vitest";
import { SKILL_PLATFORMS } from "@prompthub/shared/constants/platforms";
import { getAgentPlatformCapabilityInventory } from "@prompthub/shared/constants/agent-platform-capabilities";
import { buildManagedAgents } from "@prompthub/core/agent-management/agent-query";
import { AGENT_MODEL_PROVIDER_PLATFORM_IDS } from "../../../src/main/services/agent-model-provider-adapter";
import { AGENT_USAGE_TRAY_AGENTS } from "../../../src/main/services/agent-usage-tray-projection";
import { createAgentUsageService } from "../../../src/main/services/agent-usage-service";

describe("initial Agent support scope", () => {
  it("keeps assets and existing sessions visible without advertising provider support", () => {
    const agents = buildManagedAgents({
      platforms: SKILL_PLATFORMS,
      detectedPlatformIds: ["kimi", "cursor"],
      pinnedPlatformIds: [],
      builtinOverrides: {},
      osKey: "darwin",
    });
    const kimi = agents.find(({ id }) => id === "kimi")!;
    expect(kimi.capabilities.provider.status).toBe("unsupported");
    expect(kimi.capabilities.usage.status).toBe("supported");
    expect(kimi.capabilities.sessions.status).toBe("supported");
    expect(kimi.capabilities.assets.status).toBe("partial");
    expect(
      agents.find(({ id }) => id === "cursor")?.capabilities.provider.status,
    ).toBe("unsupported");
  });
  it("exposes only five provider/model platforms and four quota platforms", () => {
    const available = (key: "providerModel" | "usage") =>
      SKILL_PLATFORMS.filter((platform) =>
        ["supported", "partial"].includes(
          getAgentPlatformCapabilityInventory(platform)[key].status,
        ),
      )
        .map(({ id }) => id)
        .sort();
    expect(available("providerModel")).toEqual([
      "antigravity-cli",
      "claude",
      "codex",
      "opencode",
      "pi",
    ]);
    expect([...AGENT_MODEL_PROVIDER_PLATFORM_IDS].sort()).toEqual(
      available("providerModel"),
    );
    expect(available("usage")).toEqual([
      "antigravity",
      "claude",
      "codex",
      "kimi",
    ]);
    expect(AGENT_USAGE_TRAY_AGENTS.map(({ id }) => id).sort()).toEqual(
      available("usage"),
    );
  });

  it.each(["gemini", "grok", "copilot", "opencode", "pi"])(
    "does not read credentials or query quota for %s",
    async (agentId) => {
      const readFile = vi.fn();
      const fetchImpl = vi.fn();
      const pathExists = vi.fn(async () => true);
      const service = createAgentUsageService({
        resolveConfigRoot: (id) => `/isolated/${id}`,
        pathExists,
        readFile,
        fetchImpl,
      });
      await expect(
        service.getUsage(agentId, { forceRefresh: true }),
      ).resolves.toMatchObject({
        agentId,
        status: "unavailable",
        adapter: "unsupported",
        errorCode: "unsupported-agent",
        metrics: [],
      });
      expect(readFile).not.toHaveBeenCalled();
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(pathExists).not.toHaveBeenCalled();
    },
  );
});
