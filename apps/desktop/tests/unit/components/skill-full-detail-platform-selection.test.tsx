import { act, cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Skill } from "@prompthub/shared/types";
import { SKILL_PLATFORMS } from "@prompthub/shared/constants/platforms";
import { SkillFullDetailPage } from "../../../src/renderer/components/skill/SkillFullDetailPage";
import { SkillQuickInstall } from "../../../src/renderer/components/skill/SkillQuickInstall";
import { useSkillStore } from "../../../src/renderer/stores/skill.store";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

const initialSkills = useSkillStore.getState();
const initialSettings = useSettingsStore.getState();
const skill: Skill = {
  id: "platform-selection",
  name: "selection-fixture",
  description: "Platform selection fixture",
  content: "# Selection fixture",
  instructions: "# Selection fixture",
  protocol_type: "skill",
  tags: [],
  is_favorite: false,
  currentVersion: 1,
  created_at: 1,
  updated_at: 1,
};

beforeEach(() => {
  useSkillStore.setState({
    ...initialSkills,
    skills: [skill],
    selectedSkillId: skill.id,
  });
  useSettingsStore.setState({
    ...initialSettings,
    skillProjects: [],
    disabledPlatformIds: [],
    skillInstallMethod: "symlink",
  });
});
afterEach(() => {
  cleanup();
  useSkillStore.setState(initialSkills, true);
  useSettingsStore.setState(initialSettings, true);
  vi.restoreAllMocks();
});

function preparePlatforms() {
  const mocks = installWindowMocks();
  mocks.api.skill.getSupportedPlatforms.mockResolvedValue(
    SKILL_PLATFORMS.filter((platform) =>
      ["claude", "cursor"].includes(platform.id),
    ),
  );
  mocks.api.skill.detectPlatforms.mockResolvedValue(["claude", "cursor"]);
  return mocks.api.skill;
}

it("keeps global selections while switching the modal to project distribution and back", async () => {
  const api = preparePlatforms();
  const user = userEvent.setup();
  await renderWithI18n(<SkillQuickInstall skill={skill} onClose={vi.fn()} />, {
    settleAsyncEffects: true,
  });
  await user.click(await screen.findByRole("button", { name: "Claude Code" }));
  await user.click(
    screen.getByRole("button", { name: "Project Distribution" }),
  );
  expect(screen.getByRole("button", { name: "Add Project" })).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Shared Skill directory" }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Global Distribution" }));
  expect(screen.getByRole("button", { name: "Claude Code" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(api.installMd).not.toHaveBeenCalled();
  expect(api.installMdSymlink).not.toHaveBeenCalled();
  const apply = screen.getByRole("button", { name: "Apply changes" });
  apply.focus();
  await user.keyboard("[Tab]");
  expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
});

it("retains a clicked platform when opening the detail finishes synchronizing the same Skill", async () => {
  const api = preparePlatforms();
  let finishSync: ((value: Skill) => void) | undefined;
  api.syncFromRepo.mockImplementation(
    () =>
      new Promise<Skill>((resolve) => {
        finishSync = resolve;
      }),
  );
  const user = userEvent.setup();
  await renderWithI18n(<SkillFullDetailPage />, { settleAsyncEffects: true });
  const claude = await screen.findByRole("button", {
    name: "Claude Code",
  });
  await act(async () => {
    await user.click(claude);
  });
  expect(claude).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Apply changes" })).toBeEnabled();

  await act(async () => {
    if (!finishSync)
      throw new Error("Expected detail synchronization to start");
    finishSync({ ...skill });
  });
  expect(claude).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Apply changes" })).toBeEnabled();
  await act(async () => {
    await user.click(claude);
  });
  expect(claude).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("button", { name: "Apply changes" })).toBeDisabled();
});

it("retains select-all through a metadata reload and clears it when switching Skills", async () => {
  const api = preparePlatforms();
  const other = {
    ...skill,
    id: "other-platform-selection",
    name: "other-fixture",
  };
  const user = userEvent.setup();
  await renderWithI18n(<SkillFullDetailPage />, { settleAsyncEffects: true });
  const selectAll = await screen.findByRole("button", {
    name: "Select all platforms",
  });
  await act(async () => {
    await user.click(selectAll);
  });
  await act(async () => {
    useSkillStore.setState({
      skills: [{ ...skill, is_favorite: true }, other],
    });
  });
  expect(screen.getByRole("button", { name: "Claude Code" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByRole("button", { name: "Cursor" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(
    screen.getByRole("button", { name: "Shared Skill directory" }),
  ).toHaveAttribute("aria-pressed", "false");
  await act(async () => {
    useSkillStore.getState().selectSkill(other.id);
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Claude Code" })).toHaveAttribute(
      "aria-pressed",
      "false",
    ),
  );
  expect(screen.getByRole("button", { name: "Apply changes" })).toBeDisabled();
  expect(api.installMdSymlink).not.toHaveBeenCalled();
  expect(api.installMd).not.toHaveBeenCalled();
});
