import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SkillStore } from "../../../src/renderer/components/skill/SkillStore";
import { useSkillStore } from "../../../src/renderer/stores/skill.store";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
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
    selectedStoreSourceId: "official",
    remoteStoreEntries: {},
    translationCache: {},
  });
};

describe("SkillStore empty custom source", () => {
  beforeEach(() => {
    showToast.mockReset();
    localStorage.clear();
    resetSkillStore();
    useSettingsStore.setState({
      device: {
        storeAutoSync: false,
        storeSyncCadence: "manual",
      },
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);
  });

  it("explains when a marketplace JSON source loads successfully with zero skills", async () => {
    const fetchRemoteContent = vi.fn().mockResolvedValue(
      JSON.stringify({
        total: 0,
        skills: [],
      }),
    );

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
          id: "skillhub",
          createdAt: 1,
          name: "SkillHub",
          type: "marketplace-json",
          url: "https://skillhub.example/skills.json",
          enabled: true,
        },
      ],
      selectedStoreSourceId: "skillhub",
    });

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    await waitFor(() => {
      expect(fetchRemoteContent).toHaveBeenCalledWith(
        "https://skillhub.example/skills.json",
      );
      expect(
        screen.getByText(
          /This source loaded successfully, but its registry contains 0 skills\./u,
        ),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        /Check that the marketplace JSON has a non-empty skills array or nested registries, then refresh this source\./u,
      ),
    ).toBeInTheDocument();
  });

  it("blocks adding a marketplace JSON source that has no skills or nested registries", async () => {
    const fetchRemoteContent = vi.fn().mockResolvedValue(
      JSON.stringify({
        total: 0,
        skills: [],
      }),
    );

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
      selectedStoreSourceId: "new-custom",
    });

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    expect(
      screen.getByRole("button", { name: /Marketplace JSON/u }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.change(screen.getByRole("textbox", { name: "Store name" }), {
      target: { value: "SkillHub" },
    });
    fireEvent.change(
      screen.getByRole("textbox", { name: "Store URL / manifest URL" }),
      { target: { value: "https://skillhub.example/skills.json" } },
    );

    await act(async () => {
      screen.getByRole("button", { name: "Add" }).click();
    });

    await waitFor(() => {
      expect(fetchRemoteContent).toHaveBeenCalledWith(
        "https://skillhub.example/skills.json",
      );
      expect(showToast).toHaveBeenCalledWith(
        "Marketplace JSON loaded, but it contains no skills or nested registries.",
        "error",
      );
    });
    expect(useSkillStore.getState().customStoreSources).toHaveLength(0);
  });
});
