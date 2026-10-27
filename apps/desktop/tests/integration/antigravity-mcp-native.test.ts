/** @vitest-environment node */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CoreMcpLibraryService,
  configureRuntimePaths,
  getMcpTargetPresets,
  resetRuntimePaths,
} from "@prompthub/core";
import { createNativeCommandRunner } from "../../src/main/services/native-command";
import { createMcpTestStorage } from "../../../../packages/core/tests/helpers/mcp-storage";

const execute = promisify(execFile);
const nativeCommandTimeoutMs = 15_000;
const nativeCommandOutputBytes = 32_768;

// Uses only an isolated HOME and fixture configuration; no account or MCP network connection.
describe.skipIf(process.env.PROMPTHUB_NATIVE_AGENT_TESTS !== "1")(
  "Antigravity native MCP configuration (#220)",
  () => {
    let root: string;
    let storage: ReturnType<typeof createMcpTestStorage>;
    beforeEach(() => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), "issue-220-native-mcp-"));
      configureRuntimePaths({ userDataPath: path.join(root, "userdata") });
      storage = createMcpTestStorage();
    });
    afterEach(() => {
      storage.dispose();
      resetRuntimePaths();
      fs.rmSync(root, { recursive: true, force: true });
    });

    it("writes the native global config, survives reopen, is listed and disabled by agy, and removes only its own entries", async () => {
      const runner = createNativeCommandRunner();
      const command = await runner.resolve("agy");
      if (!command) throw new Error("Native acceptance requires agy CLI");
      const environment = {
        PATH: process.env.PATH,
        HOME: root,
        USERPROFILE: root,
        TMPDIR: process.env.TMPDIR,
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
      const preset = getMcpTargetPresets(
        root,
        process.platform,
        environment,
      ).find((entry) => entry.id === "antigravity-cli");
      if (!preset) throw new Error("Antigravity MCP preset is missing");
      expect(preset.path).toBe(
        path.join(root, ".gemini", "config", "mcp_config.json"),
      );
      const entries = {
        "issue-220-Remote.Docs": {
          serverUrl: "https://example.test/mcp",
          headers: { Authorization: "Bearer synthetic-token" },
          oauth: { clientId: "fixture-client", clientSecret: "fixture-secret" },
          disabledTools: ["delete_record"],
        },
        "issue-220-google": {
          serverUrl: "https://example.test/google-mcp",
          authProviderType: "google_credentials",
        },
        "issue-220-local": {
          command: "node",
          args: ["fixture.js"],
          cwd: root,
          env: { MODE: "fixture" },
        },
      };
      const source = path.join(root, "input.json");
      fs.writeFileSync(source, JSON.stringify({ mcpServers: entries }));
      const service = new CoreMcpLibraryService(storage.options);
      const imported = service.importFromFile(source).imported;
      expect(imported.map((server) => server.name).sort()).toEqual(
        Object.keys(entries).sort(),
      );
      const unrelated = { command: "node", args: ["unrelated.js"] };
      fs.mkdirSync(path.dirname(preset.path), { recursive: true });
      fs.writeFileSync(
        preset.path,
        JSON.stringify({
          mcpServers: { unrelated },
        }),
      );
      const reopened = new CoreMcpLibraryService(storage.options);
      const target = {
        target: preset.target,
        scope: preset.scope,
        path: preset.path,
        serverIds: imported.map((server) => server.id),
      };
      const applied = reopened.apply(target);
      expect(applied.content).not.toContain("fixture-secret");
      expect(applied.content).not.toContain("synthetic-token");
      expect(JSON.parse(fs.readFileSync(preset.path, "utf8"))).toEqual({
        mcpServers: { unrelated, ...entries },
      });
      const listed = (await run(["mcp", "list"])).stdout;
      expect(listed).toMatch(
        /issue-220-Remote\.Docs\s+http\s+enabled\s+https:\/\/example\.test\/mcp/,
      );
      expect(listed).toMatch(/issue-220-google\s+http\s+enabled/);
      expect(listed).toMatch(
        /issue-220-local\s+stdio\s+enabled\s+node fixture\.js/,
      );
      const status = reopened.getTargetStatus([preset])[0];
      expect(status.serverNames.sort()).toEqual(
        [...Object.keys(entries), "unrelated"].sort(),
      );
      expect(
        status.servers?.find(
          (server) => server.name === "issue-220-Remote.Docs",
        ),
      ).toMatchObject({ disabledTools: ["delete_record"], enabled: true });
      expect(JSON.stringify(status)).not.toContain("fixture-secret");
      await run(["mcp", "disable", "issue-220-Remote.Docs"]);
      const disabled = reopened
        .getTargetStatus([preset])[0]
        .servers?.find((server) => server.name === "issue-220-Remote.Docs");
      expect(disabled?.enabled).toBe(false);
      expect((await run(["mcp", "list"])).stdout).toMatch(
        /issue-220-Remote\.Docs\s+http\s+disabled/,
      );
      expect(
        JSON.parse(fs.readFileSync(preset.path, "utf8")).mcpServers[
          "issue-220-Remote.Docs"
        ],
      ).toEqual({ ...entries["issue-220-Remote.Docs"], disabled: true });
      reopened.removeFromTarget(target);
      expect(JSON.parse(fs.readFileSync(preset.path, "utf8"))).toEqual({
        mcpServers: { unrelated },
      });
      const removed = (await run(["mcp", "list"])).stdout;
      expect(removed).not.toContain("issue-220-");
      expect(removed).toContain("unrelated");
    }, 60_000);
  },
);
