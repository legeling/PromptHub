// @vitest-environment jsdom
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  CanonicalAgentProviderProfileDB,
  AgentProviderProfileService,
  CorePluginLibraryService,
  createAgentSecretStore,
  createRendererPersistenceStore,
  writeRuntimeLayoutState,
  AgentSettingsRepository,
  createPortableSkillResource,
  createPortablePluginResourceEntry,
  createMcpBindingConfigDocument,
  deriveLocalResourceDeviceId,
  materializeMcpServerResourceBundle,
  readMcpServerResourceBundle,
  readContentAddressedObject,
  readResourceBundle,
  type PortableLogicalEnvelope,
} from "@prompthub/core";
import { AgentSessionIndexDB } from "@prompthub/db";
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
import { downloadSelectiveExport } from "../../src/renderer/services/database-backup";
import "../../src/preload";

const transport = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  home: "",
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
  app: {},
  webUtils: {},
}));

let storageWindow: JSDOM;
let root: string;
let profile: string;
let database: ReturnType<typeof initDatabase>;
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

function inventory(directory: string): Record<string, string> {
  const files: Record<string, string> = {};
  function visit(current: string): void {
    if (!fs.existsSync(current)) return;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile())
        files[path.relative(directory, file)] = createHash("sha256")
          .update(fs.readFileSync(file))
          .digest("hex");
      else throw new Error(`Unexpected non-regular fixture file: ${file}`);
    }
  }
  visit(directory);
  return files;
}

