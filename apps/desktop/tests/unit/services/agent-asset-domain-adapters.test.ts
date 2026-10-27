import { beforeEach, describe, expect, it } from "vitest";

import type { AgentScannedSkill } from "@prompthub/shared/types";
import {
  agentAssetAggregationService,
  createAgentAssetDomainAdapters,
  readAgentAssetAggregate,
} from "../../../src/renderer/services/agent-asset-domain-adapters";
import { useMcpStore } from "../../../src/renderer/stores/mcp.store";
import { usePluginStore } from "../../../src/renderer/stores/plugin.store";
import { useRulesStore } from "../../../src/renderer/stores/rules.store";
import { useSkillStore } from "../../../src/renderer/stores/skill.store";
import { useAgentStore } from "../../../src/renderer/stores/agent.store";
import { buildManagedAgents } from "@prompthub/core/agent-management/agent-query";
import { SKILL_PLATFORMS } from "@prompthub/shared/constants/platforms";
import {
  createScannedSkillFixture,
  createSkillFixture,
} from "../../fixtures/skills";

function scannedSkill(
  name: string,
  localPath: string,
  options: Partial<AgentScannedSkill> = {},
): AgentScannedSkill {
  return {
    ...createScannedSkillFixture({
      name,
      localPath,
      filePath: `${localPath}/SKILL.md`,
    }),
    installMode: "copy",
    platformSkillPath: localPath,
    ...options,
  };
}

function seedCanonicalDomains(): void {
  useSkillStore.setState({
    skills: [
      createSkillFixture({
        id: "managed-skill",
        name: "managed",
        local_repo_path: "/managed/skill",
      }),
    ],
    agentScanState: {
      claude: {
        isScanning: false,
        result: {
          platform: null as never,
          skillsDir: "~/.claude/skills",
          scannedSkills: [
            scannedSkill("managed", "/managed/skill"),
            scannedSkill("external", "~/.claude/skills/external"),
          ],
        },
      },
    },
  });
  useMcpStore.setState({
    targetPresets: [
      {
        id: "claude-global",
        label: "Claude Code",
        path: "~/.claude.json",
        platformId: "claude",
        scope: "global",
        target: "claude",
      },
    ],
    targetStatus: [
      {
        exists: true,
        path: "~/.claude.json",
        presetId: "claude-global",
        serverNames: ["filesystem", "github"],
      },
    ],
  });
  useRulesStore.setState({
    files: [
      {
        description: "Claude rules",
        exists: true,
        group: "assistant",
        id: "claude-global",
        name: "CLAUDE.md",
        path: "~/.claude/CLAUDE.md",
        platformDescription: "Claude Code",
        platformIcon: "Sparkles",
        platformId: "claude",
        platformName: "Claude Code",
        syncStatus: "out-of-sync",
      },
    ],
  });
  usePluginStore.setState({
    targetMatrix: [
      {
        displayName: "Claude Code",
        enabled: true,
        id: "claude",
        installedPlugins: [
          {
            displayName: "Formatter",
            id: "formatter",
            inventory: {
              agents: 0,
              apps: 0,
              assets: 0,
              commands: 0,
              docs: 0,
              hooks: 0,
              lspServers: 0,
              mcpServers: 0,
              scripts: 0,
              skills: 0,
            },
            name: "formatter",
            version: "1.2.0",
          },
        ],
        status: "native",
      },
    ],
  });
}

