/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from "vitest";
import type { SkillPlatform } from "@prompthub/shared/constants/platforms";
import {
  AgentAssetAggregationService,
  buildManagedAgents,
  filterManagedAgents,
  normalizeAgentIdentityPreferences,
  resolveAgentIdentity,
  sortManagedAgents,
} from "@prompthub/core";
import type {
  AgentAssetActionInput,
  AgentAssetActionPlan,
  AgentAssetActionResult,
  AgentAssetDomainAdapter,
} from "@prompthub/core";

function platform(
  id: string,
  name: string,
  options: Partial<SkillPlatform> = {},
): SkillPlatform {
  return {
    id,
    name,
    icon: "Bot",
    rootDir: {
      darwin: `~/.${id}`,
      win32: `%USERPROFILE%\\.${id}`,
      linux: `~/.${id}`,
    },
    skillsRelativePath: "skills",
    ...options,
  };
}

function actionInput(
  kind: AgentAssetActionInput["kind"] = "skill",
): AgentAssetActionInput {
  return {
    kind,
    platformId: "codex",
    action: "install",
    assetId: "asset-1",
    options: {},
  };
}

function readyPlan(
  input: AgentAssetActionInput = actionInput(),
): AgentAssetActionPlan {
  return {
    operationId: "operation-1",
    input,
    status: "ready",
    warnings: [],
  };
}

function domainAdapter(
  kind: AgentAssetDomainAdapter["kind"],
): AgentAssetDomainAdapter {
  return {
    kind,
    listForTarget: vi.fn().mockResolvedValue([
      {
        id: `${kind}-1`,
        kind,
        platformId: "codex",
        label: `${kind} one`,
        state: "configured",
      },
    ]),
    planAction: vi.fn().mockImplementation(async (input) => readyPlan(input)),
    applyAction: vi.fn().mockImplementation(
      async (plan): Promise<AgentAssetActionResult> => ({
        operationId: plan.operationId,
        kind: plan.input.kind,
        platformId: plan.input.platformId,
        status: "applied",
      }),
    ),
  };
}

