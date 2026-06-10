import type { ScannedSkill, Skill } from "@prompthub/shared/types";

export function normalizeProjectPathForComparison(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

export function getProjectTargetSkillPath(targetDir: string, skillName: string): string {
  const normalizedTarget = targetDir.replace(/[\\/]+$/, "");
  return `${normalizedTarget}/${skillName}`;
}

export function isProjectSkillDeployedToTarget(
  scannedSkills: ScannedSkill[],
  skillName: string,
  targetDir: string,
): boolean {
  const expectedPath = normalizeProjectPathForComparison(
    getProjectTargetSkillPath(targetDir, skillName),
  );
  const expectedName = skillName.trim().toLowerCase();

  return scannedSkills.some((skill) => {
    if (skill.name.trim().toLowerCase() !== expectedName) {
      return false;
    }
    return normalizeProjectPathForComparison(skill.localPath) === expectedPath;
  });
}

export function getMissingProjectTargetDirs(
  scannedSkills: ScannedSkill[],
  skillName: string,
  targetDirs: string[],
): string[] {
  return targetDirs.filter(
    (targetDir) => !isProjectSkillDeployedToTarget(scannedSkills, skillName, targetDir),
  );
}

function getProjectTargetSkill(
  scannedSkills: ScannedSkill[],
  skillName: string,
  targetDir: string,
): ScannedSkill | null {
  const expectedPath = normalizeProjectPathForComparison(
    getProjectTargetSkillPath(targetDir, skillName),
  );
  const expectedName = skillName.trim().toLowerCase();

  return (
    scannedSkills.find(
      (skill) =>
        skill.name.trim().toLowerCase() === expectedName &&
        normalizeProjectPathForComparison(skill.localPath) === expectedPath,
    ) ?? null
  );
}

function getNormalizedPathCandidates(values: Array<string | undefined | null>) {
  return values
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => normalizeProjectPathForComparison(value));
}

function isSameProjectTargetSkill(
  scannedSkill: ScannedSkill,
  librarySkill: Skill,
): boolean {
  if (
    scannedSkill.directory_fingerprint?.trim() &&
    librarySkill.directory_fingerprint?.trim() &&
    scannedSkill.directory_fingerprint === librarySkill.directory_fingerprint
  ) {
    return true;
  }

  const scannedPaths = new Set(
    getNormalizedPathCandidates([
      scannedSkill.localPath,
      scannedSkill.symlinkTargetPath,
    ]),
  );
  const libraryPaths = getNormalizedPathCandidates([
    librarySkill.local_repo_path,
    librarySkill.source_url,
  ]);

  return libraryPaths.some((path) => scannedPaths.has(path));
}

export function getProjectTargetDirsRequiringDeployment(
  scannedSkills: ScannedSkill[],
  librarySkill: Skill,
  targetDirs: string[],
): string[] {
  return targetDirs.filter((targetDir) => {
    const existingTargetSkill = getProjectTargetSkill(
      scannedSkills,
      librarySkill.name,
      targetDir,
    );

    return (
      !existingTargetSkill ||
      !isSameProjectTargetSkill(existingTargetSkill, librarySkill)
    );
  });
}

export interface ProjectDeployedSkillTarget {
  targetDir: string;
  localPath: string;
}

export function getDeployedProjectSkillTargets(
  scannedSkills: ScannedSkill[],
  skillName: string,
  targetDirs: string[],
): ProjectDeployedSkillTarget[] {
  const expectedName = skillName.trim().toLowerCase();
  const expectedTargetPaths = new Map(
    targetDirs.map((targetDir) => [
      normalizeProjectPathForComparison(getProjectTargetSkillPath(targetDir, skillName)),
      targetDir,
    ]),
  );

  return scannedSkills
    .filter((skill) => skill.name.trim().toLowerCase() === expectedName)
    .map((skill) => ({
      skill,
      normalizedPath: normalizeProjectPathForComparison(skill.localPath),
    }))
    .filter(({ normalizedPath }) => expectedTargetPaths.has(normalizedPath))
    .map(({ skill, normalizedPath }) => ({
      localPath: skill.localPath,
      targetDir: expectedTargetPaths.get(normalizedPath) ?? skill.localPath,
    }));
}

export function isProjectDeployTargetCompatible(
  sourcePath: string,
  skillName: string,
  targetDir: string,
): boolean {
  const normalizedSource = normalizeProjectPathForComparison(sourcePath);
  const normalizedTarget = normalizeProjectPathForComparison(
    getProjectTargetSkillPath(targetDir, skillName),
  );

  if (!normalizedSource || !normalizedTarget) {
    return false;
  }

  if (normalizedSource === normalizedTarget) {
    return false;
  }

  return !normalizedTarget.startsWith(`${normalizedSource}/`);
}

export function getDeployableProjectTargetDirs(
  sourcePath: string,
  skillName: string,
  targetDirs: string[],
): string[] {
  return targetDirs.filter((targetDir) =>
    isProjectDeployTargetCompatible(sourcePath, skillName, targetDir),
  );
}
