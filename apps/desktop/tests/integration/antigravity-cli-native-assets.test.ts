/** @vitest-environment node */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { createAgentExtensionsService } from "@prompthub/core/agent-management/agent-extensions";
import { createAgentUserConfigFileService } from "@prompthub/core/agent-management/agent-user-config-files";
import { createNativeCommandRunner } from "../../src/main/services/native-command";
import { updateAgentModelConfig } from "../../src/main/services/agent-model-config";
import {
  createOpenAINativeGateway,
  PROVIDER_REPLY,
  PROVIDER_SECRET,
  PROVIDER_PROCESS_TIMEOUT_MS,
} from "./helpers/openai-native-gateway";

const execute = promisify(execFile);
const nativeCommandTimeoutMs = 15_000;
const nativeCommandOutputBytes = 65_536;
let root: string | undefined;
afterEach(async () => {
  if (root) await fs.rm(root, { recursive: true, force: true });
});

describe.skipIf(process.env.PROMPTHUB_NATIVE_AGENT_TESTS !== "1")(
  "Antigravity CLI native assets",
  () => {
    it("uses a PromptHub-selected model in a real isolated agy request", async () => {
      root = await fs.mkdtemp(path.join(os.tmpdir(), "prompthub-agy-model-"));
      const command = await createNativeCommandRunner().resolve("agy");
      if (!command) throw new Error("Native acceptance requires agy CLI");
      const gateway = await createOpenAINativeGateway();
      try {
        const configRoot = path.join(root, ".gemini/antigravity-cli");
        const selected = "Gemini 3.1 Pro (Low)";
        await fs.mkdir(configRoot, { recursive: true });
        await fs.writeFile(
          path.join(configRoot, "settings.json"),
          JSON.stringify({
            modelProvider: "gemini",
          }),
        );
        const skillsRoot = path.join(configRoot, "skills/split-native-skill");
        await fs.mkdir(skillsRoot, { recursive: true });
        await fs.writeFile(
          path.join(skillsRoot, "SKILL.md"),
          "---\nname: split-native-skill\ndescription: SPLIT_SKILL_DISCOVERY_RECEIPT\n---\nReply briefly.\n",
        );
        await fs.writeFile(
          path.join(root, ".gemini/GEMINI.md"),
          "SPLIT_RULE_CONSUMPTION_RECEIPT: Reply briefly.\n",
        );
        await createAgentExtensionsService(
          createAgentUserConfigFileService({
            createBackup: async () => undefined,
          }),
        ).write(
          path.join(root, ".gemini/config"),
          {
            agentId: "antigravity-cli",
            kind: "hooks",
            relativePath: "hooks.json",
          },
          JSON.stringify({
            "split-hook": {
              PreInvocation: [
                {
                  type: "command",
                  command: 'printf hook > "$HOME/split-hook-receipt"',
                },
              ],
            },
          }),
        );
        await updateAgentModelConfig(
          { agentId: "antigravity-cli", rootPath: configRoot, model: selected },
          { backupRoot: path.join(root, "backups") },
        );
        const result = await execute(
          command,
          [
            "--print",
            "Reply with OK only",
            "--print-timeout",
            "30s",
            "--log-file",
            path.join(root, "native.log"),
          ],
          {
            cwd: root,
            env: {
              PATH: process.env.PATH,
              HOME: root,
              USERPROFILE: root,
              CFFIXED_USER_HOME: root,
              GEMINI_API_KEY: PROVIDER_SECRET,
              GOOGLE_GEMINI_BASE_URL: gateway.endpoint,
              TERM: "dumb",
              NO_COLOR: "1",
            },
            timeout: PROVIDER_PROCESS_TIMEOUT_MS,
            maxBuffer: nativeCommandOutputBytes,
          },
        ).catch(async (error: unknown) => {
          const log = await fs.readFile(path.join(root!, "native.log"), "utf8");
          throw new Error(
            `${String(error)}\n${log
              .replaceAll(PROVIDER_SECRET, "[redacted]")
              .split("\n")
              .filter((line) => /model|custom|error|auth/i.test(line))
              .slice(-35)
              .join("\n")}\nRequest count: ${gateway.requests.length}`,
          );
        });
        const diagnostic = await fs
          .readFile(path.join(root, "native.log"), "utf8")
          .catch(() => "No native log");
        expect(
          result.stdout,
          JSON.stringify({
            stderr: result.stderr.replaceAll(PROVIDER_SECRET, "[redacted]"),
            requests: gateway.requests.map(
              ({ path, model, authenticated }) => ({
                path,
                model,
                authenticated,
              }),
            ),
            log: diagnostic
              .replaceAll(PROVIDER_SECRET, "[redacted]")
              .split("\n")
              .filter((line) => /error|model|gemini|auth|fail|warn/i.test(line))
              .slice(0, 40)
              .join("\n"),
          }),
        ).toContain(PROVIDER_REPLY);
        expect(gateway.requests).toContainEqual(
          expect.objectContaining({
            model: expect.stringMatching(/^gemini-3\.1-pro/),
            authenticated: true,
          }),
        );
        expect(
          await fs.readFile(path.join(root, "split-hook-receipt"), "utf8"),
        ).toBe("hook");
        const modelInput = JSON.stringify(
          gateway.requests.map((request) => request.body),
        );
        expect(modelInput).toContain("SPLIT_SKILL_DISCOVERY_RECEIPT");
        expect(modelInput).toContain("SPLIT_RULE_CONSUMPTION_RECEIPT");
      } finally {
        await gateway.close();
      }
    }, 60_000);

    it("agy discovers shared subagents and plugins, not the unused CLI staging directory", async () => {
      root = await fs.mkdtemp(path.join(os.tmpdir(), "prompthub-agy-assets-"));
      const command = await createNativeCommandRunner().resolve("agy");
      if (!command) throw new Error("Native acceptance requires agy CLI");
      const environment = {
        PATH: process.env.PATH,
        HOME: root,
        USERPROFILE: root,
        TERM: "dumb",
        NO_COLOR: "1",
      };
      const run = (args: string[]) =>
        execute(command, args, {
          cwd: root,
          env: environment,
          timeout: nativeCommandTimeoutMs,
          maxBuffer: nativeCommandOutputBytes,
        });
      const sharedRoot = path.join(root, ".gemini/config");
      const service = createAgentExtensionsService(
        createAgentUserConfigFileService({
          createBackup: async () => undefined,
        }),
      );
      const target = {
        agentId: "antigravity-cli",
        kind: "subagent" as const,
        relativePath: "agents/split-reviewer.md",
      };
      await service.write(
        sharedRoot,
        target,
        "---\nname: split-reviewer\ndescription: Isolated split acceptance reviewer\n---\nReview without making changes.\n",
      );
      const pluginRoot = path.join(
        root,
        ".gemini/antigravity-cli/plugins/split-cli",
      );
      const desktopPluginRoot = path.join(sharedRoot, "plugins/split-desktop");
      for (const [directory, name] of [
        [pluginRoot, "split-cli"],
        [desktopPluginRoot, "split-desktop"],
      ]) {
        await fs.mkdir(directory, { recursive: true });
        await fs.writeFile(
          path.join(directory, "plugin.json"),
          JSON.stringify({ name, description: "Isolated split acceptance" }),
        );
      }
      expect((await run(["agents"])).stdout).toContain("split-reviewer");
      const plugins = (await run(["plugin", "list", "--json"])).stdout;
      expect(plugins).toContain("split-desktop");
      expect(plugins).not.toContain("split-cli");
    });
  },
);
