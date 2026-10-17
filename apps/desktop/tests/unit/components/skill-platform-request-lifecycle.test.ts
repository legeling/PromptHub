import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import type {
  Skill,
  SkillPlatformInstallStatusMap,
} from "@prompthub/shared/types";
import { SKILL_PLATFORMS } from "@prompthub/shared/constants/platforms";
import { useSkillPlatform } from "../../../src/renderer/components/skill/use-skill-platform";
import { useSkillStore } from "../../../src/renderer/stores/skill.store";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { installWindowMocks } from "../../helpers/window";

// Exercise the real hook and stores; only preload I/O is replaced.
const initialSkills = useSkillStore.getState();
const initialSettings = useSettingsStore.getState();
const first: Skill = {
  id: "request-first",
  name: "first",
  description: "First fixture",
  instructions: "# First",
  content: "# First",
  protocol_type: "skill",
  tags: [],
  is_favorite: false,
  currentVersion: 1,
  created_at: 1,
  updated_at: 1,
};
const second: Skill = { ...first, id: "request-second", name: "second" };

function deferredStatus() {
  let resolve: (value: SkillPlatformInstallStatusMap) => void = () => {
    throw new Error("Deferred status was not initialized");
  };
  let reject: (error: Error) => void = () => {
    throw new Error("Deferred status was not initialized");
  };
  const promise = new Promise<SkillPlatformInstallStatusMap>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  useSkillStore.setState({ ...initialSkills, skills: [first, second] }, true);
  useSettingsStore.setState(
    { ...initialSettings, disabledPlatformIds: [] },
    true,
  );
});

afterEach(() => {
  cleanup();
  useSkillStore.setState(initialSkills, true);
  useSettingsStore.setState(initialSettings, true);
});

function prepareApi() {
  const api = installWindowMocks().api.skill;
  api.getSupportedPlatforms.mockResolvedValue(
    SKILL_PLATFORMS.filter((platform) => platform.id === "claude"),
  );
  api.detectPlatforms.mockResolvedValue(["claude"]);
  api.getMdInstallStatusDetails.mockResolvedValue({
    claude: { installed: true },
  });
  return api;
}

it("loads the active Skill status and allows a pending uninstall selection", async () => {
  prepareApi();
  const { result } = renderHook(() => useSkillPlatform(first, "copy"));
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.installStatus).toEqual({ claude: true });
  expect(result.current.platformError).toBeNull();
  act(() => result.current.togglePlatformSelection("claude"));
  expect(result.current.selectedPlatforms).toEqual(new Set(["claude"]));
});

it("ignores an old Skill response after switching and preserves the new selection", async () => {
  const api = prepareApi();
  const old = deferredStatus();
  api.getMdInstallStatusDetails.mockImplementation((id) =>
    id === first.id
      ? old.promise
      : Promise.resolve({ claude: { installed: true } }),
  );
  const { result, rerender } = renderHook(
    ({ skill }) => useSkillPlatform(skill, "copy"),
    { initialProps: { skill: first } },
  );
  rerender({ skill: second });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  act(() => result.current.togglePlatformSelection("claude"));
  await act(async () => old.resolve({ claude: { installed: false } }));
  expect(result.current.installStatus).toEqual({ claude: true });
  expect(result.current.selectedPlatforms).toEqual(new Set(["claude"]));
});

it("ignores an old Skill failure after the new Skill has loaded", async () => {
  const api = prepareApi();
  const old = deferredStatus();
  api.getMdInstallStatusDetails.mockImplementation((id) =>
    id === first.id
      ? old.promise
      : Promise.resolve({ claude: { installed: true } }),
  );
  const { result, rerender } = renderHook(
    ({ skill }) => useSkillPlatform(skill, "copy"),
    { initialProps: { skill: first } },
  );
  rerender({ skill: second });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  await act(async () => old.reject(new Error("Old Skill status unavailable")));
  expect(result.current.platformError).toBeNull();
  expect(result.current.installStatus).toEqual({ claude: true });
});

it("clears a status error after a successful explicit refresh", async () => {
  const api = prepareApi();
  api.getMdInstallStatusDetails.mockRejectedValueOnce(
    new Error("Status temporarily unavailable"),
  );
  const { result } = renderHook(() => useSkillPlatform(first, "copy"));
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.platformError).not.toBeNull();
  await act(async () => result.current.refreshInstallStatus());
  expect(result.current.installStatus).toEqual({ claude: true });
  expect(result.current.platformError).toBeNull();
});
