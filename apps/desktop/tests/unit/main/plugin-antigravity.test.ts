/**
 * @vitest-environment node
 */
import fs from "fs";
import os from "os";
import path from "path";
import { ipcMain } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CoreMcpLibraryService,
  CorePluginLibraryService,
  configureRuntimePaths,
  resetRuntimePaths,
} from "@prompthub/core";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import { getPlatformById } from "@prompthub/shared/constants/platforms";
import {
  registerPluginIPC,
  scanInstalledPluginsForTarget,
} from "../../../src/main/ipc/plugin.ipc";
import { createMcpTestStorage } from "../../../../../packages/core/tests/helpers/mcp-storage";

let mcpStorage: ReturnType<typeof createMcpTestStorage>;
vi.mock("../../../src/main/services/desktop-mcp-library", () => ({
  createDesktopMcpLibraryService: () =>
    new CoreMcpLibraryService(mcpStorage.options),
}));

const fixture = vi.hoisted(() => ({ root: "" }));
vi.mock("electron", () => ({ ipcMain: { handle: vi.fn() } }));
vi.mock(
  "../../../src/main/services/skill-installer-utils",
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import("../../../src/main/services/skill-installer-utils")
      >();
    return {
      ...original,
      getPlatformPluginDir: (platform: { id: string }) =>
        path.join(fixture.root, platform.id, "plugins"),
    };
  },
);

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function writeJson(filePath: string, value: unknown): void {
  writeFile(filePath, JSON.stringify(value));
}

function createZoteroPackage() {
  const source = path.join(fixture.root, "source", "zotero");
  const manifest =
    '{\n  "name": "zotero", "displayName": "Zotero", "version": "0.1.2",\n  "description": "Work with Zotero", "suggestedPrompts": ["Search library"]\n}\n';
  const files = {
    "plugin.json": manifest,
    "mcp_config.json":
      '{"mcpServers":{"zotero":{"command":"node","args":["server.js"]}}}',
    "hooks.json":
      '{"test-hook":{"PostToolUse":[{"matcher":"run_command","hooks":[{"type":"command","command":"./scripts/lint.sh"}]}]}}',
    "rules/citations.md": "Preserve citation keys",
    "assets/icon.png": "test icon bytes",
  };
  for (const [file, content] of Object.entries(files))
    writeFile(path.join(source, file), content);
  return { source, manifest, files };
}

async function invokePluginIpc(
  channel: string,
  request: unknown,
): Promise<unknown> {
  const handler = vi
    .mocked(ipcMain.handle)
    .mock.calls.find(([registered]) => registered === channel)?.[1];
  if (!handler) throw new Error("Missing IPC handler: " + channel);
  // Electron requires a native event; these filesystem IPC handlers do not read it.
  return handler({} as Electron.IpcMainInvokeEvent, request);
}

