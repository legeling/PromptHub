import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentCapabilityStatus } from "@prompthub/shared/types/agent";

const unavailableStatuses: AgentCapabilityStatus[] = ["planned", "unsupported"];

afterEach(() => {
  vi.doUnmock("@prompthub/shared/constants/agent-definitions/claude");
  vi.resetModules();
});

async function loadClaudeCapability(
  enabled: boolean,
  status: AgentCapabilityStatus,
) {
  vi.resetModules();
  vi.doMock(
    "@prompthub/shared/constants/agent-definitions/claude",
    async (importOriginal) => {
      const original =
        await importOriginal<
          typeof import("@prompthub/shared/constants/agent-definitions/claude")
        >();
      const definition = original.claudeAgentDefinition;
      return {
        claudeAgentDefinition: {
          ...definition,
          capabilities: {
            ...definition.capabilities,
            providerModel: {
              enabled,
              status,
              evidence: "test-adapter-evidence",
            },
          },
        },
      };
    },
  );
  const {
    getAgentPlatformCapabilityInventory,
    isAgentDepthCapabilityAvailable,
  } = await import("@prompthub/shared/constants/agent-platform-capabilities");
  const { getPlatformById } =
    await import("@prompthub/shared/constants/platforms");
  const { AGENT_MODEL_PROVIDER_PLATFORM_IDS } =
    await import("@/main/services/agent-model-provider-adapter");
  const platform = getPlatformById("claude");
  if (!platform) throw new Error("Missing Claude platform fixture");
  return {
    inventory: getAgentPlatformCapabilityInventory(platform),
    available: isAgentDepthCapabilityAvailable("claude", "providerModel"),
    registered: AGENT_MODEL_PROVIDER_PLATFORM_IDS.includes("claude"),
  };
}

describe("Agent product definition switches", () => {
  it("disables an implemented adapter without hiding assets or sessions", async () => {
    const result = await loadClaudeCapability(false, "supported");
    expect(result.available).toBe(false);
    expect(result.registered).toBe(false);
    expect(result.inventory.providerModel).toEqual({
      status: "unsupported",
      evidence: "outside-initial-support-scope",
    });
    expect(result.inventory.skills.status).toBe("partial");
    expect(result.inventory.sessions.status).toBe("supported");
    expect(result.inventory.usage.status).toBe("supported");
  });

  it.each(unavailableStatuses)(
    "does not register a %s adapter merely because its switch is enabled",
    async (status) => {
      const result = await loadClaudeCapability(true, status);
      expect(result.available).toBe(false);
      expect(result.registered).toBe(false);
      expect(result.inventory.providerModel).toEqual({
        status,
        evidence: "test-adapter-evidence",
      });
    },
  );

  it("registers an enabled partial adapter with its existing evidence", async () => {
    const result = await loadClaudeCapability(true, "partial");
    expect(result.available).toBe(true);
    expect(result.registered).toBe(true);
    expect(result.inventory.providerModel).toEqual({
      status: "partial",
      evidence: "test-adapter-evidence",
    });
  });
});
