import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/renderer/services/webdav-save-sync", () => ({
  scheduleAllSaveSync: vi.fn(),
}));

import { useRulesStore } from "../../../src/renderer/stores/rules.store";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { scheduleAllSaveSync } from "../../../src/renderer/services/webdav-save-sync";
import { installWindowMocks } from "../../helpers/window";
import type {
  RuleFileContent,
  RuleFileDescriptor,
} from "@prompthub/shared/types";

function descriptor(
  overrides: Partial<RuleFileDescriptor> = {},
): RuleFileDescriptor {
  return {
    id: "claude-global",
    platformId: "claude",
    platformName: "Claude Code",
    platformIcon: "claude",
    platformDescription: "Claude rules",
    name: "CLAUDE.md",
    description: "Claude global rule file",
    path: "/Users/test/.claude/CLAUDE.md",
    exists: true,
    group: "assistant",
    ...overrides,
  };
}

function content(overrides: Partial<RuleFileContent> = {}): RuleFileContent {
  return {
    ...descriptor(overrides),
    content: "",
    versions: [],
    ...overrides,
  };
}

describe("rules store", () => {
  beforeEach(() => {
    vi.mocked(scheduleAllSaveSync).mockReset();
    useRulesStore.setState({
      availableFiles: [],
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
      aiProvider: "openai",
      aiApiKey: "test-key",
      aiApiUrl: "https://api.openai.com/v1",
      aiModel: "gpt-4o-mini",
      aiModels: [],
    });
  });

  it("keeps a file-owned global rule visible when its deployment target is missing", async () => {
    const missing = descriptor({ exists: false });
    const recoverable = content({
      exists: false,
      content: "# Recoverable managed rule",
      syncStatus: "target-missing",
    });
    const read = vi.fn().mockResolvedValue(recoverable);
    installWindowMocks({
      api: {
        rules: {
          list: vi.fn().mockResolvedValue([missing]),
          read,
        },
      },
    });

    await useRulesStore.getState().loadFiles();

    expect(useRulesStore.getState()).toEqual(
      expect.objectContaining({
        availableFiles: [missing],
        files: [missing],
        selectedRuleId: "claude-global",
        currentFile: recoverable,
        hasLoadedFiles: true,
      }),
    );
    expect(read).toHaveBeenCalledWith("claude-global");
  });

  it("creates a missing rule through the existing save contract and selects it", async () => {
    const missing = descriptor({ exists: false });
    const created = content({ exists: true });
    const save = vi.fn().mockResolvedValue(created);
    installWindowMocks({ api: { rules: { save } } });
    useRulesStore.setState({
      availableFiles: [missing],
      files: [],
      hasLoadedFiles: true,
    });

    await useRulesStore.getState().createRule(missing.id);

    expect(save).toHaveBeenCalledWith("claude-global", "");
    expect(useRulesStore.getState()).toEqual(
      expect.objectContaining({
        availableFiles: [expect.objectContaining({ exists: true })],
        files: [expect.objectContaining({ exists: true })],
        selectedRuleId: "claude-global",
        currentFile: created,
        draftContent: "",
        isSaving: false,
      }),
    );
    expect(scheduleAllSaveSync).toHaveBeenCalledWith("rules:create");
  });

  it("leaves loading and exposes a retryable error when inventory loading fails", async () => {
    installWindowMocks({
      api: {
        rules: {
          list: vi.fn().mockRejectedValue(new Error("RULE_LIST_FAILED")),
        },
      },
    });

    await useRulesStore.getState().loadFiles({ selectInitial: false });

    expect(useRulesStore.getState()).toEqual(
      expect.objectContaining({
        error: "RULE_LIST_FAILED",
        hasLoadedFiles: false,
        isLoading: false,
      }),
    );
  });

  it("keeps a missing rule retryable when creation fails", async () => {
    const missing = descriptor({ exists: false });
    const save = vi.fn().mockRejectedValue(new Error("RULE_CREATE_FAILED"));
    installWindowMocks({ api: { rules: { save } } });
    useRulesStore.setState({
      availableFiles: [missing],
      files: [],
      hasLoadedFiles: true,
    });

    await expect(
      useRulesStore.getState().createRule(missing.id),
    ).rejects.toThrow("RULE_CREATE_FAILED");

    expect(useRulesStore.getState()).toEqual(
      expect.objectContaining({
        availableFiles: [missing],
        files: [],
        currentFile: null,
        error: "RULE_CREATE_FAILED",
        isSaving: false,
      }),
    );
    expect(scheduleAllSaveSync).not.toHaveBeenCalled();
  });

  it("loads descriptors, selects the first rule, and groups files into global/project sections", async () => {
    useSettingsStore.setState({ disabledPlatformIds: [] });
    installWindowMocks({
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
            {
              id: "claude-global",
              platformId: "claude",
              platformName: "Claude Code",
              platformIcon: "claude",
              platformDescription: "Claude rules",
              name: "CLAUDE.md",
              description: "Claude global rule file",
              path: "/Users/test/.claude/CLAUDE.md",
              exists: true,
              group: "assistant",
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

    await useRulesStore.getState().loadFiles();

    expect(useRulesStore.getState()).toEqual(
      expect.objectContaining({
        selectedRuleId: "project:docs-site",
        draftContent: "# Docs site rules",
        currentFile: expect.objectContaining({
          platformName: "Docs Site",
          content: "# Docs site rules",
        }),
      }),
    );
    expect(useRulesStore.getState().getSidebarSections()).toEqual([
      expect.objectContaining({
        id: "global",
        items: [
          expect.objectContaining({ id: "claude-global", type: "global" }),
        ],
      }),
      expect.objectContaining({
        id: "project",
        items: [
          expect.objectContaining({ id: "project:docs-site", type: "project" }),
        ],
      }),
    ]);
  });

  it("includes custom global rules in sidebar sections after preferred built-in platforms", async () => {
    useSettingsStore.setState({
      disabledPlatformIds: [],
      skillPlatformOrder: ["claude", "custom:team-agents"],
    });
    installWindowMocks({
      api: {
        rules: {
          list: vi.fn().mockResolvedValue([
            {
              id: "custom:team-agents",
              platformId: "custom:team-agents",
              platformName: "Team Agents",
              platformIcon: "Bot",
              platformDescription: "Custom team rules",
              name: "AGENTS.md",
              description: "Global rules for Team Agents.",
              path: "/Users/test/.agents/AGENTS.md",
              exists: true,
              group: "assistant",
            },
            {
              id: "claude-global",
              platformId: "claude",
              platformName: "Claude Code",
              platformIcon: "claude",
              platformDescription: "Claude rules",
              name: "CLAUDE.md",
              description: "Claude global rule file",
              path: "/Users/test/.claude/CLAUDE.md",
              exists: true,
              group: "assistant",
            },
          ]),
          read: vi.fn().mockResolvedValue({
            id: "custom:team-agents",
            platformId: "custom:team-agents",
            platformName: "Team Agents",
            platformIcon: "Bot",
            platformDescription: "Custom team rules",
            name: "AGENTS.md",
            description: "Global rules for Team Agents.",
            path: "/Users/test/.agents/AGENTS.md",
            exists: true,
            group: "assistant",
            content: "# Team rules",
            versions: [],
          }),
        },
      },
    });

    await useRulesStore.getState().loadFiles();

    expect(useRulesStore.getState().getSidebarSections()[0]?.items).toEqual([
      expect.objectContaining({ id: "claude-global" }),
      expect.objectContaining({ id: "custom:team-agents" }),
    ]);
  });

  it("hides disabled global rules even when the target file exists", async () => {
    useSettingsStore.setState({
      disabledPlatformIds: ["claude"],
    });
    installWindowMocks({
      api: {
        rules: {
          list: vi.fn().mockResolvedValue([
            {
              id: "claude-global",
              platformId: "claude",
              platformName: "Claude Code",
              platformIcon: "claude",
              platformDescription: "Claude rules",
              name: "CLAUDE.md",
              description: "Claude global rule file",
              path: "/Users/test/.claude/CLAUDE.md",
              exists: false,
              group: "assistant",
            },
          ]),
        },
      },
    });

    await useRulesStore.getState().loadFiles();

    expect(useRulesStore.getState().files).toEqual([]);
  });

  it("keeps custom rules hidden after disabling their platform in settings", async () => {
    useSettingsStore.setState({
      disabledPlatformIds: ["custom:team-agents"],
    });
    installWindowMocks({
      api: {
        rules: {
          list: vi.fn().mockResolvedValue([
            {
              id: "custom:team-agents",
              platformId: "custom:team-agents",
              platformName: "Team Agents",
              platformIcon: "Bot",
              platformDescription: "Custom team rules",
              name: "AGENTS.md",
              description: "Global rules for Team Agents.",
              path: "/Users/test/.agents/AGENTS.md",
              exists: true,
              group: "assistant",
            },
          ]),
        },
      },
    });

    await useRulesStore.getState().loadFiles();

    expect(useRulesStore.getState().files).toEqual([]);
  });

  it("updates visible custom rules after settings change and a forced reload", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: "custom:team-agents",
          platformId: "custom:team-agents",
          platformName: "Team Agents",
          platformIcon: "Bot",
          platformDescription: "Custom team rules",
          name: "AGENTS.md",
          description: "Global rules for Team Agents.",
          path: "/Users/test/.agents/AGENTS.md",
          exists: true,
          group: "assistant",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "custom:team-agents",
          platformId: "custom:team-agents",
          platformName: "Team Agents",
          platformIcon: "Bot",
          platformDescription: "Custom team rules",
          name: "AGENTS.md",
          description: "Global rules for Team Agents.",
          path: "/Users/test/.agents/AGENTS.md",
          exists: true,
          group: "assistant",
        },
      ]);

    installWindowMocks({
      api: {
        rules: {
          list,
          scan: list,
          read: vi.fn().mockResolvedValue({
            id: "custom:team-agents",
            platformId: "custom:team-agents",
            platformName: "Team Agents",
            platformIcon: "Bot",
            platformDescription: "Custom team rules",
            name: "AGENTS.md",
            description: "Global rules for Team Agents.",
            path: "/Users/test/.agents/AGENTS.md",
            exists: true,
            group: "assistant",
            content: "# Team rules",
            versions: [],
          }),
        },
      },
    });

    useSettingsStore.setState({
      disabledPlatformIds: [],
      skillPlatformOrder: ["custom:team-agents"],
    });

    await useRulesStore.getState().loadFiles();
    expect(useRulesStore.getState().files).toEqual([
      expect.objectContaining({ id: "custom:team-agents" }),
    ]);

    useSettingsStore.setState({ disabledPlatformIds: ["custom:team-agents"] });
    await useRulesStore.getState().loadFiles({ force: true });

    expect(useRulesStore.getState().files).toEqual([]);
  });

  it("keeps enabled global rules visible when the target file exists", async () => {
    useSettingsStore.setState({
      disabledPlatformIds: [],
    });
    installWindowMocks({
      api: {
        rules: {
          list: vi.fn().mockResolvedValue([
            {
              id: "claude-global",
              platformId: "claude",
              platformName: "Claude Code",
              platformIcon: "claude",
              platformDescription: "Claude rules",
              name: "CLAUDE.md",
              description: "Claude global rule file",
              path: "/Users/test/.claude/CLAUDE.md",
              exists: true,
              group: "assistant",
            },
          ]),
        },
      },
    });

    await useRulesStore.getState().loadFiles();

    expect(useRulesStore.getState().files).toEqual([
      expect.objectContaining({ id: "claude-global" }),
    ]);
  });

  it("rewrites the current rule draft with AI", async () => {
    installWindowMocks({
      api: {
        rules: {
          rewrite: vi.fn().mockResolvedValue({
            content: "# Updated by AI",
            summary: "AI rewrite generated a new draft.",
          }),
        },
      },
    });

    useRulesStore.setState({
      currentFile: {
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
        content: "# Original",
        versions: [],
      },
      selectedRuleId: "claude-global",
      draftContent: "# Original",
      aiInstruction: "Tighten the rule wording",
    });

    await useRulesStore.getState().rewriteCurrentRule();

    expect(window.api.rules.rewrite).toHaveBeenCalledWith(
      expect.objectContaining({
        instruction: "Tighten the rule wording",
        fileName: "CLAUDE.md",
        platformName: "Claude Code",
        aiConfig: expect.objectContaining({
          apiKey: "test-key",
          apiUrl: "https://api.openai.com/v1",
          model: "gpt-4o-mini",
          provider: "openai",
        }),
      }),
    );

    expect(useRulesStore.getState()).toEqual(
      expect.objectContaining({
        draftContent: "# Updated by AI",
        aiSummary: "AI rewrite generated a new draft.",
        isRewriting: false,
      }),
    );
  });

  it("schedules WebDAV save-sync after saving a rule", async () => {
    installWindowMocks({
      api: {
        rules: {
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
            content: "# Saved",
            versions: [],
          }),
        },
      },
    });

    useRulesStore.setState({
      availableFiles: [
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
      ],
      files: [
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
      ],
      selectedRuleId: "claude-global",
      draftContent: "# Saved",
    });

    await useRulesStore.getState().saveCurrentRule();

    expect(scheduleAllSaveSync).toHaveBeenCalledWith("rules:save");
    expect(useRulesStore.getState().selectedRuleId).toBe("claude-global");
  });

  it("ignores stale rule reads when the user switches selection before the first read resolves", async () => {
    let resolveClaude: ((value: RuleFileContent) => void) | null = null;
    const readMock = vi.fn((ruleId: string): Promise<RuleFileContent> => {
      if (ruleId === "claude-global") {
        return new Promise<RuleFileContent>((resolve) => {
          resolveClaude = resolve;
        });
      }

      return Promise.resolve({
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
      });
    });

    installWindowMocks({
      api: {
        rules: {
          read: readMock,
        },
      },
    });

    const selectClaude = useRulesStore.getState().selectRule("claude-global");
    await useRulesStore.getState().selectRule("gemini-global");

    resolveClaude?.({
      id: "claude-global",
      platformId: "claude",
      platformName: "Claude Code",
      platformIcon: "claude",
      platformDescription: "Claude rules",
      name: "CLAUDE.md",
      description: "Claude global rule file",
      path: "/Users/test/.claude/CLAUDE.md",
      exists: true,
      group: "assistant",
      content: "# Claude rules",
      versions: [],
    });
    await selectClaude;

    expect(useRulesStore.getState().selectedRuleId).toBe("gemini-global");
    expect(useRulesStore.getState().currentFile?.id).toBe("gemini-global");
    expect(useRulesStore.getState().draftContent).toBe("# Gemini rules");
  });

  it("opens the conflict dialog once and keeps it closed after dismiss", async () => {
    installWindowMocks({
      api: {
        rules: {
          list: vi.fn().mockResolvedValue([
            {
              id: "codex-global",
              platformId: "codex",
              platformName: "Codex CLI",
              platformIcon: "Bot",
              platformDescription: "Codex rules",
              name: "AGENTS.md",
              description: "Codex rules",
              path: "/Users/test/.codex/AGENTS.md",
              exists: true,
              group: "assistant",
              syncStatus: "out-of-sync",
            },
          ]),
          read: vi.fn().mockResolvedValue({
            id: "codex-global",
            platformId: "codex",
            platformName: "Codex CLI",
            platformIcon: "Bot",
            platformDescription: "Codex rules",
            name: "AGENTS.md",
            description: "Codex rules",
            path: "/Users/test/.codex/AGENTS.md",
            exists: true,
            group: "assistant",
            syncStatus: "out-of-sync",
            content: "# managed",
            targetContent: "# external",
            versions: [],
          }),
        },
      },
    });

    await useRulesStore.getState().loadFiles();
    expect(useRulesStore.getState().conflictDialogRuleId).toBe("codex-global");

    useRulesStore.getState().dismissConflictDialog("codex-global");
    expect(useRulesStore.getState().conflictDialogRuleId).toBeNull();
    expect(useRulesStore.getState().dismissedConflictRuleIds).toContain(
      "codex-global",
    );

    // Selecting the same rule again must not re-open after dismiss.
    useRulesStore.setState({
      selectedRuleId: null,
      currentFile: null,
    });
    await useRulesStore.getState().selectRule("codex-global");
    expect(useRulesStore.getState().conflictDialogRuleId).toBeNull();
    expect(useRulesStore.getState().currentFile?.syncStatus).toBe(
      "out-of-sync",
    );
  });
});
