/**
 * @vitest-environment node
 */
import type { MenuItemConstructorOptions } from "electron";
import { describe, expect, it, vi } from "vitest";

import type {
  AgentUsageMetric,
  AgentUsageQuota,
  AppCommand,
} from "@prompthub/shared/types";
import type { AgentUsageTrayEntry } from "../../../src/main/services/agent-usage-tray-projection";
import {
  buildTrayMenuTemplate,
  getTrayMenuLabels,
  normalizeTrayMenuLanguage,
  SUPPORTED_TRAY_MENU_LANGUAGES,
} from "../../../src/main/tray-menu";

function getSubmenu(
  template: MenuItemConstructorOptions[],
  label: string,
): MenuItemConstructorOptions[] {
  const item = template.find((entry) => entry.label === label);
  expect(item).toBeDefined();
  expect(Array.isArray(item?.submenu)).toBe(true);
  return item?.submenu as MenuItemConstructorOptions[];
}

function clickItem(
  template: MenuItemConstructorOptions[],
  label: string,
): void {
  const item = template.find((entry) => entry.label === label);
  expect(item?.click).toBeTypeOf("function");
  (item?.click as () => void)();
}

function percentageMetric(
  id: string,
  label: string,
  remainingPercent: number,
  resetsAt: number | null = null,
): AgentUsageMetric {
  return {
    id,
    label,
    scope: { kind: "account" },
    period: { kind: "calendar", unit: "week" },
    value: { kind: "percentage", remainingPercent },
    resetsAt,
  };
}

function usageEntry(
  id: string,
  name: string,
  overrides: Partial<AgentUsageTrayEntry> = {},
): AgentUsageTrayEntry {
  const quota: AgentUsageQuota = {
    schemaVersion: 2,
    agentId: id,
    adapter: `${id}-test`,
    status: "ok",
    source: "provider",
    plan: "LEVEL_INTERMEDIATE",
    fetchedAt: 1_800_000_000_000,
    metrics: [percentageMetric("weekly", "Weekly quota", 34)],
  };
  return {
    id,
    name,
    isLoading: false,
    isStale: false,
    quota,
    ...overrides,
  };
}

