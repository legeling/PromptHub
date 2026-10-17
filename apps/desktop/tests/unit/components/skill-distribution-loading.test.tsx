import { act, cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SkillManager } from "../../../src/renderer/components/skill/SkillManager";
import { useSkillStore } from "../../../src/renderer/stores/skill.store";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { createSkillFixture } from "../../fixtures/skills";
import { installWindowMocks } from "../../helpers/window";
import { renderWithI18n } from "../../helpers/i18n";

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
afterEach(cleanup);

describe("Skill distribution icon loading", () => {
  it("shows confirmed icons without waiting for platform detection and keeps them on reopen", async () => {
    const skill = createSkillFixture({
      id: "icon-loading",
      name: "Icon loading",
    });
    let resolveStatus!: (
      value: Record<string, Record<string, boolean>>,
    ) => void;
    const batch = vi.fn(
      () =>
        new Promise<Record<string, Record<string, boolean>>>((resolve) => {
          resolveStatus = resolve;
        }),
    );
    const detect = vi.fn(() => new Promise<string[]>(() => undefined));
    installWindowMocks({
      api: {
        skill: {
          getAll: vi.fn().mockResolvedValue([skill]),
          getSupportedPlatforms: vi
            .fn()
            .mockResolvedValue([{ id: "claude", name: "Claude Code" }]),
          detectPlatforms: detect,
          getMdInstallStatusBatch: batch,
        },
      },
    });
    useSettingsStore.setState({ disabledPlatformIds: [] });
    useSkillStore.setState({
      skills: [],
      skillPlatformStatuses: {},
      deployedSkillNames: new Set(),
      storeView: "my-skills",
      viewMode: "gallery",
      selectedSkillId: null,
      filterType: "all",
      filterTags: [],
      searchQuery: "",
      remoteStoreEntries: {},
    });
    const view = await renderWithI18n(<SkillManager />, { language: "en" });
    await waitFor(() => expect(batch).toHaveBeenCalledOnce());
    expect(screen.queryByText("Not distributed")).not.toBeInTheDocument();
    await act(async () => resolveStatus({ [skill.id]: { claude: true } }));
    await waitFor(() =>
      expect(screen.getByTitle("Claude Code")).toBeInTheDocument(),
    );
    expect(useSkillStore.getState().deployedSkillNames.has(skill.id)).toBe(
      true,
    );
    expect(detect).not.toHaveBeenCalled();
    view.unmount();
    await renderWithI18n(<SkillManager />, { language: "en" });
    await waitFor(() =>
      expect(screen.getByTitle("Claude Code")).toBeInTheDocument(),
    );
    expect(batch).toHaveBeenCalledOnce();
  });
});
