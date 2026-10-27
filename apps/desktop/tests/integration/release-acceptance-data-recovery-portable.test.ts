// @vitest-environment jsdom
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { unzipSync, gzipSync } from "fflate";
import { File as NodeFile } from "node:buffer";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  AgentProviderProfileService,
  CorePluginLibraryService,
  CoreMcpLibraryService,
  exportMcpStorageSnapshot,
  MCP_STORAGE_SNAPSHOT_FILE,
  createAgentSecretStore,
  createRendererPersistenceStore,
  writeRuntimeLayoutState,
  AgentSettingsRepository,
  createPortableSkillResource,
  createPortablePluginResourceEntry,
  type PortableLogicalEnvelope,
} from "@prompthub/core";
import {
  AgentProviderProfileDB,
  AgentSessionIndexDB,
  DatabaseAdapter,
} from "@prompthub/db";
import { SKILL_PLATFORMS } from "@prompthub/shared/constants/platforms";
import {
  closeDatabase,
  initDatabase,
  PromptDB,
  FolderDB,
  SkillDB,
} from "../../src/main/database";
import {
  configureRuntimePaths,
  getDatabasePath,
  getImagesDir,
  getVideosDir,
  resetRuntimePaths,
} from "../../src/main/runtime-paths";
import { registerPromptIPC } from "../../src/main/ipc/prompt.ipc";
import { registerFolderIPC } from "../../src/main/ipc/folder.ipc";
import { registerSkillIPC } from "../../src/main/ipc/skill.ipc";
import { registerRulesIPC } from "../../src/main/ipc/rules.ipc";
import { registerPluginIPC } from "../../src/main/ipc/plugin.ipc";
import { registerMcpIPC } from "../../src/main/ipc/mcp.ipc";
import { registerSettingsIPC } from "../../src/main/ipc/settings.ipc";
import { registerAgentManagementBackupIPC } from "../../src/main/ipc/agent-management-backup.ipc";
import { createAgentManagementBackupService } from "../../src/main/services/agent-management-backup-service";
import { resolveAgentSessionIndexSource } from "../../src/main/services/agent-session-index-operations";
import { registerPortableSnapshotIPC } from "../../src/main/services/portable-snapshot-ipc";
import { registerGenerationIPC } from "../../src/main/ipc/generation.ipc";
import { registerAgentProviderProfileIPC } from "../../src/main/ipc/agent-provider-profile.ipc";
import { ensureCanonicalStorageAuthorityOnStartup } from "../../src/main/services/canonical-storage-startup";
import { invalidateCustomPathsCache } from "../../src/main/services/skill-installer-utils";
import {
  downloadSelectiveExport,
  previewImportFile,
  restoreFromFile,
} from "../../src/renderer/services/database-backup";
import { registerImageIPC } from "../../src/main/ipc/image.ipc";
import { registerWebDAVIPC } from "../../src/main/webdav";
import { registerBackupIPC } from "../../src/main/ipc/backup.ipc";
import { createWebDAVFixture } from "../e2e/helpers/webdav-fixture";
import {
  runWebDAVUpload,
  runWebDAVDownload,
  runFullExportBackup,
} from "../../src/renderer/services/backup-orchestrator";
import {
  legacyExportZip,
  legacyExportText,
  legacyExportPayload,
  legacyExportedAt,
  legacyPrompt,
  legacyFolder,
  legacyVersions,
  legacySkill,
  legacyImage,
  legacyBinary,
} from "../fixtures/legacy-export";
import "../../src/preload";
import {
  inventory,
  writeFiles,
  seedSkill,
  seedMcp,
  seedProviderAndGeneration,
  providerGenerationSnapshot,
} from "./helpers/portable-workspace-fixtures";

const transport = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  home: "",
  profile: "",
  archive: "",
  relaunches: 0,
  // A deterministic OS-vault codec exercises secret references and byte
  // retention in isolated fixture profiles; this does not test cryptography.
  encryption: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string): Buffer => Buffer.from(`fixture:${value}`),
    decryptString: (value: Buffer): string => {
      const text = value.toString();
      if (!text.startsWith("fixture:"))
        throw new Error("Invalid fixture vault bytes");
      return text.slice("fixture:".length);
    },
  },
}));
vi.mock("os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  const homedir = () => {
    if (!transport.home) throw new Error("Fixture home is not initialized");
    return transport.home;
  };
  return { ...actual, homedir, default: { ...actual, homedir } };
});
// Substitute only OS integration and IPC delivery. The real renderer exporter,
// preload, registered handlers, checkpoint, ZIP, restore and startup run below.
vi.mock("electron", () => ({
  ipcMain: {
    handle(channel: string, handler: (...args: unknown[]) => unknown) {
      if (transport.handlers.has(channel))
        throw new Error(`Duplicate IPC: ${channel}`);
      transport.handlers.set(channel, handler);
    },
  },
  ipcRenderer: {
    on: vi.fn(),
    async invoke(channel: string, ...args: unknown[]): Promise<unknown> {
      const handler = transport.handlers.get(channel);
      if (!handler) throw new Error(`Unregistered IPC: ${channel}`);
      return structuredClone(await handler({}, ...structuredClone(args)));
    },
  },
  contextBridge: {
    exposeInMainWorld(name: string, value: unknown) {
      Object.defineProperty(window, name, { value, configurable: true });
    },
  },
  dialog: {
    showSaveDialog: async () => ({
      canceled: false,
      filePath: transport.archive,
    }),
  },
  safeStorage: transport.encryption,
  session: { defaultSession: { setProxy: async () => undefined } },
  app: {
    getPath: () => transport.profile,
    getVersion: () => "0.6.1",
    relaunch: vi.fn(),
    quit: vi.fn(),
  },
  webUtils: { getPathForFile: () => transport.archive },
}));

let storageWindow: JSDOM;
let root: string;
let profile: string;
let database: ReturnType<typeof initDatabase>;
let handlersReady: Promise<void>;
let databaseChannels: string[] = [];
const settings = {
  language: "en",
  themeMode: "dark",
  closeAction: "exit",
  scenarioModelDefaults: {},
};
const imageBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);
// Media payload preservation, not codec playback, is this boundary's contract.
const videoBytes = Buffer.from([
  0, 0, 0, 24, 102, 116, 121, 112, 109, 112, 52, 50, 0, 128, 255,
]);

