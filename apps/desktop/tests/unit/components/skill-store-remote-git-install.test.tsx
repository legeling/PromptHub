import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { FormEvent } from "react";
import type { RegistrySkill } from "@prompthub/shared/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SkillStore } from "../../../src/renderer/components/skill/SkillStore";
import { SkillStoreDetail } from "../../../src/renderer/components/skill/SkillStoreDetail";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";
import { useSkillStore } from "../../../src/renderer/stores/skill.store";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { createSkillFixture } from "../../fixtures/skills";

import {} from "./skill-store-remote.test-fixtures";

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

  it("falls back to repository root README when no SKILL.md exists", async () => {
    const fetchRemoteContent = vi.fn(async (url: string) => {
      if (url === "https://api.github.com/repos/demo/skills") {
        return JSON.stringify({
          default_branch: "main",
          owner: { login: "demo" },
        });
      }

      if (
        url ===
        "https://api.github.com/repos/demo/skills/git/trees/main?recursive=1"
      ) {
        return JSON.stringify({
          tree: [{ path: "README.md", type: "blob" }],
        });
      }

      if (
        url === "https://raw.githubusercontent.com/demo/skills/main/README.md"
      ) {
        return "# Demo skills\n\n![cover](./images/demo.png)";
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent,
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
      customStoreSources: [
        {
          id: "demo-repo",
          name: "Demo Repo",
          type: "git-repo",
          url: "https://github.com/demo/skills",
          enabled: true,
          createdAt: Date.now(),
        },
      ],
      selectedStoreSourceId: "demo-repo",
    });

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    await waitFor(() => {
      expect(
        useSkillStore.getState().remoteStoreEntries["demo-repo"]?.skills,
      ).toHaveLength(1);
    });

    expect(
      useSkillStore.getState().remoteStoreEntries["demo-repo"]?.skills[0],
    ).toEqual(
      expect.objectContaining({
        source_url: "https://github.com/demo/skills/tree/main",
        content_url:
          "https://raw.githubusercontent.com/demo/skills/main/README.md",
      }),
    );
  });

  it("loads git-repo sources from an explicit branch and directory", async () => {
    const fetchRemoteContent = vi.fn(async (url: string) => {
      if (url === "https://api.github.com/repos/demo/skills") {
        return JSON.stringify({
          default_branch: "main",
          owner: { login: "demo" },
        });
      }

      if (
        url ===
        "https://api.github.com/repos/demo/skills/git/trees/release?recursive=1"
      ) {
        return JSON.stringify({
          tree: [
            { path: "skills/.curated/release-skill/SKILL.md", type: "blob" },
          ],
        });
      }

      if (
        url ===
        "https://raw.githubusercontent.com/demo/skills/release/skills/.curated/release-skill/SKILL.md"
      ) {
        return "---\nname: release-skill\ndescription: Release skill\n---\n\n# Release";
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent,
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
      customStoreSources: [
        {
          id: "release-repo",
          name: "Release Repo",
          type: "git-repo",
          url: "https://github.com/demo/skills",
          branch: "release",
          directory: "skills/.curated",
          enabled: true,
          createdAt: Date.now(),
        },
      ],
      selectedStoreSourceId: "release-repo",
    });

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    await waitFor(() => {
      expect(
        useSkillStore.getState().remoteStoreEntries["release-repo"]?.skills,
      ).toHaveLength(1);
    });

    expect(
      useSkillStore.getState().remoteStoreEntries["release-repo"]?.skills[0],
    ).toEqual(
      expect.objectContaining({
        source_url:
          "https://github.com/demo/skills/tree/release/skills/.curated/release-skill",
        content_url:
          "https://raw.githubusercontent.com/demo/skills/release/skills/.curated/release-skill/SKILL.md",
      }),
    );
  });

  it("shows same-name variants from different source ids in the same store", async () => {
    installWindowMocks({
      api: {
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

    useSkillStore.setState({
      selectedStoreSourceId: "same-name-source",
      registrySkills: [],
      remoteStoreEntries: {
        "same-name-source": {
          loadedAt: Date.now(),
          error: null,
          skills: [
            {
              slug: "writer",
              name: "Writer",
              install_name: "writer",
              source_id: "writer-main",
              source_branch: "main",
              description: "Stable writer",
              category: "general",
              author: "PromptHub",
              source_url: "https://github.com/example/skills/tree/main/writer",
              tags: ["writing"],
              version: "1.0.0",
              content: "# Writer\n\nMain\n",
            },
            {
              slug: "writer",
              name: "Writer",
              install_name: "writer",
              source_id: "writer-dev",
              source_branch: "dev",
              description: "Dev writer",
              category: "general",
              author: "PromptHub",
              source_url: "https://github.com/example/skills/tree/dev/writer",
              tags: ["writing"],
              version: "1.1.0-beta",
              content: "# Writer\n\nDev\n",
            },
          ],
        },
      },
      customStoreSources: [
        {
          id: "same-name-source",
          name: "Same Name Source",
          type: "marketplace-json",
          url: "https://example.com/same-name-store.json",
          enabled: true,
          createdAt: Date.now(),
        },
      ],
    } as never);

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    await waitFor(() => {
      expect(screen.getAllByText("Writer")).toHaveLength(2);
    });

    expect(
      screen.getAllByText("Same Name Source").length,
    ).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText("Stable")).not.toBeInTheDocument();
    expect(screen.queryByText("Dev")).not.toBeInTheDocument();
    expect(screen.queryByText("main")).not.toBeInTheDocument();
    expect(screen.getAllByText("dev").length).toBeGreaterThan(0);
  });

  it("opens the store detail when a remote card only has a slug selection id", async () => {
    installWindowMocks({
      api: {
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

    useSkillStore.setState({
      selectedStoreSourceId: "slug-only-source",
      registrySkills: [],
      remoteStoreEntries: {
        "slug-only-source": {
          loadedAt: Date.now(),
          error: null,
          skills: [
            {
              slug: "slug-only-writer",
              name: "Slug Only Writer",
              description: "Opens by slug",
              category: "general",
              author: "PromptHub",
              source_url: "https://example.com/slug-only-writer",
              tags: ["writing"],
              version: "1.0.0",
              content: "# Slug Only Writer\n\nDetail body",
            },
          ],
        },
      },
      customStoreSources: [
        {
          id: "slug-only-source",
          name: "Slug Only Source",
          type: "marketplace-json",
          url: "https://example.com/slug-only-store.json",
          enabled: true,
          createdAt: Date.now(),
        },
      ],
    } as never);

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    fireEvent.click(screen.getByText("Slug Only Writer"));

    await waitFor(() => {
      expect(screen.getByText("Detail body")).toBeInTheDocument();
    });
    expect(
      screen.getAllByText("Slug Only Source").length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      screen.queryByText("skills/slug-only-writer"),
    ).not.toBeInTheDocument();
    expect(useSkillStore.getState().selectedRegistrySlug).toBe(
      "slug-only-writer",
    );
  });

  it("shows local source badges in store detail", async () => {
    useSkillStore.setState({
      getTranslationState: vi.fn().mockReturnValue({
        value: null,
        hasTranslation: false,
        isStale: false,
      }),
    } as never);

    const skill = {
      slug: "writer",
      name: "Writer",
      source_id: "local-writer",
      source_label: "/tmp/skills",
      source_branch: "dev",
      description: "Local writer",
      category: "general",
      tags: ["writing"],
      version: "1.0.0",
      content: "# Writer\n\nLocal",
      source_url: "/tmp/skills/writer",
      content_url: "/tmp/skills/writer/SKILL.md",
      compatibility: ["claude"],
      author: "Local",
    } as never;

    await renderWithI18n(
      <SkillStoreDetail skill={skill} isInstalled={false} onClose={vi.fn()} />,
      { language: "en" },
    );

    expect(screen.getAllByText("Local").length).toBeGreaterThan(0);
    expect(screen.getByText("dev")).toBeInTheDocument();
    expect(screen.queryByText("Dev")).not.toBeInTheDocument();
  });

  it("does not show store versions in store detail", async () => {
    useSkillStore.setState({
      getTranslationState: vi.fn().mockReturnValue({
        value: null,
        hasTranslation: false,
        isStale: false,
      }),
    } as never);

    const skill: RegistrySkill = {
      slug: "placeholder-version",
      name: "Placeholder Version",
      source_id: "placeholder-version",
      description: "Placeholder version skill",
      category: "general",
      tags: [],
      version: "1.0.0",
      content: "# Placeholder Version\n\nNo display version.",
      source_url: "https://example.com/placeholder-version",
      author: "PromptHub",
    };

    await renderWithI18n(
      <SkillStoreDetail skill={skill} isInstalled={false} onClose={vi.fn()} />,
      { language: "en" },
    );

    expect(screen.queryByText("v1.0.0")).not.toBeInTheDocument();

    await renderWithI18n(
      <SkillStoreDetail
        skill={{
          ...skill,
          slug: "explicit-version",
          name: "Explicit Version",
          source_id: "explicit-version",
          version: "v2",
          content: "# Explicit Version\n\nNo display version.",
        }}
        isInstalled={false}
        onClose={vi.fn()}
      />,
      { language: "en" },
    );

    expect(screen.queryByText("v2")).not.toBeInTheDocument();
  });

  it("opens install review and enables confirmation with content scanning disabled", async () => {
    const scanSafety = vi.fn();
    installWindowMocks({
      api: {
        skill: {
          scanSafety,
        },
      },
    });
    useSettingsStore.setState({
      skillSafetyScanEnabled: false,
    } as never);
    useSkillStore.setState({
      getTranslationState: vi.fn().mockReturnValue({
        value: null,
        hasTranslation: false,
        isStale: false,
      }),
    } as never);
    const skill = {
      slug: "private-writer",
      name: "Private Writer",
      source_id: "source-private-writer",
      description: "Private Gitea writer",
      category: "general",
      tags: [],
      version: "1.0.0",
      content: "# Private Writer\n",
      source_url: "https://gitea.example.com/team/skills",
      author: "Team",
    } as never;

    await renderWithI18n(
      <SkillStoreDetail
        skill={skill}
        isInstalled={false}
        storeSourceId="team-gitea"
        storeSourceType="git-repo"
        onClose={vi.fn()}
      />,
      { language: "en" },
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Import to My Skills" }),
    );

    expect(
      await screen.findByRole("dialog", {
        name: "Review Skill before adding",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Confirm and add" }),
    ).toBeEnabled();
    expect(scanSafety).not.toHaveBeenCalled();
  });

  it("opens update review without an automatic scan when the resolved policy is disabled", async () => {
    const scanSafety = vi.fn();
    installWindowMocks({ api: { skill: { scanSafety } } });
    useSettingsStore.setState({
      autoScanStoreSkillsBeforeInstall: true,
      skillSafetyChannelPolicies: { "git-repo": "enabled" },
      skillSafetyStorePolicies: { "team-gitea": "disabled" },
    } as never);
    const installedSkill = createSkillFixture({
      id: "private-writer",
      name: "private-writer",
      source_id: "source-private-writer",
      source_url: "https://gitea.example.com/team/skills",
      content: "# Private Writer\n\nLocal\n",
      instructions: "# Private Writer\n\nLocal\n",
    });
    const registrySkill = {
      slug: "private-writer",
      name: "Private Writer",
      source_id: "source-private-writer",
      description: "Private Gitea writer",
      category: "general",
      tags: [],
      version: "2.0.0",
      content: "# Private Writer\n\nRemote\n",
      source_url: "https://gitea.example.com/team/skills",
      author: "Team",
    } as never;
    useSkillStore.setState({
      skills: [installedSkill],
      getTranslationState: vi.fn().mockReturnValue({
        value: null,
        hasTranslation: false,
        isStale: false,
      }),
      getRegistrySkillUpdateStatus: vi.fn().mockResolvedValue({
        status: "update-available",
        installedSkill,
        registrySkill,
        localHash: "local",
        remoteHash: "remote",
        remoteContent: "# Private Writer\n\nRemote\n",
      }),
    } as never);

    await renderWithI18n(
      <SkillStoreDetail
        skill={registrySkill}
        isInstalled={true}
        storeSourceId="team-gitea"
        storeSourceType="git-repo"
        onClose={vi.fn()}
      />,
      { language: "en" },
    );
    fireEvent.click(screen.getByRole("button", { name: "Check update" }));

    expect(
      await screen.findByRole("dialog", { name: "Review Skill update" }),
    ).toBeInTheDocument();
    expect(scanSafety).not.toHaveBeenCalled();
  });

  it("loads git-repo store sources through SSH scan when given git@github.com URLs", async () => {
    const fetchRemoteContent = vi.fn();
    const scanRemoteGithub = vi.fn().mockResolvedValue([
      {
        slug: "superpowers",
        name: "superpowers",
        install_name: "superpowers",
        source_id: "source-superpowers-ssh",
        description: "SSH scanned store skill",
        category: "dev",
        author: "obra",
        source_url: "/tmp/ssh-store/superpowers",
        content_url: "/tmp/ssh-store/superpowers",
        tags: ["dev"],
        version: "1.0.0",
        content: "# superpowers",
        compatibility: ["claude", "cursor"],
      },
    ]);

    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent,
          scanRemoteGithub,
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
      customStoreSources: [
        {
          id: "ssh-repo",
          name: "SSH Repo",
          type: "git-repo",
          url: "git@github.com:obra/superpowers.git",
          enabled: true,
          createdAt: Date.now(),
        },
      ],
      selectedStoreSourceId: "ssh-repo",
    });

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    await waitFor(() => {
      expect(
        useSkillStore.getState().remoteStoreEntries["ssh-repo"]?.skills,
      ).toHaveLength(1);
    });

    expect(scanRemoteGithub).toHaveBeenCalledWith(
      "git@github.com:obra/superpowers.git",
      expect.any(Array),
      undefined,
      undefined,
    );
    expect(fetchRemoteContent).not.toHaveBeenCalled();
  });

  it("loads self-hosted HTTPS git-repo store sources through clone-based scan", async () => {
    const fetchRemoteContent = vi.fn();
    const scanRemoteGithub = vi.fn().mockResolvedValue([
      {
        slug: "icelemon-skill",
        name: "icelemon-skill",
        install_name: "icelemon-skill",
        source_label: "icelemon/skills",
        source_branch: "main",
        source_id: "source-icelemon-gitea",
        description: "Gitea scanned store skill",
        category: "dev",
        author: "icelemon",
        source_url: "https://gitea.example.com/icelemon/skills/tree/main",
        tags: ["dev"],
        version: "1.0.0",
        content: "# icelemon",
        compatibility: ["claude", "cursor"],
      },
    ]);

    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent,
          scanRemoteGithub,
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
      customStoreSources: [
        {
          id: "gitea-repo",
          name: "Gitea Repo",
          type: "git-repo",
          url: "https://gitea.example.com/icelemon/skills",
          enabled: true,
          createdAt: Date.now(),
        },
      ],
      selectedStoreSourceId: "gitea-repo",
    });

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    await waitFor(() => {
      expect(
        useSkillStore.getState().remoteStoreEntries["gitea-repo"]?.skills,
      ).toHaveLength(1);
    });

    await act(async () => {
      screen.getByText("icelemon-skill").click();
    });

    expect(screen.getAllByText("Gitea Repo").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryAllByText("Git")).toHaveLength(0);
    expect(screen.queryAllByText("Local")).toHaveLength(0);

    expect(scanRemoteGithub).toHaveBeenCalledWith(
      "https://gitea.example.com/icelemon/skills",
      expect.any(Array),
      undefined,
      undefined,
    );
    expect(fetchRemoteContent).not.toHaveBeenCalled();
  });

  it("shows a spinner on the store card while quick install is pending", async () => {
    let resolveInstall: (value: unknown) => void = () => {};
    const installRegistrySkill = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveInstall = resolve;
        }),
    );
    const scanRemoteGithub = vi.fn().mockResolvedValue([
      {
        slug: "icelemon-skill",
        name: "icelemon-skill",
        install_name: "icelemon-skill",
        source_label: "icelemon/skills",
        source_branch: "main",
        source_id: "source-icelemon-gitea",
        description: "Gitea scanned store skill",
        category: "dev",
        author: "icelemon",
        source_url: "https://gitea.example.com/icelemon/skills/tree/main",
        tags: ["dev"],
        version: "1.0.0",
        content: "# icelemon",
        compatibility: ["claude", "cursor"],
      },
    ]);

    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent: vi.fn(),
          scanRemoteGithub,
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
      installRegistrySkill,
      customStoreSources: [
        {
          id: "gitea-pending-repo",
          name: "Gitea Pending Repo",
          type: "git-repo",
          url: "https://gitea.example.com/icelemon/skills",
          enabled: true,
          createdAt: Date.now(),
        },
      ],
      selectedStoreSourceId: "gitea-pending-repo",
    } as never);

    const { container } = await renderWithI18n(<SkillStore />, {
      language: "en",
    });

    await waitFor(() => {
      expect(screen.getByText("icelemon-skill")).toBeInTheDocument();
    });

    const card = screen.getByText("icelemon-skill").closest(".group");
    expect(card).not.toBeNull();

    await act(async () => {
      fireEvent.click(within(card as HTMLElement).getByTitle("Import"));
    });

    expect(installRegistrySkill).toHaveBeenCalledWith(
      expect.objectContaining({ source_id: "source-icelemon-gitea" }),
    );
    expect(container.querySelector(".animate-spin")).not.toBeNull();
    expect(screen.getByTitle("Installing...")).toBeDisabled();

    await act(async () => {
      resolveInstall({ id: "installed", name: "icelemon-skill" });
    });
  });

  it("labels quick-install package persistence errors as install failures", async () => {
    const installRegistrySkill = vi
      .fn()
      .mockRejectedValue(
        new Error("SKILL.md not found in directory: skills/demo"),
      );
    const scanRemoteGithub = vi.fn().mockResolvedValue([
      {
        slug: "demo",
        name: "demo",
        install_name: "demo",
        source_label: "icelemon/skills",
        source_id: "source-demo",
        description: "Demo scanned store skill",
        category: "general",
        author: "icelemon",
        source_url: "https://gitea.example.com/icelemon/skills",
        source_directory: "skills/demo",
        canonical_skill_path: "skills/demo/SKILL.md",
        tags: [],
        version: "1.0.0",
        content: "# Demo",
        compatibility: ["claude"],
      },
    ]);

    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent: vi.fn(),
          scanRemoteGithub,
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
      installRegistrySkill,
      customStoreSources: [
        {
          id: "gitea-error-repo",
          name: "Gitea Error Repo",
          type: "git-repo",
          url: "https://gitea.example.com/icelemon/skills",
          enabled: true,
          createdAt: Date.now(),
        },
      ],
      selectedStoreSourceId: "gitea-error-repo",
    } as never);

    await renderWithI18n(<SkillStore />, { language: "en" });

    await waitFor(() => {
      expect(screen.getByText("demo")).toBeInTheDocument();
    });

    const card = screen.getByText("demo").closest(".group");
    expect(card).not.toBeNull();

    await act(async () => {
      fireEvent.click(within(card as HTMLElement).getByTitle("Import"));
    });

    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining("Install failed"),
      "error",
    );
    expect(showToast).not.toHaveBeenCalledWith(
      expect.stringContaining("Safety scan failed"),
      "error",
    );
  });

  it("keeps imported state after refreshing a self-hosted git source", async () => {
    const scanRemoteGithub = vi
      .fn()
      .mockResolvedValueOnce([
        {
          slug: "writer",
          name: "writer",
          install_name: "writer",
          source_label: "icelemon/skills",
          source_branch: "main",
          source_directory: "skills/writer",
          canonical_skill_path: "skills/writer/SKILL.md",
          source_id: "stable-writer-source-id",
          description: "Writer skill",
          category: "dev",
          author: "icelemon",
          source_url:
            "https://gitea.example.com/icelemon/skills/tree/main/skills/writer",
          tags: ["dev"],
          version: "1.0.0",
          content: "# writer",
          compatibility: ["claude", "cursor"],
        },
      ])
      .mockResolvedValueOnce([
        {
          slug: "writer",
          name: "writer",
          install_name: "writer",
          source_label: "icelemon/skills",
          source_branch: "main",
          source_directory: "skills/writer",
          canonical_skill_path: "skills/writer/SKILL.md",
          source_id: "stable-writer-source-id",
          description: "Writer skill",
          category: "dev",
          author: "icelemon",
          source_url:
            "https://gitea.example.com/icelemon/skills/tree/main/skills/writer",
          tags: ["dev"],
          version: "1.0.0",
          content: "# writer",
          compatibility: ["claude", "cursor"],
        },
      ]);

    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent: vi.fn(),
          scanRemoteGithub,
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
      skills: [
        {
          id: "installed-writer",
          name: "writer",
          source_id: "stable-writer-source-id",
          source_url:
            "https://gitea.example.com/icelemon/skills/tree/main/skills/writer",
          protocol_type: "skill",
          author: "icelemon",
          tags: ["dev"],
          is_favorite: false,
          currentVersion: 0,
          created_at: 1,
          updated_at: 1,
        },
      ],
      customStoreSources: [
        {
          id: "gitea-refresh-repo",
          name: "Gitea Refresh Repo",
          type: "git-repo",
          url: "https://gitea.example.com/icelemon/skills",
          enabled: true,
          createdAt: Date.now(),
        },
      ],
      selectedStoreSourceId: "gitea-refresh-repo",
    } as never);

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    await waitFor(() => {
      expect(
        useSkillStore.getState().remoteStoreEntries["gitea-refresh-repo"]
          ?.skills,
      ).toHaveLength(1);
    });

    await waitFor(() => {
      expect(screen.getAllByText("Imported").length).toBeGreaterThan(0);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /refresh/i }));
    });

    await waitFor(() => {
      expect(scanRemoteGithub).toHaveBeenCalledTimes(2);
    });

    await waitFor(() => {
      expect(screen.getAllByText("Imported").length).toBeGreaterThan(0);
    });
  });

  it("binds the catalog search box to storeSearchQuery", async () => {
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
      selectedStoreSourceId: "official",
      registrySkills: [
        {
          slug: "pdf-skill",
          source_id: "source-pdf-skill",
          name: "PDF Skill",
          description: "Use this whenever you work with PDFs",
          category: "office",
          author: "PromptHub",
          source_url: "https://example.com/pdf-skill",
          tags: ["pdf"],
          version: "1.0.0",
          content: "# PDF Skill",
        },
        {
          slug: "canvas-design",
          source_id: "source-canvas-design",
          name: "Canvas Design",
          description: "Create beautiful visual layouts",
          category: "design",
          author: "PromptHub",
          source_url: "https://example.com/canvas-design",
          tags: ["design"],
          version: "1.0.0",
          content: "# Canvas Design",
        },
      ],
      storeSearchQuery: "pdf",
      storeCategory: "all",
    });

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    expect(
      screen.queryByPlaceholderText("Search skills..."),
    ).not.toBeInTheDocument();
    expect(useSkillStore.getState().storeSearchQuery).toBe("pdf");
  });
});
