import { unzipSync } from "fflate";
import type { SkillFileSnapshot } from "@prompthub/shared/types/skill";
import {
  MAX_SKILL_PACKAGE_ENTRIES,
  MAX_SKILL_PACKAGE_TOTAL_BYTES,
  MAX_SKILL_PACKAGE_FILE_BYTES,
} from "@prompthub/shared/constants/skill-package";
import {
  encodeSkillFileSnapshot,
  validateSkillSnapshotPath,
} from "@prompthub/shared/utils/skill-file-snapshot";
import { parseManagedSkillFiles } from "@prompthub/shared/utils/managed-skill-files";

/** Browser-safe ZIP ingress: enforce declared budgets before decompression. */
export function readSkillPackageZip(bytes: Uint8Array): SkillFileSnapshot[] {
  if (bytes.length > MAX_SKILL_PACKAGE_TOTAL_BYTES)
    throw new Error("Skill archive exceeds the size limit");
  let count = 0;
  let total = 0;
  const names = new Set<string>();
  const entries = unzipSync(bytes, {
    filter(entry) {
      if (++count > MAX_SKILL_PACKAGE_ENTRIES)
        throw new Error("Skill archive entry limit exceeded");
      if (entry.name.endsWith("/")) return false;
      validateSkillSnapshotPath(entry.name);
      const key = entry.name.toLowerCase();
      if (names.has(key)) throw new Error("Duplicate Skill archive path");
      names.add(key);
      total += entry.originalSize;
      if (
        entry.originalSize > MAX_SKILL_PACKAGE_FILE_BYTES ||
        total > MAX_SKILL_PACKAGE_TOTAL_BYTES
      )
        throw new Error("Skill archive byte limit exceeded");
      return true;
    },
  });
  return parseManagedSkillFiles(
    Object.entries(entries).map(([name, content]) =>
      encodeSkillFileSnapshot(name, content),
    ),
  );
}