function persistence() {
  return createRendererPersistenceStore({
    database: database,
    rootPath: profile,
    encryption: transport.encryption,
  });
}

async function openHandlers(): Promise<void> {
  database = initDatabase();
  const prompts = new PromptDB(database);
  const folders = new FolderDB(database);
  registerPromptIPC(prompts, folders, database);
  registerFolderIPC(folders);
  const skillsReady = registerSkillIPC(new SkillDB(database));
  registerRulesIPC();
  registerPluginIPC(new CorePluginLibraryService());
  registerMcpIPC();
  registerSettingsIPC(database, { rendererPersistence: persistence() });
  registerGenerationIPC(database);
  registerAgentProviderProfileIPC(
    new AgentProviderProfileService(
      new AgentProviderProfileDB(database),
      createAgentSecretStore({
        userDataPath: profile,
        encryption: transport.encryption,
      }),
    ),
  );
  registerAgentManagementBackupIPC(
    createAgentManagementBackupService({
      profiles: new AgentProviderProfileDB(database),
      sessions: new AgentSessionIndexDB(database),
      secrets: createAgentSecretStore({
        userDataPath: profile,
        encryption: transport.encryption,
      }),
      resolveSessionSource: resolveAgentSessionIndexSource,
      transaction: (operation) => database.transaction(operation)(),
    }),
  );
  registerImageIPC();
  registerBackupIPC((nextDatabase) => {
    database = nextDatabase;
  }, rebindHandlers);
  databaseChannels = [...transport.handlers.keys()].filter(
    (channel) => !channel.startsWith("webdav:") && !channel.startsWith("data:"),
  );
  await skillsReady;
}

function rebindHandlers(): void {
  for (const channel of databaseChannels) transport.handlers.delete(channel);
  handlersReady = openHandlers();
}

async function startProfile(destination: string, fresh = false): Promise<void> {
  await handlersReady;
  transport.handlers.clear();
  closeDatabase();
  profile = destination;
  transport.profile = destination;
  configureRuntimePaths({ userDataPath: profile });
  invalidateCustomPathsCache();
  if (fresh) {
    writeRuntimeLayoutState(profile);
    database = initDatabase();
    database
      .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
      .run(
        "builtinAgentOverrides",
        JSON.stringify(
          Object.fromEntries(
            SKILL_PLATFORMS.map((platform) => [
              platform.id,
              { rootPath: path.join(root, "platforms", platform.id) },
            ]),
          ),
        ),
      );
    await persistence().migrate({ indexedDbMigrationDone: true });
    closeDatabase();
  }
  const startup = await ensureCanonicalStorageAuthorityOnStartup({
    activeRoot: profile,
    sourceDatabasePath: getDatabasePath(),
  });
  if (fresh) expect(startup.status).toBe("published");
  else
    expect(
      ["already-canonical", "catalog-rebuilt"],
      JSON.stringify(startup),
    ).toContain(startup.status);
  handlersReady = openHandlers();
  await handlersReady;
  registerPortableSnapshotIPC(() => {
    transport.relaunches += 1;
  }, rebindHandlers);
  registerWebDAVIPC();
}

async function seedPrompts(): Promise<void> {
  writeFiles(getImagesDir(), { "pixel.png": imageBytes });
  writeFiles(getVideosDir(), { "clip.mp4": videoBytes });
  const folder = await window.api.folder.create({
    name: "Public acceptance",
    isPrivate: false,
  });
  const first = await window.api.prompt.create({
    title: "Source prompt",
    userPrompt: "First revision",
    systemPrompt: "System",
    visibility: "shared",
    folderId: folder.id,
    tags: ["portable"],
    images: ["pixel.png"],
    videos: ["clip.mp4"],
  });
  await window.api.prompt.update(first.id, {
    userPrompt: "Second revision \u6570\u636e \u{1f680}",
  });
  const second = await window.api.prompt.create({
    title: "Related prompt",
    userPrompt: "Related content",
    visibility: "shared",
    folderId: folder.id,
  });
  await window.api.prompt.createRelation({
    sourcePromptId: first.id,
    targetPromptId: second.id,
    kind: "depends_on",
    note: "Retain relation",
  });
}

async function seedRuleAndPlugin(sourceBase = root): Promise<void> {
  fs.mkdirSync(sourceBase, { recursive: true });
  const project = path.join(sourceBase, "project");
  fs.mkdirSync(project);
  const rule = await window.api.rules.addProject({
    id: "portable-project",
    name: "Portable project",
    rootPath: project,
  });
  await window.api.rules.save(rule.id, "# First rule\n");
  await window.api.rules.save(rule.id, "# Second rule\n");
  const source = path.join(sourceBase, "plugin-source");
  writeFiles(source, {
    ".codex-plugin/plugin.json": JSON.stringify({
      name: "portable-plugin",
      version: "1.0.0",
      skills: "./skills",
      commands: ["./commands/review.md"],
    }),
    "skills/review/SKILL.md": "---\nname: review\n---\nReview",
    "commands/review.md": "Review command",
    "assets/blob.bin": Buffer.from([0, 128, 255]),
  });
  const plugin = await window.api.plugin.importLocalPluginPackage({
    sourcePath: source,
  });
  new CorePluginLibraryService().createPluginVersion(
    plugin.plugin.id,
    "Original package",
  );
  await window.api.settings.rendererPersistence.replaceSettings(settings);
}

