import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  AgentProviderProfileDB,
  DatabaseAdapter,
  PromptDB,
  SCHEMA,
} from "@prompthub/db";
import { CoreSettingsStore } from "@prompthub/core/settings-store";
import { CoreMcpLibraryService } from "@prompthub/core/mcp-library";
import {
  migrateRendererAuxiliaryState,
  readRendererAuxiliaryState,
  writeRendererAuxiliaryState,
} from "@prompthub/core/renderer-auxiliary-state";
import { resolveRuntimeStorageContext } from "@prompthub/core/runtime-storage-context";
import { configureRuntimePaths } from "@prompthub/core/runtime-paths";
import { SkillStorageDB } from "@prompthub/core/skill-storage";
import {
  RuleStorageDB,
  getRuleManagedPath,
  type RuleStorageGraph,
} from "@prompthub/core/rule-storage";
import { hashContent } from "@prompthub/core/rules-workspace-support";
import { publishSqliteEntries } from "@prompthub/core/sqlite-entry-publication";
import { GenerationStorage } from "@prompthub/core/generation-storage";
import { PluginStorage } from "@prompthub/core/plugin-storage";
import { emptyPluginInventory } from "@prompthub/core/plugin-library/shared";
import { createDesktopSyncWorkspace } from "@prompthub/core/causal-sync/desktop-workspace";

export function syncProfile(
  rootPath: string,
  endpoint: string,
  provider: "webdav" | "s3",
  encrypted: boolean,
) {
  fs.mkdirSync(rootPath, { recursive: true });
  const database = new DatabaseAdapter(path.join(rootPath, "profile.sqlite"));
  database.exec(SCHEMA);
  database.exec(
    "CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)",
  );
  database.pragma("foreign_keys = ON");
  const keys = new Map<string, Buffer>();
  const masterKeyStore = {
    read: (id: string) => keys.get(id) ?? null,
    write: (id: string, key: Buffer) => {
      keys.set(id, Buffer.from(key));
    },
  };
  const settings = new CoreSettingsStore({
    database,
    rootPath,
    masterKeyStore,
  });
  settings.patchSettings({
    language: "en",
    webdavUrl: endpoint,
    webdavUsername: "fixture",
    webdavPassword: "fixture",
    s3Endpoint: endpoint,
    s3Region: "us-east-1",
    s3Bucket: "fixture",
    s3AccessKeyId: "fixture",
    s3SecretAccessKey: "fixture",
    s3BackupPrefix: "test",
    [`${provider}EncryptionEnabled`]: encrypted,
    [`${provider}EncryptionPassword`]: "fixture-encryption-password",
  });
  migrateRendererAuxiliaryState(database, rootPath);
  const mcp = new CoreMcpLibraryService({
    database,
    storageContext: resolveRuntimeStorageContext(rootPath),
    masterKeyStore,
  });
  return {
    database,
    rootPath,
    settings,
    mcp,
    masterKeyStore,
    prompts: new PromptDB(database),
    workspace: createDesktopSyncWorkspace(database, rootPath, settings),
  };
}

export function seedSyncProfile(profile: ReturnType<typeof syncProfile>): void {
  const { database, rootPath, settings, mcp } = profile,
    at = "2026-10-16T00:00:00.000Z",
    bytes = Buffer.from([0, 128, 255]);
  const prompt = profile.prompts.create({
    title: "Sync Prompt",
    userPrompt: "source prompt",
  });
  configureRuntimePaths({ userDataPath: rootPath });
  const skill = new SkillStorageDB(database).create({
    name: "sync-skill",
    description: "fixture",
    protocol_type: "skill",
    is_favorite: false,
    content: "---\nname: sync-skill\ndescription: fixture\n---\nInstructions",
  });
  if (!skill.local_repo_path) throw new Error("Missing fixture Skill package");
  fs.writeFileSync(path.join(skill.local_repo_path, "binary.dat"), bytes);
  const context = {
      rootPath,
      rulesRoot: path.join(rootPath, "data", "rule-files"),
      ownerUserId: "",
    },
    content = "# Synced rule";
  const rule: RuleStorageGraph["rule"] = {
    id: "project:shared",
    scope: "project",
    platformId: "workspace",
    platformName: "Shared",
    platformIcon: "Folder",
    platformDescription: "Project",
    canonicalFileName: "AGENTS.md",
    description: "fixture",
    managedPath: "",
    targetPath: "",
    syncStatus: "target-missing",
    currentVersion: 1,
    contentHash: hashContent(content),
    createdAt: at,
    updatedAt: at,
  };
  rule.managedPath = getRuleManagedPath(rule, context.rulesRoot);
  const rules = new RuleStorageDB(database, context).preparePublication([
    {
      rule,
      content,
      versions: [
        { id: "rule-version", savedAt: at, source: "create", content },
      ],
    },
  ]);
  publishSqliteEntries(database, {
    rootPath,
    operationKey: "fixture-rule",
    ...rules,
  });
  mcp.createServer({
    name: "sync-server",
    command: "node",
    env: { TOKEN: "device-only-test-secret" },
  });
  const packagePath = path.join(rootPath, "plugin-input");
  fs.mkdirSync(packagePath);
  fs.writeFileSync(path.join(packagePath, "binary.dat"), bytes);
  new PluginStorage(database, rootPath).write(
    [
      {
        id: "sync-plugin",
        name: "sync-plugin",
        displayName: "Plugin",
        classification: "bundle",
        trustLevel: "custom",
        inventory: emptyPluginInventory(),
        source: { kind: "local", url: packagePath },
        localPackagePath: packagePath,
        installedAt: Date.parse(at),
        updatedAt: Date.parse(at),
      },
    ],
    [],
  );
  new AgentProviderProfileDB(database).createProfileWithMappings(
    {
      name: "Provider",
      platformId: "codex",
      providerKind: "openai",
      protocol: "openai-responses",
      config: {},
      source: "manual",
      secretRef: "local-provider-reference",
    },
    [{ routeKey: "primary", modelId: "model", parameters: {} }],
  );
  new GenerationStorage(database, rootPath).save(
    {
      kind: "prompthub-generation-batch",
      version: 1,
      id: "generation",
      title: "Image",
      status: "succeeded",
      resolvedPrompt: "sea",
      sourcePromptId: prompt.id,
      model: { id: "model", provider: "openai", model: "image" },
      parameters: {},
      targetCount: 1,
      slots: [
        {
          index: 0,
          status: "succeeded",
          output: {
            id: "output",
            slotIndex: 0,
            fileName: "image.png",
            mimeType: "image/png",
            byteSize: bytes.length,
            sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
            favorite: true,
            createdAt: at,
          },
        },
      ],
      counts: {
        total: 1,
        pending: 0,
        running: 0,
        succeeded: 1,
        failed: 0,
        cancelled: 0,
        interrupted: 0,
      },
      createdAt: at,
      updatedAt: at,
      completedAt: at,
    },
    { fileName: "image.png", bytes },
  );
  const auxiliary = readRendererAuxiliaryState(database);
  auxiliary.marketplaceSources.plugin = [
    {
      id: "store",
      name: "Store",
      type: "marketplace-json",
      url: "https://example.test/store.json",
      enabled: true,
      order: 0,
      createdAt: Date.parse(at),
    },
  ];
  writeRendererAuxiliaryState(database, auxiliary);
  settings.patchSettings({ language: "zh" });
}
