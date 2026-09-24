import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SkillStore } from "../../../src/renderer/components/skill/SkillStore";
import { SkillStoreCustomSources } from "../../../src/renderer/components/skill/SkillStoreCustomSources";
import { SkillStoreSourceEditModal } from "../../../src/renderer/components/skill/SkillStoreSourceEditModal";
import { SkillStoreSourceForm } from "../../../src/renderer/components/skill/SkillStoreSourceForm";
import { useSkillStore } from "../../../src/renderer/stores/skill.store";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";
import type { RegistrySkill } from "@prompthub/shared/types";
import { buildSkillSourceId } from "@prompthub/shared/utils/skill-identity";

const { showToast } = vi.hoisted(() => ({
  showToast: vi.fn(),
}));

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast }),
}));

function makeRegistrySkill(
  overrides: Partial<RegistrySkill> = {},
): RegistrySkill {
  return {
    slug: "docs-helper",
    name: "Docs Helper",
    description: "Helps with docs",
    category: "general",
    author: "tester",
    source_url: "https://example.com/docs-helper",
    source_id: "docs-helper-source",
    tags: [],
    version: "1.0.0",
    content: "# Docs Helper\n",
    ...overrides,
  };
}

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
    expect(window.api.skill.scanSafety).not.toHaveBeenCalled();
    expect(scanLocalPreview).toHaveBeenNthCalledWith(1, ["/tmp/local-writer"]);
    expect(scanLocalPreview).toHaveBeenNthCalledWith(2, ["/tmp/local-writer"]);
  });

  it("keeps branch and directory identity for local-path git-repo sources", async () => {
    const scanLocalPreview = vi.fn().mockResolvedValue([
      {
        name: "writer",
        description: "Local git writer",
        version: "1.0.0",
        author: "Local",
        tags: ["writing"],
        instructions: "# Writer\n",
        filePath: "/Users/demo/repos/skills/packs/writer/SKILL.md",
        localPath: "/Users/demo/repos/skills/packs/writer",
        platforms: ["Custom"],
      },
    ]);

    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent: vi.fn(),
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
          id: "local-git",
          name: "Local Git",
          type: "git-repo",
          url: "/Users/demo/repos/skills",
          branch: "feature/writer",
          directory: "packs",
          enabled: true,
          order: 0,
          createdAt: Date.now(),
        },
      ],
      selectedStoreSourceId: "local-git",
    } as never);

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    await waitFor(() => {
      expect(
        useSkillStore.getState().remoteStoreEntries["local-git"]?.skills,
      ).toHaveLength(1);
    });

    const skill =
      useSkillStore.getState().remoteStoreEntries["local-git"]?.skills[0];
    expect(scanLocalPreview).toHaveBeenCalledWith([
      "/Users/demo/repos/skills/packs",
    ]);
    expect(skill).toEqual(
      expect.objectContaining({
        source_id: buildSkillSourceId({
          sourceType: "git-repo",
          sourceUrl: "/Users/demo/repos/skills",
          branch: "feature/writer",
          directory: "packs",
          skillPath: "packs/writer/SKILL.md",
        }),
        source_branch: "feature/writer",
        source_directory: "packs",
        canonical_skill_path: "packs/writer/SKILL.md",
      }),
    );
  });

  it("keeps local-path git-repo source identity stable when dirty content changes", async () => {
    const scanLocalPreview = vi
      .fn()
      .mockResolvedValueOnce([
        {
          name: "writer",
          description: "Local git writer",
          version: "1.0.0",
          author: "Local",
          tags: ["writing"],
          instructions: "# Writer\n\nClean content\n",
          filePath: "/Users/demo/repos/skills/packs/writer/SKILL.md",
          localPath: "/Users/demo/repos/skills/packs/writer",
          directory_fingerprint: "fingerprint-clean",
          platforms: ["Custom"],
        },
      ])
      .mockResolvedValueOnce([
        {
          name: "writer",
          description: "Local git writer",
          version: "1.0.0",
          author: "Local",
          tags: ["writing"],
          instructions: "# Writer\n\nDirty content\n",
          filePath: "/Users/demo/repos/skills/packs/writer/SKILL.md",
          localPath: "/Users/demo/repos/skills/packs/writer",
          directory_fingerprint: "fingerprint-dirty",
          platforms: ["Custom"],
        },
      ]);

    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent: vi.fn(),
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
          id: "local-git",
          name: "Local Git",
          type: "git-repo",
          url: "/Users/demo/repos/skills",
          branch: "main",
          directory: "packs",
          enabled: true,
          order: 0,
          createdAt: Date.now(),
        },
      ],
      selectedStoreSourceId: "local-git",
    } as never);

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    await waitFor(() => {
      expect(
        useSkillStore.getState().remoteStoreEntries["local-git"]?.skills[0]
          ?.directory_fingerprint,
      ).toBe("fingerprint-clean");
    });
    const sourceIdBefore =
      useSkillStore.getState().remoteStoreEntries["local-git"]?.skills[0]
        ?.source_id;

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    });

    await waitFor(() => {
      expect(
        useSkillStore.getState().remoteStoreEntries["local-git"]?.skills[0]
          ?.directory_fingerprint,
      ).toBe("fingerprint-dirty");
    });
    const dirtySkill =
      useSkillStore.getState().remoteStoreEntries["local-git"]?.skills[0];
    expect(dirtySkill).toEqual(
      expect.objectContaining({
        source_id: sourceIdBefore,
        content: "# Writer\n\nDirty content\n",
        directory_fingerprint: "fingerprint-dirty",
      }),
    );
  });
});
