/** @vitest-environment node */
import { CanonicalPostCommitError } from "@prompthub/core/canonical-entry-publication";
import { getOperationsDir } from "@prompthub/core/runtime-paths";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseAdapter, SCHEMA } from "@prompthub/db";
import { CanonicalSkillDB } from "@prompthub/core/canonical-skill-db";
import {
  configureRuntimePaths,
  resetRuntimePaths,
} from "@prompthub/core/runtime-paths";
import {
  sharedSkillDistributionService,
  writeCanonicalStorageAuthority,
  writeRuntimeLayoutState,
} from "@prompthub/core";
import { IPC_CHANNELS } from "@prompthub/shared/constants";
import { registerSkillCrudHandlers } from "../../../src/main/ipc/skill/crud-handlers";

const mocks = vi.hoisted(() => ({
  root: "",
  platforms: vi.fn(() => [{ id: "claude" }]),
  handle: vi.fn(),
  inspect: vi.fn(),
  conflicts: vi.fn(),
  install: vi.fn(),
  link: vi.fn(),
  uninstall: vi.fn(),
}));
vi.mock("electron", () => ({ ipcMain: { handle: mocks.handle } }));
vi.mock("../../../src/main/services/skill-installer", () => ({
  SkillInstaller: {
    getSupportedPlatforms: mocks.platforms,
    getSkillMdInstallStatusDetailsForSkill: mocks.inspect,
    getSkillMdInstallStatusDetails: mocks.conflicts,
    installSkillMdForSkill: mocks.install,
    installSkillMdSymlinkForSkill: mocks.link,
    uninstallSkillMdForSkill: mocks.uninstall,
  },
}));
vi.mock("../../../src/main/services/skill-installer-utils", () => ({
  getPlatformSkillsDir: () => path.join(mocks.root, "platform"),
}));
vi.mock("../../../src/main/ipc/skill/shared", () => ({
  ensureLocalRepoPath: vi.fn(),
}));
vi.mock("../../../src/main/services/skill-installer-repo", () => ({
  isInternalSkillRepoEntry: vi.fn(() => false),
}));

