import type { ReactNode } from "react";
import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SkillManager } from "../../../src/renderer/components/skill/SkillManager";
import type { Skill } from "../../../src/shared/types";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

const useSkillStoreMock = vi.fn();
const useSettingsStoreMock = vi.fn();
const useToastMock = vi.fn();

vi.mock("../../../src/renderer/stores/skill.store", () => ({
  useSkillStore: (selector: (state: Record<string, unknown>) => unknown) =>
    useSkillStoreMock(selector),
}));

vi.mock("../../../src/renderer/stores/settings.store", () => ({
  useSettingsStore: (selector: (state: Record<string, unknown>) => unknown) =>
    useSettingsStoreMock(selector),
}));

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => useToastMock(),
}));

vi.mock("../../../src/renderer/components/skill/SkillGalleryCard", () => ({
  SkillGalleryCard: ({ skill }: { skill: Skill }) => (
    <article data-testid="skill-card">
      <h3>{skill.name}</h3>
    </article>
  ),
}));

vi.mock("../../../src/renderer/components/skill/SkillQuickInstall", () => ({
  SkillQuickInstall: () => null,
}));

vi.mock("../../../src/renderer/components/ui/ConfirmDialog", () => ({
  ConfirmDialog: () => null,
}));

vi.mock("../../../src/renderer/components/skill/SkillRenderBoundary", () => ({
  SkillRenderBoundary: ({ children }: { children: ReactNode }) => children,
}));

function createSkill(index: number): Skill {
  return {
    id: `skill-${index}`,
    name: `skill-${String(index).padStart(4, "0")}`,
    description: `Skill ${index}`,
    instructions: `# Skill ${index}`,
    content: `# Skill ${index}`,
    protocol_type: "skill",
    author: "Local",
    local_repo_path: `/tmp/skill-${index}`,
    tags: [`tag-${index % 10}`],
    is_favorite: index % 11 === 0,
    currentVersion: 0,
    created_at: index,
    updated_at: index,
  };
}

function createSkillStoreState(skills: Skill[]) {
  const neverSettled = new Promise<void>(() => {});
  return {
    skills,
    loadSkills: vi.fn().mockImplementation(() => neverSettled),
    deleteSkill: vi.fn().mockResolvedValue(undefined),
    toggleFavorite: vi.fn().mockResolvedValue(undefined),
    updateSkill: vi.fn().mockResolvedValue(undefined),
    isLoading: false,
    selectedSkillId: null,
    selectSkill: vi.fn(),
    filterType: "all",
    searchQuery: "",
    viewMode: "gallery",
    setViewMode: vi.fn(),
    storeView: "my-skills",
    deployedSkillNames: new Set<string>(),
    loadDeployedStatus: vi.fn().mockImplementation(() => neverSettled),
    filterTags: [],
    scanLocalPreview: vi.fn().mockResolvedValue([]),
    importScannedSkills: vi.fn().mockResolvedValue({ importedCount: 0 }),
  };
}

describe("SkillManager large dataset integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    installWindowMocks();
    useToastMock.mockReturnValue({ showToast: vi.fn() });
    useSettingsStoreMock.mockImplementation((selector) =>
      selector({
        customSkillScanPaths: [],
        translationMode: "full",
        skillInstallMethod: "symlink",
      }),
    );
  });

  afterEach(async () => {
    await act(async () => {
      vi.runOnlyPendingTimers();
    });
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("renders only the initial chunk for 1000 skills in gallery mode", async () => {
    const skills = Array.from({ length: 1000 }, (_, index) => createSkill(index));
    const skillStoreState = createSkillStoreState(skills);
    useSkillStoreMock.mockImplementation((selector) => selector(skillStoreState));

    await act(async () => {
      await renderWithI18n(<SkillManager />, { language: "en" });
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText("skill-0000")).toBeInTheDocument();
    expect(screen.queryByText("skill-0999")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("skill-card")).toHaveLength(120);
    expect(
      screen.getByText("Rendering 120/1000 in chunks"),
    ).toBeInTheDocument();
  });
});
