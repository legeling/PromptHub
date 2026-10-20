import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { parse } from "smol-toml";
import { CodexPluginService } from "../src/codex-plugins/service";
import { createCodexPluginRunner } from "../src/codex-plugins/runtime";
import { writeCodexPluginEnabled } from "../src/codex-plugins/config-rpc";
import {
  AGENT_CLI_MUTATION_OUTPUT_BYTES,
  AGENT_CLI_MUTATION_TIMEOUT_MS,
} from "../src/agent-native-command-policy";

it.skipIf(process.env.PROMPTHUB_NATIVE_AGENT_TESTS !== "1")(
  "native install, update while disabled, reopen, enable, uninstall and concurrent config protection",
  async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-codex-native-"),
    );
    const home = path.join(root, "home");
    const market = path.join(root, "market");
    const source = path.join(market, "probe");
    const pluginId = "probe@prompthub-native-test";
    const runner = createCodexPluginRunner();
    const command = await runner.resolve("codex");
    if (!command) throw new Error("Native Codex runtime required");
    const environment = { ...process.env, CODEX_HOME: home };
    const backups: Array<string | null> = [];
    const options = {
      root: home,
      environment,
      backupConfig: async (content: string | null) => {
        backups.push(content);
      },
    };
    const service = new CodexPluginService(options);
    const run = (args: string[]) =>
      runner.run(command, ["plugin", ...args], {
        env: environment,
        cwd: root,
        timeout: AGENT_CLI_MUTATION_TIMEOUT_MS,
        maxBuffer: AGENT_CLI_MUTATION_OUTPUT_BYTES,
      });
    try {
      fs.mkdirSync(home);
      fs.mkdirSync(path.join(market, ".agents/plugins"), { recursive: true });
      fs.mkdirSync(path.join(source, "skills/probe"), { recursive: true });
      fs.writeFileSync(
        path.join(home, "config.toml"),
        '# retained comment\nmodel = "fixture-model"\n',
      );
      const manifest = (version: string) =>
        JSON.stringify({
          $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
          name: "probe",
          version,
          description: "Harmless acceptance fixture",
        });
      fs.writeFileSync(path.join(source, "plugin.json"), manifest("1.0.0"));
      fs.writeFileSync(
        path.join(source, "skills/probe/SKILL.md"),
        "---\nname: probe\ndescription: Local test fixture\n---\nReturn probe.\n",
      );
      fs.writeFileSync(
        path.join(market, ".agents/plugins/marketplace.json"),
        JSON.stringify({
          name: "prompthub-native-test",
          plugins: [
            {
              name: "probe",
              source: { source: "local", path: "./probe" },
              policy: { installation: "AVAILABLE", authentication: "ON_USE" },
              category: "Testing",
            },
          ],
        }),
      );
      await run(["marketplace", "add", market]);
      await run(["add", pluginId]);
      expect(await service.list()).toEqual([
        expect.objectContaining({ pluginId, enabled: true, version: "1.0.0" }),
      ]);
      await service.mutate({ pluginId, operation: "disable" });
      fs.writeFileSync(path.join(source, "plugin.json"), manifest("2.0.0"));
      const updated = await service.mutate({ pluginId, operation: "update" });
      expect(updated).toEqual([
        expect.objectContaining({ pluginId, enabled: false, version: "2.0.0" }),
      ]);
      expect(
        fs.existsSync(
          path.join(updated[0].sourcePath!, "skills/probe/SKILL.md"),
        ),
      ).toBe(true);
      expect(await new CodexPluginService(options).list()).toEqual(updated);
      const originalConfig = fs.readFileSync(
        path.join(home, "config.toml"),
        "utf8",
      );
      fs.appendFileSync(
        path.join(home, "config.toml"),
        "\n# concurrent edit\n",
      );
      await expect(
        writeCodexPluginEnabled({
          command,
          root: home,
          environment,
          pluginId,
          enabled: true,
          originalConfig,
        }),
      ).rejects.toThrow("config-conflict");
      expect((await service.list())[0].enabled).toBe(false);
      await service.mutate({ pluginId, operation: "enable" });
      expect(
        await service.mutate({ pluginId, operation: "uninstall" }),
      ).toEqual([]);
      const config = fs.readFileSync(path.join(home, "config.toml"), "utf8");
      expect(parse(config).model).toBe("fixture-model");
      expect(config).toContain("# retained comment");
      expect(config).toContain("# concurrent edit");
      expect(backups).toHaveLength(4);
      await run(["marketplace", "remove", "prompthub-native-test"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
  AGENT_CLI_MUTATION_TIMEOUT_MS,
);
