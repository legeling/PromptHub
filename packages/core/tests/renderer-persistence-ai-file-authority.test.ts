import {
  rendererTestDatabase,
  closeRendererTestDatabases,
} from "./helpers/renderer-database";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createRendererPersistenceStore,
  type RendererPersistenceEncryption,
} from "../src/renderer-persistence-migration";

const roots: string[] = [];

const encryption: RendererPersistenceEncryption = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`encrypted:${value}`, "utf8"),
  decryptString: (value) => value.toString("utf8").replace(/^encrypted:/u, ""),
};

function createRoot(): string {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-ai-file-authority-"),
  );
  roots.push(root);
  return root;
}

function fileOwnedConfig() {
  return {
    kind: "prompthub-ai-config" as const,
    version: 1 as const,
    updatedAt: "2026-08-18T00:00:00.000Z",
    providers: [
      {
        id: "provider-file",
        provider: "openai",
        apiProtocol: "openai" as const,
        apiUrl: "https://api.example.test/v1",
        apiKey: "provider-file-secret",
      },
    ],
    models: [
      {
        id: "model-file",
        type: "chat" as const,
        providerId: "provider-file",
        provider: "openai",
        apiProtocol: "openai" as const,
        apiUrl: "https://api.example.test/v1",
        apiKey: "model-file-secret",
        model: "gpt-file",
        isDefault: true,
      },
    ],
    modelRouteDefaults: {
      mainText: "model-file",
      fastText: "model-file",
    },
  };
}

afterEach(() => {
  closeRendererTestDatabases();
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("renderer AI file authority", () => {
  it("preserves a populated file inventory over renderer default-empty arrays", async () => {
    const root = createRoot();
    const store = createRendererPersistenceStore({
      database: rendererTestDatabase(root),
      rootPath: root,
      encryption,
    });

    await store.migrate({
      settings: {
        state: {
          aiProviders: [],
          aiModels: [],
          modelRouteDefaults: {},
        },
      },
      legacyAIConfig: fileOwnedConfig(),
    });

    const hydrated = store.readHydratedStateSync();
    expect(hydrated.settings.aiProviders).toEqual([
      expect.objectContaining({
        id: "provider-file",
        apiKey: "provider-file-secret",
      }),
    ]);
    expect(hydrated.settings.aiModels).toEqual([
      expect.objectContaining({
        id: "model-file",
        model: "gpt-file",
        apiKey: "model-file-secret",
      }),
    ]);
    expect(hydrated.settings.modelRouteDefaults).toEqual({
      mainText: "model-file",
      fastText: "model-file",
    });

    expect(fs.existsSync(path.join(root, "config/providers.json"))).toBe(false);
    expect(fs.existsSync(path.join(root, "config/ai-models.json"))).toBe(false);
    const persisted = JSON.stringify(
      rendererTestDatabase(root).prepare("SELECT * FROM settings").all(),
    );
    expect(persisted).not.toContain("provider-file-secret");
    expect(persisted).not.toContain("model-file-secret");
  });

  it("keeps renderer arrays when the file inventory is empty", async () => {
    const root = createRoot();
    const store = createRendererPersistenceStore({
      database: rendererTestDatabase(root),
      rootPath: root,
      encryption,
    });

    await store.migrate({
      settings: {
        aiModels: [
          {
            ...fileOwnedConfig().models[0],
            id: "model-renderer",
            model: "gpt-renderer",
          },
        ],
      },
      legacyAIConfig: {
        ...fileOwnedConfig(),
        providers: [],
        models: [],
        modelRouteDefaults: {},
      },
    });

    expect(store.readHydratedStateSync().settings.aiModels).toEqual([
      expect.objectContaining({
        id: "model-renderer",
        model: "gpt-renderer",
      }),
    ]);
  });
});