async function consumerSnapshot() {
  const prompts = await window.api.prompt.getAll();
  const skills = await window.api.skill.getAll();
  expect(
    database.get(
      "SELECT name FROM schema_migrations WHERE name = ?",
      "skill-payload-files-v1",
    ),
  ).toEqual({ name: "skill-payload-files-v1" });
  expect(
    database.all("SELECT id FROM skills WHERE content IS NOT NULL"),
  ).toEqual([]);
  expect(
    database.all(
      "SELECT id FROM skill_versions WHERE content IS NOT NULL OR files_snapshot IS NOT NULL",
    ),
  ).toEqual([]);
  const rules = await window.api.rules.list();
  const plugins = (await window.api.plugin.getLibrary()).plugins;
  const skillPackages = skills.map((skill) => {
    if (!skill.local_repo_path) throw new Error("Skill package path missing");
    expect(skill.local_repo_path.startsWith(profile + path.sep)).toBe(true);
    const files = inventory(skill.local_repo_path);
    delete files[".canonical-bundle-hash"];
    return { id: skill.id, files };
  });
  const pluginPackages = plugins.map((plugin) => {
    expect(plugin.localPackagePath.startsWith(profile + path.sep)).toBe(true);
    return { id: plugin.id, files: inventory(plugin.localPackagePath) };
  });
  // Only the active profile prefix changes across a portable restore. IDs,
  // histories, metadata, source references and all other fields remain exact.
  return {
    prompts,
    folders: await window.api.folder.getAll(),
    versions: await Promise.all(
      prompts.map((prompt) => window.api.version.getAll(prompt.id)),
    ),
    relations: await window.api.prompt.listRelations(),
    skills: skills.map(createPortableSkillResource),
    skillVersions: await Promise.all(
      skills.map((skill) => window.api.skill.versionGetAll(skill.id)),
    ),
    skillPackages,
    rules: await Promise.all(
      rules.map(async (rule) => {
        const value = await window.api.rules.read(rule.id);
        return {
          id: value.id,
          platformId: value.platformId,
          platformName: value.platformName,
          name: value.name,
          description: value.description,
          content: value.content,
          versions: value.versions,
        };
      }),
    ),
    plugins: plugins.map(createPortablePluginResourceEntry),
    pluginVersions: plugins.map((plugin) =>
      new CorePluginLibraryService().getPluginVersions(plugin.id),
    ),
    pluginPackages,
    settings: (await window.api.settings.rendererPersistence.get()).settings,
    images: inventory(getImagesDir()),
    videos: inventory(getVideosDir()),
  };
}

beforeEach(async () => {
  root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-acceptance-portable-")),
  );
  transport.home = path.join(root, "home");
  fs.mkdirSync(transport.home);
  transport.archive = path.join(root, "portable.zip");
  transport.relaunches = 0;
  storageWindow = new JSDOM("", { url: "https://fixture.invalid" });
  vi.stubGlobal("localStorage", storageWindow.window.localStorage);
  await startProfile(path.join(root, "source-profile"), true);
});

afterEach(async () => {
  await handlersReady;
  vi.restoreAllMocks();
  transport.handlers.clear();
  closeDatabase();
  invalidateCustomPathsCache();
  resetRuntimePaths();
  fs.rmSync(root, { recursive: true, force: true });
  storageWindow?.window.close();
  vi.unstubAllGlobals();
  transport.home = "";
  transport.profile = "";
});

function historicalBackupFile(format: "zip" | "json" | "phub.gz"): File {
  const text =
    format === "zip"
      ? legacyExportText()
      : JSON.stringify({
          kind: "prompthub-backup",
          exportedAt: legacyExportedAt,
          payload: legacyExportPayload(),
        });
  const bytes =
    format === "zip"
      ? legacyExportZip()
      : format === "phub.gz"
        ? gzipSync(Buffer.from(text))
        : Buffer.from(text);
  fs.writeFileSync(transport.archive, bytes);
  // Node's real Web File supplies streaming APIs absent from jsdom's File.
  return new NodeFile([bytes], `legacy.${format}`) as unknown as File;
}

async function assertHistoricalData(format: string): Promise<void> {
  const prompts = await window.api.prompt.getAll();
  expect(prompts).toHaveLength(1);
  expect(prompts[0]).toMatchObject(legacyPrompt);
  expect(await window.api.folder.getAll()).toEqual([
    expect.objectContaining(legacyFolder),
  ]);
  expect(new PromptDB(database).getVersions(legacyPrompt.id)).toEqual(
    expect.arrayContaining(
      legacyVersions.map((version) => expect.objectContaining(version)),
    ),
  );
  const skills = await window.api.skill.getAll();
  expect(skills).toHaveLength(1);
  expect(skills[0].id).toBe(legacySkill.id);
  const directory = skills[0].local_repo_path;
  if (!directory)
    throw new Error("Restored legacy Skill has no package directory");
  expect(
    fs.readFileSync(path.join(directory, "docs", "nested.md"), "utf8"),
  ).toBe("Nested original file");
  if (format === "zip")
    expect(fs.readFileSync(path.join(directory, "assets", "blob.bin"))).toEqual(
      legacyBinary,
    );
  expect(await window.api.skill.versionGetAll(legacySkill.id)).toEqual([
    expect.objectContaining({ id: "legacy-skill-version", version: 1 }),
  ]);
  expect(fs.readFileSync(path.join(getImagesDir(), "legacy.png"))).toEqual(
    legacyImage,
  );
  expect(persistence().readHydratedStateSync().settings).toMatchObject({
    themeMode: "dark",
  });
  expect(database.get("PRAGMA quick_check")).toEqual({ quick_check: "ok" });
}

it.each(["zip", "json", "phub.gz"] as const)(
  "imports historical %s through renderer/preload/IPC and preserves records after two startups",
  async (format) => {
    await seedPrompts();
    const file = historicalBackupFile(format);
    const bytes = fs.readFileSync(transport.archive);
    const preview = await previewImportFile(file);
    expect(preview.summary.counts).toMatchObject({
      prompts: 1,
      folders: 1,
      versions: 2,
      skills: 1,
    });
    await restoreFromFile(file);
    for (const _startup of ["first", "second"]) {
      await startProfile(profile);
      await assertHistoricalData(format);
    }
    await restoreFromFile(file);
    await startProfile(profile);
    await assertHistoricalData(format);
    expect(fs.readFileSync(transport.archive)).toEqual(bytes);
    expect(inventory(path.join(profile, "cache", "portable-imports"))).toEqual(
      {},
    );
    expect(inventory(path.join(profile, "cache", "portable-previews"))).toEqual(
      {},
    );
  },
);

it("rolls back a failed historical ZIP publication and can import it again", async () => {
  await seedPrompts();
  const before = await consumerSnapshot();
  const file = historicalBackupFile("zip");
  const rename = fs.renameSync;
  let failed = false;
  vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
    if (
      !failed &&
      String(from).includes(".prompthub-restore-stage-") &&
      String(to) === path.join(profile, "data")
    ) {
      failed = true;
      throw Object.assign(new Error("Legacy restore publication EIO"), {
        code: "EIO",
      });
    }
    return rename(from, to);
  });
  await expect(restoreFromFile(file)).rejects.toThrow(
    "Legacy restore publication EIO",
  );
  expect(failed).toBe(true);
  vi.restoreAllMocks();
  await startProfile(profile);
  expect(await consumerSnapshot()).toEqual(before);
  await restoreFromFile(file);
  await startProfile(profile);
  await assertHistoricalData("zip");
});

