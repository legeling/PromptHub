import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { FormEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SkillStore } from "../../../src/renderer/components/skill/SkillStore";
import { SkillStoreDetail } from "../../../src/renderer/components/skill/SkillStoreDetail";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";
import { useSkillStore } from "../../../src/renderer/stores/skill.store";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";

import {
  createDeferred,
  makeRegistrySkill,
  makeSkillsShLeaderboard,
} from "./skill-store-remote.test-fixtures";

const { showToast } = vi.hoisted(() => ({
  showToast: vi.fn(),
}));

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast }),
}));

const originalSkillStoreActions = {
  installRegistrySkill: useSkillStore.getState().installRegistrySkill,
  uninstallRegistrySkill: useSkillStore.getState().uninstallRegistrySkill,
  updateRegistrySkill: useSkillStore.getState().updateRegistrySkill,
};

const resetSkillStore = () => {
  useSkillStore.setState({
    ...originalSkillStoreActions,
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
};

describe("SkillStore remote loading", () => {
  beforeEach(() => {
    showToast.mockReset();
    localStorage.clear();
    resetSkillStore();
    useSettingsStore.setState({
      device: {
        storeAutoSync: false,
        storeSyncCadence: "1d",
      },
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);
  });

  it("debounces built-in skills.sh and ClawHub store search boxes while keeping submit immediate", async () => {
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
          fetchRemoteContent: vi
            .fn()
            .mockResolvedValue(makeSkillsShLeaderboard(0)),
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

    useSkillStore.setState({
      selectedStoreSourceId: "community",
      remoteStoreEntries: {
        community: {
          loadedAt: Date.now(),
          error: null,
          nextCursor: null,
          pageSize: 24,
          query: "all:",
          skills: [],
          totalCount: 0,
        },
      },
    });

    const view = await renderWithI18n(<SkillStore />, { language: "en" });

    const skillsShSearchForm = screen.getByTestId(
      "skill-store-local-search-form",
    );
    expect(skillsShSearchForm.className).toContain("w-full");
    expect(skillsShSearchForm.className).not.toContain("max-w-md");
    expect(skillsShSearchForm.className).toContain("bg-card/70");
    expect(skillsShSearchForm.className).not.toContain(
      "focus-within:border-primary",
    );
    expect(skillsShSearchForm.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );

    const skillsShSearchInput = screen.getByPlaceholderText("Search skills...");
    expect(skillsShSearchInput).toHaveAttribute("type", "text");
    expect(skillsShSearchInput.className).toContain("focus-visible:ring-0");
    vi.useFakeTimers();
    await act(async () => {
      fireEvent.change(skillsShSearchInput, {
        target: { value: "react" },
      });
    });

    expect(
      screen.getByRole("button", { name: "Clear search" }).querySelector("svg"),
    ).toHaveAttribute("aria-hidden", "true");
    expect(useSkillStore.getState().storeSearchQuery).toBe("");

    await act(async () => {
      vi.advanceTimersByTime(299);
    });

    expect(useSkillStore.getState().storeSearchQuery).toBe("");

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    expect(useSkillStore.getState().storeSearchQuery).toBe("react");

    await act(async () => {
      fireEvent.change(skillsShSearchInput, {
        target: { value: "next" },
      });
    });

    expect(useSkillStore.getState().storeSearchQuery).toBe("react");

    await act(async () => {
      fireEvent.submit(screen.getByTestId("skill-store-local-search-form"));
    });

    expect(useSkillStore.getState().storeSearchQuery).toBe("next");
    vi.useRealTimers();

    await act(async () => {
      useSkillStore.setState({
        selectedStoreSourceId: "clawhub",
        storeSearchQuery: "",
        remoteStoreEntries: {
          clawhub: {
            loadedAt: Date.now(),
            error: null,
            nextCursor: null,
            pageSize: 24,
            query: "recommended",
            skills: [makeRegistrySkill("gif-maker")],
          },
        },
      });
    });
    view.rerender(<SkillStore />);

    const clawHubSearchInput = screen.getByPlaceholderText("Search skills...");
    vi.useFakeTimers();
    await act(async () => {
      fireEvent.change(clawHubSearchInput, {
        target: { value: "gif" },
      });
    });

    expect(useSkillStore.getState().storeSearchQuery).toBe("");

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(useSkillStore.getState().storeSearchQuery).toBe("gif");
    vi.useRealTimers();
  });

  it("labels the store detail category instead of showing a raw category token", async () => {
    useSkillStore.setState({
      getTranslationState: vi.fn().mockReturnValue({
        value: null,
        hasTranslation: false,
        isStale: false,
      }),
    } as never);

    const skill = makeRegistrySkill("api-helper", {
      category: "dev",
      content: "# API Helper",
    });

    await renderWithI18n(
      <SkillStoreDetail skill={skill} isInstalled={false} onClose={vi.fn()} />,
      { language: "zh" },
    );

    expect(screen.getByText("分类：开发工具")).toBeInTheDocument();
    expect(screen.queryByText("Dev")).not.toBeInTheDocument();
  });

  it("does not show category metadata for external stores without native categories", async () => {
    useSkillStore.setState({
      getTranslationState: vi.fn().mockReturnValue({
        value: null,
        hasTranslation: false,
        isStale: false,
      }),
    } as never);

    const skill = makeRegistrySkill("api-helper", {
      category: "general",
      source_label: "skills.sh",
      store_url: "https://skills.sh/demo/skills/api-helper",
      content: "# API Helper",
    });

    await renderWithI18n(
      <SkillStoreDetail
        skill={skill}
        isInstalled={false}
        storeLabel="skills.sh 商店"
        onClose={vi.fn()}
      />,
      { language: "zh" },
    );

    expect(screen.queryByText(/分类/)).not.toBeInTheDocument();
    expect(screen.queryByText(/通用|General/)).not.toBeInTheDocument();
    expect(screen.queryByText("Dev")).not.toBeInTheDocument();
  });

  it("does not render unsafe store detail source URLs as links", async () => {
    useSkillStore.setState({
      getTranslationState: vi.fn().mockReturnValue({
        value: null,
        hasTranslation: false,
        isStale: false,
      }),
    } as never);

    const skill = makeRegistrySkill("unsafe-source", {
      source_url: "javascript:alert(1)",
      store_url: "file:///tmp/store",
      content: "# Unsafe Source",
    });

    await renderWithI18n(
      <SkillStoreDetail skill={skill} isInstalled={false} onClose={vi.fn()} />,
      { language: "en" },
    );

    expect(screen.getByText("javascript:alert(1)").closest("a")).toBeNull();
    expect(screen.getByText("file:///tmp/store").closest("a")).toBeNull();
  });

  it("keeps package confirmation but does not scan installation content", async () => {
    const installFromRegistry = vi.fn().mockResolvedValue({
      id: "installed",
      name: "PDF",
    });
    const installRegistrySkill = vi.fn().mockResolvedValue({
      id: "installed",
      name: "PDF",
    });

    useSkillStore.setState({
      installFromRegistry,
      installRegistrySkill,
      skills: [],
    } as never);

    useSettingsStore.setState({
      autoScanStoreSkillsBeforeInstall: true,
      aiModels: [],
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);

    installWindowMocks({
      api: {
        skill: {
          scanSafety: vi.fn().mockResolvedValue({
            level: "high-risk",
            summary: "static false positive",
            findings: [
              {
                code: "system-persistence",
                severity: "high",
                title: "Touches persistence or system service mechanisms",
                detail: "false positive",
              },
            ],
            recommendedAction: "review",
            scannedAt: Date.now(),
            checkedFileCount: 2,
            scanMethod: "ai",
          }),
        },
      },
    });

    const skill = {
      slug: "pdf",
      name: "PDF",
      description: "PDF helper",
      category: "office",
      tags: ["pdf"],
      version: "1.0.0",
      content: "# PDF",
      compatibility: ["claude"],
    } as never;

    const { getByText } = await renderWithI18n(
      <SkillStoreDetail skill={skill} isInstalled={false} onClose={vi.fn()} />,
      { language: "en" },
    );

    await act(async () => {
      getByText("Import to My Skills").click();
    });

    expect(installRegistrySkill).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(
        screen.getByText("Review Skill before adding"),
      ).toBeInTheDocument();
      expect(screen.queryByText("static false positive")).toBeNull();
      expect(window.api.skill.scanSafety).not.toHaveBeenCalled();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirm and add" }));
    });

    expect(installRegistrySkill).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "pdf" }),
      {},
    );
  });

  it("turns an authoritative package review into an approved install instead of an error", async () => {
    const review = {
      sourceKey: "git:https://gitea.example.com/team/skills#main:skills/writer",
      packageFingerprint: "a".repeat(64),
      report: {
        level: "high-risk" as const,
        summary: "Review the package script.",
        findings: [
          {
            code: "script-file",
            severity: "high" as const,
            title: "Script requires review",
            detail: "User-authored script",
            filePath: "scripts/install.sh",
          },
        ],
        recommendedAction: "review" as const,
        scannedAt: 1,
        checkedFileCount: 2,
        scanMethod: "preflight" as const,
      },
    };
    const installedSkill = {
      id: "installed-writer",
      name: "writer",
      content: "# Writer",
      instructions: "# Writer",
      tags: [],
    };
    const installRegistrySkill = vi
      .fn()
      .mockResolvedValueOnce({
        status: "safety-review-required",
        review,
      })
      .mockResolvedValueOnce({
        status: "installed",
        skill: installedSkill,
      });
    const trustSkillUpdateSource = vi.fn();
    useSkillStore.setState({ installRegistrySkill, skills: [] } as never);
    useSettingsStore.setState({
      aiModels: [],
      trustSkillUpdateSource,
    } as never);
    installWindowMocks({
      api: {
        skill: {
          scanSafety: vi.fn().mockResolvedValue({
            level: "safe",
            summary: "Entry preview is safe.",
            findings: [],
            recommendedAction: "allow",
            scannedAt: 1,
            checkedFileCount: 1,
            scanMethod: "preflight",
          }),
        },
      },
    });
    const skill = {
      ...makeRegistrySkill("writer"),
      source_url: "https://gitea.example.com/team/skills",
      source_branch: "main",
      source_directory: "skills/writer",
      content: "# Writer",
    } as never;

    await renderWithI18n(
      <SkillStoreDetail skill={skill} isInstalled={false} onClose={vi.fn()} />,
      { language: "en" },
    );
    fireEvent.click(screen.getByText("Import to My Skills"));
    await waitFor(() =>
      expect(
        screen.getByText("Review Skill before adding"),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm and add" }));

    await waitFor(() =>
      expect(screen.getByText("Review Skill Installation")).toBeInTheDocument(),
    );
    fireEvent.click(
      screen.getByLabelText(
        "Trust future high-risk packages from this exact Skill source",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Install Anyway" }));

    await waitFor(() => expect(installRegistrySkill).toHaveBeenCalledTimes(2));
    expect(installRegistrySkill).toHaveBeenLastCalledWith(skill, {
      approvedPackageFingerprint: review.packageFingerprint,
    });
    expect(trustSkillUpdateSource).toHaveBeenCalledWith(review.sourceKey);
    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining("Writer"),
      "success",
    );
  });

  it("keeps each quick-install spinner active until that skill install resolves", async () => {
    const firstInstall = createDeferred<{ id: string; name: string }>();
    const secondInstall = createDeferred<{ id: string; name: string }>();
    const installRegistrySkill = vi
      .fn()
      .mockReturnValueOnce(firstInstall.promise)
      .mockReturnValueOnce(secondInstall.promise);

    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent: vi.fn().mockResolvedValue("{}"),
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

    useSkillStore.setState({
      selectedStoreSourceId: "claude-code",
      remoteStoreEntries: {
        "claude-code": {
          loadedAt: Date.now(),
          error: null,
          skills: [
            makeRegistrySkill("first-skill"),
            makeRegistrySkill("second-skill"),
          ],
        },
      },
      installRegistrySkill,
    } as never);
    useSettingsStore.setState({
      autoScanStoreSkillsBeforeInstall: false,
    } as never);

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    const installButtons = screen.getAllByTitle("Import");
    await act(async () => {
      fireEvent.click(installButtons[0]);
      fireEvent.click(installButtons[1]);
    });

    expect(installRegistrySkill).toHaveBeenCalledTimes(2);
    expect(screen.getAllByTitle("Installing...")).toHaveLength(2);

    await act(async () => {
      firstInstall.resolve({ id: "first", name: "First Skill" });
      secondInstall.resolve({ id: "second", name: "Second Skill" });
      await firstInstall.promise;
      await secondInstall.promise;
    });
  });

  it("shows shared install pending state in store detail and blocks duplicate install", async () => {
    const installRegistrySkill = vi.fn();
    useSkillStore.setState({
      installRegistrySkill,
      getTranslationState: vi.fn().mockReturnValue({
        value: null,
        hasTranslation: false,
        isStale: false,
      }),
    } as never);

    await renderWithI18n(
      <SkillStoreDetail
        skill={makeRegistrySkill("pending-skill")}
        isInstalled={false}
        isInstalling
        onClose={vi.fn()}
      />,
      { language: "en" },
    );

    const installingButton = screen.getByRole("button", {
      name: /Adding/i,
    });
    expect(installingButton).toBeDisabled();

    await act(async () => {
      fireEvent.click(installingButton);
    });

    expect(installRegistrySkill).not.toHaveBeenCalled();
  });

  it("shows the update action only after an update check finds a store update", async () => {
    const getRegistrySkillUpdateStatus = vi
      .fn()
      .mockResolvedValue({ status: "update-available" });
    const updateRegistrySkill = vi
      .fn()
      .mockResolvedValue({ status: "updated" });
    useSkillStore.setState({
      getRegistrySkillUpdateStatus,
      updateRegistrySkill,
      getTranslationState: vi.fn().mockReturnValue({
        value: null,
        hasTranslation: false,
        isStale: false,
      }),
    } as never);

    await renderWithI18n(
      <SkillStoreDetail
        skill={makeRegistrySkill("update-ready", {
          content_url: "https://example.com/update-ready/SKILL.md",
        })}
        isInstalled
        onClose={vi.fn()}
      />,
      { language: "en" },
    );

    expect(
      screen.getByRole("button", { name: /Check update/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Update$/i }),
    ).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Check update/i }));
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Recheck update/i }),
      ).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(
        await screen.findByRole("button", { name: "Confirm update" }),
      );
    });

    expect(updateRegistrySkill).toHaveBeenCalledWith("source-update-ready", {
      overwriteLocalChanges: false,
    });
  });

  it("shows source type, location, and reason when a source check fails", async () => {
    const registrySkill = makeRegistrySkill("sql", {
      source_url: "/Users/demo/skills/sql",
      content_url: "/Users/demo/skills/sql/SKILL.md",
    });
    const getRegistrySkillUpdateStatus = vi.fn().mockResolvedValue({
      status: "source-unavailable",
      registrySkill,
      sourceKind: "local-linked",
      sourceReference: "/Users/demo/skills/sql",
      sourceError: "ENOENT: no such file or directory",
    });
    useSkillStore.setState({
      getRegistrySkillUpdateStatus,
      getTranslationState: vi.fn().mockReturnValue({
        value: null,
        hasTranslation: false,
        isStale: false,
      }),
    } as never);

    await renderWithI18n(
      <SkillStoreDetail skill={registrySkill} isInstalled onClose={vi.fn()} />,
      { language: "en" },
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Check update/i }));
    });

    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining("Local source"),
      "error",
    );
    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining("/Users/demo/skills/sql"),
      "error",
    );
    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining("ENOENT: no such file or directory"),
      "error",
    );
  });

  it("shows linked local guidance when a store update is blocked", async () => {
    const check = { status: "update-available" };
    const getRegistrySkillUpdateStatus = vi.fn().mockResolvedValue(check);
    const updateRegistrySkill = vi.fn().mockResolvedValue({
      status: "linked-local-blocked",
      check,
      recommendedAction: "convert-to-managed-copy",
    });
    useSkillStore.setState({
      getRegistrySkillUpdateStatus,
      updateRegistrySkill,
      getTranslationState: vi.fn().mockReturnValue({
        value: null,
        hasTranslation: false,
        isStale: false,
      }),
    } as never);

    await renderWithI18n(
      <SkillStoreDetail
        skill={makeRegistrySkill("linked-update", {
          content_url: "https://example.com/linked-update/SKILL.md",
        })}
        isInstalled
        onClose={vi.fn()}
      />,
      { language: "en" },
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Check update/i }));
    });
    await act(async () => {
      fireEvent.click(
        await screen.findByRole("button", { name: "Confirm update" }),
      );
    });

    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining("linked to an external folder"),
      "warning",
    );
  });

  it("opens the installed My Skills detail from the imported status action", async () => {
    const onClose = vi.fn();
    useSkillStore.setState({
      skills: [
        {
          id: "installed-algorithmic-art",
          name: "algorithmic-art",
          protocol_type: "skill",
          source_id: "source-algorithmic-art",
          source_url: "https://example.com/algorithmic-art",
          content_url: "https://example.com/algorithmic-art/SKILL.md",
          instructions: "# Installed algorithmic art",
          content: "# Installed algorithmic art",
          tags: [],
          is_favorite: false,
          created_at: 1,
          updated_at: 1,
        },
      ],
      storeView: "store",
      selectedSkillId: null,
      getTranslationState: vi.fn().mockReturnValue({
        value: null,
        hasTranslation: false,
        isStale: false,
      }),
    } as never);

    await renderWithI18n(
      <SkillStoreDetail
        skill={makeRegistrySkill("algorithmic-art", {
          content_url: "https://example.com/algorithmic-art/SKILL.md",
        })}
        isInstalled
        onClose={onClose}
      />,
      { language: "en" },
    );

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /Open in My Skills/i }),
      );
    });

    expect(useSkillStore.getState().storeView).toBe("my-skills");
    expect(useSkillStore.getState().selectedSkillId).toBe(
      "installed-algorithmic-art",
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not collapse store detail when the backdrop is clicked", async () => {
    const onClose = vi.fn();
    useSkillStore.setState({
      getTranslationState: vi.fn().mockReturnValue({
        value: null,
        hasTranslation: false,
        isStale: false,
      }),
    } as never);

    const { container } = await renderWithI18n(
      <SkillStoreDetail
        skill={makeRegistrySkill("stable-detail")}
        isInstalled={false}
        onClose={onClose}
      />,
      { language: "en" },
    );
    const backdrop = container.querySelector(".absolute.inset-0");
    expect(backdrop).toBeTruthy();

    await act(async () => {
      fireEvent.click(backdrop!);
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("defaults to saved translation in store detail and toggles back to original", async () => {
    useSkillStore.setState({
      getTranslationState: vi.fn().mockReturnValue({
        value:
          "---\ndescription: Translated store content\n---\n\nTranslated store content",
        hasTranslation: true,
        isStale: false,
      }),
    } as never);

    const skill = {
      slug: "writer",
      name: "Writer",
      description: "Original description",
      category: "general",
      tags: ["writing"],
      version: "1.0.0",
      content: "# Writer\n\nOriginal content",
      compatibility: ["claude"],
    } as never;

    const { getByRole, getByText } = await renderWithI18n(
      <SkillStoreDetail skill={skill} isInstalled={false} onClose={vi.fn()} />,
      { language: "en" },
    );

    expect(screen.getAllByText("Translated store content")).toHaveLength(2);

    await act(async () => {
      fireEvent.click(getByRole("button", { name: "Show Original" }));
    });

    expect(getByText("Original content")).toBeInTheDocument();
  });
});
