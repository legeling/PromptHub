import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { DatabaseAdapter, SCHEMA, SkillDB } from "@prompthub/db";
import {
  materializeResourceBundle,
  readResourceBundle,
} from "../src/resource-bundle";
import { readSkillResourceBundle } from "../src/skill-resource-schema";
import { migrateSkillPackageInternalsV1 } from "../src/migrations/skill-package-internals-v1";
import { reconcileCanonicalStorageCatalog } from "../src/canonical-catalog-reconciliation";
import { materializeCanonicalStorageShadow } from "../src/canonical-storage-shadow";
import { collectPromptCanonicalGraph } from "../src/prompt-canonical-export";
import { FolderDB, PromptDB } from "@prompthub/db";
import { CanonicalSkillDB } from "../src/canonical-skill-db";
import { configureRuntimePaths, resetRuntimePaths } from "../src/runtime-paths";
import {
  writeCanonicalStorageAuthority,
  writeRuntimeLayoutState,
} from "../src";

const roots: string[] = [];
const legacyFile = "files/.prompthub/translations/中文/full/SKILL.md";
function fixture(): { root: string; bundle: string } {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "skill-package-migration-"),
  );
  roots.push(root);
  const data = path.join(root, "data");
  const db = new DatabaseAdapter(":memory:");
  try {
    db.exec(SCHEMA);
    materializeCanonicalStorageShadow({
      targetPath: data,
      prompts: collectPromptCanonicalGraph(
        new PromptDB(db),
        new FolderDB(db),
        db,
      ),
    });
  } finally {
    db.close();
  }
  const sources = path.join(root, "sources");
  fs.mkdirSync(sources);
  const skill = {
    id: "writer",
    name: "Writer",
    description: "Write",
    content: "# Writer",
    instructions: "# Writer",
    protocol_type: "skill",
    visibility: "private",
    is_favorite: true,
    currentVersion: 1,
    created_at: 1,
    updated_at: 2,
  };
  const version = {
    id: "version-1",
    skillId: "writer",
    version: 1,
    content: "# Writer",
    note: "preserve",
    createdAt: "2026-09-01T00:00:00.000Z",
  };
  const files = [
    {
      path: "skill.json",
      role: "current",
      content: JSON.stringify({
        kind: "prompthub-skill-resource",
        schemaVersion: 1,
        skill,
      }),
    },
    {
      path: "versions/000001.json",
      role: "version",
      content: JSON.stringify({
        kind: "prompthub-skill-version-resource",
        schemaVersion: 1,
        version,
      }),
    },
    { path: "files/SKILL.md", role: "package", content: "# Writer" },
    {
      path: "files/assets/icon.bin",
      role: "package",
      content: Buffer.from([0, 255, 128]),
    },
    { path: legacyFile, role: "package", content: "翻译内容" },
  ];
  const bundle = path.join(data, "skills", "writer");
  materializeResourceBundle({
    bundlePath: bundle,
    resourceType: "skill",
    resourceId: "writer",
    schemaVersion: 1,
    revision: 3,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    extraFields: { retainedField: "keep" },
    payloads: files.map((file, index) => {
      const sourcePath = path.join(sources, String(index));
      fs.writeFileSync(sourcePath, file.content);
      return { path: file.path, role: file.role, sourcePath };
    }),
  });
  return { root, bundle };
}

