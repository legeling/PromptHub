/**
 * @vitest-environment node
 */
import { initDatabase, closeDatabase } from "@prompthub/db";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CorePluginLibraryService,
  classifyPluginInventory,
  configureRuntimePaths,
  emptyPluginInventory,
  extractPluginInventoryFromManifest,
  getLegacyPluginLibraryFilePath,
  getLegacyPluginMarketCacheFilePath,
  getPluginLibraryFilePath,
  getPluginMarketCacheFilePath,
  resetRuntimePaths,
} from "@prompthub/core";
import type {
  PluginLibraryEntry,
  PluginLibraryFile,
  PluginMarketEntry,
  PluginMarketSource,
} from "@prompthub/shared/types/plugin";

const marketplaceUrl =
  "https://raw.example.test/plugins/.agents/plugins/marketplace.json";
const bundleManifestUrl =
  "https://raw.example.test/plugins/plugins/bundle/.codex-plugin/plugin.json";
const githubTreeUrl =
  "https://api.github.com/repos/example/plugins/git/trees/main?recursive=1";
const bundleIconUrl =
  "https://raw.example.test/plugins/plugins/bundle/assets/icon.png";
const bundleLogoUrl =
  "https://raw.example.test/plugins/plugins/bundle/assets/logo.png";
const singleSkillManifestUrl =
  "https://raw.example.test/plugins/plugins/single-skill/.codex-plugin/plugin.json";
const runtimeManifestUrl =
  "https://raw.example.test/plugins/plugins/runtime/.codex-plugin/plugin.json";

const marketSource: PluginMarketSource = {
  id: "test-market",
  displayName: "Test Market",
  repository: "https://github.com/example/plugins",
  marketplaceFile: ".agents/plugins/marketplace.json",
  rawJsonUrl: marketplaceUrl,
  trustLevel: "official",
};

function createFetchMock(fixtures: Record<string, string>) {
  return vi.fn(async (url: string) => {
    const body = fixtures[url];
    return {
      ok: body !== undefined,
      status: body === undefined ? 404 : 200,
      statusText: body === undefined ? "Not Found" : "OK",
      text: async () => body ?? "",
    };
  });
}

function createMarketplaceFixture() {
  return JSON.stringify({
    name: "test-market",
    interface: { displayName: "Test Plugin Store" },
    plugins: [
      {
        name: "bundle",
        source: { source: "local", path: "./plugins/bundle" },
        policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
        category: "Productivity",
      },
      {
        name: "single-skill",
        source: { source: "local", path: "./plugins/single-skill" },
        category: "Writing",
      },
      {
        name: "runtime",
        source: { source: "local", path: "./plugins/runtime" },
        category: "Developer",
      },
    ],
  });
}

function createInstalledPluginLibrary(userDataPath: string): {
  library: PluginLibraryFile;
  plugin: PluginLibraryEntry;
  packagePath: string;
} {
  const packagePath = path.join(
    userDataPath,
    "data",
    "plugins",
    "bundle",
    "repo",
  );
  fs.mkdirSync(path.join(packagePath, ".codex-plugin"), { recursive: true });
  fs.writeFileSync(
    path.join(packagePath, ".codex-plugin", "plugin.json"),
    JSON.stringify({ name: "bundle" }),
    "utf8",
  );
  fs.writeFileSync(path.join(packagePath, "README.md"), "hello", "utf8");

  const plugin: PluginLibraryEntry = {
    id: "test-market:bundle",
    name: "bundle",
    displayName: "Bundle Plugin",
    trustLevel: "official",
    inventory: { ...emptyPluginInventory(), skills: 1, apps: 1 },
    classification: "bundle",
    source: {
      kind: "market",
      localPackagePath: packagePath,
    },
    distributedTargetIds: [],
    localPackagePath: packagePath,
    installedAt: Date.parse("2026-06-16T00:00:00.000Z"),
    updatedAt: Date.parse("2026-06-16T00:00:00.000Z"),
  };
  const library: PluginLibraryFile = {
    kind: "prompthub-plugin-library",
    version: 1,
    updatedAt: "2026-06-16T00:00:00.000Z",
    plugins: [plugin],
  };
  const stored = new CorePluginLibraryService().write(library);
  return { library: stored, plugin: stored.plugins[0], packagePath: stored.plugins[0].localPackagePath! };
}

