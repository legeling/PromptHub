import type { SkillPackageOperationFailureReason } from "@prompthub/shared/types";

/** Preserve a bounded transport reason without exposing process diagnostics. */
export class SkillPackageTransportError extends Error {
  constructor(
    readonly reason: SkillPackageOperationFailureReason,
    message: string,
  ) {
    super(message);
    this.name = "SkillPackageTransportError";
  }
}
