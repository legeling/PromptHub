import fs from "node:fs";
import { createSkillPackageIgnoreMatcher } from "@prompthub/shared/utils/skill-package-policy";
import path from "node:path";
import type { DatabaseAdapter } from "@prompthub/db";
import { encodeCanonicalResourceDirectory } from "./canonical-resource-path";

/** External Skill packages become owned portable packages; external targets are never written. */
export function captureSnapshotSkillPackages(
  db: DatabaseAdapter.Database,
  sourceRoot: string,
  candidateRoot: string,
): void {
  const rows = db.all(
    "SELECT id,local_repo_path,canonical_skill_path FROM skills WHERE local_repo_path IS NOT NULL",
  ) as Array<{
    id: string;
    local_repo_path: string;
    canonical_skill_path: string | null;
  }>;
  for (const row of rows) {
    const source = path.resolve(row.local_repo_path);
    const relative = path.relative(sourceRoot, source);
    const internal =
      relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative);
    if (internal) {
      if (!fs.existsSync(path.join(candidateRoot, relative)))
        throw new Error(`Skill package missing from snapshot: ${row.id}`);
      continue;
    }
    const destination = path.join(
      "data",
      "skills",
      encodeCanonicalResourceDirectory(row.id),
      "files",
    );
    if (fs.existsSync(path.join(candidateRoot, destination)))
      throw new Error(`Conflicting Skill package: ${row.id}`);
    const ignoreFile = path.join(source, ".prompthubignore");
    if (fs.existsSync(ignoreFile) && fs.lstatSync(ignoreFile).isSymbolicLink())
      throw new Error("Symbolic link in Skill ignore rules");
    const ignore = createSkillPackageIgnoreMatcher(
      fs.existsSync(ignoreFile) ? fs.readFileSync(ignoreFile, "utf8") : "",
    );
    fs.cpSync(source, path.join(candidateRoot, destination), {
      recursive: true,
      dereference: false,
      filter(file) {
        if (fs.lstatSync(file).isSymbolicLink())
          throw new Error("Symbolic link in external Skill package");
        return !ignore(path.relative(source, file).split(path.sep).join("/"));
      },
    });
    const target = path.join(sourceRoot, destination);
    db.run("UPDATE skills SET local_repo_path=? WHERE id=?", target, row.id);
    if (row.canonical_skill_path && path.isAbsolute(row.canonical_skill_path)) {
      const nested = path.relative(source, row.canonical_skill_path);
      if (!nested.startsWith("..") && !path.isAbsolute(nested))
        db.run(
          "UPDATE skills SET canonical_skill_path=? WHERE id=?",
          path.join(target, nested),
          row.id,
        );
    }
  }
}
