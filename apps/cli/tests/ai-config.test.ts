import fs from "fs";
import os from "os";
import path from "path";
import { PassThrough } from "stream";

import { afterEach, describe, expect, it, vi } from "vitest";

import { closeDatabase, runCli } from "@prompthub/core";

function makeTempRoot(tempDirs: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-cli-ai-"));
  tempDirs.push(dir);
  return dir;
}

function withDataDir(rootDir: string): string[] {
  return ["--data-dir", path.join(rootDir, "user-data")];
}

async function execCli(
  args: string[],
  ioOptions?: {
    stdin?: PassThrough;
    isInteractive?: boolean;
  },
) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = await runCli(args, {
    stdout: (message: string) => stdout.push(message),
    stderr: (message: string) => stderr.push(message),
    ...ioOptions,
  });

  const joinedStdout = stdout.join("\n");
  const joinedStderr = stderr.join("\n");

  return {
    exitCode,
    stdout,
    stderr,
    joinedStdout,
    joinedStderr,
    errorJson:
      joinedStderr.trim().startsWith("{") || joinedStderr.trim().startsWith("[")
        ? JSON.parse(joinedStderr)
        : undefined,
    json:
      joinedStdout.trim().startsWith("{") || joinedStdout.trim().startsWith("[")
        ? JSON.parse(joinedStdout)
        : undefined,
  };
}

