import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AgentSessionsPanel } from "../../../src/renderer/components/agent/AgentSessionsPanel";
import { ToastProvider } from "../../../src/renderer/components/ui/Toast";
import { copyTextToClipboard } from "../../../src/renderer/utils/clipboard";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import type {
  AgentSessionListResult,
  AgentSessionMetadata,
  ManagedAgentSummary,
} from "@prompthub/shared/types";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";
import {
  sessionPanelAgent as agent,
  sessionMetadata as metadata,
  sessionEntry as entry,
} from "../../helpers/agent-sessions";

vi.mock("../../../src/renderer/utils/clipboard", () => ({
  copyTextToClipboard: vi.fn().mockResolvedValue(undefined),
}));

describe("AgentSessionsPanel", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.mocked(copyTextToClipboard).mockClear();
    useSettingsStore.getState().setLocalSessionIndexEnabled(true);
  });

  it("provides fast transcript pagination", async () => {
    const allSessions = [metadata(0)];
    const listSessions = vi.fn(
      async (_agentId: string, limit: number, offset = 0) => ({
        agentId: "codex",
        adapter: "codex-rollout-jsonl-v1",
        sessions: allSessions.slice(offset, offset + limit),
        total: allSessions.length,
        hasMore: offset + limit < allSessions.length,
      }),
    );
    const readSession = vi.fn(
      async (
        _agentId: string,
        _sessionId: string,
        options?: { cursor?: string },
      ) => ({
        agentId: "codex",
        adapter: "codex-rollout-jsonl-v1",
        sessionId: "session-0",
        entries: options?.cursor
          ? Array.from({ length: 40 }, (_, index) => entry(index + 80))
          : Array.from({ length: 80 }, (_, index) => entry(index)),
        parseErrors: 0,
        truncated: !options?.cursor,
        nextCursor: options?.cursor ? null : "cursor-page-2",
      }),
    );
    installWindowMocks({
      api: {
        agent: {
          listConversationMetadata: vi.fn().mockResolvedValue([]),
          listSessions,
          readSession,
        },
      },
    });

    await renderWithI18n(
      <ToastProvider>
        <AgentSessionsPanel agent={agent} />
      </ToastProvider>,
      {
        language: "en",
        settleAsyncEffects: true,
      },
    );

    expect(
      await screen.findByRole("button", { name: /Session 0/ }),
    ).toBeVisible();
    expect(listSessions).toHaveBeenNthCalledWith(1, "codex", 50, 0);
    expect(screen.getByText("1 / 1")).toBeVisible();
    expect(await screen.findByText("Message 19")).toBeVisible();
    expect(screen.queryByText("Message 20")).not.toBeInTheDocument();
    expect(
      screen.getByTestId("conversation-transcript-pagination"),
    ).toHaveTextContent("Page 1 of 4+");
    expect(
      screen.getByRole("button", { name: "First message page" }),
    ).toBeDisabled();
    expect(screen.queryByText(/bounded preview/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Session 0/ })).toHaveStyle({
      contentVisibility: "auto",
    });
    const selectedSessionButton = screen.getByRole("button", {
      name: /Session 0/,
    });
    expect(selectedSessionButton).toHaveClass("text-foreground");
    expect(selectedSessionButton).not.toHaveClass(
      "bg-primary",
      "text-primary-foreground",
    );

    fireEvent.click(screen.getByRole("button", { name: "Message page 4" }));
    expect(await screen.findByText("Message 79")).toBeVisible();
    expect(screen.queryByText("Message 59")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next message page" }));
    expect(await screen.findByText("Message 99")).toBeVisible();
    expect(screen.queryByText("Message 100")).not.toBeInTheDocument();
    expect(readSession).toHaveBeenLastCalledWith("codex", "session-0", {
      cursor: "cursor-page-2",
      limit: 80,
    });

    fireEvent.click(screen.getByRole("button", { name: "Message page 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Latest messages" }));
    expect(await screen.findByText("Message 119")).toBeVisible();
    expect(screen.getByText("Page 6 of 6")).toBeInTheDocument();

    const readsBeforeFirstPage = readSession.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "First message page" }));
    expect(await screen.findByText("Message 19")).toBeVisible();
    expect(readSession).toHaveBeenCalledTimes(readsBeforeFirstPage);
    expect(
      screen.getByRole("button", { name: "First message page" }),
    ).toBeDisabled();

    expect(listSessions).toHaveBeenCalledTimes(1);
  });

  it("pages session metadata", async () => {
    const allSessions = Array.from({ length: 120 }, (_, index) =>
      metadata(index),
    );
    const listSessions = vi.fn(
      async (_agentId: string, limit: number, offset = 0) => ({
        agentId: "codex",
        adapter: "codex-rollout-jsonl-v1",
        sessions: allSessions.slice(offset, offset + limit),
        total: allSessions.length,
        hasMore: offset + limit < allSessions.length,
      }),
    );
    installWindowMocks({
      api: {
        agent: {
          listConversationMetadata: vi.fn().mockResolvedValue([]),
          listSessions,
          readSession: vi.fn().mockResolvedValue({
            agentId: "codex",
            adapter: "codex-rollout-jsonl-v1",
            sessionId: "session-0",
            entries: [],
            parseErrors: 0,
            truncated: false,
            nextCursor: null,
          }),
        },
      },
    });

    await renderWithI18n(
      <ToastProvider>
        <AgentSessionsPanel agent={agent} />
      </ToastProvider>,
      {
        language: "en",
        settleAsyncEffects: true,
      },
    );

    expect(
      await screen.findByRole("button", { name: /Session 0/ }),
    ).toBeVisible();
    expect(listSessions).toHaveBeenNthCalledWith(1, "codex", 50, 0);
    expect(screen.getByText("50 / 120")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Load more sessions" }));
    await waitFor(() =>
      expect(listSessions).toHaveBeenNthCalledWith(2, "codex", 50, 50),
    );
    expect(await screen.findByText("Session 99")).toBeVisible();
    expect(screen.getByText("100 / 120")).toBeVisible();
    expect(
      screen
        .getByRole("button", { name: /Session 99/ })
        .compareDocumentPosition(
          screen.getByRole("button", { name: /Session 49/ }),
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("sorts loaded conversations by time or size and keeps unknown sizes last", async () => {
    const sessions = [
      {
        ...metadata(1),
        title: "Old conversation",
        createdAt: 100,
        updatedAt: 100,
        sizeBytes: 1024,
        nativeDeleteSupported: true,
      },
      {
        ...metadata(2),
        title: "Newest conversation",
        createdAt: 300,
        updatedAt: 300,
        sizeBytes: 4096,
      },
      {
        ...metadata(3),
        title: "Unknown-size conversation",
        createdAt: 200,
        updatedAt: 200,
        sizeBytes: null,
      },
    ];
    installWindowMocks({
      api: {
        agent: {
          listSessions: vi.fn().mockResolvedValue({
            agentId: "codex",
            adapter: "codex-rollout-jsonl-v1",
            sessions,
            total: sessions.length,
            hasMore: false,
          }),
          readSession: vi.fn().mockResolvedValue({
            agentId: "codex",
            adapter: "codex-rollout-jsonl-v1",
            sessionId: sessions[0].id,
            entries: [],
            parseErrors: 0,
            truncated: false,
          }),
          resumeConversation: vi.fn(),
          listConversationMetadata: vi.fn().mockResolvedValue([
            {
              id: "metadata-1",
              agentId: "codex",
              sessionId: sessions[0].id,
              title: "PromptHub renamed conversation",
              projectId: null,
              projectPath: sessions[0].projectPath,
              tags: [],
              note: null,
              favorite: false,
              archivedAt: null,
              createdAt: 100,
              updatedAt: 150,
            },
          ]),
        },
      },
    });

    await renderWithI18n(
      <ToastProvider>
        <AgentSessionsPanel agent={agent} />
      </ToastProvider>,
      {
        language: "en",
        settleAsyncEffects: true,
      },
    );

    const rowOrder = () => {
      const row = screen.getByRole("button", {
        name: /Newest conversation/,
      });
      return Array.from(row.parentElement?.children || [])
        .filter((element) => element.tagName === "BUTTON")
        .map((element) => element.textContent || "");
    };

    await screen.findByRole("button", {
      name: /PromptHub renamed conversation/,
    });
    expect(screen.queryByLabelText("Removed")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "More conversation actions" }),
    );
    expect(
      screen.getByRole("menuitem", { name: "Delete permanently" }),
    ).toBeVisible();
    expect(screen.queryByRole("menuitem", { name: "Restore" })).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "More conversation actions" }),
    );
    expect(rowOrder()).toEqual([
      expect.stringContaining("Newest conversation"),
      expect.stringContaining("Unknown-size conversation"),
      expect.stringContaining("PromptHub renamed conversation"),
    ]);

    fireEvent.click(screen.getByLabelText("Sort conversations"));
    fireEvent.click(screen.getByRole("option", { name: "Largest first" }));
    expect(rowOrder()).toEqual([
      expect.stringContaining("Newest conversation"),
      expect.stringContaining("PromptHub renamed conversation"),
      expect.stringContaining("Unknown-size conversation"),
    ]);

    fireEvent.click(screen.getByLabelText("Sort conversations"));
    fireEvent.click(screen.getByRole("option", { name: "Smallest first" }));
    expect(rowOrder()).toEqual([
      expect.stringContaining("PromptHub renamed conversation"),
      expect.stringContaining("Newest conversation"),
      expect.stringContaining("Unknown-size conversation"),
    ]);

    fireEvent.click(screen.getByLabelText("Sort conversations"));
    fireEvent.click(screen.getByRole("option", { name: "Oldest first" }));
    expect(rowOrder()).toEqual([
      expect.stringContaining("PromptHub renamed conversation"),
      expect.stringContaining("Unknown-size conversation"),
      expect.stringContaining("Newest conversation"),
    ]);
  });

  it("jumps to the latest loaded transcript page across duplicate cursor pages", async () => {
    const firstPageEntries = Array.from({ length: 80 }, (_, index) =>
      entry(index),
    );
    const finalPageEntries = Array.from({ length: 20 }, (_, index) => ({
      ...entry(index + 80),
      role: "assistant" as const,
    }));
    const readSession = vi.fn(
      async (
        _agentId: string,
        _sessionId: string,
        options?: { cursor?: string },
      ) => {
        if (!options?.cursor) {
          return {
            agentId: "codex",
            adapter: "codex-rollout-jsonl-v1",
            sessionId: "session-0",
            entries: firstPageEntries,
            parseErrors: 0,
            truncated: false,
            nextCursor: "duplicate-page",
          };
        }
        if (options.cursor === "duplicate-page") {
          return {
            agentId: "codex",
            adapter: "codex-rollout-jsonl-v1",
            sessionId: "session-0",
            entries: firstPageEntries,
            parseErrors: 0,
            truncated: false,
            nextCursor: "final-page",
          };
        }
        return {
          agentId: "codex",
          adapter: "codex-rollout-jsonl-v1",
          sessionId: "session-0",
          entries: finalPageEntries,
          parseErrors: 0,
          truncated: false,
          nextCursor: null,
        };
      },
    );
    installWindowMocks({
      api: {
        agent: {
          listConversationMetadata: vi.fn().mockResolvedValue([]),
          listSessions: vi.fn().mockResolvedValue({
            agentId: "codex",
            adapter: "codex-rollout-jsonl-v1",
            sessions: [metadata(0)],
            total: 1,
            hasMore: false,
          }),
          readSession,
        },
      },
    });

    await renderWithI18n(
      <ToastProvider>
        <AgentSessionsPanel agent={agent} />
      </ToastProvider>,
      {
        language: "en",
        settleAsyncEffects: true,
      },
    );

    await screen.findByText("Message 0");
    fireEvent.click(screen.getByRole("button", { name: "Latest messages" }));

    await waitFor(() => {
      expect(readSession).toHaveBeenCalledWith("codex", "session-0", {
        cursor: "duplicate-page",
        limit: 80,
      });
      expect(readSession).toHaveBeenCalledWith("codex", "session-0", {
        cursor: "final-page",
        limit: 80,
      });
      expect(screen.getByTestId("conversation-transcript")).toHaveTextContent(
        "Message 99",
      );
      expect(screen.getByText("Page 5 of 5")).toBeInTheDocument();
    });
  });

  it("clamps pagination when a native cursor stops advancing", async () => {
    const firstPageEntries = Array.from({ length: 80 }, (_, index) =>
      entry(index),
    );
    const readSession = vi.fn(
      async (
        _agentId: string,
        _sessionId: string,
        _options?: { cursor?: string },
      ) => ({
        agentId: "codex",
        adapter: "codex-rollout-jsonl-v1",
        sessionId: "session-0",
        entries: firstPageEntries,
        parseErrors: 0,
        truncated: false,
        nextCursor: "stuck-page",
      }),
    );
    installWindowMocks({
      api: {
        agent: {
          listConversationMetadata: vi.fn().mockResolvedValue([]),
          listSessions: vi.fn().mockResolvedValue({
            agentId: "codex",
            adapter: "codex-rollout-jsonl-v1",
            sessions: [metadata(0)],
            total: 1,
            hasMore: false,
          }),
          readSession,
        },
      },
    });

    await renderWithI18n(
      <ToastProvider>
        <AgentSessionsPanel agent={agent} />
      </ToastProvider>,
      {
        language: "en",
        settleAsyncEffects: true,
      },
    );

    await screen.findByText("Message 0");
    fireEvent.click(screen.getByRole("button", { name: "Message page 4" }));
    await screen.findByText("Message 79");
    fireEvent.click(screen.getByRole("button", { name: "Next message page" }));

    await waitFor(() => {
      expect(readSession).toHaveBeenCalledTimes(2);
      expect(screen.getByText("Page 4 of 4")).toBeInTheDocument();
      expect(screen.getByTestId("conversation-transcript")).toHaveTextContent(
        "Message 79",
      );
    });
  });

  it("resumes natively, previews cross-Agent continuation, and exports history", async () => {
    const session = {
      ...metadata(1),
      resume: {
        executable: "codex",
        args: ["resume", "session-1"],
        cwd: "/workspace/PromptHub",
      },
    };
    const resumeConversation = vi.fn().mockResolvedValue({
      status: "launched",
      mode: "native-resume",
    });
    const handoffPreview = {
      sourceAgentId: "codex",
      sourceSessionId: "session-1",
      sourceTitle: "Session 1",
      targetAgentId: "claude",
      projectId: "project-1",
      projectPath: "/workspace/PromptHub",
      previewToken: "00000000-0000-4000-8000-000000000001",
      payload: "# Portable handoff\n\nContinue the updater fix.",
      payloadDigest: `sha256:${"a".repeat(64)}`,
      transport: "direct",
      cliCommand:
        "cd '/workspace/PromptHub' && claude '# Portable handoff\n\nContinue the updater fix.'",
    };
    const previewConversationHandoff = vi
      .fn()
      .mockResolvedValue(handoffPreview);
    const continueConversationInAgent = vi.fn().mockResolvedValue({
      status: "launched",
      mode: "cross-agent",
    });
    const exportConversation = vi.fn().mockResolvedValue({
      canceled: false,
      filePath: "/tmp/session.md",
    });
    installWindowMocks({
      api: {
        agent: {
          listSessions: vi.fn().mockResolvedValue({
            agentId: "codex",
            adapter: "codex-rollout-jsonl-v1",
            sessions: [session],
            total: 1,
            hasMore: false,
          }),
          readSession: vi.fn().mockResolvedValue({
            agentId: "codex",
            adapter: "codex-rollout-jsonl-v1",
            sessionId: "session-1",
            entries: [
              entry(0),
              entry(1),
              { ...entry(2), role: "system", text: "System context" },
              { ...entry(3), role: "tool", text: "Tool result" },
            ],
            parseErrors: 0,
            truncated: false,
          }),
          listConversationMetadata: vi.fn().mockResolvedValue([]),
          resumeConversation,
          previewConversationHandoff,
          continueConversationInAgent,
          exportConversation,
        },
      },
    });
    const claude = {
      ...agent,
      id: "claude",
      name: "Claude Code",
    } as ManagedAgentSummary;
    const antigravity = {
      ...agent,
      id: "antigravity",
      name: "Antigravity",
      launchable: true,
    } as ManagedAgentSummary;
    const copilot = {
      ...agent,
      id: "copilot",
      name: "GitHub Copilot",
      launchable: false,
    } as ManagedAgentSummary;

    await renderWithI18n(
      <ToastProvider>
        <AgentSessionsPanel
          agent={agent}
          agents={[agent, claude, antigravity, copilot]}
          projects={[
            {
              id: "project-1",
              name: "PromptHub",
              rootPath: "/workspace/PromptHub",
              scanPaths: [],
              createdAt: 1,
              updatedAt: 1,
            },
          ]}
        />
      </ToastProvider>,
      { language: "en", settleAsyncEffects: true },
    );

    expect(screen.getByLabelText("Filter by project")).toHaveAttribute(
      "aria-haspopup",
      "listbox",
    );
    expect(screen.getByLabelText("Sort conversations")).toHaveAttribute(
      "aria-haspopup",
      "listbox",
    );
    expect(
      document.querySelector('select[aria-label="Filter by project"]'),
    ).toBeNull();
    expect(
      document.querySelector('select[aria-label="Sort conversations"]'),
    ).toBeNull();
    const primaryActions = screen.getByTestId("conversation-primary-actions");
    expect(primaryActions.querySelectorAll("button")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Continue in ChatGPT" }),
    ).toHaveClass("h-9", "bg-primary");
    expect(
      screen
        .getByRole("button", { name: "Continue in ChatGPT" })
        .querySelector(".lucide-square-terminal"),
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Continue elsewhere" }),
    ).toHaveClass("h-9");
    expect(
      screen.getByRole("button", { name: "Export conversation" }),
    ).toHaveClass("h-9", "w-9");
    const toolbar = screen.getByTestId("conversation-continuation-toolbar");
    expect(toolbar).not.toHaveClass("rounded-xl", "border");
    expect(
      screen.queryByLabelText("Continue with Agent"),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByTestId("conversation-message-entry-0"),
    ).toHaveClass("flex", "flex-row-reverse");
    expect(screen.getByTestId("conversation-transcript")).toHaveClass(
      "space-y-2.5",
      "py-4",
    );
    expect(screen.queryByText("/workspace/PromptHub")).not.toBeInTheDocument();
    expect(screen.getByTestId("conversation-avatar-entry-0")).toHaveClass(
      "rounded-full",
    );
    expect(screen.getByTestId("conversation-bubble-entry-0")).toHaveClass(
      "rounded-2xl",
      "bg-primary",
    );
    expect(
      screen
        .getByTestId("conversation-bubble-entry-0")
        .querySelector(".agent-conversation-markdown"),
    ).not.toHaveClass("mt-2");
    expect(screen.getByTestId("conversation-message-entry-1")).toHaveClass(
      "flex",
    );
    expect(screen.getByTestId("conversation-avatar-entry-1")).toHaveClass(
      "rounded-full",
    );
    expect(screen.getByTestId("conversation-bubble-entry-1")).toHaveClass(
      "rounded-2xl",
      "bg-white",
    );
    expect(screen.getByTestId("conversation-message-entry-2")).toHaveClass(
      "mx-auto",
      "rounded-2xl",
      "bg-white",
    );
    expect(
      screen.getByTestId("conversation-message-entry-2").querySelector(".mt-1"),
    ).toBeInTheDocument();
    expect(
      screen
        .getByTestId("conversation-message-entry-2")
        .querySelector(".agent-conversation-markdown"),
    ).not.toHaveClass("mt-2");
    expect(screen.getByTestId("conversation-message-entry-3")).toHaveClass(
      "flex",
      "items-start",
    );
    expect(screen.getByTestId("conversation-message-entry-3")).not.toHaveClass(
      "mx-auto",
    );
    expect(screen.getByTestId("conversation-avatar-entry-3")).toHaveClass(
      "rounded-full",
    );
    expect(screen.getByTestId("conversation-bubble-entry-3")).toHaveClass(
      "min-w-0",
      "max-w-[82%]",
      "bg-white",
    );
    expect(
      screen
        .getByTestId("conversation-bubble-entry-3")
        .querySelector(".agent-conversation-markdown"),
    ).not.toHaveClass("mt-2");

    fireEvent.click(
      await screen.findByRole("button", { name: "Continue in ChatGPT" }),
    );
    await waitFor(() =>
      expect(resumeConversation).toHaveBeenCalledWith({
        agentId: "codex",
        sessionId: "session-1",
      }),
    );
    expect(
      await screen.findByText("Opened ChatGPT in Terminal."),
    ).toBeVisible();
    expect(
      screen.getByText("Opened ChatGPT in Terminal.").closest("section"),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Continue elsewhere" }));
    expect(await screen.findByText("Continue in another Agent")).toBeVisible();
    fireEvent.click(screen.getByLabelText("Continue with Agent"));
    expect(
      screen.getByRole("option", { name: "Antigravity" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "GitHub Copilot" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "Claude Code" }));
    fireEvent.click(screen.getByLabelText("Project for continuation"));
    fireEvent.click(
      screen
        .getAllByRole("option", { name: "PromptHub" })
        .find(
          (option) =>
            option.tagName === "BUTTON" &&
            option.getAttribute("aria-selected") === "true",
        )!,
    );
    fireEvent.click(screen.getByRole("button", { name: "Preview handoff" }));
    expect(await screen.findByText("Review handoff context")).toBeVisible();
    expect(screen.getByText(/Continue the updater fix/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Copy CLI command" }));
    await waitFor(() =>
      expect(copyTextToClipboard).toHaveBeenCalledWith(
        "cd '/workspace/PromptHub' && claude '# Portable handoff\n\nContinue the updater fix.'",
      ),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Continue in Claude Code" }),
    );
    await waitFor(() =>
      expect(continueConversationInAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          targetAgentId: "claude",
          confirmedPayloadDigest: `sha256:${"a".repeat(64)}`,
        }),
      ),
    );
    expect(
      await screen.findByText("Started a new conversation in Claude Code."),
    ).toBeVisible();

    previewConversationHandoff.mockResolvedValueOnce({
      ...handoffPreview,
      targetAgentId: "antigravity",
      transport: "launch",
      cliCommand: null,
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue elsewhere" }));
    fireEvent.click(screen.getByLabelText("Continue with Agent"));
    fireEvent.click(screen.getByRole("option", { name: "Antigravity" }));
    fireEvent.click(screen.getByRole("button", { name: "Preview handoff" }));
    expect(
      await screen.findByText(
        "PromptHub will copy the handoff context and open Antigravity. Paste it to continue in the selected project.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Copy handoff context" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Copy context and open Antigravity" }),
    ).toBeEnabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Copy handoff context" }),
    );
    await waitFor(() =>
      expect(copyTextToClipboard).toHaveBeenLastCalledWith(
        handoffPreview.payload,
      ),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Copy context and open Antigravity" }),
    );
    await waitFor(() =>
      expect(continueConversationInAgent).toHaveBeenLastCalledWith(
        expect.objectContaining({ targetAgentId: "antigravity" }),
      ),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Export conversation" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Export Markdown" }));
    await waitFor(() =>
      expect(exportConversation).toHaveBeenCalledWith({
        agentId: "codex",
        sessionId: "session-1",
        format: "markdown",
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Export conversation" }),
      ).toBeEnabled(),
    );
    expect(await screen.findByText("Conversation exported.")).toBeVisible();
  });

  it("opens session actions on right click without exposing metadata editing", async () => {
    const targetAgent = {
      ...agent,
      id: "claude",
      name: "Claude Code",
    } as ManagedAgentSummary;
    const current = {
      ...metadata(2),
      sizeBytes: 1536,
      nativeDeleteSupported: true,
      sourcePath: "/Users/test/.codex/sessions/session-2.jsonl",
      resume: {
        executable: "codex",
        args: ["resume", "session-2"],
        cwd: "/workspace/PromptHub",
      },
    };
    const deleteConversation = vi.fn().mockResolvedValue({
      agentId: "codex",
      sessionId: current.id,
    });
    const resumeConversation = vi.fn().mockResolvedValue({
      status: "launched",
      mode: "native-resume",
    });
    const exportConversation = vi.fn().mockResolvedValue({
      canceled: false,
      filePath: "/tmp/session.json",
    });
    const openPath = vi.fn().mockResolvedValue({ success: true });
    installWindowMocks({
      api: {
        agent: {
          listSessions: vi.fn().mockResolvedValue({
            agentId: "codex",
            adapter: "codex-rollout-jsonl-v1",
            sessions: [current],
            total: 1,
            hasMore: false,
          }),
          readSession: vi.fn().mockResolvedValue({
            agentId: "codex",
            adapter: "codex-rollout-jsonl-v1",
            sessionId: current.id,
            entries: [],
            parseErrors: 0,
            truncated: false,
          }),
          listConversationMetadata: vi.fn().mockResolvedValue([]),
          resumeConversation,
          deleteConversation,
          exportConversation,
        },
      },
      electron: { openPath },
    });

    await renderWithI18n(
      <ToastProvider>
        <AgentSessionsPanel agent={agent} agents={[agent, targetAgent]} />
      </ToastProvider>,
      {
        language: "en",
        settleAsyncEffects: true,
      },
    );
    expect(
      await screen.findByRole("button", { name: /Session 2/ }),
    ).toHaveTextContent("1.5 KB");
    fireEvent.click(
      screen.getByRole("button", { name: "More conversation actions" }),
    );
    expect(
      screen.getByRole("menuitem", { name: "Show in folder" }),
    ).toBeVisible();
    expect(
      screen.getByRole("menuitem", { name: "Open project folder" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("menuitem", { name: "Show in folder" }));
    await waitFor(() =>
      expect(openPath).toHaveBeenLastCalledWith(current.sourcePath),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "More conversation actions" }),
    );
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Open project folder" }),
    );
    await waitFor(() =>
      expect(openPath).toHaveBeenLastCalledWith(current.projectPath),
    );

    const sessionRow = await screen.findByRole("button", { name: /Session 2/ });
    fireEvent.contextMenu(sessionRow, { clientX: 320, clientY: 240 });
    expect(
      screen.getByRole("menuitem", { name: "Continue in ChatGPT" }),
    ).toBeVisible();
    expect(
      screen.getByRole("menuitem", { name: "Continue elsewhere" }),
    ).toBeVisible();
    expect(
      screen.getByRole("menuitem", { name: "Export Markdown" }),
    ).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Export JSON" })).toBeVisible();
    expect(
      screen.getByRole("menuitem", { name: "Show in folder" }),
    ).toBeVisible();
    expect(
      screen.getByRole("menuitem", { name: "Open project folder" }),
    ).toBeVisible();
    expect(
      screen.getByRole("menuitem", { name: "Delete permanently" }),
    ).toBeVisible();
    expect(screen.queryByRole("menuitem", { name: "Edit details" })).toBeNull();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(
      screen.queryByRole("menu", { name: "Conversation actions" }),
    ).toBeNull();

    fireEvent.contextMenu(sessionRow, { clientX: 320, clientY: 240 });
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Continue elsewhere" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Continue in another Agent" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    fireEvent.contextMenu(sessionRow, { clientX: 320, clientY: 240 });
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Continue in ChatGPT" }),
    );
    await waitFor(() =>
      expect(resumeConversation).toHaveBeenCalledWith({
        agentId: "codex",
        sessionId: current.id,
      }),
    );

    fireEvent.contextMenu(sessionRow, { clientX: 320, clientY: 240 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Export JSON" }));
    await waitFor(() =>
      expect(exportConversation).toHaveBeenCalledWith({
        agentId: "codex",
        sessionId: current.id,
        format: "json",
      }),
    );

    fireEvent.contextMenu(sessionRow, { clientX: 320, clientY: 240 });
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Delete permanently" }),
    );
    expect(deleteConversation).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "This permanently deletes the native conversation data",
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(deleteConversation).not.toHaveBeenCalled();

    fireEvent.contextMenu(sessionRow, { clientX: 320, clientY: 240 });
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Delete permanently" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));
    await waitFor(() =>
      expect(deleteConversation).toHaveBeenCalledWith({
        agentId: "codex",
        sessionId: current.id,
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /Session 2/ }),
      ).not.toBeInTheDocument(),
    );
  });

  it("hides unsupported row context actions and closes on outside input", async () => {
    const current = metadata(3);
    const openPath = vi.fn().mockResolvedValue({
      success: false,
      error: "Project directory is unavailable",
    });
    installWindowMocks({
      api: {
        agent: {
          listConversationMetadata: vi.fn().mockResolvedValue([]),
          listSessions: vi.fn().mockResolvedValue({
            agentId: "codex",
            adapter: "codex-rollout-jsonl-v1",
            sessions: [current],
            total: 1,
            hasMore: false,
          }),
          readSession: vi.fn().mockResolvedValue({
            agentId: "codex",
            adapter: "codex-rollout-jsonl-v1",
            sessionId: current.id,
            entries: [],
            parseErrors: 0,
            truncated: false,
          }),
          resumeConversation: vi.fn(),
          exportConversation: vi.fn(),
        },
      },
      electron: { openPath },
    });

    await renderWithI18n(
      <ToastProvider>
        <AgentSessionsPanel agent={agent} />
      </ToastProvider>,
      {
        language: "en",
        settleAsyncEffects: true,
      },
    );
    const sessionRow = await screen.findByRole("button", { name: /Session 3/ });
    fireEvent.click(
      screen.getByRole("button", { name: "More conversation actions" }),
    );
    expect(
      screen.getByRole("menuitem", { name: "Show in folder" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("menuitem", { name: "Open project folder" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("menuitem", { name: "Delete permanently" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Open project folder" }),
    );
    await waitFor(() =>
      expect(openPath).toHaveBeenCalledWith(current.projectPath),
    );
    expect(
      await screen.findByText("Conversation action failed."),
    ).toBeVisible();

    fireEvent.contextMenu(sessionRow, { clientX: 8, clientY: 8 });
    expect(screen.getByRole("menuitem", { name: "Export JSON" })).toBeVisible();
    expect(
      screen.getByRole("menuitem", { name: "Show in folder" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("menuitem", { name: "Open project folder" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("menuitem", { name: "Continue in ChatGPT" }),
    ).toBeNull();
    expect(
      screen.queryByRole("menuitem", { name: "Continue elsewhere" }),
    ).toBeNull();
    expect(
      screen.queryByRole("menuitem", { name: "Delete permanently" }),
    ).toBeNull();

    fireEvent.pointerDown(document.body);
    expect(
      screen.queryByRole("menu", { name: "Conversation actions" }),
    ).toBeNull();
  });

  it("builds project filters from native session paths without registered projects", async () => {
    const sessions = [
      {
        ...metadata(0),
        projectLabel: "PromptHub",
        projectPath: "/work/a/PromptHub",
      },
      {
        ...metadata(1),
        projectLabel: "PromptHub",
        projectPath: "/work/b/PromptHub",
      },
    ];
    installWindowMocks({
      api: {
        agent: {
          listConversationMetadata: vi.fn().mockResolvedValue([]),
          listSessions: vi.fn().mockResolvedValue({
            agentId: "codex",
            adapter: "codex-rollout-jsonl-v1",
            sessions,
            total: sessions.length,
            hasMore: false,
          }),
          readSession: vi.fn().mockResolvedValue({
            agentId: "codex",
            adapter: "codex-rollout-jsonl-v1",
            sessionId: sessions[0].id,
            entries: [],
            parseErrors: 0,
            truncated: false,
          }),
        },
      },
    });

    await renderWithI18n(
      <ToastProvider>
        <AgentSessionsPanel agent={agent} />
      </ToastProvider>,
      {
        language: "en",
        settleAsyncEffects: true,
      },
    );
    fireEvent.click(screen.getByLabelText("Filter by project"));
    expect(
      await screen.findByRole("option", {
        name: "PromptHub · /work/a/PromptHub",
      }),
    ).toBeVisible();
    const secondProject = screen.getByRole("option", {
      name: "PromptHub · /work/b/PromptHub",
    });
    expect(secondProject).toBeVisible();
    fireEvent.click(secondProject);
    expect(screen.getByRole("button", { name: /Session 1/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Session 0/ })).toBeNull();
  });

  it("explains a successful native-source empty result", async () => {
    installWindowMocks({
      api: {
        agent: {
          listConversationMetadata: vi.fn().mockResolvedValue([]),
          listSessions: vi.fn().mockResolvedValue({
            agentId: "opencode",
            adapter: "opencode-cli-v1",
            sessions: [],
            total: 0,
            hasMore: false,
          }),
        },
      },
    });

    await renderWithI18n(
      <ToastProvider>
        <AgentSessionsPanel
          agent={{ ...agent, id: "opencode", name: "OpenCode" }}
        />
      </ToastProvider>,
      { language: "en", settleAsyncEffects: true },
    );

    expect(await screen.findByText("No sessions found.")).toBeVisible();
    expect(
      screen.getByText(/OpenCode's native local history returned no sessions/i),
    ).toBeVisible();
  });

  it("ignores a metadata page that resolves after the selected Agent changes", async () => {
    let resolvePendingPage: ((value: AgentSessionListResult) => void) | null =
      null;
    const pageResult = (
      sessions: AgentSessionMetadata[],
      hasMore: boolean,
    ): AgentSessionListResult => ({
      agentId: "codex",
      adapter: "codex-rollout-jsonl-v1",
      sessions,
      total: 51,
      hasMore,
    });
    const listSessions = vi.fn(
      async (agentId: string, limit: number, offset = 0) => {
        if (agentId === "opencode") {
          return {
            ...pageResult([], false),
            agentId,
            adapter: "opencode-cli-v1",
          };
        }
        if (offset === 0) {
          return pageResult(
            Array.from({ length: limit }, (_, index) => metadata(index)),
            true,
          );
        }
        return new Promise<AgentSessionListResult>((resolve) => {
          resolvePendingPage = resolve;
        });
      },
    );
    installWindowMocks({
      api: {
        agent: {
          listConversationMetadata: vi.fn().mockResolvedValue([]),
          listSessions,
          readSession: vi.fn().mockResolvedValue({
            agentId: "codex",
            adapter: "codex-rollout-jsonl-v1",
            sessionId: "session-0",
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
      {
        settleAsyncEffects: true,
      },
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Load more sessions" }),
    );
    await waitFor(() => expect(resolvePendingPage).not.toBeNull());
    view.rerender(
      <ToastProvider>
        <AgentSessionsPanel
          agent={{ ...agent, id: "opencode", name: "OpenCode" }}
        />
      </ToastProvider>,
    );
    expect(await screen.findByText("No sessions found.")).toBeVisible();
    await act(async () => {
      resolvePendingPage?.(pageResult([metadata(50)], false));
    });

    expect(screen.queryByText("Session 50")).not.toBeInTheDocument();
  });

  it("applies the system index preference without History controls", async () => {
    let progressListener:
      | ((progress: {
          agentId: string;
          requestId: string;
          processed: number;
          total: number;
        }) => void)
      | null = null;
    let resolveRefresh:
      | ((value: {
          supported: boolean;
          enabled: boolean;
          lastStatus: "ok";
          lastScannedAt: number;
          lastErrorCode: null;
        }) => void)
      | null = null;
    const setSessionIndexEnabled = vi.fn().mockResolvedValue({
      supported: true,
      enabled: true,
      lastStatus: "idle",
      lastScannedAt: null,
      lastErrorCode: null,
    });
    const refreshSessionIndex = vi.fn<
      typeof window.api.agent.refreshSessionIndex
    >(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    const cancelSessionIndex = vi.fn().mockResolvedValue(true);
    installWindowMocks({
      api: {
        agent: {
          listConversationMetadata: vi.fn().mockResolvedValue([]),
          getSessionIndexState: vi.fn().mockResolvedValue({
            supported: true,
            enabled: false,
            lastStatus: null,
            lastScannedAt: null,
            lastErrorCode: null,
          }),
          setSessionIndexEnabled,
          refreshSessionIndex,
          cancelSessionIndex,
          onSessionIndexProgress: vi.fn((listener) => {
            progressListener = listener;
            return () => {
              progressListener = null;
            };
          }),
          listSessions: vi.fn().mockResolvedValue({
            agentId: "claude",
            adapter: "claude-jsonl-v1",
            sessions: [],
            total: 0,
            hasMore: false,
          }),
        },
      },
    });

    const view = await renderWithI18n(
      <ToastProvider>
        <AgentSessionsPanel
          agent={{ ...agent, id: "claude", name: "Claude Code" }}
        />
      </ToastProvider>,
      { language: "en", settleAsyncEffects: true },
    );
    await waitFor(() =>
      expect(setSessionIndexEnabled).toHaveBeenCalledWith({
        agentId: "claude",
        enabled: true,
      }),
    );
    await waitFor(() => expect(refreshSessionIndex).toHaveBeenCalled());
    const request = refreshSessionIndex.mock.calls[0]![0];
    act(() => {
      progressListener?.({
        agentId: "claude",
        requestId: request.requestId,
        processed: 1,
        total: 3,
      });
    });
    expect(
      screen.queryByRole("switch", {
        name: "Enable local session indexing",
      }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Indexing 1 / 3")).not.toBeInTheDocument();
    view.unmount();
    expect(cancelSessionIndex).not.toHaveBeenCalled();

    await act(async () => {
      resolveRefresh?.({
        supported: true,
        enabled: true,
        lastStatus: "ok",
        lastScannedAt: 100,
        lastErrorCode: null,
      });
    });
  });
});
