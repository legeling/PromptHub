import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SkillGalleryCard } from "../../../src/renderer/components/skill/SkillGalleryCard";
import { SkillListView } from "../../../src/renderer/components/skill/SkillListView";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

vi.mock("../../../src/renderer/components/ui/PlatformIcon", () => ({
  PlatformIcon: () => null,
}));

const baseSkill = {
  id: "skill-1",
  name: "Writer Helper",
  description: "Helps draft docs",
  tags: ["writing", "docs", "workflow", "extra"],
  protocol_type: "skill",
  is_favorite: false,
  created_at: Date.now(),
  updated_at: Date.now(),
};

describe("skill view tags", () => {
  it("shows tags in gallery cards", () => {
    render(
      <SkillGalleryCard
        animationDelayMs={0}
        isSelected={false}
        isSelectionMode={false}
        onDelete={vi.fn()}
        onOpen={vi.fn()}
        onQuickInstall={vi.fn()}
        onToggleFavorite={vi.fn()}
        onToggleSelection={vi.fn()}
        skill={baseSkill as any}
      />,
    );

    expect(screen.getByText("writing")).toBeInTheDocument();
    expect(screen.getByText("docs")).toBeInTheDocument();
    expect(screen.getByText("workflow")).toBeInTheDocument();
    expect(screen.getByText("extra")).toBeInTheDocument();
  });

  it("shows readable source badges in gallery cards", () => {
    render(
      <SkillGalleryCard
        animationDelayMs={0}
        hasStoreUpdate={true}
        isSelected={false}
        isSelectionMode={false}
        onDelete={vi.fn()}
        onOpen={vi.fn()}
        onQuickInstall={vi.fn()}
        onToggleFavorite={vi.fn()}
        onToggleSelection={vi.fn()}
        skill={
          {
            ...baseSkill,
            is_builtin: true,
            source_url:
              "https://github.com/openai/skills/tree/dev/skills/.curated/writer",
          } as any
        }
      />,
    );

    expect(screen.getByText("OpenAI Codex Store")).toBeInTheDocument();
    expect(screen.getByText("dev")).toBeInTheDocument();
    expect(screen.queryByText("Official")).not.toBeInTheDocument();
    expect(screen.queryByText("Dev")).not.toBeInTheDocument();
    expect(screen.queryByText(".../.curated/writer")).not.toBeInTheDocument();
    expect(screen.getAllByText("Update available").length).toBeGreaterThan(0);
  });

  it("does not expose repo labels as source badges", () => {
    render(
      <SkillGalleryCard
        animationDelayMs={0}
        isSelected={false}
        isSelectionMode={false}
        onDelete={vi.fn()}
        onOpen={vi.fn()}
        onQuickInstall={vi.fn()}
        onToggleFavorite={vi.fn()}
        onToggleSelection={vi.fn()}
        skill={
          {
            ...baseSkill,
            is_builtin: true,
            registry_slug: "writer",
            source_label: "some-owner/some-repo",
            source_url:
              "https://github.com/some-owner/some-repo/tree/main/writer",
          } as any
        }
      />,
    );

    expect(screen.getByText("GitHub Import")).toBeInTheDocument();
    expect(screen.queryByText("some-owner/some-repo")).not.toBeInTheDocument();
    expect(screen.queryByText("Stable")).not.toBeInTheDocument();
    expect(screen.queryByText("main")).not.toBeInTheDocument();
  });

  it("shows the branch name for non-default branch imports", () => {
    render(
      <SkillGalleryCard
        animationDelayMs={0}
        isSelected={false}
        isSelectionMode={false}
        onDelete={vi.fn()}
        onOpen={vi.fn()}
        onQuickInstall={vi.fn()}
        onToggleFavorite={vi.fn()}
        onToggleSelection={vi.fn()}
        skill={
          {
            ...baseSkill,
            source_branch: "feature/search",
            source_url:
              "https://gitea.example.com/team/skills/tree/feature%2Fsearch/writer",
          } as any
        }
      />,
    );

    expect(screen.getByText("Gitea Import")).toBeInTheDocument();
    expect(screen.getByText("feature/search")).toBeInTheDocument();
  });

  it("uses specific remote git source badges", () => {
    const remoteSkills = [
      {
        ...baseSkill,
        id: "gitea-skill",
        source_url: "https://gitea.example.com/team/skills/tree/main/writer",
      },
      {
        ...baseSkill,
        id: "gitee-skill",
        source_url: "https://gitee.com/team/skills/tree/main/writer",
      },
      {
        ...baseSkill,
        id: "git-skill",
        source_url: "https://git.example.com/team/skills/tree/main/writer",
      },
    ];

    render(
      <>
        {remoteSkills.map((skill) => (
          <SkillGalleryCard
            key={skill.id}
            animationDelayMs={0}
            isSelected={false}
            isSelectionMode={false}
            onDelete={vi.fn()}
            onOpen={vi.fn()}
            onQuickInstall={vi.fn()}
            onToggleFavorite={vi.fn()}
            onToggleSelection={vi.fn()}
            skill={skill as any}
          />
        ))}
      </>,
    );

    expect(screen.getByText("Gitea Import")).toBeInTheDocument();
    expect(screen.getByText("Gitee Import")).toBeInTheDocument();
    expect(screen.getByText("Git Import")).toBeInTheDocument();
    expect(screen.queryByText("Remote Import")).not.toBeInTheDocument();
  });

  it("shows specific agent platform source badges instead of generic local import", () => {
    render(
      <>
        <SkillGalleryCard
          animationDelayMs={0}
          isSelected={false}
          isSelectionMode={false}
          onDelete={vi.fn()}
          onOpen={vi.fn()}
          onQuickInstall={vi.fn()}
          onToggleFavorite={vi.fn()}
          onToggleSelection={vi.fn()}
          skill={
            {
              ...baseSkill,
              id: "cherry-agent",
              source_url:
                "/Users/demo/Library/Application Support/CherryStudio/Data/Skills/skill-creator",
            } as any
          }
        />
        <SkillGalleryCard
          animationDelayMs={0}
          isSelected={false}
          isSelectionMode={false}
          onDelete={vi.fn()}
          onOpen={vi.fn()}
          onQuickInstall={vi.fn()}
          onToggleFavorite={vi.fn()}
          onToggleSelection={vi.fn()}
          skill={
            {
              ...baseSkill,
              id: "claude-agent",
              source_url: "/Users/demo/.claude/skills/alphafold-database",
            } as any
          }
        />
      </>,
    );

    expect(screen.getByText("Cherry Studio Import")).toBeInTheDocument();
    expect(screen.getByText("Claude Code Import")).toBeInTheDocument();
    expect(screen.queryByText("Local Import")).not.toBeInTheDocument();
  });

  it("keeps project skill folders distinct from global agent platform imports", () => {
    render(
      <SkillGalleryCard
        animationDelayMs={0}
        isSelected={false}
        isSelectionMode={false}
        onDelete={vi.fn()}
        onOpen={vi.fn()}
        onQuickInstall={vi.fn()}
        onToggleFavorite={vi.fn()}
        onToggleSelection={vi.fn()}
        skill={
          {
            ...baseSkill,
            source_url:
              "/Users/demo/workspace/.claude/skills/alphafold-database",
          } as any
        }
      />,
    );

    expect(screen.getByText("Project Import")).toBeInTheDocument();
    expect(screen.queryByText("Claude Code Import")).not.toBeInTheDocument();
  });

  it("uses custom store labels when they are user-readable", () => {
    render(
      <SkillGalleryCard
        animationDelayMs={0}
        isSelected={false}
        isSelectionMode={false}
        onDelete={vi.fn()}
        onOpen={vi.fn()}
        onQuickInstall={vi.fn()}
        onToggleFavorite={vi.fn()}
        onToggleSelection={vi.fn()}
        skill={
          {
            ...baseSkill,
            is_builtin: true,
            registry_slug: "writer",
            source_label: "Team Store",
            source_url:
              "https://github.com/some-owner/some-repo/tree/main/writer",
          } as any
        }
      />,
    );

    expect(screen.getByText("Team Store")).toBeInTheDocument();
  });

  it("shows up to three tags in list view rows", async () => {
    installWindowMocks({
      api: {
        skill: {
          getSupportedPlatforms: vi.fn().mockResolvedValue([]),
          detectPlatforms: vi.fn().mockResolvedValue([]),
          getMdInstallStatusBatch: vi.fn().mockResolvedValue({}),
        },
      },
    });

    await act(async () => {
      await renderWithI18n(
        <SkillListView skills={[baseSkill as any]} onQuickInstall={vi.fn()} />,
        { language: "en" },
      );
    });

    expect(screen.getByText("writing")).toBeInTheDocument();
    expect(screen.getByText("docs")).toBeInTheDocument();
    expect(screen.getByText("workflow")).toBeInTheDocument();
    expect(screen.queryByText("extra")).not.toBeInTheDocument();
  });

  it("does not animate virtualized list rows on mount", async () => {
    installWindowMocks({
      api: {
        skill: {
          getSupportedPlatforms: vi.fn().mockResolvedValue([]),
          detectPlatforms: vi.fn().mockResolvedValue([]),
          getMdInstallStatusBatch: vi.fn().mockResolvedValue({}),
        },
      },
    });

    await act(async () => {
      await renderWithI18n(
        <SkillListView skills={[baseSkill as any]} onQuickInstall={vi.fn()} />,
        { language: "en" },
      );
    });

    const row = screen.getByText("Writer Helper").closest('[data-index="0"]');

    expect(row).not.toBeNull();
    expect(row).not.toHaveClass("animate-in");
    expect(row).not.toHaveClass("fade-in");
    expect(row).not.toHaveClass("slide-in-from-left-2");
    expect(row).not.toHaveStyle({ animationDelay: "0ms" });
  });

  it("shows local badges in list view rows", async () => {
    installWindowMocks({
      api: {
        skill: {
          getSupportedPlatforms: vi.fn().mockResolvedValue([]),
          detectPlatforms: vi.fn().mockResolvedValue([]),
          getMdInstallStatusBatch: vi.fn().mockResolvedValue({}),
        },
      },
    });

    await act(async () => {
      await renderWithI18n(
        <SkillListView
          skills={[
            {
              ...baseSkill,
              source_url: "/tmp/local-skills/writer",
            } as any,
          ]}
          onQuickInstall={vi.fn()}
        />,
        { language: "en" },
      );
    });

    expect(screen.getByText("Local Import")).toBeInTheDocument();
  });

  it("refreshes stale platform status for an already-rendered skill row", async () => {
    const getMdInstallStatusBatch = vi
      .fn()
      .mockResolvedValueOnce({
        "skill-status-refresh": { claude: false },
      })
      .mockResolvedValueOnce({
        "skill-status-refresh": { claude: true },
      });
    installWindowMocks({
      api: {
        skill: {
          getSupportedPlatforms: vi
            .fn()
            .mockResolvedValue([{ id: "claude", name: "Claude Code" }]),
          detectPlatforms: vi.fn().mockResolvedValue(["claude"]),
          getMdInstallStatusBatch,
        },
      },
    });
    const rowSkill = {
      ...baseSkill,
      id: "skill-status-refresh",
      name: "Status Refresh",
    };

    const view = await renderWithI18n(
      <SkillListView skills={[rowSkill as any]} onQuickInstall={vi.fn()} />,
      { language: "en" },
    );

    await waitFor(() => {
      expect(
        screen.getByTitle("Claude Code: Not installed"),
      ).toBeInTheDocument();
    });

    await act(async () => {
      view.rerender(
        <SkillListView
          skills={[{ ...rowSkill } as any]}
          onQuickInstall={vi.fn()}
        />,
      );
    });

    await waitFor(() => {
      expect(screen.getByTitle("Claude Code: Installed")).toBeInTheDocument();
    });
    expect(getMdInstallStatusBatch).toHaveBeenCalledTimes(2);
  });

  it("distinguishes project imports from local imports", async () => {
    installWindowMocks({
      api: {
        skill: {
          getSupportedPlatforms: vi.fn().mockResolvedValue([]),
          detectPlatforms: vi.fn().mockResolvedValue([]),
          getMdInstallStatusBatch: vi.fn().mockResolvedValue({}),
        },
      },
    });

    await act(async () => {
      await renderWithI18n(
        <SkillListView
          skills={[
            {
              ...baseSkill,
              id: "skill-project",
              source_url: "/workspace/app/.claude/skills/writer",
            } as any,
          ]}
          onQuickInstall={vi.fn()}
        />,
        { language: "en" },
      );
    });

    expect(screen.getByText("Project Import")).toBeInTheDocument();
  });
});
