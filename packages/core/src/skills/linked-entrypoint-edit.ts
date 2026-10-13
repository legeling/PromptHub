import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { SkillDB } from "@prompthub/db";
import type {
  Skill,
  SkillFileSnapshot,
  UpdateSkillParams,
} from "@prompthub/shared/types";
import { isCanonicalCommitOutcomeError } from "../canonical-entry-publication";

function writeEntrypoint(entry: string, content: string): void {
  const mode = fs.lstatSync(entry).mode;
  const temporary = path.join(
    path.dirname(entry),
    `.prompthub-skill-edit-${randomUUID()}.tmp`,
  );
  try {
    fs.writeFileSync(temporary, content, { flag: "wx", mode });
    fs.renameSync(temporary, entry);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

/** Metadata edits must retain the selected external package and compensate failed publication. */
export function commitLinkedSkillEdit(
  db: SkillDB,
  id: string,
  input: {
    directory: string;
    expectedContent: string;
    content: string;
    data: UpdateSkillParams;
    previous: Skill;
    files: SkillFileSnapshot[];
  },
): Skill {
  const entry = path.join(input.directory, "SKILL.md");
  const descriptor = fs.openSync(
    entry,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
  );
  try {
    if (
      !fs.fstatSync(descriptor).isFile() ||
      fs.readFileSync(descriptor, "utf8") !== input.expectedContent
    )
      throw new Error("Linked Skill changed during editing; reload and retry");
  } finally {
    fs.closeSync(descriptor);
  }
  writeEntrypoint(entry, input.content);
  try {
    const result = db.finalizePackageUpdate(
      id,
      input.data,
      "Before editing Skill",
      input.files,
      input.previous,
    );
    if (!result) throw new Error("Skill disappeared during save");
    return result.skill;
  } catch (error) {
    if (isCanonicalCommitOutcomeError(error)) throw error;
    try {
      writeEntrypoint(entry, input.expectedContent);
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        "Linked Skill edit failed; entrypoint restoration failed",
      );
    }
    throw error;
  }
}
