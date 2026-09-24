import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createRendererPersistenceStore,
  readRendererPersistenceMigrationMarker,
  resolveOwnedPath,
  type RendererPersistenceEncryption,
} from "../src/renderer-persistence-migration";

const roots: string[] = [];

function createRoot(): string {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-renderer-state-"),
  );
  roots.push(root);
  return root;
}

const encryption: RendererPersistenceEncryption = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`encrypted:${value}`, "utf8"),
  decryptString: (value) => {
    const decoded = value.toString("utf8");
    if (!decoded.startsWith("encrypted:")) throw new Error("bad ciphertext");
    return decoded.slice("encrypted:".length);
  },
};

function persisted(state: Record<string, unknown>): string {
  return JSON.stringify({ state, version: 19 });
}

function enforceWindowsFsyncWriteAccess(): void {
  const descriptorFlags = new Map<number, string | number>();
  const openSync = fs.openSync.bind(fs);
  const closeSync = fs.closeSync.bind(fs);
  const fsyncSync = fs.fsyncSync.bind(fs);

  vi.spyOn(fs, "openSync").mockImplementation((filePath, flags, mode) => {
    const descriptor = openSync(filePath, flags, mode);
    descriptorFlags.set(descriptor, flags);
    return descriptor;
  });
  vi.spyOn(fs, "closeSync").mockImplementation((descriptor) => {
    descriptorFlags.delete(descriptor);
    closeSync(descriptor);
  });
  vi.spyOn(fs, "fsyncSync").mockImplementation((descriptor) => {
    if (descriptorFlags.get(descriptor) === "r") {
      const error = new Error(
        "EPERM: operation not permitted, fsync",
      ) as NodeJS.ErrnoException;
      error.code = "EPERM";
      throw error;
    }
    fsyncSync(descriptor);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("renderer persistence migration", () => {
  it("flushes staged canonical files through Windows write-capable handles", async () => {
    enforceWindowsFsyncWriteAccess();
    const store = createRendererPersistenceStore({
      rootPath: createRoot(),
      encryption,
    });

    await expect(store.migrate({})).resolves.toMatchObject({
      status: "migrated",
    });
  });

  it("moves durable settings, sources, device identity, recovery paths, and secrets to canonical owners", async () => {
    const root = createRoot();
    const store = createRendererPersistenceStore({
      rootPath: root,
      encryption,
    });

    const result = await store.migrate({
      settings: persisted({
        language: "zh",
        themeMode: "dark",
        webdavEnabled: true,
        webdavUrl: "https://dav.example.test/root",
        webdavUsername: "alice",
        webdavPassword: "dav-secret",
        aiApiKey: "root-ai-secret",
        aiProviders: [
          {
            id: "provider-1",
            provider: "openai",
            apiProtocol: "openai",
            apiUrl: "https://api.example.test/v1",
            apiKey: "provider-secret",
          },
        ],
        aiModels: [
          {
            id: "model-1",
            type: "chat",
            provider: "openai",
            apiProtocol: "openai",
            apiUrl: "https://api.example.test/v1",
            apiKey: "model-secret",
            model: "gpt-test",
          },
        ],
        networkProxy: {
          mode: "manual",
          protocol: "http",
          host: "127.0.0.1",
          port: 7890,
          username: "proxy-user",
          password: "proxy-secret",
          bypass: "localhost",
        },
        githubToken: "github-secret",
        unknownSecret: "must-not-persist",
      }),
      skillStore: persisted({
        customStoreSources: [
          {
            id: "source-shared",
            name: "Shared",
            type: "git-repo",
            url: "https://github.com/example/skills.git",
            branch: "main",
            enabled: true,
            order: 0,
            createdAt: 1,
          },
        ],
      }),
      mcpStore: persisted({
        customStoreSources: [
          {
            id: "source-shared",
            name: "Shared MCP",
            type: "marketplace-json",
            url: "https://example.test/mcp.json",
            enabled: true,
            order: 0,
            createdAt: 2,
          },
        ],
      }),
      pluginStore: persisted({ customStoreSources: [] }),
      selfHostedDeviceId: "desktop-device-1",
      recoveryPaths: JSON.stringify(["/safe/recovery", "/safe/recovery"]),
      indexedDbMigrationDone: "1",
    });

    expect(result.status).toBe("migrated");
    expect(result.redactLegacyKeys).toEqual(
      expect.arrayContaining([
        "prompthub-settings",
        "skill-store",
        "mcp-store",
        "plugin-store",
        "prompthub-self-hosted-device-id",
        "prompthub-manual-recovery-paths",
        "prompthub:idb-migration-done",
      ]),
    );

    const allFiles = fs
      .readdirSync(root, { recursive: true, encoding: "utf8" })
      .filter((entry) => fs.statSync(path.join(root, entry)).isFile());
    const storedBytes = allFiles
      .map((entry) => fs.readFileSync(path.join(root, entry), "utf8"))
      .join("\n");
    for (const secret of [
      "dav-secret",
      "root-ai-secret",
      "provider-secret",
      "model-secret",
      "proxy-secret",
      "github-secret",
      "must-not-persist",
    ]) {
      expect(storedBytes).not.toContain(secret);
    }

    const restored = await store.readHydratedState();
    expect(restored.settings).toMatchObject({
      language: "zh",
      themeMode: "dark",
      webdavEnabled: true,
      webdavUsername: "alice",
      webdavPassword: "dav-secret",
      aiApiKey: "root-ai-secret",
      githubToken: "github-secret",
      networkProxy: {
        mode: "manual",
        host: "127.0.0.1",
        username: "proxy-user",
        password: "proxy-secret",
      },
    });
    expect(restored.settings.aiProviders).toEqual([
      expect.objectContaining({ id: "provider-1", apiKey: "provider-secret" }),
    ]);
    expect(restored.settings.aiModels).toEqual([
      expect.objectContaining({ id: "model-1", apiKey: "model-secret" }),
    ]);
    expect(restored.marketplaceSources.skill).toHaveLength(1);
    expect(restored.marketplaceSources.mcp).toHaveLength(1);
    expect(restored.recoveryPaths).toEqual(["/safe/recovery"]);
    expect(restored.selfHostedDeviceId).toBe("desktop-device-1");
    expect(restored.indexedDbMigrationDone).toBe(true);
  });

  it("survives an empty renderer snapshot after browser storage is cleared", async () => {
    const root = createRoot();
    const store = createRendererPersistenceStore({
      rootPath: root,
      encryption,
    });
    await store.migrate({
      settings: persisted({ language: "ja", s3SecretAccessKey: "secret" }),
      skillStore: persisted({ customStoreSources: [] }),
      selfHostedDeviceId: "desktop-device-2",
    });

    const rerun = await store.migrate({});
    expect(rerun.status).toBe("already-complete");
    const restored = await store.readHydratedState();
    expect(restored.settings.language).toBe("ja");
    expect(restored.settings.s3SecretAccessKey).toBe("secret");
    expect(restored.selfHostedDeviceId).toBe("desktop-device-2");
  });

  it("imports and redacts the legacy AI config when renderer storage has no provider copy", async () => {
    const root = createRoot();
    const store = createRendererPersistenceStore({
      rootPath: root,
      encryption,
    });
    await store.migrate({
      settings: persisted({ language: "en" }),
      legacyAIConfig: {
        kind: "prompthub-ai-config",
        version: 1,
        updatedAt: "2026-08-11T00:00:00.000Z",
        providers: [
          {
            id: "legacy-provider",
            provider: "openai",
            apiProtocol: "openai",
            apiUrl: "https://api.example.test/v1",
            apiKey: "legacy-provider-secret",
          },
        ],
        models: [],
        modelRouteDefaults: {},
      },
    });

    expect((await store.readHydratedState()).settings.aiProviders).toEqual([
      expect.objectContaining({
        id: "legacy-provider",
        apiKey: "legacy-provider-secret",
      }),
    ]);
    const legacyConfig = fs.readFileSync(
      path.join(root, "config", "ai-models.json"),
      "utf8",
    );
    expect(legacyConfig).not.toContain("legacy-provider-secret");
    expect(JSON.parse(legacyConfig).providers[0].apiKey).toBe("");
  });

  it("fails closed on malformed sources without publishing a completion marker", async () => {
    const root = createRoot();
    const store = createRendererPersistenceStore({
      rootPath: root,
      encryption,
    });

    await expect(
      store.migrate({
        skillStore: persisted({
          customStoreSources: [
            {
              id: "../escape",
              name: "Unsafe",
              type: "local-dir",
              url: "/tmp/source",
            },
          ],
        }),
      }),
    ).rejects.toThrow(/source|invalid|unsafe/iu);

    expect(
      fs.existsSync(
        path.join(
          root,
          "data",
          "operations",
          "migrations",
          "renderer-persistence-v1.json",
        ),
      ),
    ).toBe(false);
    expect(
      fs.existsSync(path.join(root, "config", "marketplace-sources.json")),
    ).toBe(false);
  });

  it("rolls back every canonical file when publication fails", async () => {
    const root = createRoot();
    const appConfigPath = path.join(root, "config", "app.json");
    fs.mkdirSync(path.dirname(appConfigPath), { recursive: true });
    fs.writeFileSync(appConfigPath, "previous-app-config\n", "utf8");
    const store = createRendererPersistenceStore({
      rootPath: root,
      encryption,
      failPublicationAt: "config/marketplace-sources.json",
    });

    await expect(
      store.migrate({
        settings: persisted({ language: "fr" }),
        skillStore: persisted({ customStoreSources: [] }),
      }),
    ).rejects.toThrow(/injected|publication/iu);

    expect(fs.readFileSync(appConfigPath, "utf8")).toBe(
      "previous-app-config\n",
    );
    expect(fs.existsSync(path.join(root, "secrets", "vault.enc"))).toBe(false);
    expect(
      fs.existsSync(
        path.join(
          root,
          "data",
          "operations",
          "migrations",
          "renderer-persistence-v1.json",
        ),
      ),
    ).toBe(false);
  });

  it("moves the IndexedDB completion marker outside renderer storage", async () => {
    const root = createRoot();
    const store = createRendererPersistenceStore({
      rootPath: root,
      encryption,
    });
    await store.migrate({ settings: persisted({ language: "en" }), indexedDbMigrationDone: "1" });

    expect(await store.isIndexedDbMigrationDone()).toBe(false);
    await store.markIndexedDbMigrationDone();
    expect(await store.isIndexedDbMigrationDone()).toBe(true);
    expect((await store.readHydratedState()).indexedDbMigrationDone).toBe(true);
  });

  it("keeps canonical settings, sources, recovery paths, and device identity current", async () => {
    const root = createRoot();
    const store = createRendererPersistenceStore({
      rootPath: root,
      encryption,
    });
    await store.migrate({ settings: persisted({ language: "en" }) });

    await store.replaceSettings({ language: "de", githubToken: "next-token" });
    await store.replaceMarketplaceSources("plugin", [
      {
        id: "plugin-source",
        name: "Plugins",
        type: "marketplace-json",
        url: "https://example.test/plugins.json",
        enabled: true,
        order: 0,
        createdAt: 1,
      },
    ]);
    await store.replaceRecoveryPaths(["/recovery/one", "/recovery/one"]);
    const firstDeviceId = await store.getOrCreateSelfHostedDeviceId();
    const secondDeviceId = await store.getOrCreateSelfHostedDeviceId();

    const restored = await store.readHydratedState();
    expect(restored.settings).toMatchObject({
      language: "de",
      githubToken: "next-token",
    });
    expect(restored.marketplaceSources.plugin).toHaveLength(1);
    expect(restored.recoveryPaths).toEqual(["/recovery/one"]);
    expect(firstDeviceId).toMatch(/^desktop-/u);
    expect(secondDeviceId).toBe(firstDeviceId);
    expect(
      fs.readFileSync(path.join(root, "secrets", "vault.enc"), "utf8"),
    ).not.toContain("next-token");
  });

  it("normalizes direct state, agent device settings, and all marketplace source types", async () => {
    const root = createRoot();
    const store = createRendererPersistenceStore({
      rootPath: root,
      encryption,
      now: () => new Date("2026-08-12T00:00:00.000Z"),
    });
    await store.migrate({
      settings: {
        language: "en",
        aiProviders: [],
        aiModels: [],
        modelRouteDefaults: { chat: "model-1" },
        builtinAgentOverrides: { codex: { enabled: true } },
        customAgents: [],
        disabledPlatformIds: ["claude"],
        agentIdentityPreferences: {
          codex: { name: "codex", icon: "chatgpt" },
        },
        networkProxy: { mode: "system" },
      },
      legacyAIConfig: {
        providers: [],
        models: [],
        modelRouteDefaults: {},
      },
      skillStore: {
        customStoreSources: [
          {
            id: "local-source",
            name: " Local ",
            type: "local-dir",
            url: "/tmp/local-source",
            directory: "nested\\skills",
            enabled: false,
            order: 9999,
            createdAt: -1,
          },
          {
            id: "git-source",
            name: "Git",
            type: "git-repo",
            url: "https://example.test/repo.git",
          },
        ],
      },
      selfHostedDeviceId: "",
      recoveryPaths: ["/one", "/two"],
    });

    const state = store.readHydratedStateSync();
    expect(state.settings).toMatchObject({
      modelRouteDefaults: { chat: "model-1" },
      builtinAgentOverrides: { codex: {} },
      disabledPlatformIds: ["claude"],
      agentIdentityPreferences: {
        codex: { name: "codex", icon: "chatgpt" },
      },
    });
    expect(state.marketplaceSources.skill).toEqual([
      expect.objectContaining({
        name: "Local",
        directory: "nested/skills",
        enabled: false,
        order: 0,
        createdAt: 0,
      }),
      expect.objectContaining({
        id: "git-source",
        enabled: true,
        order: 1,
        createdAt: 0,
      }),
    ]);
    expect(state.selfHostedDeviceId).toBeNull();
    expect(readRendererPersistenceMigrationMarker(root)?.completedAt).toBe(
      "2026-08-12T00:00:00.000Z",
    );

    fs.rmSync(path.join(root, "config", "devices", "agents.json"));
    const withoutAgents = store.readHydratedStateSync();
    expect(withoutAgents.settings.builtinAgentOverrides).toBeUndefined();
  });

  it("rejects malformed snapshots, settings, providers, recovery paths, and devices", async () => {
    const cases: Array<{
      input: Record<string, unknown>;
      pattern: RegExp;
    }> = [
      { input: { settings: "{" }, pattern: /Invalid renderer settings/ },
      {
        input: { settings: { language: () => "en" } },
        pattern: /Invalid renderer setting language/,
      },
      {
        input: { settings: { aiProviders: {} } },
        pattern: /Invalid AI provider collection/,
      },
      {
        input: { settings: { aiModels: new Array(513).fill({}) } },
        pattern: /Invalid AI model collection/,
      },
      {
        input: { settings: { aiProviders: [{ id: "../provider" }] } },
        pattern: /Invalid renderer provider id/,
      },
      {
        input: { recoveryPaths: {} },
        pattern: /Invalid renderer recovery path registry/,
      },
      {
        input: { recoveryPaths: new Array(129).fill("/recovery") },
        pattern: /Invalid renderer recovery path registry/,
      },
      {
        input: { recoveryPaths: ["relative/path"] },
        pattern: /Invalid renderer recovery path/,
      },
      {
        input: { recoveryPaths: ["/safe\0unsafe"] },
        pattern: /Invalid renderer recovery path/,
      },
      {
        input: { selfHostedDeviceId: "../device" },
        pattern: /Invalid renderer device id/,
      },
    ];
    for (const [index, testCase] of cases.entries()) {
      const root = createRoot();
      const store = createRendererPersistenceStore({
        rootPath: root,
        encryption,
      });
      await expect(store.migrate(testCase.input)).rejects.toThrow(
        testCase.pattern,
      );
      expect(readRendererPersistenceMigrationMarker(root)).toBeNull();
      expect(index).toBeGreaterThanOrEqual(0);
    }

    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const circularStore = createRendererPersistenceStore({
      rootPath: createRoot(),
      encryption,
    });
    await expect(circularStore.migrate({ settings: circular })).rejects.toThrow(
      /Invalid renderer persistence snapshot/,
    );

    const largeStore = createRendererPersistenceStore({
      rootPath: createRoot(),
      encryption,
    });
    await expect(
      largeStore.migrate({
        settings: { language: "x".repeat(8 * 1024 * 1024) },
      }),
    ).rejects.toThrow(/snapshot exceeds byte limit/);
  });

  it("rejects duplicate, oversized, malformed, and unsafe marketplace sources", async () => {
    const valid = {
      id: "source-1",
      name: "Source",
      type: "marketplace-json",
      url: "https://example.test/source.json",
    };
    const invalidCollections: Array<unknown> = [
      {},
      new Array(513).fill(valid),
      [valid, valid],
      [{ ...valid, type: "unknown" }],
      [{ ...valid, name: "" }],
      [{ ...valid, url: "not a url" }],
      [{ ...valid, url: "ftp://example.test/file" }],
      [{ ...valid, url: "https://user:pass@example.test/file" }],
      [{ ...valid, type: "local-dir", url: "relative/path" }],
      [{ ...valid, type: "local-dir", url: "/safe\0unsafe" }],
      [{ ...valid, branch: "bad\nbranch" }],
      [{ ...valid, directory: "/absolute" }],
      [{ ...valid, directory: "nested//empty" }],
      [{ ...valid, directory: "nested/../escape" }],
    ];
    for (const collection of invalidCollections) {
      const root = createRoot();
      const store = createRendererPersistenceStore({
        rootPath: root,
        encryption,
      });
      await expect(
        store.migrate({
          skillStore: { customStoreSources: collection },
        }),
      ).rejects.toThrow(/source|marketplace|unsafe|invalid/iu);
    }

    const noSources = createRendererPersistenceStore({
      rootPath: createRoot(),
      encryption,
    });
    await noSources.migrate({ skillStore: {} });
    expect(
      (await noSources.readHydratedState()).marketplaceSources.skill,
    ).toEqual([]);
  });

  it("requires encryption for secrets and fails closed on corrupt vaults and references", async () => {
    const unavailable: RendererPersistenceEncryption = {
      ...encryption,
      isEncryptionAvailable: () => false,
    };
    const root = createRoot();
    const store = createRendererPersistenceStore({
      rootPath: root,
      encryption: unavailable,
    });
    await expect(
      store.migrate({ settings: persisted({ githubToken: "secret" }) }),
    ).rejects.toThrow("RENDERER_SECRET_VAULT_UNAVAILABLE");
    await expect(
      store.migrate({ settings: persisted({ language: "en" }) }),
    ).resolves.toMatchObject({
      status: "migrated",
    });

    const corruptCases: Array<{
      mutate(rootPath: string): void;
      encryption?: RendererPersistenceEncryption;
      pattern: RegExp;
    }> = [
      {
        mutate(rootPath) {
          const vaultPath = path.join(rootPath, "secrets", "vault.enc");
          const vault = JSON.parse(fs.readFileSync(vaultPath, "utf8"));
          vault.kind = "wrong-vault";
          fs.writeFileSync(vaultPath, JSON.stringify(vault));
        },
        pattern: /Invalid renderer secret vault/,
      },
      {
        mutate(rootPath) {
          const vaultPath = path.join(rootPath, "secrets", "vault.enc");
          const vault = JSON.parse(fs.readFileSync(vaultPath, "utf8"));
          vault.secrets["renderer:githubToken"] = 123;
          fs.writeFileSync(vaultPath, JSON.stringify(vault));
        },
        pattern: /Invalid renderer secret vault/,
      },
      {
        mutate() {},
        encryption: unavailable,
        pattern: /RENDERER_SECRET_VAULT_UNAVAILABLE/,
      },
      {
        mutate(rootPath) {
          const appPath = path.join(rootPath, "config", "app.json");
          const app = JSON.parse(fs.readFileSync(appPath, "utf8"));
          app.secretRefs.githubToken = 123;
          fs.writeFileSync(appPath, JSON.stringify(app));
        },
        pattern: /Invalid renderer secret reference/,
      },
      {
        mutate(rootPath) {
          const appPath = path.join(rootPath, "config", "app.json");
          const app = JSON.parse(fs.readFileSync(appPath, "utf8"));
          app.secretRefs.githubToken = "renderer:missing";
          fs.writeFileSync(appPath, JSON.stringify(app));
        },
        pattern: /Missing renderer secret/,
      },
      {
        mutate(rootPath) {
          const providersPath = path.join(rootPath, "config", "providers.json");
          const providers = JSON.parse(fs.readFileSync(providersPath, "utf8"));
          providers.providers[0].apiKeyRef = "renderer:missing";
          fs.writeFileSync(providersPath, JSON.stringify(providers));
        },
        pattern: /Missing renderer secret/,
      },
      {
        mutate(rootPath) {
          const appPath = path.join(rootPath, "config", "app.json");
          const app = JSON.parse(fs.readFileSync(appPath, "utf8"));
          app.settings.networkProxy.usernameRef = "renderer:missing";
          fs.writeFileSync(appPath, JSON.stringify(app));
        },
        pattern: /Missing renderer secret/,
      },
    ];
    for (const corruptCase of corruptCases) {
      const caseRoot = createRoot();
      const initial = createRendererPersistenceStore({
        rootPath: caseRoot,
        encryption,
      });
      await initial.migrate({
        settings: persisted({
          githubToken: "secret",
          aiProviders: [{ id: "provider-1", apiKey: "provider-secret" }],
          networkProxy: { mode: "manual", username: "proxy-user" },
        }),
      });
      corruptCase.mutate(caseRoot);
      const reader = createRendererPersistenceStore({
        rootPath: caseRoot,
        encryption: corruptCase.encryption ?? encryption,
      });
      expect(() => reader.readHydratedStateSync()).toThrow(corruptCase.pattern);
    }
  });

  it("rejects unsafe canonical files, unsupported versions, and invalid markers", async () => {
    const invalidFileRoot = createRoot();
    const invalidFileStore = createRendererPersistenceStore({
      rootPath: invalidFileRoot,
      encryption,
    });
    await invalidFileStore.migrate({});
    const appPath = path.join(invalidFileRoot, "config", "app.json");
    fs.rmSync(appPath);
    fs.mkdirSync(appPath);
    expect(() => invalidFileStore.readHydratedStateSync()).toThrow(
      /Invalid renderer persistence file/,
    );

    const versionRoot = createRoot();
    const versionStore = createRendererPersistenceStore({
      rootPath: versionRoot,
      encryption,
    });
    await versionStore.migrate({});
    const versionAppPath = path.join(versionRoot, "config", "app.json");
    const app = JSON.parse(fs.readFileSync(versionAppPath, "utf8"));
    app.version = 2;
    fs.writeFileSync(versionAppPath, JSON.stringify(app));
    expect(() => versionStore.readHydratedStateSync()).toThrow(/Unsupported/);

    const agentRoot = createRoot();
    const agentStore = createRendererPersistenceStore({
      rootPath: agentRoot,
      encryption,
    });
    await agentStore.migrate({});
    const agentPath = path.join(agentRoot, "config", "devices", "agents.json");
    fs.rmSync(agentPath);
    fs.mkdirSync(agentPath);
    expect(() => agentStore.readHydratedStateSync()).toThrow(
      /Invalid renderer persistence file/,
    );

    const markerFields: Array<[string, unknown]> = [
      ["kind", "wrong"],
      ["version", 2],
      ["state", "pending"],
      ["completedAt", 1],
      ["indexedDbMigrationDone", "yes"],
    ];
    for (const [field, value] of markerFields) {
      const markerRoot = createRoot();
      const markerStore = createRendererPersistenceStore({
        rootPath: markerRoot,
        encryption,
      });
      await markerStore.migrate({});
      const markerPath = path.join(
        markerRoot,
        "data",
        "operations",
        "migrations",
        "renderer-persistence-v1.json",
      );
      const marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));
      marker[field] = value;
      fs.writeFileSync(markerPath, JSON.stringify(marker));
      expect(() => readRendererPersistenceMigrationMarker(markerRoot)).toThrow(
        /Invalid renderer persistence migration marker/,
      );
    }

    const invalidJsonRoot = createRoot();
    const invalidJsonStore = createRendererPersistenceStore({
      rootPath: invalidJsonRoot,
      encryption,
    });
    await invalidJsonStore.migrate({});
    fs.writeFileSync(path.join(invalidJsonRoot, "config", "app.json"), "{");
    expect(() => invalidJsonStore.readHydratedStateSync()).toThrow(
      /Invalid renderer config\/app.json/,
    );
  });

  it("blocks symlinked publication targets and restores settings after replacement failure", async () => {
    if (process.platform !== "win32") {
      const parentRoot = createRoot();
      const outside = createRoot();
      fs.symlinkSync(outside, path.join(parentRoot, "config"));
      const parentStore = createRendererPersistenceStore({
        rootPath: parentRoot,
        encryption,
      });
      await expect(parentStore.migrate({})).rejects.toThrow(
        /Unsafe renderer persistence target/,
      );

      const targetRoot = createRoot();
      const targetOutside = path.join(createRoot(), "app.json");
      fs.writeFileSync(targetOutside, "outside");
      fs.mkdirSync(path.join(targetRoot, "config"));
      fs.symlinkSync(
        targetOutside,
        path.join(targetRoot, "config", "app.json"),
      );
      const targetStore = createRendererPersistenceStore({
        rootPath: targetRoot,
        encryption,
      });
      await expect(targetStore.migrate({})).rejects.toThrow(
        /Unsafe renderer persistence target/,
      );
    }

    const root = createRoot();
    const initial = createRendererPersistenceStore({
      rootPath: root,
      encryption,
    });
    await initial.migrate({ settings: persisted({ language: "en" }) });
    const failing = createRendererPersistenceStore({
      rootPath: root,
      encryption,
      failPublicationAt: "config/providers.json",
    });
    await expect(
      failing.replaceSettings({ language: "fr", githubToken: "new-secret" }),
    ).rejects.toThrow(/publication failure/);
    expect((await initial.readHydratedState()).settings.language).toBe("en");
  });

  it("handles IndexedDB marker preconditions, idempotence, verification, and atomic failure", async () => {
    const incomplete = createRendererPersistenceStore({
      rootPath: createRoot(),
      encryption,
    });
    await expect(incomplete.markIndexedDbMigrationDone()).rejects.toThrow(
      "RENDERER_PERSISTENCE_MIGRATION_INCOMPLETE",
    );
    expect(await incomplete.isIndexedDbMigrationDone()).toBe(false);

    const root = createRoot();
    const store = createRendererPersistenceStore({
      rootPath: root,
      encryption,
    });
    await store.migrate({});
    await store.markIndexedDbMigrationDone();
    await expect(store.markIndexedDbMigrationDone()).resolves.toBeUndefined();

    const verifyRoot = createRoot();
    const verifyStore = createRendererPersistenceStore({
      rootPath: verifyRoot,
      encryption,
    });
    await verifyStore.migrate({});
    const originalRename = fs.renameSync.bind(fs);
    vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
      const result = originalRename(from, to);
      if (String(to).endsWith("renderer-persistence-v1.json")) {
        const marker = JSON.parse(fs.readFileSync(String(to), "utf8"));
        marker.indexedDbMigrationDone = false;
        fs.writeFileSync(String(to), JSON.stringify(marker));
      }
      return result;
    });
    await expect(verifyStore.markIndexedDbMigrationDone()).rejects.toThrow(
      "INDEXEDDB_MIGRATION_MARKER_VERIFY_FAILED",
    );
    vi.restoreAllMocks();

    const atomicRoot = createRoot();
    const atomicStore = createRendererPersistenceStore({
      rootPath: atomicRoot,
      encryption,
    });
    await atomicStore.migrate({});
    vi.spyOn(fs, "renameSync").mockImplementation(() => {
      throw new Error("atomic rename failed");
    });
    await expect(atomicStore.markIndexedDbMigrationDone()).rejects.toThrow(
      "atomic rename failed",
    );
    expect(
      fs
        .readdirSync(path.join(atomicRoot, "data", "operations", "migrations"))
        .some((entry) => entry.endsWith(".tmp")),
    ).toBe(false);
  });

  it("hydrates pre-migration and partially missing renderer documents safely", async () => {
    const root = createRoot();
    const store = createRendererPersistenceStore({
      rootPath: root,
      encryption,
    });
    expect(store.readHydratedStateSync()).toEqual({
      migrationComplete: false,
      settings: { aiProviders: [], aiModels: [] },
      marketplaceSources: { skill: [], mcp: [], plugin: [] },
      recoveryPaths: [],
      selfHostedDeviceId: null,
      indexedDbMigrationDone: false,
    });
    const createdDeviceId = await store.getOrCreateSelfHostedDeviceId();
    expect(createdDeviceId).toMatch(/^desktop-/u);
    expect(await store.getOrCreateSelfHostedDeviceId()).toBe(createdDeviceId);

    const migratedRoot = createRoot();
    const migrated = createRendererPersistenceStore({
      rootPath: migratedRoot,
      encryption,
    });
    await migrated.migrate({ settings: persisted({ language: "en" }) });
    const devicesPath = path.join(
      migratedRoot,
      "config",
      "devices",
      "renderer.json",
    );
    const devices = JSON.parse(fs.readFileSync(devicesPath, "utf8"));
    devices.selfHostedDeviceId = 123;
    fs.writeFileSync(devicesPath, JSON.stringify(devices));
    const providersPath = path.join(migratedRoot, "config", "providers.json");
    const providers = JSON.parse(fs.readFileSync(providersPath, "utf8"));
    providers.providers = {};
    providers.models = null;
    fs.writeFileSync(providersPath, JSON.stringify(providers));
    const recoveryPath = path.join(
      migratedRoot,
      "config",
      "recovery-paths.json",
    );
    const recovery = JSON.parse(fs.readFileSync(recoveryPath, "utf8"));
    recovery.paths = ["/valid", 123, null];
    fs.writeFileSync(recoveryPath, JSON.stringify(recovery));

    const hydrated = migrated.readHydratedStateSync();
    expect(hydrated.selfHostedDeviceId).toBeNull();
    expect(hydrated.settings.aiProviders).toEqual([]);
    expect(hydrated.settings.aiModels).toEqual([]);
    expect(hydrated.recoveryPaths).toEqual(["/valid"]);

    await migrated.markIndexedDbMigrationDone();
    await migrated.replaceSettings({ language: "fr" });
    expect((await migrated.readHydratedState()).indexedDbMigrationDone).toBe(
      true,
    );

    expect(() => resolveOwnedPath(root, "../escape")).toThrow(
      /path escapes root/,
    );
  });

  it("keeps local Agent identity stable without provisioning sync identity", async () => {
    const root = createRoot();
    const store = createRendererPersistenceStore({
      rootPath: root,
      encryption,
    });
    await store.migrate({
      settings: persisted({
        agentIdentityPreferences: {
          codex: { name: "codex", icon: "codex" },
        },
      }),
      selfHostedDeviceId: null,
    });
    const agentPath = path.join(root, "config", "devices", "agents.json");
    const rendererPath = path.join(root, "config", "devices", "renderer.json");
    const initialAgentId = JSON.parse(
      fs.readFileSync(agentPath, "utf8"),
    ).deviceId;

    expect(initialAgentId).toMatch(/^device-[a-f0-9]{32}$/u);
    expect(
      JSON.parse(fs.readFileSync(rendererPath, "utf8")).selfHostedDeviceId,
    ).toBeNull();

    const legacyAgentDocument = JSON.parse(fs.readFileSync(agentPath, "utf8"));
    legacyAgentDocument.deviceId = "desktop-legacy-agent";
    fs.writeFileSync(agentPath, JSON.stringify(legacyAgentDocument), "utf8");
    expect(
      store.readHydratedStateSync().settings.agentIdentityPreferences,
    ).toEqual({ codex: { name: "codex", icon: "codex" } });

    await store.replaceSettings({
      ...store.readHydratedStateSync().settings,
      language: "zh",
    });
    expect(JSON.parse(fs.readFileSync(agentPath, "utf8")).deviceId).toBe(
      initialAgentId,
    );

    const syncDeviceId = await store.getOrCreateSelfHostedDeviceId();
    expect(syncDeviceId).toMatch(/^desktop-/u);
    expect(JSON.parse(fs.readFileSync(agentPath, "utf8")).deviceId).toBe(
      initialAgentId,
    );
    expect(
      store.readHydratedStateSync().settings.agentIdentityPreferences,
    ).toEqual({ codex: { name: "codex", icon: "codex" } });
  });
});
