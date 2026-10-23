import {
  createSkillTestRuntime,
  skillApi,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CorePluginLibraryService } from "@prompthub/core";
import { createAgentUserConfigFileService } from "@prompthub/core/agent-management/agent-user-config-files";
import { createAgentExtensionsService } from "@prompthub/core/agent-management/agent-extensions";
import { getDatabase } from "../../src/main/database";
import { registerAgentExtensionIPC } from "../../src/main/ipc/agent-extension.ipc";
import { registerRulesIPC } from "../../src/main/ipc/rules.ipc";
import { registerMcpIPC } from "../../src/main/ipc/mcp.ipc";
import { agentApi } from "../../src/preload/api/agent";
import { rulesApi } from "../../src/preload/api/rules";
import { mcpApi } from "../../src/preload/api/mcp";
import {
  distributeDesktopPlugin,
  removeDesktopPluginDistribution,
} from "../../src/main/services/desktop-plugin-distribution";
import { resolveAgentPluginTargetPath } from "../../src/main/ipc/plugin-target-paths";
import { getPluginNativeMarketplaceName } from "@prompthub/core/plugin-library/shared";
import {
  createClaudeGateway,
  isolatedClaudeEnvironment,
  runIsolatedClaude,
  NATIVE_REPLY,
} from "./helpers/claude-native-gateway";

