import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SkillStore } from "../../../src/renderer/components/skill/SkillStore";
import { SkillStoreDetail } from "../../../src/renderer/components/skill/SkillStoreDetail";
import { useSkillStore } from "../../../src/renderer/stores/skill.store";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { createSkillFixture } from "../../fixtures/skills";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

const { showToast } = vi.hoisted(() => ({
  showToast: vi.fn(),
}));

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast }),
}));

const resetSkillStore = () => {
  useSkillStore.setState({
    skills: [],
    selectedSkillId: null,
    isLoading: false,
    error: null,
    viewMode: "gallery",
    searchQuery: "",
    filterType: "all",
    filterTags: [],
    deployedSkillNames: new Set<string>(),
    storeView: "store",
    registrySkills: [],
    isLoadingRegistry: false,
    storeCategory: "all",
    storeSearchQuery: "",
    selectedRegistrySlug: null,
    customStoreSources: [],
    selectedStoreSourceId: "claude-code",
    remoteStoreEntries: {},
    translationCache: {},
  });
  localStorage.clear();
};

describe("SkillStore installed state", () => {
  beforeEach(() => {
    showToast.mockReset();
    resetSkillStore();
    installWindowMocks({
      api: {
        settings: {
          get: vi.fn().mockResolvedValue({
            device: {
              storeAutoSync: false,
              storeSyncCadence: "manual",
            },
          }),
        },
        skill: {
          fetchRemoteContent: vi.fn(),
          scanLocalPreview: vi.fn().mockResolvedValue([]),
          scanSafety: vi.fn().mockResolvedValue({
            level: "safe",
            summary: "safe",
            findings: [],
            recommendedAction: "allow",
            scannedAt: Date.now(),
            checkedFileCount: 1,
            scanMethod: "ai",
          }),
        },
      },
    });
    useSettingsStore.setState({
      device: {
        storeAutoSync: false,
        storeSyncCadence: "manual",
      },
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);
  });

  it("shows a Claude Code store skill as imported when a legacy install only matches by content URL", async () => {
    useSkillStore.setState({
      skills: [
        createSkillFixture({
          id: "skill-legacy-writer",
          name: "writer",
          registry_slug: "writer",
          source_url: "https://github.com/anthropics/skills/tree/main/writer",
          content_url:
            "https://raw.githubusercontent.com/anthropics/skills/main/writer/SKILL.md",
        }),
      ],
      remoteStoreEntries: {
        "claude-code": {
          loadedAt: Date.now(),
          error: null,
          skills: [
            {
              slug: "writer",
              name: "Writer",
              install_name: "writer",
              source_id: "claude-code:writer:refreshed",
              source_label: "Claude Code",
              description: "Official Claude Code writer",
              category: "general",
              author: "Anthropic",
              source_url: "https://github.com/anthropics/skills/tree/main/writer",
              content_url:
                "https://raw.githubusercontent.com/anthropics/skills/main/writer/SKILL.md",
              tags: ["writing"],
              version: "1.0.0",
              content: "# Writer\n\nOfficial package\n",
            },
            {
              slug: "fork-writer",
              name: "Writer",
              install_name: "writer",
              source_id: "claude-code:fork-writer",
              source_label: "Claude Code",
              description: "A different package with the same install name",
              category: "general",
              author: "Community",
              source_url:
                "https://github.com/anthropics/skills/tree/main/fork-writer",
              content_url:
                "https://raw.githubusercontent.com/anthropics/skills/main/fork-writer/SKILL.md",
              tags: ["writing"],
              version: "1.0.0",
              content: "# Fork Writer\n\nDifferent package\n",
            },
          ],
        },
      },
    } as never);

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    const importedSection = screen.getByRole("heading", {
      name: "Imported",
    }).closest("section");
    const availableSection = screen.getByRole("heading", {
      name: "Available",
    }).closest("section");

    expect(importedSection).not.toBeNull();
    expect(availableSection).not.toBeNull();
    expect(within(importedSection!).getByTitle("Imported")).toBeInTheDocument();
    expect(within(importedSection!).getByText("Official Claude Code writer"))
      .toBeInTheDocument();
    expect(
      within(availableSection!).getByText(
        "A different package with the same install name",
      ),
    ).toBeInTheDocument();
    expect(within(availableSection!).getByTitle("Import")).toBeInTheDocument();
  });

  it("scans an installed custom Gitea store skill from the managed package path", async () => {
    const scanSafety = vi.fn().mockResolvedValue({
      level: "safe",
      summary: "full package scanned",
      findings: [],
      recommendedAction: "allow",
      scannedAt: Date.now(),
      checkedFileCount: 3,
      scanMethod: "ai",
    });
    (window as any).api.skill.scanSafety = scanSafety;

    useSettingsStore.setState({
      aiModels: [
        {
          id: "fast-model",
          name: "Fast Model",
          provider: "openai",
          apiProtocol: "openai",
          apiKey: "test-key",
          apiUrl: "https://api.example.com/v1/chat/completions",
          model: "gpt-4.1-mini",
          enabled: true,
          useFor: ["chat"],
        },
      ],
      scenarioModelDefaults: {
        safetyScan: "fast-model",
      },
    } as never);

    const installedSkill = createSkillFixture({
      id: "skill-gitea-writer",
      name: "writer",
      registry_slug: "writer",
      source_id: "source-gitea-writer",
      source_url: "https://gitea.internal.example/team/skills",
      content_url:
        "https://gitea.internal.example/team/skills/raw/branch/main/skills/writer/SKILL.md",
      local_repo_path: "/managed/skills/writer--abc123",
      instructions: "# Writer\n\nInstalled content",
      content: "# Writer\n\nInstalled content",
    });
    useSkillStore.setState({
      skills: [installedSkill],
      saveSafetyReport: vi.fn().mockResolvedValue(undefined),
    } as never);

    await act(async () => {
      await renderWithI18n(
        <SkillStoreDetail
          skill={{
            slug: "writer",
            name: "Writer",
            source_id: "source-gitea-writer",
            description: "Custom Gitea writer",
            category: "general",
            author: "icelemon",
            source_url: "https://gitea.internal.example/team/skills",
            content_url:
              "https://gitea.internal.example/team/skills/raw/branch/main/skills/writer/SKILL.md",
            tags: ["writing"],
            version: "1.0.0",
            content: "# Writer\n\nRemote store content",
          }}
          isInstalled={true}
          onClose={vi.fn()}
        />,
        { language: "en" },
      );
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Run Scan" }));
    });

    await waitFor(() => {
      expect(scanSafety).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Writer",
          sourceUrl: "https://gitea.internal.example/team/skills",
          contentUrl:
            "https://gitea.internal.example/team/skills/raw/branch/main/skills/writer/SKILL.md",
          localRepoPath: "/managed/skills/writer--abc123",
          content: "# Writer\n\nInstalled content",
        }),
      );
    });
  });
});
