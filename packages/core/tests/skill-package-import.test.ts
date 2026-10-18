import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { DatabaseAdapter, SCHEMA } from "@prompthub/db";
import { SkillStorageDB } from "../src/skill-storage";
import { createSkillZip } from "../src/skills/export";
import { readSkillPackageZip } from "../src/skills/import-package";

it("imports a complete uploaded package atomically and rejects duplicate or unsafe input", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "skill-upload-"));
  const db = new DatabaseAdapter(path.join(root, "prompthub.db"));
  db.exec(SCHEMA);
  try {
    const store = new SkillStorageDB(db, {
      rootPath: root,
      skillsRoot: path.join(root, "skills"),
      allowLinkedPackages: false,
    });
    const files = [
      {
        relativePath: "SKILL.md",
        content: "---\nname: uploaded\ndescription: test\n---\nFull package",
      },
      {
        relativePath: "assets/icon.bin",
        content: "AP8D",
        encoding: "base64" as const,
      },
    ];
    const uploaded = readSkillPackageZip(createSkillZip(files));
    const metadata = {
      name: "uploaded",
      protocol_type: "skill" as const,
      is_favorite: false,
    };
    const skill = store.createFromPackage(metadata, uploaded);
    expect(store.capturePackage(skill.id)).toEqual(
      expect.arrayContaining(files),
    );
    expect(
      fs.readFileSync(path.join(skill.local_repo_path!, "assets/icon.bin")),
    ).toEqual(Buffer.from([0, 255, 3]));
    expect(() => store.createFromPackage(metadata, uploaded)).toThrow();
    expect(() =>
      store.createFromPackage({ ...metadata, name: "unsafe" }, [
        ...files,
        { relativePath: "../outside", content: "bad" },
      ]),
    ).toThrow();
    expect(store.getAll()).toHaveLength(1);
    db.exec(
      "CREATE TRIGGER reject_upload BEFORE INSERT ON skills BEGIN SELECT RAISE(ABORT, 'disk failure'); END",
    );
    expect(() =>
      store.createFromPackage({ ...metadata, name: "failed" }, files),
    ).toThrow(/disk failure/);
    expect(store.getAll()).toHaveLength(1);
    expect(fs.readdirSync(path.join(root, "skills"))).toEqual([skill.id]);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