const CREDENTIAL = "fixture-native-assets-only";
const ACCEPTANCE_TIMEOUT_MS = 120_000;
describe.skipIf(process.env.PROMPTHUB_NATIVE_AGENT_TESTS !== "1")(
  "Claude native asset consumption",
  () => {
    let runtime: SkillTestRuntime;
    let gateway: Awaited<ReturnType<typeof createClaudeGateway>>;
    let home: string;
    let config: string;
    let delegate = false;
    beforeEach(async () => {
      runtime = await createSkillTestRuntime();
      delegate = false;
      home = path.join(runtime.root, "native-home");
      config = runtime.platformRoot("claude");
      fs.mkdirSync(config, { recursive: true });
      gateway = await createClaudeGateway(CREDENTIAL, (body) => {
        if (delegate) {
          delegate = false;
          return {
            name: "Agent",
            input: {
              description: "Verify native SubAgent",
              prompt: "Return the fixture marker.",
              subagent_type: "fixture-child",
              run_in_background: false,
            },
          };
        }
        const serialized = JSON.stringify(body.messages);
        if (
          JSON.stringify(body.tools).includes("mcp__fixture__echo") &&
          !serialized.includes("NATIVE_MCP_RESULT")
        )
          return { name: "mcp__fixture__echo", input: {} };
        return undefined;
      });
      fs.writeFileSync(
        path.join(config, "settings.json"),
        JSON.stringify({
          model: "fixture-model",
          env: {
            ANTHROPIC_BASE_URL: gateway.endpoint,
            ANTHROPIC_AUTH_TOKEN: CREDENTIAL,
            ENABLE_TOOL_SEARCH: "false",
          },
        }),
      );
      registerAgentExtensionIPC(
        getDatabase(),
        createAgentExtensionsService(
          createAgentUserConfigFileService({
            createBackup: async () => undefined,
          }),
        ),
      );
      registerRulesIPC();
      registerMcpIPC();
    });
    afterEach(async () => {
      await gateway?.close();
      runtime?.dispose();
    });
    function run(prompt: string, extra: string[] = []): Promise<string> {
      return runIsolatedClaude(home, config, [
        "-p",
        prompt,
        "--output-format",
        "json",
        "--setting-sources",
        "user",
        "--no-session-persistence",
        ...extra,
      ]);
    }

    it(
      "consumes deployed Skill, Rule, MCP tool, SubAgent and Hook through the installed CLI",
      async () => {
        const skillContent =
          "---\nname: native-skill\ndescription: Native acceptance Skill\n---\nNATIVE_SKILL_MARKER\n";
        fs.mkdirSync(path.join(runtime.source, "docs"), { recursive: true });
        fs.writeFileSync(path.join(runtime.source, "SKILL.md"), skillContent);
        fs.writeFileSync(
          path.join(runtime.source, "docs/note.txt"),
          "PACKAGED_REFERENCE",
        );
        const installed = await skillApi.runPackageOperation({
          operation: "install",
          registrySkill: {
            name: "native-skill",
            slug: "native-skill",
            description: "Native fixture",
            category: "general",
            author: "Test",
            version: "1.0.0",
            tags: [],
            source_id: "native-fixture",
            source_url: runtime.source,
            content: skillContent,
          },
          content: skillContent,
          source: { kind: "local-directory", directory: runtime.source },
        });
        if (installed.status !== "completed")
          throw new Error(JSON.stringify(installed));
        await skillApi.installMd(
          installed.skill.id,
          installed.skill.instructions,
          "claude",
        );
        expect(
          fs.readFileSync(
            path.join(config, "skills/native-skill/docs/note.txt"),
            "utf8",
          ),
        ).toBe("PACKAGED_REFERENCE");
        const rule = (await rulesApi.scan()).find(
          (item) => item.targetPath === path.join(config, "CLAUDE.md"),
        );
        if (!rule) throw new Error("Claude rule not found");
        await rulesApi.save(rule.id, "NATIVE_RULE_MARKER");
        const subagent = {
          agentId: "claude",
          scope: "user" as const,
          kind: "subagent" as const,
          relativePath: "agents/fixture-reviewer.md",
        };
        const definition = await agentApi.writeAgentExtension({
          ...subagent,
          content:
            "---\nname: fixture-reviewer\ndescription: Native reviewer\nskills: [native-skill]\n---\nNATIVE_SUBAGENT_MARKER\n",
        });
        const hooks = {
          agentId: "claude",
          scope: "user" as const,
          kind: "hooks" as const,
          relativePath: "settings.json",
        };
        const original = await agentApi.readAgentExtension(hooks);
        const output = JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "SessionStart",
            additionalContext: "NATIVE_HOOK_MARKER",
          },
        });
        const savedHooks = await agentApi.writeAgentExtension({
          ...hooks,
          expectedRevision: original.revision,
          content: JSON.stringify({
            SessionStart: [
              {
                hooks: [
                  { type: "command", command: `printf '%s' '${output}'` },
                ],
              },
            ],
          }),
        });
        const server = await mcpApi.createServer({
          name: "fixture",
          transport: "stdio",
          command: process.execPath,
          args: [path.resolve("tests/fixtures/claude-native-mcp.mjs")],
        });
        const target = {
          target: "claude" as const,
          scope: "global" as const,
          path: path.join(config, ".claude.json"),
          serverIds: [server.id],
        };
        await mcpApi.apply(target);
        expect(
          await runIsolatedClaude(home, config, ["mcp", "get", "fixture"]),
        ).toContain("Connected");
        const result = await run("/native-skill", [
          "--agent",
          "fixture-reviewer",
          "--allowedTools",
          "mcp__fixture__echo",
        ]);
        expect(result).toContain(NATIVE_REPLY);
        const requests = JSON.stringify(
          gateway.requests.map((request) => request.body),
        );
        for (const marker of [
          "NATIVE_SKILL_MARKER",
          "NATIVE_RULE_MARKER",
          "NATIVE_SUBAGENT_MARKER",
          "NATIVE_HOOK_MARKER",
          "NATIVE_MCP_RESULT",
        ])
          expect.soft(requests.includes(marker), marker).toBe(true);
        await agentApi.deleteAgentExtension({
          ...subagent,
          expectedRevision: definition.revision!,
        });
        await agentApi.writeAgentExtension({
          ...hooks,
          content: "{}",
          expectedRevision: savedHooks.revision,
        });
        await mcpApi.remove(target);
        await skillApi.uninstallMd(installed.skill.id, "claude");
        await rulesApi.save(rule.id, "UPDATED_RULE_MARKER");
        gateway.requests.length = 0;
        expect(await run("Read current instructions.")).toContain(NATIVE_REPLY);
        const after = JSON.stringify(
          gateway.requests.map((request) => request.body),
        );
        expect(after).toContain("UPDATED_RULE_MARKER");
        for (const marker of [
          "NATIVE_SKILL_MARKER",
          "NATIVE_RULE_MARKER",
          "NATIVE_SUBAGENT_MARKER",
          "NATIVE_HOOK_MARKER",
          "mcp__fixture__echo",
        ])
          expect(after).not.toContain(marker);
      },
      ACCEPTANCE_TIMEOUT_MS,
    );

    it(
      "spawns a real native SubAgent with its own instructions and completes its tool result",
      async () => {
        await agentApi.writeAgentExtension({
          agentId: "claude",
          scope: "user",
          kind: "subagent",
          relativePath: "agents/fixture-child.md",
          content:
            "---\nname: fixture-child\ndescription: Fixture child for native delegation\ntools: Read\n---\nNATIVE_CHILD_SYSTEM_MARKER\n",
        });
        delegate = true;
        const result = JSON.parse(
          await run("Delegate to fixture-child.", ["--allowedTools", "Agent"]),
        );
        expect(result.is_error).toBe(false);
        expect(result.subagent_stats.spawned).toBe(1);
        expect(result.subagent_stats.completed).toBe(1);
        expect(result.subagent_stats.failed).toBe(0);
        expect(
          JSON.stringify(gateway.requests.map((entry) => entry.body)),
        ).toContain("NATIVE_CHILD_SYSTEM_MARKER");
      },
      ACCEPTANCE_TIMEOUT_MS,
    );

    it(
      "registers, consumes, disables, updates and removes a Plugin using native Claude registry",
      async () => {
        const source = path.join(runtime.root, "plugin-source");
        fs.mkdirSync(path.join(source, ".claude-plugin"), { recursive: true });
        fs.mkdirSync(path.join(source, "skills/hello"), { recursive: true });
        fs.writeFileSync(
          path.join(source, ".claude-plugin/plugin.json"),
          JSON.stringify({
            name: "native-fixture",
            version: "1.0.0",
            description: "Fixture",
          }),
        );
        fs.writeFileSync(
          path.join(source, "skills/hello/SKILL.md"),
          "---\nname: hello\ndescription: Native plugin fixture\n---\nNATIVE_PLUGIN_MARKER\n",
        );
        const library = new CorePluginLibraryService({
          resolvePluginTargetPath: resolveAgentPluginTargetPath,
        });
        const plugin = library.importLocalPluginPackage({
          sourcePath: source,
        }).plugin;
        const options = {
          environment: isolatedClaudeEnvironment(home, config),
          beforeMutation: async () => undefined,
        };
        const request = {
          pluginId: plugin.id,
          targetIds: ["claude-code"],
          mode: "copy" as const,
        };
        const installed = await distributeDesktopPlugin(
          library,
          request,
          options,
        );
        expect(installed.failures ?? []).toEqual([]);
        const selector = `${plugin.name}@${getPluginNativeMarketplaceName(plugin.id)}`;
        expect(
          await runIsolatedClaude(home, config, ["plugin", "list", "--json"]),
        ).toContain(plugin.name);
        expect(await run("/native-fixture:hello")).toContain(NATIVE_REPLY);
        expect(
          JSON.stringify(gateway.requests.map((entry) => entry.body)),
        ).toContain("NATIVE_PLUGIN_MARKER");
        await runIsolatedClaude(home, config, [
          "plugin",
          "disable",
          selector,
          "--scope",
          "user",
        ]);
        expect(
          JSON.parse(
            fs.readFileSync(path.join(config, "settings.json"), "utf8"),
          ).enabledPlugins[selector],
        ).toBe(false);
        await runIsolatedClaude(home, config, [
          "plugin",
          "enable",
          selector,
          "--scope",
          "user",
        ]);
        fs.writeFileSync(
          path.join(source, ".claude-plugin/plugin.json"),
          JSON.stringify({
            name: "native-fixture",
            version: "1.0.1",
            description: "Updated fixture",
          }),
        );
        fs.writeFileSync(
          path.join(source, "skills/hello/SKILL.md"),
          "---\nname: hello\ndescription: Updated native plugin fixture\n---\nUPDATED_PLUGIN_MARKER\n",
        );
        await library.updatePluginFromSource(plugin.id);
        await distributeDesktopPlugin(library, request, options);
        gateway.requests.length = 0;
        expect(await run("/native-fixture:hello")).toContain(NATIVE_REPLY);
        expect(
          JSON.stringify(gateway.requests.map((entry) => entry.body)),
        ).toContain("UPDATED_PLUGIN_MARKER");
        expect(
          new CorePluginLibraryService()
            .read()
            .plugins.find((item) => item.id === plugin.id)
            ?.distributedTargetIds,
        ).toContain("claude-code");
        const removed = await removeDesktopPluginDistribution(
          library,
          { pluginId: plugin.id, targetIds: ["claude-code"] },
          options,
        );
        expect(removed.failures ?? []).toEqual([]);
        expect(
          await runIsolatedClaude(home, config, ["plugin", "list", "--json"]),
        ).not.toContain(plugin.name);
      },
      ACCEPTANCE_TIMEOUT_MS,
    );
  },
);
