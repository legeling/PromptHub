import type {
  SafetyScanAIConfig,
  Skill,
  SkillSafetyScanMode,
  SkillSafetyReport,
} from "@prompthub/shared/types";
import type {
  scanSkillSafety,
  scanSkillSafetyPreflight,
} from "./skill-safety-scan";

export interface RemoteSkillPackageSafetyScanOptions {
  mode?: SkillSafetyScanMode;
  aiConfig?: SafetyScanAIConfig;
  scan?: typeof scanSkillSafety;
  preflightScan?: typeof scanSkillSafetyPreflight;
}

export interface StagedRemoteSkillPackageSafetyInput {
  skill: Pick<Skill, "name">;
  skillDir: string;
  sourceUrl: string;
  safetyScan?: RemoteSkillPackageSafetyScanOptions;
  packageFingerprint: string;
  approvedPackageFingerprint?: string;
  sourceKey: string;
}

export class SkillSafetyReviewRequiredError extends Error {
  constructor(
    readonly report: SkillSafetyReport,
    readonly packageFingerprint: string,
    readonly sourceKey: string,
  ) {
    super("SAFETY_REVIEW_REQUIRED");
    this.name = "SkillSafetyReviewRequiredError";
  }
}

export class SkillSafetyBlockedError extends Error {
  constructor(readonly report: SkillSafetyReport) {
    super(
      `SAFETY_SCAN_BLOCKED_UPDATE: staged remote Skill package was flagged as ${report.level}: ${report.summary}`,
    );
    this.name = "SkillSafetyBlockedError";
  }
}
