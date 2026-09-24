import type {
  CreateSkillParams,
  Skill,
  SkillFileSnapshot,
  SkillPackageOperationFailure,
  SkillPackageOperationFailureCode,
  SkillPackageOperationFailureReason,
  SkillPackageOperationPhase,
  SkillPackageOperationRequest,
  SkillPackageOperationResult,
  SkillSafetyReport,
  SkillVersion,
  UpdateSkillParams,
} from "@prompthub/shared/types";
import {
  buildSkillPackageOperationKey,
  buildStoreInstallSkillData,
  buildStoreUpdateSkillData,
  sanitizeSkillPackageDiagnostic,
  validateSkillPackageOperationRequest,
} from "@prompthub/core/skills/package-operation";
import { SkillPackageTransportError } from "./skill-package-transport-error";

const PENDING_INSTALL_MARKER = "PACKAGE_OPERATION_PENDING";

type LifecycleDatabase = {
  getById: (id: string) => Skill | null;
  getBySourceId: (sourceId: string) => Skill | null;
  create: (data: CreateSkillParams) => Skill;
  delete: (id: string) => boolean;
  finalizePackageInstall: (
    skillId: string,
    data: UpdateSkillParams,
    note: string,
    filesSnapshot: SkillFileSnapshot[],
  ) => { skill: Skill; version: SkillVersion } | null;
  finalizePackageUpdate: (
    skillId: string,
    data: UpdateSkillParams,
    note: string,
    filesSnapshot: SkillFileSnapshot[] | undefined,
    expectedSkill?: Skill,
  ) => { skill: Skill; version: SkillVersion } | null;
};

export type StagedSkillPackage = {
  repoPath: string;
  content: string;
  contentHash: string;
  directoryFingerprint: string;
  safetyReport?: SkillSafetyReport;
};

export type PackageReplacementRecovery = {
  repoPath: string;
  backupPath?: string;
  hadOriginal: boolean;
};

export type PackageReplacement = {
  repoPath: string;
  recovery: PackageReplacementRecovery;
  commit: () => Promise<void>;
  rollback: () => Promise<void>;
};

export type PackageRecoveryManifest = PackageReplacementRecovery & {
  operation: "install" | "update";
  skillId: string;
  expectedFingerprint: string;
};

export interface SkillPackageLifecycleDependencies {
  db: LifecycleDatabase;
  createStagingRoot: (request: SkillPackageOperationRequest) => Promise<string>;
  stagePackage: (
    request: SkillPackageOperationRequest,
    context: { stagingRoot: string; sourceId: string },
  ) => Promise<StagedSkillPackage>;
  beginReplacement: (
    skill: Skill,
    stagedRepoPath: string,
    beforeApply: (recovery: PackageReplacementRecovery) => Promise<void>,
  ) => Promise<PackageReplacement>;
  readFilesSnapshot: (repoPath: string) => Promise<SkillFileSnapshot[]>;
  deleteManagedContainer: (skill: Skill) => Promise<void>;
  recordReplacement: (
    stagingRoot: string,
    manifest: PackageRecoveryManifest,
  ) => Promise<void>;
  cleanupStagingRoot: (stagingRoot: string) => Promise<void>;
  deriveSourceId: (request: SkillPackageOperationRequest) => string;
  now: () => number;
}

class LifecycleStepError extends Error {
  constructor(
    readonly code: SkillPackageOperationFailureCode,
    readonly phase: SkillPackageOperationPhase,
    cause: unknown,
    readonly reason?: SkillPackageOperationFailureReason,
  ) {
    super(sanitizeSkillPackageDiagnostic(cause));
    this.name = "LifecycleStepError";
  }
}

function createFailure(
  request: unknown,
  code: SkillPackageOperationFailureCode,
  phase: SkillPackageOperationPhase,
  error: unknown,
  reason?: SkillPackageOperationFailureReason,
): SkillPackageOperationFailure {
  const registrySkill =
    request && typeof request === "object" && "registrySkill" in request
      ? (request as { registrySkill?: unknown }).registrySkill
      : undefined;
  const sourceLabel =
    registrySkill && typeof registrySkill === "object"
      ? ["source_label", "name"]
          .map((key) => (registrySkill as Record<string, unknown>)[key])
          .find(
            (value): value is string =>
              typeof value === "string" && Boolean(value.trim()),
          )
      : undefined;
  return {
    code,
    phase,
    summary: sanitizeSkillPackageDiagnostic(error) || code,
    ...(reason ? { reason } : {}),
    sourceLabel,
  };
}

function getRequestedOperation(value: unknown): "install" | "update" {
  return value &&
    typeof value === "object" &&
    "operation" in value &&
    (value as { operation?: unknown }).operation === "update"
    ? "update"
    : "install";
}

