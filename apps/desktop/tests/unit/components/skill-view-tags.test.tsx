import { act, render, screen } from "@testing-library/react";
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

  it("shows variant badges in gallery cards", () => {
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
        skill={{
          ...baseSkill,
          is_builtin: true,
          source_url:
            "https://github.com/openai/skills/tree/dev/skills/.curated/writer",
        } as any}
      />,
    );

    expect(screen.getByText("Official")).toBeInTheDocument();
    expect(screen.getByText("Dev")).toBeInTheDocument();
    expect(screen.getAllByText("Update available").length).toBeGreaterThan(0);
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
        <SkillListView
          skills={[baseSkill as any]}
          onQuickInstall={vi.fn()}
        />,
        { language: "en" },
      );
    });

    expect(screen.getByText("writing")).toBeInTheDocument();
    expect(screen.getByText("docs")).toBeInTheDocument();
    expect(screen.getByText("workflow")).toBeInTheDocument();
    expect(screen.queryByText("extra")).not.toBeInTheDocument();
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

    expect(screen.getByText("Local")).toBeInTheDocument();
  });
});
