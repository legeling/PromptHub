import { act, fireEvent, screen } from "@testing-library/react";
import type { FormEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsPage } from "../../../src/renderer/components/settings/SettingsPage";
import { useUIStore } from "../../../src/renderer/stores/ui.store";
import { renderWithI18n } from "../../helpers/i18n";

const useSettingsStoreMock = vi.fn();
const generalSettingsModuleLoadMock = vi.hoisted(() => vi.fn());
const dataSettingsModuleLoadMock = vi.hoisted(() => vi.fn());
const aiSettingsModuleLoadMock = vi.hoisted(() => vi.fn());
const networkSettingsModuleLoadMock = vi.hoisted(() => vi.fn());

vi.mock("../../../src/renderer/stores/settings.store", () => ({
  useSettingsStore: (selector?: (state: unknown) => unknown) => {
    const state = useSettingsStoreMock();
    return typeof selector === "function" ? selector(state) : state;
  },
}));

vi.mock("../../../src/renderer/runtime", () => ({
  isWebRuntime: () => false,
}));

vi.mock("../../../src/renderer/components/settings/GeneralSettings", () => {
  generalSettingsModuleLoadMock();
  return {
    GeneralSettings: () => <div>general-content</div>,
  };
});
vi.mock("../../../src/renderer/components/settings/AppearanceSettings", () => ({
  AppearanceSettings: () => <div>appearance-content</div>,
}));
vi.mock("../../../src/renderer/components/settings/LanguageSettings", () => ({
  LanguageSettings: () => <div>language-content</div>,
}));
vi.mock(
  "../../../src/renderer/components/settings/NotificationsSettings",
  () => ({
    NotificationsSettings: () => <div>notifications-content</div>,
  }),
);
vi.mock("../../../src/renderer/components/settings/SecuritySettings", () => ({
  SecuritySettings: () => <div>security-content</div>,
}));
vi.mock("../../../src/renderer/components/settings/ShortcutsSettings", () => ({
  ShortcutsSettings: () => <div>shortcuts-content</div>,
}));
vi.mock("../../../src/renderer/components/settings/AboutSettings", () => ({
  AboutSettings: () => <div>about-content</div>,
}));
vi.mock("../../../src/renderer/components/settings/CLISettings", () => ({
  CLISettings: () => <div>cli-content</div>,
}));
vi.mock("../../../src/renderer/components/settings/DataSettings", () => {
  dataSettingsModuleLoadMock();
  return {
    DataSettings: () => <div>data-content</div>,
  };
});
vi.mock("../../../src/renderer/components/settings/NetworkSettings", () => {
  networkSettingsModuleLoadMock();
  return {
    NetworkSettings: () => <div>network-content</div>,
  };
});
vi.mock("../../../src/renderer/components/settings/SkillSettings", () => ({
  SkillSettings: () => <div>skill-content</div>,
}));
vi.mock("../../../src/renderer/components/settings/AISettingsPrototype", () => {
  aiSettingsModuleLoadMock();
  return {
    AISettingsPrototype: () => <div>ai-content</div>,
  };
});
vi.mock("../../../src/renderer/components/settings/WebDeviceSettings", () => ({
  WebDeviceSettings: () => <div>web-device-content</div>,
}));
vi.mock(
  "../../../src/renderer/components/settings/WebWorkspaceSettings",
  () => ({
    WebWorkspaceSettings: () => <div>web-workspace-content</div>,
  }),
);

