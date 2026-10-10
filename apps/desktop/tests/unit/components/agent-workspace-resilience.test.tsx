import { ConfirmationHost } from "../../../src/renderer/components/ui/ConfirmationHost";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AgentProviderProfilePublic,
  ManagedAgentSummary,
} from "@prompthub/shared/types";
import { AgentProviderProfileWorkbench } from "../../../src/renderer/components/agent/AgentProviderProfileWorkbench";
import { AgentsSidebarPanel } from "../../../src/renderer/components/agent/AgentsSidebarPanel";
import { AgentsWorkspace } from "../../../src/renderer/components/agent/AgentsWorkspace";
import { useAgentProviderStore } from "../../../src/renderer/stores/agent-provider.store";
import { useAgentStore } from "../../../src/renderer/stores/agent.store";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

function createAgent(index: number): ManagedAgentSummary {
  const suffix = String(index).padStart(3, "0");
  return {
    id: `custom-agent-${suffix}`,
    name:
      index === 0
        ? `Agent ${"very-long-identity-".repeat(16)}`
        : `Agent ${suffix}`,
    icon: "Terminal",
    isCustom: true,
    isConfigured: true,
    isDetected: true,
    isPinned: false,
    launchable: true,
    status: "installed",
    paths: {
      root: `/${"very-long-root/".repeat(24)}${suffix}`,
      skills: null,
      mcp: null,
      plugins: null,
      rules: null,
      configFiles: [],
      configFileRelativePaths: [],
    },
    capabilities: {
      overview: { status: "supported" },
      provider: { status: "supported" },
      appearance: { status: "unsupported" },
      assets: { status: "unsupported" },
      configFiles: { status: "unsupported" },
      sessions: { status: "unsupported" },
      usage: { status: "unsupported" },
      maintenance: { status: "unsupported" },
    },
  };
}

function createProfile(index: number): AgentProviderProfilePublic {
  const suffix = String(index).padStart(3, "0");
  return {
    id: `profile-${suffix}`,
    platformId: "custom-agent-000",
    name: `Provider ${suffix} ${"long-name-".repeat(12)}`,
    providerKind: "openai-compatible",
    protocol: "openai-chat",
    endpoint: "https://example.com/v1",
    config: {},
    source: "manual",
    archived: false,
    createdAt: index,
    updatedAt: index,
    secretState: "none",
    modelMappings: [
      {
        id: `mapping-${suffix}`,
        providerProfileId: `profile-${suffix}`,
        routeKey: "primary",
        modelId: `model-${suffix}`,
        parameters: {},
      },
    ],
  };
}

function virtualizerCallForCount(count: number) {
  return vi
    .mocked(useVirtualizer)
    .mock.calls.map(([options]) => options)
    .find((options) => options.count === count);
}