describe("tray asset menu", () => {
  it("renders every verified named loading row and quota action inside the native menu", () => {
    const labels = getTrayMenuLabels("en");
    const onRefreshAgentUsage = vi.fn();
    const onCommand = vi.fn<(command: AppCommand) => void>();
    const agentUsageEntries = [
      ["claude", "Claude Code"],
      ["codex", "Codex"],
      ["kimi", "Kimi Code"],
      ["antigravity", "Antigravity"],
      ["gemini", "Gemini"],
      ["copilot", "GitHub Copilot"],
      ["grok", "Grok Build"],
    ].map(([id, name]) =>
      usageEntry(id, name, { isLoading: true, quota: null }),
    );
    const template = buildTrayMenuTemplate({
      agentManagementEnabled: true,
      agentUsageEntries,
      isWindowVisible: true,
      labels,
      onCommand,
      onRefreshAgentUsage,
      onQuit: vi.fn(),
      onToggleWindow: vi.fn(),
    });

    const usageMenu = getSubmenu(template, labels.agentUsage);
    expect(usageMenu.slice(0, 7).map((item) => item.label)).toEqual([
      "Claude Code — Loading…",
      "Codex — Loading…",
      "Kimi Code — Loading…",
      "Antigravity — Loading…",
      "Gemini — Loading…",
      "GitHub Copilot — Loading…",
      "Grok Build — Loading…",
    ]);
    expect(usageMenu.slice(0, 7).every((item) => item.enabled === false)).toBe(
      true,
    );
    clickItem(usageMenu, labels.refreshAgentUsage);
    clickItem(usageMenu, labels.openAgents);
    expect(onRefreshAgentUsage).toHaveBeenCalledOnce();
    expect(onCommand).toHaveBeenCalledWith({ type: "agent:manage" });
  });

  it("projects plain native plan, metric, reset and cached text safely", () => {
    const labels = getTrayMenuLabels("en");
    const now = 1_800_000_000_000;
    const entry = usageEntry("codex", "Codex", {
      isStale: true,
      quota: {
        ...usageEntry("codex", "Codex").quota!,
        metrics: [
          percentageMetric("weekly", "Weekly quota", 34, now + 86_400_000),
          {
            ...percentageMetric("custom", "Credits\u0000\nprivate", 81),
            period: { kind: "lifetime" },
          },
        ],
      },
    });
    const template = buildTrayMenuTemplate({
      agentManagementEnabled: true,
      agentUsageEntries: [entry],
      isWindowVisible: true,
      labels,
      now: () => now,
      onCommand: vi.fn(),
      onQuit: vi.fn(),
      onToggleWindow: vi.fn(),
    });

    const usageMenu = getSubmenu(template, labels.agentUsage);
    const codex = usageMenu.find(
      (item) => item.label === "Codex — 34% remaining · Cached",
    );
    expect(Array.isArray(codex?.submenu)).toBe(true);
    const details = codex?.submenu as MenuItemConstructorOptions[];
    expect(details.map((item) => item.label)).toEqual([
      "Plan: Allegretto",
      "Cached",
      "Weekly balance — 34% remaining · Resets in 1d 0h",
      "Credits private — 81% remaining",
    ]);
    expect(JSON.stringify(template)).not.toMatch(/[\u0000\n]/);
    expect(details.every((item) => item.enabled === false)).toBe(true);
    expect(codex).not.toHaveProperty("icon");
  });

  it("keeps provider states explicit instead of rendering fake percentages", () => {
    const labels = getTrayMenuLabels("en");
    const statuses = [
      ["claude", "Claude Code", "no-credentials", "Not connected"],
      ["kimi", "Kimi Code", "expired", "Credentials expired"],
      ["gemini", "Gemini", "unavailable", "Usage unavailable"],
    ] as const;
    const template = buildTrayMenuTemplate({
      agentManagementEnabled: true,
      agentUsageEntries: statuses.map(([id, name, status]) =>
        usageEntry(id, name, {
          quota: {
            ...usageEntry(id, name).quota!,
            status,
            plan: null,
            metrics: [],
          },
        }),
      ),
      isWindowVisible: true,
      labels,
      onCommand: vi.fn(),
      onQuit: vi.fn(),
      onToggleWindow: vi.fn(),
    });

    const usageMenu = getSubmenu(template, labels.agentUsage);
    expect(usageMenu.slice(0, 3).map((item) => item.label)).toEqual(
      statuses.map(([, name, , statusLabel]) => `${name} — ${statusLabel}`),
    );
    expect(JSON.stringify(usageMenu)).not.toContain("0%");
  });

  it("formats bounded native metric semantics without custom visual elements", () => {
    const labels = getTrayMenuLabels("en");
    const now = 1_800_000_000_000;
    const metrics: AgentUsageMetric[] = [
      {
        ...percentageMetric("daily", "Daily", 60),
        period: { kind: "calendar", unit: "day" },
        value: { kind: "unlimited" },
      },
      {
        ...percentageMetric("monthly", "Monthly", 50),
        period: { kind: "calendar", unit: "month" },
        value: {
          kind: "amount",
          remainingPercent: 50,
          remainingAmount: 5,
          limitAmount: 10,
          unit: "credits\u0000",
        },
      },
      {
        ...percentageMetric("billing", "Billing", 0),
        period: { kind: "calendar", unit: "billing-cycle" },
        value: { kind: "unknown" },
      },
      {
        ...percentageMetric("rolling-custom", "Rolling", 20, now + 7_200_000),
        period: { kind: "rolling", durationSeconds: 18_000 },
      },
      {
        ...percentageMetric("provider", "Provider", 70, now - 1),
        period: { kind: "provider-defined", label: "provider" },
      },
      {
        ...percentageMetric("model", "ignored", 0, Number.NaN),
        scope: { kind: "model", id: "model", label: "Model\nName" },
        period: { kind: "lifetime" },
        value: { kind: "unknown" },
      },
      {
        ...percentageMetric("amount-empty", "Amount", 60),
        period: { kind: "lifetime" },
        value: {
          kind: "amount",
          remainingPercent: 60,
          remainingAmount: 6,
          limitAmount: 10,
          unit: "\u0000",
        },
      },
      {
        ...percentageMetric("fallback", "\u0000", 90),
        period: { kind: "lifetime" },
      },
    ];
    const entry = usageEntry("codex", "Codex", {
      quota: {
        ...usageEntry("codex", "Codex").quota!,
        plan: "--",
        metrics,
      },
    });
    const empty = usageEntry("claude", "Claude Code", {
      quota: {
        ...usageEntry("claude", "Claude Code").quota!,
        plan: null,
        metrics: [],
      },
    });
    const template = buildTrayMenuTemplate({
      agentManagementEnabled: true,
      agentUsageEntries: [entry, empty],
      isWindowVisible: true,
      labels,
      now: () => now,
      onCommand: vi.fn(),
      onQuit: vi.fn(),
      onToggleWindow: vi.fn(),
    });

    const usageMenu = getSubmenu(template, labels.agentUsage);
    const codex = usageMenu.find((item) =>
      String(item.label).startsWith("Codex — 20% remaining"),
    );
    const details = codex?.submenu as MenuItemConstructorOptions[];
    expect(details.map((item) => item.label)).toEqual([
      "Daily balance — Unlimited",
      "Monthly balance — 50% remaining · 5/10 credits",
      "Billing-cycle balance — Unknown",
      "5-hour balance — 20% remaining · Resets in 2h 0m",
      "Provider quota — 70% remaining · Reset pending",
      "Model Name — Unknown",
      "Amount — 60% remaining · 6/10",
      "Provider quota — 90% remaining",
    ]);
    expect(details.some((item) => "icon" in item)).toBe(false);
    expect(
      usageMenu.find((item) => String(item.label).startsWith("Claude Code —"))
        ?.submenu,
    ).toEqual([
      {
        enabled: false,
        label: "The provider did not report a quota",
      },
    ]);
  });

  it("caps native metric count and dynamic label length", () => {
    const labels = getTrayMenuLabels("en");
    const metrics = Array.from({ length: 70 }, (_, index) => ({
      ...percentageMetric(`custom-${index}`, `x${"y".repeat(300)}`, 50),
      period: { kind: "lifetime" } as const,
    }));
    const template = buildTrayMenuTemplate({
      agentManagementEnabled: true,
      agentUsageEntries: [
        usageEntry("custom", `A${"b".repeat(300)}`, {
          quota: {
            ...usageEntry("custom", "Custom").quota!,
            agentId: "custom",
            plan: null,
            metrics,
          },
        }),
      ],
      isWindowVisible: true,
      labels,
      onCommand: vi.fn(),
      onQuit: vi.fn(),
      onToggleWindow: vi.fn(),
    });

    const usageMenu = getSubmenu(template, labels.agentUsage);
    const entry = usageMenu[0];
    expect(String(entry.label).length).toBeLessThanOrEqual(180);
    expect(entry.submenu as MenuItemConstructorOptions[]).toHaveLength(64);
    expect(
      (entry.submenu as MenuItemConstructorOptions[]).every(
        (item) => String(item.label).length <= 180,
      ),
    ).toBe(true);
  });

  it("routes every current Agent asset through its product-correct command", () => {
    const labels = getTrayMenuLabels("zh");
    const onCommand = vi.fn<(command: AppCommand) => void>();
    const template = buildTrayMenuTemplate({
      agentManagementEnabled: false,
      isWindowVisible: true,
      labels,
      onCommand,
      onQuit: vi.fn(),
      onToggleWindow: vi.fn(),
    });

    const assetMenu = getSubmenu(template, labels.addAgentAsset);
    clickItem(assetMenu, labels.createPrompt);
    clickItem(assetMenu, labels.createOrImportSkill);
    clickItem(assetMenu, labels.addMcpServer);
    clickItem(assetMenu, labels.addPlugin);
    clickItem(assetMenu, labels.manageRules);

    expect(onCommand.mock.calls.map(([command]) => command)).toEqual([
      { type: "asset:create", asset: "prompt" },
      { type: "asset:create", asset: "skill" },
      { type: "asset:create", asset: "mcp" },
      { type: "asset:create", asset: "plugin" },
      { type: "asset:manage", asset: "rule" },
    ]);
  });

  it("opens both existing Quick Add modes and native app surfaces", () => {
    const labels = getTrayMenuLabels("en");
    const onCommand = vi.fn<(command: AppCommand) => void>();
    const onToggleWindow = vi.fn();
    const onQuit = vi.fn();
    const template = buildTrayMenuTemplate({
      agentManagementEnabled: false,
      isWindowVisible: false,
      labels,
      onCommand,
      onQuit,
      onToggleWindow,
    });

    const quickAddMenu = getSubmenu(template, labels.quickAddPrompt);
    clickItem(quickAddMenu, labels.analyzePrompt);
    clickItem(quickAddMenu, labels.generatePrompt);
    clickItem(template, labels.showPromptHub);
    clickItem(template, labels.checkUpdates);
    clickItem(template, labels.settings);
    clickItem(template, labels.quitPromptHub);

    expect(onCommand.mock.calls.map(([command]) => command)).toEqual([
      { type: "prompt:quick-add", mode: "analyze" },
      { type: "prompt:quick-add", mode: "generate" },
      { type: "updater:open" },
      { type: "settings:open" },
    ]);
    expect(onToggleWindow).toHaveBeenCalledOnce();
    expect(onQuit).toHaveBeenCalledOnce();
  });

  it("replaces the generic update check with an actionable available version", () => {
    const labels = getTrayMenuLabels("zh");
    const onCommand = vi.fn<(command: AppCommand) => void>();
    const template = buildTrayMenuTemplate({
      agentManagementEnabled: false,
      isWindowVisible: true,
      labels,
      onCommand,
      onQuit: vi.fn(),
      onToggleWindow: vi.fn(),
      updateState: { status: "available", version: "1.2.3" },
    });

    const updateItem = template.find(
      (entry) => entry.label === "版本 1.2.3 可用",
    );
    expect(updateItem).toMatchObject({ sublabel: "点击查看更新详情…" });
    expect(template.some((entry) => entry.label === labels.checkUpdates)).toBe(
      false,
    );
    expect(updateItem?.click).toBeTypeOf("function");
    (updateItem?.click as () => void)();
    expect(onCommand).toHaveBeenCalledWith({ type: "updater:open" });
  });

  it("distinguishes a downloaded update that is ready to install", () => {
    const labels = getTrayMenuLabels("en");
    const template = buildTrayMenuTemplate({
      agentManagementEnabled: false,
      isWindowVisible: true,
      labels,
      onCommand: vi.fn(),
      onQuit: vi.fn(),
      onToggleWindow: vi.fn(),
      updateState: { status: "downloaded", version: "1.2.3" },
    });

    expect(template).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Version 1.2.3 ready to install",
          sublabel: "Click to view update details…",
        }),
      ]),
    );
  });

  it("uses a dynamic visibility label", () => {
    const labels = getTrayMenuLabels("en");
    const common = {
      agentManagementEnabled: false,
      labels,
      onCommand: vi.fn(),
      onQuit: vi.fn(),
      onToggleWindow: vi.fn(),
    };

    const visible = buildTrayMenuTemplate({
      ...common,
      isWindowVisible: true,
    });
    const hidden = buildTrayMenuTemplate({
      ...common,
      isWindowVisible: false,
    });

    expect(visible.some((entry) => entry.label === labels.hidePromptHub)).toBe(
      true,
    );
    expect(hidden.some((entry) => entry.label === labels.showPromptHub)).toBe(
      true,
    );
  });

  it("hides future Agent management until its capability is enabled", () => {
    const labels = getTrayMenuLabels("en");
    const onCommand = vi.fn<(command: AppCommand) => void>();
    const common = {
      isWindowVisible: true,
      labels,
      onCommand,
      onQuit: vi.fn(),
      onToggleWindow: vi.fn(),
    };

    const disabled = buildTrayMenuTemplate({
      ...common,
      agentManagementEnabled: false,
    });
    expect(disabled.some((entry) => entry.label === labels.manageAgents)).toBe(
      false,
    );

    const enabled = buildTrayMenuTemplate({
      ...common,
      agentManagementEnabled: true,
    });
    clickItem(enabled, labels.manageAgents);
    expect(onCommand).toHaveBeenLastCalledWith({ type: "agent:manage" });
  });

  it("projects verified provider profiles and routes only alternate choices", () => {
    const labels = getTrayMenuLabels("en");
    const onCommand = vi.fn<(command: AppCommand) => void>();
    const onAgentProviderProfile = vi.fn();
    const template = buildTrayMenuTemplate({
      agentManagementEnabled: true,
      agentProviderGroups: [
        {
          agentId: "claude",
          name: "Claude Code",
          currentProfileId: "profile-1",
          profiles: [
            {
              id: "profile-1",
              name: "Primary",
              model: "claude-opus-4",
              isCurrent: true,
            },
            {
              id: "profile-2",
              name: "Backup",
              model: null,
              isCurrent: false,
            },
          ],
        },
      ],
      isWindowVisible: true,
      labels,
      onAgentProviderProfile,
      onCommand,
      onQuit: vi.fn(),
      onToggleWindow: vi.fn(),
    });

    const agentsMenu = getSubmenu(template, labels.agents);
    const claudeMenu = getSubmenu(agentsMenu, "Claude Code");
    const current = claudeMenu.find(
      (entry) => entry.label === "Primary · claude-opus-4",
    );
    expect(current).toMatchObject({
      checked: true,
      enabled: false,
      type: "checkbox",
    });

    clickItem(claudeMenu, "Backup");
    clickItem(claudeMenu, labels.openAgent);
    clickItem(agentsMenu, labels.manageAgents);
    expect(onAgentProviderProfile).toHaveBeenCalledWith("claude", "profile-2");
    expect(onCommand).toHaveBeenCalledTimes(2);
    expect(onCommand).toHaveBeenLastCalledWith({ type: "agent:manage" });
  });

  it("keeps an omitted provider callback safe for cached menu entries", () => {
    const labels = getTrayMenuLabels("en");
    const template = buildTrayMenuTemplate({
      agentManagementEnabled: true,
      agentProviderGroups: [
        {
          agentId: "claude",
          name: "Claude Code",
          currentProfileId: null,
          profiles: [
            {
              id: "profile-1",
              name: "Primary",
              model: null,
              isCurrent: false,
            },
          ],
        },
      ],
      isWindowVisible: true,
      labels,
      onCommand: vi.fn(),
      onQuit: vi.fn(),
      onToggleWindow: vi.fn(),
    });

    const agentsMenu = getSubmenu(template, labels.agents);
    const claudeMenu = getSubmenu(agentsMenu, "Claude Code");
    expect(() => clickItem(claudeMenu, "Primary")).not.toThrow();
    const usageMenu = getSubmenu(template, labels.agentUsage);
    expect(() => clickItem(usageMenu, labels.refreshAgentUsage)).not.toThrow();
  });
});

