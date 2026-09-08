import type {
  SkillFileSnapshot,
  SkillLocalFileEntry,
  SkillVersion,
} from "@prompthub/shared/types";
import {
  decodeSkillFileSnapshot,
  skillSnapshotByteLength,
} from "@prompthub/shared/utils/skill-file-snapshot";

export interface SkillVersionFileDiffEntry {
  path: string;
  oldContent: string;
  newContent: string;
  unchanged: boolean;
  binary?: boolean;
  oldBytes?: number;
  newBytes?: number;
}

function compareFilePath(a: string, b: string): number {
  const aSkillMd = a.toLowerCase() === "skill.md";
  const bSkillMd = b.toLowerCase() === "skill.md";
  if (aSkillMd && !bSkillMd) return -1;
  if (!aSkillMd && bSkillMd) return 1;
  return a.localeCompare(b);
}

function ensureSkillMdSnapshot(
  snapshots: SkillFileSnapshot[],
  fallbackContent: string,
): SkillFileSnapshot[] {
  if (
    snapshots.some(
      (snapshot) => snapshot.relativePath.toLowerCase() === "skill.md",
    )
  ) {
    return snapshots;
  }

  if (!fallbackContent.trim()) {
    return snapshots;
  }

  return [
    {
      relativePath: "SKILL.md",
      content: fallbackContent,
    },
    ...snapshots,
  ];
}

export function normalizeVersionSnapshot(
  snapshots?: SkillFileSnapshot[],
  fallbackContent = "",
): SkillFileSnapshot[] {
  const normalized = (snapshots || [])
    .filter(
      (snapshot): snapshot is SkillFileSnapshot =>
        !!snapshot &&
        typeof snapshot.relativePath === "string" &&
        typeof snapshot.content === "string" &&
        snapshot.relativePath.trim().length > 0,
    )
    .map((snapshot) => ({
      relativePath: snapshot.relativePath,
      content: snapshot.content,
      ...(snapshot.encoding ? { encoding: snapshot.encoding } : {}),
    }));

  return ensureSkillMdSnapshot(normalized, fallbackContent);
}

export function snapshotsFromLocalFiles(
  files: SkillLocalFileEntry[],
  fallbackContent = "",
): SkillFileSnapshot[] {
  const normalized = files
    .filter((file) => !file.isDirectory)
    .map((file) => ({
      relativePath: file.path,
      content: file.content,
    }));

  return ensureSkillMdSnapshot(normalized, fallbackContent);
}

export function resolveVersionSnapshots(
  version: SkillVersion | null,
  fallbackContent = "",
): SkillFileSnapshot[] {
  return normalizeVersionSnapshot(version?.filesSnapshot, fallbackContent);
}

export function buildVersionFileDiffEntries(
  oldSnapshots: SkillFileSnapshot[],
  newSnapshots: SkillFileSnapshot[],
): SkillVersionFileDiffEntry[] {
  const oldMap = new Map(
    oldSnapshots.map((snapshot) => [snapshot.relativePath, snapshot]),
  );
  const newMap = new Map(
    newSnapshots.map((snapshot) => [snapshot.relativePath, snapshot]),
  );

  const paths = Array.from(new Set([...oldMap.keys(), ...newMap.keys()])).sort(
    compareFilePath,
  );

  return paths.map((path) => {
    const oldFile = oldMap.get(path);
    const newFile = newMap.get(path);
    const binary =
      oldFile?.encoding === "base64" || newFile?.encoding === "base64";
    const oldContent = binary ? "" : (oldFile?.content ?? "");
    const newContent = binary ? "" : (newFile?.content ?? "");
    let unchanged = Boolean(
      oldFile &&
      newFile &&
      oldFile.content === newFile.content &&
      (oldFile.encoding ?? "utf8") === (newFile.encoding ?? "utf8"),
    );
    if (binary && oldFile && newFile && !unchanged) {
      const left = decodeSkillFileSnapshot(oldFile);
      const right = decodeSkillFileSnapshot(newFile);
      unchanged =
        left.length === right.length &&
        left.every((byte, index) => byte === right[index]);
    }
    return {
      path,
      oldContent,
      newContent,
      unchanged,
      ...(binary
        ? {
            binary: true,
            oldBytes: oldFile ? skillSnapshotByteLength(oldFile) : 0,
            newBytes: newFile ? skillSnapshotByteLength(newFile) : 0,
          }
        : {}),
    };
  });
}
