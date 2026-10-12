import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAgentSessionIndex } from "../../../src/renderer/components/agent/use-agent-session-index";
import type { AgentSessionIndexPublicState } from "@prompthub/shared/types";
import { installWindowMocks } from "../../helpers/window";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function state(enabled: boolean): AgentSessionIndexPublicState {
  return {
    supported: true,
    enabled,
    lastStatus: enabled ? "ok" : "idle",
    lastScannedAt: enabled ? 100 : null,
    lastErrorCode: null,
  };
}

describe("useAgentSessionIndex", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("reconciles an application preference and refreshes only when enabled", async () => {
    const setSessionIndexEnabled = vi
      .fn()
      .mockResolvedValueOnce(state(true))
      .mockResolvedValueOnce(state(false));
    const refreshSessionIndex = vi.fn().mockResolvedValue(state(true));
    const getSessionIndexState = vi
      .fn()
      .mockResolvedValueOnce(state(false))
      .mockResolvedValueOnce(state(true));
    installWindowMocks({
      api: {
        agent: {
          getSessionIndexState,
          setSessionIndexEnabled,
          refreshSessionIndex,
        },
      },
    });

    const enabledHook = renderHook(() => useAgentSessionIndex("claude", true));
    await waitFor(() => expect(refreshSessionIndex).toHaveBeenCalledOnce());
    expect(setSessionIndexEnabled).toHaveBeenNthCalledWith(1, {
      agentId: "claude",
      enabled: true,
    });
    enabledHook.unmount();

    const disabledHook = renderHook(() =>
      useAgentSessionIndex("gemini", false),
    );
    await waitFor(() =>
      expect(setSessionIndexEnabled).toHaveBeenNthCalledWith(2, {
        agentId: "gemini",
        enabled: false,
      }),
    );
    expect(refreshSessionIndex).toHaveBeenCalledTimes(1);
    disabledHook.unmount();
  });

  it("reuses a fresh persisted index without scanning again", async () => {
    const freshState: AgentSessionIndexPublicState = {
      supported: true,
      enabled: true,
      lastStatus: "ok",
      lastScannedAt: Date.now(),
      lastErrorCode: null,
    };
    const refreshSessionIndex = vi.fn().mockResolvedValue(freshState);
    installWindowMocks({
      api: {
        agent: {
          getSessionIndexState: vi.fn().mockResolvedValue(freshState),
          refreshSessionIndex,
        },
      },
    });

    const { result } = renderHook(() => useAgentSessionIndex("gemini", true));
    await waitFor(() => expect(result.current.state.enabled).toBe(true));
    await act(async () => Promise.resolve());

    expect(refreshSessionIndex).not.toHaveBeenCalled();
  });

  it("keeps one automatic warmup alive across History remounts", async () => {
    const staleState: AgentSessionIndexPublicState = {
      supported: true,
      enabled: true,
      lastStatus: "ok",
      lastScannedAt: 1,
      lastErrorCode: null,
    };
    const warmedState: AgentSessionIndexPublicState = {
      ...staleState,
      lastScannedAt: Date.now(),
    };
    const warmup = deferred<AgentSessionIndexPublicState>();
    const refreshSessionIndex = vi.fn(() => warmup.promise);
    const cancelSessionIndex = vi.fn().mockResolvedValue(true);
    installWindowMocks({
      api: {
        agent: {
          getSessionIndexState: vi.fn().mockResolvedValue(staleState),
          refreshSessionIndex,
          cancelSessionIndex,
        },
      },
    });

    const first = renderHook(() => useAgentSessionIndex("gemini", true));
    await waitFor(() => expect(refreshSessionIndex).toHaveBeenCalledOnce());
    first.unmount();

    const second = renderHook(() => useAgentSessionIndex("gemini", true));
    await waitFor(() => expect(second.result.current.state.enabled).toBe(true));
    expect(refreshSessionIndex).toHaveBeenCalledOnce();
    expect(cancelSessionIndex).not.toHaveBeenCalled();

    await act(async () => warmup.resolve(warmedState));
    await waitFor(() =>
      expect(second.result.current.state.lastScannedAt).toBe(
        warmedState.lastScannedAt,
      ),
    );
    second.unmount();
  });

  it("opts in explicitly, accepts only scoped progress, cancels, and disables", async () => {
    const refresh = deferred<AgentSessionIndexPublicState>();
    let progressListener:
      | ((value: {
          agentId: string;
          requestId: string;
          processed: number;
          total: number;
        }) => void)
      | undefined;
    const unsubscribe = vi.fn();
    const setSessionIndexEnabled = vi
      .fn()
      .mockResolvedValueOnce(state(true))
      .mockResolvedValueOnce(state(false));
    const refreshSessionIndex = vi.fn<
      typeof window.api.agent.refreshSessionIndex
    >(() => refresh.promise);
    const cancelSessionIndex = vi.fn().mockResolvedValue(true);
    installWindowMocks({
      api: {
        agent: {
          getSessionIndexState: vi.fn().mockResolvedValue(state(false)),
          setSessionIndexEnabled,
          refreshSessionIndex,
          cancelSessionIndex,
          onSessionIndexProgress: vi.fn((listener) => {
            progressListener = listener;
            return unsubscribe;
          }),
        },
      },
    });
    const { result, unmount } = renderHook(() =>
      useAgentSessionIndex("claude"),
    );
    await waitFor(() => expect(result.current.state.supported).toBe(true));

    await expect(result.current.cancel()).resolves.toBe(false);
    let enabling!: Promise<AgentSessionIndexPublicState>;
    act(() => {
      enabling = result.current.setEnabled(true);
    });
    await waitFor(() => expect(refreshSessionIndex).toHaveBeenCalledOnce());
    const request = refreshSessionIndex.mock.calls[0][0];

    await act(async () => {
      await result.current.setEnabled(false);
      await result.current.refresh();
    });
    expect(setSessionIndexEnabled).toHaveBeenCalledTimes(1);
    progressListener?.({
      agentId: "gemini",
      requestId: request.requestId,
      processed: 1,
      total: 3,
    });
    progressListener?.({
      agentId: "claude",
      requestId: "another-request",
      processed: 1,
      total: 3,
    });
    expect(result.current.progress?.processed).toBe(0);
    act(() => {
      progressListener?.({
        agentId: "claude",
        requestId: request.requestId,
        processed: 2,
        total: 3,
      });
    });
    expect(result.current.progress?.processed).toBe(2);
    await expect(result.current.cancel()).resolves.toBe(true);
    expect(cancelSessionIndex).toHaveBeenCalledWith({
      requestId: request.requestId,
    });

    await act(async () => {
      refresh.resolve(state(true));
      await enabling;
    });
    expect(result.current.state.enabled).toBe(true);
    expect(result.current.revision).toBe(2);

    await act(async () => {
      await result.current.setEnabled(false);
    });
    expect(result.current.state.enabled).toBe(false);
    expect(refreshSessionIndex).toHaveBeenCalledTimes(1);
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("does not publish a redundant unsupported state snapshot", async () => {
    const getSessionIndexState = vi.fn().mockResolvedValue({
      supported: false,
      enabled: false,
      lastStatus: null,
      lastScannedAt: null,
      lastErrorCode: null,
    });
    installWindowMocks({
      api: { agent: { getSessionIndexState } },
    });

    const { result } = renderHook(() => useAgentSessionIndex("custom-agent"));
    await waitFor(() => expect(getSessionIndexState).toHaveBeenCalledOnce());
    expect(result.current.state.supported).toBe(false);
  });

  it("blocks toggles while a direct refresh is active", async () => {
    const refresh = deferred<AgentSessionIndexPublicState>();
    const setSessionIndexEnabled = vi.fn();
    installWindowMocks({
      api: {
        agent: {
          getSessionIndexState: vi.fn().mockResolvedValue(state(true)),
          setSessionIndexEnabled,
          refreshSessionIndex: vi.fn<
            typeof window.api.agent.refreshSessionIndex
          >(() => refresh.promise),
        },
      },
    });
    const { result } = renderHook(() => useAgentSessionIndex("claude"));
    await waitFor(() => expect(result.current.state.enabled).toBe(true));

    let refreshing!: Promise<void>;
    act(() => {
      refreshing = result.current.refresh();
    });
    await waitFor(() => expect(result.current.isIndexing).toBe(true));
    await act(async () => {
      await result.current.setEnabled(false);
    });
    expect(setSessionIndexEnabled).not.toHaveBeenCalled();

    await act(async () => {
      refresh.resolve(state(true));
      await refreshing;
    });
  });

  it("reports current state, refresh, and toggle failures", async () => {
    const getSessionIndexState = vi
      .fn()
      .mockRejectedValueOnce(new Error("state"))
      .mockResolvedValueOnce(state(false));
    const refreshSessionIndex = vi
      .fn()
      .mockRejectedValueOnce(new Error("refresh"));
    const setSessionIndexEnabled = vi
      .fn()
      .mockRejectedValueOnce(new Error("toggle"));
    installWindowMocks({
      api: {
        agent: {
          getSessionIndexState,
          refreshSessionIndex,
          setSessionIndexEnabled,
        },
      },
    });
    const { result, rerender } = renderHook(
      ({ agentId }) => useAgentSessionIndex(agentId),
      { initialProps: { agentId: "claude" } },
    );
    await waitFor(() => expect(result.current.error).toBe("state"));

    rerender({ agentId: "gemini" });
    await waitFor(() => expect(result.current.state.supported).toBe(true));
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.error).toBe("refresh");
    await act(async () => {
      await result.current.setEnabled(true);
    });
    expect(result.current.error).toBe("toggle");
  });

  it("ignores late state and operations after the selected Agent changes", async () => {
    const initialState = deferred<AgentSessionIndexPublicState>();
    const lateRefresh = deferred<AgentSessionIndexPublicState>();
    const lateToggle = deferred<AgentSessionIndexPublicState>();
    const getSessionIndexState = vi
      .fn()
      .mockReturnValueOnce(initialState.promise)
      .mockResolvedValue(state(false));
    const cancelSessionIndex = vi.fn().mockResolvedValue(true);
    const refreshSessionIndex = vi.fn<
      typeof window.api.agent.refreshSessionIndex
    >(() => lateRefresh.promise);
    installWindowMocks({
      api: {
        agent: {
          getSessionIndexState,
          refreshSessionIndex,
          setSessionIndexEnabled: vi.fn(() => lateToggle.promise),
          cancelSessionIndex,
        },
      },
    });
    const { result, rerender } = renderHook(
      ({ agentId }) => useAgentSessionIndex(agentId),
      { initialProps: { agentId: "claude" } },
    );
    rerender({ agentId: "gemini" });
    initialState.resolve(state(true));
    await waitFor(() => expect(result.current.state.enabled).toBe(false));

    let refreshing!: Promise<void>;
    act(() => {
      refreshing = result.current.refresh();
    });
    await waitFor(() => expect(result.current.isIndexing).toBe(true));
    const refreshRequest = refreshSessionIndex.mock.calls.at(-1)?.[0];
    rerender({ agentId: "codex" });
    await waitFor(() =>
      expect(cancelSessionIndex).toHaveBeenCalledWith({
        requestId: refreshRequest?.requestId,
      }),
    );
    await act(async () => {
      lateRefresh.reject(new Error("late refresh"));
      await refreshing;
    });
    expect(result.current.error).not.toBe("refresh");

    let toggling!: Promise<AgentSessionIndexPublicState>;
    act(() => {
      toggling = result.current.setEnabled(true);
    });
    rerender({ agentId: "grok" });
    await act(async () => {
      lateToggle.resolve(state(true));
      await toggling;
    });
    expect(result.current.state.enabled).toBe(false);
  });
});