describe("Antigravity native Plugin workflow (#226)", () => {
  beforeEach(() => {
    fixture.root = fs.mkdtempSync(
      path.join(os.tmpdir(), "plugin-antigravity-"),
    );
    configureRuntimePaths({
      userDataPath: path.join(fixture.root, "userdata"),
    });
    mcpStorage = createMcpTestStorage();
    vi.clearAllMocks();
  });

  afterEach(() => {
    mcpStorage.dispose();
    resetRuntimePaths();
    fs.rmSync(fixture.root, { recursive: true, force: true });
  });

  it("separates Antigravity root manifests from Gemini CLI extensions", () => {
    const geminiRoot = path.join(fixture.root, ".gemini");
    const antigravityRoot = path.join(geminiRoot, "config");
    writeJson(path.join(antigravityRoot, "plugins", "zotero", "plugin.json"), {
      name: "zotero",
      displayName: "Zotero",
      version: "0.1.2",
      description: "Work with Zotero",
      logo: "assets/icon.png",
      suggestedPrompts: ["Search my library"],
    });
    writeJson(
      path.join(geminiRoot, "extensions", "shipper", "gemini-extension.json"),
      {
        name: "shipper",
        commands: ["commands/release.toml"],
        mcpServers: { release: { command: "node", args: ["server.js"] } },
      },
    );
    expect(
      scanInstalledPluginsForTarget("antigravity", antigravityRoot),
    ).toEqual([
      expect.objectContaining({
        name: "zotero",
        displayName: "Zotero",
        version: "0.1.2",
      }),
    ]);
    expect(
      scanInstalledPluginsForTarget("gemini-cli", geminiRoot).map(
        (plugin) => plugin.name,
      ),
    ).toEqual(["shipper"]);
    expect(getPlatformById("gemini")?.pluginsRelativePath).toBe("extensions");
    expect(getPlatformById("antigravity")?.rootDir.win32).toBe(
      "%USERPROFILE%\\.gemini\\config",
    );
  });

  it("scans only direct packages, accepts IDE folder identity, and rejects invalid manifests", () => {
    const root = path.join(fixture.root, "config");
    writeJson(path.join(root, "plugins", "folder-name", "plugin.json"), {
      description: "IDE plugin",
    });
    writeJson(path.join(root, "plugins", "nested", "0.1.2", "plugin.json"), {
      name: "nested",
    });
    writeJson(path.join(root, "plugins", "bad-name", "plugin.json"), {
      name: "../bad",
    });
    writeFile(path.join(root, "plugins", "broken", "plugin.json"), "{broken");
    expect(
      scanInstalledPluginsForTarget("antigravity", root).map(
        (plugin) => plugin.name,
      ),
    ).toEqual(["folder-name"]);
  });

  it("rejects a corrupted native manifest before replacing a distributed package", () => {
    const source = path.join(fixture.root, "source", "safe");
    writeJson(path.join(source, "plugin.json"), { name: "safe" });
    const target = path.join(fixture.root, "agent", "safe");
    const service = new CorePluginLibraryService({
      resolvePluginTargetPath: () => target,
    });
    const imported = service.importLocalPluginPackage({ sourcePath: source });
    service.distributePlugin({
      pluginId: imported.plugin.id,
      targetIds: ["antigravity"],
      mode: "copy",
    });
    const original = fs.readFileSync(path.join(target, "plugin.json"), "utf8");
    const managedPath = imported.plugin.localPackagePath;
    if (!managedPath) throw new Error("Missing managed package path");
    writeJson(path.join(managedPath, "plugin.json"), { name: "../escape" });
    expect(() =>
      service.distributePlugin({
        pluginId: imported.plugin.id,
        targetIds: ["antigravity"],
        mode: "copy",
      }),
    ).toThrow(/Invalid Antigravity native plugin.json/);
    expect(fs.readFileSync(path.join(target, "plugin.json"), "utf8")).toBe(
      original,
    );
  });

  it.each(["copy", "symlink"] as const)(
    "imports, distributes through desktop IPC using %s, scans, reopens, and removes intact",
    async (mode) => {
      const { source, manifest, files } = createZoteroPackage();
      const service = new CorePluginLibraryService();
      const imported = service.importLocalPluginPackage({
        sourcePath: source,
        sourceTargetId: "antigravity",
      });
      expect(imported.plugin).toMatchObject({
        classification: "bundle",
        nativeTargetIds: expect.arrayContaining(["antigravity"]),
        inventory: { mcpServers: 1, hooks: 1, assets: 1 },
      });
      registerPluginIPC();
      await invokePluginIpc(IPC_CHANNELS.PLUGIN_DISTRIBUTE, {
        pluginId: imported.plugin.id,
        targetIds: ["antigravity"],
        mode,
      });
      const target = path.join(
        fixture.root,
        "antigravity",
        "plugins",
        "zotero",
      );
      for (const [file, content] of Object.entries(files))
        expect(fs.readFileSync(path.join(target, file), "utf8")).toBe(content);
      expect(fs.existsSync(path.join(target, "0.1.2"))).toBe(false);
      expect(
        scanInstalledPluginsForTarget(
          "antigravity",
          path.join(fixture.root, "antigravity"),
        ),
      ).toEqual([
        expect.objectContaining({
          name: "zotero",
          sourcePath: path.join(
            fs.realpathSync(path.dirname(target)),
            path.basename(target),
          ),
        }),
      ]);
      const reopened = new CorePluginLibraryService({
        resolvePluginTargetPath: () => target,
      });
      expect(reopened.read().plugins[0].distributedTargetIds).toContain(
        "antigravity",
      );
      await invokePluginIpc(IPC_CHANNELS.PLUGIN_UNDISTRIBUTE, {
        pluginId: imported.plugin.id,
        targetIds: ["antigravity"],
      });
      expect(fs.existsSync(target)).toBe(false);
      expect(fs.readFileSync(path.join(source, "plugin.json"), "utf8")).toBe(
        manifest,
      );
    },
  );

  it("refreshes native capability metadata for an older imported library without reimport", () => {
    const { source } = createZoteroPackage();
    const service = new CorePluginLibraryService();
    const imported = service.importLocalPluginPackage({ sourcePath: source });
    service.write({
      ...imported.library,
      plugins: imported.library.plugins.map((plugin) => ({
        ...plugin,
        nativeTargetIds: ["copilot"],
      })),
    });
    const reopened = new CorePluginLibraryService().read().plugins[0];
    expect(reopened.id).toBe(imported.plugin.id);
    expect(reopened.nativeTargetIds).toContain("antigravity");
    expect(reopened.source).toEqual(imported.plugin.source);
  });

  it("imports an OAuth child through desktop IPC without returning its secret", async () => {
    const { source } = createZoteroPackage();
    writeJson(path.join(source, "mcp_config.json"), {
      mcpServers: {
        remote: {
          serverUrl: "https://example.test/mcp",
          oauth: { clientId: "test-client", clientSecret: "child-test-secret" },
        },
      },
    });
    const service = new CorePluginLibraryService();
    const imported = service.importLocalPluginPackage({ sourcePath: source });
    registerPluginIPC(service);
    const result = await invokePluginIpc(
      IPC_CHANNELS.PLUGIN_IMPORT_CHILD_MCP,
      imported.plugin.id,
    );
    expect(JSON.stringify(result)).not.toContain("child-test-secret");
    expect(result).toMatchObject({
      imported: [
        {
          name: "remote",
          oauth: { clientId: "test-client", clientSecret: "[REDACTED]" },
        },
      ],
    });
    expect(
      new CoreMcpLibraryService(mcpStorage.options).read().servers[0].oauth
        ?.clientSecret,
    ).toBe("child-test-secret");
  });

  it("does not scan an unregistered symlink outside the Agent root", () => {
    const { source } = createZoteroPackage();
    const root = path.join(fixture.root, "agent");
    fs.mkdirSync(path.join(root, "plugins"), { recursive: true });
    fs.symlinkSync(source, path.join(root, "plugins", "zotero"), "dir");
    expect(scanInstalledPluginsForTarget("antigravity", root)).toEqual([]);
  });

  it("ignores a managed distribution link redirected to a different package", () => {
    const { source } = createZoteroPackage();
    const root = path.join(fixture.root, "antigravity");
    const target = path.join(root, "plugins", "zotero");
    const service = new CorePluginLibraryService({
      resolvePluginTargetPath: () => target,
    });
    const imported = service.importLocalPluginPackage({ sourcePath: source });
    service.distributePlugin({
      pluginId: imported.plugin.id,
      targetIds: ["antigravity"],
      mode: "symlink",
    });
    fs.unlinkSync(target);
    fs.symlinkSync(source, target, "dir");
    expect(scanInstalledPluginsForTarget("antigravity", root)).toEqual([]);
    expect(fs.existsSync(path.join(source, "plugin.json"))).toBe(true);
  });

  it("imports a metadata-only native package and preserves an existing target on unsupported conversion", () => {
    const native = path.join(fixture.root, "native");
    writeJson(path.join(native, "plugin.json"), {
      name: "metadata-only",
      description: "Native identity",
    });
    const target = path.join(fixture.root, "target");
    const service = new CorePluginLibraryService({
      resolvePluginTargetPath: () => target,
    });
    const imported = service.importLocalPluginPackage({ sourcePath: native });
    expect(imported.plugin.classification).toBe("bundle");
    service.distributePlugin({
      pluginId: imported.plugin.id,
      targetIds: ["antigravity"],
      mode: "copy",
    });
    const original = fs.readFileSync(path.join(target, "plugin.json"), "utf8");
    const codex = path.join(fixture.root, "codex-source");
    writeJson(path.join(codex, ".codex-plugin", "plugin.json"), {
      name: "codex-only",
      skills: ["skills/a", "skills/b"],
    });
    writeFile(path.join(codex, "skills/a/SKILL.md"), "A");
    writeFile(path.join(codex, "skills/b/SKILL.md"), "B");
    const unsupported = service.importLocalPluginPackage({ sourcePath: codex });
    expect(() =>
      service.distributePlugin({
        pluginId: unsupported.plugin.id,
        targetIds: ["antigravity"],
        mode: "copy",
      }),
    ).toThrow(/native plugin.json/i);
    expect(fs.readFileSync(path.join(target, "plugin.json"), "utf8")).toBe(
      original,
    );
  });
});
