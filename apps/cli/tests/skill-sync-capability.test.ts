import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { closeDatabase, resetRuntimePaths, runCli } from "@prompthub/core";
import { makeTempRoot } from "./helpers/cli-harness";

describe("CLI binary Skill sync capability", () => {
  const roots: string[] = [];
  afterEach(() => {
    closeDatabase();
    resetRuntimePaths();
    vi.unstubAllGlobals();
    for (const root of roots.splice(0))
      fs.rmSync(root, { recursive: true, force: true });
  });
  it("refuses old servers before PUT and publishes bytes after a successful handshake", async () => {
    const root = makeTempRoot(roots);
    const source = path.join(root, "source");
    fs.mkdirSync(source);
    fs.writeFileSync(
      path.join(source, "SKILL.md"),
      "---\nname: binary-sync\ndescription: Binary sync fixture\n---\n# Skill",
    );
    fs.writeFileSync(path.join(source, "asset.bin"), Buffer.from([0, 255]));
    const invoke = async (args: string[]) => {
      const errors: string[] = [];
      const code = await runCli(
        ["--data-dir", path.join(root, "user-data"), ...args],
        { stdout: () => undefined, stderr: (text) => errors.push(text) },
      );
      return { code, errors: errors.join("\n") };
    };
    expect((await invoke(["skill", "install", source])).code).toBe(0);
    let capability: string | undefined;
    let written: unknown;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/manifest"))
        return new Response(
          JSON.stringify({ data: { skillSnapshotCapability: capability } }),
        );
      written = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ data: { ok: true } }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const command = [
      "sync",
      "push",
      "--endpoint",
      "https://sync.example.com",
      "--token",
      "test-token",
    ];
    const rejected = await invoke(command);
    expect(rejected.code).not.toBe(0);
    expect(rejected.errors).toMatch(/lossless Skill snapshots/);
    expect(written).toBeUndefined();
    capability = "2";
    expect((await invoke(command)).code).toBe(0);
    expect(JSON.stringify(written)).toContain('"encoding":"base64"');
    expect(JSON.stringify(written)).toContain('"content":"AP8="');
  }, 15_000);
});
