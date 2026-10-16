import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { closeDatabase } from "@prompthub/db";
import type { Skill } from "@prompthub/shared";
import {
  ENV_KEYS,
  originalEnv,
  createTestApp,
  registerUser,
  authHeaders,
} from "../routes/import-export.test-helpers";

let root: string;
const TEST_TIMEOUT = 20000;
beforeEach(() => {
  vi.resetModules();
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ph-web-skill-sql-"));
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

async function context() {
  const app = await createTestApp(root);
  const owner = (await registerUser(app, "owner", "fixture-password")).payload
    .data;
  const { SkillService } = await import("./skill.service");
  const { getServerDatabase } = await import("../database");
  return {
    app,
    owner,
    actor: { userId: owner.user.id, role: owner.user.role },
    service: new SkillService(),
    db: getServerDatabase(),
  };
}

it(
  "persists authenticated CRUD and history without JSON mirrors, preserves package bytes and survives reopen",
  async () => {
    const { app, owner, service, actor } = await context();
    const headers = authHeaders(owner.accessToken);
    const response = await app.request("/api/skills", {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "Original",
        content: "First",
        visibility: "private",
        local_repo_path: "/client/unreadable",
      }),
    });
    expect(response.status).toBe(201);
    const created: Skill = (await response.json()).data;
    const { getWebSkillPackagePath } = await import("./skill-workspace");
    const directory = getWebSkillPackagePath(created.id);
    fs.mkdirSync(path.join(directory, "assets"));
    fs.writeFileSync(
      path.join(directory, "assets", "icon.bin"),
      Buffer.from([0, 255, 128]),
    );
    expect(
      (
        await app.request(`/api/skills/${created.id}/versions`, {
          method: "POST",
          headers,
          body: JSON.stringify({ note: "First package" }),
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await app.request(`/api/skills/${created.id}`, {
          method: "PUT",
          headers,
          body: JSON.stringify({ name: "Renamed", content: "Second" }),
        })
      ).status,
    ).toBe(200);
    expect(fs.readFileSync(path.join(directory, "SKILL.md"), "utf8")).toBe(
      "Second",
    );
    expect(
      service.getVersions(actor, created.id)[0].filesSnapshot,
    ).toContainEqual({
      relativePath: "assets/icon.bin",
      content: "AP+A",
      encoding: "base64",
    });
    expect(fs.existsSync(path.join(root, "data", "skills"))).toBe(false);
    expect(fs.readdirSync(directory).sort()).toEqual(["SKILL.md", "assets"]);
    expect(
      (
        await app.request(`/api/skills/${created.id}/versions/1/rollback`, {
          method: "POST",
          headers,
        })
      ).status,
    ).toBe(200);
    expect(fs.readFileSync(path.join(directory, "SKILL.md"), "utf8")).toBe(
      "First",
    );
    closeDatabase();
    vi.resetModules();
    const reopened = await createTestApp(root);
    const read = await reopened.request(`/api/skills/${created.id}`, {
      headers,
    });
    expect(read.status).toBe(200);
    expect((await read.json()).data).toMatchObject({
      id: created.id,
      name: "Renamed",
      content: "First",
      ownerUserId: owner.user.id,
    });
    expect(
      (
        await reopened.request(`/api/skills/${created.id}`, {
          method: "DELETE",
          headers,
        })
      ).status,
    ).toBe(200);
    expect(fs.existsSync(directory)).toBe(false);
    closeDatabase();
    vi.resetModules();
    expect(
      (
        await (
          await createTestApp(root)
        ).request(`/api/skills/${created.id}`, { headers })
      ).status,
    ).toBe(404);
  },
  TEST_TIMEOUT,
);

it(
  "rolls back package and SQL together on failed content save or deletion",
  async () => {
    const { service, actor, db } = await context();
    const skill = service.create(actor, {
      name: "Stable",
      content: "Before",
      protocol_type: "skill",
      is_favorite: false,
    });
    const { getWebSkillPackagePath } = await import("./skill-workspace");
    const file = path.join(getWebSkillPackagePath(skill.id), "SKILL.md");
    db.exec(
      "CREATE TRIGGER reject_skill_update BEFORE UPDATE ON skills BEGIN SELECT RAISE(ABORT, 'blocked update'); END",
    );
    expect(() => service.update(actor, skill.id, { content: "After" })).toThrow(
      "blocked update",
    );
    expect(service.getById(actor, skill.id).content).toBe("Before");
    expect(fs.readFileSync(file, "utf8")).toBe("Before");
    db.exec("DROP TRIGGER reject_skill_update");
    db.exec(
      "CREATE TRIGGER reject_skill_delete BEFORE DELETE ON skills BEGIN SELECT RAISE(ABORT, 'blocked delete'); END",
    );
    expect(() => service.delete(actor, skill.id)).toThrow("blocked delete");
    expect(service.getById(actor, skill.id).content).toBe("Before");
    expect(fs.readFileSync(file, "utf8")).toBe("Before");
  },
  TEST_TIMEOUT,
);

it(
  "does not scan or rewrite unrelated packages for metadata updates and refuses missing packages on export",
  async () => {
    const { service, actor } = await context();
    const first = service.create(actor, {
      name: "First",
      content: "One",
      protocol_type: "skill",
      is_favorite: false,
    });
    const other = service.create(actor, {
      name: "Other",
      content: "Two",
      protocol_type: "skill",
      is_favorite: false,
    });
    const { getWebSkillPackagePath, collectSkillWorkspaceFiles } =
      await import("./skill-workspace");
    const directory = getWebSkillPackagePath(other.id);
    fs.rmSync(directory, { recursive: true });
    service.update(actor, first.id, { description: "Only metadata" });
    expect(service.getById(actor, first.id).description).toBe("Only metadata");
    expect(() => collectSkillWorkspaceFiles([other])).toThrow();
    expect(fs.existsSync(directory)).toBe(false);
  },
  TEST_TIMEOUT,
);

it(
  "restores binary packages with SQL and preserves both on a late backup failure",
  async () => {
    const { service, actor, db } = await context();
    const skill = service.create(actor, {
      name: "Backup",
      content: "Before",
      protocol_type: "skill",
      is_favorite: false,
    });
    const { BackupService } = await import("./backup.service");
    const { getWebSkillPackagePath } = await import("./skill-workspace");
    const backup = new BackupService();
    const snapshot = backup.export(actor);
    snapshot.skills[0].updated_at += 1000;
    snapshot.skills[0].content = "Restored";
    snapshot.skillFiles = {
      [skill.id]: [
        { relativePath: "SKILL.md", content: "Restored" },
        { relativePath: "asset.bin", content: "AP+A", encoding: "base64" },
      ],
    };
    db.exec(
      "CREATE TRIGGER reject_settings BEFORE INSERT ON user_settings BEGIN SELECT RAISE(ABORT, 'late backup failure'); END",
    );
    expect(() =>
      backup.import(actor, snapshot, { forceSettingsImport: true }),
    ).toThrow("late backup failure");
    expect(service.getById(actor, skill.id).content).toBe("Before");
    expect(
      fs.readFileSync(
        path.join(getWebSkillPackagePath(skill.id), "SKILL.md"),
        "utf8",
      ),
    ).toBe("Before");
    expect(
      fs.existsSync(path.join(getWebSkillPackagePath(skill.id), "asset.bin")),
    ).toBe(false);
    db.exec("DROP TRIGGER reject_settings");
    backup.import(actor, snapshot, { forceSettingsImport: true });
    expect(service.getById(actor, skill.id).content).toBe("Restored");
    expect(
      fs.readFileSync(path.join(getWebSkillPackagePath(skill.id), "asset.bin")),
    ).toEqual(Buffer.from([0, 255, 128]));
    snapshot.skills[0].updated_at = 1;
    snapshot.skillFiles[skill.id][0].content = "Stale";
    backup.import(actor, snapshot);
    expect(service.getById(actor, skill.id).content).toBe("Restored");
    expect(
      fs.readFileSync(
        path.join(getWebSkillPackagePath(skill.id), "SKILL.md"),
        "utf8",
      ),
    ).toBe("Restored");
  },
  TEST_TIMEOUT,
);

it(
  "rejects restoring another user Skill identity and does not merge different identities by name",
  async () => {
    const { app, service, actor } = await context();
    const skill = service.create(actor, {
      name: "Same name",
      content: "Owner",
      protocol_type: "skill",
      is_favorite: false,
      visibility: "private",
    });
    const other = (await registerUser(app, "other", "fixture-password")).payload
      .data;
    const otherActor = { userId: other.user.id, role: other.user.role };
    const { BackupService } = await import("./backup.service");
    const backup = new BackupService();
    const snapshot = backup.export(actor);
    snapshot.skills[0].updated_at += 1000;
    expect(() => backup.import(otherActor, snapshot)).toThrow(
      /owner|another user/i,
    );
    expect(service.getById(actor, skill.id).content).toBe("Owner");
    snapshot.skills[0].id = "separate-id";
    snapshot.skillFiles = {
      "separate-id": [{ relativePath: "SKILL.md", content: "Other" }],
    };
    backup.import(otherActor, snapshot);
    expect(service.getById(otherActor, "separate-id").content).toBe("Other");
    expect(service.getById(actor, skill.id).content).toBe("Owner");
  },
  TEST_TIMEOUT,
);

it(
  "preserves SQL and package bytes when staging fails or an unsafe snapshot is rejected",
  async () => {
    const { service, actor } = await context();
    const skill = service.create(actor, {
      name: "Write failure",
      content: "Original",
      protocol_type: "skill",
      is_favorite: false,
    });
    const { getWebSkillPackagePath, validateSkillWorkspaceSnapshotPaths } =
      await import("./skill-workspace");
    const write = fs.writeFileSync.bind(fs);
    vi.spyOn(fs, "writeFileSync").mockImplementation((file, data, options) => {
      if (
        typeof file === "string" &&
        file.endsWith("SKILL.md") &&
        data === "Interrupted"
      )
        throw new Error("staging interrupted");
      return write(file, data, options);
    });
    expect(() =>
      service.update(actor, skill.id, { content: "Interrupted" }),
    ).toThrow("staging interrupted");
    for (const relativePath of ["../escape", "/absolute", "bad\0file"]) {
      expect(() =>
        validateSkillWorkspaceSnapshotPaths([skill], [], {
          [skill.id]: [{ relativePath, content: "Unsafe" }],
        }),
      ).toThrow();
    }
    expect(() =>
      service.update(actor, skill.id, { content: "Invalid\0body" }),
    ).toThrow();
    expect(service.getById(actor, skill.id).content).toBe("Original");
    expect(
      fs.readFileSync(
        path.join(getWebSkillPackagePath(skill.id), "SKILL.md"),
        "utf8",
      ),
    ).toBe("Original");
  },
  TEST_TIMEOUT,
);
it(
  "recovers the shared Skill publication receipt during server reopen",
  async () => {
    const { service, actor } = await context();
    const skill = service.create(actor, {
      name: "Receipt",
      content: "Before",
      protocol_type: "skill",
      is_favorite: false,
    });
    const rename = fs.renameSync.bind(fs);
    vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
      if (
        String(to).endsWith("skill-storage-publication.json") &&
        JSON.parse(fs.readFileSync(from, "utf8")).state === "committed"
      )
        throw new Error("injected journal failure");
      return rename(from, to);
    });
    expect(() =>
      service.update(actor, skill.id, { content: "Committed" }),
    ).toThrow(/outcome is unknown/);
    vi.restoreAllMocks();
    closeDatabase();
    vi.resetModules();
    await createTestApp(root);
    const { SkillService } = await import("./skill.service");
    expect(new SkillService().getById(actor, skill.id).content).toBe(
      "Committed",
    );
    const { recoverStorageEntryPublications } =
      await import("@prompthub/core/sqlite-entry-publication");
    expect(recoverStorageEntryPublications(root)).toEqual([]);
  },
  TEST_TIMEOUT,
);