describe("ai config cli", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    closeDatabase();
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("adds a provider, adds models under it, and sets desktop model routes", async () => {
    const root = makeTempRoot(tempDirs);
    const baseArgs = withDataDir(root);

    const providerRes = await execCli([
      ...baseArgs,
      "ai",
      "provider-add",
      "--provider",
      "openai",
      "--name",
      "OpenAI",
      "--protocol",
      "openai",
      "--api-key",
      "sk-test-secret",
      "--api-url",
      "https://api.openai.com/v1",
    ]);

    expect(providerRes.exitCode).toBe(0);
    expect(providerRes.json.provider).toBe("openai");
    expect(providerRes.json.apiKey).toBe("sk-t...cret");
    const providerId = providerRes.json.id as string;

    const chatModelRes = await execCli([
      ...baseArgs,
      "ai",
      "model-add",
      "--provider",
      providerId,
      "--model",
      "gpt-4.1",
      "--vision",
      "--reasoning",
    ]);
    expect(chatModelRes.exitCode).toBe(0);
    expect(chatModelRes.json.capabilities).toMatchObject({
      chat: true,
      vision: true,
      reasoning: true,
    });

    const imageModelRes = await execCli([
      ...baseArgs,
      "ai",
      "model-add",
      "--provider",
      providerId,
      "--model",
      "gpt-image-2",
      "--type",
      "image",
      "--image-generation",
    ]);
    expect(imageModelRes.exitCode).toBe(0);
    expect(imageModelRes.json.capabilities.imageGeneration).toBe(true);

    const visionRouteRes = await execCli([
      ...baseArgs,
      "ai",
      "route-set",
      "visionText",
      chatModelRes.json.id,
    ]);
    expect(visionRouteRes.exitCode).toBe(0);
    expect(visionRouteRes.json.modelRouteDefaults.visionText).toBe(
      chatModelRes.json.id,
    );

    const mainRouteRes = await execCli([
      ...baseArgs,
      "ai",
      "route-set",
      "mainText",
      "4.1",
    ]);
    expect(mainRouteRes.exitCode).toBe(0);
    expect(mainRouteRes.json.modelRouteDefaults.mainText).toBe(
      chatModelRes.json.id,
    );

    const imageRouteRes = await execCli([
      ...baseArgs,
      "ai",
      "route-set",
      "imageGeneration",
      imageModelRes.json.id,
    ]);
    expect(imageRouteRes.exitCode).toBe(0);
    expect(imageRouteRes.json.modelRouteDefaults.imageGeneration).toBe(
      imageModelRes.json.id,
    );

    const routesRes = await execCli([...baseArgs, "ai", "routes"]);
    expect(routesRes.exitCode).toBe(0);
    expect(routesRes.json).toMatchObject({
      visionText: { model: "gpt-4.1", configured: true },
      imageGeneration: { model: "gpt-image-2", configured: true },
    });

    const configPath = path.join(root, "user-data", "config", "ai-models.json");
    const saved = JSON.parse(fs.readFileSync(configPath, "utf8"));
    expect(saved.providers[0].apiKey).toBe("sk-test-secret");
    expect(saved.models[0]).toMatchObject({
      providerId,
      provider: "openai",
      model: "gpt-4.1",
    });
    expect(saved.modelRouteDefaults.visionText).toBe(chatModelRes.json.id);
  });

  it("selects a compatible route model interactively when model id is omitted", async () => {
    const root = makeTempRoot(tempDirs);
    const baseArgs = withDataDir(root);

    const providerRes = await execCli([
      ...baseArgs,
      "ai",
      "provider-add",
      "--provider",
      "openai",
      "--api-key",
      "sk-test-secret",
      "--api-url",
      "https://api.openai.com/v1",
    ]);

    const firstModelRes = await execCli([
      ...baseArgs,
      "ai",
      "model-add",
      "--provider",
      providerRes.json.id,
      "--model",
      "gpt-4o",
      "--vision",
    ]);
    expect(firstModelRes.exitCode).toBe(0);

    const secondModelRes = await execCli([
      ...baseArgs,
      "ai",
      "model-add",
      "--provider",
      providerRes.json.id,
      "--model",
      "gpt-4.1",
      "--vision",
    ]);
    expect(secondModelRes.exitCode).toBe(0);

    const stdin = new PassThrough();
    stdin.end("2\n");
    const routeRes = await execCli(
      [...baseArgs, "ai", "route-set", "visionText"],
      { stdin, isInteractive: true },
    );

    expect(routeRes.exitCode).toBe(0);
    expect(routeRes.joinedStderr).toContain("选择 visionText 路由模型");
    expect(routeRes.json.modelRouteDefaults.visionText).toBe(
      secondModelRes.json.id,
    );
  });

  it("rejects assigning a non-vision chat model to the vision route", async () => {
    const root = makeTempRoot(tempDirs);
    const baseArgs = withDataDir(root);

    const providerRes = await execCli([
      ...baseArgs,
      "ai",
      "provider-add",
      "--provider",
      "anthropic",
      "--protocol",
      "anthropic",
      "--api-key",
      "sk-ant-test",
      "--api-url",
      "https://api.anthropic.com",
    ]);
    const modelRes = await execCli([
      ...baseArgs,
      "ai",
      "model-add",
      "--provider",
      providerRes.json.id,
      "--model",
      "claude-sonnet-4-5",
    ]);

    const routeRes = await execCli([
      ...baseArgs,
      "ai",
      "route-set",
      "visionText",
      modelRes.json.id,
    ]);

    expect(routeRes.exitCode).toBe(4);
    expect(routeRes.errorJson.error.code).toBe("ROUTE_CAPABILITY_MISMATCH");
    expect(routeRes.errorJson.error.message).toContain("vision");
  });

  it("keeps providers when deleting a model", async () => {
    const root = makeTempRoot(tempDirs);
    const baseArgs = withDataDir(root);

    const providerRes = await execCli([
      ...baseArgs,
      "ai",
      "provider-add",
      "--provider",
      "openai-compatible",
      "--api-key",
      "secret",
      "--api-url",
      "https://example.test/v1",
    ]);
    const modelRes = await execCli([
      ...baseArgs,
      "ai",
      "model-add",
      "--provider",
      providerRes.json.id,
      "--model",
      "custom-chat",
    ]);

    const deleteRes = await execCli([
      ...baseArgs,
      "ai",
      "model-delete",
      modelRes.json.id,
    ]);
    expect(deleteRes.exitCode).toBe(0);

    const providersRes = await execCli([...baseArgs, "ai", "providers"]);
    expect(providersRes.exitCode).toBe(0);
    expect(providersRes.json).toHaveLength(1);
    expect(providersRes.json[0].id).toBe(providerRes.json.id);
  });
});
