import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse } from "jsonc-parser";
import { afterEach, describe, expect, it } from "vitest";

import { importCurrentPiProvider } from "../../../src/main/services/agent-pi-current-provider-import";
import { inspectAgentModelConfig } from "../../../src/main/services/agent-model-config";

const temporaryRoots: string[] = [];

async function createRoot(): Promise<string> {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "prompthub-pi-current-"),
  );
  temporaryRoots.push(root);
  await fs.mkdir(path.join(root, "backups"));
  return root;
}

async function writeJson(root: string, name: string, value: unknown) {
  await fs.writeFile(path.join(root, name), JSON.stringify(value, null, 2));
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("Pi current provider import", () => {
  it("creates a same-id override while preserving built-in models and auth", async () => {
    const root = await createRoot();
    await writeJson(root, "settings.json", {
      defaultProvider: "kimi-coding",
      defaultModel: "k3",
    });
    await writeJson(root, "models-store.json", {
      "kimi-coding": {
        models: [
          {
            id: "k3",
            api: "anthropic-messages",
            baseUrl: "https://api.kimi.com/coding?cache=1",
          },
        ],
      },
    });
    await writeJson(root, "models.json", { providers: {} });
    const auth = '{"kimi-coding":{"type":"api_key","key":"private"}}';
    await fs.writeFile(path.join(root, "auth.json"), auth);

    const result = await importCurrentPiProvider(root, {
      backupRoot: path.join(root, "backups"),
    });

    expect(result.backupPath).toEqual(expect.any(String));
    const models = parse(
      await fs.readFile(path.join(root, "models.json"), "utf8"),
    );
    expect(models.providers["kimi-coding"]).toEqual({
      modelOverrides: { k3: {} },
    });
    expect(await fs.readFile(path.join(root, "auth.json"), "utf8")).toBe(auth);
    const config = await inspectAgentModelConfig({
      agentId: "pi",
      rootPath: root,
    });
    expect(config.modelCatalog?.[0]).toMatchObject({
      id: "kimi-coding",
      source: "custom",
      credentialReady: true,
      models: [expect.objectContaining({ id: "k3", source: "built-in" })],
    });
  });

  it("rejects missing, custom and stale current providers before writing", async () => {
    const root = await createRoot();
    const modelsPath = path.join(root, "models.json");
    await writeJson(root, "settings.json", {});
    await expect(
      importCurrentPiProvider(root, { backupRoot: path.join(root, "backups") }),
    ).rejects.toThrow("AGENT_PI_CURRENT_PROVIDER_MISSING");

    await writeJson(root, "settings.json", { defaultProvider: "built-in" });
    await expect(
      importCurrentPiProvider(root, { backupRoot: path.join(root, "backups") }),
    ).rejects.toThrow("AGENT_PI_CURRENT_MODEL_MISSING");

    await writeJson(root, "settings.json", {
      defaultProvider: "missing",
      defaultModel: "m",
    });
    await expect(
      importCurrentPiProvider(root, { backupRoot: path.join(root, "backups") }),
    ).rejects.toThrow("AGENT_PI_PROVIDER_NOT_FOUND");

    await writeJson(root, "settings.json", {
      defaultProvider: "custom",
      defaultModel: "m",
    });
    await writeJson(root, "models.json", {
      providers: {
        custom: {
          baseUrl: "https://custom.example/v1",
          api: "openai-responses",
          models: [{ id: "m" }],
        },
      },
    });
    const original = await fs.readFile(modelsPath, "utf8");
    await expect(
      importCurrentPiProvider(root, { backupRoot: path.join(root, "backups") }),
    ).rejects.toThrow("AGENT_PI_PROVIDER_EXISTS");

    await writeJson(root, "settings.json", {
      defaultProvider: "built-in",
      defaultModel: "missing",
    });
    await writeJson(root, "models-store.json", {
      "built-in": { models: [{ id: "m" }] },
    });
    await fs.writeFile(modelsPath, original);
    await expect(
      importCurrentPiProvider(root, { backupRoot: path.join(root, "backups") }),
    ).rejects.toThrow("AGENT_PI_MODEL_NOT_FOUND");
    expect(await fs.readFile(modelsPath, "utf8")).toBe(original);

    await writeJson(root, "settings.json", {
      defaultProvider: "Bad Provider",
      defaultModel: "m",
    });
    await writeJson(root, "models-store.json", {
      "Bad Provider": {
        models: [{ id: "m", baseUrl: "https://safe.example/v1" }],
      },
    });
    await expect(
      importCurrentPiProvider(root, { backupRoot: path.join(root, "backups") }),
    ).rejects.toThrow("AGENT_PI_PROVIDER_ID_INVALID");
    expect(await fs.readFile(modelsPath, "utf8")).toBe(original);
  });

  it("does not overwrite an external concurrent change", async () => {
    const root = await createRoot();
    const modelsPath = path.join(root, "models.json");
    await writeJson(root, "settings.json", {
      defaultProvider: "deepseek",
      defaultModel: "deepseek-chat",
    });
    await writeJson(root, "models-store.json", {
      deepseek: {
        models: [
          {
            id: "deepseek-chat",
            baseUrl: "https://api.deepseek.com",
          },
        ],
      },
    });

    await expect(
      importCurrentPiProvider(root, {
        backupRoot: path.join(root, "backups"),
        hooks: {
          beforeWrite: () => fs.writeFile(modelsPath, '{"external":true}'),
        },
      }),
    ).rejects.toThrow("AGENT_MODEL_CONFIG_CONCURRENT_CHANGE");
    expect(await fs.readFile(modelsPath, "utf8")).toBe('{"external":true}');
  });
});
