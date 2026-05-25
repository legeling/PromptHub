import type { ScannedSkill, Skill } from "@prompthub/shared/types";

export interface ProjectDetailSkillContext {
  scannedSkill: ScannedSkill;
  importedSkill?: Skill | null;
  projectName: string;
  projectRootPath: string;
  projectDeployTargets?: string[];
}

export function buildProjectDetailSkill(
  context: ProjectDetailSkillContext,
): Skill {
  const { scannedSkill, importedSkill, projectName } = context;
  const now = Date.now();

  return {
    id: importedSkill?.id ?? `project:${scannedSkill.localPath}`,
    name: scannedSkill.name,
    description: scannedSkill.description,
    instructions:
      importedSkill?.instructions || importedSkill?.content || scannedSkill.instructions,
    content:
      importedSkill?.content || importedSkill?.instructions || scannedSkill.instructions,
    mcp_config: importedSkill?.mcp_config,
    protocol_type: importedSkill?.protocol_type ?? "skill",
    version: scannedSkill.version || importedSkill?.version,
    author: scannedSkill.author || importedSkill?.author || projectName,
    source_url: scannedSkill.localPath,
    local_repo_path: scannedSkill.localPath,
    tags: scannedSkill.tags,
    original_tags: importedSkill?.original_tags,
    is_favorite: importedSkill?.is_favorite ?? false,
    currentVersion: importedSkill?.currentVersion ?? 0,
    versionTrackingEnabled: importedSkill?.versionTrackingEnabled ?? false,
    created_at: importedSkill?.created_at ?? now,
    updated_at: importedSkill?.updated_at ?? now,
    icon_url: importedSkill?.icon_url,
    icon_emoji: importedSkill?.icon_emoji,
    icon_background: importedSkill?.icon_background,
    category: importedSkill?.category,
    is_builtin: importedSkill?.is_builtin,
    registry_slug: importedSkill?.registry_slug,
    content_url: importedSkill?.content_url,
    installed_content_hash: importedSkill?.installed_content_hash,
    installed_version: importedSkill?.installed_version,
    installed_at: importedSkill?.installed_at,
    updated_from_store_at: importedSkill?.updated_from_store_at,
    prerequisites: importedSkill?.prerequisites,
    compatibility: importedSkill?.compatibility,
    safetyReport: scannedSkill.safetyReport ?? importedSkill?.safetyReport,
  };
}