it("full manual export creates a readable ZIP without an extra managed safety point", async () => {
  await seedPrompts();
  const backupsBefore = inventory(path.join(profile, "backups"));
  await runFullExportBackup({
    currentVersion: "0.6.0",
    recordManualBackup: true,
  });
  await handlersReady;
  expect(await window.api.settings.get()).toMatchObject({
    lastManualBackupVersion: "0.6.0",
    lastManualBackupAt: expect.any(String),
  });
  expect(fs.existsSync(transport.archive)).toBe(true);
  expect(inventory(path.join(profile, "backups"))).toEqual(backupsBefore);
  const preview = await window.electron.previewPortableBackup?.(
    transport.archive,
  );
  expect(preview?.success).toBe(true);
  const updated = await window.api.prompt.getAll();
  expect(updated).toHaveLength(2);
});

function partialEnvelope(
  selected: boolean,
  retainedBundle: string,
): PortableLogicalEnvelope {
  const server = new CoreMcpLibraryService()
    .readForTransport()
    .servers.find((item) => item.id === "retained");
  if (!server) throw new Error("Missing retained MCP fixture");
  const files = Object.keys(inventory(retainedBundle)).map((relativePath) => {
    const bytes = fs.readFileSync(path.join(retainedBundle, relativePath));
    return {
      relativePath: `retained/${relativePath}`,
      size: bytes.length,
      contentBase64: bytes.toString("base64"),
    };
  });
  const snapshotBytes = fs.readFileSync(
    path.join(root, MCP_STORAGE_SNAPSHOT_FILE),
  );
  files.push({
    relativePath: MCP_STORAGE_SNAPSHOT_FILE,
    size: snapshotBytes.length,
    contentBase64: snapshotBytes.toString("base64"),
  });
  return {
    kind: "prompthub-export",
    exportedAt: new Date().toISOString(),
    scope: {
      prompts: false,
      folders: false,
      versions: false,
      images: false,
      videos: false,
      aiConfig: true,
      settings: selected,
      rules: false,
      skills: false,
      mcp: selected,
      plugins: false,
      agents: false,
    },
    payload: {
      version: 1,
      exportedAt: new Date().toISOString(),
      prompts: [],
      folders: [],
      versions: [],
      aiConfig: {},
      settings: {
        state: {
          themeMode: "light",
          builtinAgentOverrides: {},
          customAgents: [],
          disabledPlatformIds: ["codex"],
          agentIdentityPreferences: {
            codex: { name: "chatgpt", icon: "chatgpt" },
          },
        },
      },
      mcpLibrary: {
        kind: "prompthub-mcp-library",
        version: 1,
        updatedAt: new Date().toISOString(),
        servers: [server],
        bindings: [],
      },
      agentAssetFiles: { mcp: files },
    },
  };
}

it.each([
  { selected: true, failPublication: false },
  { selected: false, failPublication: false },
  { selected: true, failPublication: true },
])(
  "preserves nonempty unselected domains and device state (selected=$selected, failure=$failPublication)",
  async ({ selected, failPublication }) => {
    await seedPrompts();
    await seedSkill(root);
    await seedRuleAndPlugin();
    await persistence().replaceSettings({
      ...settings,
      githubToken: "acceptance-only-token",
    });
    const expected = await consumerSnapshot();
    const agentSettings = new AgentSettingsRepository(database).read();
    const retained = seedMcp("retained", profile);
    exportMcpStorageSnapshot(path.join(root, MCP_STORAGE_SNAPSHOT_FILE), {
      database,
    });
    seedMcp("removed", profile);
    const metadata = {
      "data/mcp/market-sources.json": JSON.stringify({
        kind: "prompthub-mcp-market-sources",
        version: 1,
        updatedAt: new Date(0).toISOString(),
        sources: [],
      }),
      "data/plugins/market-cache.json": JSON.stringify({ fixture: "cache" }),
    };
    writeFiles(profile, metadata);
    const mcpBefore = inventory(path.join(profile, "data", "mcp"));
    const retainedBefore = inventory(retained);
    const nativePath = path.join(root, "native-agent.json");
    fs.writeFileSync(nativePath, "native configuration stays unchanged");
    const service = new CoreMcpLibraryService();
    const binding = service.write({
      ...service.read(),
      bindings: [
        {
          id: "fixture-binding",
          serverIds: ["retained", "removed"],
          target: "codex",
          scope: "global",
          path: nativePath,
          enabled: true,
          createdAt: 1,
          updatedAt: 2,
        },
      ],
    });
    writeFiles(profile, {
      "secrets/fixture-vault.bin": Buffer.from([0, 47, 255, 12]),
    });
    const secretsBefore = inventory(path.join(profile, "secrets"));
    const bindingsBefore = binding.bindings;
    const envelope = partialEnvelope(selected, retained);
    const rename = fs.renameSync;
    let failed = false;
    if (failPublication)
      vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
        if (
          !failed &&
          String(from).includes(".prompthub-restore-stage-") &&
          String(to) === path.join(profile, "data")
        ) {
          failed = true;
          throw Object.assign(new Error("Fixture config publication EIO"), {
            code: "EIO",
          });
        }
        return rename(from, to);
      });
    const result = await window.electron.restorePortableLogicalBackup?.(
      JSON.stringify(envelope),
    );
    expect(result, JSON.stringify(result)).toMatchObject({
      success: !failPublication,
      needsRestart: !failPublication,
    });
    expect(failed).toBe(failPublication);
    vi.restoreAllMocks();
    for (const startup of ["first", "second"]) {
      await startProfile(profile);
      const actual = await consumerSnapshot();
      expect({ ...actual, settings: expected.settings }, startup).toEqual(
        expected,
      );
      expect(actual.settings.themeMode).toBe(
        selected && !failPublication ? "light" : "dark",
      );
      expect(actual.settings.githubToken).toBe("acceptance-only-token");
      expect(new AgentSettingsRepository(database).read()).toEqual(
        selected && !failPublication
          ? {
              builtinAgentOverrides: {},
              customAgents: [],
              disabledPlatformIds: ["codex"],
              agentIdentityPreferences: {
                codex: { name: "chatgpt", icon: "chatgpt" },
              },
            }
          : agentSettings,
      );
      expect(inventory(path.join(profile, "secrets"))).toEqual(secretsBefore);
      expect(inventory(retained)).toEqual(retainedBefore);
      for (const [relativePath, content] of Object.entries(metadata)) {
        if (relativePath.includes("/mcp/") && selected && !failPublication)
          continue;
        expect(fs.readFileSync(path.join(profile, relativePath), "utf8")).toBe(
          content,
        );
      }
      const actualBindings = new CoreMcpLibraryService().read().bindings;
      if (selected && !failPublication) {
        expect(actualBindings).toMatchObject([{ serverIds: ["retained"] }]);
        expect(
          fs.existsSync(path.join(profile, "data", "mcp", "removed")),
        ).toBe(false);
      } else {
        expect(inventory(path.join(profile, "data", "mcp"))).toEqual(mcpBefore);
        expect(actualBindings).toEqual(bindingsBefore);
      }
      expect(fs.readFileSync(nativePath, "utf8")).toBe(
        "native configuration stays unchanged",
      );
    }
  },
);

