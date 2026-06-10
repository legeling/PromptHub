import { act, fireEvent, screen, waitFor } from "@testing-library/react";
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

describe("RulesManager", () => {
  beforeEach(() => {
    showToast.mockReset();
    useRulesStore.setState({
      files: [],
      selectedRuleId: null,
      currentFile: null,
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

    expect(electron.openPath).toHaveBeenCalledWith("/tmp/docs-site");
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
      expect(screen.getByText("External rule file changed")).toBeInTheDocument();
      expect(screen.getAllByText("# PromptHub copy").length).toBeGreaterThan(0);
      expect(screen.getByText("# External edit")).toBeInTheDocument();
    });

    const dismissConflictButton = screen.getByRole("button", {
      name: "Dismiss rule conflict",
    });
    expect(dismissConflictButton).toHaveAttribute("type", "button");
    expect(document.body.querySelector(".lucide-circle-alert")).toHaveAttribute(
      "aria-hidden",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "Keep external file version" }));

    expect(api.rules.resolveConflict).not.toHaveBeenCalled();
    expect(screen.getByText("Keep external file version?")).toBeInTheDocument();
    expect(
      screen.getByText(
        "The external rule file will become the source of truth and overwrite PromptHub's managed copy.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Keep external version" }));

    await waitFor(() => {
      expect(api.rules.resolveConflict).toHaveBeenCalledWith(
        "project:docs-site",
        "use-target",
      );
      expect(screen.queryByText("External rule file changed")).not.toBeInTheDocument();
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

    const instruction = await screen.findByRole("textbox", {
      name: /Ask AI to improve/i,
    });
    expect(instruction).toHaveAttribute(
      "placeholder",
      expect.stringMatching(/add testing requirements, reorganize sections/i),
    );

    fireEvent.change(instruction, {
      target: { value: "Add a new policy section" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Improve with AI" }));

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
    expect(
      screen.getByText("AI has generated a new draft. Review it and save when ready."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save and overwrite file" }));

    await waitFor(() => {
      expect(api.rules.save).toHaveBeenCalledWith(
        "claude-global",
        "# Claude rules\n\n## New policy",
      );
    });

    expect(showToast).toHaveBeenCalledWith("Saved successfully", "success");
  });

  it("previews a version snapshot and restores it to the draft", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: /saved/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Back to Draft" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Restore to Draft" })).toBeInTheDocument();
    });

    expect(
      screen.getByText("Snapshot vs Current Draft"),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Historical snapshot/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Restore to Draft" }));

    await waitFor(() => {
      const restoredEditor = screen.getAllByRole("textbox").find((node) => {
        return (node as HTMLTextAreaElement).value.includes("Historical snapshot");
      }) as HTMLTextAreaElement | undefined;

      expect(restoredEditor).toBeDefined();
      expect(restoredEditor).not.toHaveAttribute("readonly");
    });

    expect(showToast).toHaveBeenCalledWith("Snapshot restored to draft", "success");
  });

  it("keeps rules manager actions non-submit with decorative button icons", async () => {
    const handleSubmit = vi.fn();
    const versions = Array.from({ length: 6 }, (_, index) => ({
      id: `v${index + 1}`,
      savedAt: `2026-05-08T12:0${index}:00.000Z`,
      content:
        index === 0
          ? "# Current rules"
          : `# Historical snapshot ${index + 1}`,
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

    const showMoreButton = screen.getByRole("button", { name: /Show/i });
    expect(showMoreButton).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(showMoreButton);
    expect(showMoreButton).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByRole("button", { name: /snapshot 2/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Back to Draft" })).toBeInTheDocument();
    });

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

    fireEvent.click(screen.getByRole("button", { name: "Back to Draft" }));
    fireEvent.click(screen.getByRole("button", { name: "Open Location" }));

    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it("returns to the draft view when clicking the current saved snapshot card", async () => {
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
            content: "adwd1",
            versions: [
              {
                id: "current-saved",
                savedAt: "2026-05-15T08:27:24.000Z",
                content: "adwd1",
                source: "manual-save",
              },
              {
                id: "older",
                savedAt: "2026-05-15T07:12:56.000Z",
                content: "old snapshot",
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
      expect(screen.getByDisplayValue("adwd1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByText(/old snapshot/i)[0]);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Back to Draft" })).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByText((_, node) => node?.textContent?.trim() === "✓ Current"),
    );

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Back to Draft" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save and overwrite file" })).toBeInTheDocument();
    });
  });

  it("renders a single editable rule textarea for the current draft", async () => {
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
        },
      },
    });

    await act(async () => {
      await renderWithI18n(<RulesManager />, { language: "en" });
    });

    const editor = await screen.findByRole("textbox", {
      name: "Rule Content",
    });

    expect(editor).toHaveValue("# Gemini rules");
    expect(editor).not.toHaveAttribute("readonly");
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
    fireEvent.click(screen.getByRole("button", { name: "Save and overwrite file" }));

    await waitFor(() => {
      expect(saveMock).toHaveBeenCalledWith("gemini-global", "# Gemini rules updated");
    });

    expect(useRulesStore.getState().selectedRuleId).toBe("gemini-global");
    expect(screen.getByText("Gemini CLI")).toBeInTheDocument();
    expect(screen.getByDisplayValue("# Gemini rules updated")).toBeInTheDocument();
  });
});
