import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AgentUsageMetric,
  AgentUsageQuota,
  ManagedAgentSummary,
} from "@prompthub/shared/types";
import { AgentUsageBanner } from "../../../src/renderer/components/agent/AgentUsageBanner";
import {
  readCachedAgentUsage,
  writeCachedAgentUsage,
} from "../../../src/renderer/components/agent/use-agent-usage";
import { renderWithI18n as renderWithI18nBase } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

function renderWithI18n(ui: ReactElement) {
  return renderWithI18nBase(ui, { settleAsyncEffects: true });
}

const agent: ManagedAgentSummary = {
  id: "claude",
  name: "Claude Code",
  icon: "Sparkles",
  isCustom: false,
  isConfigured: true,
  isDetected: true,
  isPinned: false,
  status: "installed",
  paths: {
    root: "~/.claude",
    skills: "~/.claude/skills",
    configFiles: ["~/.claude/settings.json"],
    configFileRelativePaths: ["settings.json"],
  },
  capabilities: {
    overview: { status: "supported" },
    provider: { status: "partial", reason: "model-config-only" },
    appearance: {
      status: "unsupported",
      reason: "appearance-adapter-unavailable",
    },
    assets: { status: "partial", reason: "asset-paths-only" },
    configFiles: { status: "partial", reason: "direct-file-editing" },
    sessions: { status: "supported" },
    usage: { status: "supported" },
    maintenance: { status: "partial", reason: "refresh-and-settings" },
  },
};

function createMetric(overrides: {
  id: string;
  label?: string;
  kind: "window" | "quota";
  utilization?: number;
  resetsAt?: number | null;
  usedAmount?: number;
  totalAmount?: number;
  unit?: string;
  scope?: AgentUsageMetric["scope"];
  period?: AgentUsageMetric["period"];
}): AgentUsageMetric {
  const utilization = overrides.utilization ?? 0;
  const remainingPercent = 100 - utilization;
  const value: AgentUsageMetric["value"] =
    overrides.usedAmount !== undefined && overrides.totalAmount !== undefined
      ? {
          kind: "amount",
          remainingPercent,
          remainingAmount: overrides.totalAmount - overrides.usedAmount,
          limitAmount: overrides.totalAmount,
          unit: overrides.unit ?? "requests",
        }
      : { kind: "percentage", remainingPercent };
  return {
    id: overrides.id,
    label: overrides.label ?? overrides.id,
    scope: overrides.scope ?? { kind: "account" },
    period:
      overrides.period ??
      (overrides.id === "weekly" || overrides.id.endsWith(":weekly")
        ? { kind: "calendar", unit: "week" }
        : {
            kind: "rolling",
            durationSeconds:
              overrides.id.includes("fiveHour") || overrides.id.endsWith(":5h")
                ? 18_000
                : null,
          }),
    value,
    resetsAt: overrides.resetsAt ?? null,
  };
}

function createQuota(
  overrides: Partial<AgentUsageQuota> = {},
): AgentUsageQuota {
  return {
    schemaVersion: 2,
    agentId: "claude",
    adapter: "claude-oauth-v1",
    status: "ok",
    source: "provider",
    metrics: [
      createMetric({
        id: "fiveHour",
        label: "5-hour window",
        kind: "window",
        utilization: 42.4,
        resetsAt: Date.now() + (2 * 60 + 5) * 60_000,
      }),
      createMetric({
        id: "sevenDay",
        label: "7-day window",
        kind: "window",
        utilization: 18,
        resetsAt: Date.now() + 3 * 24 * 3_600_000,
      }),
    ],
    plan: "claude-pro",
    fetchedAt: Date.now(),
    ...overrides,
  };
}

