/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from "vitest";

import type { AgentUsageQuota } from "@prompthub/shared/types";
import {
  AGENT_USAGE_TRAY_AGENTS,
  createAgentUsageTrayProjection,
} from "../../../src/main/services/agent-usage-tray-projection";

function quota(
  agentId: string,
  overrides: Partial<AgentUsageQuota> = {},
): AgentUsageQuota {
  return {
    schemaVersion: 2,
    agentId,
    adapter: `${agentId}-test`,
    status: "ok",
    source: "provider",
    plan: "pro",
    fetchedAt: 1_800_000_000_000,
    metrics: [],
    ...overrides,
  };
}

describe("Agent usage tray projection", () => {
  it("starts with every verified usage adapter in stable named order", () => {
    const projection = createAgentUsageTrayProjection({
      getUsage: vi.fn(),
    });

    expect(projection.getSnapshot()).toEqual(
      AGENT_USAGE_TRAY_AGENTS.map((agent) => ({
        ...agent,
        isLoading: true,
        isStale: false,
        quota: null,
      })),
    );
    expect(AGENT_USAGE_TRAY_AGENTS.map((agent) => agent.id)).toEqual([
      "claude",
      "codex",
      "kimi",
      "antigravity",
    ]);
  });

  it("loads with two workers, publishes each row, and forwards force refresh", async () => {
    let active = 0;
    let maxActive = 0;
    const releases: Array<() => void> = [];
    const getUsage = vi.fn(
      (agentId: string, options?: { forceRefresh?: boolean }) =>
        new Promise<AgentUsageQuota>((resolve) => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          releases.push(() => {
            active -= 1;
            resolve(quota(agentId));
          });
          expect(options).toEqual({ forceRefresh: true });
        }),
    );
    const onChange = vi.fn();
    const projection = createAgentUsageTrayProjection({ getUsage, onChange });
    const pending = projection.refresh({ forceRefresh: true });

    expect(getUsage).toHaveBeenCalledTimes(2);
    while (
      releases.length > 0 ||
      getUsage.mock.calls.length < AGENT_USAGE_TRAY_AGENTS.length
    ) {
      releases.shift()?.();
      await Promise.resolve();
    }
    await pending;

    expect(maxActive).toBe(2);
    expect(onChange).toHaveBeenCalledTimes(AGENT_USAGE_TRAY_AGENTS.length);
    expect(projection.getSnapshot().every((row) => !row.isLoading)).toBe(true);
  });

  it("deduplicates an in-flight refresh", () => {
    const getUsage = vi.fn(() => new Promise<AgentUsageQuota>(() => {}));
    const projection = createAgentUsageTrayProjection({ getUsage });

    const first = projection.refresh();
    const second = projection.refresh({ forceRefresh: true });

    expect(second).toBe(first);
    expect(getUsage).toHaveBeenCalledTimes(2);
  });

  it("preserves a successful row as stale after an unavailable refresh", async () => {
    const getUsage = vi
      .fn<(agentId: string) => Promise<AgentUsageQuota>>()
      .mockImplementation(async (agentId) => quota(agentId));
    const projection = createAgentUsageTrayProjection({ getUsage });
    await projection.refresh();

    getUsage.mockImplementation(async (agentId) =>
      quota(agentId, {
        status: "unavailable",
        plan: null,
        metrics: [],
      }),
    );
    await projection.refresh({ forceRefresh: true });

    expect(projection.getSnapshot()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "codex",
          isStale: true,
          quota: expect.objectContaining({ status: "ok" }),
        }),
      ]),
    );
  });

  it("normalizes thrown and identity-mismatched results without raw errors", async () => {
    const getUsage = vi.fn(async (agentId: string) => {
      if (agentId === "claude") throw new Error("private token failure");
      return quota(agentId === "codex" ? "wrong-agent" : agentId);
    });
    const projection = createAgentUsageTrayProjection({ getUsage });
    await projection.refresh();

    const snapshot = projection.getSnapshot();
    expect(snapshot.find((row) => row.id === "claude")?.quota).toMatchObject({
      agentId: "claude",
      errorCode: "internal-error",
      status: "unavailable",
    });
    expect(snapshot.find((row) => row.id === "codex")?.quota).toMatchObject({
      agentId: "codex",
      errorCode: "identity-mismatch",
      status: "unavailable",
    });
    expect(JSON.stringify(snapshot)).not.toContain("private token failure");
  });

  it("ignores late results after destruction", async () => {
    let resolveUsage: ((value: AgentUsageQuota) => void) | undefined;
    const getUsage = vi.fn(
      (agentId: string) =>
        new Promise<AgentUsageQuota>((resolve) => {
          if (!resolveUsage) resolveUsage = resolve;
          else resolve(quota(agentId));
        }),
    );
    const onChange = vi.fn();
    const projection = createAgentUsageTrayProjection({ getUsage, onChange });
    const pending = projection.refresh();
    projection.destroy();
    resolveUsage?.(quota("claude"));
    await pending;

    expect(onChange).not.toHaveBeenCalled();
    expect(projection.getSnapshot().every((row) => row.quota === null)).toBe(
      true,
    );
  });

  it("isolates menu rebuild failures and keeps destruction idempotent", async () => {
    const getUsage = vi.fn(async (agentId: string) => quota(agentId));
    const projection = createAgentUsageTrayProjection({
      getUsage,
      onChange: () => {
        throw new Error("menu rebuild failed");
      },
    });

    await expect(projection.refresh()).resolves.toBeUndefined();
    expect(
      projection.getSnapshot().every((row) => row.quota?.status === "ok"),
    ).toBe(true);
    projection.destroy();
    projection.destroy();
    await expect(projection.refresh()).resolves.toBeUndefined();
    expect(getUsage).toHaveBeenCalledTimes(AGENT_USAGE_TRAY_AGENTS.length);
  });
});
