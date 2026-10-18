/**
 * Export and import utilities for skill data.
 *
 * Handles serialization to SKILL.md (frontmatter + body) and JSON formats,
 * as well as importing skills from JSON.
 */
export { exportAsSkillMd, exportAsJson } from "@prompthub/core/skills/export";
import { SkillDB } from "../database/skill";
import { sanitizeImportedSkillDraft } from "./skill-import-sanitize";

// ==================== JSON import ====================

export async function importFromJson(
  jsonContent: string,
  db: SkillDB,
): Promise<string> {
  try {
    // Safe: JSON.parse returns `any`; narrowed to Record for property access
    const data = JSON.parse(jsonContent) as Record<string, unknown>;
    const sanitized = sanitizeImportedSkillDraft(
      {
        name: data.name,
        description: data.description,
        version: data.version,
        author: data.author,
        tags: data.tags,
        instructions: data.instructions,
        icon_url: data.icon_url,
        icon_emoji: data.icon_emoji,
        icon_background: data.icon_background,
        category: data.category,
        prerequisites: data.prerequisites,
        compatibility: data.compatibility,
        protocol_type: data.protocol_type,
        source_url: data.source_url,
        source_id: data.source_id,
        source_label: data.source_label,
        source_branch: data.source_branch,
        source_directory: data.source_directory,
        canonical_skill_path: data.canonical_skill_path,
      },
      { defaultTags: ["imported"] },
    );
    const name = sanitized.name?.trim();
    if (!name) {
      throw new Error("Invalid skill JSON: missing name");
    }

    const skill = db.create({
      name,
      description: sanitized.description,
      version: sanitized.version,
      author: sanitized.author,
      instructions: sanitized.instructions,
      content: sanitized.instructions,
      protocol_type: sanitized.protocol_type,
      tags: sanitized.tags,
      is_favorite: false,
      icon_url: sanitized.icon_url,
      icon_emoji: sanitized.icon_emoji,
      icon_background: sanitized.icon_background,
      category: sanitized.category,
      prerequisites: sanitized.prerequisites,
      compatibility: sanitized.compatibility,
      source_url: sanitized.source_url,
      source_id: sanitized.source_id,
      source_label: sanitized.source_label,
      source_branch: sanitized.source_branch,
      source_directory: sanitized.source_directory,
      canonical_skill_path: sanitized.canonical_skill_path,
    });

    return skill.id;
  } catch (error) {
    console.error("Failed to import skill from JSON:", error);
    throw error;
  }
}