describe("core Agent query", () => {
  it("projects the canonical registry inputs without mutating them", () => {
    const platforms = [
      platform("custom-team", "Team Agent", {
        isCustom: true,
        isConfigured: true,
      }),
      platform("claude", "Claude Code", {
        mcpRelativePath: "../.claude.json",
      }),
      platform("codex", "Codex CLI", {
        configFiles: ["config.toml"],
      }),
    ];
    const before = structuredClone(platforms);

    const agents = buildManagedAgents({
      platforms,
      detectedPlatformIds: ["claude"],
      pinnedPlatformIds: ["custom-team"],
      disabledPlatformIds: [],
      builtinOverrides: {
        claude: { rootPath: "~/agents/claude" },
      },
      agentIdentityPreferences: {
        codex: { name: "chatgpt", icon: "codex" },
      },
      osKey: "darwin",
    });

    expect(platforms).toEqual(before);
    expect(agents.map((agent) => agent.id)).toEqual([
      "custom-team",
      "claude",
      "codex",
    ]);
    expect(agents.find((agent) => agent.id === "claude")?.paths).toMatchObject({
      root: "~/agents/claude",
      mcp: "~/agents/.claude.json",
    });
    expect(agents.find((agent) => agent.id === "codex")).toMatchObject({
      name: "ChatGPT",
      displayIconId: "codex",
      capabilities: {
        provider: { status: "supported" },
        appearance: { status: "supported" },
      },
    });
    expect(
      agents.find((agent) => agent.id === "custom-team")?.capabilities.provider,
    ).toEqual({ status: "unsupported", reason: "adapter-pending" });
  });

  it("filters from the same projected list instead of rebuilding state", () => {
    const agents = buildManagedAgents({
      platforms: [
        platform("claude", "Claude Code"),
        platform("custom-team", "Team Agent", {
          isCustom: true,
          isConfigured: true,
        }),
      ],
      detectedPlatformIds: ["claude"],
      pinnedPlatformIds: [],
      builtinOverrides: {},
      osKey: "darwin",
    });

    expect(filterManagedAgents(agents, "team", "all")).toHaveLength(1);
    expect(filterManagedAgents(agents, "", "installed")).toHaveLength(1);
    expect(filterManagedAgents(agents, "", "custom")).toHaveLength(1);
    expect(filterManagedAgents(agents, "", "needs-attention")).toHaveLength(1);
  });

  it("normalizes identity, path, lifecycle, and sorting boundary variants", () => {
    expect(normalizeAgentIdentityPreferences(null)).toEqual({
      codex: { name: "codex", icon: "codex" },
    });
    expect(normalizeAgentIdentityPreferences([])).toEqual({
      codex: { name: "codex", icon: "codex" },
    });
    expect(
      normalizeAgentIdentityPreferences({
        codex: { name: "invalid", icon: "chatgpt" },
      }),
    ).toEqual({
      codex: { name: "codex", icon: "chatgpt" },
    });
    expect(
      normalizeAgentIdentityPreferences({ codex: ["not-an-object"] }),
    ).toEqual({
      codex: { name: "codex", icon: "codex" },
    });
    expect(resolveAgentIdentity("claude", "Claude Code", undefined)).toEqual({
      name: "Claude Code",
      iconId: "claude",
    });

    const agents = buildManagedAgents({
      platforms: [
        platform("zeta", "Zeta", {
          rootDir: {
            darwin: "/opt/zeta",
            win32: "C:\\Users\\test\\.zeta",
            linux: "/opt/zeta",
          },
          skillsRelativePath: "",
          mcpRelativePath: "../../mcp.json",
          configFiles: ["./settings.json"],
          launchPaths: { darwin: ["/Applications/Zeta.app"] },
          lifecycle: "enterprise-legacy",
          replacementPlatformId: "claude",
        }),
        platform("alpha", "Alpha"),
      ],
      detectedPlatformIds: [],
      pinnedPlatformIds: [],
      builtinOverrides: {},
      osKey: "darwin",
    });

    expect(agents.map((agent) => agent.id)).toEqual(["alpha", "zeta"]);
    expect(agents[1]).toMatchObject({
      launchable: true,
      status: "not-detected",
      lifecycle: "enterprise-legacy",
      replacementPlatformId: "claude",
      paths: {
        root: "/opt/zeta",
        skills: "/opt/zeta",
        mcp: "/mcp.json",
        configFiles: ["/opt/zeta/settings.json"],
      },
    });
    expect(filterManagedAgents(agents, "", "configured")).toEqual([]);
    expect(filterManagedAgents(agents, "", "not-detected")).toHaveLength(2);
    expect(filterManagedAgents(agents, "", "all")).toHaveLength(2);
    expect(filterManagedAgents(agents, "enterprise", "all")[0]?.id).toBe(
      "zeta",
    );
    expect(filterManagedAgents(agents, "missing", "all")).toEqual([]);
    expect(sortManagedAgents([agents[1], agents[0]])).toEqual(agents);
  });

  it("resolves Windows separators and configured-only status", () => {
    const [agent] = buildManagedAgents({
      platforms: [
        platform("custom-win", "Custom Windows", {
          isCustom: true,
          rootDir: {
            darwin: "~/.custom-win",
            win32: "C:\\Users\\test\\.custom-win",
            linux: "~/.custom-win",
          },
          mcpRelativePath: "..\\mcp.json",
        }),
      ],
      detectedPlatformIds: [],
      pinnedPlatformIds: [],
      builtinOverrides: {
        "custom-win": {
          skillsRelativePath: ".\\skills",
          pluginsRelativePath: "",
          rulesRelativePath: "",
          configRelativePaths: [],
        },
      },
      osKey: "win32",
    });

    expect(agent).toMatchObject({
      isConfigured: true,
      status: "configured",
      paths: {
        root: "C:\\Users\\test\\.custom-win",
        skills: "C:\\Users\\test\\.custom-win\\skills",
        mcp: "C:\\Users\\test\\mcp.json",
        configFiles: [],
      },
    });
    expect(filterManagedAgents([agent], "", "custom")).toEqual([agent]);
  });
});