function writeFiles(
  directory: string,
  files: Record<string, string | Buffer>,
): void {
  for (const [name, bytes] of Object.entries(files)) {
    const file = path.join(directory, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
  }
}

function persistence() {
  return createRendererPersistenceStore({
    rootPath: profile,
    encryption: transport.encryption,
  });
}

async function openHandlers(): Promise<void> {
  database = initDatabase();
  const prompts = new PromptDB(database);
  const folders = new FolderDB(database);
  registerPromptIPC(prompts, folders, database);
  registerFolderIPC(folders, prompts);
  await registerSkillIPC(new SkillDB(database));
  registerRulesIPC();
  registerPluginIPC(new CorePluginLibraryService());
  registerMcpIPC();
  registerSettingsIPC(database, { rendererPersistence: persistence() });
  registerGenerationIPC(database);
  registerAgentProviderProfileIPC(
    new AgentProviderProfileService(
      new CanonicalAgentProviderProfileDB(database),
      createAgentSecretStore({
        userDataPath: profile,
        encryption: transport.encryption,
      }),
    ),
  );
  registerAgentManagementBackupIPC(
    createAgentManagementBackupService({
      profiles: new CanonicalAgentProviderProfileDB(database),
      sessions: new AgentSessionIndexDB(database),
      secrets: createAgentSecretStore({
        userDataPath: profile,
        encryption: transport.encryption,
      }),
      resolveSessionSource: resolveAgentSessionIndexSource,
      transaction: (operation) => database.transaction(operation)(),
    }),
  );
  registerPortableSnapshotIPC(() => {
    transport.relaunches += 1;
  });
}

async function startProfile(destination: string, fresh = false): Promise<void> {
  transport.handlers.clear();
  closeDatabase();
  profile = destination;
  configureRuntimePaths({ userDataPath: profile });
  invalidateCustomPathsCache();
  if (fresh) {
    writeRuntimeLayoutState(profile);
    const initial = initDatabase();
    initial
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
  await openHandlers();
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

async function seedSkill(): Promise<void> {
  const source = path.join(root, "skill-source");
  const content =
    "---\nname: portable-skill\ndescription: Portable fixture\n---\nInstructions\n";
  writeFiles(source, {
    "SKILL.md": content,
    "docs/nested/readme.md": "Complete package",
    "assets/blob.bin": Buffer.from([0, 128, 255]),
  });
  const installed = await window.api.skill.runPackageOperation({
    operation: "install",
    registrySkill: {
      name: "portable-skill",
      slug: "portable-skill",
      description: "Portable fixture",
      category: "general",
      author: "Test",
      version: "1.0.0",
      tags: [],
      source_id: "portable-fixture",
      source_url: source,
      content,
    },
    content,
    source: { kind: "local-directory", directory: source },
  });
  expect(installed.status, JSON.stringify(installed)).toBe("completed");
  if (installed.status !== "completed")
    throw new Error(JSON.stringify(installed));
  await window.api.skill.versionCreate(installed.skill.id, "Package history");
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
  root = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-acceptance-portable-"),
  );
  transport.home = path.join(root, "home");
  fs.mkdirSync(transport.home);
  transport.archive = path.join(root, "portable.zip");
  transport.relaunches = 0;
  storageWindow = new JSDOM("", { url: "https://fixture.invalid" });
  vi.stubGlobal("localStorage", storageWindow.window.localStorage);
  await startProfile(path.join(root, "source-profile"), true);
});

afterEach(() => {
  vi.restoreAllMocks();
  transport.handlers.clear();
  closeDatabase();
  invalidateCustomPathsCache();
  resetRuntimePaths();
  fs.rmSync(root, { recursive: true, force: true });
  storageWindow?.window.close();
  vi.unstubAllGlobals();
  transport.home = "";
});

function seedMcp(id: string): string {
  const bundlePath = path.join(profile, "data", "mcp", id);
  const server = {
    id,
    name: id,
    displayName: id,
    transport: "stdio" as const,
    command: "fixture-command",
    args: [],
    enabled: true,
    env: { TOKEN: "synthetic-fixture-secret" },
    source: { type: "manual" as const },
    createdAt: 1,
    updatedAt: 2,
  };
  materializeMcpServerResourceBundle({
    bundlePath,
    server,
    currentVersion: 2,
    versions: [
      {
        version: 1,
        server: { ...server, updatedAt: 1 },
        createdAt: new Date(1).toISOString(),
      },
      { version: 2, server, createdAt: new Date(2).toISOString() },
    ],
  });
  return bundlePath;
}

function partialEnvelope(
  selected: boolean,
  retainedBundle: string,
): PortableLogicalEnvelope {
  const server = readMcpServerResourceBundle(retainedBundle).server;
  const files = Object.keys(inventory(retainedBundle)).map((relativePath) => {
    const bytes = fs.readFileSync(path.join(retainedBundle, relativePath));
    return {
      relativePath: `retained/${relativePath}`,
      size: bytes.length,
      contentBase64: bytes.toString("base64"),
    };
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
    await seedSkill();
    await seedRuleAndPlugin();
    await persistence().replaceSettings({
      ...settings,
      githubToken: "acceptance-only-token",
    });
    const expected = await consumerSnapshot();
    const agentSettings = new AgentSettingsRepository(database).read();
    const retained = seedMcp("retained");
    seedMcp("removed");
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
    const binding = createMcpBindingConfigDocument({
      deviceId: deriveLocalResourceDeviceId(profile),
      knownServerIds: new Set(["retained", "removed"]),
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
      "config/devices/mcp-bindings.json": JSON.stringify(binding),
      "secrets/fixture-vault.bin": Buffer.from([0, 47, 255, 12]),
    });
    const secretsBefore = inventory(path.join(profile, "secrets"));
    const bindingsBefore = fs.readFileSync(
      path.join(profile, "config", "devices", "mcp-bindings.json"),
    );
    const envelope = partialEnvelope(selected, retained);
    const rename = fs.renameSync;
    let failed = false;
    if (failPublication)
      vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
        if (
          !failed &&
          String(from).includes(".prompthub-restore-stage-") &&
          String(to) === path.join(profile, "config")
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
      const bindingPath = path.join(
        profile,
        "config",
        "devices",
        "mcp-bindings.json",
      );
      if (selected && !failPublication) {
        expect(JSON.parse(fs.readFileSync(bindingPath, "utf8"))).toMatchObject({
          deviceId: binding.deviceId,
          bindings: [{ serverIds: ["retained"] }],
        });
        expect(
          fs.existsSync(path.join(profile, "data", "mcp", "removed")),
        ).toBe(false);
      } else {
        expect(inventory(path.join(profile, "data", "mcp"))).toEqual(mcpBefore);
        expect(fs.readFileSync(bindingPath)).toEqual(bindingsBefore);
      }
      expect(fs.readFileSync(nativePath, "utf8")).toBe(
        "native configuration stays unchanged",
      );
    }
  },
);

it("exports all nonempty content domains through the renderer and restores the real ZIP across two normal startups", async () => {
  await seedPrompts();
  await seedSkill();
  await seedRuleAndPlugin();
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
  expect(expected.rules[0].versions).toHaveLength(2);
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
    expect(normalize(await consumerSnapshot()), startup).toEqual(expectedJson);
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
});

async function seedProviderAndGeneration(name: string): Promise<void> {
  const prompts = await window.api.prompt.getAll();
  const source = prompts.find((prompt) => prompt.currentVersion === 2);
  if (!source) throw new Error("Generation fixture requires a revised Prompt");
  await window.api.agent.createProviderProfile({
    profile: {
      platformId: "codex",
      name,
      providerKind: "openai",
      protocol: "openai",
      endpoint: "https://fixture.invalid/v1",
      config: { fixture: name },
      source: "manual",
    },
    modelMappings: [
      {
        routeKey: "primary",
        modelId: "fixture-image",
        parameters: { reasoningEffort: "high" },
      },
    ],
  });
  const batch = await window.api.generation.create({
    title: name,
    sourcePromptId: source.id,
    sourcePromptVersion: source.currentVersion,
    variableValues: { subject: name },
    referenceImages: [
      { source: "prompt", fileName: "pixel.png", promptId: source.id },
    ],
    prompt: `Fixture output ${name}`,
    model: {
      id: "fixture-image",
      provider: "openai",
      model: "fixture-image",
      name: "Fixture image",
    },
    targetCount: 1,
    quality: "hd",
    aspectRatio: "1:1",
  });
  await window.api.generation.markSlotRunning(batch.id, 0);
  const completed = await window.api.generation.commitOutput({
    batchId: batch.id,
    slotIndex: 0,
    mimeType: "image/png",
    base64: imageBytes.toString("base64"),
    revisedPrompt: name,
  });
  const output = completed.slots[0].output;
  if (!output) throw new Error("Generation fixture output is missing");
  await window.api.generation.setFavorite({
    batchId: batch.id,
    outputId: output.id,
    favorite: true,
  });
}

async function providerGenerationSnapshot() {
  const batches = await window.api.generation.list();
  const generationRoot = path.join(profile, "data", "generations");
  const files = inventory(generationRoot);
  return {
    providers: await window.api.agent.listProviderProfiles({
      includeArchived: true,
    }),
    batches,
    outputs: await Promise.all(
      batches.flatMap((batch) =>
        batch.slots.flatMap((slot) =>
          slot.output
            ? [
                window.api.generation.readOutputReference({
                  batchId: batch.id,
                  outputId: slot.output.id,
                }),
              ]
            : [],
        ),
      ),
    ),
    files,
    bundleManifests: Object.fromEntries(
      Object.keys(files)
        .filter((file) => file.endsWith("/manifest.json"))
        .map((file) => [
          file,
          readResourceBundle(path.dirname(path.join(generationRoot, file)))
            .manifest,
        ]),
    ),
  };
}

it.each([
  { selectedSettings: true, failPublication: false },
  { selectedSettings: false, failPublication: false },
  { selectedSettings: true, failPublication: true },
])(
  "joins nonempty Provider and Generation in one ZIP (settings=$selectedSettings, failure=$failPublication)",
  async ({ selectedSettings, failPublication }) => {
    await seedPrompts();
    await seedSkill();
    await seedRuleAndPlugin();
    await seedProviderAndGeneration("Source provider");
    const sourceRoot = profile;
    const normalize = (value: unknown): unknown =>
      JSON.parse(JSON.stringify(value).split(sourceRoot).join("<profile>"));
    const source = normalize(await consumerSnapshot());
    const sourceExtra = await providerGenerationSnapshot();
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
      Object.keys(entries).some((entry) => entry.startsWith("data/agents/")),
    ).toBe(true);
    await startProfile(sourceRoot);
    expect(normalize(await consumerSnapshot())).toEqual(source);
    expect(await providerGenerationSnapshot()).toEqual(sourceExtra);
    closeDatabase();
    const sourceInventory = inventory(path.join(sourceRoot, "data"));
    const destination = path.join(root, "provider-generation-target");
    await startProfile(destination, true);
    await seedPrompts();
    await seedSkill();
    await seedRuleAndPlugin(path.join(root, "target-inputs"));
    await seedProviderAndGeneration("Target provider");
    const targetSettings = { ...settings, themeMode: "light", language: "fr" };
    await persistence().replaceSettings(targetSettings);
    const target = await consumerSnapshot();
    const targetExtra = await providerGenerationSnapshot();
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
          String(to) === path.join(destination, "config")
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
      const extra = await providerGenerationSnapshot();
      expect
        .soft(extra, startup)
        .toEqual(failPublication ? targetExtra : sourceExtra);
      for (const batch of extra.batches)
        for (const slot of batch.slots) {
          if (!slot.output) throw new Error("Joined fixture output is missing");
          expect(
            fs.readFileSync(
              readContentAddressedObject(
                path.join(destination, "data", "assets", "objects"),
                slot.output.sha256,
              ).path,
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