describe("renderer Agent asset domain adapters", () => {
  beforeEach(() => {
    useAgentStore.setState({ agents: [] });
    useRulesStore.setState({ availableFiles: [] });
    seedCanonicalDomains();
  });

  it("counts the shared native Rules file for both Antigravity identities", () => {
    useAgentStore.setState({
      agents: buildManagedAgents({
        platforms: SKILL_PLATFORMS,
        detectedPlatformIds: ["antigravity", "antigravity-cli"],
        pinnedPlatformIds: [],
        builtinOverrides: {},
        osKey: "darwin",
      }),
    });
    const source = useRulesStore.getState().files[0];
    useRulesStore.setState({
      files: [],
      availableFiles: [
        {
          ...source,
          id: "gemini-global",
          platformId: "gemini",
          path: "~/.gemini/GEMINI.md",
        },
      ],
    });
    for (const id of ["antigravity", "antigravity-cli"]) {
      const rules = readAgentAssetAggregate(id).domains.find(
        (domain) => domain.kind === "rule",
      );
      expect(rules?.items).toHaveLength(1);
      expect(rules?.items[0].id).toBe("gemini-global");
    }
  });

  it("aggregates all four domains from their owning stores", async () => {
    const aggregate =
      await agentAssetAggregationService.listForTarget("claude");

    expect(aggregate.total).toBe(6);
    expect(aggregate.domains).toEqual([
      {
        kind: "skill",
        status: "available",
        items: [
          expect.objectContaining({
            id: "/managed/skill",
            label: "managed",
            state: "managed",
          }),
          expect.objectContaining({
            id: "~/.claude/skills/external",
            label: "external",
            state: "external",
          }),
        ],
      },
      {
        kind: "mcp",
        status: "available",
        items: [
          expect.objectContaining({ id: "filesystem", state: "configured" }),
          expect.objectContaining({ id: "github", state: "configured" }),
        ],
      },
      {
        kind: "rule",
        status: "available",
        items: [
          expect.objectContaining({
            id: "claude-global",
            state: "out-of-sync",
          }),
        ],
      },
      {
        kind: "plugin",
        status: "available",
        items: [
          expect.objectContaining({
            id: "formatter",
            label: "Formatter",
            metadata: expect.objectContaining({ version: "1.2.0" }),
          }),
        ],
      },
    ]);
  });

  it("re-reads canonical state instead of retaining a second inventory", async () => {
    const first = await agentAssetAggregationService.listForTarget("claude");
    useMcpStore.setState({
      targetStatus: [
        {
          exists: true,
          path: "~/.claude.json",
          presetId: "claude-global",
          serverNames: ["new-server"],
        },
      ],
    });

    const second = await agentAssetAggregationService.listForTarget("claude");

    expect(
      first.domains.find((domain) => domain.kind === "mcp")?.items,
    ).toHaveLength(2);
    expect(
      second.domains.find((domain) => domain.kind === "mcp")?.items,
    ).toEqual([
      expect.objectContaining({ id: "new-server", label: "new-server" }),
    ]);
  });

  it("provides the synchronous workbench selector from the same readers", () => {
    const aggregate = readAgentAssetAggregate("claude");

    expect(aggregate.platformId).toBe("claude");
    expect(aggregate.total).toBe(6);
    expect(aggregate.domains.map((domain) => domain.kind)).toEqual([
      "skill",
      "mcp",
      "rule",
      "plugin",
    ]);
    expect(
      aggregate.domains.find((domain) => domain.kind === "plugin")?.items,
    ).toEqual([
      expect.objectContaining({
        id: "formatter",
        metadata: expect.objectContaining({ version: "1.2.0" }),
      }),
    ]);
  });

  it("excludes missing Rules descriptors and uses Plugin metadata fallbacks", () => {
    useRulesStore.setState({
      files: [
        {
          description: "Claude rules",
          exists: false,
          group: "assistant",
          id: "custom:rule-without-sync-state",
          name: "CLAUDE.md",
          path: "~/.claude/CLAUDE.md",
          platformDescription: "Claude Code",
          platformIcon: "Sparkles",
          platformId: "claude",
          platformName: "Claude Code",
        },
      ],
    });
    usePluginStore.setState({
      targetMatrix: [
        {
          displayName: "Claude Code",
          enabled: true,
          id: "claude",
          installedPlugins: [
            {
              displayName: "",
              id: "plugin-with-fallbacks",
              inventory: {
                agents: 0,
                apps: 0,
                assets: 0,
                commands: 0,
                docs: 0,
                hooks: 0,
                lspServers: 0,
                mcpServers: 0,
                scripts: 0,
                skills: 0,
              },
              name: "fallback-name",
            },
          ],
          status: "native",
        },
      ],
    });

    const claude = readAgentAssetAggregate("claude");
    const absent = readAgentAssetAggregate("absent");

    expect(
      claude.domains.find((domain) => domain.kind === "rule")?.items,
    ).toEqual([]);
    expect(
      claude.domains.find((domain) => domain.kind === "plugin")?.items,
    ).toEqual([
      expect.objectContaining({
        id: "plugin-with-fallbacks",
        label: "fallback-name",
        metadata: expect.objectContaining({ version: null }),
      }),
    ]);
    expect(absent.total).toBe(0);
    expect(absent.domains.every((domain) => domain.items.length === 0)).toBe(
      true,
    );
  });

  it("treats a supported target without discovered plugins as an empty inventory", () => {
    usePluginStore.setState({
      targetMatrix: [
        {
          displayName: "Cline",
          enabled: false,
          id: "cline",
          status: "runtime-only",
        },
      ],
    });

    const aggregate = readAgentAssetAggregate("cline");

    expect(
      aggregate.domains.find((domain) => domain.kind === "plugin")?.items,
    ).toEqual([]);
  });

  it("reports absent inline mutations as unsupported without touching owners", async () => {
    const before = {
      skills: useSkillStore.getState().skills,
      mcp: useMcpStore.getState().targetStatus,
      rules: useRulesStore.getState().files,
      plugins: usePluginStore.getState().targetMatrix,
    };

    for (const kind of ["skill", "mcp", "rule", "plugin"] as const) {
      const plan = await agentAssetAggregationService.planAction({
        action: "install",
        assetId: "asset",
        kind,
        options: {},
        platformId: "claude",
      });
      expect(plan.status).toBe("unsupported");
    }

    expect(useSkillStore.getState().skills).toBe(before.skills);
    expect(useMcpStore.getState().targetStatus).toBe(before.mcp);
    expect(useRulesStore.getState().files).toBe(before.rules);
    expect(usePluginStore.getState().targetMatrix).toBe(before.plugins);
  });

  it("rejects direct application through every read-only adapter", async () => {
    for (const adapter of createAgentAssetDomainAdapters()) {
      await expect(
        adapter.applyAction({
          operationId: "operation",
          input: {
            action: "install",
            assetId: "asset",
            kind: adapter.kind,
            options: {},
            platformId: "claude",
          },
          status: "ready",
          warnings: [],
        }),
      ).rejects.toThrow(`Inline ${adapter.kind} actions are not available`);
    }
  });
});
