import { beforeEach, describe, expect, it } from "vitest";

import type {
  AgentUsageMetric,
  AgentUsageQuota,
} from "@prompthub/shared/types";
import {
  readCachedAgentUsage,
  writeCachedAgentUsage,
} from "../../../src/renderer/components/agent/use-agent-usage";

const CACHE_KEY = `prompthub.agent-usage.claude.${encodeURIComponent("/fixture/root")}`;

function metric(overrides: Partial<AgentUsageMetric> = {}): AgentUsageMetric {
  return {
    id: "fiveHour",
    label: "5-hour window",
    scope: { kind: "account" },
    period: { kind: "rolling", durationSeconds: 18_000 },
    value: { kind: "percentage", remainingPercent: 50 },
    resetsAt: null,
    ...overrides,
  };
}

function quota(metrics: AgentUsageMetric[]): AgentUsageQuota {
  return {
    schemaVersion: 2,
    agentId: "claude",
    adapter: "test",
    status: "ok",
    source: "provider",
    plan: null,
    fetchedAt: 1,
    metrics,
  };
}

function read(payload: unknown): AgentUsageQuota | null {
  window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  return readCachedAgentUsage("claude", "/fixture/root");
}

describe("agent usage renderer cache validation", () => {
  beforeEach(() => window.localStorage.clear());

  it("accepts every supported scope, period and value variant", () => {
    const payload = quota([
      metric({ period: { kind: "lifetime" }, value: { kind: "unlimited" } }),
      metric({
        id: "group",
        scope: { kind: "model-group", id: "group", label: "Group" },
        period: { kind: "provider-defined", label: "Provider" },
        value: { kind: "unknown" },
      }),
      metric({
        id: "model",
        scope: { kind: "model", id: "model", label: "Model" },
        period: { kind: "rolling", durationSeconds: null },
        resetsAt: 2,
      }),
      metric({
        id: "feature",
        scope: { kind: "feature", id: "feature", label: "Feature" },
        period: { kind: "calendar", unit: "billing-cycle" },
        value: {
          kind: "amount",
          remainingPercent: 50,
          remainingAmount: 5,
          limitAmount: 10,
          unit: "requests",
        },
      }),
    ]);

    expect(read(payload)).toEqual(payload);
  });

  it.each([
    ["scope is not an object", { scope: null }],
    [
      "scope kind is unsupported",
      { scope: { kind: "team", id: "a", label: "A" } },
    ],
    ["scope id is empty", { scope: { kind: "model", id: "", label: "A" } }],
    ["scope label is empty", { scope: { kind: "model", id: "a", label: "" } }],
    ["period is not an object", { period: null }],
    [
      "provider period label is empty",
      { period: { kind: "provider-defined", label: "" } },
    ],
    [
      "rolling duration is zero",
      { period: { kind: "rolling", durationSeconds: 0 } },
    ],
    [
      "rolling duration has the wrong type",
      { period: { kind: "rolling", durationSeconds: "5" } },
    ],
    [
      "calendar unit is unsupported",
      { period: { kind: "calendar", unit: "year" } },
    ],
    ["period kind is unsupported", { period: { kind: "session" } }],
    ["value is not an object", { value: null }],
    [
      "remaining percent has the wrong type",
      { value: { kind: "percentage", remainingPercent: "50" } },
    ],
    [
      "remaining percent is negative",
      { value: { kind: "percentage", remainingPercent: -1 } },
    ],
    [
      "remaining percent exceeds 100",
      { value: { kind: "percentage", remainingPercent: 101 } },
    ],
    [
      "amount remaining has the wrong type",
      {
        value: {
          kind: "amount",
          remainingPercent: 50,
          remainingAmount: "5",
          limitAmount: 10,
          unit: "requests",
        },
      },
    ],
    [
      "amount limit has the wrong type",
      {
        value: {
          kind: "amount",
          remainingPercent: 50,
          remainingAmount: 5,
          limitAmount: "10",
          unit: "requests",
        },
      },
    ],
    [
      "amount remaining is negative",
      {
        value: {
          kind: "amount",
          remainingPercent: 50,
          remainingAmount: -1,
          limitAmount: 10,
          unit: "requests",
        },
      },
    ],
    [
      "amount limit is zero",
      {
        value: {
          kind: "amount",
          remainingPercent: 50,
          remainingAmount: 0,
          limitAmount: 0,
          unit: "requests",
        },
      },
    ],
    [
      "amount remaining exceeds limit",
      {
        value: {
          kind: "amount",
          remainingPercent: 50,
          remainingAmount: 11,
          limitAmount: 10,
          unit: "requests",
        },
      },
    ],
    [
      "amount unit is empty",
      {
        value: {
          kind: "amount",
          remainingPercent: 50,
          remainingAmount: 5,
          limitAmount: 10,
          unit: "",
        },
      },
    ],
    ["metric id is empty", { id: "" }],
    ["metric label is too long", { label: "x".repeat(513) }],
    ["reset has the wrong type", { resetsAt: "soon" }],
  ])("rejects a metric when %s", (_label, patch) => {
    expect(
      read(quota([metric(patch as Partial<AgentUsageMetric>)])),
    ).toBeNull();
  });

  it.each([
    ["payload is not an object", null],
    ["schema is stale", { ...quota([]), schemaVersion: 1 }],
    ["agent identity differs", { ...quota([]), agentId: "codex" }],
    ["status is not successful", { ...quota([]), status: "expired" }],
    ["adapter is empty", { ...quota([]), adapter: "" }],
    ["source is not provider", { ...quota([]), source: "derived" }],
    ["plan is invalid", { ...quota([]), plan: 1 }],
    ["timestamp is invalid", { ...quota([]), fetchedAt: "now" }],
    ["metrics are missing", { ...quota([]), metrics: null }],
  ])("rejects an envelope when %s", (_label, payload) => {
    expect(read(payload)).toBeNull();
  });

  it("treats a disabled localStorage backend as a best-effort cache", () => {
    const storage = window.localStorage;
    const failingStorage = Object.create(storage) as Storage;
    failingStorage.setItem = () => {
      throw new Error("storage disabled");
    };
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: failingStorage,
    });
    try {
      expect(() =>
        writeCachedAgentUsage("/fixture/root", quota([])),
      ).not.toThrow();
    } finally {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        value: storage,
      });
    }
  });
});
