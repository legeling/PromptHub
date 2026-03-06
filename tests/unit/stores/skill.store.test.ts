import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/renderer/services/ai", () => ({
  chatCompletion: vi.fn(),
}));

import { useSkillStore } from "../../../src/renderer/stores/skill.store";

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
    storeView: "my-skills",
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
  localStorage.clear();
};

describe("skill store", () => {
  beforeEach(() => {
    resetSkillStore();

    (window as any).api = {
      skill: {
        update: vi.fn(),
        writeLocalFile: vi.fn(),
        getRepoPath: vi.fn(),
      },
    };
  });

  it("applies deployed and tag filters in getFilteredSkills", () => {
    useSkillStore.setState({
      skills: [
        {
          id: "skill-1",
          name: "alpha",
          tags: ["team", "ops"],
          protocol_type: "skill",
          is_favorite: false,
          created_at: 1,
          updated_at: 1,
        } as any,
        {
          id: "skill-2",
          name: "beta",
          tags: ["docs"],
          protocol_type: "skill",
          is_favorite: false,
          created_at: 1,
          updated_at: 1,
        } as any,
      ],
      filterType: "deployed",
      filterTags: ["team"],
      deployedSkillNames: new Set(["alpha"]),
    });

    expect(useSkillStore.getState().getFilteredSkills().map((skill) => skill.id)).toEqual([
      "skill-1",
    ]);
  });

  it("falls back to official source when removing the selected custom source", () => {
    useSkillStore.setState({
      customStoreSources: [
        {
          id: "custom-1",
          name: "Custom",
          type: "marketplace-json",
          url: "https://example.com/skills.json",
          enabled: true,
          createdAt: 1,
        },
      ],
      selectedStoreSourceId: "custom-1",
      remoteStoreEntries: {
        "custom-1": {
          loadedAt: 1,
          skills: [],
        },
      },
    });

    useSkillStore.getState().removeCustomStoreSource("custom-1");

    const state = useSkillStore.getState();
    expect(state.selectedStoreSourceId).toBe("official");
    expect(state.customStoreSources).toHaveLength(0);
    expect(state.remoteStoreEntries["custom-1"]).toBeUndefined();
  });

  it("syncs an intentionally empty SKILL.md back to the local repo on update", async () => {
    const update = vi.fn().mockResolvedValue({
      id: "skill-1",
      name: "alpha",
      instructions: "",
      content: "",
      local_repo_path: "/tmp/skills/alpha",
      protocol_type: "skill",
      is_favorite: false,
      created_at: 1,
      updated_at: 2,
    });
    const writeLocalFile = vi.fn().mockResolvedValue(undefined);
    const getRepoPath = vi.fn().mockResolvedValue("/tmp/skills/alpha");

    (window as any).api.skill.update = update;
    (window as any).api.skill.writeLocalFile = writeLocalFile;
    (window as any).api.skill.getRepoPath = getRepoPath;

    useSkillStore.setState({
      skills: [
        {
          id: "skill-1",
          name: "alpha",
          instructions: "old content",
          content: "old content",
          protocol_type: "skill",
          is_favorite: false,
          created_at: 1,
          updated_at: 1,
        } as any,
      ],
    });

    await useSkillStore.getState().updateSkill("skill-1", {
      instructions: "",
      content: "",
    });

    expect(writeLocalFile).toHaveBeenCalledWith("skill-1", "SKILL.md", "");
    expect(useSkillStore.getState().skills[0]?.local_repo_path).toBe(
      "/tmp/skills/alpha",
    );
  });
});
