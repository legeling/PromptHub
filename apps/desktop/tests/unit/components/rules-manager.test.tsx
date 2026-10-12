import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RulesManager } from "../../../src/renderer/components/rules/RulesManager";
import { useRulesStore } from "../../../src/renderer/stores/rules.store";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { useUIStore } from "../../../src/renderer/stores/ui.store";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

const showToast = vi.fn();

function hasHiddenSvgAncestor(element: Element): boolean {
  let current: Element | null = element;

  while (current) {
    if (current.getAttribute("aria-hidden") === "true") {
      return true;
    }
    current = current.parentElement;
  }

  return false;
}

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast }),
}));

vi.mock("../../../src/renderer/components/skill/SkillCodeEditor", () => ({
  SkillCodeEditor: ({
    ariaLabel,
    editable,
    onChange,
    testId,
    value,
  }: {
    ariaLabel: string;
    editable: boolean;
    onChange: (value: string) => void;
    testId: string;
    value: string;
  }) => (
    <textarea
      aria-label={ariaLabel}
      data-testid={testId}
      readOnly={!editable}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

describe("RulesManager", () => {
  beforeEach(() => {
    showToast.mockReset();
    useRulesStore.setState({
      files: [],
      selectedRuleId: null,
      currentFile: null,
      conflictDialogRuleId: null,
      dismissedConflictRuleIds: [],
      draftContent: "",
      aiInstruction: "",
      aiSummary: null,
      isLoading: false,
      isSaving: false,
      isRewriting: false,
      error: null,
      hasLoadedFiles: false,
    });
    useSettingsStore.setState({
      disabledPlatformIds: [],
      aiProvider: "openai",
      aiApiKey: "test-key",
      aiApiUrl: "https://api.openai.com/v1",
      aiModel: "gpt-4o-mini",
      aiModels: [],
    });
    useUIStore.setState({
      appModule: "rules",
      viewMode: "prompt",
      isSidebarCollapsed: false,
    });
  });

  it("opens the selected rule location for a managed project rule", async () => {
    const { api, electron } = installWindowMocks({
      api: {
        rules: {
          list: vi.fn().mockResolvedValue([
            {
              id: "project:docs-site",
              platformId: "workspace",
              platformName: "Docs Site",
              platformIcon: "FolderRoot",
              platformDescription: "Project rules",
              name: "AGENTS.md",
              description: "Docs site rules",
              path: "/tmp/docs-site/AGENTS.md",
              exists: true,
              group: "workspace",
            },
          ]),
          read: vi.fn().mockResolvedValue({
            id: "project:docs-site",
            platformId: "workspace",
            platformName: "Docs Site",
            platformIcon: "FolderRoot",
            platformDescription: "Project rules",
            name: "AGENTS.md",
            description: "Docs site rules",
            path: "/tmp/docs-site/AGENTS.md",
            exists: true,
            group: "workspace",
            content: "# Docs site rules",
            versions: [],
          }),
        },
      },
    });

    await act(async () => {
      await renderWithI18n(<RulesManager />, { language: "en" });
    });

    await waitFor(() => {
      expect(screen.getByText("Docs Site")).toBeInTheDocument();
      expect(screen.getByDisplayValue("# Docs site rules")).toBeInTheDocument();
    });

    expect(api.rules.list).toHaveBeenCalledTimes(1);
    expect(api.rules.read).toHaveBeenCalledWith("project:docs-site");

    fireEvent.click(screen.getByRole("button", { name: "Open Location" }));

    expect(electron.openPath).toHaveBeenCalledWith("/tmp/docs-site/AGENTS.md");
  });

  it("prompts for a sync direction when the external rule file changed", async () => {
    const resolveConflict = vi.fn().mockResolvedValue({
      id: "project:docs-site",
      platformId: "workspace",
      platformName: "Docs Site",
      platformIcon: "FolderRoot",
      platformDescription: "Project rules",
      name: "AGENTS.md",
      description: "Docs site rules",
      path: "/tmp/docs-site/AGENTS.md",
      exists: true,
      group: "workspace",
      syncStatus: "synced",
      content: "# External edit",
      versions: [],
    });
    const { api } = installWindowMocks({
      api: {
        rules: {
          list: vi.fn().mockResolvedValue([
            {
              id: "project:docs-site",
              platformId: "workspace",
              platformName: "Docs Site",
              platformIcon: "FolderRoot",
              platformDescription: "Project rules",
              name: "AGENTS.md",
              description: "Docs site rules",
              path: "/tmp/docs-site/AGENTS.md",
              exists: true,
              group: "workspace",
              syncStatus: "out-of-sync",
            },
          ]),
          read: vi.fn().mockResolvedValue({
            id: "project:docs-site",
            platformId: "workspace",
            platformName: "Docs Site",
            platformIcon: "FolderRoot",
            platformDescription: "Project rules",
            name: "AGENTS.md",
            description: "Docs site rules",
            path: "/tmp/docs-site/AGENTS.md",
            exists: true,
            group: "workspace",
            syncStatus: "out-of-sync",
            content: "# PromptHub copy",
            targetContent: "# External edit",
            versions: [],
          }),
          resolveConflict,
        },
      },
    });

    await act(async () => {
      await renderWithI18n(<RulesManager />, { language: "en" });
    });

    await waitFor(() => {
      expect(screen.getByText("Rule conflict")).toBeInTheDocument();
      expect(
        screen.getByText(
          "Choose which version to keep. The other will be overwritten.",
        ),
      ).toBeInTheDocument();
      expect(screen.getAllByText("Docs Site").length).toBeGreaterThan(0);
      expect(
        screen.getAllByText("/tmp/docs-site/AGENTS.md").length,
      ).toBeGreaterThan(0);
      expect(screen.getByRole("tab", { name: "Diff" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });

    const conflictLayout = screen.getByTestId("rules-conflict-layout");
    const sourceKey = screen.getByTestId("rules-conflict-source-key");
    const comparisonRegion = screen.getByRole("region", {
      name: "Rule conflict",
    });

    expect(conflictLayout).toHaveClass(
      "h-[calc(85vh-5.5rem)]",
      "min-h-0",
      "overflow-hidden",
    );
    expect(comparisonRegion).toHaveClass(
      "min-h-0",
      "overflow-y-auto",
      "overscroll-contain",
    );
    expect(comparisonRegion).toHaveAttribute("tabindex", "0");
    expect(
      within(sourceKey).getByText("PromptHub managed version"),
    ).toBeVisible();
    expect(
      within(sourceKey).getByText("PromptHub internal copy"),
    ).toBeVisible();
    expect(within(sourceKey).getByText("External file version")).toBeVisible();
    expect(within(sourceKey).getByText("File on disk")).toBeVisible();
    expect(sourceKey).toHaveClass("flex", "flex-wrap", "items-center");
    expect(sourceKey).not.toHaveClass("grid", "flex-1");
    expect(
      screen.getByTestId("rules-conflict-managed-source"),
    ).toHaveClass("w-full", "sm:w-[19rem]");
    expect(
      screen.getByTestId("rules-conflict-external-source"),
    ).toHaveClass("w-full", "sm:w-[19rem]");
    expect(comparisonRegion).toContainElement(
      screen.getByTestId("rules-conflict-diff-content"),
    );

    fireEvent.click(screen.getByRole("tab", { name: "Side by side" }));
    expect(screen.getByRole("tab", { name: "Side by side" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getAllByText("# PromptHub copy").length).toBeGreaterThan(0);
    expect(screen.getAllByText("# External edit").length).toBeGreaterThan(0);
    expect(comparisonRegion).toContainElement(
      screen.getByTestId("rules-conflict-managed-content"),
    );
    expect(comparisonRegion).toContainElement(
      screen.getByTestId("rules-conflict-external-content"),
    );

    expect(
      screen.getByRole("button", { name: "Keep PromptHub version" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Keep external file version" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() => {
      expect(screen.queryByText("Rule conflict")).not.toBeInTheDocument();
    });

    // Closing must not auto-reopen for the same out-of-sync rule in this session.
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText("Rule conflict")).not.toBeInTheDocument();

    // Re-open path for resolve flow: select the same rule after clearing dismiss is not
    // available; force a fresh read by resolving via re-render after reset is out of scope.
    // Keep the resolve path covered by re-triggering through keep-external after re-select.
  });

  it("resolves an out-of-sync rule when the user keeps the external file", async () => {
    const resolveConflict = vi.fn().mockResolvedValue({
      id: "project:docs-site",
      platformId: "workspace",
      platformName: "Docs Site",
      platformIcon: "FolderRoot",
      platformDescription: "Project rules",
      name: "AGENTS.md",
      description: "Docs site rules",
      path: "/tmp/docs-site/AGENTS.md",
      exists: true,
      group: "workspace",
      syncStatus: "synced",
      content: "# External edit",
      versions: [],
    });
    const { api } = installWindowMocks({
      api: {
        rules: {
          list: vi.fn().mockResolvedValue([
            {
              id: "project:docs-site",
              platformId: "workspace",
              platformName: "Docs Site",
              platformIcon: "FolderRoot",
              platformDescription: "Project rules",
              name: "AGENTS.md",
              description: "Docs site rules",
              path: "/tmp/docs-site/AGENTS.md",
              exists: true,
              group: "workspace",
              syncStatus: "out-of-sync",
            },
          ]),
          read: vi.fn().mockResolvedValue({
            id: "project:docs-site",
            platformId: "workspace",
            platformName: "Docs Site",
            platformIcon: "FolderRoot",
            platformDescription: "Project rules",
            name: "AGENTS.md",
            description: "Docs site rules",
            path: "/tmp/docs-site/AGENTS.md",
            exists: true,
            group: "workspace",
            syncStatus: "out-of-sync",
            content: "# PromptHub copy",
            targetContent: "# External edit",
            versions: [],
          }),
          resolveConflict,
        },
      },
    });

    await act(async () => {
      await renderWithI18n(<RulesManager />, { language: "en" });
    });

    await waitFor(() => {
      expect(screen.getByText("Rule conflict")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Keep external file version" }),
    );

    expect(api.rules.resolveConflict).not.toHaveBeenCalled();
    expect(screen.getByText("Keep external version?")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Overwrite the PromptHub copy with the external file for Docs Site.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Overwrite PromptHub" }),
    );

    await waitFor(() => {
      expect(api.rules.resolveConflict).toHaveBeenCalledWith(
        "project:docs-site",
        "use-target",
      );
      expect(screen.queryByText("Rule conflict")).not.toBeInTheDocument();
    });

    expect(showToast).toHaveBeenCalledWith(
      "Kept the external file version and synced it to PromptHub",
      "success",
    );
  });

  it("rewrites a rule draft with AI and then saves the updated content", async () => {
    const { api } = installWindowMocks({
      api: {
        rules: {
          list: vi.fn().mockResolvedValue([
            {
              id: "claude-global",
              platformId: "claude",
              platformName: "Claude Code",
              platformIcon: "Bot",
              platformDescription: "Claude rules",
              name: "CLAUDE.md",
              description: "Claude rules",
              path: "/Users/test/.claude/CLAUDE.md",
              exists: true,
              group: "assistant",
            },
          ]),
          read: vi.fn().mockResolvedValue({
            id: "claude-global",
            platformId: "claude",
            platformName: "Claude Code",
            platformIcon: "Bot",
            platformDescription: "Claude rules",
            name: "CLAUDE.md",
            description: "Claude rules",
            path: "/Users/test/.claude/CLAUDE.md",
            exists: true,
            group: "assistant",
            content: "# Claude rules",
            versions: [],
          }),
          rewrite: vi.fn().mockResolvedValue({
            content: "# Claude rules\n\n## New policy",
            summary: "AI rewrite generated a new draft.",
          }),
          save: vi.fn().mockResolvedValue({
            id: "claude-global",
            platformId: "claude",
            platformName: "Claude Code",
            platformIcon: "Bot",
            platformDescription: "Claude rules",
            name: "CLAUDE.md",
            description: "Claude rules",
            path: "/Users/test/.claude/CLAUDE.md",
            exists: true,
            group: "assistant",
            content: "# Claude rules\n\n## New policy",
            versions: [
              {
                id: "claude-global-1",
                savedAt: "2026-05-08T00:00:00.000Z",
                content: "# Claude rules\n\n## New policy",
                source: "manual-save",
              },
            ],
          }),
        },
      },
    });

    await act(async () => {
      await renderWithI18n(<RulesManager />, { language: "en" });
    });

    await screen.findByRole("textbox", { name: "Rule Content" });
    expect(
      screen.queryByRole("textbox", { name: /Ask AI to improve/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Improve with AI" }));

    const instruction = screen.getByRole("textbox", {
      name: /Ask AI to improve/i,
    });
    expect(
      screen.getByRole("dialog", { name: /Ask AI to improve/i }),
    ).toBeVisible();
    expect(instruction).toHaveAttribute(
      "placeholder",
      expect.stringMatching(/add testing requirements, reorganize sections/i),
    );

    fireEvent.change(instruction, {
      target: { value: "Add a new policy section" },
    });
    fireEvent.click(
      within(
        screen.getByRole("dialog", { name: /Ask AI to improve/i }),
      ).getByRole("button", { name: "Improve with AI" }),
    );

    await waitFor(() => {
      expect(api.rules.rewrite).toHaveBeenCalledWith(
        expect.objectContaining({
          instruction: "Add a new policy section",
          fileName: "CLAUDE.md",
          platformName: "Claude Code",
        }),
      );
    });

    expect(screen.getAllByAltText("claude icon").length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: /Ask AI to improve/i }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Rule Content" })).toHaveValue(
        "# Claude rules\n\n## New policy",
      );
    });
    expect(showToast).toHaveBeenCalledWith("AI draft ready", "success");

    fireEvent.click(
      screen.getByRole("button", { name: "Save and overwrite file" }),
    );

    await waitFor(() => {
      expect(api.rules.save).toHaveBeenCalledWith(
        "claude-global",
        "# Claude rules\n\n## New policy",
      );
    });

    expect(showToast).toHaveBeenCalledWith("Saved successfully", "success");
  });

  it("keeps the AI dialog open when rewriting fails", async () => {
    const rewrite = vi
      .fn()
      .mockRejectedValueOnce(new Error("Provider unavailable"))
      .mockRejectedValueOnce("Provider unavailable");

    installWindowMocks({
      api: {
        rules: {
          list: vi.fn().mockResolvedValue([
            {
              id: "claude-global",
              platformId: "claude",
              platformName: "Claude Code",
              platformIcon: "Bot",
              platformDescription: "Claude rules",
              name: "CLAUDE.md",
              description: "Claude rules",
              path: "/Users/test/.claude/CLAUDE.md",
              exists: true,
              group: "assistant",
            },
          ]),
          read: vi.fn().mockResolvedValue({
            id: "claude-global",
            platformId: "claude",
            platformName: "Claude Code",
            platformIcon: "Bot",
            platformDescription: "Claude rules",
            name: "CLAUDE.md",
            description: "Claude rules",
            path: "/Users/test/.claude/CLAUDE.md",
            exists: true,
            group: "assistant",
            content: "# Claude rules",
            versions: [],
          }),
          rewrite,
        },
      },
    });

    await act(async () => {
      await renderWithI18n(<RulesManager />, { language: "en" });
    });
    await screen.findByRole("textbox", { name: "Rule Content" });

    fireEvent.click(screen.getByRole("button", { name: "Improve with AI" }));
    const dialog = screen.getByRole("dialog", {
      name: /Ask AI to improve/i,
    });
    fireEvent.change(
      within(dialog).getByRole("textbox", { name: /Ask AI to improve/i }),
      { target: { value: "Strengthen the policy" } },
    );

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Improve with AI" }),
    );
    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith("Provider unavailable", "error");
    });
    expect(dialog).toBeVisible();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Improve with AI" }),
    );
    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith("AI improvement failed", "error");
    });
    expect(dialog).toBeVisible();
  });

  it("compares a version snapshot in the dialog and restores it to the draft", async () => {
    installWindowMocks({
      api: {
        rules: {
          list: vi.fn().mockResolvedValue([
            {
              id: "claude-global",
              platformId: "claude",
              platformName: "Claude Code",
              platformIcon: "Bot",
              platformDescription: "Claude rules",
              name: "CLAUDE.md",
              description: "Claude rules",
              path: "/Users/test/.claude/CLAUDE.md",
              exists: true,
              group: "assistant",
            },
          ]),
          read: vi.fn().mockResolvedValue({
            id: "claude-global",
            platformId: "claude",
            platformName: "Claude Code",
            platformIcon: "Bot",
            platformDescription: "Claude rules",
            name: "CLAUDE.md",
            description: "Claude rules",
            path: "/Users/test/.claude/CLAUDE.md",
            exists: true,
            group: "assistant",
            content: "# Current draft",
            versions: [
              {
                id: "v2",
                savedAt: "2026-05-08T12:00:00.000Z",
                content: "# Historical snapshot\n\n## Policy",
                source: "manual-save",
              },
            ],
          }),
        },
      },
    });

    await act(async () => {
      await renderWithI18n(<RulesManager />, { language: "en" });
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue("# Current draft")).toBeInTheDocument();
    });

    expect(screen.queryByText("No snapshots yet.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Version Snapshots/i }));
    expect(
      screen.getByRole("dialog", { name: /Version Snapshots/i }),
    ).toBeVisible();
    const historyDialog = screen.getByRole("dialog", {
      name: /Version Snapshots/i,
    });
    fireEvent.click(
      within(historyDialog).getByRole("button", {
        name: /Historical snapshot/i,
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: /Version Snapshots/i }),
      ).toBeVisible();
      expect(
        within(historyDialog).getByRole("button", {
          name: "Restore to Draft",
        }),
      ).toBeInTheDocument();
    });

    expect(
      within(historyDialog).getByText("Snapshot vs Current Draft"),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Historical snapshot/).length).toBeGreaterThan(
      0,
    );
    expect(
      screen.queryByRole("button", { name: "Back to Draft" }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      within(historyDialog).getByRole("button", {
        name: "Restore to Draft",
      }),
    );

    await waitFor(() => {
      const restoredEditor = screen.getAllByRole("textbox").find((node) => {
        return (node as HTMLTextAreaElement).value.includes(
          "Historical snapshot",
        );
      }) as HTMLTextAreaElement | undefined;

      expect(restoredEditor).toBeDefined();
      expect(restoredEditor).not.toHaveAttribute("readonly");
    });

    expect(showToast).toHaveBeenCalledWith(
      "Snapshot restored to draft",
      "success",
    );
  });

  it("shows an empty state when a rule has no version snapshots", async () => {
    installWindowMocks({
      api: {
        rules: {
          list: vi.fn().mockResolvedValue([
            {
              id: "claude-global",
              platformId: "claude",
              platformName: "Claude Code",
              platformIcon: "Bot",
              platformDescription: "Claude rules",
              name: "CLAUDE.md",
              description: "Claude rules",
              path: "/Users/test/.claude/CLAUDE.md",
              exists: true,
              group: "assistant",
            },
          ]),
          read: vi.fn().mockResolvedValue({
            id: "claude-global",
            platformId: "claude",
            platformName: "Claude Code",
            platformIcon: "Bot",
            platformDescription: "Claude rules",
            name: "CLAUDE.md",
            description: "Claude rules",
            path: "/Users/test/.claude/CLAUDE.md",
            exists: true,
            group: "assistant",
            content: "# Claude rules",
            versions: [],
          }),
        },
      },
    });

    await act(async () => {
      await renderWithI18n(<RulesManager />, { language: "en" });
    });
    await screen.findByRole("textbox", { name: "Rule Content" });

    fireEvent.click(screen.getByRole("button", { name: /Version Snapshots/i }));

    expect(screen.getByText(/No snapshots yet/i)).toBeVisible();
  });

  it("labels and deletes AI-created and initial version snapshots", async () => {
    const versions = [
      {
        id: "current",
        savedAt: "2026-05-08T12:00:00.000Z",
        content: "# Current rules",
        source: "manual-save" as const,
      },
      {
        id: "ai-draft",
        savedAt: "2026-05-08T11:00:00.000Z",
        content: "",
        source: "ai-rewrite" as const,
      },
      {
        id: "created",
        savedAt: "2026-05-08T10:00:00.000Z",
        content: "# Initial rules",
        source: "create" as const,
      },
    ];
    const { api } = installWindowMocks({
      api: {
        rules: {
          list: vi.fn().mockResolvedValue([
            {
              id: "claude-global",
              platformId: "claude",
              platformName: "Claude Code",
              platformIcon: "Bot",
              platformDescription: "Claude rules",
              name: "CLAUDE.md",
              description: "Claude rules",
              path: "/Users/test/.claude/CLAUDE.md",
              exists: true,
              group: "assistant",
            },
          ]),
          read: vi.fn().mockResolvedValue({
            id: "claude-global",
            platformId: "claude",
            platformName: "Claude Code",
            platformIcon: "Bot",
            platformDescription: "Claude rules",
            name: "CLAUDE.md",
            description: "Claude rules",
            path: "/Users/test/.claude/CLAUDE.md",
            exists: true,
            group: "assistant",
            content: "# Current rules",
            versions,
          }),
          deleteVersion: vi.fn().mockResolvedValue([versions[0], versions[2]]),
        },
      },
    });

    await act(async () => {
      await renderWithI18n(<RulesManager />, { language: "en" });
    });
    await screen.findByRole("textbox", { name: "Rule Content" });

    fireEvent.click(screen.getByRole("button", { name: /Version Snapshots/i }));
    const historyDialog = screen.getByRole("dialog", {
      name: /Version Snapshots/i,
    });
    expect(within(historyDialog).getByText("AI Draft")).toBeVisible();
    expect(within(historyDialog).getByText("Created")).toBeVisible();
    expect(
      within(historyDialog).getByText("Rule content will appear here."),
    ).toBeVisible();

    fireEvent.click(
      within(historyDialog).getAllByRole("button", {
        name: "Delete snapshot",
      })[0],
    );
    const confirmDialog = screen.getByRole("alertdialog", {
      name: "Delete snapshot",
    });
    fireEvent.click(
      within(confirmDialog).getByRole("button", { name: "Delete" }),
    );

    await waitFor(() => {
      expect(api.rules.deleteVersion).toHaveBeenCalledWith(
        "claude-global",
        "ai-draft",
      );
    });
    expect(showToast).toHaveBeenCalledWith("Snapshot deleted", "success");
  });

  it("keeps rules manager actions non-submit with decorative button icons", async () => {
    const handleSubmit = vi.fn();
    const versions = Array.from({ length: 6 }, (_, index) => ({
      id: `v${index + 1}`,
      savedAt: `2026-05-08T12:0${index}:00.000Z`,
      content:
        index === 0 ? "# Current rules" : `# Historical snapshot ${index + 1}`,
      source: "manual-save" as const,
    }));

    installWindowMocks({
      api: {
        rules: {
          list: vi.fn().mockResolvedValue([
            {
              id: "claude-global",
              platformId: "claude",
              platformName: "Claude Code",
              platformIcon: "Bot",
              platformDescription: "Claude rules",
              name: "CLAUDE.md",
              description: "Claude rules",
              path: "/Users/test/.claude/CLAUDE.md",
              exists: true,
              group: "assistant",
            },
          ]),
          read: vi.fn().mockResolvedValue({
            id: "claude-global",
            platformId: "claude",
            platformName: "Claude Code",
            platformIcon: "Bot",
            platformDescription: "Claude rules",
            name: "CLAUDE.md",
            description: "Claude rules",
            path: "/Users/test/.claude/CLAUDE.md",
            exists: true,
            group: "assistant",
            content: "# Current rules",
            versions,
          }),
        },
      },
      electron: {
        openPath: vi.fn(),
      },
    });

    await act(async () => {
      await renderWithI18n(
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
        >
          <RulesManager />
        </form>,
        { language: "en" },
      );
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue("# Current rules")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Version Snapshots/i }));
    const showMoreButton = screen.getByRole("button", { name: /Show/i });
    expect(showMoreButton).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(showMoreButton);
    expect(showMoreButton).toHaveAttribute("aria-expanded", "true");

    const historyDialog = screen.getByRole("dialog", {
      name: /Version Snapshots/i,
    });
    fireEvent.click(
      within(historyDialog).getByRole("button", { name: /snapshot 2/i }),
    );
    expect(historyDialog).toBeVisible();
    expect(
      within(historyDialog).getByText("Snapshot vs Current Draft"),
    ).toBeVisible();

    const buttons = Array.from(document.body.querySelectorAll("button"));
    const implicitButtonMarkup = buttons
      .filter((button) => button.getAttribute("type") !== "button")
      .map((button) => button.outerHTML);
    const exposedIconMarkup = buttons
      .flatMap((button) => Array.from(button.querySelectorAll("svg")))
      .filter((icon) => !hasHiddenSvgAncestor(icon))
      .map((icon) => icon.outerHTML);

    expect(implicitButtonMarkup, implicitButtonMarkup.join("\n")).toHaveLength(
      0,
    );
    expect(exposedIconMarkup, exposedIconMarkup.join("\n")).toHaveLength(0);

    fireEvent.click(
      within(historyDialog).getByRole("button", { name: "Close" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Open Location" }));

    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it("keeps the selected rules item stable after saving the current draft", async () => {
    const saveMock = vi.fn().mockResolvedValue({
      id: "gemini-global",
      platformId: "gemini",
      platformName: "Gemini CLI",
      platformIcon: "gemini",
      platformDescription: "Gemini rules",
      name: "GEMINI.md",
      description: "Gemini global rule file",
      path: "/Users/test/.gemini/GEMINI.md",
      exists: true,
      group: "assistant",
      content: "# Gemini rules updated",
      versions: [],
    });

    installWindowMocks({
      api: {
        rules: {
          list: vi.fn().mockResolvedValue([
            {
              id: "gemini-global",
              platformId: "gemini",
              platformName: "Gemini CLI",
              platformIcon: "gemini",
              platformDescription: "Gemini rules",
              name: "GEMINI.md",
              description: "Gemini global rule file",
              path: "/Users/test/.gemini/GEMINI.md",
              exists: true,
              group: "assistant",
            },
            {
              id: "openclaw-global",
              platformId: "openclaw",
              platformName: "OpenClaw",
              platformIcon: "openclaw",
              platformDescription: "OpenClaw rules",
              name: "SOUL.md",
              description: "OpenClaw persona file",
              path: "/Users/test/.openclaw/SOUL.md",
              exists: true,
              group: "assistant",
            },
          ]),
          read: vi.fn().mockResolvedValue({
            id: "gemini-global",
            platformId: "gemini",
            platformName: "Gemini CLI",
            platformIcon: "gemini",
            platformDescription: "Gemini rules",
            name: "GEMINI.md",
            description: "Gemini global rule file",
            path: "/Users/test/.gemini/GEMINI.md",
            exists: true,
            group: "assistant",
            content: "# Gemini rules",
            versions: [],
          }),
          save: saveMock,
        },
      },
    });

    await act(async () => {
      await renderWithI18n(<RulesManager />, { language: "en" });
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue("# Gemini rules")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByDisplayValue("# Gemini rules"), {
      target: { value: "# Gemini rules updated" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save and overwrite file" }),
    );

    await waitFor(() => {
      expect(saveMock).toHaveBeenCalledWith(
        "gemini-global",
        "# Gemini rules updated",
      );
    });

    expect(useRulesStore.getState().selectedRuleId).toBe("gemini-global");
    expect(screen.getByText("Gemini CLI")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("# Gemini rules updated"),
    ).toBeInTheDocument();
  });
});
