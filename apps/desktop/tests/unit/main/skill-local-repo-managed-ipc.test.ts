/** @vitest-environment node */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  configureRuntimePaths,
  resetRuntimePaths,
} from "@prompthub/core/runtime-paths";
import { DatabaseAdapter, SCHEMA } from "@prompthub/db";
import { SkillDB } from "../../../src/main/database/skill";
import { IPC_CHANNELS } from "@prompthub/shared/constants";

const handlers = vi.hoisted(
  () => new Map<string, (...args: unknown[]) => Promise<unknown>>(),
);
vi.mock("electron", () => ({
  ipcMain: {
    handle: (
      channel: string,
      handler: (...args: unknown[]) => Promise<unknown>,
    ) => handlers.set(channel, handler),
  },
}));
import { registerSkillLocalRepoHandlers } from "../../../src/main/ipc/skill/local-repo-handlers";

let root: string;
let database: DatabaseAdapter;
let repository: SkillDB;
let skillId: string;
let packagePath: string;
beforeEach(() => {
  root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "ph-managed-skill-ipc-")),
  );
  configureRuntimePaths({ userDataPath: root });
  database = new DatabaseAdapter(path.join(root, "skill.db"));
  database.exec(SCHEMA);
  repository = new SkillDB(database);
  const skill = repository.create({
    name: "writer",
    content: "# Writer",
    protocol_type: "skill",
    is_favorite: false,
  });
  if (!skill.local_repo_path) throw new Error("Missing managed package");
  skillId = skill.id;
  packagePath = skill.local_repo_path;
  fs.mkdirSync(path.join(packagePath, "scripts"));
  fs.writeFileSync(path.join(packagePath, "scripts", "main.ts"), "original");
  fs.writeFileSync(
    path.join(packagePath, "binary.bin"),
    Buffer.from([0, 255, 128]),
  );
  repository.createVersion(skillId, "Before editing");
  handlers.clear();
  registerSkillLocalRepoHandlers({ db: repository });
});
afterEach(() => {
  database.close();
  handlers.clear();
  resetRuntimePaths();
  fs.rmSync(root, { recursive: true, force: true });
});
async function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = handlers.get(channel);
  if (!handler) throw new Error(`Missing handler: ${channel}`);
  return handler(null, skillId, ...args);
}
function reopen(): void {
  database.close();
  database = new DatabaseAdapter(path.join(root, "skill.db"));
  repository = new SkillDB(database);
}
it("writes, renames and deletes managed package files through IPC without creating versions", async () => {
  const history = repository.getVersions(skillId);
  await invoke(
    IPC_CHANNELS.SKILL_WRITE_LOCAL_FILE,
    "scripts/main.ts",
    "updated",
  );
  await invoke(
    IPC_CHANNELS.SKILL_RENAME_LOCAL_PATH,
    "scripts/main.ts",
    "scripts/renamed.ts",
  );
  expect(
    fs.readFileSync(path.join(packagePath, "scripts", "renamed.ts"), "utf8"),
  ).toBe("updated");
  await invoke(IPC_CHANNELS.SKILL_DELETE_LOCAL_FILE, "scripts/renamed.ts");
  reopen();
  expect(fs.existsSync(path.join(packagePath, "scripts", "main.ts"))).toBe(
    false,
  );
  expect(fs.existsSync(path.join(packagePath, "scripts", "renamed.ts"))).toBe(
    false,
  );
  expect(fs.readFileSync(path.join(packagePath, "binary.bin"))).toEqual(
    Buffer.from([0, 255, 128]),
  );
  expect(repository.getVersions(skillId)).toEqual(history);
  expect(repository.getById(skillId)?.local_repo_path).toBe(packagePath);
});
it("persists the edited entrypoint and fingerprint through IPC and database reopen", async () => {
  const history = repository.getVersions(skillId);
  await invoke(IPC_CHANNELS.SKILL_WRITE_LOCAL_FILE, "SKILL.md", "# Updated");
  reopen();
  expect(repository.getById(skillId)).toMatchObject({
    content: "# Updated",
    instructions: "# Updated",
    local_repo_path: packagePath,
  });
  expect(repository.getById(skillId)?.directory_fingerprint).toMatch(
    /^[a-f0-9]{64}$/,
  );
  expect(fs.readFileSync(path.join(packagePath, "SKILL.md"), "utf8")).toBe(
    "# Updated",
  );
  expect(repository.getVersions(skillId)).toEqual(history);
});
it("rejects entrypoint deletion and leaves the entire package and history readable", async () => {
  const history = repository.getVersions(skillId);
  await expect(
    invoke(IPC_CHANNELS.SKILL_DELETE_LOCAL_FILE, "SKILL.md"),
  ).rejects.toThrow(/entrypoint/);
  reopen();
  expect(fs.readFileSync(path.join(packagePath, "SKILL.md"), "utf8")).toBe(
    "# Writer",
  );
  expect(repository.getVersions(skillId)).toEqual(history);
  expect(repository.getById(skillId)?.content).toBe("# Writer");
});