function failureResult(
  request: SkillPackageOperationRequest,
  error: LifecycleStepError,
): SkillPackageOperationResult {
  const failure = createFailure(
    request,
    error.code,
    error.phase,
    error.message,
    error.reason,
  );
  if (error.code === "DUPLICATE_SOURCE" || error.code === "CONFLICT") {
    return { status: "conflict", operation: request.operation, failure };
  }
  if (error.code === "SOURCE_UNAVAILABLE") {
    return {
      status: "source-unavailable",
      operation: request.operation,
      failure,
    };
  }
  return { status: "failed", operation: request.operation, failure };
}

function isDuplicateError(error: unknown): boolean {
  const message = sanitizeSkillPackageDiagnostic(error).toLowerCase();
  return message.includes("already exists") || message.includes("duplicate");
}

function isOptimisticConflict(error: unknown): boolean {
  return sanitizeSkillPackageDiagnostic(error)
    .toLowerCase()
    .includes("changed during package update finalization");
}

function buildPendingInstallData(data: CreateSkillParams): CreateSkillParams {
  return {
    ...data,
    directory_fingerprint: undefined,
    installed_content_hash: undefined,
    installed_directory_fingerprint: undefined,
    fingerprint_algorithm: undefined,
    source_last_checked_at: undefined,
    source_last_error: PENDING_INSTALL_MARKER,
    source_binding_state: "missing-baseline",
    installed_version: undefined,
    updated_from_store_at: undefined,
  };
}

function isInvalidPackageDiagnostic(message: string): boolean {
  return [
    /invalid/,
    /traversal/,
    /skill\.md/,
    /archive/,
    /too many (?:files|filesystem entries)/,
    /(?:file|total|directory|path|package).*limit/,
    /unsupported filesystem entry/,
    /outside the package root/,
  ].some((pattern) => pattern.test(message));
}

function getStageFailure(
  request: SkillPackageOperationRequest,
  error: unknown,
): LifecycleStepError {
  if (error instanceof SkillPackageTransportError) {
    return new LifecycleStepError(
      "SOURCE_UNAVAILABLE",
      "staging",
      error,
      error.reason,
    );
  }
  const message = sanitizeSkillPackageDiagnostic(error).toLowerCase();
  const invalid = isInvalidPackageDiagnostic(message);
  const remote = ["remote-git", "remote-zip"].includes(request.source.kind);
  return new LifecycleStepError(
    invalid
      ? "INVALID_PACKAGE"
      : remote
        ? "SOURCE_UNAVAILABLE"
        : "STAGING_FAILED",
    "staging",
    error,
  );
}

/** Main-process owner for atomic, reviewable Skill package mutations. */
export class SkillPackageLifecycleService {
  private readonly inFlight = new Map<
    string,
    Promise<SkillPackageOperationResult>
  >();

  constructor(
    private readonly dependencies: SkillPackageLifecycleDependencies,
  ) {}

  async run(input: unknown): Promise<SkillPackageOperationResult> {
    let request: SkillPackageOperationRequest;
    try {
      request = validateSkillPackageOperationRequest(input);
    } catch (error) {
      return {
        status: "failed",
        operation: getRequestedOperation(input),
        failure: createFailure(input, "INVALID_PACKAGE", "validation", error),
      };
    }
    const key = buildSkillPackageOperationKey(request);
    const active = this.inFlight.get(key);
    if (active) return active;
    const operation = this.execute(request).finally(() =>
      this.inFlight.delete(key),
    );
    this.inFlight.set(key, operation);
    return operation;
  }

  private async execute(
    request: SkillPackageOperationRequest,
  ): Promise<SkillPackageOperationResult> {
    let stagingRoot: string | null = null;
    try {
      const sourceId = this.dependencies.deriveSourceId(request);
      if (request.operation === "install") {
        const conflict = this.findInstallConflict(sourceId);
        if (conflict) return this.installConflictResult(request, sourceId);
      }
      stagingRoot = await this.dependencies.createStagingRoot(request);
      const staged = await this.stage(request, stagingRoot, sourceId);
      if (
        request.expectedSourceFingerprint &&
        request.expectedSourceFingerprint !== staged.directoryFingerprint
      ) {
        throw new LifecycleStepError(
          "CONFLICT",
          "staging",
          new Error(
            "Skill source changed after checking; check the source again",
          ),
        );
      }
      return request.operation === "install"
        ? await this.install(request, stagingRoot, sourceId, staged)
        : await this.update(request, stagingRoot, sourceId, staged);
    } catch (error) {
      return failureResult(
        request,
        error instanceof LifecycleStepError
          ? error
          : getStageFailure(request, error),
      );
    } finally {
      if (stagingRoot) {
        await this.dependencies
          .cleanupStagingRoot(stagingRoot)
          .catch((cleanupError) => {
            console.error(
              "Skill package staging cleanup failed:",
              cleanupError,
            );
          });
      }
    }
  }