it.each(["complete", "current-removed", "all-removed"])(
  "exports all nonempty content domains through the renderer and restores the real ZIP across two normal startups (Rule history %s)",
  async (historyMode) => {
    await seedPrompts();
    await seedSkill(root);
    await seedRuleAndPlugin();
    if (historyMode !== "complete") {
      const rule = (await window.api.rules.list()).find((entry) =>
        entry.id.startsWith("project:"),
      )!;
      const content = await window.api.rules.read(rule.id);
      const removed =
        historyMode === "all-removed"
          ? content.versions
          : content.versions.slice(0, 1);
      for (const version of removed)
        await window.api.rules.deleteVersion(rule.id, version.id);
      expect((await window.api.rules.read(rule.id)).content).toBe(
        "# Second rule\n",
      );
    }
    const expected = await consumerSnapshot();
    const normalize = (value: unknown): unknown =>
      JSON.parse(JSON.stringify(value).split(profile).join("<profile>"));
    const expectedJson = normalize(expected);
    expect(expected.prompts).toHaveLength(2);
    expect(expected.folders).toHaveLength(1);
    expect(expected.versions.flat()).toHaveLength(3);
    expect(expected.relations).toHaveLength(1);
    expect(expected.skills).toHaveLength(1);
    expect(expected.skillVersions.flat().length).toBeGreaterThan(0);
    expect(expected.rules).toHaveLength(1);
    expect(expected.rules[0].versions).toHaveLength(
      historyMode === "complete"
        ? 2
        : historyMode === "current-removed"
          ? 1
          : 0,
    );
    expect(expected.plugins).toHaveLength(1);
    expect(expected.pluginVersions.flat()).toHaveLength(1);
    expect(expected.settings).toMatchObject(settings);
    const sourcePackages = {
      skill: inventory(path.join(root, "skill-source")),
      plugin: inventory(path.join(root, "plugin-source")),
      project: inventory(path.join(root, "project")),
    };
    expect(expected.skillPackages[0].files).toEqual(sourcePackages.skill);
    expect(expected.pluginPackages[0].files).toEqual(sourcePackages.plugin);
    await downloadSelectiveExport({
      prompts: true,
      folders: true,
      versions: true,
      images: true,
      videos: true,
      aiConfig: true,
      settings: true,
      rules: true,
      skills: true,
      mcp: true,
      plugins: true,
      agents: true,
    });
    const archive = fs.readFileSync(transport.archive);
    const entries = unzipSync(archive);
    expect(
      Object.keys(entries).some((name) => name.endsWith("manifest.json")),
    ).toBe(true);
    expect(
      Object.keys(entries).some((name) => name.endsWith("assets/blob.bin")),
    ).toBe(true);
    // Export checkpoints/reopens the DB, so refresh handlers just as startup does.
    await startProfile(path.join(root, "source-profile"));
    expect(normalize(await consumerSnapshot())).toEqual(expectedJson);
    closeDatabase();
    const sourceBeforeRestore = inventory(
      path.join(root, "source-profile", "data"),
    );
    const destination = path.join(root, "restored-profile");
    await startProfile(destination, true);
    const restore = await window.electron.restorePortableBackup?.(
      transport.archive,
    );
    expect(restore, JSON.stringify(restore)).toMatchObject({
      success: true,
      needsRestart: true,
    });
    expect(transport.relaunches).toBe(1);
    expect(inventory(path.join(root, "source-profile", "data"))).toEqual(
      sourceBeforeRestore,
    );
    expect(fs.readFileSync(transport.archive)).toEqual(archive);
    for (const startup of ["first", "second"]) {
      await startProfile(destination);
      expect(normalize(await consumerSnapshot()), startup).toEqual(
        expectedJson,
      );
      expect(database.all("PRAGMA foreign_key_check")).toEqual([]);
      expect(database.get("PRAGMA quick_check")).toEqual({ quick_check: "ok" });
      expect(fs.readFileSync(path.join(getImagesDir(), "pixel.png"))).toEqual(
        imageBytes,
      );
      expect(fs.readFileSync(path.join(getVideosDir(), "clip.mp4"))).toEqual(
        videoBytes,
      );
    }
    expect(inventory(path.join(root, "source-profile", "data"))).toEqual(
      sourceBeforeRestore,
    );
    expect(fs.readFileSync(transport.archive)).toEqual(archive);
    expect({
      skill: inventory(path.join(root, "skill-source")),
      plugin: inventory(path.join(root, "plugin-source")),
      project: inventory(path.join(root, "project")),
    }).toEqual(sourcePackages);
  },
);

