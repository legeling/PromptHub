import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { vi } from "vitest";
import {
  createRendererPersistenceStore,
  writeRuntimeLayoutState,
} from "@prompthub/core";
import { SKILL_PLATFORMS } from "@prompthub/shared/constants/platforms";
import {
  closeDatabase,
  initDatabase,
  SkillDB,
} from "../../../src/main/database";
import {
  configureRuntimePaths,
  getDatabasePath,
  resetRuntimePaths,
} from "../../../src/main/runtime-paths";
import { registerSkillIPC } from "../../../src/main/ipc/skill.ipc";
import { ensureCanonicalStorageAuthorityOnStartup } from "../../../src/main/services/canonical-storage-startup";
import {
  invalidateCustomPathsCache,
  resolvePlatformPath,
} from "../../../src/main/services/skill-installer-utils";
export { skillApi } from "../../../src/preload/api/skill";

const isolatedHomePath = vi.hoisted((): { current: string | null } => ({
  current: null,
}));
// A late spy on the default export does not replace homedir captured by
// `import * as os`. Both import forms must resolve the same isolated home.
vi.mock("os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  const homedir = () => isolatedHomePath.current ?? actual.homedir();
  return { ...actual, homedir, default: { ...actual, homedir } };
});

const transport = await vi.hoisted(async () => {
  const { EventEmitter } = await import("node:events");
  const renderer = new EventEmitter();
  const sender = Object.assign(new EventEmitter(), {
    id: 1,
    send(channel: string, ...args: unknown[]): void {
      renderer.emit(channel, {}, ...structuredClone(args));
    },
  });
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    handlers,
    renderer,
    clear(): void {
      sender.emit("destroyed");
      sender.removeAllListeners();
      renderer.removeAllListeners();
      handlers.clear();
    },
    async invoke(channel: string, ...args: unknown[]): Promise<unknown> {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`Unregistered IPC channel: ${channel}`);
      return structuredClone(
        await handler({ sender }, ...structuredClone(args)),
      );
    },
  };
});

// Electron transport and the home path are substituted. Every registered
// handler, business service, SQLite query and filesystem operation is real.
vi.mock("electron", () => ({
  ipcMain: {
    handle(channel: string, handler: (...args: unknown[]) => unknown) {
      if (transport.handlers.has(channel))
        throw new Error(`Duplicate IPC channel: ${channel}`);
      transport.handlers.set(channel, handler);
    },
  },
  ipcRenderer: {
    invoke: transport.invoke,
    on: transport.renderer.on.bind(transport.renderer),
    removeListener: transport.renderer.removeListener.bind(transport.renderer),
  },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: () => {
      throw new Error("No test secrets may be encrypted");
    },
    decryptString: () => {
      throw new Error("No test secrets may be decrypted");
    },
  },
  session: { defaultSession: { setProxy: async () => undefined } },
}));

export const invokeSkillIPC = transport.invoke;
export const clearSkillIPC = transport.clear;

export interface SkillTestRuntime {
  root: string;
  profile: string;
  source: string;
  platformRoot: (id: string) => string;
  reopen: () => Promise<void>;
  dispose: () => void;
}

async function openSkillRuntime(
  profile: string,
  platformRoot: (id: string) => string,
): Promise<void> {
  configureRuntimePaths({ userDataPath: profile });
  const database = initDatabase();
  const roots = Object.fromEntries(
    SKILL_PLATFORMS.map((platform) => [
      platform.id,
      { rootPath: platformRoot(platform.id) },
    ]),
  );
  database
    .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
    .run("builtinAgentOverrides", JSON.stringify(roots));
  invalidateCustomPathsCache();
  await registerSkillIPC(new SkillDB(database));
}

async function prepareFreshProfile(profile: string): Promise<void> {
  configureRuntimePaths({ userDataPath: profile });
  writeRuntimeLayoutState(profile);
  const database = initDatabase();
  const rendererPersistence = createRendererPersistenceStore({
      database: database,
    rootPath: profile,
    encryption: {
      isEncryptionAvailable: () => false,
      encryptString: () => {
        throw new Error("No test secrets may be written");
      },
      decryptString: () => {
        throw new Error("No test secrets may be read");
      },
    },
  });
  await rendererPersistence.migrate({ indexedDbMigrationDone: true });
  closeDatabase();
  const result = await ensureCanonicalStorageAuthorityOnStartup({
    activeRoot: profile,
    sourceDatabasePath: getDatabasePath(),
  });
  if (result.status !== "published")
    throw new Error(`Fresh profile did not become ready: ${result.status}`);
}

export async function createSkillTestRuntime(
  options: { freshStartup?: boolean } = {},
): Promise<SkillTestRuntime> {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-skill-functional-"),
  );
  const profile = path.join(root, "profile");
  const isolatedHome = path.join(root, "home");
  fs.mkdirSync(profile);
  fs.mkdirSync(isolatedHome);
  isolatedHomePath.current = isolatedHome;
  const platformRoot = (id: string) => path.join(root, "platforms", id);
  const dispose = () => {
    transport.clear();
    closeDatabase();
    invalidateCustomPathsCache();
    resetRuntimePaths();
    isolatedHomePath.current = null;
    fs.rmSync(root, { recursive: true, force: true });
  };
  try {
    if (resolvePlatformPath("~") !== isolatedHome) {
      throw new Error(
        "Skill test home isolation must be active before loading services",
      );
    }
    if (options.freshStartup) {
      configureRuntimePaths({ userDataPath: profile });
      writeRuntimeLayoutState(profile);
      const startup = await ensureCanonicalStorageAuthorityOnStartup({
        activeRoot: profile,
        sourceDatabasePath: getDatabasePath(),
      });
      if (startup.status !== "waiting-renderer-migration")
        throw new Error(`Unexpected fresh startup: ${startup.status}`);
    } else await prepareFreshProfile(profile);
    await openSkillRuntime(profile, platformRoot);
    return {
      root,
      profile,
      platformRoot,
      source: path.join(root, "source"),
      dispose,
      async reopen() {
        transport.clear();
        closeDatabase();
        await ensureCanonicalStorageAuthorityOnStartup({
          activeRoot: profile,
          sourceDatabasePath: getDatabasePath(),
        });
        await openSkillRuntime(profile, platformRoot);
      },
    };
  } catch (error) {
    dispose();
    throw error;
  }
}

export function fileInventory(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  function visit(directory: string): void {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      // Workspace hydration metadata is not a distributable package member.
      if (directory === root && entry.name === ".canonical-bundle-hash")
        continue;
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(entryPath);
      else if (entry.isFile())
        files[path.relative(root, entryPath).split(path.sep).join("/")] = fs
          .readFileSync(entryPath)
          .toString("base64");
      else if (entry.isSymbolicLink())
        files[path.relative(root, entryPath)] =
          `link:${fs.readlinkSync(entryPath)}`;
    }
  }
  visit(root);
  return files;
}
