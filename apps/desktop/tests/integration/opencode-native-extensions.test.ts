import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { createSkillTestRuntime } from "./helpers/skill-runtime";
import { createAgentExtensionsService } from "@prompthub/core/agent-management/agent-extensions";
import { createAgentUserConfigFileService } from "@prompthub/core/agent-management/agent-user-config-files";
import { registerAgentExtensionIPC } from "../../src/main/ipc/agent-extension.ipc";
import { getDatabase } from "../../src/main/database";
import { agentApi } from "../../src/preload/api/agent";

const execute = promisify(execFile);
const NATIVE_TIMEOUT_MS = 30_000;
const NATIVE_OUTPUT_BYTES = 256 * 1024;

it.skipIf(!process.env.PROMPTHUB_OPENCODE_BINARY)(
  "OpenCode reads edited native subagents and stops discovering deleted files",
  async () => {
    const runtime = await createSkillTestRuntime();
    try {
      registerAgentExtensionIPC(
        getDatabase(),
        createAgentExtensionsService(
          createAgentUserConfigFileService({
            createBackup: async () => undefined,
          }),
        ),
      );
      const home = path.join(runtime.root, "native-home");
      const project = path.join(runtime.root, "project");
      await fs.mkdir(home);
      await fs.mkdir(project);
      getDatabase()
        .prepare("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)")
        .run(
          "skillProjects",
          JSON.stringify([
            {
              id: "fixture",
              name: "Fixture",
              rootPath: project,
              scanPaths: [],
              createdAt: 1,
              updatedAt: 1,
            },
          ]),
        );
      const env = {
        PATH: process.env.PATH,
        HOME: home,
        USERPROFILE: home,
        CFFIXED_USER_HOME: home,
        XDG_CONFIG_HOME: path.join(home, ".config"),
        XDG_DATA_HOME: path.join(home, ".local/share"),
        XDG_CACHE_HOME: path.join(home, ".cache"),
        XDG_STATE_HOME: path.join(home, ".local/state"),
      };
      const run = async (args: string[]): Promise<string> =>
        (
          await execute(
            process.env.PROMPTHUB_OPENCODE_BINARY!,
            [...args, "--pure"],
            {
              cwd: project,
              env,
              timeout: NATIVE_TIMEOUT_MS,
              maxBuffer: NATIVE_OUTPUT_BYTES,
            },
          )
        ).stdout;
      const request = {
        agentId: "opencode",
        scope: "project" as const,
        projectId: "fixture",
        kind: "subagent" as const,
        relativePath: "agents/prompthub-fixture.md",
      };
      const body =
        "---\ndescription: PromptHub native fixture\nmode: subagent\npermission:\n  edit: deny\n---\nPROMPTHUB_NATIVE_SUBAGENT\n";
      const created = await agentApi.writeAgentExtension({
        ...request,
        content: body,
      });
      const first = await run(["debug", "agent", "prompthub-fixture"]);
      expect(first).toContain("PROMPTHUB_NATIVE_SUBAGENT");
      expect(first).toContain('"mode": "subagent"');
      const edited = await agentApi.writeAgentExtension({
        ...request,
        content: body.replace(
          "PROMPTHUB_NATIVE_SUBAGENT",
          "PROMPTHUB_EDITED_SUBAGENT",
        ),
        expectedRevision: created.revision,
      });
      expect(await run(["debug", "agent", "prompthub-fixture"])).toContain(
        "PROMPTHUB_EDITED_SUBAGENT",
      );
      await agentApi.deleteAgentExtension({
        ...request,
        expectedRevision: edited.revision!,
      });
      expect(await run(["agent", "list"])).not.toContain("prompthub-fixture");
    } finally {
      runtime.dispose();
    }
  },
  NATIVE_TIMEOUT_MS * 4,
);