function isHiddenFromAccessibility(element: Element): boolean {
  let current: Element | null = element;
  while (current) {
    if (current.getAttribute("aria-hidden") === "true") {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

describe("SettingsPage", () => {
  beforeEach(() => {
    useUIStore.setState({ pendingSettingsSection: null });
  });

  it("loads only the active settings section on the default route", async () => {
    useSettingsStoreMock.mockReturnValue({
      syncProvider: "manual",
      webdavEnabled: false,
      selfHostedSyncEnabled: false,
      s3StorageEnabled: false,
      desktopHomeModules: ["prompt", "skill", "rules"],
    });

    await act(async () => {
      await renderWithI18n(<SettingsPage onBack={vi.fn()} />, {
        language: "en",
      });
    });

    expect(screen.getByText("general-content")).toBeInTheDocument();
    expect(generalSettingsModuleLoadMock).toHaveBeenCalledTimes(1);
    expect(dataSettingsModuleLoadMock).not.toHaveBeenCalled();
    expect(networkSettingsModuleLoadMock).not.toHaveBeenCalled();
    expect(aiSettingsModuleLoadMock).not.toHaveBeenCalled();
  });

  it("shows enabled badge on active cloud backup targets in the data submenu", async () => {
    useSettingsStoreMock.mockReturnValue({
      syncProvider: "webdav",
      webdavEnabled: true,
      selfHostedSyncEnabled: false,
      s3StorageEnabled: true,
      desktopHomeModules: ["prompt", "skill", "rules"],
    });

    await act(async () => {
      await renderWithI18n(<SettingsPage onBack={vi.fn()} />, {
        language: "en",
      });
    });

    await act(async () => {
      screen.getByRole("button", { name: "Data & Sync" }).click();
    });

    expect(
      screen.getByRole("button", { name: /WebDAV Enabled/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /S3 Compatible Storage Enabled/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Self-Hosted PromptHub Enabled/ }),
    ).not.toBeInTheDocument();
  });

  it("keeps settings navigation actions non-submit with clear active state", async () => {
    const onBack = vi.fn();
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });
    useSettingsStoreMock.mockReturnValue({
      syncProvider: "webdav",
      webdavEnabled: true,
      selfHostedSyncEnabled: false,
      s3StorageEnabled: true,
      desktopHomeModules: ["prompt", "skill", "rules"],
    });

    await act(async () => {
      await renderWithI18n(
        <form onSubmit={onSubmit}>
          <SettingsPage onBack={onBack} />
        </form>,
        { language: "en" },
      );
    });

    const generalButton = screen.getByRole("button", { name: "App Settings" });
    const dataButton = screen.getByRole("button", { name: "Data & Sync" });

    expect(generalButton).toHaveAttribute("aria-pressed", "true");
    expect(dataButton).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(dataButton);

    const webDavButton = await screen.findByRole("button", {
      name: /WebDAV Enabled/,
    });
    const recoveryButton = screen.getByRole("button", { name: /recovery/i });

    expect(dataButton).toHaveAttribute("aria-pressed", "true");
    expect(webDavButton).toHaveAttribute("aria-pressed", "false");
    expect(recoveryButton).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(webDavButton);
    expect(webDavButton).toHaveAttribute("aria-pressed", "true");

    for (const button of screen.getAllByRole("button")) {
      if (button.tagName === "BUTTON") {
        expect(button).toHaveAttribute("type", "button");
      }
    }

    for (const icon of document.querySelectorAll("button svg")) {
      expect(isHiddenFromAccessibility(icon)).toBe(true);
    }

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows a standalone agent management entry in the desktop settings navigation", async () => {
    useSettingsStoreMock.mockReturnValue({
      syncProvider: "manual",
      webdavEnabled: false,
      selfHostedSyncEnabled: false,
      s3StorageEnabled: false,
      desktopHomeModules: ["prompt", "skill", "rules"],
    });

    await act(async () => {
      await renderWithI18n(<SettingsPage onBack={vi.fn()} />, {
        language: "en",
      });
    });

    const nav = screen.getByRole("navigation");
    expect(screen.getByText("general-content")).toBeInTheDocument();
    expect(nav).toHaveTextContent("App Settings");
    expect(nav).toHaveTextContent("Data & Sync");
    expect(nav).toHaveTextContent("Network Settings");
    expect(nav).toHaveTextContent("Agent Management");
    expect(nav).not.toHaveTextContent("Platform Preview");
    expect(nav).toHaveTextContent("Security");
    expect(nav).toHaveTextContent("CLI");
    expect(nav.parentElement).not.toHaveClass("app-left-rail-glass");

    await act(async () => {
      screen.getByRole("button", { name: "Agent Management" }).click();
    });

    expect(screen.getByText("skill-content")).toBeInTheDocument();
  });

  it("opens the dedicated network settings page from the desktop navigation", async () => {
    useSettingsStoreMock.mockReturnValue({
      syncProvider: "manual",
      webdavEnabled: false,
      selfHostedSyncEnabled: false,
      s3StorageEnabled: false,
      desktopHomeModules: ["prompt", "skill", "rules"],
    });

    await act(async () => {
      await renderWithI18n(<SettingsPage onBack={vi.fn()} />, {
        language: "en",
      });
    });

    await act(async () => {
      screen.getByRole("button", { name: "Network Settings" }).click();
    });

    expect(screen.getByText("network-content")).toBeInTheDocument();
  });

  it("opens the agent management section from a pending settings navigation request", async () => {
    useSettingsStoreMock.mockReturnValue({
      syncProvider: "manual",
      webdavEnabled: false,
      selfHostedSyncEnabled: false,
      s3StorageEnabled: false,
      desktopHomeModules: ["prompt", "skill", "rules"],
    });
    useUIStore.getState().requestSettingsSection("skill");

    await act(async () => {
      await renderWithI18n(<SettingsPage onBack={vi.fn()} />, {
        language: "en",
      });
    });

    expect(screen.getByText("skill-content")).toBeInTheDocument();
    expect(useUIStore.getState().pendingSettingsSection).toBeNull();
  });

  it("keeps appearance as the place where desktop workspace controls live", async () => {
    useSettingsStoreMock.mockReturnValue({
      syncProvider: "manual",
      webdavEnabled: false,
      selfHostedSyncEnabled: false,
      s3StorageEnabled: false,
      desktopHomeModules: ["skill"],
    });

    await act(async () => {
      await renderWithI18n(<SettingsPage onBack={vi.fn()} />, {
        language: "en",
      });
    });

    await act(async () => {
      screen.getByRole("button", { name: "Appearance" }).click();
    });

    expect(screen.getByText("appearance-content")).toBeInTheDocument();
  });

  it("opens the dedicated CLI settings page from the desktop navigation", async () => {
    useSettingsStoreMock.mockReturnValue({
      syncProvider: "manual",
      webdavEnabled: false,
      selfHostedSyncEnabled: false,
      s3StorageEnabled: false,
      desktopHomeModules: ["skill"],
    });

    await act(async () => {
      await renderWithI18n(<SettingsPage onBack={vi.fn()} />, {
        language: "en",
      });
    });

    await act(async () => {
      screen.getByRole("button", { name: "CLI" }).click();
    });

    expect(screen.getByText("cli-content")).toBeInTheDocument();
  });

  it("lets the model service page own its provider middle column", async () => {
    useSettingsStoreMock.mockReturnValue({
      syncProvider: "manual",
      webdavEnabled: false,
      selfHostedSyncEnabled: false,
      s3StorageEnabled: false,
      desktopHomeModules: ["skill"],
    });

    await act(async () => {
      await renderWithI18n(<SettingsPage onBack={vi.fn()} />, {
        language: "en",
      });
    });

    await act(async () => {
      screen.getByRole("button", { name: "Model Services" }).click();
    });

    expect(screen.getByText("ai-content")).toBeInTheDocument();
    expect(screen.getByTestId("settings-content-shell")).toHaveClass(
      "max-w-none",
    );
    expect(screen.getByTestId("settings-content-shell")).toHaveClass("h-full");
    expect(
      screen.queryByRole("button", { name: "Model Routing" }),
    ).not.toBeInTheDocument();
  });

  it("uses a left-aligned adaptive content shell on large displays", async () => {
    useSettingsStoreMock.mockReturnValue({
      syncProvider: "manual",
      webdavEnabled: false,
      selfHostedSyncEnabled: false,
      s3StorageEnabled: false,
      desktopHomeModules: ["prompt", "skill", "rules"],
    });

    await act(async () => {
      await renderWithI18n(<SettingsPage onBack={vi.fn()} />, {
        language: "en",
      });
    });

    const contentShell = screen.getByTestId("settings-content-shell");

    expect(contentShell).not.toHaveClass("max-w-4xl");
    expect(contentShell).not.toHaveClass("mx-auto");
    expect(contentShell).toHaveClass("2xl:max-w-7xl");
    expect(contentShell).toHaveClass("w-full");
  });
});
