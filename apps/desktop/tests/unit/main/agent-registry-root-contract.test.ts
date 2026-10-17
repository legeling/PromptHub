/** @vitest-environment node */
import path from "node:path";
import { expect, it } from "vitest";
import { AGENT_DEFINITIONS } from "@prompthub/shared/constants/agent-definitions";
import { getPlatformMcpRelativePath } from "@prompthub/shared/constants/platforms";
import { getDefaultPlatformRootDir } from "@prompthub/core/platform-paths";
import { resolveAgentPlatformRoot } from "@prompthub/core/agent-management/agent-inventory";
import { getMcpTargetPresets } from "@prompthub/core/mcp-target-presets";
import { createAgentUsageService } from "../../../src/main/services/agent-usage-service";

const home = "/fixture/home";

it.each(
  AGENT_DEFINITIONS.map(({ platform }) => [platform.id, platform] as const),
)(
  "%s preserves explicit root precedence across core discovery and presets",
  async (id, platform) => {
    const root = `/fixture/selected/${id}`;
    const environment = {
      HOME: home,
      [platform.rootEnvironmentVariable || "UNUSED"]: "/fixture/environment",
    };
    expect(
      getDefaultPlatformRootDir(platform, "darwin", environment, home, root),
    ).toBe(root);
    expect(
      await resolveAgentPlatformRoot(
        platform,
        { rootPath: root },
        { environment },
      ),
    ).toBe(root);
    const preset = getMcpTargetPresets(home, "darwin", environment, {
      [id]: { rootPath: root, mcpRelativePath: "selected-mcp.json" },
    }).find((p) => p.id === id);
    if (preset) expect(preset.path).toBe(path.join(root, "selected-mcp.json"));
  },
);

it.each(
  AGENT_DEFINITIONS.filter(
    ({ platform }) => platform.rootEnvironmentVariable,
  ).map(({ platform }) => [platform.id, platform] as const),
)(
  "%s uses the same environment root across core discovery and MCP",
  async (id, platform) => {
    const environment = {
      HOME: home,
      [platform.rootEnvironmentVariable!]: "/fixture/environment",
    };
    const root = await resolveAgentPlatformRoot(platform, undefined, {
      environment,
    });
    expect(
      getDefaultPlatformRootDir(platform, "darwin", environment, home),
    ).toBe(root);
    const preset = getMcpTargetPresets(home, "darwin", environment).find(
      (p) => p.id === id,
    );
    const relativePath = getPlatformMcpRelativePath(platform, true);
    if (preset && relativePath)
      expect(preset.path).toBe(path.join(root, relativePath));
  },
);

it("preserves Qwen's declared relative environment-root contract", async () => {
  const platform = AGENT_DEFINITIONS.find(
    (d) => d.platform.id === "qwen",
  )!.platform;
  const environment = { HOME: home, QWEN_HOME: "relative-qwen" };
  const expected = path.resolve("relative-qwen");
  expect(getDefaultPlatformRootDir(platform, "darwin", environment, home)).toBe(
    expected,
  );
  expect(
    await resolveAgentPlatformRoot(platform, undefined, { environment }),
  ).toBe(expected);
  expect(
    getMcpTargetPresets(home, "darwin", environment).find(
      (p) => p.id === "qwen",
    )?.path,
  ).toBe(path.join(expected, "settings.json"));
});

it("does not move separate application targets with an Agent root", () => {
  const overrides = Object.fromEntries(
    AGENT_DEFINITIONS.map(({ platform }) => [
      platform.id,
      { rootPath: `/selected/${platform.id}` },
    ]),
  );
  const before = getMcpTargetPresets(home, "darwin", {});
  const after = getMcpTargetPresets(home, "darwin", {}, overrides);
  for (const id of ["claude-desktop", "vscode"]) {
    expect(before.some((p) => p.id === id)).toBe(true);
    expect(after.find((p) => p.id === id)).toEqual(
      before.find((p) => p.id === id),
    );
  }
});

it("scopes Codex quota cache and its read to the captured selected root", async () => {
  let root = "/fixture/account-a";
  const reads: string[] = [];
  const service = createAgentUsageService({
    resolveConfigRoot: () => root,
    pathExists: async () => true,
    readFile: async (file) => {
      reads.push(file);
      return file.endsWith("config.toml")
        ? ""
        : JSON.stringify({ tokens: { access_token: path.dirname(file) } });
    },
    fetchImpl: async (_url, init) =>
      new Response(
        JSON.stringify({
          plan_type: new Headers(init?.headers).get("Authorization"),
        }),
      ),
  });
  expect((await service.getUsage("codex")).plan).toBe(
    "Bearer /fixture/account-a",
  );
  const count = reads.length;
  await service.getUsage("codex");
  expect(reads).toHaveLength(count);
  root = "/fixture/account-b";
  expect((await service.getUsage("codex")).plan).toBe(
    "Bearer /fixture/account-b",
  );
  expect(reads).toContain("/fixture/account-b/auth.json");
});