describe("AgentUsageBanner", () => {
  beforeEach(() => {
    installWindowMocks();
    window.localStorage.clear();
  });

  it.each([
    ["network-error", "Cannot connect to the usage service. Check your network and PromptHub proxy settings."],
    ["timeout", "The usage request timed out. Check your network and proxy, then retry."],
    ["http-error", "The usage service returned an HTTP error. Try again later."],
    ["unrecognized", "Usage data could not be retrieved right now. Try again."],
  ])("explains %s and retries through the usage API", async (errorCode, message) => {
    window.api.agent.getUsage = vi.fn()
      .mockResolvedValueOnce(createQuota({ status: "unavailable", metrics: [], errorCode }))
      .mockResolvedValueOnce(createQuota());
    await renderWithI18n(<AgentUsageBanner agent={agent} />);
    expect(await screen.findByText(message)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByText(message)).toBeNull());
    expect(await screen.findAllByRole("progressbar")).toHaveLength(2);
    expect(window.api.agent.getUsage).toHaveBeenLastCalledWith(agent.id, { forceRefresh: true });
  });

  it("renders compact window meters with countdowns and plan badge without a provider note", async () => {
    window.api.agent.getUsage = vi.fn().mockResolvedValue(createQuota());

    await renderWithI18n(<AgentUsageBanner agent={agent} />);

    expect(
      await screen.findByRole("progressbar", {
        name: "5-hour window: 58% remaining",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("progressbar", {
        name: "7-day window: 82% remaining",
      }),
    ).toBeVisible();
    expect(screen.queryByRole("progressbar", { name: /Opus/ })).toBeNull();
    expect(await screen.findByText(/Resets in 2h \d+m/)).toBeVisible();
    expect(screen.getByText(/Resets in 3d 0h/)).toBeVisible();
    expect(
      screen.getByText("Claude Pro").closest("[data-usage-plan]"),
    ).toHaveClass("bg-primary/10", "text-primary");
    expect(
      screen.queryByText("Usage data reported by the provider"),
    ).not.toBeInTheDocument();
    expect(window.api.agent.getUsage).toHaveBeenCalledWith("claude");
  });

  it("renders the Opus window only when the provider reports it", async () => {
    window.api.agent.getUsage = vi.fn().mockResolvedValue(
      createQuota({
        metrics: [
          ...createQuota().metrics,
          createMetric({
            id: "sevenDayOpus",
            label: "7-day Opus window",
            kind: "window",
            utilization: 95,
          }),
        ],
        plan: null,
      }),
    );

    await renderWithI18n(<AgentUsageBanner agent={agent} />);

    expect(
      await screen.findByRole("progressbar", {
        name: "7-day Opus window: 5% remaining",
      }),
    ).toBeVisible();
    expect(screen.getAllByRole("progressbar")).toHaveLength(3);
    expect(screen.queryByText("claude-pro")).not.toBeInTheDocument();
  });

  it("renders a single meter without empty placeholders when only one quota is reported", async () => {
    window.api.agent.getUsage = vi.fn().mockResolvedValue(
      createQuota({
        metrics: [
          createMetric({
            id: "sevenDay",
            label: "7-day window",
            kind: "window",
            utilization: 18,
            resetsAt: Date.now() + 3 * 24 * 3_600_000,
          }),
        ],
        plan: null,
      }),
    );

    await renderWithI18n(<AgentUsageBanner agent={agent} />);

    expect(
      await screen.findByRole("progressbar", {
        name: "7-day window: 82% remaining",
      }),
    ).toBeVisible();
    expect(screen.getAllByRole("progressbar")).toHaveLength(1);
    expect(
      screen.queryByRole("progressbar", { name: /5-hour window/ }),
    ).toBeNull();
    expect(screen.queryByRole("progressbar", { name: /Opus/ })).toBeNull();
  });

  it("renders period and amount quotas with the same meter primitive", async () => {
    window.api.agent.getUsage = vi.fn().mockResolvedValue(
      createQuota({
        agentId: "copilot",
        metrics: [
          createMetric({
            id: "weekly",
            label: "weekly",
            kind: "window",
            utilization: 40,
            resetsAt: Date.now() + 2 * 24 * 3_600_000,
          }),
          createMetric({
            id: "premium",
            label: "premium",
            kind: "quota",
            utilization: 25,
            usedAmount: 250,
            totalAmount: 500,
            unit: "requests",
            period: { kind: "calendar", unit: "billing-cycle" },
            resetsAt: Date.now() + 5 * 3_600_000,
          }),
          createMetric({
            id: "chat",
            label: "chat",
            kind: "quota",
            utilization: 90,
            usedAmount: 90,
            totalAmount: 100,
            unit: "requests",
            period: { kind: "calendar", unit: "billing-cycle" },
          }),
        ],
        plan: "copilot-pro",
      }),
    );

    await renderWithI18n(<AgentUsageBanner agent={agent} />);

    expect(
      await screen.findByRole("progressbar", {
        name: "Weekly quota: 60% remaining",
      }),
    ).toBeVisible();

    const premiumBar = screen.getByRole("progressbar", {
      name: "Premium requests: 75% remaining",
    });
    expect(premiumBar).toHaveAttribute("aria-valuenow", "75");
    expect(premiumBar).toHaveAttribute("aria-valuemin", "0");
    expect(premiumBar).toHaveAttribute("aria-valuemax", "100");
    expect(premiumBar).toHaveAttribute("data-usage-visual", "bar");

    const chatBar = screen.getByRole("progressbar", {
      name: "Chat requests: 10% remaining",
    });
    expect(chatBar).toHaveAttribute("aria-valuenow", "10");
    expect(chatBar).toHaveAttribute("data-usage-visual", "bar");

    expect(screen.getByText("250 / 500 requests remaining")).toBeVisible();
    expect(screen.getByText(/Resets in 5h \d+m/)).toBeVisible();
    expect(screen.getAllByRole("progressbar")).toHaveLength(3);
  });

  it("shows provider-defined model quotas with the shared meter", async () => {
    window.api.agent.getUsage = vi.fn().mockResolvedValue(
      createQuota({
        agentId: "gemini",
        metrics: [
          createMetric({
            id: "model:gemini-2.5-pro",
            label: "Gemini 2.5 Pro",
            kind: "window",
            utilization: 30,
            scope: {
              kind: "model",
              id: "gemini-2.5-pro",
              label: "Gemini 2.5 Pro",
            },
          }),
        ],
        plan: null,
      }),
    );

    await renderWithI18n(<AgentUsageBanner agent={agent} />);

    expect(
      await screen.findByRole("progressbar", {
        name: "Gemini 2.5 Pro: 70% remaining",
      }),
    ).toBeVisible();
    expect(screen.getByText("Gemini 2.5 Pro")).toBeVisible();
    expect(screen.getAllByRole("progressbar")).toHaveLength(1);
  });

  it("groups feature and model quotas and bounds model detail until expanded", async () => {
    const models = Array.from({ length: 6 }, (_, index) =>
      createMetric({
        id: `model-${index}`,
        label: `Model ${index}`,
        kind: "window",
        utilization: 10 + index,
        scope: { kind: "model", id: String(index), label: `Model ${index}` },
        period: { kind: "lifetime" },
      }),
    );
    window.api.agent.getUsage = vi.fn().mockResolvedValue(
      createQuota({
        metrics: [
          createMetric({
            id: "feature-custom",
            label: "Code completions",
            kind: "quota",
            utilization: 20,
            scope: {
              kind: "feature",
              id: "completions",
              label: "Code completions",
            },
            period: { kind: "calendar", unit: "billing-cycle" },
          }),
          ...models,
        ],
      }),
    );

    await renderWithI18n(<AgentUsageBanner agent={agent} />);

    expect(await screen.findByText("Features")).toBeVisible();
    expect(screen.getByText("Models")).toBeVisible();
    expect(screen.getAllByRole("progressbar")).toHaveLength(5);
    const showAll = screen.getByRole("button", { name: "Show 2 more" });
    expect(showAll).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(showAll);
    expect(screen.getAllByRole("progressbar")).toHaveLength(7);
    expect(screen.getByTestId("usage-groups")).toHaveClass(
      "max-h-80",
      "overflow-y-auto",
    );
    fireEvent.click(screen.getByRole("button", { name: "Show fewer" }));
    expect(screen.getAllByRole("progressbar")).toHaveLength(5);
  });

  it("shows a truthful empty state when a provider reports no quota", async () => {
    window.api.agent.getUsage = vi.fn().mockResolvedValue(
      createQuota({
        metrics: [],
        plan: null,
      }),
    );

    await renderWithI18n(<AgentUsageBanner agent={agent} />);

    expect(
      await screen.findByText("The provider did not report a quota."),
    ).toBeVisible();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("groups Antigravity pools while keeping one quantitative primitive", async () => {
    window.api.agent.getUsage = vi.fn().mockResolvedValue(
      createQuota({
        agentId: "antigravity",
        metrics: [
          createMetric({
            id: "antigravity:gemini-weekly:weekly",
            label: "Gemini Models",
            kind: "window",
            utilization: 20,
            scope: {
              kind: "model-group",
              id: "gemini",
              label: "Gemini Models",
            },
          }),
          createMetric({
            id: "antigravity:gemini-5h:5h",
            label: "Gemini Models",
            kind: "window",
            utilization: 50,
            scope: {
              kind: "model-group",
              id: "gemini",
              label: "Gemini Models",
            },
          }),
          createMetric({
            id: "antigravity:3p-weekly:weekly",
            label: "Claude and GPT models",
            kind: "window",
            utilization: 0,
            scope: {
              kind: "model-group",
              id: "third-party",
              label: "Claude and GPT models",
            },
          }),
          createMetric({
            id: "antigravity:3p-5h:5h",
            label: "Claude and GPT models",
            kind: "window",
            utilization: 75,
            scope: {
              kind: "model-group",
              id: "third-party",
              label: "Claude and GPT models",
            },
          }),
        ],
        plan: "Google AI Pro",
      }),
    );

    await renderWithI18n(<AgentUsageBanner agent={agent} />);

    expect(
      await screen.findByRole("progressbar", {
        name: "Weekly quota: 80% remaining",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("progressbar", {
        name: "5-hour window: 50% remaining",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("progressbar", {
        name: "Weekly quota: 100% remaining",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("progressbar", {
        name: "5-hour window: 25% remaining",
      }),
    ).toBeVisible();
    expect(screen.getAllByRole("progressbar")).toHaveLength(4);
    expect(screen.getByText("Gemini Models")).toBeVisible();
    expect(screen.getByText("Claude and GPT models")).toBeVisible();
    const geminiGroup = document.querySelector(
      '[data-usage-group="model-group:gemini"]',
    );
    const geminiRings = geminiGroup?.querySelector("[data-usage-rings]");
    expect(geminiRings).toHaveClass("flex", "flex-wrap");
    expect(geminiRings?.children).toHaveLength(2);
    expect(geminiRings?.children[0]).toHaveClass("w-44");
    expect(
      screen.queryByText("Monthly prompt credits"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("49,500 / 50,000 credits remaining"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("usage-ring-groups")).toHaveStyle({
      gridTemplateColumns: "repeat(auto-fit, minmax(min(25rem, 100%), 1fr))",
    });
  });

  it("renders the banner for kimi after the usage capability flip", async () => {
    const kimiAgent: ManagedAgentSummary = {
      ...agent,
      id: "kimi",
      name: "Kimi Code",
      paths: {
        root: "~/.kimi-code",
        skills: "~/.kimi-code/skills",
        configFiles: ["~/.kimi-code/config.toml"],
        configFileRelativePaths: ["config.toml"],
      },
    };
    window.api.agent.getUsage = vi.fn().mockResolvedValue(
      createQuota({
        agentId: "kimi",
        metrics: [
          createMetric({
            id: "weekly",
            label: "weekly",
            kind: "quota",
            utilization: 55,
            usedAmount: 55,
            totalAmount: 100,
            resetsAt: Date.now() + 2 * 24 * 3_600_000,
          }),
          createMetric({
            id: "rolling",
            label: "rolling",
            kind: "quota",
            utilization: 10,
            usedAmount: 10,
            totalAmount: 100,
            resetsAt: Date.now() + 3_600_000,
          }),
        ],
        plan: "LEVEL_INTERMEDIATE",
      }),
    );

    await renderWithI18n(<AgentUsageBanner agent={kimiAgent} />);

    const weekly = await screen.findByRole("progressbar", {
      name: "Weekly quota: 45% remaining",
    });
    const rolling = screen.getByRole("progressbar", {
      name: "Rolling window: 90% remaining",
    });
    expect(weekly).toHaveAttribute("data-usage-visual", "ring");
    expect(rolling).toHaveAttribute("data-usage-visual", "ring");
    expect(screen.getByText("Allegretto")).toBeVisible();
    expect(screen.queryByText("LEVEL_INTERMEDIATE")).not.toBeInTheDocument();
    expect(window.api.agent.getUsage).toHaveBeenCalledWith("kimi");
  });

  it("reloads the quota when the refresh button is clicked", async () => {
    const getUsage = vi.fn().mockResolvedValue(createQuota());
    window.api.agent.getUsage = getUsage;

    await renderWithI18n(<AgentUsageBanner agent={agent} />);
    await screen.findByRole("progressbar", {
      name: "5-hour window: 58% remaining",
    });
    expect(getUsage).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(getUsage).toHaveBeenCalledTimes(2));
    expect(getUsage).toHaveBeenNthCalledWith(2, "claude", {
      forceRefresh: true,
    });
  });

  it("guides sign-in when no Claude Code credentials are detected", async () => {
    const getUsage = vi
      .fn()
      .mockResolvedValue(createQuota({ status: "no-credentials" }));
    window.api.agent.getUsage = getUsage;

    await renderWithI18n(<AgentUsageBanner agent={agent} />);

    expect(
      await screen.findByText("No Claude Code sign-in detected"),
    ).toBeVisible();
    expect(
      screen.getByText("Sign in to Claude Code first, then refresh usage."),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => expect(getUsage).toHaveBeenCalledTimes(2));
  });

  it("guides a credential refresh when the token is expired", async () => {
    window.api.agent.getUsage = vi
      .fn()
      .mockResolvedValue(createQuota({ status: "expired" }));

    await renderWithI18n(<AgentUsageBanner agent={agent} />);

    expect(await screen.findByText("Credentials expired")).toBeVisible();
    expect(
      screen.getByText("Open Claude Code once to refresh your credentials."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: /retry/i })).toBeEnabled();
  });

  it("names the current agent in guided states instead of hardcoding Claude Code", async () => {
    const kimiAgent: ManagedAgentSummary = {
      ...agent,
      id: "kimi",
      name: "Kimi Code",
    };
    window.api.agent.getUsage = vi
      .fn()
      .mockResolvedValue(
        createQuota({ agentId: "kimi", status: "no-credentials" }),
      );

    await renderWithI18n(<AgentUsageBanner agent={kimiAgent} />);

    expect(
      await screen.findByText("No Kimi Code sign-in detected"),
    ).toBeVisible();
    expect(
      screen.getByText("Sign in to Kimi Code first, then refresh usage."),
    ).toBeVisible();
  });

  it("shows the custom provider state without a retry action when a third-party provider is active", async () => {
    window.api.agent.getUsage = vi.fn().mockResolvedValue(
      createQuota({
        status: "unavailable",
        errorCode: "custom-provider-active",
      }),
    );

    await renderWithI18n(<AgentUsageBanner agent={agent} />);

    expect(await screen.findByText("Custom provider active")).toBeVisible();
    expect(
      screen.getByText(
        "The default provider is a custom third-party endpoint. Usage quota is only available for the official subscription. Check the Provider & Model tab for the active provider.",
      ),
    ).toBeVisible();
    expect(screen.queryByText("Usage unavailable")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /retry/i }),
    ).not.toBeInTheDocument();
    expect(window.api.agent.getUsage).toHaveBeenCalledWith("claude");
  });

  it("shows the unavailable state when the adapter cannot report usage", async () => {
    window.api.agent.getUsage = vi
      .fn()
      .mockResolvedValue(createQuota({ status: "unavailable" }));

    await renderWithI18n(<AgentUsageBanner agent={agent} />);

    expect(await screen.findByText("Usage unavailable")).toBeVisible();
    expect(screen.getByRole("button", { name: /retry/i })).toBeEnabled();
  });

  it("asks Antigravity users to keep the desktop app running instead of claiming sign-in expired", async () => {
    const antigravityAgent: ManagedAgentSummary = {
      ...agent,
      id: "antigravity",
      name: "Antigravity",
      launchable: true,
    };
    window.api.agent.launch = vi.fn().mockResolvedValue({ success: true });
    window.api.agent.getUsage = vi.fn().mockResolvedValue(
      createQuota({
        agentId: "antigravity",
        status: "unavailable",
        errorCode: "antigravity-not-running",
      }),
    );

    const view = await renderWithI18n(
      <AgentUsageBanner agent={antigravityAgent} />,
    );

    expect(await screen.findByText("Antigravity is not running")).toBeVisible();
    expect(
      screen.getByText(
        "Keep Antigravity running so PromptHub can read the quota from your current signed-in session, then retry.",
      ),
    ).toBeVisible();
    expect(screen.queryByText("Credentials expired")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open Antigravity" }));
    await waitFor(() =>
      expect(window.api.agent.launch).toHaveBeenCalledWith("antigravity"),
    );
    view.unmount();
    await renderWithI18n(
      <AgentUsageBanner agent={{ ...antigravityAgent, launchable: false }} />,
    );
    expect(
      screen.queryByRole("button", { name: "Open Antigravity" }),
    ).toBeNull();
  });

  it("shows the unavailable state when the IPC call rejects", async () => {
    window.api.agent.getUsage = vi
      .fn()
      .mockRejectedValue(new Error("ipc failure"));

    await renderWithI18n(<AgentUsageBanner agent={agent} />);

    expect(await screen.findByText("Usage unavailable")).toBeVisible();
    expect(screen.getByRole("button", { name: /retry/i })).toBeEnabled();
  });

  it("renders the banner for a partially supported usage capability", async () => {
    const partialAgent: ManagedAgentSummary = {
      ...agent,
      capabilities: {
        ...agent.capabilities,
        usage: { status: "partial", reason: "quota-window-partial" },
      },
    };
    window.api.agent.getUsage = vi.fn().mockResolvedValue(createQuota());

    await renderWithI18n(<AgentUsageBanner agent={partialAgent} />);

    expect(
      await screen.findByRole("progressbar", {
        name: "5-hour window: 58% remaining",
      }),
    ).toBeVisible();
    expect(window.api.agent.getUsage).toHaveBeenCalledWith("claude");
  });

  it("renders neutral skeletons and swaps in real data without fake quota values", async () => {
    let resolveUsage: (value: AgentUsageQuota) => void = () => undefined;
    window.api.agent.getUsage = vi.fn(
      () =>
        new Promise<AgentUsageQuota>((resolve) => {
          resolveUsage = resolve;
        }),
    );

    await renderWithI18n(<AgentUsageBanner agent={agent} />);

    const banner = screen.getByRole("region", { name: "Usage" });
    expect(banner.className).toContain("bg-card");
    expect(screen.getByTestId("usage-skeleton")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeDisabled();

    resolveUsage(createQuota());

    expect(
      await screen.findByRole("progressbar", {
        name: "5-hour window: 58% remaining",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("progressbar", {
        name: "7-day window: 82% remaining",
      }),
    ).toBeVisible();
  });

  it("keeps the previous quota visible while a refresh is in flight", async () => {
    let resolveSecond: (value: AgentUsageQuota) => void = () => undefined;
    const getUsage = vi
      .fn()
      .mockResolvedValueOnce(createQuota())
      .mockImplementationOnce(
        () =>
          new Promise<AgentUsageQuota>((resolve) => {
            resolveSecond = resolve;
          }),
      );
    window.api.agent.getUsage = getUsage;

    await renderWithI18n(<AgentUsageBanner agent={agent} />);
    await screen.findByRole("progressbar", {
      name: "5-hour window: 58% remaining",
    });

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(getUsage).toHaveBeenCalledTimes(2));
    expect(
      screen.getByRole("progressbar", {
        name: "5-hour window: 58% remaining",
      }),
    ).toBeVisible();
    expect(screen.queryByRole("progressbar", { name: /: 0%/ })).toBeNull();

    resolveSecond(createQuota());
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled(),
    );
  });

  it("shows the cached quota immediately and replaces it with fresh data", async () => {
    window.localStorage.setItem(
      `prompthub.agent-usage.claude.${encodeURIComponent(agent.paths.root)}`,
      JSON.stringify(
        createQuota({
          metrics: [
            createMetric({
              id: "fiveHour",
              label: "5-hour window",
              kind: "window",
              utilization: 90,
            }),
          ],
        }),
      ),
    );
    let resolveUsage: (value: AgentUsageQuota) => void = () => undefined;
    window.api.agent.getUsage = vi.fn(
      () =>
        new Promise<AgentUsageQuota>((resolve) => {
          resolveUsage = resolve;
        }),
    );

    await renderWithI18n(<AgentUsageBanner agent={agent} />);

    expect(
      screen.getByRole("progressbar", {
        name: "5-hour window: 10% remaining",
      }),
    ).toBeVisible();
    expect(screen.queryByText("Cached quota · updating")).toBeNull();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeDisabled();
    expect(window.api.agent.getUsage).toHaveBeenCalledWith("claude");

    resolveUsage(createQuota());

    expect(
      await screen.findByRole("progressbar", {
        name: "5-hour window: 58% remaining",
      }),
    ).toBeVisible();
    await waitFor(() => {
      const raw = window.localStorage.getItem(`prompthub.agent-usage.claude.${encodeURIComponent(agent.paths.root)}`);
      expect(raw).not.toBeNull();
      const cached = JSON.parse(raw as string) as AgentUsageQuota;
      const fiveHour = cached.metrics.find(
        (metric) => metric.id === "fiveHour",
      );
      expect(fiveHour?.value).toEqual({
        kind: "percentage",
        remainingPercent: 57.6,
      });
    });
  });

  it("keeps cached quota visible and marks it stale when refresh fails", async () => {
    window.localStorage.setItem(
      `prompthub.agent-usage.claude.${encodeURIComponent(agent.paths.root)}`,
      JSON.stringify(createQuota()),
    );
    window.api.agent.getUsage = vi
      .fn()
      .mockRejectedValue(new Error("provider unavailable"));

    await renderWithI18n(<AgentUsageBanner agent={agent} />);

    expect(
      await screen.findByText("Cached quota · refresh failed"),
    ).toBeVisible();
    expect(
      screen.getByRole("progressbar", {
        name: "5-hour window: 58% remaining",
      }),
    ).toBeVisible();
  });

  it("ignores cached entries for other agents or non-ok statuses", async () => {
    window.localStorage.setItem(
      `prompthub.agent-usage.claude.${encodeURIComponent(agent.paths.root)}`,
      JSON.stringify(createQuota({ agentId: "codex" })),
    );
    window.localStorage.setItem(
      `prompthub.agent-usage.codex.${encodeURIComponent(agent.paths.root)}`,
      JSON.stringify(createQuota({ agentId: "codex", status: "expired" })),
    );
    let resolveUsage: (value: AgentUsageQuota) => void = () => undefined;
    window.api.agent.getUsage = vi.fn(
      () =>
        new Promise<AgentUsageQuota>((resolve) => {
          resolveUsage = resolve;
        }),
    );

    await renderWithI18n(<AgentUsageBanner agent={agent} />);

    expect(screen.getByTestId("usage-skeleton")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    resolveUsage(createQuota());
    await screen.findByRole("progressbar", {
      name: "5-hour window: 58% remaining",
    });
  });

  it("ignores caches written by the old fixed-window contract instead of crashing", async () => {
    window.localStorage.setItem(
      `prompthub.agent-usage.claude.${encodeURIComponent(agent.paths.root)}`,
      JSON.stringify({
        agentId: "claude",
        adapter: "claude-oauth-v1",
        status: "ok",
        source: "provider",
        fiveHour: { utilization: 42.4, resetsAt: null },
        sevenDay: { utilization: 18, resetsAt: null },
        sevenDayOpus: null,
        plan: "claude-pro",
        fetchedAt: Date.now(),
      }),
    );
    window.api.agent.getUsage = vi.fn().mockResolvedValue(createQuota());

    await renderWithI18n(<AgentUsageBanner agent={agent} />);

    expect(
      await screen.findByRole("progressbar", {
        name: "5-hour window: 58% remaining",
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole("progressbar", { name: "5-hour window: 0%" }),
    ).not.toBeInTheDocument();
  });

  it("rejects malformed V2 cache payloads and tolerates storage failures", () => {
    window.localStorage.setItem(`prompthub.agent-usage.claude.${encodeURIComponent(agent.paths.root)}`, "{");
    expect(readCachedAgentUsage("claude", agent.paths.root)).toBeNull();

    window.localStorage.setItem(
      `prompthub.agent-usage.claude.${encodeURIComponent(agent.paths.root)}`,
      JSON.stringify(createQuota({ metrics: {} as never })),
    );
    expect(readCachedAgentUsage("claude", agent.paths.root)).toBeNull();
    window.localStorage.setItem(
      `prompthub.agent-usage.claude.${encodeURIComponent(agent.paths.root)}`,
      JSON.stringify(createQuota({ metrics: [{ id: "broken" }] as never })),
    );
    expect(readCachedAgentUsage("claude", agent.paths.root)).toBeNull();
    window.localStorage.setItem(
      `prompthub.agent-usage.claude.${encodeURIComponent(agent.paths.root)}`,
      JSON.stringify(
        createQuota({
          metrics: Array.from({ length: 65 }, (_, index) =>
            createMetric({
              id: `metric-${index}`,
              kind: "window",
            }),
          ),
        }),
      ),
    );
    expect(readCachedAgentUsage("claude", agent.paths.root)).toBeNull();

    const invalidPayloads = [
      { ...createQuota(), adapter: "" },
      { ...createQuota(), source: "derived" },
      { ...createQuota(), plan: {} },
      { ...createQuota(), fetchedAt: null },
      {
        ...createQuota(),
        metrics: [
          {
            ...createQuota().metrics[0],
            value: { kind: "percentage", remainingPercent: 101 },
          },
        ],
      },
    ];
    for (const payload of invalidPayloads) {
      window.localStorage.setItem(
        `prompthub.agent-usage.claude.${encodeURIComponent(agent.paths.root)}`,
        JSON.stringify(payload),
      );
      expect(readCachedAgentUsage("claude", agent.paths.root)).toBeNull();
    }

    const setItem = vi.spyOn(Storage.prototype, "setItem");
    writeCachedAgentUsage(agent.paths.root, createQuota({ status: "expired" }));
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockImplementationOnce(() => {
      throw new Error("quota exceeded");
    });
    expect(() => writeCachedAgentUsage(agent.paths.root, createQuota())).not.toThrow();
    setItem.mockRestore();
  });

  it("rejects cached Antigravity snapshots containing the retired credit total", () => {
    window.localStorage.setItem(
      `prompthub.agent-usage.antigravity.${encodeURIComponent(agent.paths.root)}`,
      JSON.stringify(
        createQuota({
          agentId: "antigravity",
          adapter: "antigravity-local-v1",
          metrics: [
            createMetric({
              id: "promptCredits",
              label: "Monthly prompt credits",
              kind: "quota",
              utilization: 1,
              usedAmount: 500,
              totalAmount: 50_000,
              unit: "credits",
            }),
          ],
        }),
      ),
    );

    expect(readCachedAgentUsage("antigravity", agent.paths.root)).toBeNull();

    window.localStorage.setItem(
      `prompthub.agent-usage.antigravity.${encodeURIComponent(agent.paths.root)}`,
      JSON.stringify(
        createQuota({
          agentId: "antigravity",
          adapter: "antigravity-local-v1",
          metrics: [
            createMetric({
              id: "antigravity:gemini-weekly:weekly",
              label: "Weekly quota",
              kind: "window",
              utilization: 25,
              scope: {
                kind: "model-group",
                id: "group-0",
                label: "Gemini Models",
              },
            }),
          ],
        }),
      ),
    );
    expect(readCachedAgentUsage("antigravity", agent.paths.root)?.metrics).toHaveLength(1);
  });

  it("ignores a completed request after the banner unmounts", async () => {
    let resolveUsage: (value: AgentUsageQuota) => void = () => undefined;
    window.api.agent.getUsage = vi.fn(
      () =>
        new Promise<AgentUsageQuota>((resolve) => {
          resolveUsage = resolve;
        }),
    );

    const view = await renderWithI18n(<AgentUsageBanner agent={agent} />);
    view.unmount();
    resolveUsage(createQuota());
    await Promise.resolve();
    await Promise.resolve();

    expect(window.api.agent.getUsage).toHaveBeenCalledOnce();
  });

  it.each(["planned", "unsupported"] as const)(
    "does not render or fetch usage when the capability is %s",
    async (status) => {
      const gatedAgent: ManagedAgentSummary = {
        ...agent,
        capabilities: {
          ...agent.capabilities,
          usage: { status, reason: "adapter-pending" },
        },
      };

      await renderWithI18n(<AgentUsageBanner agent={gatedAgent} />);

      expect(
        screen.queryByRole("region", { name: "Usage" }),
      ).not.toBeInTheDocument();
      expect(window.api.agent.getUsage).not.toHaveBeenCalled();
    },
  );
});
