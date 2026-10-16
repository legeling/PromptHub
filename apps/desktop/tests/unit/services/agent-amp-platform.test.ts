/**
 * @vitest-environment node
 */
import fs from "fs";
import os from "os";
import path from "path";

import {
  configureRuntimePaths,
  closeDatabase,
  initDatabase,
  CoreMcpLibraryService,
  getMcpTargetPresets,
  resetRuntimePaths,
} from "@prompthub/core";
import { getAgentPlatformCapabilityInventory } from "@prompthub/shared/constants/agent-platform-capabilities";
import {
  getPlatformById,
  getPlatformRootTemplate,
} from "@prompthub/shared/constants/platforms";
import type { McpTargetKind } from "@prompthub/shared/types/mcp";
import {
  getMcpJsonServerEntries,
  getMcpServersJsonKey,
  setMcpJsonServerEntries,
} from "@prompthub/shared/utils/mcp-config";
import { afterEach, describe, expect, it } from "vitest";

import { deriveProjectMcpTargetPresets } from "../../../src/renderer/services/mcp-target-presets";

const ampTarget = "amp" as McpTargetKind;
const temporaryPaths: string[] = [];

afterEach(() => {
  closeDatabase();
  resetRuntimePaths();
  for (const temporaryPath of temporaryPaths.splice(0)) {
    fs.rmSync(temporaryPath, { recursive: true, force: true });
  }
});

function getAmpPlatform() {
  const platform = getPlatformById("amp");
  if (!platform) {
    throw new Error("Amp platform is not registered");
  }
  return platform;
}

describe("Amp current platform boundary", () => {
  it("uses the documented cross-platform root and retains the old Windows path only as fallback", () => {
    const platform = getAmpPlatform();

    expect(getPlatformRootTemplate(platform, "darwin")).toBe("~/.config/amp");
    expect(getPlatformRootTemplate(platform, "linux")).toBe("~/.config/amp");
    expect(getPlatformRootTemplate(platform, "win32")).toBe(
      "%USERPROFILE%\\.config\\amp",
    );
    expect(platform.rootDirFallbacks?.win32).toEqual(["%APPDATA%\\amp"]);
    expect(platform.skillsRelativePath).toBe("skills");
    expect(platform.globalRuleFile).toBe("AGENTS.md");
    expect(platform.mcpRelativePath).toBe("settings.json");
  });

  it("projects global and workspace Amp MCP targets from the owning MCP domain", () => {
    const global = getMcpTargetPresets("/Users/test", "darwin", {}).find(
      (preset) => preset.id === "amp",
    );
    const workspace = deriveProjectMcpTargetPresets([
      {
        id: "project_docs",
        name: "Docs",
        rootPath: "/workspace/docs",
        scanPaths: [],
        createdAt: 1,
        updatedAt: 1,
      },
    ]).find((preset) => preset.id === "project:project_docs:amp");

    expect(global).toEqual({
      id: "amp",
      target: "amp",
      scope: "global",
      label: "Amp",
      path: "/Users/test/.config/amp/settings.json",
      platformId: "amp",
    });
    expect(workspace).toEqual({
      id: "project:project_docs:amp",
      target: "amp",
      scope: "workspace",
      label: "Docs / Amp",
      path: "/workspace/docs/.amp/settings.json",
      platformId: "amp",
    });
  });

  it("preserves Amp dotted settings while replacing only the literal MCP entry map", () => {
    const existing = {
      "amp.agent.speed": "standard",
      "amp.notifications.enabled": true,
      "amp.mcpServers": {
        old: { command: "old-server" },
      },
    };
    const entries = {
      docs: {
        command: "npx",
        args: ["-y", "@example/docs-mcp"],
      },
    };

    expect(getMcpServersJsonKey(ampTarget)).toBe("amp.mcpServers");
    expect(getMcpJsonServerEntries(existing, ampTarget)).toEqual(
      existing["amp.mcpServers"],
    );
    expect(setMcpJsonServerEntries(existing, ampTarget, entries)).toEqual({
      "amp.agent.speed": "standard",
      "amp.notifications.enabled": true,
      "amp.mcpServers": entries,
    });
  });

  it("applies an Amp binding to a real settings file without replacing unrelated settings", () => {
    const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "amp-mcp-"));
    temporaryPaths.push(userDataPath);
    configureRuntimePaths({ userDataPath });
    initDatabase();
    const settingsPath = path.join(
      userDataPath,
      ".config",
      "amp",
      "settings.json",
    );
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        "amp.agent.speed": "fast",
        "amp.notifications.enabled": false,
        "amp.mcpServers": {
          existing: { command: "existing-server" },
        },
      }),
      "utf8",
    );
    const service = new CoreMcpLibraryService();
    const server = service.createServer({
      name: "docs",
      displayName: "Docs",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@example/docs-mcp"],
    });

    service.apply({
      target: "amp",
      scope: "global",
      path: settingsPath,
      serverIds: [server.id],
    });

    const written = JSON.parse(fs.readFileSync(settingsPath, "utf8")) as Record<
      string,
      unknown
    >;
    expect(written["amp.agent.speed"]).toBe("fast");
    expect(written["amp.notifications.enabled"]).toBe(false);
    expect(written["amp.mcpServers"]).toEqual({
      existing: {
        command: "existing-server",
      },
      docs: {
        command: "npx",
        args: ["-y", "@example/docs-mcp"],
      },
    });
    expect(
      service.getTargetStatus([
        {
          id: "amp",
          target: "amp",
          scope: "global",
          label: "Amp",
          path: settingsPath,
        },
      ])[0],
    ).toMatchObject({
      exists: true,
      serverNames: ["existing", "docs"],
    });
  });

  it("does not misreport Amp-owned Provider or unimplemented depth adapters", () => {
    const inventory = getAgentPlatformCapabilityInventory(getAmpPlatform());

    expect(inventory.installationPath.status).toBe("partial");
    expect(inventory.skills.status).toBe("partial");
    expect(inventory.mcp.status).toBe("partial");
    expect(inventory.rules.status).toBe("partial");
    expect(inventory.providerModel).toEqual({
      status: "unsupported",
      evidence: "service-managed-provider-contract",
    });
    expect(inventory.plugins.status).toBe("planned");
    expect(inventory.configFiles).toEqual({
      status: "partial",
      evidence: "user-config-root-discovery",
    });
    expect(inventory.sessions.status).toBe("planned");
    expect(inventory.usage.status).toBe("unsupported");
    expect(inventory.launch.status).toBe("planned");
    expect(inventory.maintenanceCli.status).toBe("planned");
  });
});
