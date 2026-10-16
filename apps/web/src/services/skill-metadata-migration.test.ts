import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { closeDatabase, SkillDB } from "@prompthub/db";
import {
  ENV_KEYS,
  originalEnv,
  createTestApp,
  registerUser,
} from "../routes/import-export.test-helpers";

let root: string;
const TEST_TIMEOUT = 20000;
beforeEach(() => {
  vi.resetModules();
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ph-web-skill-migration-"));
});
afterEach(() => {
  vi.restoreAllMocks();
  closeDatabase();
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  fs.rmSync(root, { recursive: true, force: true });
});
async function fixture() {
  const app = await createTestApp(root);
  const owner = (await registerUser(app, "owner", "fixture-password")).payload
    .data;
  const { getServerDatabase } = await import("../database");
  const db = getServerDatabase();
  db.run(
    "DELETE FROM schema_migrations WHERE name = ?",
    "web-skill-metadata-v1",
  );
  // Reconstruct the pre-payload-migration schema for the historical input fixture.
  db.run(
    "DELETE FROM schema_migrations WHERE name = ?",
    "skill-payload-files-v1",
  );
  for (const trigger of [
    "skills_reject_sql_payload_insert",
    "skills_reject_sql_payload_update",
    "skill_versions_reject_sql_payload_insert",
    "skill_versions_reject_sql_payload_update",
  ])
    db.exec(`DROP TRIGGER ${trigger}`);
  const repository = new SkillDB(db);
  const skill = repository.create({
    name: "Historical",
    content: "Body",
    ownerUserId: owner.user.id,
    visibility: "private",
    protocol_type: "skill",
    is_favorite: false,
    local_repo_path: "/not-a-server-path",
  });
  const version = repository.createVersion(skill.id, "Saved")!;
  const directory = path.join(
    root,
    "data",
    "skills",
    `historical__${skill.id}`,
  );
  fs.mkdirSync(path.join(directory, "versions"), { recursive: true });
  const metadata = {
    ...skill,
    content: undefined,
    instructions: undefined,
    currentVersion: 1,
    description: null,
  };
  fs.writeFileSync(
    path.join(directory, "skill.json"),
    JSON.stringify(metadata),
  );
  fs.writeFileSync(path.join(directory, "SKILL.md"), "Body");
  fs.writeFileSync(
    path.join(directory, "asset.bin"),
    Buffer.from([0, 255, 128]),
  );
  fs.writeFileSync(
    path.join(directory, "versions", "0001.json"),
    JSON.stringify(version),
  );
  const { migrateWebSkillMetadata } =
    await import("./skill-metadata-migration");
  const migrate = () =>
    migrateWebSkillMetadata(db, root, path.join(root, "data", "prompthub.db"));
  return { db, repository, skill, directory, metadata, migrate };
}
it(
  "migrates file-only metadata and full package/history alongside SQL data, retires sources and does not resurrect deletes",
  async () => {
    const { db, repository, skill, directory, migrate } = await fixture();
    repository.delete(skill.id);
    const retained = repository.create({
      name: "SQL only",
      content: "SQL content",
      protocol_type: "skill",
      is_favorite: false,
    });
    migrate();
    expect(repository.getById(skill.id)).toMatchObject({
      ownerUserId: skill.ownerUserId,
      content: "Body",
    });
    expect(repository.getVersions(skill.id)).toHaveLength(1);
    const { getWebSkillPackagePath } = await import("./skill-workspace");
    expect(
      fs.readFileSync(path.join(getWebSkillPackagePath(skill.id), "asset.bin")),
    ).toEqual(Buffer.from([0, 255, 128]));
    expect(
      fs.readFileSync(
        path.join(getWebSkillPackagePath(retained.id), "SKILL.md"),
        "utf8",
      ),
    ).toBe("SQL content");
    expect(fs.existsSync(directory)).toBe(false);
    const recovery = path.join(root, "recovery", "web-skill-metadata-v1");
    expect(fs.readdirSync(recovery).length).toBe(1);
    const recoveryTree = path.join(recovery, fs.readdirSync(recovery)[0]);
    expect(
      fs.readFileSync(
        path.join(recoveryTree, path.basename(directory), "asset.bin"),
      ),
    ).toEqual(Buffer.from([0, 255, 128]));
    repository.delete(skill.id);
    migrate();
    expect(repository.getById(skill.id)).toBeNull();
    expect(
      db.get(
        "SELECT name FROM schema_migrations WHERE name = ?",
        "web-skill-metadata-v1",
      ),
    ).toBeTruthy();
  },
  TEST_TIMEOUT,
);
it(
  "rejects unknown owners and conflicting metadata without changing SQL or the old tree",
  async () => {
    const { repository, skill, directory, metadata, migrate } = await fixture();
    fs.writeFileSync(
      path.join(directory, "skill.json"),
      JSON.stringify({ ...metadata, ownerUserId: "unknown" }),
    );
    expect(migrate).toThrow(/owner/i);
    expect(repository.getById(skill.id)?.ownerUserId).toBe(skill.ownerUserId);
    fs.writeFileSync(
      path.join(directory, "skill.json"),
      JSON.stringify({ ...metadata, description: "invalid\0description" }),
    );
    expect(migrate).toThrow(/null byte/);

    fs.writeFileSync(
      path.join(directory, "skill.json"),
      JSON.stringify({ ...metadata, name: "Different" }),
    );
    expect(migrate).toThrow(/conflict/i);
    expect(repository.getById(skill.id)?.name).toBe("Historical");
    expect(fs.readFileSync(path.join(directory, "SKILL.md"), "utf8")).toBe(
      "Body",
    );
  },
  TEST_TIMEOUT,
);
it(
  "rolls back a failed migration, preserves the original package and permits a verified retry",
  async () => {
    const { db, repository, skill, directory, migrate } = await fixture();
    db.exec(
      "CREATE TRIGGER reject_skill_migration BEFORE INSERT ON schema_migrations WHEN NEW.name = 'web-skill-metadata-v1' BEGIN SELECT RAISE(ABORT, 'migration failure'); END",
    );
    expect(migrate).toThrow("migration failure");
    expect(fs.readFileSync(path.join(directory, "asset.bin"))).toEqual(
      Buffer.from([0, 255, 128]),
    );
    expect(repository.getVersions(skill.id)).toHaveLength(1);
    db.exec("DROP TRIGGER reject_skill_migration");
    migrate();
    expect(fs.existsSync(directory)).toBe(false);
    expect(repository.getVersions(skill.id)).toHaveLength(1);
  },
  TEST_TIMEOUT,
);
it(
  "rejects symlink packages and missing historical entrypoints before publication",
  async () => {
    const { directory, migrate } = await fixture();
    fs.unlinkSync(path.join(directory, "SKILL.md"));
    expect(migrate).toThrow();
    fs.symlinkSync("/etc/hosts", path.join(directory, "SKILL.md"));
    expect(migrate).toThrow(/symbolic|unsafe/i);
    expect(
      fs.lstatSync(path.join(directory, "SKILL.md")).isSymbolicLink(),
    ).toBe(true);
  },
  TEST_TIMEOUT,
);

it(
  "upgrades legacy Web history through server startup and preserves payloads across two reopens",
  async () => {
    const { repository, skill, migrate } = await fixture();
    const versions = repository.getVersions(skill.id);
    migrate();
    for (let pass = 0; pass < 2; pass++) {
      closeDatabase();
      vi.resetModules();
      await createTestApp(root);
      const { getServerDatabase } = await import("../database");
      const { WebSkillStorage } = await import("./skill-storage");
      const db = getServerDatabase();
      const current = new WebSkillStorage(db);
      expect(current.getById(skill.id)?.content).toBe("Body");
      expect(current.getVersions(skill.id)).toEqual(versions);
      expect(current.capturePackage(skill.id)).toContainEqual({
        relativePath: "asset.bin",
        content: "AP+A",
        encoding: "base64",
      });
      expect(
        db.get("SELECT COUNT(*) AS n FROM skills WHERE content IS NOT NULL"),
      ).toEqual({ n: 0 });
      expect(
        db.get(
          "SELECT COUNT(*) AS n FROM skill_versions WHERE content IS NOT NULL OR files_snapshot IS NOT NULL",
        ),
      ).toEqual({ n: 0 });
    }
  },
  TEST_TIMEOUT,
);