describe("tray menu localization", () => {
  it("keeps every supported language dictionary complete and non-empty", () => {
    const referenceKeys = Object.keys(getTrayMenuLabels("en")).sort();

    for (const language of SUPPORTED_TRAY_MENU_LANGUAGES) {
      const labels = getTrayMenuLabels(language);
      expect(Object.keys(labels).sort()).toEqual(referenceKeys);
      expect(
        Object.values(labels).every((label) => label.trim().length > 0),
      ).toBe(true);
    }
  });

  it.each([
    ["zh-CN", "zh"],
    ["zh-Hant-HK", "zh-TW"],
    ["zh-TW", "zh-TW"],
    ["ja-JP", "ja"],
    ["fr-CA", "fr"],
    ["de-DE", "de"],
    ["es-MX", "es"],
    ["pt-BR", "en"],
    ["", "en"],
  ] as const)("normalizes %s to %s", (locale, expected) => {
    expect(normalizeTrayMenuLanguage(locale)).toBe(expected);
  });

  it.each(SUPPORTED_TRAY_MENU_LANGUAGES)(
    "projects quota status and actions through the %s native dictionary",
    (language) => {
      const labels = getTrayMenuLabels(language);
      const onRefreshAgentUsage = vi.fn();
      const template = buildTrayMenuTemplate({
        agentManagementEnabled: true,
        agentUsageEntries: [
          usageEntry("claude", "Claude Code", {
            isLoading: true,
            quota: null,
          }),
        ],
        isWindowVisible: true,
        labels,
        onCommand: vi.fn(),
        onRefreshAgentUsage,
        onQuit: vi.fn(),
        onToggleWindow: vi.fn(),
      });

      const usageMenu = getSubmenu(template, labels.agentUsage);
      expect(usageMenu[0].label).toContain(labels.usageLoading);
      clickItem(usageMenu, labels.refreshAgentUsage);
      expect(onRefreshAgentUsage).toHaveBeenCalledOnce();
    },
  );
});
