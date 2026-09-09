import { act, fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SKILL_PLATFORMS } from "@prompthub/shared/constants/platforms";

import {
  SkillSafetySettingsSection,
  SkillSettings,
} from "../../../src/renderer/components/settings/SkillSettings";
import { renderWithI18n } from "../../helpers/i18n";
import { createWindowElectronMock } from "../../helpers/window";

const useSettingsStoreMock = vi.fn();
const useToastMock = vi.fn();

vi.mock("../../../src/renderer/stores/settings.store", () => ({
  useSettingsStore: (
    selector?: (state: Record<string, unknown>) => unknown,
  ) => {
    const state = useSettingsStoreMock();
    return selector ? selector(state) : state;
  },
}));

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => useToastMock(),
}));

const scanInstalledSkillSafetyMock = vi.fn();
let installedSkillsMock: Array<Record<string, unknown>> = [];
let customStoreSourcesMock: Array<Record<string, unknown>> = [];

vi.mock("../../../src/renderer/stores/skill.store", () => ({
  useSkillStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      scanInstalledSkillSafety: scanInstalledSkillSafetyMock,
      skills: installedSkillsMock,
      customStoreSources: customStoreSourcesMock,
    }),
}));

function hasHiddenSvgAncestor(element: Element): boolean {
  let current: Element | null = element;

  while (current) {
    if (current.getAttribute("aria-hidden") === "true") {
      return true;
    }
    current = current.parentElement;
  }

  return false;
}

function createSettingsState() {
  return {
    skillInstallMethod: "symlink",
    setSkillInstallMethod: vi.fn(),
    builtinAgentOverrides: {},
    updateBuiltinAgentOverride: vi.fn(),
    resetBuiltinAgentOverride: vi.fn(),
    customPlatformRootPaths: {},
    disabledPlatformIds: [],
    setCustomPlatformRootPath: vi.fn(),
    resetCustomPlatformRootPath: vi.fn(),
    setRulePlatformTracked: vi.fn(),
    customSkillPlatformPaths: {},
    setCustomSkillPlatformPath: vi.fn(),
    resetCustomSkillPlatformPath: vi.fn(),
    skillPlatformOrder: [],
    setSkillPlatformOrder: vi.fn(),
    resetSkillPlatformOrder: vi.fn(),
    customAgents: [],
    addCustomAgent: vi.fn(),
    updateCustomAgent: vi.fn(),
    removeCustomAgent: vi.fn(),
    customAgentRootPaths: [],
    customSkillScanPaths: [],
    addCustomSkillScanPath: vi.fn(),
    removeCustomSkillScanPath: vi.fn(),
    aiModels: [],
    autoScanInstalledSkills: false,
    autoScanStoreSkillsBeforeInstall: false,
    skillSafetyChannelPolicies: {},
    skillSafetyStorePolicies: {},
    trustedSkillUpdateSourceKeys: [],
    revokeSkillUpdateSourceTrust: vi.fn(),
    setAutoScanInstalledSkills: vi.fn(),
    setAutoScanStoreSkillsBeforeInstall: vi.fn(),
    setSkillSafetyChannelPolicy: vi.fn(),
    setSkillSafetyStorePolicy: vi.fn(),
    githubToken: "",
    setGithubToken: vi.fn(),
    agentIdentityPreferences: {
      codex: { name: "codex", icon: "codex" },
    },
    setCodexIdentityPreference: vi.fn(),
  };
}

function createDataTransfer() {
  const data = new Map<string, string>();
  return {
    setData: vi.fn((type: string, value: string) => data.set(type, value)),
    getData: vi.fn((type: string) => data.get(type) ?? ""),
    effectAllowed: "move",
    dropEffect: "move",
  };
}

