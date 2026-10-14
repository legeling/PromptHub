import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { AgentUsageQuota } from "@prompthub/shared/types";
import { installWindowMocks } from "../../helpers/window";
import {
  readCachedAgentUsage,
  writeCachedAgentUsage,
  useAgentUsage,
} from "../../../src/renderer/components/agent/use-agent-usage";

const quota = (plan: string): AgentUsageQuota => ({
  schemaVersion: 2,
  agentId: "codex",
  adapter: "fixture",
  status: "ok",
  source: "provider",
  plan,
  metrics: [],
  fetchedAt: 1,
});
beforeEach(() => {
  installWindowMocks();
  window.localStorage.clear();
});

it("isolates stored quota by root and ignores the old unscoped cache", () => {
  window.localStorage.setItem(
    "prompthub.agent-usage.codex",
    JSON.stringify(quota("unscoped")),
  );
  expect(readCachedAgentUsage("codex", "/a")).toBeNull();
  writeCachedAgentUsage("/a", quota("a"));
  expect(readCachedAgentUsage("codex", "/a")?.plan).toBe("a");
  expect(readCachedAgentUsage("codex", "/b")).toBeNull();
});

it("refetches on a same-Agent root switch and ignores the previous root's late reply", async () => {
  let resolveOld: ((value: AgentUsageQuota) => void) | undefined;
  const getUsage = vi.mocked(window.api.agent.getUsage);
  getUsage.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
  );
  getUsage.mockResolvedValueOnce(quota("b"));
  const hook = renderHook(({ root }) => useAgentUsage("codex", root), {
    initialProps: { root: "/a" },
  });
  hook.rerender({ root: "/b" });
  await waitFor(() => expect(hook.result.current.quota?.plan).toBe("b"));
  await act(async () => resolveOld?.(quota("a")));
  expect(hook.result.current.quota?.plan).toBe("b");
  expect(getUsage).toHaveBeenCalledTimes(2);
  expect(readCachedAgentUsage("codex", "/a")).toBeNull();
  expect(readCachedAgentUsage("codex", "/b")?.plan).toBe("b");
});