function writePluginSourcePackage(options: {
  manifest?: Record<string, unknown>;
  name: string;
  rootDir: string;
}): string {
  const packagePath = path.join(options.rootDir, options.name);
  fs.mkdirSync(path.join(packagePath, ".codex-plugin"), { recursive: true });
  fs.mkdirSync(path.join(packagePath, "skills", "review"), {
    recursive: true,
  });
  fs.mkdirSync(path.join(packagePath, "commands"), { recursive: true });
  fs.writeFileSync(
    path.join(packagePath, ".codex-plugin", "plugin.json"),
    JSON.stringify({
      name: options.name,
      version: "1.0.0",
      description: `${options.name} source plugin`,
      skills: "./skills",
      commands: ["./commands/review.md"],
      interface: {
        displayName: `${options.name} Plugin`,
        longDescription: `${options.name} long description`,
      },
      ...options.manifest,
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(packagePath, "skills", "review", "SKILL.md"),
    "---\nname: review\n---\nReview",
    "utf8",
  );
  fs.writeFileSync(
    path.join(packagePath, "commands", "review.md"),
    "Review command",
    "utf8",
  );
  return packagePath;
}

describe("CorePluginLibraryService", () => {
  let userDataPath: string;

  beforeEach(() => {
    userDataPath = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "plugin-library-")),
    );
    configureRuntimePaths({ userDataPath });
    initDatabase(path.join(userDataPath, "data", "prompthub.db"));
  });

  afterEach(() => {
    closeDatabase();
    resetRuntimePaths();
    fs.rmSync(userDataPath, { recursive: true, force: true });
  });

  it("copies installed plugin packages to resolved Agent Plugin targets", () => {
    const { plugin } = createInstalledPluginLibrary(userDataPath);
    const targetPath = path.join(
      userDataPath,
      "agent-targets",
      "codex",
      "bundle",
    );
    const service = new CorePluginLibraryService({
      fetchFn: createFetchMock({}),
      marketSources: [marketSource],
      resolvePluginTargetPath: (targetId) =>
        targetId === "codex" ? targetPath : undefined,
    });

    const result = service.distributePlugin({
      pluginId: plugin.id,
      targetIds: ["codex"],
      mode: "copy",
    });

    expect(
      fs.existsSync(path.join(targetPath, ".codex-plugin", "plugin.json")),
    ).toBe(true);
    expect(fs.readFileSync(path.join(targetPath, "README.md"), "utf8")).toBe(
      "hello",
    );
    expect(result.targets).toEqual([
      { targetId: "codex", path: targetPath, mode: "copy" },
    ]);
    expect(result.plugin.distributedTargetIds).toEqual(["codex"]);
    expect(service.read().plugins[0]?.distributedTargetIds).toEqual(["codex"]);
  });

  it("removes a distributed plugin package from a specific Agent target", () => {
    const { plugin } = createInstalledPluginLibrary(userDataPath);
    const targetPath = path.join(
      userDataPath,
      "agent-targets",
      "codex",
      "bundle",
    );
    const service = new CorePluginLibraryService({
      fetchFn: createFetchMock({}),
      marketSources: [marketSource],
      resolvePluginTargetPath: (targetId) =>
        targetId === "codex" ? targetPath : undefined,
    });

    service.distributePlugin({
      pluginId: plugin.id,
      targetIds: ["codex"],
      mode: "copy",
    });
    expect(fs.existsSync(targetPath)).toBe(true);

    const result = service.removePluginDistribution({
      pluginId: plugin.id,
      targetIds: ["codex"],
    });

    expect(result.removedTargetIds).toEqual(["codex"]);
    expect(result.skippedTargetIds).toEqual([]);
    expect(result.plugin.distributedTargetIds).toEqual([]);
    expect(service.read().plugins[0]?.distributedTargetIds).toEqual([]);
    expect(fs.existsSync(targetPath)).toBe(false);
  });

  it("refuses to overwrite existing Agent config files during distribution", () => {
    const { plugin } = createInstalledPluginLibrary(userDataPath);
    const configPath = path.join(
      userDataPath,
      "agent-targets",
      "codex",
      "settings.json",
    );
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, '{"mcpServers":{}}\n', "utf8");
    const service = new CorePluginLibraryService({
      fetchFn: createFetchMock({}),
      marketSources: [marketSource],
      resolvePluginTargetPath: (targetId) =>
        targetId === "codex" ? configPath : undefined,
    });

    expect(() =>
      service.distributePlugin({
        pluginId: plugin.id,
        targetIds: ["codex"],
        mode: "copy",
      }),
    ).toThrow(/Plugin target|目标路径|配置/);
    expect(fs.readFileSync(configPath, "utf8")).toBe('{"mcpServers":{}}\n');
    expect(service.read().plugins[0]?.distributedTargetIds).toEqual([]);
  });

  it("refuses to remove non-plugin Agent config files during undistribution", () => {
    const { library, plugin } = createInstalledPluginLibrary(userDataPath);
    const configPath = path.join(
      userDataPath,
      "agent-targets",
      "codex",
      "settings.json",
    );
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, '{"mcpServers":{}}\n', "utf8");
    new CorePluginLibraryService().write({ ...library, plugins: [{ ...plugin, distributedTargetIds: ["codex"] }] });
    const service = new CorePluginLibraryService({
      fetchFn: createFetchMock({}),
      marketSources: [marketSource],
      resolvePluginTargetPath: (targetId) =>
        targetId === "codex" ? configPath : undefined,
    });

    expect(() =>
      service.removePluginDistribution({
        pluginId: plugin.id,
        targetIds: ["codex"],
      }),
    ).toThrow(/Plugin target|目标路径|配置/);
    expect(fs.readFileSync(configPath, "utf8")).toBe('{"mcpServers":{}}\n');
    expect(service.read().plugins[0]?.distributedTargetIds).toEqual(["codex"]);
  });

  it("generates target-native Agent Plugin markers for adapter targets", () => {
    const { plugin, packagePath } = createInstalledPluginLibrary(userDataPath);
    fs.mkdirSync(path.join(packagePath, "skills", "review"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(packagePath, "skills", "review", "SKILL.md"),
      "---\nname: review\n---\nReview",
      "utf8",
    );
    fs.writeFileSync(
      path.join(packagePath, ".codex-plugin", "plugin.json"),
      JSON.stringify({
        name: "bundle",
        version: "1.0.0",
        description: "Bundle description",
        skills: "./skills",
        interface: {
          displayName: "Bundle Plugin",
          longDescription: "Long bundle description",
        },
      }),
      "utf8",
    );
    const targetRoot = path.join(userDataPath, "agent-targets");
    const targetPaths = {
      "claude-code": path.join(targetRoot, "claude", "bundle"),
      "gemini-cli": path.join(targetRoot, "gemini", "bundle"),
    };
    const service = new CorePluginLibraryService({
      fetchFn: createFetchMock({}),
      marketSources: [marketSource],
      resolvePluginTargetPath: (targetId) =>
        targetPaths[targetId as keyof typeof targetPaths],
    });

    const result = service.distributePlugin({
      pluginId: plugin.id,
      targetIds: Object.keys(targetPaths),
      mode: "copy",
    });

    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(
            targetPaths["claude-code"],
            ".claude-plugin",
            "plugin.json",
          ),
          "utf8",
        ),
      ),
    ).toMatchObject({
      name: "bundle",
      displayName: "Bundle Plugin",
      skills: "./skills",
    });
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(targetPaths["gemini-cli"], "gemini-extension.json"),
          "utf8",
        ),
      ),
    ).toMatchObject({
      name: "bundle",
      displayName: "Bundle Plugin",
      skills: "./skills",
    });
    for (const targetPath of Object.values(targetPaths)) {
      expect(
        fs.existsSync(path.join(targetPath, "skills", "review", "SKILL.md")),
      ).toBe(true);
    }
    expect(result.targets.map((target) => target.targetId).sort()).toEqual(
      Object.keys(targetPaths).sort(),
    );
    expect(result.plugin.distributedTargetIds?.sort()).toEqual(
      Object.keys(targetPaths).sort(),
    );
  });

  it("preserves a target-specific native manifest in a multi-manifest package", () => {
    const { plugin, packagePath } = createInstalledPluginLibrary(userDataPath);
    const claudeManifest = {
      name: "bundle",
      description: "Native Claude package",
      commands: ["./commands/native.md"],
      vendorField: { preserve: true },
    };
    fs.mkdirSync(path.join(packagePath, ".claude-plugin"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(packagePath, ".claude-plugin", "plugin.json"),
      JSON.stringify(claudeManifest),
      "utf8",
    );
    const targetPath = path.join(
      userDataPath,
      "agent-targets",
      "claude",
      "bundle",
    );
    const service = new CorePluginLibraryService({
      fetchFn: createFetchMock({}),
      marketSources: [marketSource],
      resolvePluginTargetPath: (targetId) =>
        targetId === "claude-code" ? targetPath : undefined,
    });

    const result = service.distributePlugin({
      pluginId: plugin.id,
      targetIds: ["claude-code"],
      mode: "copy",
    });

    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(targetPath, ".claude-plugin", "plugin.json"),
          "utf8",
        ),
      ),
    ).toEqual(claudeManifest);
    expect(result.targets).toEqual([
      { targetId: "claude-code", path: targetPath, mode: "copy" },
    ]);
  });

  it("rejects a malformed target-native manifest without replacing the target", () => {
    const { plugin, packagePath } = createInstalledPluginLibrary(userDataPath);
    fs.mkdirSync(path.join(packagePath, ".claude-plugin"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(packagePath, ".claude-plugin", "plugin.json"),
      "{ malformed",
      "utf8",
    );
    const targetPath = path.join(userDataPath, "agent-targets", "claude");
    fs.mkdirSync(targetPath, { recursive: true });
    fs.writeFileSync(path.join(targetPath, "keep.txt"), "keep", "utf8");
    const service = new CorePluginLibraryService({
      fetchFn: createFetchMock({}),
      marketSources: [marketSource],
      resolvePluginTargetPath: () => targetPath,
    });

    expect(() =>
      service.distributePlugin({
        pluginId: plugin.id,
        targetIds: ["claude-code"],
        mode: "copy",
      }),
    ).toThrow(/manifest|json/i);
    expect(fs.readFileSync(path.join(targetPath, "keep.txt"), "utf8")).toBe(
      "keep",
    );
    expect(service.read().plugins[0].distributedTargetIds).toEqual([]);
  });

  it("rejects direct Kiro distribution before resolving or writing a target", () => {
    const { plugin } = createInstalledPluginLibrary(userDataPath);
    const targetPath = path.join(
      userDataPath,
      "agent-targets",
      "kiro",
      "bundle",
    );
    const resolvePluginTargetPath = vi.fn(() => targetPath);
    const service = new CorePluginLibraryService({
      fetchFn: createFetchMock({}),
      marketSources: [marketSource],
      resolvePluginTargetPath,
    });

    expect(() =>
      service.distributePlugin({
        pluginId: plugin.id,
        targetIds: ["kiro"],
        mode: "copy",
      }),
    ).toThrow(/native.*kiro.*import|原生.*kiro.*导入/i);
    expect(resolvePluginTargetPath).not.toHaveBeenCalled();
    expect(fs.existsSync(targetPath)).toBe(false);
    expect(service.read().plugins[0]?.distributedTargetIds).toEqual([]);
  });

  it("rejects direct Copilot distribution before resolving or writing a target", () => {
    const { plugin } = createInstalledPluginLibrary(userDataPath);
    const targetPath = path.join(
      userDataPath,
      "agent-targets",
      "copilot",
      "bundle",
    );
    const resolvePluginTargetPath = vi.fn(() => targetPath);
    const service = new CorePluginLibraryService({
      fetchFn: createFetchMock({}),
      marketSources: [marketSource],
      resolvePluginTargetPath,
    });

    expect(() =>
      service.distributePlugin({
        pluginId: plugin.id,
        targetIds: ["github-copilot"],
        mode: "copy",
      }),
    ).toThrow(/native.*copilot plugin install|原生.*copilot plugin install/i);
    expect(resolvePluginTargetPath).not.toHaveBeenCalled();
    expect(fs.existsSync(targetPath)).toBe(false);
    expect(service.read().plugins[0]?.distributedTargetIds).toEqual([]);
  });

  it("rejects direct Cursor distribution before resolving or writing a target", () => {
    const { plugin } = createInstalledPluginLibrary(userDataPath);
    const targetPath = path.join(
      userDataPath,
      "agent-targets",
      "cursor",
      "bundle",
    );
    const resolvePluginTargetPath = vi.fn(() => targetPath);
    const service = new CorePluginLibraryService({
      fetchFn: createFetchMock({}),
      marketSources: [marketSource],
      resolvePluginTargetPath,
    });

    expect(() =>
      service.distributePlugin({
        pluginId: plugin.id,
        targetIds: ["cursor"],
        mode: "copy",
      }),
    ).toThrow(/native.*cursor marketplace|verified local-plugin/i);
    expect(resolvePluginTargetPath).not.toHaveBeenCalled();
    expect(fs.existsSync(targetPath)).toBe(false);
    expect(service.read().plugins[0]?.distributedTargetIds).toEqual([]);
  });

  it("rejects composite Windsurf distribution before resolving or writing a target", () => {
    const { plugin } = createInstalledPluginLibrary(userDataPath);
    const targetPath = path.join(
      userDataPath,
      "agent-targets",
      "windsurf",
      "bundle",
    );
    const resolvePluginTargetPath = vi.fn(() => targetPath);
    const service = new CorePluginLibraryService({
      fetchFn: createFetchMock({}),
      marketSources: [marketSource],
      resolvePluginTargetPath,
    });

    expect(() =>
      service.distributePlugin({
        pluginId: plugin.id,
        targetIds: ["windsurf"],
        mode: "copy",
      }),
    ).toThrow(/composite adapter|single native bundle/i);
    expect(resolvePluginTargetPath).not.toHaveBeenCalled();
    expect(fs.existsSync(targetPath)).toBe(false);
    expect(service.read().plugins[0]?.distributedTargetIds).toEqual([]);
  });

  it("materializes adapter targets as generated copies even when symlink mode is requested", () => {
    const { plugin } = createInstalledPluginLibrary(userDataPath);
    const targetPath = path.join(
      userDataPath,
      "agent-targets",
      "claude",
      "bundle",
    );
    const service = new CorePluginLibraryService({
      fetchFn: createFetchMock({}),
      marketSources: [marketSource],
      resolvePluginTargetPath: (targetId) =>
        targetId === "claude-code" ? targetPath : undefined,
    });

    const result = service.distributePlugin({
      pluginId: plugin.id,
      targetIds: ["claude-code"],
      mode: "symlink",
    });

    expect(fs.lstatSync(targetPath).isSymbolicLink()).toBe(false);
    expect(
      fs.existsSync(path.join(targetPath, ".claude-plugin", "plugin.json")),
    ).toBe(true);
    expect(result.targets).toEqual([
      { targetId: "claude-code", path: targetPath, mode: "copy" },
    ]);
  });

  it("persists Plugin personal metadata without touching package files", () => {
    const { packagePath, plugin } = createInstalledPluginLibrary(userDataPath);
    const service = new CorePluginLibraryService({
      fetchFn: createFetchMock({}),
      marketSources: [marketSource],
    });

    const result = service.updatePluginMetadata(plugin.id, {
      isFavorite: true,
      userTags: ["Client", " review ", ""],
      userNotes: "Use for client review workflows.",
    });

    expect(result.plugins[0]).toMatchObject({
      id: plugin.id,
      isFavorite: true,
      userTags: ["Client", "review"],
      userNotes: "Use for client review workflows.",
    });
    expect(service.read().plugins[0]?.isFavorite).toBe(true);
    expect(service.read().plugins[0]?.userTags).toEqual(["Client", "review"]);
    expect(service.read().plugins[0]?.userNotes).toBe(
      "Use for client review workflows.",
    );
    expect(fs.readFileSync(path.join(packagePath, "README.md"), "utf8")).toBe(
      "hello",
    );

    service.updatePluginMetadata(plugin.id, { isFavorite: false });

    expect(service.read().plugins[0]?.isFavorite).toBe(false);
    expect(service.read().plugins[0]?.userTags).toEqual(["Client", "review"]);
    expect(service.read().plugins[0]?.userNotes).toBe(
      "Use for client review workflows.",
    );
  });

  it("keeps distributed plugin packages by default and removes them when requested", () => {
    const targetPath = path.join(
      userDataPath,
      "agent-targets",
      "codex",
      "bundle",
    );
    const service = new CorePluginLibraryService({
      fetchFn: createFetchMock({}),
      marketSources: [marketSource],
      resolvePluginTargetPath: (targetId) =>
        targetId === "codex" ? targetPath : undefined,
    });

    let { plugin } = createInstalledPluginLibrary(userDataPath);
    service.distributePlugin({
      pluginId: plugin.id,
      targetIds: ["codex"],
      mode: "copy",
    });
    service.deletePlugin(plugin.id);
    expect(
      fs.existsSync(path.join(targetPath, ".codex-plugin", "plugin.json")),
    ).toBe(true);

    ({ plugin } = createInstalledPluginLibrary(userDataPath));
    service.distributePlugin({
      pluginId: plugin.id,
      targetIds: ["codex"],
      mode: "copy",
    });
    service.deletePlugin(plugin.id, { removeDistributedTargets: true });
    expect(fs.existsSync(targetPath)).toBe(false);
  });

  it("imports target-native Agent plugin packages into My Plugins by copying the package", () => {
    const agentPluginPath = path.join(
      userDataPath,
      "external-agents",
      "claude",
      "plugins",
      "review-kit",
    );
    fs.mkdirSync(path.join(agentPluginPath, ".claude-plugin"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(agentPluginPath, ".codex-plugin"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(agentPluginPath, "commands"), { recursive: true });
    fs.mkdirSync(path.join(agentPluginPath, "workflows"), { recursive: true });
    fs.writeFileSync(
      path.join(agentPluginPath, ".claude-plugin", "plugin.json"),
      JSON.stringify({
        name: "review-kit",
        version: "1.0.0",
        description: "Review changes from Claude Code",
        commands: ["./commands/review.md"],
      }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(agentPluginPath, ".codex-plugin", "plugin.json"),
      JSON.stringify({
        name: "review-kit",
        version: "1.0.0",
        description: "Review changes from Claude Code",
        commands: ["./commands/review.md"],
      }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(agentPluginPath, "commands", "review.md"),
      "",
      "utf8",
    );
    fs.writeFileSync(
      path.join(agentPluginPath, "workflows", "release.md"),
      "",
      "utf8",
    );
    const service = new CorePluginLibraryService({
      fetchFn: createFetchMock({}),
      marketSources: [marketSource],
    });

    const result = service.importLocalPluginPackage({
      sourcePath: agentPluginPath,
      sourceTargetId: "claude-code",
      sourceTargetName: "Claude Code",
    });

    expect(result.plugin).toMatchObject({
      id: "agent-claude-code:review-kit",
      name: "review-kit",
      displayName: "review-kit",
      description: "Review changes from Claude Code",
      version: "1.0.0",
      trustLevel: "custom",
      classification: "bundle",
      nativeTargetIds: ["codex", "claude-code"],
      inventory: { commands: 1, docs: 1 },
      source: {
        kind: "local",
        sourceId: "claude-code",
        label: "Claude Code",

      },
    });
    expect(result.library.plugins).toHaveLength(1);
    expect(
      fs.existsSync(
        path.join(
          result.plugin.localPackagePath ?? "",
          ".claude-plugin",
          "plugin.json",
        ),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(agentPluginPath, ".claude-plugin", "plugin.json"),
      ),
    ).toBe(true);
  });

  it("isolates a malformed secondary native manifest from valid targets", () => {
    const agentPluginPath = writePluginSourcePackage({
      name: "invalid-review-kit",
      rootDir: path.join(userDataPath, "external-agents"),
    });
    fs.mkdirSync(path.join(agentPluginPath, ".claude-plugin"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(agentPluginPath, ".claude-plugin", "plugin.json"),
      "{ malformed",
      "utf8",
    );
    const service = new CorePluginLibraryService({
      fetchFn: createFetchMock({}),
      marketSources: [marketSource],
    });
    const managedPluginsPath = path.join(userDataPath, "data", "plugin-files");

    const result = service.importLocalPluginPackage({
      sourcePath: agentPluginPath,
      sourceTargetId: "codex",
    });

    expect(result.plugin.nativeTargetIds).toEqual(["codex"]);
    expect(result.plugin.invalidNativeTargetIds).toEqual(["claude-code"]);
    expect(fs.existsSync(managedPluginsPath)).toBe(true);
  });

  it("uses the first valid manifest when the highest-priority marker is malformed", () => {
    const agentPluginPath = writePluginSourcePackage({
      name: "fallback-review-kit",
      rootDir: path.join(userDataPath, "external-agents"),
    });
    fs.writeFileSync(
      path.join(agentPluginPath, ".codex-plugin", "plugin.json"),
      "{ malformed",
      "utf8",
    );
    fs.mkdirSync(path.join(agentPluginPath, ".claude-plugin"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(agentPluginPath, ".claude-plugin", "plugin.json"),
      JSON.stringify({
        name: "fallback-review-kit",
        commands: ["./commands/review.md"],
      }),
      "utf8",
    );
    const service = new CorePluginLibraryService({
      fetchFn: createFetchMock({}),
      marketSources: [marketSource],
    });

    const result = service.importLocalPluginPackage({
      sourcePath: agentPluginPath,
      sourceTargetId: "claude-code",
    });

    expect(result.plugin.name).toBe("fallback-review-kit");
    expect(result.plugin.nativeTargetIds).toEqual(["claude-code"]);
    expect(result.plugin.invalidNativeTargetIds).toEqual(["codex"]);
  });

  it("rejects traversal paths declared by a secondary native manifest", () => {
    const agentPluginPath = writePluginSourcePackage({
      name: "traversal-review-kit",
      rootDir: path.join(userDataPath, "external-agents"),
    });
    fs.mkdirSync(path.join(agentPluginPath, ".claude-plugin"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(agentPluginPath, ".claude-plugin", "plugin.json"),
      JSON.stringify({
        name: "traversal-review-kit",
        commands: ["../../outside.md"],
      }),
      "utf8",
    );
    const service = new CorePluginLibraryService({
      fetchFn: createFetchMock({}),
      marketSources: [marketSource],
    });

    const result = service.importLocalPluginPackage({
      sourcePath: agentPluginPath,
      sourceTargetId: "codex",
    });

    expect(result.plugin.nativeTargetIds).toEqual(["codex"]);
    expect(result.plugin.invalidNativeTargetIds).toEqual(["claude-code"]);
  });

  it("rejects oversized secondary native manifests before reading their content", () => {
    const agentPluginPath = writePluginSourcePackage({
      name: "oversized-review-kit",
      rootDir: path.join(userDataPath, "external-agents"),
    });
    fs.mkdirSync(path.join(agentPluginPath, ".claude-plugin"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(agentPluginPath, ".claude-plugin", "plugin.json"),
      JSON.stringify({
        name: "oversized-review-kit",
        description: "x".repeat(1024 * 1024),
      }),
      "utf8",
    );
    const service = new CorePluginLibraryService({
      fetchFn: createFetchMock({}),
      marketSources: [marketSource],
    });

    const result = service.importLocalPluginPackage({
      sourcePath: agentPluginPath,
      sourceTargetId: "codex",
    });

    expect(result.plugin.nativeTargetIds).toEqual(["codex"]);
    expect(result.plugin.invalidNativeTargetIds).toEqual(["claude-code"]);
  });

  it("imports HTTPS Git plugin sources with branch and package path metadata", async () => {
    const repoRoot = path.join(userDataPath, "remote-repo");
    const sourcePackagePath = writePluginSourcePackage({
      name: "assist-kit",
      rootDir: path.join(repoRoot, "plugins"),
    });
    const cleanupPath = path.join(userDataPath, "source-cleanup");
    fs.mkdirSync(cleanupPath, { recursive: true });
    const materializeSourcePackageFn = vi.fn(async (request) => ({
      cleanupPath,
      localRepositoryPath: repoRoot,
      sourcePath: sourcePackagePath,
    }));
    const service = new CorePluginLibraryService({
      fetchFn: createFetchMock({}),
      marketSources: [marketSource],
      materializeSourcePackageFn,
    });

    const result = await service.importSourcePlugin({
      url: "https://github.com/example/plugins.git",
      branch: "beta",
      packagePath: "plugins/assist-kit",
      label: "Example Git",
    });

    expect(materializeSourcePackageFn).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "http",
        url: "https://github.com/example/plugins.git",
        branch: "beta",
        packagePath: "plugins/assist-kit",
        label: "Example Git",
      }),
    );
    expect(result.plugin).toMatchObject({
      name: "assist-kit",
      displayName: "assist-kit Plugin",
      trustLevel: "custom",
      classification: "bundle",
      source: {
        kind: "http",
        url: "https://github.com/example/plugins.git",
        branch: "beta",
        packagePath: "plugins/assist-kit",
        label: "Example Git",
      },
      repository: "https://github.com/example/plugins.git",
    });
    expect(result.plugin.localPackagePath).toContain(
      path.join("data", "plugin-files"),
    );
    expect(
      fs.existsSync(
        path.join(
          result.plugin.localPackagePath ?? "",
          ".codex-plugin",
          "plugin.json",
        ),
      ),
    ).toBe(true);
    expect(fs.existsSync(cleanupPath)).toBe(false);
  });

  it("previews HTTPS Git plugin sources without mutating the library", async () => {
    const repoRoot = path.join(userDataPath, "preview-repo");
    const sourcePackagePath = writePluginSourcePackage({
      name: "preview-kit",
      rootDir: path.join(repoRoot, "plugins"),
    });
    const cleanupPath = path.join(userDataPath, "preview-source-cleanup");
    fs.mkdirSync(cleanupPath, { recursive: true });
    const materializeSourcePackageFn = vi.fn(async (request) => ({
      cleanupPath,
      localRepositoryPath: repoRoot,
      sourcePath: sourcePackagePath,
    }));
    const service = new CorePluginLibraryService({
      fetchFn: createFetchMock({}),
      marketSources: [marketSource],
      materializeSourcePackageFn,
    });

    const preview = await service.previewSourcePlugin({
      url: "https://github.com/example/plugins.git",
      branch: "beta",
      packagePath: "plugins/preview-kit",
      label: "Example Git",
    });

    expect(materializeSourcePackageFn).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "http",
        url: "https://github.com/example/plugins.git",
        branch: "beta",
        packagePath: "plugins/preview-kit",
        label: "Example Git",
      }),
    );
    expect(preview).toMatchObject({
      displayName: "preview-kit Plugin",
      classification: "bundle",
      canInstall: true,
      entry: {
        source: {
          kind: "http",
          url: "https://github.com/example/plugins.git",
          branch: "beta",
          packagePath: "plugins/preview-kit",
          label: "Example Git",
        },
      },
    });
    expect(service.read().plugins).toEqual([]);
    expect(fs.existsSync(cleanupPath)).toBe(false);
  });

  it("imports SSH plugin sources through the injected source materializer", async () => {
    const repoRoot = path.join(userDataPath, "ssh-repo");
    const sourcePackagePath = writePluginSourcePackage({
      name: "ssh-kit",
      rootDir: repoRoot,
    });
    const materializeSourcePackageFn = vi.fn(async () => ({
      localRepositoryPath: repoRoot,
      sourcePath: sourcePackagePath,
    }));
    const service = new CorePluginLibraryService({
      fetchFn: createFetchMock({}),
      marketSources: [marketSource],
      materializeSourcePackageFn,
    });

    const result = await service.importSourcePlugin({
      url: "git@github.com:example/plugins.git",
    });

    expect(materializeSourcePackageFn).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "ssh",
        url: "git@github.com:example/plugins.git",
      }),
    );
    expect(result.plugin.source.kind).toBe("ssh");
    expect(result.plugin.source.url).toBe("git@github.com:example/plugins.git");
  });

  it("allows the same source URL and package path on different branches", async () => {
    const repoRoot = path.join(userDataPath, "branch-repo");
    const sourcePackagePath = writePluginSourcePackage({
      name: "branch-kit",
      rootDir: repoRoot,
    });
    const materializeSourcePackageFn = vi.fn(async () => ({
      localRepositoryPath: repoRoot,
      sourcePath: sourcePackagePath,
    }));
    const service = new CorePluginLibraryService({
      fetchFn: createFetchMock({}),
      marketSources: [marketSource],
      materializeSourcePackageFn,
    });

    await service.importSourcePlugin({
      url: "https://github.com/example/plugins.git",
      branch: "main",
      packagePath: "plugins/branch-kit",
    });
    await service.importSourcePlugin({
      url: "https://github.com/example/plugins.git",
      branch: "next",
      packagePath: "plugins/branch-kit",
    });

    expect(
      service.read().plugins.map((plugin) => plugin.source.branch),
    ).toEqual(["main", "next"]);
  });

  it("rejects bare Skill sources without a native Plugin manifest without mutating the library", async () => {
    const repoRoot = path.join(userDataPath, "single-skill-source");
    const sourcePackagePath = path.join(repoRoot, "solo-skill");
    fs.mkdirSync(sourcePackagePath, { recursive: true });
    fs.writeFileSync(
      path.join(sourcePackagePath, "SKILL.md"),
      "---\nname: solo-skill\n---\nSolo",
      "utf8",
    );
    const service = new CorePluginLibraryService({
      fetchFn: createFetchMock({}),
      marketSources: [marketSource],
      materializeSourcePackageFn: vi.fn(async () => ({
        localRepositoryPath: repoRoot,
        sourcePath: sourcePackagePath,
      })),
    });

    await expect(
      service.importSourcePlugin({
        url: "https://github.com/example/solo-skill.git",
      }),
    ).rejects.toThrow(/Plugin manifest/);
    expect(service.read().plugins).toEqual([]);
  });
});
