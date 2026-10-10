import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Skill } from "@prompthub/shared/types";

import { MainContent } from "../../../src/renderer/components/layout/MainContent";
import { Sidebar } from "../../../src/renderer/components/layout/Sidebar";
import { ToastProvider } from "../../../src/renderer/components/ui/Toast";
import { useFolderStore } from "../../../src/renderer/stores/folder.store";
import { usePromptStore } from "../../../src/renderer/stores/prompt.store";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { useSkillStore } from "../../../src/renderer/stores/skill.store";
import { useUIStore } from "../../../src/renderer/stores/ui.store";
import {
  createSkillFixture,
  createSkillPlatformFixture,
} from "../../fixtures/skills";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

const librarySkillCount = 117;
const libraryPageSize = 10;
const skills: Skill[] = Array.from({ length: librarySkillCount }, (_, index) =>
  createSkillFixture({
    id: `navigation-skill-${index}`,
    name: `navigation-skill-${index}`,
    local_repo_path: `/fixture/navigation-skill-${index}`,
  }),
);

async function renderWorkspace() {
  return renderWithI18n(
    <ToastProvider>
      <Sidebar layout="rail" currentPage="home" onNavigate={vi.fn()} />
      <MainContent />
    </ToastProvider>,
    { settleAsyncEffects: true },
  );
}

function installSkillReadMocks(
  libraryRead: Promise<Skill[]>,
  platformRead: Promise<Record<string, Record<string, boolean>>>,
): void {
  installWindowMocks({
    api: {
      skill: {
        getAll: vi.fn().mockReturnValue(libraryRead),
        getSupportedPlatforms: vi
          .fn()
          .mockResolvedValue([createSkillPlatformFixture()]),
        detectPlatforms: vi.fn().mockResolvedValue(["claude"]),
        getMdInstallStatusBatch: vi.fn().mockReturnValue(platformRead),
      },
    },
  });
}

describe("Skill module navigation while reads are pending", () => {
  beforeEach(() => {
    useUIStore.setState({ appModule: "skill", viewMode: "skill" });
    useFolderStore.setState({ folders: [], selectedFolderId: null });
    usePromptStore.setState({
      prompts: [],
      selectedId: null,
      lastSelectedId: null,
      selectedIds: [],
      relations: [],
      outputFormatItems: [],
      promptDetailCache: {},
    });
    useSettingsStore.setState({
      disabledPlatformIds: [],
      skillListPageSize: libraryPageSize,
    });
    useSkillStore.setState({
      skills,
      storeView: "my-skills",
      selectedSkillId: null,
      filterType: "all",
      filterTags: [],
      searchQuery: "",
      pendingPluginChildDeploySkillIds: [],
      remoteStoreEntries: {},
      deployedSkillNames: new Set(),
    });
    Reflect.deleteProperty(window, "__PROMPTHUB_SKILL_EDITOR_DIRTY");
  });

  it("leaves Skills before library and platform reads finish, then ignores late completion", async () => {
    const libraryRead = deferred<Skill[]>();
    const platformRead = deferred<Record<string, Record<string, boolean>>>();
    installSkillReadMocks(libraryRead.promise, platformRead.promise);
    await renderWorkspace();
    expect(
      await screen.findByRole("heading", { name: "My Skills" }),
    ).toBeVisible();
    expect(
      screen.getAllByRole("button", { name: /^View Details:/ }),
    ).toHaveLength(libraryPageSize);
    await waitFor(() =>
      expect(window.api.skill.getMdInstallStatusBatch).toHaveBeenCalled(),
    );
    expect(window.api.skill.getAll).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Prompts" }));
    expect(screen.getByRole("button", { name: "Prompts" })).toHaveClass(
      "bg-primary",
    );
    expect(screen.queryByRole("heading", { name: "My Skills" })).toBeNull();

    await act(async () => {
      libraryRead.resolve(skills);
      platformRead.resolve({ [skills[0].id]: { claude: true } });
    });
    expect(useUIStore.getState().appModule).toBe("prompt");
    expect(useSkillStore.getState().skills).toHaveLength(librarySkillCount);
    expect(screen.queryByRole("heading", { name: "My Skills" })).toBeNull();
  });

  it("allows repeated departure and reentry while platform inspection is unresolved", async () => {
    const platformRead = deferred<Record<string, Record<string, boolean>>>();
    installSkillReadMocks(Promise.resolve(skills), platformRead.promise);
    await renderWorkspace();
    const navigationRoundCount = 3;
    for (let round = 0; round < navigationRoundCount; round += 1) {
      expect(
        await screen.findByRole("heading", { name: "My Skills" }),
      ).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "Prompts" }));
      expect(screen.queryByRole("heading", { name: "My Skills" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Skills" }));
    }
    expect(
      await screen.findByRole("heading", { name: "My Skills" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Prompts" }));
    await act(async () => {
      platformRead.resolve({});
    });
    expect(useUIStore.getState().appModule).toBe("prompt");
    expect(screen.getByRole("button", { name: "Prompts" })).toHaveClass(
      "bg-primary",
    );
  });
});