it.each([
  { selectedSettings: true, failPublication: false },
  { selectedSettings: false, failPublication: false },
  { selectedSettings: true, failPublication: true },
])(
  "joins nonempty Provider and Generation in one ZIP (settings=$selectedSettings, failure=$failPublication)",
  async ({ selectedSettings, failPublication }) => {
    await seedPrompts();
    await seedSkill(root);
    await seedRuleAndPlugin();
    await seedProviderAndGeneration("Source provider", imageBytes);
    const sourceRoot = profile;
    const normalize = (value: unknown): unknown =>
      JSON.parse(JSON.stringify(value).split(sourceRoot).join("<profile>"));
    const source = normalize(await consumerSnapshot());
    const sourceExtra = await providerGenerationSnapshot(profile);
    expect(sourceExtra.providers).toHaveLength(1);
    expect(sourceExtra.providers[0].modelMappings).toHaveLength(1);
    expect(sourceExtra.batches).toHaveLength(1);
    expect(sourceExtra.batches[0].sourcePromptId).toBe(
      (await window.api.prompt.getAll()).find(
        (prompt) => prompt.currentVersion === 2,
      )?.id,
    );
    expect(sourceExtra.outputs).toHaveLength(1);
    expect(Buffer.from(sourceExtra.outputs[0].base64, "base64")).toEqual(
      imageBytes,
    );
    await downloadSelectiveExport({
      prompts: true,
      folders: true,
      versions: true,
      images: true,
      videos: true,
      aiConfig: true,
      settings: selectedSettings,
      rules: true,
      skills: true,
      mcp: true,
      plugins: true,
      agents: true,
    });
    const archiveBytes = fs.readFileSync(transport.archive);
    const entries = unzipSync(archiveBytes);
    expect(
      Object.keys(entries).some((entry) =>
        entry.startsWith("data/generations/"),
      ),
    ).toBe(true);
    expect(
      selectedSettings
        ? Boolean(entries["data/prompthub.db"])
        : Object.keys(entries).some((entry) =>
            entry.startsWith("data/agents/"),
          ),
    ).toBe(true);
    await startProfile(sourceRoot);
    expect(normalize(await consumerSnapshot())).toEqual(source);
    expect(await providerGenerationSnapshot(profile)).toEqual(sourceExtra);
    closeDatabase();
    const sourceInventory = inventory(path.join(sourceRoot, "data"));
    const destination = path.join(root, "provider-generation-target");
    await startProfile(destination, true);
    await seedPrompts();
    await seedSkill(root);
    await seedRuleAndPlugin(path.join(root, "target-inputs"));
    await seedProviderAndGeneration("Target provider", imageBytes);
    const targetSettings = { ...settings, themeMode: "light", language: "fr" };
    await persistence().replaceSettings(targetSettings);
    const target = await consumerSnapshot();
    const targetExtra = await providerGenerationSnapshot(profile);
    closeDatabase();
    const targetData = inventory(path.join(destination, "data"));
    const targetConfig = inventory(path.join(destination, "config"));
    const targetSecrets = inventory(path.join(destination, "secrets"));
    const rename = fs.renameSync;
    let injected = false;
    if (failPublication)
      vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
        if (
          !injected &&
          String(from).includes(".prompthub-restore-stage-") &&
          String(to) === path.join(destination, "data")
        ) {
          injected = true;
          throw Object.assign(
            new Error("Fixture joined-domain publication EIO"),
            { code: "EIO" },
          );
        }
        return rename(from, to);
      });
    const restored = await window.electron.restorePortableBackup?.(
      transport.archive,
    );
    expect(restored, JSON.stringify(restored)).toMatchObject({
      success: !failPublication,
      needsRestart: !failPublication,
    });
    expect(injected).toBe(failPublication);
    vi.restoreAllMocks();
    expect(inventory(path.join(sourceRoot, "data"))).toEqual(sourceInventory);
    expect(fs.readFileSync(transport.archive)).toEqual(archiveBytes);
    if (failPublication) {
      await handlersReady;
      expect(await consumerSnapshot()).toEqual(target);
      closeDatabase();
      expect(inventory(path.join(destination, "data"))).toEqual(targetData);
      expect(inventory(path.join(destination, "config"))).toEqual(targetConfig);
      expect(inventory(path.join(destination, "secrets"))).toEqual(
        targetSecrets,
      );
    }
    for (const startup of ["first", "second"]) {
      await startProfile(destination);
      const actual = await consumerSnapshot();
      const expected = failPublication
        ? target
        : JSON.parse(
            JSON.stringify(source).split("<profile>").join(destination),
          );
      expect(actual, startup).toEqual({
        ...expected,
        settings:
          !selectedSettings || failPublication
            ? target.settings
            : expected.settings,
      });
      const extra = await providerGenerationSnapshot(profile);
      expect
        .soft(extra, startup)
        .toEqual(failPublication ? targetExtra : sourceExtra);
      for (const batch of extra.batches)
        for (const slot of batch.slots) {
          if (!slot.output) throw new Error("Joined fixture output is missing");
          expect(
            fs.readFileSync(
              path.join(
                destination,
                "data",
                "generations",
                "assets",
                batch.id,
                slot.output.fileName,
              ),
            ),
          ).toEqual(imageBytes);
        }
      expect(database.all("PRAGMA foreign_key_check")).toEqual([]);
      expect(database.get("PRAGMA quick_check")).toEqual({ quick_check: "ok" });
    }
    expect(inventory(path.join(sourceRoot, "data"))).toEqual(sourceInventory);
    expect(fs.readFileSync(transport.archive)).toEqual(archiveBytes);
  },
);

it.each([true, false])(
  "exports every populated domain with Prompt history=%s and remains usable without restarting",
  async (versions) => {
    await seedPrompts();
    await seedSkill(root);
    await seedRuleAndPlugin();
    seedMcp("export-mcp", profile);
    await seedProviderAndGeneration("export-provider", imageBytes);
    const before = await consumerSnapshot();
    const providers = await providerGenerationSnapshot(profile);
    await downloadSelectiveExport({
      prompts: true,
      folders: true,
      versions,
      images: true,
      videos: true,
      settings: true,
      aiConfig: true,
      skills: true,
      rules: true,
      mcp: true,
      plugins: true,
      agents: true,
    });
    await handlersReady;
    expect(await consumerSnapshot()).toEqual(before);
    expect(await providerGenerationSnapshot(profile)).toEqual(providers);
    expect(
      await window.electron.previewPortableBackup?.(transport.archive),
    ).toMatchObject({ success: true });
    if (versions) {
      const preview = await previewImportFile(
        new NodeFile([fs.readFileSync(transport.archive)], "backup.zip", {
          type: "application/zip",
        }) as unknown as File,
      );
      expect(preview.summary.counts.rules).toBe(before.rules.length);
    }
    const prompt = before.prompts[0];
    await window.api.prompt.update(prompt.id, { title: "Edited after export" });
    expect(
      (await window.api.prompt.getAll()).find((item) => item.id === prompt.id)
        ?.title,
    ).toBe("Edited after export");
  },
);