describe("SkillSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useToastMock.mockReturnValue({ showToast: vi.fn() });
    scanInstalledSkillSafetyMock.mockResolvedValue({
      total: 0,
      blocked: 0,
      highRisk: 0,
      warn: 0,
    });
    installedSkillsMock = [];
    customStoreSourcesMock = [];
    useSettingsStoreMock.mockReturnValue(createSettingsState());
    window.electron = createWindowElectronMock();
  });

  it("shows the preferred default platform order", async () => {
    await act(async () => {
      await renderWithI18n(<SkillSettings />, { language: "en" });
    });

    const list = screen.getByRole("list", { name: "Platform Display Order" });
    const platformIds = within(list)
      .getAllByRole("listitem")
      .map((item) => item.getAttribute("data-platform-id"));

    expect(platformIds).toContain("claude");
    expect(platformIds).toContain("codex");
    expect(platformIds).toContain("cursor");
    expect(platformIds.indexOf("claude")).toBeLessThan(
      platformIds.indexOf("cursor"),
    );
    expect(platformIds.indexOf("codex")).toBeLessThan(
      platformIds.indexOf("cursor"),
    );
  });

  it("places DeepSeek Harness into an older saved Agent order", async () => {
    const settingsState = createSettingsState();
    const legacyOrder = SKILL_PLATFORMS.map((platform) => platform.id).filter(
      (platformId) => platformId !== "deepseek-harness",
    );
    useSettingsStoreMock.mockReturnValue({
      ...settingsState,
      skillPlatformOrder: legacyOrder,
    });

    await act(async () => {
      await renderWithI18n(<SkillSettings />, { language: "en" });
    });

    const list = screen.getByRole("list", { name: "Platform Display Order" });
    const platformIds = within(list)
      .getAllByRole("listitem")
      .map((item) => item.getAttribute("data-platform-id"));
    const harnessIndex = platformIds.indexOf("deepseek-harness");

    expect(harnessIndex).toBeGreaterThan(-1);
    expect(platformIds[harnessIndex - 1]).toBe("codex");
    expect(
      within(list).getAllByRole("img", { name: "deepseek-harness icon" }),
    ).toHaveLength(2);
  });

  it("places the local Claw platforms in the Claw family group", async () => {
    await act(async () => {
      await renderWithI18n(<SkillSettings />, { language: "en" });
    });

    const list = screen.getByRole("list", { name: "Platform Display Order" });
    const clawHeading = screen.getByText("Claw", { exact: true });
    const clawGroup = clawHeading.parentElement;

    expect(clawGroup).toBeTruthy();
    for (const platformId of [
      "openclaw",
      "qclaw",
      "hermes",
      "copaw",
      "autoclaw",
      "nanoclaw",
    ]) {
      expect(
        clawGroup?.querySelector(`[data-platform-id="${platformId}"]`),
        platformId,
      ).toBeTruthy();
      expect(
        list.querySelector(`[data-platform-id="${platformId}"]`)?.parentElement,
        platformId,
      ).toBe(clawGroup);
    }
  });

  it("reorders platforms through drag and drop", async () => {
    const settingsState = createSettingsState();
    useSettingsStoreMock.mockReturnValue(settingsState);

    await act(async () => {
      await renderWithI18n(<SkillSettings />, { language: "en" });
    });

    const list = screen.getByRole("list", { name: "Platform Display Order" });
    const items = within(list).getAllByRole("listitem");
    const cursorRow = items.find(
      (item) => item.getAttribute("data-platform-id") === "cursor",
    );
    const codexRow = items.find(
      (item) => item.getAttribute("data-platform-id") === "codex",
    );

    expect(cursorRow).toBeTruthy();
    expect(codexRow).toBeTruthy();

    const dataTransfer = createDataTransfer();

    fireEvent.dragStart(cursorRow!, { dataTransfer });
    fireEvent.dragOver(codexRow!, { dataTransfer });
    fireEvent.drop(codexRow!, { dataTransfer });

    expect(settingsState.setSkillPlatformOrder).toHaveBeenCalledTimes(1);
    const nextOrder = settingsState.setSkillPlatformOrder.mock
      .calls[0][0] as string[];
    expect(nextOrder.indexOf("cursor")).toBeLessThan(
      nextOrder.indexOf("codex"),
    );
    expect(nextOrder).toContain("claude");
    expect(nextOrder).toContain("cursor");
    expect(nextOrder).toContain("codex");
  });

  it("toggles rule tracking for platforms with global rules", async () => {
    const settingsState = createSettingsState();
    useSettingsStoreMock.mockReturnValue(settingsState);

    await act(async () => {
      await renderWithI18n(<SkillSettings />, { language: "en" });
    });

    const list = screen.getByRole("list", { name: "Platform Display Order" });
    const claudeRow = within(list)
      .getAllByRole("listitem")
      .find((item) => item.getAttribute("data-platform-id") === "claude");

    expect(claudeRow).toBeTruthy();

    const toggle = within(claudeRow!).getByRole("switch", {
      name: "Claude Code",
    });

    fireEvent.click(toggle);

    expect(settingsState.setRulePlatformTracked).toHaveBeenCalledWith(
      "claude",
      false,
    );
  });

  it("keeps rendered skill setting actions from submitting surrounding forms", async () => {
    const handleSubmit = vi.fn();

    await act(async () => {
      await renderWithI18n(
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
        >
          <SkillSettings />
          <SkillSafetySettingsSection />
        </form>,
        { language: "en" },
      );
    });

    const buttons = Array.from(document.body.querySelectorAll("button"));
    const implicitButtonMarkup = buttons
      .filter((button) => button.getAttribute("type") !== "button")
      .map((button) => button.outerHTML);
    const exposedIconMarkup = buttons
      .flatMap((button) => Array.from(button.querySelectorAll("svg")))
      .filter((icon) => !hasHiddenSvgAncestor(icon))
      .map((icon) => icon.outerHTML);

    expect(implicitButtonMarkup, implicitButtonMarkup.join("\n")).toHaveLength(
      0,
    );
    expect(exposedIconMarkup, exposedIconMarkup.join("\n")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: /Copy File/ }));

    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it("ignores malformed trusted update source settings from legacy state", async () => {
    useSettingsStoreMock.mockReturnValue({
      ...createSettingsState(),
      trustedSkillUpdateSourceKeys: { legacy: true },
    });

    await act(async () => {
      await renderWithI18n(<SkillSafetySettingsSection />, {
        language: "en",
      });
    });

    expect(screen.queryByText("Trusted Update Sources")).toBeNull();
  });

  it("does not expose retired source or channel controls", async () => {
    useSettingsStoreMock.mockReturnValue({...createSettingsState(), skillSafetyScanEnabled: false, trustedSkillUpdateSourceKeys: ["team"], skillSafetyChannelPolicies: {official: "enabled"}});
    await act(async () => { await renderWithI18n(<SkillSafetySettingsSection />, {language: "en"}); });
    expect(screen.queryByText("Trusted Update Sources")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByRole("button", {name: /Enable manual content scans/})).toBeInTheDocument();
    expect(scanInstalledSkillSafetyMock).not.toHaveBeenCalled();
  });

  it("adds a custom agent root and shows derived asset previews", async () => {
    const settingsState = createSettingsState();
    useSettingsStoreMock.mockReturnValue(settingsState);

    await act(async () => {
      await renderWithI18n(<SkillSettings />, { language: "en" });
    });

    fireEvent.change(
      screen.getByPlaceholderText("Agent name, e.g. Team Agents"),
      {
        target: { value: "Team Agents" },
      },
    );
    fireEvent.change(
      screen.getByPlaceholderText(
        "Enter agent root, e.g. ~/.agents or ~/workspace/.opencode",
      ),
      { target: { value: "~/.agents" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(settingsState.addCustomAgent).toHaveBeenCalledWith({
      name: "Team Agents",
      rootPath: "~/.agents",
    });

    useSettingsStoreMock.mockReturnValue({
      ...settingsState,
      customAgents: [
        { id: "agent-1", name: "Team Agents", rootPath: "~/.agents" },
      ],
    });

    await act(async () => {
      await renderWithI18n(<SkillSettings />, { language: "en" });
    });

    expect(screen.getAllByText("Team Agents").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/Derived skill scan paths/).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByText(/Derived agent directories/),
    ).not.toBeInTheDocument();
  }, 60000);

  it("fills the custom agent root path from folder picker", async () => {
    window.electron = createWindowElectronMock({
      selectFolder: vi.fn().mockResolvedValue("/tmp/custom-agent-root"),
    });

    await act(async () => {
      await renderWithI18n(<SkillSettings />, { language: "en" });
    });

    const browseButtons = screen.getAllByRole("button", { name: "Browse" });
    fireEvent.click(browseButtons[0]!);

    expect(
      await screen.findByDisplayValue("/tmp/custom-agent-root"),
    ).toBeInTheDocument();
  }, 60_000);

  it("requires confirmation before deleting a custom agent", async () => {
    const settingsState = createSettingsState();
    useSettingsStoreMock.mockReturnValue({
      ...settingsState,
      customAgents: [
        { id: "agent-1", name: "Team Agents", rootPath: "~/.agents" },
      ],
    });

    await act(async () => {
      await renderWithI18n(<SkillSettings />, { language: "en" });
    });

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(settingsState.removeCustomAgent).not.toHaveBeenCalled();
    expect(screen.getByText("Delete Custom Agent")).toBeInTheDocument();
    expect(
      screen.getByText(
        'Are you sure you want to delete custom agent "Team Agents"? This only removes it from PromptHub settings.',
      ),
    ).toBeInTheDocument();

    const confirmButton = screen
      .getAllByRole("button", { name: "Delete" })
      .at(-1);
    fireEvent.click(confirmButton!);

    expect(settingsState.removeCustomAgent).toHaveBeenCalledWith("agent-1");
  });

  it("disables move-down on the last managed entry when custom agents are present", async () => {
    const settingsState = createSettingsState();
    useSettingsStoreMock.mockReturnValue({
      ...settingsState,
      customAgents: [
        { id: "agent-1", name: "Team Agents", rootPath: "~/.agents" },
      ],
      skillPlatformOrder: [
        ...SKILL_PLATFORMS.map((platform) => platform.id),
        "agent-1",
      ],
    });

    await act(async () => {
      await renderWithI18n(<SkillSettings />, { language: "en" });
    });

    const list = screen.getByRole("list", { name: "Platform Display Order" });
    const customAgentRow = within(list)
      .getAllByRole("listitem")
      .find((item) => item.getAttribute("data-platform-id") === "agent-1");

    expect(customAgentRow).toBeTruthy();
    const moveDownButton = within(customAgentRow!).getByRole("button", {
      name: "Move Down",
    });

    expect(moveDownButton).toBeDisabled();
  });

  it("updates built-in agent override fields from the unified config section", async () => {
    const settingsState = createSettingsState();
    useSettingsStoreMock.mockReturnValue(settingsState);

    await act(async () => {
      await renderWithI18n(<SkillSettings />, { language: "en" });
    });

    const configSection = screen
      .getByText("Agent Configurations")
      .closest("section, div");
    expect(configSection).toBeTruthy();

    expect(
      within(configSection as HTMLElement).queryByPlaceholderText(
        "Leave empty to use the default root, e.g. ~/.trae-cn",
      ),
    ).not.toBeInTheDocument();

    const platformCards = within(configSection as HTMLElement).getAllByText(
      "Edit",
    );
    fireEvent.click(platformCards[0]!);

    const rootInput = within(configSection as HTMLElement).getByPlaceholderText(
      "Leave empty to use the default root, e.g. ~/.trae-cn",
    ) as HTMLInputElement;

    expect(rootInput.value).not.toBe("");

    fireEvent.change(rootInput, { target: { value: "/tmp/opencode-root" } });

    expect(settingsState.updateBuiltinAgentOverride).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(settingsState.updateBuiltinAgentOverride).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ rootPath: "/tmp/opencode-root" }),
    );
  });

  it("edits the Codex product name and icon inside the Codex agent config", async () => {
    const settingsState = createSettingsState();
    useSettingsStoreMock.mockReturnValue(settingsState);

    await act(async () => {
      await renderWithI18n(<SkillSettings />, { language: "en" });
    });

    expect(
      screen.queryByRole("button", { name: "Use ChatGPT name" }),
    ).not.toBeInTheDocument();

    const configSection = screen
      .getByText("Agent Configurations")
      .closest("section, div");
    const codexCard = within(configSection as HTMLElement)
      .getAllByText("Codex")[0]
      .closest("[data-platform-config-id]");
    expect(codexCard).toBeTruthy();

    fireEvent.click(
      within(codexCard as HTMLElement).getByRole("button", { name: "Edit" }),
    );
    fireEvent.click(
      within(codexCard as HTMLElement).getByRole("button", {
        name: "Use ChatGPT name",
      }),
    );
    fireEvent.click(
      within(codexCard as HTMLElement).getByRole("button", {
        name: "Use ChatGPT icon",
      }),
    );

    const selectedName = within(codexCard as HTMLElement).getByRole("button", {
      name: "Use ChatGPT name",
    });
    const selectedIcon = within(codexCard as HTMLElement).getByRole("button", {
      name: "Use ChatGPT icon",
    });
    expect(selectedName).toHaveClass(
      "border-primary",
      "bg-primary",
      "text-primary-foreground",
    );
    expect(selectedIcon).toHaveClass(
      "border-primary",
      "bg-primary",
      "text-primary-foreground",
    );
    expect(selectedName).toHaveClass("h-12");
    expect(selectedIcon).toHaveClass("h-12");
    expect(selectedName.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(selectedIcon.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );

    expect(settingsState.setCodexIdentityPreference).not.toHaveBeenCalled();
    fireEvent.click(
      within(codexCard as HTMLElement).getByRole("button", { name: "Save" }),
    );
    expect(settingsState.setCodexIdentityPreference).toHaveBeenCalledWith({
      name: "chatgpt",
      icon: "chatgpt",
    });
  });

  it("cancels or resets Codex identity drafts with the Agent edit controls", async () => {
    const settingsState = {
      ...createSettingsState(),
      agentIdentityPreferences: {
        codex: { name: "chatgpt" as const, icon: "chatgpt" as const },
      },
    };
    useSettingsStoreMock.mockReturnValue(settingsState);

    await act(async () => {
      await renderWithI18n(<SkillSettings />, { language: "en" });
    });

    const configSection = screen
      .getByText("Agent Configurations")
      .closest("section, div") as HTMLElement;
    const codexCard = within(configSection)
      .getAllByText("ChatGPT")[0]
      .closest("[data-platform-config-id]") as HTMLElement;

    fireEvent.click(within(codexCard).getByRole("button", { name: "Edit" }));
    fireEvent.click(
      within(codexCard).getByRole("button", { name: "Use Codex name" }),
    );
    fireEvent.click(within(codexCard).getByRole("button", { name: "Cancel" }));
    expect(settingsState.setCodexIdentityPreference).not.toHaveBeenCalled();

    fireEvent.click(within(codexCard).getByRole("button", { name: "Edit" }));
    expect(
      within(codexCard).getByRole("button", { name: "Use ChatGPT name" }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(
      within(codexCard).getByRole("button", { name: "Use Default" }),
    );
    expect(
      within(codexCard).getByRole("button", { name: "Use Codex name" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      within(codexCard).getByRole("button", { name: "Use Codex icon" }),
    ).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(within(codexCard).getByRole("button", { name: "Save" }));
    expect(settingsState.setCodexIdentityPreference).toHaveBeenCalledWith({
      name: "codex",
      icon: "codex",
    });
  });

  it("collapses built-in agent details by default and toggles them on demand", async () => {
    await act(async () => {
      await renderWithI18n(<SkillSettings />, { language: "en" });
    });

    const configSection = screen
      .getByText("Agent Configurations")
      .closest("section, div");
    expect(configSection).toBeTruthy();

    const claudeCard = within(configSection as HTMLElement)
      .getAllByText("Claude Code")[0]
      .closest("[data-platform-config-id]");
    expect(claudeCard).toBeTruthy();

    const toggle = within(claudeCard as HTMLElement).getByRole("button", {
      name: "Expand Claude Code",
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(
      within(claudeCard as HTMLElement).queryByText(/Derived skills path/),
    ).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(
      within(claudeCard as HTMLElement).getByText(/Derived skills path/),
    ).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(
      within(claudeCard as HTMLElement).getByRole("button", {
        name: "Edit",
      }),
    );
    const editToggle = within(claudeCard as HTMLElement).getByRole("button", {
      name: "Collapse Claude Code",
    });
    expect(editToggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(
      within(claudeCard as HTMLElement).getByRole("button", {
        name: "Cancel",
      }),
    );
    expect(
      within(claudeCard as HTMLElement).getByRole("button", {
        name: "Expand Claude Code",
      }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("shows Plugin directories only for Agent Plugin package targets", async () => {
    useSettingsStoreMock.mockReturnValue(createSettingsState());

    await act(async () => {
      await renderWithI18n(<SkillSettings />, { language: "en" });
    });

    const configSection = screen
      .getByText("Agent Configurations")
      .closest("section, div");
    expect(configSection).toBeTruthy();
    expect(
      within(configSection as HTMLElement).queryByText(/Derived Command/i),
    ).not.toBeInTheDocument();

    const codexCard = within(configSection as HTMLElement)
      .getAllByText("Codex")[0]
      .closest("[data-platform-config-id]");
    expect(codexCard).toBeTruthy();
    fireEvent.click(
      within(codexCard as HTMLElement).getByRole("button", {
        name: "Expand Codex",
      }),
    );
    expect(
      within(codexCard as HTMLElement).getByText(/Derived Plugin directories/),
    ).toBeInTheDocument();
    expect(
      within(codexCard as HTMLElement).getByText(
        /plugins[\\/]cache[\\/]prompthub/,
      ),
    ).toBeInTheDocument();
    fireEvent.click(
      within(codexCard as HTMLElement).getByRole("button", { name: "Edit" }),
    );
    expect(
      within(codexCard as HTMLElement).queryByText("Commands"),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(codexCard as HTMLElement).getByRole("button", { name: "Cancel" }),
    );

    const clineCard = within(configSection as HTMLElement)
      .getAllByText("Cline")[0]
      .closest("[data-platform-config-id]");
    expect(clineCard).toBeTruthy();
    expect(
      within(clineCard as HTMLElement).queryByText(
        /Derived Plugin directories/,
      ),
    ).not.toBeInTheDocument();
  });

  it("resets built-in edit form without persisting until save", async () => {
    const settingsState = createSettingsState();
    useSettingsStoreMock.mockReturnValue({
      ...settingsState,
      builtinAgentOverrides: {
        claude: {
          rootPath: "/tmp/claude-root",
          rulesRelativePath: "custom/CLAUDE.md",
        },
      },
    });

    await act(async () => {
      await renderWithI18n(<SkillSettings />, { language: "en" });
    });

    const configSection = screen
      .getByText("Agent Configurations")
      .closest("section, div");
    expect(configSection).toBeTruthy();

    const claudeCard = within(configSection as HTMLElement)
      .getAllByText("Claude Code")[0]
      .closest("[data-platform-config-id]");
    expect(claudeCard).toBeTruthy();

    fireEvent.click(
      within(claudeCard as HTMLElement).getByRole("button", { name: "Edit" }),
    );

    const rootInput = screen.getByPlaceholderText(
      "Leave empty to use the default root, e.g. ~/.trae-cn",
    ) as HTMLInputElement;
    const rulesInput = screen.getByPlaceholderText(
      "rules file path (optional)",
    ) as HTMLInputElement;
    fireEvent.change(rootInput, { target: { value: "/tmp/changed-root" } });
    fireEvent.change(rulesInput, { target: { value: "tmp/custom-rule.md" } });

    fireEvent.click(
      within(claudeCard as HTMLElement).getByRole("button", {
        name: "Use Default",
      }),
    );

    expect(settingsState.updateBuiltinAgentOverride).not.toHaveBeenCalled();
    expect(
      (
        screen.getByPlaceholderText(
          "rules file path (optional)",
        ) as HTMLInputElement
      ).value,
    ).not.toBe("tmp/custom-rule.md");
  });

  it("saves cleared built-in override fields as defaults instead of keeping stale values", async () => {
    const settingsState = createSettingsState();
    useSettingsStoreMock.mockReturnValue({
      ...settingsState,
      builtinAgentOverrides: {
        claude: {
          rootPath: "/tmp/claude-root",
          rulesRelativePath: "custom/CLAUDE.md",
        },
      },
    });

    await act(async () => {
      await renderWithI18n(<SkillSettings />, { language: "en" });
    });

    const configSection = screen
      .getByText("Agent Configurations")
      .closest("section, div");
    expect(configSection).toBeTruthy();

    const claudeCard = within(configSection as HTMLElement)
      .getAllByText("Claude Code")[0]
      .closest("[data-platform-config-id]");
    expect(claudeCard).toBeTruthy();

    fireEvent.click(
      within(claudeCard as HTMLElement).getByRole("button", { name: "Edit" }),
    );

    const rulesInput = screen.getByPlaceholderText(
      "rules file path (optional)",
    ) as HTMLInputElement;
    fireEvent.change(rulesInput, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(settingsState.updateBuiltinAgentOverride).toHaveBeenCalledWith(
      expect.any(String),
      expect.not.objectContaining({ rulesRelativePath: "custom/CLAUDE.md" }),
    );
  });
});