describe("Agent workspace resilience", () => {
  beforeEach(() => {
    installWindowMocks();
    vi.mocked(useVirtualizer).mockClear();
    useAgentStore.setState({
      agents: [],
      selectedAgentId: null,
      searchQuery: "",
      pinnedAgentIds: [],
      isLoading: false,
      hasLoaded: true,
      error: null,
    });
    useAgentProviderStore.setState({
      platformId: null,
      profiles: [],
      currentState: null,
      selectedProfileId: null,
      importPreview: null,
      activationPlan: null,
      activationResult: null,
      connectionResult: null,
      modelTestResult: null,
      modelTestRequestId: null,
      busyAction: null,
      errorCode: null,
    });
    delete (window as Window & { __PROMPTHUB_SKILL_EDITOR_DIRTY?: boolean })
      .__PROMPTHUB_SKILL_EDITOR_DIRTY;
  });

  it("virtualizes 50+ Agents and preserves search and selection", async () => {
    const agents = Array.from({ length: 60 }, (_, index) => createAgent(index));
    useAgentStore.setState({
      agents,
      selectedAgentId: agents[0].id,
    });

    await renderWithI18n(<AgentsSidebarPanel />);

    const options = virtualizerCallForCount(60);
    expect(options).toBeDefined();
    expect(options?.overscan).toBe(6);
    expect(options?.estimateSize(0)).toBeGreaterThanOrEqual(72);
    expect(options?.getItemKey?.(59)).toBe("custom-agent-059");
    expect(screen.getAllByRole("listitem")).toHaveLength(60);
    expect(screen.getAllByRole("listitem")[59]).toHaveAttribute(
      "aria-setsize",
      "60",
    );

    fireEvent.change(screen.getByPlaceholderText("Search Agents"), {
      target: { value: "Agent 059" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Agent 059" }));
    await waitFor(() => expect(useAgentStore.getState().selectedAgentId).toBe("custom-agent-059"));
  });

  it("confirms before switching Agents with unsaved config changes", async () => {
    const agents = [createAgent(1), createAgent(2)];
    useAgentStore.setState({ agents, selectedAgentId: agents[0].id });
    (
      window as Window & { __PROMPTHUB_SKILL_EDITOR_DIRTY?: boolean }
    ).__PROMPTHUB_SKILL_EDITOR_DIRTY = true;
    await renderWithI18n(<ConfirmationHost />);
    const confirm = vi.spyOn(window, "confirm");

    await renderWithI18n(<AgentsSidebarPanel />);
    fireEvent.click(screen.getByRole("button", { name: agents[1].name }));

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(confirm).not.toHaveBeenCalled();
    expect(useAgentStore.getState().selectedAgentId).toBe(agents[0].id);


    fireEvent.click(screen.getByRole("button", { name: agents[1].name }));
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(useAgentStore.getState().selectedAgentId).toBe(agents[1].id));
    confirm.mockRestore();
  });

  it("keeps long identity text bounded while retaining its accessible name", async () => {
    const agent = createAgent(0);
    useAgentStore.setState({
      agents: [agent],
      selectedAgentId: agent.id,
    });

    await renderWithI18n(<AgentsWorkspace />, { settleAsyncEffects: true });

    const launch = screen.getByRole("button", {
      name: `Open ${agent.name}`,
    });
    expect(launch).toHaveTextContent(/^Open$/);
    expect(launch.parentElement?.className).toContain("flex-wrap");
    expect(
      screen.getByRole("heading", { name: agent.name }).className,
    ).toContain("truncate");
  });

  it("moves tab focus to Overview when the next Agent disables the active tab", async () => {
    const sessionAgent = {
      ...createAgent(1),
      capabilities: {
        ...createAgent(1).capabilities,
        sessions: { status: "supported" as const },
      },
    };
    const unsupportedAgent = createAgent(2);
    useAgentStore.setState({
      agents: [sessionAgent, unsupportedAgent],
      selectedAgentId: sessionAgent.id,
    });

    await renderWithI18n(<AgentsWorkspace />, { settleAsyncEffects: true });

    const sessions = screen.getByRole("tab", { name: "Sessions" });
    fireEvent.click(sessions);
    sessions.focus();
    expect(sessions).toHaveFocus();

    act(() => {
      useAgentStore.setState({ selectedAgentId: unsupportedAgent.id });
    });

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    expect(sessions).toBeDisabled();
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveFocus();
  });

  it("virtualizes 100+ Provider Profiles and keeps current selection usable", async () => {
    const agent = createAgent(0);
    const profiles = Array.from({ length: 120 }, (_, index) =>
      createProfile(index),
    );
    vi.mocked(window.api.agent.listProviderProfiles).mockResolvedValue(
      profiles,
    );
    vi.mocked(window.api.agent.getProviderCurrentState).mockResolvedValue({
      platformId: agent.id,
      status: "verified",
      currentProfileId: "profile-119",
      nativeConfig: null,
      checkedAt: 1,
    });

    await act(async () => {
      await renderWithI18n(<AgentProviderProfileWorkbench agent={agent} />, {
        settleAsyncEffects: true,
      });
    });
    await waitFor(() =>
      expect(useAgentProviderStore.getState().profiles).toHaveLength(120),
    );

    const options = virtualizerCallForCount(120);
    expect(options).toBeDefined();
    expect(options?.overscan).toBe(6);
    expect(options?.estimateSize(0)).toBeGreaterThanOrEqual(60);
    expect(options?.getItemKey?.(119)).toBe("profile-119");
    const profileItems = screen
      .getAllByRole("listitem")
      .filter((item) => item.getAttribute("aria-setsize") === "120");
    expect(profileItems).toHaveLength(120);
    expect(profileItems[119]).toHaveAttribute("aria-setsize", "120");

    fireEvent.click(
      screen.getByRole("button", {
        name: /Provider 119/,
      }),
    );
    expect(useAgentProviderStore.getState().selectedProfileId).toBe(
      "profile-119",
    );
    expect(screen.getAllByText("Current").length).toBeGreaterThan(0);
  });
});
