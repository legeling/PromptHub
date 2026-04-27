import { act, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CreateSkillModal } from "../../../src/renderer/components/skill/CreateSkillModal";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";
import { useSkillStore } from "../../../src/renderer/stores/skill.store";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";

describe("CreateSkillModal GitHub import", () => {
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
      selectedStoreSourceId: "claude-code",
      remoteStoreEntries: {},
      translationCache: {},
    });
    useSettingsStore.setState({ aiModels: [] } as never);
  });

  it("scans a GitHub repo and lets users import multiple discovered skills", async () => {
    const installRegistrySkill = vi
      .fn()
      .mockResolvedValueOnce({ id: "skill-1", name: "pdf" })
      .mockResolvedValueOnce({ id: "skill-2", name: "docx" });

    useSkillStore.setState({ installRegistrySkill } as never);

    const fetchRemoteContent = vi.fn(async (url: string) => {
      if (url === "https://api.github.com/repos/anthropics/skills") {
        return JSON.stringify({ default_branch: "main", owner: { login: "anthropics" } });
      }

      if (
        url ===
        "https://api.github.com/repos/anthropics/skills/git/trees/main?recursive=1"
      ) {
        return JSON.stringify({
          tree: [
            { path: "skills/pdf/SKILL.md", type: "blob" },
            { path: "skills/docx/SKILL.md", type: "blob" },
          ],
        });
      }

      if (
        url ===
        "https://raw.githubusercontent.com/anthropics/skills/main/skills/pdf/SKILL.md"
      ) {
        return [
          "---",
          "name: pdf",
          "description: PDF helper",
          "tags: [pdf]",
          "---",
          "",
          "# PDF",
        ].join("\n");
      }

      if (
        url ===
        "https://raw.githubusercontent.com/anthropics/skills/main/skills/docx/SKILL.md"
      ) {
        return [
          "---",
          "name: docx",
          "description: DOCX helper",
          "tags: [docx]",
          "---",
          "",
          "# DOCX",
        ].join("\n");
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent,
        },
      },
    });

    const onClose = vi.fn();
    const view = await renderWithI18n(
      <CreateSkillModal isOpen={true} onClose={onClose} />,
      { language: "en" },
    );

    await act(async () => {
      fireEvent.click(view.getByText("Install from GitHub"));
    });

    fireEvent.change(view.getByPlaceholderText("https://github.com/owner/skill-repo"), {
      target: { value: "https://github.com/anthropics/skills" },
    });

    await act(async () => {
      fireEvent.click(view.getByText("Scan Repository"));
    });

    await waitFor(() => {
      expect(view.getByText("Found 2 import option(s)")).toBeTruthy();
      expect(
        view.getByText(
          "https://github.com/anthropics/skills/tree/main/skills/pdf",
        ),
      ).toBeTruthy();
      expect(
        view.getByText(
          "https://github.com/anthropics/skills/tree/main/skills/docx",
        ),
      ).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(view.getByText("Import Selected"));
    });

    await waitFor(() => {
      expect(installRegistrySkill).toHaveBeenCalledTimes(2);
    });

    expect(installRegistrySkill).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        slug: "pdf",
        source_url: "https://github.com/anthropics/skills/tree/main/skills/pdf",
      }),
    );
    expect(installRegistrySkill).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        slug: "docx",
        source_url: "https://github.com/anthropics/skills/tree/main/skills/docx",
      }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps a fixed footer and scrollable results area after GitHub scan", async () => {
    useSkillStore.setState({
      installRegistrySkill: vi.fn().mockResolvedValue({ id: "skill-1", name: "alpha" }),
    } as never);

    const fetchRemoteContent = vi.fn(async (url: string) => {
      if (url === "https://api.github.com/repos/anthropics/skills") {
        return JSON.stringify({ default_branch: "main", owner: { login: "anthropics" } });
      }

      if (
        url ===
        "https://api.github.com/repos/anthropics/skills/git/trees/main?recursive=1"
      ) {
        return JSON.stringify({
          tree: Array.from({ length: 18 }, (_, index) => ({
            path: `skills/skill-${index + 1}/SKILL.md`,
            type: "blob",
          })),
        });
      }

      const rawMatch = url.match(
        /^https:\/\/raw\.githubusercontent\.com\/anthropics\/skills\/main\/skills\/(skill-\d+)\/SKILL\.md$/,
      );

      if (rawMatch) {
        const slug = rawMatch[1];
        return [
          "---",
          `name: ${slug}`,
          `description: ${slug} helper`,
          "tags: [test]",
          "---",
          "",
          `# ${slug}`,
        ].join("\n");
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent,
        },
      },
    });

    const view = await renderWithI18n(
      <CreateSkillModal isOpen={true} onClose={vi.fn()} />,
      { language: "en" },
    );

    await act(async () => {
      fireEvent.click(view.getByText("Install from GitHub"));
    });

    fireEvent.change(view.getByPlaceholderText("https://github.com/owner/skill-repo"), {
      target: { value: "https://github.com/anthropics/skills" },
    });

    await act(async () => {
      fireEvent.click(view.getByText("Scan Repository"));
    });

    await waitFor(() => {
      expect(view.getByText("Found 18 import option(s)")).toBeTruthy();
    });

    const modalContainer = view.getByTestId("create-skill-modal-container");
    expect(modalContainer.className).toContain("max-w-4xl");
    expect(modalContainer.className).toContain("max-h-[90vh]");

    const scrollArea = view.getByTestId("github-results-scroll-area");
    expect(scrollArea.className).toContain("min-h-0");
    expect(scrollArea.className).toContain("flex-1");
    expect(scrollArea.className).toContain("overflow-y-auto");

    const footer = view.getByTestId("github-mode-footer");
    expect(footer.className).toContain("border-t");
    expect(footer.className).toContain("shrink-0");
    expect(view.getAllByText("Import Selected").length).toBeGreaterThan(0);
  });

  it("shows invalid repository guidance when the GitHub repo does not exist", async () => {
    const fetchRemoteContent = vi
      .fn()
      .mockRejectedValue(new Error("HTTP 404 fetching remote content"));

    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent,
        },
      },
    });

    const view = await renderWithI18n(
      <CreateSkillModal isOpen={true} onClose={vi.fn()} />,
      { language: "zh" },
    );

    await act(async () => {
      fireEvent.click(view.getByText("从 GitHub 安装"));
    });

    fireEvent.change(view.getByPlaceholderText("https://github.com/owner/skill-repo"), {
      target: { value: "https://github.com/demo/missing-repo" },
    });

    await act(async () => {
      fireEvent.click(view.getByText("扫描仓库"));
    });

    await waitFor(() => {
      expect(
        view.getByText("仓库不存在，或仓库地址无效，请检查 GitHub 仓库地址后重试。"),
      ).toBeTruthy();
    });
  });
});
