import fs from "node:fs";
import path from "node:path";
import type { SkillVersion, SkillFileSnapshot } from "@prompthub/shared/types";
import {
  decodeSkillFileSnapshot,
  validateSkillFileSnapshots,
} from "@prompthub/shared/utils/skill-file-snapshot";
import type { CanonicalEntryMutation } from "./canonical-entry-publication";
import { encodeCanonicalResourceDirectory } from "./canonical-resource-path";
import { getSkillsDir, getUserDataPath } from "./runtime-paths";
import { assertStoragePathComponentsSafe } from "./runtime-storage-context";
import { readSkillEntrypoint } from "./skill-storage-files";

interface PayloadIndex {
  hasContent: boolean;
  files?: Array<Pick<SkillFileSnapshot, "relativePath" | "encoding">>;
}

export function getSkillHistoryDirectory(
  skillId: string,
  skillsRoot = getSkillsDir(),
): string {
  // The library's existing internal-directory policy keeps saved packages out of discovery.
  return path.join(
    skillsRoot,
    ".prompthub",
    "versions",
    encodeCanonicalResourceDirectory(skillId),
  );
}

export function getSkillVersionPayloadPath(
  skillId: string,
  versionId: string,
  skillsRoot = getSkillsDir(),
): string {
  return path.join(
    getSkillHistoryDirectory(skillId, skillsRoot),
    encodeCanonicalResourceDirectory(versionId),
  );
}

function parseIndex(value: unknown): PayloadIndex {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !("hasContent" in value) ||
    typeof value.hasContent !== "boolean"
  )
    throw new Error("Invalid Skill history payload index");
  const files = "files" in value ? value.files : undefined;
  if (
    files !== undefined &&
    (!Array.isArray(files) ||
      files.some(
        (file: unknown) =>
          !file ||
          typeof file !== "object" ||
          !("relativePath" in file) ||
          typeof file.relativePath !== "string" ||
          ("encoding" in file &&
            file.encoding !== "utf8" &&
            file.encoding !== "base64"),
      ))
  )
    throw new Error("Invalid Skill history file inventory");
  // Shape is checked above; the shared validator checks paths, duplicates and encodings.
  const index = { hasContent: value.hasContent, files } as PayloadIndex;
  if (index.files)
    validateSkillFileSnapshots(
      index.files.map((file) => ({ ...file, content: "" })),
    );
  return index;
}

export function readSkillVersionPayload(
  version: SkillVersion,
  skillsRoot = getSkillsDir(),
  root = getUserDataPath(),
): SkillVersion {
  const directory = getSkillVersionPayloadPath(
    version.skillId,
    version.id,
    skillsRoot,
  );
  assertStoragePathComponentsSafe(root, directory);
  const index = parseIndex(
    JSON.parse(readSkillEntrypoint(path.join(directory, "index.json"))),
  );
  const content = index.hasContent
    ? readSkillEntrypoint(path.join(directory, "content.md"))
    : undefined;
  const filesSnapshot = index.files?.map((file) => {
    const source = path.join(
      directory,
      "files",
      ...file.relativePath.split("/"),
    );
    assertStoragePathComponentsSafe(root, source);
    if (!fs.lstatSync(source).isFile())
      throw new Error("Skill history payload is not a regular file");
    return {
      ...file,
      content:
        file.encoding === "base64"
          ? fs.readFileSync(source).toString("base64")
          : readSkillEntrypoint(source),
    };
  });
  if (filesSnapshot) validateSkillFileSnapshots(filesSnapshot);
  return {
    ...version,
    ...(content !== undefined ? { content } : {}),
    filesSnapshot,
  };
}

export function skillVersionPayloadEntry(
  version: SkillVersion,
  skillsRoot = getSkillsDir(),
  root = getUserDataPath(),
): CanonicalEntryMutation {
  const targetPath = getSkillVersionPayloadPath(
    version.skillId,
    version.id,
    skillsRoot,
  );
  assertStoragePathComponentsSafe(root, targetPath);
  if (version.content?.includes("\0"))
    throw new Error("Skill history content contains null bytes");
  if (version.filesSnapshot) validateSkillFileSnapshots(version.filesSnapshot);
  return {
    targetPath,
    prepare(stage) {
      fs.mkdirSync(stage, { recursive: true, mode: 0o700 });
      if (version.content !== undefined)
        fs.writeFileSync(path.join(stage, "content.md"), version.content, {
          mode: 0o600,
        });
      const index: PayloadIndex = { hasContent: version.content !== undefined };
      if (version.filesSnapshot !== undefined) {
        index.files = [];
        for (const file of version.filesSnapshot) {
          const target = path.join(
            stage,
            "files",
            ...file.relativePath.split("/"),
          );
          fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
          fs.writeFileSync(target, decodeSkillFileSnapshot(file), {
            mode: 0o600,
            flag: "wx",
          });
          index.files.push({
            relativePath: file.relativePath,
            ...(file.encoding !== undefined ? { encoding: file.encoding } : {}),
          });
        }
      }
      fs.writeFileSync(path.join(stage, "index.json"), JSON.stringify(index), {
        mode: 0o600,
      });
    },
  };
}