describe("Skill CRUD IPC", () => {
  let root: string;
  let database: DatabaseAdapter.Database;
  let db: CanonicalSkillDB;
  let handlers: Map<string, (...args: unknown[]) => Promise<unknown>>;
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.inspect.mockResolvedValue({});
    mocks.conflicts.mockResolvedValue({});
    mocks.install.mockResolvedValue(undefined);
    mocks.link.mockResolvedValue({ effectiveMode: "symlink" });
    mocks.uninstall.mockResolvedValue(undefined);
    root = fs.mkdtempSync(path.join(os.tmpdir(), "skill-ipc-crud-"));
    mocks.root = root;
    fs.mkdirSync(path.join(root, "platform/writer"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "platform/writer/SKILL.md"),
      "Platform modified",
    );
    configureRuntimePaths({ userDataPath: root });
    writeRuntimeLayoutState(root);
    writeCanonicalStorageAuthority(root, {
      consistencyId: "d".repeat(64),
      operationId: "crud-ipc",
    });
    database = new DatabaseAdapter(":memory:");
    database.exec(SCHEMA);
    db = new CanonicalSkillDB(database);
    registerSkillCrudHandlers({ db });
    handlers = new Map(mocks.handle.mock.calls);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    database.close();
    resetRuntimePaths();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const call = (channel: string, ...args: unknown[]) =>
    handlers.get(channel)!(null, ...args);
  async function create() {
    await call(IPC_CHANNELS.SKILL_CREATE, {
      name: "writer",
      protocol_type: "skill",
      content: "Original",
    });
    return db.getAll()[0];
  }
  it("creates and updates the actual package through a single IPC call", async () => {
    const skill = await create();
    await call(IPC_CHANNELS.SKILL_UPDATE, skill.id, { content: "Updated" });
    expect(
      fs.readFileSync(path.join(skill.local_repo_path!, "SKILL.md"), "utf8"),
    ).toContain("Updated");
    expect(
      db.getVersions(skill.id).at(-1)?.filesSnapshot?.[0].content,
    ).toContain("Original");
  });
  it("renames distributions using exact old/new identities without cross-name cleanup", async () => {
    const skill = await create();
    mocks.inspect.mockResolvedValue({
      claude: { installed: true, mode: "copy" },
      codex: { installed: true, mode: "symlink" },
    });
    await call(IPC_CHANNELS.SKILL_UPDATE, skill.id, { name: "author" });
    expect(mocks.install.mock.calls[0][0].name).toBe("author");
    expect(mocks.link.mock.calls[0][0].name).toBe("author");
    expect(
      mocks.uninstall.mock.calls.map((c) => [c[0].name, c.length]),
    ).toEqual([
      ["writer", 2],
      ["writer", 2],
    ]);
    expect(db.getById(skill.id)?.name).toBe("author");
    expect(db.getById(skill.id)?.local_repo_path).toBe(skill.local_repo_path);
  });
  it("preserves the library identity and reports failed deployment during rename", async () => {
    const skill = await create();
    mocks.inspect.mockResolvedValue({
      claude: { installed: true, mode: "copy" },
    });
    mocks.install.mockRejectedValueOnce(new Error("ENOSPC"));
    await expect(
      call(IPC_CHANNELS.SKILL_UPDATE, skill.id, { name: "author" }),
    ).rejects.toThrow("ENOSPC");
    expect(db.getById(skill.id)?.name).toBe("writer");
    expect(mocks.uninstall).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: "writer" }),
      expect.anything(),
    );
  });
  it("rejects rename collisions without modifying the library or distribution", async () => {
    const skill = await create();
    mocks.inspect.mockResolvedValue({
      claude: { installed: true, mode: "copy" },
    });
    mocks.conflicts.mockResolvedValue({
      claude: { installed: true, mode: "copy" },
    });
    await expect(
      call(IPC_CHANNELS.SKILL_UPDATE, skill.id, { name: "author" }),
    ).rejects.toThrow(/already exists/);
    expect(mocks.install).not.toHaveBeenCalled();
    expect(db.getById(skill.id)?.name).toBe("writer");
  });
  it("retains the canonical package and library record when uninstall fails, then supports retry", async () => {
    const skill = await create();
    mocks.inspect.mockResolvedValue({
      claude: { installed: true, mode: "copy" },
    });
    mocks.uninstall.mockRejectedValueOnce(new Error("EACCES"));
    await expect(call(IPC_CHANNELS.SKILL_DELETE, skill.id)).rejects.toThrow(
      "EACCES",
    );
    expect(db.getById(skill.id)).not.toBeNull();
    expect(fs.existsSync(skill.local_repo_path!)).toBe(true);
    await expect(call(IPC_CHANNELS.SKILL_DELETE, skill.id)).resolves.toBe(true);
    expect(db.getById(skill.id)).toBeNull();
    expect(fs.existsSync(skill.local_repo_path!)).toBe(false);
  });
  it("honors copy retention while removing symlinks and the shared target", async () => {
    const skill = await create();
    mocks.inspect.mockResolvedValue({
      claude: { installed: true, mode: "copy" },
      codex: { installed: true, mode: "symlink" },
      "agent-skills-global": { installed: true, mode: "symlink" },
    });
    await call(IPC_CHANNELS.SKILL_DELETE, skill.id, {
      removeCopyInstallations: false,
    });
    expect(mocks.uninstall.mock.calls.map((c) => c[1])).toEqual([
      "codex",
      "agent-skills-global",
    ]);
  });
  it("propagates canonical delete failures and rejects invalid CRUD input", async () => {
    const skill = await create();
    vi.spyOn(db, "delete").mockImplementationOnce(() => {
      throw new Error("EACCES");
    });
    await expect(call(IPC_CHANNELS.SKILL_DELETE, skill.id)).rejects.toThrow(
      "EACCES",
    );
    expect(db.getById(skill.id)).not.toBeNull();
    await expect(
      call(IPC_CHANNELS.SKILL_DELETE, skill.id, {
        removeCopyInstallations: "yes",
      }),
    ).rejects.toThrow(/boolean/);
    await expect(
      call(IPC_CHANNELS.SKILL_CREATE, {
        name: "writer",
        source_url: "https://github.com/example/skills",
      }),
    ).rejects.toThrow(/runPackageOperation/);
    await expect(call(IPC_CHANNELS.SKILL_UPDATE, "", {})).rejects.toThrow(/id/);
    await expect(call(IPC_CHANNELS.SKILL_UPDATE, skill.id, [])).rejects.toThrow(
      /object/,
    );
  });
  it("reports incomplete rename recovery and retains the actual copied backup", async () => {
    const skill = await create();
    mocks.inspect.mockResolvedValue({
      claude: { installed: true, mode: "copy" },
    });
    mocks.install
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("restore denied"));
    mocks.uninstall
      .mockRejectedValueOnce(new Error("remove denied"))
      .mockRejectedValueOnce(new Error("cleanup denied"));
    await expect(
      call(IPC_CHANNELS.SKILL_UPDATE, skill.id, { name: "author" }),
    ).rejects.toThrow(/files retained/);
    expect(db.getById(skill.id)?.name).toBe("writer");
    const backup = fs
      .readdirSync(getOperationsDir())
      .find((name) => name.startsWith("skill-rename-"));
    expect(
      fs.readFileSync(
        path.join(getOperationsDir(), backup!, "0/SKILL.md"),
        "utf8",
      ),
    ).toBe("Platform modified");
  });
  it("does not undo distributions after a committed canonical publication", async () => {
    const skill = await create();
    mocks.inspect.mockResolvedValue({
      codex: { installed: true, mode: "symlink" },
    });
    const commit = db.finalizePackageUpdate.bind(db);
    vi.spyOn(db, "finalizePackageUpdate").mockImplementationOnce((...args) => {
      commit(...args);
      throw new CanonicalPostCommitError("test", new Error("cache busy"));
    });
    await expect(
      call(IPC_CHANNELS.SKILL_UPDATE, skill.id, { name: "author" }),
    ).rejects.toThrow();
    expect(db.getById(skill.id)?.name).toBe("author");
    expect(mocks.uninstall.mock.calls.map((c) => c[0].name)).toEqual([
      "writer",
    ]);
  });
  it("restores symlink targets when deletion fails and rejects unknown target paths", async () => {
    const skill = await create();
    mocks.inspect.mockResolvedValue({
      codex: { installed: true, mode: "symlink" },
    });
    mocks.uninstall.mockRejectedValueOnce(new Error("remove denied"));
    await expect(
      call(IPC_CHANNELS.SKILL_UPDATE, skill.id, { name: "author" }),
    ).rejects.toThrow("remove denied");
    expect(mocks.link.mock.calls.map((c) => c[0].name)).toEqual([
      "author",
      "writer",
    ]);
    mocks.inspect.mockResolvedValue({
      unknown: { installed: true, mode: "copy" },
    });
    await expect(
      call(IPC_CHANNELS.SKILL_UPDATE, skill.id, { name: "author" }),
    ).rejects.toThrow(/Cannot resolve/);
    await expect(
      call(IPC_CHANNELS.SKILL_UPDATE, "missing", {}),
    ).resolves.toBeNull();
    await expect(call(IPC_CHANNELS.SKILL_DELETE, "missing")).resolves.toBe(
      false,
    );
  });
  it("backs up the shared copy target before renaming it", async () => {
    const skill = await create();
    mocks.inspect.mockResolvedValue({
      "agent-skills-global": { installed: true, mode: "copy" },
    });
    vi.spyOn(sharedSkillDistributionService, "getStatus").mockResolvedValueOnce(
      {
        state: "managed-clean",
        targetId: "agent-skills-global",
        targetRoot: path.join(root, "platform"),
        targetPath: path.join(root, "platform/writer"),
        effectiveMode: "copy",
      },
    );
    await call(IPC_CHANNELS.SKILL_UPDATE, skill.id, { name: "author" });
    expect(mocks.install.mock.calls[0][2]).toBe("agent-skills-global");
    expect(db.getById(skill.id)?.name).toBe("author");
  });
});
