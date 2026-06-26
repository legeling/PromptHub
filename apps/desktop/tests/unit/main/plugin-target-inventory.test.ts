/**
 * @vitest-environment node
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scanInstalledPluginsForTarget } from "../../../src/main/ipc/plugin.ipc";

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}));

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value), "utf8");
}

function touch(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "", "utf8");
}

describe("Agent Plugin target inventory scan", () => {
  let agentRoot: string;

  beforeEach(() => {
    agentRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agent-plugins-"));
  });

  afterEach(() => {
    fs.rmSync(agentRoot, { recursive: true, force: true });
  });

  it("reads Codex plugin cache packages", () => {
    const cachedPlugin = path.join(
      agentRoot,
      "plugins",
      "cache",
      "openai",
      "browser",
      "26.0.0",
    );
    writeJson(path.join(cachedPlugin, ".codex-plugin", "plugin.json"), {
      name: "browser",
      displayName: "Browser",
      description: "Browser automation tools",
      skills: ["./skills/control-browser/SKILL.md"],
      mcpServers: { browser: "./mcp/server.js" },
    });
    touch(path.join(cachedPlugin, "skills", "control-browser", "SKILL.md"));
    touch(path.join(cachedPlugin, "scripts", "probe.js"));

    const plugins = scanInstalledPluginsForTarget("codex", agentRoot);

    expect(plugins).toHaveLength(1);
    expect(plugins[0]).toMatchObject({
      name: "browser",
      displayName: "Browser",
      inventory: { skills: 1, mcpServers: 1, scripts: 1 },
    });
  });

  it("reads Claude installed_plugins registry and manual root plugin packages", () => {
    const cachedPlugin = path.join(
      agentRoot,
      "plugins",
      "cache",
      "claude-plugins-official",
      "feature-dev",
      "1.0.0",
    );
    fs.mkdirSync(path.join(cachedPlugin, "commands"), { recursive: true });
    fs.mkdirSync(path.join(cachedPlugin, "agents"), { recursive: true });
    writeJson(path.join(cachedPlugin, ".claude-plugin", "plugin.json"), {
      name: "feature-dev",
      description: "Feature development workflow",
      commands: ["./commands/plan.md"],
      agents: ["./agents/reviewer.md"],
    });
    touch(path.join(cachedPlugin, "commands", "plan.md"));
    touch(path.join(cachedPlugin, "agents", "reviewer.md"));
    writeJson(path.join(agentRoot, "plugins", "installed_plugins.json"), {
      version: 2,
      plugins: {
        "feature-dev@claude-plugins-official": [
          { scope: "user", installPath: cachedPlugin, version: "1.0.0" },
        ],
      },
    });

    const manualPlugin = path.join(agentRoot, "get-shit-done");
    fs.mkdirSync(path.join(manualPlugin, "commands"), { recursive: true });
    fs.mkdirSync(path.join(manualPlugin, "workflows"), { recursive: true });
    writeJson(path.join(manualPlugin, "package.json"), {
      name: "get-shit-done",
    });
    touch(path.join(manualPlugin, "commands", "ship.md"));
    touch(path.join(manualPlugin, "workflows", "release.md"));

    fs.mkdirSync(path.join(agentRoot, "sessions"), { recursive: true });

    const plugins = scanInstalledPluginsForTarget("claude-code", agentRoot);

    expect(plugins.map((plugin) => plugin.name).sort()).toEqual([
      "feature-dev",
      "get-shit-done",
    ]);
    expect(
      plugins.find((plugin) => plugin.name === "feature-dev")?.inventory,
    ).toMatchObject({ commands: 1, agents: 1 });
    expect(
      plugins.find((plugin) => plugin.name === "get-shit-done")?.inventory,
    ).toMatchObject({ commands: 1, docs: 1 });
    expect(plugins.some((plugin) => plugin.name === "sessions")).toBe(false);
  });

  it("reads Cursor plugin packages from plugin roots", () => {
    const cursorPlugin = path.join(
      agentRoot,
      "plugins",
      "cache",
      "prompthub",
      "review-kit",
    );
    writeJson(path.join(cursorPlugin, ".cursor-plugin", "plugin.json"), {
      name: "review-kit",
      displayName: "Review Kit",
      rules: ["./rules/review.mdc"],
      mcpServers: { lint: "./mcp/lint.js" },
    });
    touch(path.join(cursorPlugin, "rules", "review.mdc"));
    touch(path.join(cursorPlugin, "mcp", "lint.js"));

    const plugins = scanInstalledPluginsForTarget("cursor", agentRoot);

    expect(plugins).toHaveLength(1);
    expect(plugins[0]).toMatchObject({
      name: "review-kit",
      displayName: "Review Kit",
      inventory: { mcpServers: 1 },
    });
  });

  it("reads Gemini CLI extension packages", () => {
    const geminiPlugin = path.join(agentRoot, "config", "plugins", "shipper");
    writeJson(path.join(geminiPlugin, "gemini-extension.json"), {
      name: "shipper",
      displayName: "Shipper",
      commands: ["./commands/release.toml"],
      mcpServers: { github: "./mcp/github.js" },
    });
    touch(path.join(geminiPlugin, "commands", "release.toml"));

    const plugins = scanInstalledPluginsForTarget("gemini-cli", agentRoot);

    expect(plugins).toHaveLength(1);
    expect(plugins[0]).toMatchObject({
      name: "shipper",
      displayName: "Shipper",
      inventory: { commands: 1, mcpServers: 1 },
    });
  });

  it("reads Kiro Power packages", () => {
    const power = path.join(agentRoot, "powers", "design-review");
    fs.mkdirSync(power, { recursive: true });
    fs.writeFileSync(
      path.join(power, "POWER.md"),
      [
        "---",
        "name: design-review",
        "description: Review UI design changes",
        "---",
        "",
        "# Design Review",
      ].join("\n"),
      "utf8",
    );
    touch(path.join(power, "steering", "ui.md"));

    const plugins = scanInstalledPluginsForTarget("kiro", agentRoot);

    expect(plugins).toHaveLength(1);
    expect(plugins[0]).toMatchObject({
      name: "design-review",
      displayName: "design-review",
      inventory: { docs: 1 },
    });
  });

  it("reads GitHub Copilot plugin packages", () => {
    const copilotPlugin = path.join(agentRoot, "plugins", "octo-review");
    writeJson(path.join(copilotPlugin, "plugin.json"), {
      name: "octo-review",
      displayName: "Octo Review",
      skills: ["./skills/review.md"],
      agents: ["./agents/reviewer.md"],
      commands: ["./commands/review.md"],
    });
    touch(path.join(copilotPlugin, "skills", "review.md"));
    touch(path.join(copilotPlugin, "agents", "reviewer.md"));
    touch(path.join(copilotPlugin, "commands", "review.md"));

    const plugins = scanInstalledPluginsForTarget("github-copilot", agentRoot);

    expect(plugins).toHaveLength(1);
    expect(plugins[0]).toMatchObject({
      name: "octo-review",
      displayName: "Octo Review",
      inventory: { skills: 1, agents: 1, commands: 1 },
    });
  });
});
