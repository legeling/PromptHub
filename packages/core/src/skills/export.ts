import { zipSync } from "fflate";
import type { SkillFileSnapshot } from "@prompthub/shared/types/skill";
import { parseManagedSkillFiles } from "@prompthub/shared/utils/managed-skill-files";
import { decodeSkillFileSnapshot } from "@prompthub/shared/utils/skill-file-snapshot";
import {
  serializeSkillMd,
  type SerializeSkillMdInput,
} from "./skill-frontmatter";

interface ExportSkill extends SerializeSkillMdInput {
  content?: string;
  protocol_type?: string;
  source_url?: string;
  source_label?: string;
  source_branch?: string;
  source_directory?: string;
  canonical_skill_path?: string;
  icon_url?: string;
  icon_emoji?: string;
  icon_background?: string;
}

export function exportAsSkillMd(skill: ExportSkill): string {
  return serializeSkillMd({
    ...skill,
    instructions: skill.instructions ?? skill.content ?? "",
  });
}

export function exportAsJson(skill: ExportSkill): string {
  return JSON.stringify(
    {
      name: skill.name,
      description: skill.description || "",
      version: skill.version || "1.0.0",
      author: skill.author || "",
      tags: skill.tags || [],
      instructions: skill.instructions ?? skill.content ?? "",
      protocol_type: skill.protocol_type || "skill",
      source_url: skill.source_url || "",
      source_label: skill.source_label || "",
      source_branch: skill.source_branch || "",
      source_directory: skill.source_directory || "",
      canonical_skill_path: skill.canonical_skill_path || "",
      icon_url: skill.icon_url || "",
      icon_emoji: skill.icon_emoji || "",
      icon_background: skill.icon_background || "",
      exported_at: new Date().toISOString(),
      format_version: "1.0",
    },
    null,
    2,
  );
}

export function createSkillZip(
  files: readonly SkillFileSnapshot[],
): Uint8Array {
  const entries = parseManagedSkillFiles(files).map(
    // Normalize host TextEncoder arrays into the ZIP runtime's realm.
    (file) =>
      [
        file.relativePath,
        new Uint8Array(decodeSkillFileSnapshot(file)),
      ] as const,
  );
  return zipSync(Object.fromEntries(entries), { level: 1 });
}

export function skillExportFileName(
  name: string,
  extension: "zip" | "md",
): string {
  const safeName =
    Array.from(name, (char) => (char.charCodeAt(0) < 32 ? "_" : char))
      .join("")
      .replace(/[<>:"/\\|?*]/g, "_")
      .replace(/[. ]+$/g, "") || "skill";
  return safeName + (extension === "zip" ? ".zip" : "-SKILL.md");
}