  private async stage(
    request: SkillPackageOperationRequest,
    stagingRoot: string,
    sourceId: string,
  ): Promise<StagedSkillPackage> {
    try {
      return await this.dependencies.stagePackage(request, {
        stagingRoot,
        sourceId,
      });
    } catch (error) {
      throw getStageFailure(request, error);
    }
  }

  private findInstallConflict(sourceId: string): Skill | null {
    return this.dependencies.db.getBySourceId(sourceId);
  }

  private async install(
    request: SkillPackageOperationRequest,
    stagingRoot: string,
    sourceId: string,
    staged: StagedSkillPackage,
  ): Promise<SkillPackageOperationResult> {
    const conflict = this.findInstallConflict(sourceId);
    if (conflict) return this.installConflictResult(request, sourceId);
    return this.applyInstall(request, stagingRoot, sourceId, staged);
  }

  private installConflictResult(
    request: SkillPackageOperationRequest,
    sourceId: string,
  ): SkillPackageOperationResult {
    return failureResult(
      request,
      new LifecycleStepError(
        "DUPLICATE_SOURCE",
        "applying",
        `Skill source already exists: ${sourceId}`,
      ),
    );
  }

  private async applyInstall(
    request: SkillPackageOperationRequest,
    stagingRoot: string,
    sourceId: string,
    staged: StagedSkillPackage,
  ): Promise<SkillPackageOperationResult> {
    let created: Skill | null = null;
    let replacement: PackageReplacement | null = null;
    try {
      const finalData = this.buildInstallData(request, sourceId, staged);
      created = this.createPendingInstall(finalData);
      replacement = await this.startReplacement(
        request,
        stagingRoot,
        created,
        staged,
      );
      const files = await this.dependencies.readFilesSnapshot(
        replacement.repoPath,
      );
      const finalized = this.dependencies.db.finalizePackageInstall(
        created.id,
        { ...finalData, local_repo_path: replacement.repoPath },
        "Initial store install",
        files,
      );
      if (!finalized)
        throw new Error("Skill row disappeared during finalization");
      await replacement.commit().catch((commitError) => {
        console.error(
          "Skill package install commit cleanup failed:",
          commitError,
        );
      });
      return {
        status: "completed",
        operation: "install",
        skill: finalized.skill,
      };
    } catch (error) {
      const rollbackComplete = await this.rollbackInstall(created, replacement);
      const failure = rollbackComplete
        ? this.classifyApplyFailure(error, replacement)
        : new LifecycleStepError("ROLLBACK_INCOMPLETE", "rollback", error);
      return failureResult(request, failure);
    }
  }

  private createPendingInstall(finalData: CreateSkillParams): Skill {
    try {
      return this.dependencies.db.create(buildPendingInstallData(finalData));
    } catch (error) {
      if (isDuplicateError(error)) {
        throw new LifecycleStepError("DUPLICATE_SOURCE", "applying", error);
      }
      throw new LifecycleStepError(
        "DATABASE_FINALIZE_FAILED",
        "finalizing",
        error,
      );
    }
  }

  private buildInstallData(
    request: SkillPackageOperationRequest,
    sourceId: string,
    staged: StagedSkillPackage,
  ): CreateSkillParams {
    return buildStoreInstallSkillData({
      registrySkill: request.registrySkill,
      content: staged.content,
      contentHash: staged.contentHash,
      directoryFingerprint: staged.directoryFingerprint,
      sourceId,
      now: this.dependencies.now(),
    });
  }

  private async startReplacement(
    request: SkillPackageOperationRequest,
    stagingRoot: string,
    skill: Skill,
    staged: StagedSkillPackage,
  ): Promise<PackageReplacement> {
    try {
      return await this.dependencies.beginReplacement(
        skill,
        staged.repoPath,
        async (recovery) => {
          if (request.operation === "install" && recovery.hadOriginal) {
            throw new LifecycleStepError(
              "DUPLICATE_SOURCE",
              "applying",
              "Managed Skill repository already exists",
            );
          }
          await this.dependencies.recordReplacement(stagingRoot, {
            operation: request.operation,
            skillId: skill.id,
            expectedFingerprint: staged.directoryFingerprint,
            ...recovery,
          });
        },
      );
    } catch (error) {
      try {
        await this.dependencies.cleanupStagingRoot(stagingRoot);
      } catch (rollbackError) {
        throw new LifecycleStepError(
          "ROLLBACK_INCOMPLETE",
          "rollback",
          rollbackError,
        );
      }
      throw error instanceof LifecycleStepError
        ? error
        : new LifecycleStepError("PACKAGE_APPLY_FAILED", "applying", error);
    }
  }