it.each([true, false])(
  "uploads and restores real WebDAV data with a safety snapshot (incremental=%s)",
  async (incrementalSync) => {
    const remote = await createWebDAVFixture();
    try {
      await seedPrompts();
      await seedSkill(root);
      await seedRuleAndPlugin();
      seedMcp("remote-mcp", profile);
      const normalize = (value: unknown): unknown =>
        JSON.parse(JSON.stringify(value).split(profile).join("<profile>"));
      const expected = normalize(await consumerSnapshot());
      const config = {
        url: remote.url,
        username: "fixture",
        password: "fixture",
      };
      const options = { incrementalSync };
      const uploaded = await runWebDAVUpload({ config, options });
      expect(uploaded, JSON.stringify(uploaded)).toMatchObject({
        success: true,
      });
      const destination = path.join(root, "remote-destination");
      await startProfile(destination, true);
      await window.api.prompt.create({
        title: "Local before restore",
        userPrompt: "Retain in safety snapshot",
        visibility: "shared",
      });
      const downloaded = await runWebDAVDownload({ config, options });
      expect(downloaded, JSON.stringify(downloaded)).toMatchObject({
        success: true,
        localChanged: true,
      });
      expect(transport.relaunches).toBe(1);
      await startProfile(destination);
      expect(normalize(await consumerSnapshot())).toEqual(expected);
      const snapshots = await window.api.upgradeBackup.list();
      expect(snapshots).toHaveLength(1);
      const safety = new DatabaseAdapter(
        path.join(snapshots[0].backupPath, "data", "prompthub.db"),
        { readOnly: true },
      );
      try {
        expect(new PromptDB(safety).getAll().map((item) => item.title)).toEqual(
          ["Local before restore"],
        );
      } finally {
        safety.close();
      }
      expect(database.all("PRAGMA foreign_key_check")).toEqual([]);
      await startProfile(destination);
      expect(normalize(await consumerSnapshot())).toEqual(expected);
      const objectKey = [...remote.objects.keys()].find((key) =>
        key.endsWith("manifest.json"),
      );
      if (!objectKey) throw new Error("Published remote object is missing");
      const object = remote.objects.get(objectKey)!;
      remote.objects.set(objectKey, { ...object, data: "invalid JSON" });
      const failed = await runWebDAVDownload({ config, options });
      expect(failed.success).toBe(false);
      expect(transport.relaunches).toBe(1);
      expect(await window.api.upgradeBackup.list()).toHaveLength(1);
      expect(normalize(await consumerSnapshot())).toEqual(expected);
    } finally {
      await remote.close();
    }
  },
);

it("preserves data and success status after an export destination failure, then retries without restarting", async () => {
  await seedPrompts();
  const before = await consumerSnapshot();
  const priorStatus = await window.api.settings.get();
  transport.archive = path.join(root, "occupied-destination");
  fs.mkdirSync(transport.archive);
  fs.writeFileSync(
    path.join(transport.archive, "keep.txt"),
    "Keep existing destination",
  );
  await expect(
    runFullExportBackup({ currentVersion: "0.6.1", recordManualBackup: true }),
  ).rejects.toThrow();
  await handlersReady;
  expect(
    fs.readFileSync(path.join(transport.archive, "keep.txt"), "utf8"),
  ).toBe("Keep existing destination");
  expect(await consumerSnapshot()).toEqual(before);
  expect(await window.api.settings.get()).toEqual(priorStatus);
  transport.archive = path.join(root, "retry.zip");
  await runFullExportBackup({
    currentVersion: "0.6.1",
    recordManualBackup: true,
  });
  await handlersReady;
  expect(
    await window.electron.previewPortableBackup?.(transport.archive),
  ).toMatchObject({ success: true });
  expect((await window.api.settings.get()).lastManualBackupVersion).toBe(
    "0.6.1",
  );
  expect(await window.api.prompt.getAll()).toEqual(before.prompts);
});

it.each(["local", "remote"] as const)(
  "preserves unenumerated tables, fields and resource files through the %s full snapshot entrypoint",
  async (transportKind) => {
    await seedPrompts();
    database.exec(
      "CREATE TABLE future_feature (id TEXT PRIMARY KEY, payload TEXT NOT NULL); ALTER TABLE prompts ADD COLUMN future_field TEXT;",
    );
    database.run(
      "INSERT INTO future_feature VALUES (?,?)",
      "new-kind",
      "new-record-value",
    );
    database.run("UPDATE prompts SET future_field=?", "new-field-value");
    const resource = path.join(profile, "data/future-feature/nested/value.bin");
    fs.mkdirSync(path.dirname(resource), { recursive: true });
    fs.writeFileSync(resource, Buffer.from([0, 255, 42]));
    const remote =
      transportKind === "remote" ? await createWebDAVFixture() : null;
    const config = {
      url: remote?.url ?? "",
      username: "fixture",
      password: "fixture",
    };
    try {
      if (remote)
        expect(
          await runWebDAVUpload({ config, options: { incrementalSync: true } }),
        ).toMatchObject({ success: true });
      else await runFullExportBackup({ currentVersion: "0.6.2" });
      const target = path.join(root, "extension-target");
      await startProfile(target, true);
      if (remote)
        expect(
          await runWebDAVDownload({
            config,
            options: { incrementalSync: true },
          }),
        ).toMatchObject({ success: true });
      else
        await restoreFromFile(
          new NodeFile(
            [fs.readFileSync(transport.archive)],
            "snapshot.zip",
          ) as unknown as File,
        );
      for (let reopen = 0; reopen < 2; reopen++) {
        await startProfile(target);
        expect(
          database.get(
            "SELECT payload FROM future_feature WHERE id=?",
            "new-kind",
          ),
        ).toEqual({ payload: "new-record-value" });
        expect(database.all("SELECT future_field FROM prompts")).toEqual([
          { future_field: "new-field-value" },
          { future_field: "new-field-value" },
        ]);
        expect(
          fs.readFileSync(
            path.join(target, "data/future-feature/nested/value.bin"),
          ),
        ).toEqual(Buffer.from([0, 255, 42]));
      }
    } finally {
      await remote?.close();
    }
  },
);

