import { act, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AgentSessionIndexPublicState,
  AgentSessionListResult,
  AgentSessionMetadata,
  ManagedAgentSummary,
} from "@prompthub/shared/types";
import { AgentSessionsPanel } from "../../../src/renderer/components/agent/AgentSessionsPanel";
import { ToastProvider } from "../../../src/renderer/components/ui/Toast";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";
import { sessionPanelAgent } from "../../helpers/agent-sessions";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const agent: ManagedAgentSummary = {
  ...sessionPanelAgent,
  id: "gemini",
  name: "Gemini",
  icon: "gemini",
  isCustom: false,
  isConfigured: true,
  isDetected: true,
  isPinned: false,
  launchable: true,
  status: "installed",
  paths: { ...sessionPanelAgent.paths, root: "/Users/test/.gemini" },
};

const warmedState = (): AgentSessionIndexPublicState => ({
  supported: true,
  enabled: true,
  lastStatus: "ok",
  lastScannedAt: Date.now(),
  lastErrorCode: null,
});

const cachedSession: AgentSessionMetadata = {
  id: "session-1",
  title: "Cached Gemini session",
  projectLabel: "PromptHub",
  projectPath: "/workspace/PromptHub",
  createdAt: 1,
  updatedAt: 1,
  model: null,
  messageCount: 1,
  sourcePath: "/Users/test/.gemini/tmp/project/chats/session-1.json",
  resume: null,
};

describe("Agent session index cache orchestration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useSettingsStore.getState().setLocalSessionIndexEnabled(true);
  });

  it("settles the first session list before starting automatic index warmup", async () => {
    const initialList = deferred<AgentSessionListResult>();
    const warmup = deferred<AgentSessionIndexPublicState>();
    const listSessions = vi.fn(() => initialList.promise);
    const setSessionIndexEnabled = vi.fn().mockResolvedValue({
      supported: true,
      enabled: true,
      lastStatus: "idle",
      lastScannedAt: null,
      lastErrorCode: null,
    });
    const refreshSessionIndex = vi.fn(() => warmup.promise);
    installWindowMocks({
      api: {
        agent: {
          getSessionIndexState: vi.fn().mockResolvedValue({
            supported: true,
            enabled: false,
            lastStatus: null,
            lastScannedAt: null,
            lastErrorCode: null,
          }),
          setSessionIndexEnabled,
          refreshSessionIndex,
          listSessions,
        },
      },
    });

    const view = await renderWithI18n(
      <ToastProvider>
        <AgentSessionsPanel agent={agent} />
      </ToastProvider>,
      { language: "en", settleAsyncEffects: true },
    );
    await act(async () => Promise.resolve());
    expect(setSessionIndexEnabled).not.toHaveBeenCalled();
    expect(refreshSessionIndex).not.toHaveBeenCalled();

    await act(async () => {
      initialList.resolve({
        agentId: "gemini",
        adapter: "gemini-json-v1",
        sessions: [],
        total: 0,
        hasMore: false,
      });
    });
    await waitFor(() => expect(refreshSessionIndex).toHaveBeenCalledOnce());
    await act(async () => warmup.resolve(warmedState()));
    await waitFor(() => expect(listSessions).toHaveBeenCalledTimes(2));
    view.unmount();
  });

  it("keeps loaded session rows visible while a refreshed index is applied", async () => {
    const warmup = deferred<AgentSessionIndexPublicState>();
    const refreshedList = deferred<AgentSessionListResult>();
    const listConversationMetadata = vi.fn().mockResolvedValue([]);
    const listSessions = vi
      .fn()
      .mockResolvedValueOnce({
        agentId: "gemini",
        adapter: "gemini-json-v1",
        sessions: [cachedSession],
        total: 1,
        hasMore: false,
      })
      .mockImplementationOnce(() => refreshedList.promise);
    installWindowMocks({
      api: {
        agent: {
          getSessionIndexState: vi.fn().mockResolvedValue({
            supported: true,
            enabled: true,
            lastStatus: "ok",
            lastScannedAt: 1,
            lastErrorCode: null,
          }),
          refreshSessionIndex: vi.fn(() => warmup.promise),
          listSessions,
          listConversationMetadata,
          readSession: vi.fn().mockResolvedValue({
            agentId: "gemini",
            adapter: "gemini-json-v1",
            sessionId: cachedSession.id,
            entries: [],
            parseErrors: 0,
            truncated: false,
          }),
        },
      },
    });

    const view = await renderWithI18n(
      <ToastProvider>
        <AgentSessionsPanel agent={agent} />
      </ToastProvider>,
      { language: "en", settleAsyncEffects: true },
    );
    expect(await screen.findByText(cachedSession.title)).toBeVisible();
    expect(listConversationMetadata).toHaveBeenCalledWith("gemini", [
      cachedSession.id,
    ]);
    await act(async () => warmup.resolve(warmedState()));
    await waitFor(() => expect(listSessions).toHaveBeenCalledTimes(2));

    expect(screen.getByText(cachedSession.title)).toBeVisible();
    expect(screen.queryByText("Loading sessions...")).not.toBeInTheDocument();

    await act(async () => {
      refreshedList.resolve({
        agentId: "gemini",
        adapter: "gemini-json-v1",
        sessions: [cachedSession],
        total: 1,
        hasMore: false,
      });
    });
    view.unmount();
  });
});