  private async rollbackInstall(
    skill: Skill | null,
    replacement: PackageReplacement | null,
  ): Promise<boolean> {
    if (!skill) return true;
    try {
      if (replacement) {
        await replacement.rollback();
        if (!replacement.recovery.hadOriginal) {
          await this.dependencies.deleteManagedContainer(skill);
        }
      }
      if (
        this.dependencies.db.getById(skill.id) &&
        !this.dependencies.db.delete(skill.id)
      ) {
        throw new Error("Skill row rollback returned false");
      }
      return true;
    } catch (rollbackError) {
      console.error("Skill package install rollback failed:", rollbackError);
      return false;
    }
  }

  private classifyApplyFailure(
    error: unknown,
    replacement: PackageReplacement | null,
  ): LifecycleStepError {
    if (error instanceof LifecycleStepError) return error;
    if (isDuplicateError(error)) {
      return new LifecycleStepError("DUPLICATE_SOURCE", "applying", error);
    }
    if (isOptimisticConflict(error)) {
      return new LifecycleStepError("CONFLICT", "finalizing", error);
    }
    return new LifecycleStepError(
      replacement ? "DATABASE_FINALIZE_FAILED" : "PACKAGE_APPLY_FAILED",
      replacement ? "finalizing" : "applying",
      error,
    );
  }

  private async update(
    request: SkillPackageOperationRequest,
    stagingRoot: string,
    sourceId: string,
    staged: StagedSkillPackage,
  ): Promise<SkillPackageOperationResult> {
    const installed = this.dependencies.db.getById(request.skillId!);
    if (!installed) {
      return failureResult(
        request,
        new LifecycleStepError("CONFLICT", "applying", "Skill not found"),
      );
    }
    return this.applyUpdate(request, stagingRoot, installed, sourceId, staged);
  }

  private async applyUpdate(
    request: SkillPackageOperationRequest,
    stagingRoot: string,
    installed: Skill,
    sourceId: string,
    staged: StagedSkillPackage,
  ): Promise<SkillPackageOperationResult> {
    let replacement: PackageReplacement | null = null;
    try {
      const files = installed.local_repo_path
        ? await this.dependencies.readFilesSnapshot(installed.local_repo_path)
        : undefined;
      replacement = await this.startReplacement(
        request,
        stagingRoot,
        installed,
        staged,
      );
      const finalized = this.dependencies.db.finalizePackageUpdate(
        installed.id,
        this.buildUpdateData(request, installed, sourceId, staged, replacement),
        this.getUpdateNote(request, installed),
        files,
        installed,
      );
      if (!finalized)
        throw new Error("Skill row disappeared during finalization");
      await replacement.commit().catch((commitError) => {
        console.error(
          "Skill package update commit cleanup failed:",
          commitError,
        );
      });
      return {
        status: "completed",
        operation: "update",
        skill: finalized.skill,
      };
    } catch (error) {
      const rollbackComplete = await this.rollbackUpdate(replacement);
      const failure = rollbackComplete
        ? this.classifyApplyFailure(error, replacement)
        : new LifecycleStepError("ROLLBACK_INCOMPLETE", "rollback", error);
      return failureResult(request, failure);
    }
  }

  private getUpdateNote(
    request: SkillPackageOperationRequest,
    installed: Skill,
  ): string {
    return (
      request.note ||
      `Store update: ${installed.version || "unknown"} -> ${request.registrySkill.version}`
    );
  }

  private buildUpdateData(
    request: SkillPackageOperationRequest,
    installed: Skill,
    sourceId: string,
    staged: StagedSkillPackage,
    replacement: PackageReplacement,
  ): UpdateSkillParams {
    return {
      ...buildStoreUpdateSkillData({
        installedSkill: installed,
        registrySkill: request.registrySkill,
        content: staged.content,
        contentHash: staged.contentHash,
        directoryFingerprint: staged.directoryFingerprint,
        sourceId,
        now: this.dependencies.now(),
        markAsBuiltin: request.markAsBuiltin ?? true,
      }),
      local_repo_path: replacement.repoPath,
    };
  }

  private async rollbackUpdate(
    replacement: PackageReplacement | null,
  ): Promise<boolean> {
    if (!replacement) return true;
    return replacement.rollback().then(
      () => true,
      (rollbackError) => {
        console.error("Skill package update rollback failed:", rollbackError);
        return false;
      },
    );
  }
}

export { PENDING_INSTALL_MARKER };