describe("AgentAssetAggregationService", () => {
  it("queries owning domains on every refresh and isolates unsupported or failed domains", async () => {
    const skill = domainAdapter("skill");
    const mcp = domainAdapter("mcp");
    vi.mocked(mcp.listForTarget).mockRejectedValue(
      new Error("Authorization: secret-token"),
    );
    const service = new AgentAssetAggregationService([skill, mcp]);

    const first = await service.listForTarget("codex");
    const second = await service.listForTarget("codex");

    expect(first).toEqual({
      platformId: "codex",
      total: 1,
      domains: [
        expect.objectContaining({
          kind: "skill",
          status: "available",
          items: [expect.objectContaining({ id: "skill-1" })],
        }),
        {
          kind: "mcp",
          status: "failed",
          items: [],
          errorCode: "asset-domain-list-failed",
        },
        { kind: "rule", status: "unsupported", items: [] },
        { kind: "plugin", status: "unsupported", items: [] },
      ],
    });
    expect(JSON.stringify(first)).not.toContain("secret-token");
    expect(second).toEqual(first);
    expect(skill.listForTarget).toHaveBeenCalledTimes(2);
    expect(mcp.listForTarget).toHaveBeenCalledTimes(2);
  });

  it("delegates plans and applies to the owning adapter only", async () => {
    const skill = domainAdapter("skill");
    const service = new AgentAssetAggregationService([skill]);
    const input = actionInput();

    const plan = await service.planAction(input);
    const result = await service.applyAction(plan);

    expect(skill.planAction).toHaveBeenCalledWith(input);
    expect(skill.applyAction).toHaveBeenCalledWith(plan);
    expect(result).toEqual({
      operationId: "operation-1",
      kind: "skill",
      platformId: "codex",
      status: "applied",
    });
    expect(await service.planAction(actionInput("plugin"))).toMatchObject({
      status: "unsupported",
      input: { kind: "plugin", platformId: "codex" },
    });
  });

  it("accepts unchanged nested action options and rejects structural mutations", async () => {
    const nestedInput: AgentAssetActionInput = {
      ...actionInput(),
      options: {
        nullable: null,
        targets: ["claude", { force: true }],
      },
    };
    const skill = domainAdapter("skill");
    const service = new AgentAssetAggregationService([skill]);

    vi.mocked(skill.planAction).mockResolvedValue(
      readyPlan(structuredClone(nestedInput)),
    );
    await expect(service.planAction(nestedInput)).resolves.toEqual(
      readyPlan(nestedInput),
    );

    const mutations: AgentAssetActionInput["options"][] = [
      { nullable: null, targets: ["claude"] },
      { nullable: null, targets: ["claude", { force: false }] },
      { nullable: null, targets: { force: true } },
      { nullable: null, targets: ["claude", { force: true }], extra: true },
    ];
    for (const options of mutations) {
      vi.mocked(skill.planAction).mockResolvedValue(
        readyPlan({ ...nestedInput, options }),
      );
      await expect(service.planAction(nestedInput)).rejects.toThrow(
        "cross-domain plan",
      );
    }

    const recordInput = {
      ...nestedInput,
      options: { targets: { force: true } },
    };
    vi.mocked(skill.planAction).mockResolvedValue(
      readyPlan({ ...recordInput, options: { targets: [] } }),
    );
    await expect(service.planAction(recordInput)).rejects.toThrow(
      "cross-domain plan",
    );
  });

  it("rejects duplicate adapters and cross-domain responses", async () => {
    const skill = domainAdapter("skill");
    expect(
      () => new AgentAssetAggregationService([skill, domainAdapter("skill")]),
    ).toThrow("already registered");

    vi.mocked(skill.listForTarget).mockResolvedValue([
      {
        id: "wrong",
        kind: "plugin",
        platformId: "codex",
        label: "wrong",
        state: "installed",
      },
    ]);
    const service = new AgentAssetAggregationService([skill]);
    const aggregate = await service.listForTarget("codex");
    expect(aggregate.domains[0]).toEqual({
      kind: "skill",
      status: "failed",
      items: [],
      errorCode: "asset-domain-list-invalid",
    });

    vi.mocked(skill.planAction).mockResolvedValue({
      ...readyPlan(),
      input: actionInput("plugin"),
    });
    await expect(service.planAction(actionInput())).rejects.toThrow(
      "cross-domain plan",
    );
  });

  it("rejects malformed inventories without leaking adapter values", async () => {
    const invalidItems = [
      null,
      [
        {
          id: "",
          kind: "skill",
          platformId: "codex",
          label: "label",
          state: "configured",
        },
      ],
      [
        {
          id: "duplicate",
          kind: "skill",
          platformId: "codex",
          label: "label",
          state: "configured",
        },
        {
          id: "duplicate",
          kind: "skill",
          platformId: "codex",
          label: "label",
          state: "configured",
        },
      ],
      [
        {
          id: "wrong-kind",
          kind: "plugin",
          platformId: "codex",
          label: "label",
          state: "configured",
        },
      ],
      [
        {
          id: "wrong-platform",
          kind: "skill",
          platformId: "claude",
          label: "label",
          state: "configured",
        },
      ],
      [
        {
          id: "blank-label",
          kind: "skill",
          platformId: "codex",
          label: " ",
          state: "configured",
        },
      ],
      [
        {
          id: "blank-state",
          kind: "skill",
          platformId: "codex",
          label: "label",
          state: " ",
        },
      ],
    ] as const;

    for (const items of invalidItems) {
      const skill = domainAdapter("skill");
      vi.mocked(skill.listForTarget).mockResolvedValue(items as never);
      const result = await new AgentAssetAggregationService([
        skill,
      ]).listForTarget("codex");
      expect(result.domains[0]).toEqual({
        kind: "skill",
        status: "failed",
        items: [],
        errorCode: "asset-domain-list-invalid",
      });
    }
  });

  it("validates action inputs and sanitizes adapter failures", async () => {
    const skill = domainAdapter("skill");
    const service = new AgentAssetAggregationService([skill]);
    const invalidInputs = [
      { ...actionInput(), kind: "unknown" },
      { ...actionInput(), platformId: 123 },
      { ...actionInput(), platformId: " " },
      { ...actionInput(), action: "" },
      { ...actionInput(), assetId: "" },
      { ...actionInput(), options: [] },
    ];

    for (const input of invalidInputs) {
      await expect(
        service.planAction(input as AgentAssetActionInput),
      ).rejects.toThrow();
    }
    await expect(service.listForTarget(" ")).rejects.toThrow(
      "platformId is required",
    );
    expect(
      () =>
        new AgentAssetAggregationService([
          { ...domainAdapter("skill"), kind: "unknown" as never },
        ]),
    ).toThrow("kind is invalid");

    vi.mocked(skill.planAction).mockRejectedValue(
      new Error("Bearer secret-token"),
    );
    await expect(service.planAction(actionInput())).rejects.toThrow(
      "action planning failed",
    );
    await expect(service.planAction(actionInput())).rejects.not.toThrow(
      "secret-token",
    );

    vi.mocked(skill.planAction).mockResolvedValue({
      ...readyPlan(),
      operationId: " ",
    });
    await expect(service.planAction(actionInput())).rejects.toThrow(
      "operationId is required",
    );
  });

  it("rejects every plan and result boundary mismatch", async () => {
    const planMutations: AgentAssetActionPlan[] = [
      { ...readyPlan(), input: { ...actionInput(), platformId: "claude" } },
      { ...readyPlan(), input: { ...actionInput(), action: "remove" } },
      { ...readyPlan(), input: { ...actionInput(), assetId: "other" } },
      {
        ...readyPlan(),
        input: { ...actionInput(), options: { overwrite: true } },
      },
      { ...readyPlan(), status: "invalid" as never },
      { ...readyPlan(), warnings: [123 as never] },
    ];

    for (const invalidPlan of planMutations) {
      const skill = domainAdapter("skill");
      vi.mocked(skill.planAction).mockResolvedValue(invalidPlan);
      await expect(
        new AgentAssetAggregationService([skill]).planAction(actionInput()),
      ).rejects.toThrow("cross-domain plan");
    }

    const resultMutations: AgentAssetActionResult[] = [
      {
        operationId: "operation-1",
        kind: "plugin",
        platformId: "codex",
        status: "applied",
      },
      {
        operationId: "operation-1",
        kind: "skill",
        platformId: "claude",
        status: "applied",
      },
      {
        operationId: "operation-1",
        kind: "skill",
        platformId: "codex",
        status: "invalid" as never,
      },
    ];
    for (const invalidResult of resultMutations) {
      const skill = domainAdapter("skill");
      vi.mocked(skill.applyAction).mockResolvedValue(invalidResult);
      await expect(
        new AgentAssetAggregationService([skill]).applyAction(readyPlan()),
      ).rejects.toThrow("cross-domain result");
    }
  });

  it("never applies blocked plans or accepts mismatched results", async () => {
    const skill = domainAdapter("skill");
    const service = new AgentAssetAggregationService([skill]);
    const blocked: AgentAssetActionPlan = {
      ...readyPlan(),
      status: "blocked",
    };

    await expect(service.applyAction(blocked)).rejects.toThrow("not ready");
    expect(skill.applyAction).not.toHaveBeenCalled();

    vi.mocked(skill.applyAction).mockResolvedValue({
      operationId: "other-operation",
      kind: "skill",
      platformId: "codex",
      status: "applied",
    });
    await expect(service.applyAction(readyPlan())).rejects.toThrow(
      "cross-domain result",
    );

    const unavailable = new AgentAssetAggregationService([]);
    await expect(unavailable.applyAction(readyPlan())).rejects.toThrow(
      "adapter is unavailable",
    );

    vi.mocked(skill.applyAction).mockRejectedValue(
      new Error("Authorization: secret-token"),
    );
    await expect(service.applyAction(readyPlan())).rejects.toThrow(
      "action failed",
    );
    await expect(service.applyAction(readyPlan())).rejects.not.toThrow(
      "secret-token",
    );
  });
});