afterEach(() => {
  resetRuntimePaths();
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

it("upgrades historical packages through startup catalog reconciliation and reopens usable Skill data", () => {
  const { root, bundle } = fixture();
  expect(() => readSkillResourceBundle(bundle)).toThrow(
    "package path is unsafe",
  );
  const original = readResourceBundle(bundle).manifest;
  const databasePath = path.join(root, "data", "prompthub.db");
  expect(
    reconcileCanonicalStorageCatalog({ activeRoot: root, databasePath }).status,
  ).toBe("rebuilt");
  const current = readSkillResourceBundle(bundle);
  expect(current.packageFiles.map((file) => file.path).sort()).toEqual([
    "SKILL.md",
    "assets/icon.bin",
  ]);
  expect(current.versions[0]).toMatchObject({
    id: "version-1",
    note: "preserve",
  });
  expect(current.bundleManifest).toMatchObject({
    revision: 4,
    retainedField: "keep",
  });
  const archive = path.join(
    root,
    "recovery",
    "skill-package-internals-v1",
    "writer",
    original.contentHash,
  );
  expect(readResourceBundle(archive).manifest).toEqual(original);
  expect(fs.readFileSync(path.join(archive, legacyFile), "utf8")).toBe(
    "翻译内容",
  );
  configureRuntimePaths({ userDataPath: root });
  writeRuntimeLayoutState(root);
  writeCanonicalStorageAuthority(root, {
    consistencyId: "d".repeat(64),
    operationId: "migration-test",
  });
  const database = new DatabaseAdapter(databasePath);
  try {
    const skills = new CanonicalSkillDB(database);
    skills.reconcileCanonicalWorkspaces();
    const loaded = skills.getById("writer");
    expect(loaded?.is_favorite).toBe(true);
    expect(
      fs.readFileSync(path.join(loaded!.local_repo_path!, "assets/icon.bin")),
    ).toEqual(Buffer.from([0, 255, 128]));
    skills.update("writer", { description: "After upgrade" });
  } finally {
    database.close();
  }
  const reopened = new DatabaseAdapter(databasePath);
  try {
    expect(new SkillDB(reopened).getById("writer")?.description).toBe(
      "After upgrade",
    );
  } finally {
    reopened.close();
  }
  expect(migrateSkillPackageInternalsV1(root)).toBe(0);
});

it("rolls back a failed publication and succeeds on retry without losing the historical source", () => {
  const { root, bundle } = fixture();
  const before = readResourceBundle(bundle).manifest;
  expect(() =>
    migrateSkillPackageInternalsV1(root, (target) => {
      if (target === bundle) throw new Error("injected write failure");
    }),
  ).toThrow("injected write failure");
  expect(readResourceBundle(bundle).manifest).toEqual(before);
  expect(migrateSkillPackageInternalsV1(root)).toBe(1);
  expect(migrateSkillPackageInternalsV1(root)).toBe(0);
});

it("rejects corrupt source bytes and preserves the source instead of adopting them", () => {
  const { root, bundle } = fixture();
  fs.writeFileSync(path.join(bundle, legacyFile), "corrupt");
  const before = fs.readFileSync(path.join(bundle, "manifest.json"));
  expect(() => migrateSkillPackageInternalsV1(root)).toThrow();
  expect(fs.readFileSync(path.join(bundle, "manifest.json"))).toEqual(before);
  expect(
    fs.existsSync(path.join(root, "recovery", "skill-package-internals-v1")),
  ).toBe(false);
});

it("rejects symlinked package inputs without modifying their targets", () => {
  const { root, bundle } = fixture();
  const file = path.join(bundle, legacyFile);
  const outside = path.join(root, "outside");
  fs.writeFileSync(outside, "keep");
  fs.rmSync(file);
  fs.symlinkSync(outside, file);
  expect(() => migrateSkillPackageInternalsV1(root)).toThrow();
  expect(fs.readFileSync(outside, "utf8")).toBe("keep");
});

it("leaves loose workspaces to recovery rather than treating them as bundles", () => {
  const { root } = fixture();
  const loose = path.join(root, "data", "skills", "loose");
  fs.mkdirSync(loose);
  fs.writeFileSync(path.join(loose, "SKILL.md"), "preserve loose input");
  expect(migrateSkillPackageInternalsV1(root)).toBe(1);
  expect(fs.readFileSync(path.join(loose, "SKILL.md"), "utf8")).toBe(
    "preserve loose input",
  );
});
