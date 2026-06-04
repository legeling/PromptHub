import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SkillStore } from "../../../src/renderer/components/skill/SkillStore";
import { useSkillStore } from "../../../src/renderer/stores/skill.store";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

const { showToast } = vi.hoisted(() => ({
  showToast: vi.fn(),
}));

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast }),
}));

describe("SkillStore custom sources", () => {
  beforeEach(() => {
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
      selectedStoreSourceId: "official",
      remoteStoreEntries: {},
      translationCache: {},
    });
  });

  it("edits a custom store source from the header action modal", async () => {
    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent: vi
            .fn()
            .mockResolvedValue(JSON.stringify({ skills: [] })),
          listRemoteBranches: vi.fn().mockResolvedValue(["main", "release"]),
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
      storeView: "store",
      customStoreSources: [
        {
          id: "custom-docs",
          name: "Docs Store",
          type: "git-repo",
          url: "https://github.com/example/store",
          branch: "main",
          directory: "skills/docs",
          enabled: true,
          order: 0,
          createdAt: Date.now(),
        },
      ],
      selectedStoreSourceId: "custom-docs",
    } as never);

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    const input = screen.getByDisplayValue("Docs Store");
    fireEvent.change(input, { target: { value: "Docs Store Renamed" } });
    fireEvent.change(screen.getByDisplayValue("main"), {
      target: { value: "release" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(useSkillStore.getState().customStoreSources[0]?.name).toBe(
        "Docs Store Renamed",
      );
    });

    expect(useSkillStore.getState().customStoreSources[0]?.branch).toBe(
      "release",
    );
    expect(screen.getAllByText("Docs Store Renamed").length).toBeGreaterThan(0);
  });

  it("normalizes GitHub tree URLs before requesting remote branches", async () => {
    const listRemoteBranches = vi.fn().mockResolvedValue(["main", "release"]);

    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent: vi
            .fn()
            .mockResolvedValue(JSON.stringify({ skills: [] })),
          listRemoteBranches,
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

    useSkillStore.setState({ selectedStoreSourceId: "new-custom" } as never);

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    fireEvent.click(screen.getByRole("button", { name: /Git Repository/i }));

    fireEvent.change(screen.getByPlaceholderText("Store URL / manifest URL"), {
      target: {
        value: "https://github.com/anthropics/skills/tree/main/skills/.curated",
      },
    });

    await waitFor(() => {
      expect(listRemoteBranches).toHaveBeenCalledWith(
        "https://github.com/anthropics/skills",
      );
    });
  });

  it("keeps main visible in branch suggestions when many branches exist", async () => {
    const listRemoteBranches = vi
      .fn()
      .mockResolvedValue([
        "andibrae/create-top-level-namespace",
        "klazuka/add-3p-notices",
        "klazuka/add-cc-instructions",
        "klazuka/add-cc-marketplace",
        "klazuka/doc-skills",
        "klazuka/export",
        "klazuka/export-20260203",
        "klazuka/frontend-design-skill",
        "klazuka/pptx-cleanup",
        "klazuka/spec",
        "mahesh/add-to-readme",
        "mahesh/clarify-claude-code-install",
        "main",
        "mattpic-ant/blog-small-fix",
      ]);

    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent: vi
            .fn()
            .mockResolvedValue(JSON.stringify({ skills: [] })),
          listRemoteBranches,
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

    useSkillStore.setState({ selectedStoreSourceId: "new-custom" } as never);

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    fireEvent.click(screen.getByRole("button", { name: /Git Repository/i }));
    fireEvent.change(screen.getByPlaceholderText("Store URL / manifest URL"), {
      target: { value: "https://github.com/anthropics/skills/tree/main" },
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "main" })).toBeInTheDocument();
    });
  });

  it("hides the selected branch from the suggestion list", async () => {
    const listRemoteBranches = vi.fn().mockResolvedValue(["main", "release"]);

    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent: vi
            .fn()
            .mockResolvedValue(JSON.stringify({ skills: [] })),
          listRemoteBranches,
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

    useSkillStore.setState({ selectedStoreSourceId: "new-custom" } as never);

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    fireEvent.click(screen.getByRole("button", { name: /Git Repository/i }));
    fireEvent.change(screen.getByPlaceholderText("Store URL / manifest URL"), {
      target: { value: "https://github.com/anthropics/skills" },
    });

    await waitFor(() => {
      expect(screen.getByText("Suggested branches")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "main" }));

    expect(screen.getByDisplayValue("main")).toBeInTheDocument();
    expect(screen.queryAllByRole("button", { name: "main" })).toHaveLength(0);
  });

  it("renders localized branch helper copy", async () => {
    const listRemoteBranches = vi.fn().mockResolvedValue(["main", "release"]);

    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent: vi
            .fn()
            .mockResolvedValue(JSON.stringify({ skills: [] })),
          listRemoteBranches,
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

    useSkillStore.setState({ selectedStoreSourceId: "new-custom" } as never);

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "zh" });
    });

    fireEvent.click(screen.getByRole("button", { name: /Git 仓库/i }));
    fireEvent.change(screen.getByPlaceholderText("商店地址 / manifest URL"), {
      target: { value: "https://github.com/anthropics/skills" },
    });

    await waitFor(() => {
      expect(screen.getByText("可选分支")).toBeInTheDocument();
    });

    expect(
      screen.getByPlaceholderText("分支（可选，留空则使用默认分支）"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("目录（可选，例如 skills/.curated）"),
    ).toBeInTheDocument();
  });

  it("does not render duplicate custom store action cards in the main pane", async () => {
    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent: vi
            .fn()
            .mockResolvedValue(JSON.stringify({ skills: [] })),
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
      storeView: "store",
      customStoreSources: [
        {
          id: "custom-docs",
          name: "Docs Store",
          type: "marketplace-json",
          url: "https://example.com/store.json",
          enabled: true,
          order: 0,
          createdAt: Date.now(),
        },
      ],
      selectedStoreSourceId: "custom-docs",
    } as never);

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    expect(
      screen.queryByRole("button", { name: "Disable" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Enabled")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(
      screen.getByText("No skills in this custom store yet"),
    ).toBeInTheDocument();
    expect(screen.queryByText("No skills found")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Try a different search or category"),
    ).not.toBeInTheDocument();
    expect(screen.queryAllByText("Docs Store")).toHaveLength(1);
    expect(
      screen.queryByPlaceholderText("Search skills..."),
    ).not.toBeInTheDocument();
  });

  it("renders one custom store empty state even when a search query is active", async () => {
    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent: vi
            .fn()
            .mockResolvedValue(JSON.stringify({ skills: [] })),
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
      storeView: "store",
      selectedStoreSourceId: "empty-custom",
      storeSearchQuery: "missing",
      customStoreSources: [
        {
          id: "empty-custom",
          name: "Empty Custom Store",
          type: "marketplace-json",
          url: "https://example.com/marketplace.json",
          enabled: true,
          order: 0,
          createdAt: Date.now(),
        },
      ],
      remoteStoreEntries: {
        "empty-custom": {
          loadedAt: Date.now(),
          error: null,
          skills: [],
        },
      },
    } as never);

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    expect(
      screen.getByText("No skills in this custom store yet"),
    ).toBeInTheDocument();
    expect(screen.queryByText("No skills found")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Try a different search or category"),
    ).not.toBeInTheDocument();
  });

  it("refreshes a local directory source from the latest SKILL.md on disk", async () => {
    const scanLocalPreview = vi
      .fn()
      .mockResolvedValueOnce([
        {
          name: "local-writer",
          description: "Local source skill",
          version: "1.0.0",
          author: "Local",
          tags: ["local"],
          instructions: "# Local Writer\n\nOld content\n",
          filePath: "/tmp/local-writer/SKILL.md",
          localPath: "/tmp/local-writer",
          platforms: ["Custom"],
        },
      ])
      .mockResolvedValueOnce([
        {
          name: "local-writer",
          description: "Local source skill",
          version: "1.1.0",
          author: "Local",
          tags: ["local"],
          instructions: "# Local Writer\n\nNew content\n",
          filePath: "/tmp/local-writer/SKILL.md",
          localPath: "/tmp/local-writer",
          platforms: ["Custom"],
        },
      ]);

    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent: vi
            .fn()
            .mockResolvedValue(JSON.stringify({ skills: [] })),
          scanLocalPreview,
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
      storeView: "store",
      customStoreSources: [
        {
          id: "custom-local",
          name: "Local Skills",
          type: "local-dir",
          url: "/tmp/local-writer",
          enabled: true,
          order: 0,
          createdAt: Date.now(),
        },
      ],
      selectedStoreSourceId: "custom-local",
    } as never);

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    await waitFor(() => {
      expect(
        useSkillStore.getState().remoteStoreEntries["custom-local"]?.skills[0]
          ?.content,
      ).toContain("Old content");
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    });

    await waitFor(() => {
      expect(
        useSkillStore.getState().remoteStoreEntries["custom-local"]?.skills[0]
          ?.content,
      ).toContain("New content");
    });
    expect(
      useSkillStore.getState().remoteStoreEntries["custom-local"]?.skills[0]
        ?.content,
    ).not.toContain("Old content");
    expect(scanLocalPreview).toHaveBeenNthCalledWith(
      1,
      ["/tmp/local-writer"],
      undefined,
    );
    expect(scanLocalPreview).toHaveBeenNthCalledWith(
      2,
      ["/tmp/local-writer"],
      undefined,
    );
  });
});
