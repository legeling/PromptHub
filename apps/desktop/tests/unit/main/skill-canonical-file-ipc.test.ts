// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseAdapter, SCHEMA } from "@prompthub/db";
import { IPC_CHANNELS } from "@prompthub/shared/constants";
import { CanonicalSkillDB } from "@prompthub/core/canonical-skill-db";
import {
  configureRuntimePaths,
  resetRuntimePaths,
  writeRuntimeLayoutState,
} from "@prompthub/core/runtime-paths";
import { writeCanonicalStorageAuthority } from "@prompthub/core/canonical-storage-authority";
import {
  getCanonicalSkillWorkspacePath,
  hydrateCanonicalSkillWorkspace,
} from "@prompthub/core/canonical-skill-library";

const { handle } = vi.hoisted(() => ({ handle: vi.fn() }));
vi.mock("electron", () => ({ ipcMain: { handle } }));
vi.mock("../../../src/main/services/skill-installer", () => ({
  SkillInstaller: { isManagedRepoPath: async () => false },
}));
vi.mock("../../../src/main/services/skill-repo-sync", () => ({
  buildSkillSyncUpdateFromRepo: vi.fn(),
  computeRepoDirectoryFingerprint: vi.fn(),
}));
import { registerSkillLocalRepoHandlers } from "../../../src/main/ipc/skill/local-repo-handlers";
import { registerSkillVersionHandlers } from "../../../src/main/ipc/skill/version-handlers";

describe("canonical Skill file IPC with real SQLite and filesystem", () => {
  let root: string;
  let database: DatabaseAdapter.Database;
  let db: CanonicalSkillDB;
  let id: string;
  let cache: string;
  let handlers: Record<string, (...args: unknown[]) => Promise<unknown>>;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "skill-ipc-durable-"));
    configureRuntimePaths({ userDataPath: root });
    writeRuntimeLayoutState(root);
    writeCanonicalStorageAuthority(root, {
      consistencyId: "a".repeat(64),
      operationId: "skill-ipc-test",
    });
    database = new DatabaseAdapter(":memory:");
    database.exec(SCHEMA);
    db = new CanonicalSkillDB(database);
    const source = path.join(root, "source");
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, "SKILL.md"), "# Skill");
    fs.writeFileSync(path.join(source, "asset.bin"), Buffer.from([0, 255]));
    id = db.create({
      name: "IPC Skill",
      content: "# Skill",
      is_favorite: false,
      local_repo_path: source,
    }).id;
    cache = getCanonicalSkillWorkspacePath(id);
    handle.mockClear();
    registerSkillLocalRepoHandlers({ db });
    registerSkillVersionHandlers({ db });
    handlers = Object.fromEntries(handle.mock.calls);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    database.close();
    resetRuntimePaths();
    fs.rmSync(root, { recursive: true, force: true });
  });
  it("publishes editor write/rename/delete requests before cache reconstruction", async () => {
    await handlers[IPC_CHANNELS.SKILL_WRITE_LOCAL_FILE](
      null,
      id,
      "helper.py",
      "print(1)",
    );
    await handlers[IPC_CHANNELS.SKILL_RENAME_LOCAL_PATH](
      null,
      id,
      "helper.py",
      "nested/helper.py",
    );
    await handlers[IPC_CHANNELS.SKILL_DELETE_LOCAL_FILE](null, id, "asset.bin");
    fs.rmSync(cache, { recursive: true });
    hydrateCanonicalSkillWorkspace(id);
    expect(fs.readFileSync(path.join(cache, "nested/helper.py"), "utf8")).toBe(
      "print(1)",
    );
    expect(fs.existsSync(path.join(cache, "asset.bin"))).toBe(false);
  });
  it("captures and restores lossless snapshots through registered IPC handlers", async () => {
    const snapshot = await handlers[IPC_CHANNELS.SKILL_READ_FILES_SNAPSHOT](
      null,
      id,
    );
    expect(snapshot).toContainEqual({
      relativePath: "asset.bin",
      content: "AP8=",
      encoding: "base64",
    });
    await handlers[IPC_CHANNELS.SKILL_VERSION_CREATE](null, id, "bytes");
    expect(db.getVersions(id)[0].filesSnapshot).toEqual(snapshot);
    await handlers[IPC_CHANNELS.SKILL_REPLACE_FILES_SNAPSHOT](null, id, [
      { relativePath: "asset.bin", content: "AAE=", encoding: "base64" },
    ]);
    hydrateCanonicalSkillWorkspace(id);
    expect(fs.readFileSync(path.join(cache, "SKILL.md"), "utf8")).toBe(
      "# Skill",
    );
    expect(fs.readFileSync(path.join(cache, "asset.bin"))).toEqual(
      Buffer.from([0, 1]),
    );
  });
  it("rejects malformed snapshots before publication and leaves the package unchanged on IO failure", async () => {
    await expect(
      handlers[IPC_CHANNELS.SKILL_READ_FILES_SNAPSHOT](null, ""),
    ).rejects.toThrow(/non-empty/);
    await expect(
      handlers[IPC_CHANNELS.SKILL_REPLACE_FILES_SNAPSHOT](null, "", []),
    ).rejects.toThrow(/non-empty/);
    await expect(
      handlers[IPC_CHANNELS.SKILL_REPLACE_FILES_SNAPSHOT](null, id, [
        { relativePath: "x", content: "bad", encoding: "future" },
      ]),
    ).rejects.toThrow(/encoding/);
    vi.spyOn(db, "update").mockImplementation(() => {
      throw new Error("publication denied");
    });
    await expect(
      handlers[IPC_CHANNELS.SKILL_WRITE_LOCAL_FILE](
        null,
        id,
        "helper.py",
        "new",
      ),
    ).rejects.toThrow("publication denied");
    expect(fs.existsSync(path.join(cache, "helper.py"))).toBe(false);
    expect(fs.readFileSync(path.join(cache, "asset.bin"))).toEqual(
      Buffer.from([0, 255]),
    );
  });
});
