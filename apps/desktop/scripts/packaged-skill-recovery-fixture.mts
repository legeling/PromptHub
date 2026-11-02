import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DIRECTORY_NAME = "未完成安装 目录";
const BINARY_BYTES = Buffer.from([0, 255, 128, 17]);
const ENTRYPOINT =
  "---\nname: preserved-package\ndescription: Upgrade fixture\n---\nOriginal Skill content\n";

export function seedPackagedSkillRecovery(userDataPath: string): void {
  const source = path.join(userDataPath, "skills", DIRECTORY_NAME);
  fs.mkdirSync(path.join(source, "nested", "assets", "empty"), {
    recursive: true,
  });
  fs.writeFileSync(path.join(source, "nested", "SKILL.md"), ENTRYPOINT);
  fs.writeFileSync(
    path.join(source, "nested", "assets", "image.bin"),
    BINARY_BYTES,
  );
  fs.writeFileSync(path.join(source, ".notes"), "Preserved hidden file");
}

function verifyDirectory(source: string): void {
  assert.equal(
    fs.readFileSync(path.join(source, "nested", "SKILL.md"), "utf8"),
    ENTRYPOINT,
  );
  assert.deepEqual(
    fs.readFileSync(path.join(source, "nested", "assets", "image.bin")),
    BINARY_BYTES,
  );
  assert.equal(
    fs.readFileSync(path.join(source, ".notes"), "utf8"),
    "Preserved hidden file",
  );
  assert.deepEqual(
    fs.readdirSync(path.join(source, "nested", "assets", "empty")),
    [],
  );
}

export function verifyBlockedSkillRecovery(userDataPath: string): void {
  verifyDirectory(path.join(userDataPath, "data", "skills", DIRECTORY_NAME));
}

export function verifyPackagedSkillRecovery(userDataPath: string): void {
  const registry = path.join(
    userDataPath,
    "recovery",
    "skill-directory-recovery-v1",
  );
  const entries = fs.readdirSync(registry);
  assert.equal(
    entries.length,
    1,
    "Restart must not create duplicate recovery archives",
  );
  const archive = path.join(registry, entries[0]);
  const manifest = JSON.parse(
    fs.readFileSync(path.join(archive, "manifest.json"), "utf8"),
  );
  assert.deepEqual(manifest.sourceDirectories, [
    `data/skills/${DIRECTORY_NAME}`,
  ]);
  verifyDirectory(path.join(archive, "directories", DIRECTORY_NAME));
  assert.equal(
    fs.existsSync(path.join(userDataPath, "data", "skills", DIRECTORY_NAME)),
    false,
  );
}
