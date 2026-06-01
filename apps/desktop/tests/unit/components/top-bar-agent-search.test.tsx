import { act, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TopBar } from "../../../src/renderer/components/layout/TopBar";
import { useFolderStore } from "../../../src/renderer/stores/folder.store";
import { usePromptStore } from "../../../src/renderer/stores/prompt.store";
import { useRulesStore } from "../../../src/renderer/stores/rules.store";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { useSkillStore } from "../../../src/renderer/stores/skill.store";
import { useUIStore } from "../../../src/renderer/stores/ui.store";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

describe("TopBar Agent Skill search", () => {
  beforeEach(() => {
    installWindowMocks();
    usePromptStore.setState({
      prompts: [],
      searchQuery: "",
    } as Partial<ReturnType<typeof usePromptStore.getState>>);
    useFolderStore.setState({
      folders: [],
      selectedFolderId: null,
    } as Partial<ReturnType<typeof useFolderStore.getState>>);
    useRulesStore.setState({
      files: [],
      searchQuery: "",
    } as Partial<ReturnType<typeof useRulesStore.getState>>);
    useSettingsStore.setState({
      aiApiKey: "",
      aiModels: [],
      creationMode: "manual",
      isDarkMode: false,
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);
    useSkillStore.setState({
      deployedSkillNames: new Set<string>(),
      filterTags: [],
      filterType: "all",
      projectScanState: {},
      searchQuery: "ada",
      selectedProjectId: null,
      selectedStoreSourceId: "official",
      skills: [],
      storeCategory: "all",
      storeSearchQuery: "",
      storeView: "agents",
    } as Partial<ReturnType<typeof useSkillStore.getState>>);
    useUIStore.setState({
      appModule: "skill",
      isSidebarCollapsed: false,
      viewMode: "skill",
    } as Partial<ReturnType<typeof useUIStore.getState>>);
  });

  it("uses one global Agent Skill search box without showing library no-result state", async () => {
    await act(async () => {
      await renderWithI18n(
        <TopBar onOpenSettings={vi.fn()} updateAvailable={null} />,
        { language: "zh" },
      );
    });

    expect(screen.getByPlaceholderText("搜索 Agent Skill...")).toHaveValue("ada");
    expect(screen.queryByText("无结果")).not.toBeInTheDocument();
  });
});
