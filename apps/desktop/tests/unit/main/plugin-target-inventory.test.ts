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

  it("reads the official Oh My Pi user plugin registry from the sibling plugin data root", () => {
    const ompHome = agentRoot;
    const ompAgentRoot = path.join(ompHome, "agent");
    const installedPlugin = path.join(
      ompHome,
      "plugins",
      "cache",
      "plugins",
      "official",
      "review-kit",
      "1.0.0",
    );
    fs.mkdirSync(ompAgentRoot, { recursive: true });
    writeJson(path.join(installedPlugin, ".omp-plugin", "plugin.json"), {
      name: "review-kit",
      displayName: "Review Kit",
      version: "1.0.0",
      skills: ["./skills/review/SKILL.md"],
      commands: ["./commands/review.md"],
    });
    touch(path.join(installedPlugin, "skills", "review", "SKILL.md"));
    touch(path.join(installedPlugin, "commands", "review.md"));
    writeJson(path.join(ompHome, "plugins", "installed_plugins.json"), {
      version: 2,
      plugins: {
        "review-kit@official": [
          {
            scope: "user",
            installPath: installedPlugin,
            version: "1.0.0",
            installedAt: "2026-08-11T00:00:00.000Z",
            lastUpdated: "2026-08-11T00:00:00.000Z",
          },
        ],
      },
    });

    const plugins = scanInstalledPluginsForTarget("oh-my-pi", ompAgentRoot);

    expect(plugins).toHaveLength(1);
    expect(plugins[0]).toMatchObject({
      name: "review-kit",
      displayName: "Review Kit",
      version: "1.0.0",
      inventory: { skills: 1, commands: 1 },
    });
  });

  it("ignores Oh My Pi project installs, duplicate paths, and packages outside its plugin data root", () => {
    const ompHome = agentRoot;
    const ompAgentRoot = path.join(ompHome, "agent");
    const installedPlugin = path.join(
      ompHome,
      "plugins",
      "cache",
      "plugins",
      "official",
      "review-kit",
      "1.0.0",
    );
    const externalPlugin = fs.mkdtempSync(
      path.join(os.tmpdir(), "external-omp-plugin-"),
    );
    const missingPlugin = path.join(
      ompHome,
      "plugins",
      "cache",
      "plugins",
      "official",
      "missing",
      "1.0.0",
    );
    fs.mkdirSync(ompAgentRoot, { recursive: true });
    writeJson(path.join(installedPlugin, ".claude-plugin", "plugin.json"), {
      name: "review-kit",
      commands: ["./commands/review.md"],
    });
    touch(path.join(installedPlugin, "commands", "review.md"));
    writeJson(path.join(externalPlugin, "plugin.json"), {
      name: "outside",
      commands: ["./commands/outside.md"],
    });
    touch(path.join(externalPlugin, "commands", "outside.md"));
    writeJson(path.join(ompHome, "plugins", "installed_plugins.json"), {
      version: 2,
      plugins: {
        "review-kit@official": [
          { scope: "user", installPath: installedPlugin, version: "1.0.0" },
          { scope: "user", installPath: installedPlugin, version: "1.0.0" },
          {
            scope: "project",
            installPath: installedPlugin,
            version: "1.0.0",
          },
        ],
        "outside@official": [
          { scope: "user", installPath: externalPlugin, version: "1.0.0" },
        ],
        "missing@official": [
          { scope: "user", installPath: missingPlugin, version: "1.0.0" },
        ],
      },
    });

    try {
      const plugins = scanInstalledPluginsForTarget("oh-my-pi", ompAgentRoot);

      expect(plugins).toHaveLength(1);
      expect(plugins[0]?.name).toBe("review-kit");
    } finally {
      fs.rmSync(externalPlugin, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === "win32")(
    "rejects Oh My Pi registry package symlinks that escape its plugin data root",
    () => {
      const ompHome = agentRoot;
      const ompAgentRoot = path.join(ompHome, "agent");
      const externalPlugin = fs.mkdtempSync(
        path.join(os.tmpdir(), "external-omp-symlink-"),
      );
      const linkedPlugin = path.join(
        ompHome,
        "plugins",
        "cache",
        "plugins",
        "official",
        "linked",
        "1.0.0",
      );
      fs.mkdirSync(path.dirname(linkedPlugin), { recursive: true });
      writeJson(path.join(externalPlugin, ".omp-plugin", "plugin.json"), {
        name: "linked",
        commands: ["./commands/run.md"],
      });
      touch(path.join(externalPlugin, "commands", "run.md"));
      fs.symlinkSync(externalPlugin, linkedPlugin, "dir");
      writeJson(path.join(ompHome, "plugins", "installed_plugins.json"), {
        version: 2,
        plugins: {
          "linked@official": [
            { scope: "user", installPath: linkedPlugin, version: "1.0.0" },
          ],
        },
      });

      try {
        expect(scanInstalledPluginsForTarget("oh-my-pi", ompAgentRoot)).toEqual(
          [],
        );
      } finally {
        fs.rmSync(externalPlugin, { recursive: true, force: true });
      }
    },
  );

  it("rejects malformed and oversized Oh My Pi registries without reading credentials", () => {
    const ompHome = agentRoot;
    const ompAgentRoot = path.join(ompHome, "agent");
    const registryPath = path.join(
      ompHome,
      "plugins",
      "installed_plugins.json",
    );
    const credentialPath = path.join(ompAgentRoot, "agent.db");
    fs.mkdirSync(ompAgentRoot, { recursive: true });
    touch(credentialPath);
    const readFileSpy = vi.spyOn(fs, "readFileSync");

    try {
      writeJson(registryPath, { version: 1, plugins: {} });
      expect(scanInstalledPluginsForTarget("oh-my-pi", ompAgentRoot)).toEqual(
        [],
      );

      fs.mkdirSync(path.dirname(registryPath), { recursive: true });
      fs.writeFileSync(registryPath, "{invalid", "utf8");
      expect(scanInstalledPluginsForTarget("oh-my-pi", ompAgentRoot)).toEqual(
        [],
      );

      fs.writeFileSync(
        registryPath,
        JSON.stringify({
          version: 2,
          plugins: {},
          padding: "x".repeat(1024 * 1024),
        }),
        "utf8",
      );
      expect(scanInstalledPluginsForTarget("oh-my-pi", ompAgentRoot)).toEqual(
        [],
      );
      expect(
        readFileSpy.mock.calls.some(([filePath]) =>
          String(filePath).endsWith("agent.db"),
        ),
      ).toBe(false);
    } finally {
      readFileSpy.mockRestore();
    }
  });

  it("reads markerless multi-capability Claude bundles without package.json", () => {
    const manualPlugin = path.join(agentRoot, "get-shit-done");
    touch(path.join(manualPlugin, "commands", "ship.md"));
    touch(path.join(manualPlugin, "workflows", "release.md"));
    touch(path.join(manualPlugin, "bin", "gsd-tools.cjs"));

    const plugins = scanInstalledPluginsForTarget("claude-code", agentRoot);

    expect(plugins).toHaveLength(1);
    expect(plugins[0]).toMatchObject({
      name: "get-shit-done",
      inventory: { commands: 1, docs: 1, scripts: 1 },
    });
  });

  it("rejects weak markerless Claude package signals", () => {
    touch(path.join(agentRoot, "command-snippets", "commands", "ship.md"));
    writeJson(path.join(agentRoot, "package-only", "package.json"), {
      name: "package-only",
    });
    fs.mkdirSync(path.join(agentRoot, "empty-bundle", "commands"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(agentRoot, "empty-bundle", "workflows"), {
      recursive: true,
    });

    const plugins = scanInstalledPluginsForTarget("claude-code", agentRoot);

    expect(plugins).toEqual([]);
  });

  it("rejects markerless Claude capabilities that resolve outside the Agent root", () => {
    const externalRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "external-plugin-capabilities-"),
    );
    const manualPlugin = path.join(agentRoot, "linked-bundle");
    touch(path.join(externalRoot, "commands", "ship.md"));
    touch(path.join(externalRoot, "workflows", "release.md"));
    fs.mkdirSync(manualPlugin, { recursive: true });
    fs.symlinkSync(
      path.join(externalRoot, "commands"),
      path.join(manualPlugin, "commands"),
      process.platform === "win32" ? "junction" : "dir",
    );
    fs.symlinkSync(
      path.join(externalRoot, "workflows"),
      path.join(manualPlugin, "workflows"),
      process.platform === "win32" ? "junction" : "dir",
    );

    try {
      expect(scanInstalledPluginsForTarget("claude-code", agentRoot)).toEqual(
        [],
      );
    } finally {
      fs.rmSync(externalRoot, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === "win32")(
    "rejects Claude marker and package metadata symlinks outside the package root",
    () => {
      const externalRoot = fs.mkdtempSync(
        path.join(os.tmpdir(), "external-plugin-metadata-"),
      );
      const linkedMarkerPlugin = path.join(agentRoot, "linked-marker");
      const linkedPackagePlugin = path.join(agentRoot, "linked-package");
      writeJson(path.join(externalRoot, "plugin.json"), {
        name: "external-marker",
        commands: ["./commands/ship.md"],
      });
      writeJson(path.join(externalRoot, "package.json"), {
        name: "external-package",
      });
      fs.mkdirSync(path.join(linkedMarkerPlugin, ".claude-plugin"), {
        recursive: true,
      });
      fs.symlinkSync(
        path.join(externalRoot, "plugin.json"),
        path.join(linkedMarkerPlugin, ".claude-plugin", "plugin.json"),
      );
      touch(path.join(linkedPackagePlugin, "commands", "ship.md"));
      fs.symlinkSync(
        path.join(externalRoot, "package.json"),
        path.join(linkedPackagePlugin, "package.json"),
      );

      try {
        expect(scanInstalledPluginsForTarget("claude-code", agentRoot)).toEqual(
          [],
        );
      } finally {
        fs.rmSync(externalRoot, { recursive: true, force: true });
      }
    },
  );

  it("reads Cursor plugin packages from plugin roots", () => {
    const marketplacePlugin = path.join(
      agentRoot,
      "plugins",
      "cache",
      "cursor-public",
      "review-kit",
      "1.2.0",
    );
    writeJson(path.join(marketplacePlugin, ".cursor-plugin", "plugin.json"), {
      name: "review-kit",
      displayName: "Review Kit",
      rules: ["./rules/review.mdc"],
      mcpServers: { lint: "./mcp/lint.js" },
    });
    touch(path.join(marketplacePlugin, "rules", "review.mdc"));
    touch(path.join(marketplacePlugin, "mcp", "lint.js"));
    const localPlugin = path.join(agentRoot, "plugins", "local", "draft-kit");
    writeJson(path.join(localPlugin, ".cursor-plugin", "plugin.json"), {
      name: "draft-kit",
      displayName: "Draft Kit",
      skills: ["./skills/draft"],
    });
    touch(path.join(localPlugin, "skills", "draft", "SKILL.md"));

    const plugins = scanInstalledPluginsForTarget("cursor", agentRoot);

    expect(plugins).toHaveLength(2);
    expect(plugins).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "review-kit",
          displayName: "Review Kit",
          inventory: expect.objectContaining({ mcpServers: 1 }),
        }),
        expect.objectContaining({
          name: "draft-kit",
          displayName: "Draft Kit",
          inventory: expect.objectContaining({ skills: 1 }),
        }),
      ]),
    );
  });

  it("reads Gemini CLI extension packages", () => {
    const geminiPlugin = path.join(agentRoot, "extensions", "shipper");
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

  it("discovers Qwen extensions as parent-owned bundles", () => {
    const extension = path.join(agentRoot, "extensions", "review-kit");
    writeJson(path.join(extension, "qwen-extension.json"), {
      name: "review-kit",
      version: "1.2.0",
      contextFileName: "QWEN.md",
      mcpServers: { review: { command: "node", args: ["server.js"] } },
    });
    touch(path.join(extension, "skills", "review", "SKILL.md"));
    touch(path.join(extension, "agents", "reviewer.md"));
    touch(path.join(extension, "commands", "review.toml"));

    const plugins = scanInstalledPluginsForTarget("qwen", agentRoot);

    expect(plugins).toHaveLength(1);
    expect(plugins[0]).toMatchObject({
      name: "review-kit",
      version: "1.2.0",
      inventory: { skills: 1, agents: 1, commands: 1, mcpServers: 1 },
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
    const copilotPlugin = path.join(
      agentRoot,
      "installed-plugins",
      "octo-review",
      "1.0.0",
    );
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
