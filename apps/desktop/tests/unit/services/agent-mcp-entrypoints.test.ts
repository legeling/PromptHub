import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildManagedAgents, getMcpTargetPresets } from "@prompthub/core";
import { SKILL_PLATFORMS } from "@prompthub/shared/constants/platforms";
import { isMcpTargetKind } from "@prompthub/shared/types/mcp";
import { matchesManagedAgentTarget } from "../../../src/renderer/components/agent/agent-target-matching";
import {
  AGENT_WORKSPACE_TABS,
  getAgentTabStatus,
  isAgentTabEnabled,
} from "../../../src/renderer/components/agent/agent-workspace-tabs";
import {
  deriveProjectMcpTargetPresets,
  filterVisibleMcpTargetPresets,
} from "../../../src/renderer/services/mcp-target-presets";

const home = "/fixture/home";
const builtinOverrides = Object.fromEntries(
  SKILL_PLATFORMS.map(({ id }) => [id, { rootPath: `${home}/agents/${id}` }]),
);
const agents = buildManagedAgents({
  platforms: SKILL_PLATFORMS,
  detectedPlatformIds: SKILL_PLATFORMS.map(({ id }) => id),
  pinnedPlatformIds: [],
  builtinOverrides,
  agentIdentityPreferences: {},
  osKey: "darwin",
});
const presets = getMcpTargetPresets(home, "darwin", {}, builtinOverrides);
const mcpTab = AGENT_WORKSPACE_TABS.find(({ key }) => key === "mcp");
if (!mcpTab) throw new Error("Missing MCP workspace tab");

function agentById(id: string) {
  const agent = agents.find((entry) => entry.id === id);
  if (!agent) throw new Error(`Missing Agent: ${id}`);
  return agent;
}

describe("Agent MCP declaration and entrypoint consistency", () => {
  it.each(agents.filter((agent) => agent.paths.mcp))(
    "$id exposes a writable primary preset at its declared global path",
    (agent) => {
      const preset = presets.find(({ id }) => id === agent.id);
      expect(preset).toBeDefined();
      expect(preset?.path).toBe(path.normalize(agent.paths.mcp!));
      expect(isMcpTargetKind(preset?.target)).toBe(true);
      expect(isAgentTabEnabled(agent, mcpTab)).toBe(true);
      expect(
        matchesManagedAgentTarget([preset?.platformId, preset?.target], agent),
      ).toBe(true);
    },
  );

  it("routes Copilot only to its CLI target and keeps VS Code independent", () => {
    const copilot = agentById("copilot");
    expect(
      presets
        .filter((preset) =>
          matchesManagedAgentTarget(
            [preset.platformId, preset.target],
            copilot,
          ),
        )
        .map(({ id }) => id),
    ).toEqual(["copilot"]);
    expect(presets.find(({ id }) => id === "copilot")).toMatchObject({
      target: "copilot",
      path: `${home}/agents/copilot/mcp-config.json`,
    });
    const visible = filterVisibleMcpTargetPresets(presets, ["copilot"]);
    expect(visible.some(({ id }) => id === "copilot")).toBe(false);
    expect(visible.some(({ id }) => id === "vscode")).toBe(true);
  });

  it("honors COPILOT_HOME and explicit root/path overrides without changing VS Code", () => {
    const environment = { COPILOT_HOME: "/fixture/copilot-env" };
    const native = getMcpTargetPresets(home, "darwin", environment);
    const overridden = getMcpTargetPresets(home, "darwin", environment, {
      copilot: {
        rootPath: "/fixture/copilot-override",
        mcpRelativePath: "config/mcp.json",
      },
    });
    expect(native.find(({ id }) => id === "copilot")?.path).toBe(
      "/fixture/copilot-env/mcp-config.json",
    );
    expect(overridden.find(({ id }) => id === "copilot")?.path).toBe(
      "/fixture/copilot-override/config/mcp.json",
    );
    expect(overridden.find(({ id }) => id === "vscode")).toEqual(
      native.find(({ id }) => id === "vscode"),
    );
  });

  it("does not offer Reasonix native TOML as writable global MCP", () => {
    const reasonix = agentById("reasonix");
    expect(reasonix.paths.mcp).toBeUndefined();
    expect(getAgentTabStatus(reasonix, mcpTab)).toBe("unsupported");
    expect(isAgentTabEnabled(reasonix, mcpTab)).toBe(false);
    expect(presets.some(({ platformId }) => platformId === "reasonix")).toBe(
      false,
    );
    expect(
      SKILL_PLATFORMS.find(({ id }) => id === "reasonix")?.configFiles,
    ).toContain("config.toml");
    const projectPresets = deriveProjectMcpTargetPresets([
      {
        id: "fixture",
        name: "Fixture",
        rootPath: "/fixture/project",
        scanPaths: [],
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    expect(
      projectPresets.find(({ platformId }) => platformId === "reasonix"),
    ).toMatchObject({
      target: "reasonix",
      scope: "workspace",
      path: "/fixture/project/.mcp.json",
    });
  });
});
