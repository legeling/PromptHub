/** @vitest-environment node */
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { createAgentUsageService } from "../../../src/main/services/agent-usage-service";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});
async function fixture(): Promise<string> {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "claude-account-scope-"),
  );
  roots.push(root);
  return root;
}
function credentials(account: string): string {
  return JSON.stringify({
    claudeAiOauth: {
      accessToken: `fixture-${account}`,
      subscriptionType: account,
    },
  });
}
function serviceName(root: string): string {
  return `Claude Code-credentials-${createHash("sha256").update(root).digest("hex").slice(0, 8)}`;
}

it("queries the directory-scoped account and invalidates quota when the selected root changes", async () => {
  const home = await fixture();
  const first = path.join(home, "work");
  const second = path.join(home, "personal");
  for (const root of [first, second]) {
    await fs.mkdir(root);
    await fs.writeFile(path.join(root, "settings.json"), "{}");
  }
  let selected = first;
  const lookedUp: string[] = [];
  const requested: string[] = [];
  const service = createAgentUsageService({
    homeDir: home,
    environment: {},
    platform: "darwin",
    resolveConfigRoot: () => selected,
    commandRunner: {
      resolve: async () => "/fixture/security",
      run: async (_command, args) => {
        const name = args[args.indexOf("-s") + 1];
        lookedUp.push(name);
        const account =
          name === serviceName(first)
            ? "work"
            : name === serviceName(second)
              ? "personal"
              : "default";
        return { stdout: credentials(account), stderr: "" };
      },
    },
    fetchImpl: async (_url, init) => {
      const authorization = new Headers(init?.headers).get("Authorization");
      requested.push(authorization ?? "");
      return new Response(
        JSON.stringify({ five_hour: { utilization: 12, resets_at: null } }),
      );
    },
  });
  expect(await service.getUsage("claude")).toMatchObject({
    status: "ok",
    plan: "work",
  });
  expect(await service.getUsage("claude")).toMatchObject({ plan: "work" });
  selected = second;
  const result = await service.getUsage("claude");
  expect(result).toMatchObject({ status: "ok", plan: "personal" });
  expect(lookedUp).toEqual([serviceName(first), serviceName(second)]);
  expect(requested).toEqual(["Bearer fixture-work", "Bearer fixture-personal"]);
  expect(JSON.stringify(result)).not.toContain("fixture-personal");
});

it("uses only the selected directory's credential file after a scoped Keychain miss", async () => {
  const home = await fixture();
  const root = path.join(home, "custom");
  await fs.mkdir(root);
  await fs.writeFile(path.join(root, "settings.json"), "{}");
  await fs.writeFile(
    path.join(root, ".credentials.json"),
    credentials("custom-file"),
  );
  const lookedUp: string[] = [];
  const service = createAgentUsageService({
    homeDir: home,
    environment: {},
    platform: "darwin",
    resolveConfigRoot: () => root,
    commandRunner: {
      resolve: async () => "/fixture/security",
      run: async (_command, args) => {
        const name = args[args.indexOf("-s") + 1];
        lookedUp.push(name);
        if (name === "Claude Code-credentials")
          return { stdout: credentials("wrong-default"), stderr: "" };
        throw new Error("Scoped credentials missing");
      },
    },
    fetchImpl: async () => new Response("{}"),
  });
  expect(await service.getUsage("claude")).toMatchObject({
    status: "ok",
    plan: "custom-file",
  });
  expect(lookedUp).toEqual([serviceName(root)]);
  await fs.unlink(path.join(root, ".credentials.json"));
  expect(
    await service.getUsage("claude", { forceRefresh: true }),
  ).toMatchObject({ status: "no-credentials" });
  expect(await fs.readFile(path.join(root, "settings.json"), "utf8")).toBe(
    "{}",
  );
});

it("keeps the default unscoped account when CLAUDE_CONFIG_DIR is not selected", async () => {
  const home = await fixture();
  const root = path.join(home, ".claude");
  await fs.mkdir(root);
  await fs.writeFile(path.join(root, "settings.json"), "{}");
  const names: string[] = [];
  const service = createAgentUsageService({
    homeDir: home,
    environment: {},
    platform: "darwin",
    resolveConfigRoot: () => root,
    commandRunner: {
      resolve: async () => "/fixture/security",
      run: async (_command, args) => {
        names.push(args[args.indexOf("-s") + 1]);
        return { stdout: credentials("default"), stderr: "" };
      },
    },
    fetchImpl: async () => new Response("{}"),
  });
  expect(await service.getUsage("claude")).toMatchObject({ plan: "default" });
  expect(names).toEqual(["Claude Code-credentials"]);
});
