import { isDeepStrictEqual } from "node:util";

export class VersionImportConflictError extends Error {
  constructor(domain: "Prompt" | "Skill", versionId: string) {
    super(
      `${domain} version import conflicts with stored history: ${versionId}`,
    );
    this.name = "VersionImportConflictError";
  }
}

/** Identity, owner, ordinal and complete normalized content must all agree. */
export function assertVersionImportMatches(
  domain: "Prompt" | "Skill",
  versionId: string,
  existing: readonly unknown[],
  candidate: unknown,
): void {
  if (existing.length !== 1 || !isDeepStrictEqual(existing[0], candidate)) {
    throw new VersionImportConflictError(domain, versionId);
  }
}
