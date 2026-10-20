/** @vitest-environment node */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parse as parseToml } from "smol-toml";
import {
  CorePluginLibraryService,
  CoreMcpLibraryService,
  configureRuntimePaths,
  resetRuntimePaths,
} from "@prompthub/core";
import { initDatabase, closeDatabase } from "@prompthub/core";
import {
  distributeDesktopPlugin,
  removeDesktopPluginDistribution,
} from "../../src/main/services/desktop-plugin-distribution";
import { resolveAgentPluginTargetPath } from "../../src/main/ipc/plugin-target-paths";
import { invalidateCustomPathsCache } from "../../src/main/services/skill-installer-utils";
import { createNativeCommandRunner } from "../../src/main/services/native-command";
import { getPluginNativeMarketplaceName } from "@prompthub/core/plugin-library/shared";
import { scanInstalledPluginsForTarget } from "../../src/main/ipc/plugin-target-inventory";
import { mapCodexInstalledPlugins } from "../../src/main/ipc/plugin-codex.ipc";
import { CodexPluginService } from "@prompthub/core/codex-plugins/service";
import { createCodexPluginRunner } from "@prompthub/core/codex-plugins/runtime";

vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn() },
  app: { isPackaged: false },
  session: {},
}));

// Optional local acceptance requires the real vendor CLIs; regular CI has no account/runtime dependency.
describe.skipIf(process.env.PROMPTHUB_NATIVE_AGENT_TESTS !== "1")(
  "native Codex / Claude Plugin installation",
  () => {
    let root: string;
    beforeEach(() => {
      root = fs.mkdtempSync(
        path.join(os.tmpdir(), "native-plugin-acceptance-"),
      );
      configureRuntimePaths({ userDataPath: path.join(root, "userdata") });
      const db = initDatabase();
      db.prepare(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
      ).run(
        "builtinAgentOverrides",
        JSON.stringify({
          codex: { rootPath: path.join(root, "codex") },
          claude: { rootPath: path.join(root, "claude") },
        }),
      );
      invalidateCustomPathsCache();
      for (const platform of ["codex", "claude"])
        fs.mkdirSync(path.join(root, platform), { recursive: true });
      for (const marker of [
        ".codex-plugin/plugin.json",
        ".claude-plugin/plugin.json",
      ]) {
        const file = path.join(root, "source", marker);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(
          file,
          JSON.stringify({
            name: "native-fixture",
            version: "1.0.0",
            description: "Local acceptance fixture",
            author: { name: "PromptHub" },
            skills: "./skills",
          }),
        );
      }
      fs.writeFileSync(
        path.join(root, "source", "plugin.json"),
        JSON.stringify({
          $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
          name: "native-fixture",
          version: "1.0.0",
          extensions: {
            "com.openai": {
              interface: { displayName: "Portable Native Fixture" },
            },
          },
        }),
      );
      fs.writeFileSync(
        path.join(root, "source", ".codex-plugin", "plugin.json"),
        JSON.stringify({
          name: "stale-overlay",
          version: "1.0.0",
          skills: "./skills",
        }),
      );
      const skill = path.join(root, "source", "skills", "hello", "SKILL.md");
      fs.mkdirSync(path.dirname(skill), { recursive: true });
      fs.writeFileSync(
        skill,
        "---\nname: hello\ndescription: Say hello\n---\nSay hello.",
      );
    });
    afterEach(() => {
      closeDatabase();
      invalidateCustomPathsCache();
      resetRuntimePaths();
      fs.rmSync(root, { recursive: true, force: true });
    });

    it("installs, enables, rediscovers and removes a single Skill Plugin using both actual vendor CLIs", async () => {
      const library = new CorePluginLibraryService({
        resolvePluginTargetPath: resolveAgentPluginTargetPath,
      });
      const plugin = library.importLocalPluginPackage({
        sourcePath: path.join(root, "source"),
      }).plugin;
      const environment = {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
        DISABLE_AUTOUPDATER: "1",
        DISABLE_TELEMETRY: "1",
        DISABLE_ERROR_REPORTING: "1",
      };
      const options = { environment, beforeMutation: async () => undefined };
      const request = {
        pluginId: plugin.id,
        targetIds: ["codex", "claude-code"],
        mode: "copy" as const,
      };
      const installed = await distributeDesktopPlugin(
        library,
        request,
        options,
      );
      expect(installed.plugin.distributedTargetIds).toEqual(
        expect.arrayContaining(request.targetIds),
      );
      const codex = parseToml(
        fs.readFileSync(path.join(root, "codex", "config.toml"), "utf8"),
      );
      const claude = JSON.parse(
        fs.readFileSync(path.join(root, "claude", "settings.json"), "utf8"),
      );
      expect(codex.plugins).toBeDefined();
      expect(Object.values(claude.enabledPlugins)).toContain(true);
      expect(
        fs.existsSync(
          path.join(root, "claude", "plugins", "installed_plugins.json"),
        ),
      ).toBe(true);
      const runner = createCodexPluginRunner();
      for (const platform of ["codex", "claude"]) {
        const command = await runner.resolve(platform);
        if (!command) throw new Error(`Required CLI missing: ${platform}`);
        const output = await runner.run(command, ["plugin", "list", "--json"], {
          timeout: 30_000,
          maxBuffer: 65536,
          env: {
            ...environment,
            CODEX_HOME: path.join(root, "codex"),
            CLAUDE_CONFIG_DIR: path.join(root, "claude"),
          },
        });
        expect(output.stdout).toContain("native-fixture");
      }
      expect(
        new CorePluginLibraryService().read().plugins[0].distributedTargetIds,
      ).toEqual(expect.arrayContaining(request.targetIds));
      expect(
        mapCodexInstalledPlugins(await new CodexPluginService({ root: path.join(root, "codex"), backupConfig: async () => undefined }).list(), library.read().plugins),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "native-fixture",
            displayName: "Portable Native Fixture",
            inventory: expect.objectContaining({ skills: 1 }),
          }),
        ]),
      );
      expect(
        scanInstalledPluginsForTarget("claude-code", path.join(root, "claude")),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "native-fixture",
            inventory: expect.objectContaining({ skills: 1 }),
          }),
        ]),
      );
      await distributeDesktopPlugin(library, request, options);
      const selector = `${plugin.name}@${getPluginNativeMarketplaceName(plugin.id)}`;
      const claudeConfig = path.join(root, "claude", "settings.json");
      const settings = JSON.parse(fs.readFileSync(claudeConfig, "utf8"));
      settings.enabledPlugins[selector] = false;
      fs.writeFileSync(claudeConfig, JSON.stringify(settings));
      await removeDesktopPluginDistribution(
        library,
        { pluginId: plugin.id, targetIds: request.targetIds },
        options,
      );
      expect(library.read().plugins[0].distributedTargetIds).toEqual([]);
      for (const target of ["codex", "claude-code"]) {
        const plugins = scanInstalledPluginsForTarget(
          target,
          path.join(root, target === "codex" ? "codex" : "claude"),
        );
        expect(plugins.some((plugin) => plugin.name === "native-fixture")).toBe(
          false,
        );
      }
      expect(
        Object.values(
          JSON.parse(
            fs.readFileSync(path.join(root, "claude", "settings.json"), "utf8"),
          ).enabledPlugins ?? {},
        ),
      ).not.toContain(true);
    }, 120_000);

    it("retries after a registered marketplace's first native install fails without falsely reporting a distributed Plugin", async () => {
      const library = new CorePluginLibraryService({
        resolvePluginTargetPath: resolveAgentPluginTargetPath,
      });
      const plugin = library.importLocalPluginPackage({
        sourcePath: path.join(root, "source"),
      }).plugin;
      const native = createNativeCommandRunner();
      let fail = true;
      const runner = {
        resolve: native.resolve,
        run: async (...args: Parameters<typeof native.run>) => {
          if (args[1][1] === "install" && fail) {
            fail = false;
            throw new Error("Synthetic install interruption");
          }
          return native.run(...args);
        },
      };
      const environment = {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
        DISABLE_AUTOUPDATER: "1",
        DISABLE_TELEMETRY: "1",
        DISABLE_ERROR_REPORTING: "1",
      };
      const request = {
        pluginId: plugin.id,
        targetIds: ["claude-code"],
        mode: "copy" as const,
      };
      await expect(
        distributeDesktopPlugin(library, request, { runner, environment }),
      ).rejects.toThrow("Native Plugin install failed");
      expect(library.read().plugins[0].distributedTargetIds).toEqual([]);
      expect(
        (
          await distributeDesktopPlugin(library, request, {
            runner,
            environment,
          })
        ).plugin.distributedTargetIds,
      ).toContain("claude-code");
      await removeDesktopPluginDistribution(
        library,
        { pluginId: plugin.id, targetIds: request.targetIds },
        { runner, environment },
      );
    }, 120_000);

    it("round-trips Codex MCP authentication fields into a config parsed by the real CLI and locates Claude's custom MCP file", async () => {
      const runner = createNativeCommandRunner();
      const environment = {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
        CODEX_HOME: path.join(root, "codex"),
        CLAUDE_CONFIG_DIR: path.join(root, "claude"),
        DISABLE_AUTOUPDATER: "1",
        DISABLE_TELEMETRY: "1",
        DISABLE_ERROR_REPORTING: "1",
      };
      const service = new CoreMcpLibraryService();
      const input = path.join(root, "mcp-native.toml");
      fs.writeFileSync(
        input,
        '[mcp_servers.docs]\nurl="https://example.test/mcp"\nbearer_token_env_var="AUDIT_TOKEN"\ndisabled_tools=["delete"]\n[mcp_servers.docs.env_http_headers]\nAuthorization="AUDIT_AUTH"\n',
      );
      const result = service.importFromFile(input);
      service.apply({
        target: "codex",
        scope: "custom",
        path: path.join(root, "codex", "config.toml"),
        serverIds: result.imported.map((server) => server.id),
      });
      const codex = await runner.resolve("codex");
      const claude = await runner.resolve("claude");
      if (!codex || !claude) throw new Error("Required native CLIs missing");
      const output = await runner.run(codex, ["mcp", "get", "docs", "--json"], {
        env: environment,
        timeout: 30_000,
        maxBuffer: 65536,
      });
      expect(JSON.parse(output.stdout)).toMatchObject({
        transport: {
          bearer_token_env_var: "AUDIT_TOKEN",
          env_http_headers: { Authorization: "AUDIT_AUTH" },
        },
      });
      await runner.run(
        claude,
        [
          "mcp",
          "add",
          "--scope",
          "user",
          "--transport",
          "http",
          "audit-docs",
          "https://example.test/mcp",
        ],
        { env: environment, timeout: 30_000, maxBuffer: 65536 },
      );
      expect(
        JSON.parse(
          fs.readFileSync(path.join(root, "claude", ".claude.json"), "utf8"),
        ).mcpServers["audit-docs"].url,
      ).toBe("https://example.test/mcp");
    }, 120_000);
  },
);
