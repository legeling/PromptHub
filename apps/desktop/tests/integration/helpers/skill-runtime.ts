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
import { invalidateCustomPathsCache } from "../../../src/main/services/skill-installer-utils";
export { skillApi } from "../../../src/preload/api/skill";

const transport = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    handlers,
    async invoke(channel: string, ...args: unknown[]): Promise<unknown> {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`Unregistered IPC channel: ${channel}`);
      return structuredClone(await handler({}, ...structuredClone(args)));
    },
  };
});

// Only Electron transport is substituted. Every registered handler, business
// service, storage publisher, SQLite query and filesystem operation is real.
vi.mock("electron", () => ({
  ipcMain: {
    handle(channel: string, handler: (...args: unknown[]) => unknown) {
      if (transport.handlers.has(channel))
        throw new Error(`Duplicate IPC channel: ${channel}`);
      transport.handlers.set(channel, handler);
    },
  },
  ipcRenderer: { invoke: transport.invoke },
}));

export const invokeSkillIPC = transport.invoke;

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
  initDatabase();
  const rendererPersistence = createRendererPersistenceStore({
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

export async function createSkillTestRuntime(): Promise<SkillTestRuntime> {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-skill-functional-"),
  );
  const profile = path.join(root, "profile");
  const isolatedHome = path.join(root, "home");
  fs.mkdirSync(profile);
  fs.mkdirSync(isolatedHome);
  const home = vi.spyOn(os, "homedir").mockReturnValue(isolatedHome);
  const platformRoot = (id: string) => path.join(root, "platforms", id);
  const dispose = () => {
    transport.handlers.clear();
    closeDatabase();
    invalidateCustomPathsCache();
    resetRuntimePaths();
    home.mockRestore();
    fs.rmSync(root, { recursive: true, force: true });
  };
  try {
    await prepareFreshProfile(profile);
    await openSkillRuntime(profile, platformRoot);
    return {
      root,
      profile,
      platformRoot,
      source: path.join(root, "source"),
      dispose,
      async reopen() {
        transport.handlers.clear();
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