it("preserves the published backup after a failed upload and verifies encrypted multi-chunk restore before mutation", async () => {
  const remote = await createWebDAVFixture();
  try {
    await seedPrompts();
    const { randomBytes } = await import("node:crypto");
    const { WORKSPACE_SNAPSHOT_CHUNK_BYTES } =
      await import("@prompthub/shared/types/workspace-snapshot");
    const bytes = randomBytes(WORKSPACE_SNAPSHOT_CHUNK_BYTES * 2);
    const resource = path.join(profile, "data/unknown-resource.bin");
    fs.writeFileSync(resource, bytes);
    const expected = await window.api.prompt.getAll();
    const config = {
      url: remote.url,
      username: "fixture",
      password: "fixture",
    };
    const options = {
      encryptionPassword: "fixture-backup-passphrase",
      incrementalSync: true,
    };
    expect(await runWebDAVUpload({ config, options })).toMatchObject({
      success: true,
    });
    const headKey = [...remote.objects.keys()].find((key) =>
      key.endsWith("manifest.json"),
    )!;
    const priorHead = remote.objects.get(headKey)!;
    const manifest = JSON.parse(priorHead.data);
    expect(manifest.chunks.length).toBeGreaterThan(2);
    const upload = window.electron.webdav.upload;
    const rejected = vi
      .spyOn(window.electron.webdav, "upload")
      .mockImplementation(async (url, ...args) =>
        url.endsWith("manifest.json")
          ? { success: false, conflict: true, error: "injected HEAD conflict" }
          : upload(url, ...args),
      );
    try {
      expect(await runWebDAVUpload({ config, options })).toMatchObject({
        success: false,
      });
    } finally {
      rejected.mockRestore();
    }
    expect(remote.objects.get(headKey)).toEqual(priorHead);
    const target = path.join(root, "encrypted-target");
    await startProfile(target, true);
    const local = await window.api.prompt.create({
      title: "Keep on failure",
      userPrompt: "Original target",
      visibility: "shared",
    });
    expect(
      await runWebDAVDownload({
        config,
        options: { ...options, encryptionPassword: "wrong" },
      }),
    ).toMatchObject({ success: false });
    expect(await window.api.prompt.getAll()).toEqual([local]);
    expect(await window.api.upgradeBackup.list()).toHaveLength(0);
    const chunkKey = [...remote.objects.keys()].find((key) =>
      key.endsWith(manifest.chunks[0].objectId),
    )!;
    const originalChunk = remote.objects.get(chunkKey)!;
    remote.objects.set(chunkKey, {
      ...originalChunk,
      data: originalChunk.data + "corrupt",
    });
    expect(await runWebDAVDownload({ config, options })).toMatchObject({
      success: false,
    });
    expect(await window.api.prompt.getAll()).toEqual([local]);
    remote.objects.set(chunkKey, originalChunk);
    expect(await runWebDAVDownload({ config, options })).toMatchObject({
      success: true,
    });
    await startProfile(target);
    expect(await window.api.prompt.getAll()).toEqual(expected);
    expect(
      fs.readFileSync(path.join(target, "data/unknown-resource.bin")),
    ).toEqual(bytes);
  } finally {
    await remote.close();
  }
});

it("previews and migrates an older SQLite full snapshot through the real desktop restore entrypoint", async () => {
  await seedPrompts();
  const expected = await window.api.prompt.getAll();
  database.exec(
    "DROP TABLE plugin_versions; DROP TABLE plugins; DELETE FROM database_migration_history WHERE migration_id > 8; PRAGMA user_version = 8;",
  );
  closeDatabase();
  const { createPortableSnapshot } =
    await import("@prompthub/core/portable-snapshot");
  const { writeSnapshotZip } =
    await import("../../src/main/services/portable-snapshot-archive");
  const snapshot = createPortableSnapshot({
    sourceRoot: profile,
    destinationPath: path.join(root, "old-snapshot"),
    scopes: [
      {
        id: "workspace",
        sourcePath: path.join(profile, "data"),
        archivePath: "data",
      },
    ],
    generatedFiles: [
      {
        archivePath: "workspace-snapshot.json",
        content: Buffer.from(
          JSON.stringify({
            kind: "prompthub-workspace-snapshot",
            version: 1,
            databaseSchemaVersion: 8,
            layoutEpoch: 1,
          }),
        ),
      },
    ],
  });
  await writeSnapshotZip(snapshot.path, transport.archive);
  const target = path.join(root, "old-schema-target");
  await startProfile(target, true);
  const file = new NodeFile(
    [fs.readFileSync(transport.archive)],
    "old-snapshot.zip",
  ) as unknown as File;
  const preview = await previewImportFile(file);
  expect(preview.summary.counts.prompts).toBe(expected.length);
  await restoreFromFile(file);
  for (let reopen = 0; reopen < 2; reopen++) {
    await startProfile(target);
    expect(await window.api.prompt.getAll()).toEqual(expected);
    expect(database.all("SELECT * FROM plugins")).toEqual([]);
    expect(database.pragma("foreign_key_check")).toEqual([]);
  }
});

it.each([false, true])(
  "preserves a remotely published snapshot after a lost acknowledgement (readback unavailable=%s)",
  async (readbackUnavailable) => {
    const remote = await createWebDAVFixture();
    try {
      await seedPrompts();
      const expected = await window.api.prompt.getAll();
      const config = {
        url: remote.url,
        username: "fixture",
        password: "fixture",
      };
      const upload = window.electron.webdav.upload;
      const download = window.electron.webdav.download;
      let publicationAttempted = false;
      const lost = vi
        .spyOn(window.electron.webdav, "upload")
        .mockImplementation(async (url, ...args) => {
          const result = await upload(url, ...args);
          if (url.endsWith("manifest.json") && result.success) {
            publicationAttempted = true;
            return { success: false, error: "Injected lost acknowledgement" };
          }
          return result;
        });
      const unreadable = vi
        .spyOn(window.electron.webdav, "download")
        .mockImplementation(async (url, ...args) => {
          if (
            publicationAttempted &&
            readbackUnavailable &&
            url.endsWith("manifest.json")
          )
            return { success: false, error: "Injected readback disconnection" };
          return download(url, ...args);
        });
      try {
        expect(
          await runWebDAVUpload({ config, options: { incrementalSync: true } }),
        ).toMatchObject({ success: !readbackUnavailable });
      } finally {
        lost.mockRestore();
        unreadable.mockRestore();
      }
      await startProfile(path.join(root, "lost-response-target"), true);
      expect(
        await runWebDAVDownload({ config, options: { incrementalSync: true } }),
      ).toMatchObject({ success: true });
      await startProfile(profile);
      expect(await window.api.prompt.getAll()).toEqual(expected);
    } finally {
      await remote.close();
    }
  },
);
