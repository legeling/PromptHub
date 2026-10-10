import { ConfirmationHost } from "../../../src/renderer/components/ui/ConfirmationHost";
import { Profiler, type ReactElement } from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Skill } from "@prompthub/shared/types";

import { Sidebar } from "../../../src/renderer/components/layout/Sidebar";
import { ToastProvider } from "../../../src/renderer/components/ui/Toast";
import { usePromptStore } from "../../../src/renderer/stores/prompt.store";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { useSkillStore } from "../../../src/renderer/stores/skill.store";
import { useUIStore } from "../../../src/renderer/stores/ui.store";
import { DESKTOP_HOME_MODULES } from "../../../src/renderer/stores/settings/settings-types";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

function createSkills(count: number): Skill[] {
  return Array.from(
    { length: count },
    (_, index): Skill => ({
      id: `rail-skill-${index}`,
      name: `rail-skill-${index}`,
      description: "Navigation isolation fixture",
      instructions: "# Instructions\n".repeat(100),
      protocol_type: "skill",
      tags: ["fixture"],
      is_favorite: false,
      currentVersion: 1,
      created_at: index,
      updated_at: index,
    }),
  );
}

function renderSidebar(ui: ReactElement) {
  return renderWithI18n(<ToastProvider>{ui}</ToastProvider>, {
    settleAsyncEffects: true,
  });
}

describe("Desktop navigation rail isolation", () => {
  beforeEach(() => {
    installWindowMocks({
      api: {
        skill: {
          getSupportedPlatforms: vi.fn().mockResolvedValue([]),
          detectPlatforms: vi.fn().mockResolvedValue([]),
        },
      },
    });
    useUIStore.setState({ appModule: "skill", viewMode: "skill" });
    useSettingsStore.setState({
      desktopHomeModules: [...DESKTOP_HOME_MODULES],
      disabledPlatformIds: [],
    });
    useSkillStore.setState({
      skills: [],
      storeView: "my-skills",
      remoteStoreEntries: {},
      agentScanState: {},
    });
    Reflect.deleteProperty(window, "__PROMPTHUB_SKILL_EDITOR_DIRTY");
  });

  it("renders and switches all six modules without platform inventory reads", async () => {
    await renderSidebar(
      <Sidebar layout="rail" currentPage="home" onNavigate={vi.fn()} />,
    );
    const modules = [
      ["Prompts", "prompt"],
      ["Agents", "agents"],
      ["Skills", "skill"],
      ["MCP", "mcp"],
      ["Plugins", "plugin"],
      ["Rules", "rules"],
    ];
    for (const [label, module] of modules) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      expect(useUIStore.getState().appModule).toBe(module);
      expect(screen.getByRole("button", { name: label })).toHaveClass(
        "bg-primary",
      );
    }
    expect(window.api.skill.getSupportedPlatforms).not.toHaveBeenCalled();
    expect(window.api.skill.detectPlatforms).not.toHaveBeenCalled();
  });

  it("lets the visible classification panel own one platform inventory read", async () => {
    await renderSidebar(
      <>
        <Sidebar layout="rail" currentPage="home" onNavigate={vi.fn()} />
        <Sidebar layout="panel" currentPage="home" onNavigate={vi.fn()} />
      </>,
    );
    expect(screen.getByRole("button", { name: /My Skills/i })).toBeVisible();
    expect(window.api.skill.getSupportedPlatforms).toHaveBeenCalledTimes(1);
    expect(window.api.skill.detectPlatforms).toHaveBeenCalledTimes(1);
  });

  it("does not rerender the rail when unrelated library snapshots change", async () => {
    const onRender = vi.fn();
    await renderSidebar(
      <Profiler id="navigation-rail" onRender={onRender}>
        <Sidebar layout="rail" currentPage="home" onNavigate={vi.fn()} />
      </Profiler>,
    );
    onRender.mockClear();
    const fixtureSkillCount = 2_000;
    await act(async () => {
      useSkillStore.setState({ skills: createSkills(fixtureSkillCount) });
      usePromptStore.setState({ prompts: [] });
    });
    expect(screen.getByRole("button", { name: "Skills" })).toBeVisible();
    expect(onRender).not.toHaveBeenCalled();
  });

  it("preserves settings navigation and the dirty editor confirmation", async () => {
    const onNavigate = vi.fn();
    await renderWithI18n(<ConfirmationHost />);
    const confirm = vi.spyOn(window, "confirm");
    await renderSidebar(
      <Sidebar layout="rail" currentPage="home" onNavigate={onNavigate} />,
    );
    Object.defineProperty(window, "__PROMPTHUB_SKILL_EDITOR_DIRTY", {
      value: true,
      configurable: true,
    });
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(confirm).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith("settings"));
    Reflect.deleteProperty(window, "__PROMPTHUB_SKILL_EDITOR_DIRTY");
    confirm.mockRestore();
  });
});
