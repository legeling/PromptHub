/** @vitest-environment node */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";
import { getPlatformById } from "@prompthub/shared/constants/platforms";
import { resolveAgentPlatformRoot } from "@prompthub/core/agent-management/agent-inventory";
import { getDefaultPlatformRootDir } from "@prompthub/core/platform-paths";
import { getMcpTargetPresets } from "@prompthub/core/mcp-target-presets";
import { createAgentUsageService } from "../../../src/main/services/agent-usage-service";
import { createKimiSessionAdapter } from "../../../src/main/services/agent-session-kimi";
import { createAgentTerminalLauncher } from "../../../src/main/services/agent-terminal-launcher";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

it("uses current Kimi roots across inventory and MCP and never detects the legacy root", async () => {
  const platform = getPlatformById("kimi");
  if (!platform) throw new Error("Missing Kimi");
  const home = "/fixture/home";
  const environment = { HOME: home, KIMI_SHARE_DIR: "/fixture/legacy" };
  expect(
    await resolveAgentPlatformRoot(platform, undefined, {
      environment,
      pathExists: async (value) => value.endsWith(".kimi"),
    }),
  ).toBe(home + "/.kimi-code");
  for (const [env, override, expected] of [
    [{}, {}, home + "/.kimi-code"],
    [{ KIMI_CODE_HOME: "/fixture/environment" }, {}, "/fixture/environment"],
    [
      { KIMI_CODE_HOME: "/fixture/environment" },
      { rootPath: "/fixture/selected" },
      "/fixture/selected",
    ],
  ] as const) {
    const presets = getMcpTargetPresets(home, "darwin", env, {
      kimi: override,
    });
    expect(presets.find((p) => p.id === "kimi")?.path).toBe(
      expected + "/mcp.json",
    );
    expect(
      await resolveAgentPlatformRoot(platform, override, {
        environment: { HOME: home, ...env },
        pathExists: async () => false,
      }),
    ).toBe(expected);
  }
});

it("uses the OpenCode XDG config root across inventory, assets and MCP, with explicit override priority", async () => {
  const platform = getPlatformById("opencode");
  if (!platform) throw new Error("Missing OpenCode");
  const env = { HOME: "/fixture/home", XDG_CONFIG_HOME: "/fixture/config" };
  expect(
    await resolveAgentPlatformRoot(platform, undefined, { environment: env }),
  ).toBe("/fixture/config/opencode");
  expect(getDefaultPlatformRootDir(platform, "darwin", env, env.HOME)).toBe(
    "/fixture/config/opencode",
  );
  expect(
    getMcpTargetPresets(env.HOME, "darwin", env).find(
      (p) => p.id === "opencode",
    )?.path,
  ).toBe("/fixture/config/opencode/opencode.json");
  expect(
    await resolveAgentPlatformRoot(
      platform,
      { rootPath: "/fixture/selected" },
      { environment: env },
    ),
  ).toBe("/fixture/selected");
  expect(
    getDefaultPlatformRootDir(
      platform,
      "darwin",
      env,
      env.HOME,
      "/fixture/selected",
    ),
  ).toBe("/fixture/selected");
});

it("isolates Kimi quota caching by selected account root while retaining same-root caching", async () => {
  let selected = "/fixture/account-a";
  const calls: string[] = [];
  const service = createAgentUsageService({
    resolveConfigRoot: () => selected,
    pathExists: async () => true,
    kimiOAuthTokenService: {
      getAccessToken: async (root) => {
        calls.push(root);
        return { kind: "ok", accessToken: root };
      },
    },
    fetchImpl: async (_url, init) =>
      new Response(
        JSON.stringify({
          user: {
            membership: {
              level: new Headers(init?.headers).get("Authorization"),
            },
          },
        }),
      ),
  });
  expect((await service.getUsage("kimi")).plan).toBe(
    "Bearer /fixture/account-a",
  );
  await service.getUsage("kimi");
  expect(calls).toEqual(["/fixture/account-a"]);
  selected = "/fixture/account-b";
  expect((await service.getUsage("kimi")).plan).toBe(
    "Bearer /fixture/account-b",
  );
  expect(calls).toEqual(["/fixture/account-a", "/fixture/account-b"]);
});

it("executes Kimi resume with the selected root even if the parent shell uses another root", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kimi-scope-"));
  roots.push(root);
  const selected = path.join(root, "selected ' account");
  const sessionDir = path.join(selected, "sessions", "fixture-session");
  await fs.mkdir(path.join(sessionDir, "agents", "main"), { recursive: true });
  await fs.writeFile(
    path.join(selected, "session_index.jsonl"),
    JSON.stringify({
      sessionId: "fixture-session",
      sessionDir,
      workDir: root,
    }) + "\n",
  );
  await fs.writeFile(
    path.join(sessionDir, "state.json"),
    JSON.stringify({ title: "Fixture", lastPrompt: "Hello", workDir: root }),
  );
  await fs.writeFile(
    path.join(sessionDir, "agents", "main", "wire.jsonl"),
    "{}\n",
  );
  const result = await createKimiSessionAdapter(selected).list(10);
  expect(result.sessions).toHaveLength(1);
  const command = result.sessions[0].resume;
  if (!command) throw new Error("Missing resume");
  const binary = path.join(root, "fake-kimi");
  await fs.writeFile(
    binary,
    '#!/bin/sh\nprintf "%s\\n" "$KIMI_CODE_HOME" "$@"\n',
    { mode: 0o700 },
  );
  let output = "";
  const launcher = createAgentTerminalLauncher({
    platform: "darwin",
    tempRoot: path.join(root, "launch"),
    scheduleCleanup: () => undefined,
    openPath: async (script) => {
      output = (
        await promisify(execFile)("/bin/sh", [script], {
          env: { PATH: "/usr/bin:/bin", KIMI_CODE_HOME: "/fixture/wrong" },
          timeout: 5000,
        })
      ).stdout;
      return "";
    },
  });
  await launcher.launch({ ...command, executable: binary });
  expect(output.trim().split("\n")).toEqual([
    selected,
    "--session",
    "fixture-session",
  ]);
  expect(await fs.readdir(path.join(root, "launch"))).toEqual([]);
});
