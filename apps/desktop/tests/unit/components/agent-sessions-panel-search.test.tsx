import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AgentSessionsPanel } from "../../../src/renderer/components/agent/AgentSessionsPanel";
import { ToastProvider } from "../../../src/renderer/components/ui/Toast";
import { copyTextToClipboard } from "../../../src/renderer/utils/clipboard";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";
import {
  sessionPanelAgent as agent,
  sessionMetadata as metadata,
} from "../../helpers/agent-sessions";

vi.mock("../../../src/renderer/utils/clipboard", () => ({
  copyTextToClipboard: vi.fn().mockResolvedValue(undefined),
}));

describe("AgentSessionsPanel search", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.mocked(copyTextToClipboard).mockClear();
    useSettingsStore.getState().setLocalSessionIndexEnabled(true);
  });

  it("submits search only on Enter and reuses the submitted query for pagination", async () => {
    const listSessions = vi.fn(
      async (
        _agentId: string,
        _limit: number,
        offset: number,
        search?: string,
      ) => {
        if (search === "review") {
          return {
            agentId: "gemini",
            adapter: "gemini-json-v1",
            sessions: [
              {
                ...metadata(offset === 0 ? 7 : 57),
                title: offset === 0 ? "Review plan" : "Review follow-up",
              },
            ],
            total: 51,
            hasMore: offset === 0,
          };
        }
        return {
          agentId: "gemini",
          adapter: "gemini-json-v1",
          sessions: [metadata(0)],
          total: 1,
          hasMore: false,
        };
      },
    );
    installWindowMocks({
      api: {
        agent: {
          listConversationMetadata: vi.fn().mockResolvedValue([]),
          listSessions,
          readSession: vi.fn().mockResolvedValue({
            agentId: "gemini",
            adapter: "gemini-json-v1",
            sessionId: "session-7",
            entries: [],
            parseErrors: 0,
            truncated: false,
          }),
        },
      },
    });

    await renderWithI18n(
      <ToastProvider>
        <AgentSessionsPanel
          agent={{ ...agent, id: "gemini", name: "Gemini CLI" }}
        />
      </ToastProvider>,
      { language: "en", settleAsyncEffects: true },
    );
    const search = await screen.findByRole("textbox", {
      name: "Search titles or projects",
    });
    const callsBeforeTyping = listSessions.mock.calls.length;

    vi.useFakeTimers();
    fireEvent.change(search, { target: { value: "review" } });
    fireEvent.keyDown(search, { key: "Enter", isComposing: true });
    try {
      await act(async () => vi.advanceTimersByTimeAsync(300));
      expect(listSessions).toHaveBeenCalledTimes(callsBeforeTyping);
      expect(screen.getByRole("button", { name: /Session 0/ })).toBeVisible();
    } finally {
      vi.useRealTimers();
    }

    fireEvent.keyDown(search, { key: "Enter" });
    await waitFor(() =>
      expect(listSessions).toHaveBeenLastCalledWith("gemini", 50, 0, "review"),
    );
    expect(
      await screen.findByRole("button", { name: /Review plan/ }),
    ).toBeVisible();

    const submittedInput = screen.getByRole("textbox", {
      name: "Search titles or projects",
    });
    fireEvent.change(submittedInput, { target: { value: "ignored draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Load more sessions" }));
    await waitFor(() =>
      expect(listSessions).toHaveBeenLastCalledWith("gemini", 50, 50, "review"),
    );
    expect(await screen.findByText("Review follow-up")).toBeVisible();

    fireEvent.change(submittedInput, { target: { value: "" } });
    fireEvent.keyDown(submittedInput, { key: "Enter" });
    await waitFor(() =>
      expect(listSessions).toHaveBeenLastCalledWith("gemini", 50, 0),
    );
    expect(
      await screen.findByRole("button", { name: /Session 0/ }),
    ).toBeVisible();
  });

  it("matches only effective titles and project identity", async () => {
    const session = {
      ...metadata(1),
      title: "Quarterly planning",
      model: "private-model",
    };
    const listSessions = vi.fn(async () => ({
      agentId: "copilot",
      adapter: "copilot-session-store-v1",
      sessions: [session],
      total: 1,
      hasMore: false,
    }));
    installWindowMocks({
      api: {
        agent: {
          listSessions,
          listConversationMetadata: vi.fn().mockResolvedValue([
            {
              agentId: "copilot",
              sessionId: "session-1",
              title: "Release review",
              note: "private note",
              tags: ["private-tag"],
              projectId: null,
              projectPath: "/workspace/PromptHub",
              archivedAt: null,
            },
          ]),
          readSession: vi.fn().mockResolvedValue({
            agentId: "copilot",
            adapter: "copilot-session-store-v1",
            sessionId: "session-1",
            entries: [],
            parseErrors: 0,
            truncated: false,
          }),
        },
      },
    });

    await renderWithI18n(
      <ToastProvider>
        <AgentSessionsPanel
          agent={{ ...agent, id: "copilot", name: "GitHub Copilot" }}
        />
      </ToastProvider>,
      { language: "en", settleAsyncEffects: true },
    );
    const search = await screen.findByRole("textbox", {
      name: "Search titles or projects",
    });

    fireEvent.change(search, { target: { value: "private" } });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(await screen.findByText("No sessions found.")).toBeVisible();

    const titleSearch = screen.getByRole("textbox", {
      name: "Search titles or projects",
    });
    fireEvent.change(titleSearch, { target: { value: "release review" } });
    fireEvent.keyDown(titleSearch, { key: "Enter" });
    expect(
      await screen.findByRole("button", { name: /Release review/ }),
    ).toBeVisible();

    const projectSearch = screen.getByRole("textbox", {
      name: "Search titles or projects",
    });
    fireEvent.change(projectSearch, {
      target: { value: "/workspace/prompthub" },
    });
    fireEvent.keyDown(projectSearch, { key: "Enter" });
    expect(
      await screen.findByRole("button", { name: /Release review/ }),
    ).toBeVisible();
  });
});
