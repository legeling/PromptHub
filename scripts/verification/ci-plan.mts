import { VERIFICATION_CHECKS } from "./checks.mts";
import { validateRegistry } from "./select.mts";
import type { VerificationCheck } from "./types.mts";

function groupFor(check: VerificationCheck): string {
  if (/^desktop-unit-\d+$/.test(check.id)) return check.id;
  if (check.id === "desktop-integration") return "desktop-integration";
  if (
    [
      "desktop-build",
      "desktop-bundle-budget",
      "desktop-e2e-smoke",
      "desktop-performance",
    ].includes(check.id)
  )
    return "desktop-runtime";
  if (check.id.startsWith("core-")) return "core";
  if (check.id.startsWith("cli-")) return "cli";
  // Worker dry-run consumes Web's built client assets in this same checkout.
  if (check.id.startsWith("web-")) return "web";
  return "static-and-shared";
}

function releaseChecks(): VerificationCheck[] {
  validateRegistry(VERIFICATION_CHECKS, { requireCompleteInventory: true });
  return VERIFICATION_CHECKS.filter((check) =>
    check.profiles.includes("release"),
  );
}

export function ciGroups(): string[] {
  return [...new Set(releaseChecks().map(groupFor))];
}

export function groupChecks(group: string): VerificationCheck[] {
  const checks = releaseChecks().filter((check) => groupFor(check) === group);
  if (!checks.length)
    throw new Error(`Unknown CI verification group: ${group}`);
  return checks.map((check) => ({
    ...check,
    dependsOn: (check.dependsOn ?? []).filter((dependency) => {
      if (checks.some((entry) => entry.id === dependency)) return true;
      // Independent runners can collect unit evidence alongside the baseline;
      // the final gate still requires both. Local execution order is unchanged.
      if (
        /^desktop-unit-\d+$/.test(check.id) &&
        dependency === "desktop-integration"
      )
        return false;
      throw new Error(
        `CI dependency must share a runner: ${check.id} -> ${dependency}`,
      );
    }),
  }));
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid CI verification report object");
  }
  return Object.fromEntries(Object.entries(value));
}

function verifiedResults(
  report: Record<string, unknown>,
  group: string,
): Record<string, unknown>[] {
  if (!Array.isArray(report.results))
    throw new Error(`Missing results: ${group}`);
  const expected = new Set(groupChecks(group).map((check) => check.id));
  const results = report.results.map(record);
  for (const result of results) {
    if (typeof result.id !== "string" || !expected.delete(result.id)) {
      throw new Error(
        `Unexpected or duplicate check in ${group}: ${String(result.id)}`,
      );
    }
    if (result.status !== "passed" || result.exitCode !== 0) {
      throw new Error(`Check did not pass: ${result.id}`);
    }
    for (const field of ["startedAt", "endedAt", "durationMs"]) {
      if (
        typeof result[field] !== "number" ||
        !Number.isFinite(result[field]) ||
        result[field] < 0
      ) {
        throw new Error(`Invalid result timing: ${result.id}`);
      }
    }
  }
  if (expected.size)
    throw new Error(`Missing checks: ${[...expected].join(", ")}`);
  return results;
}

export function mergeCiReports(
  inputs: unknown[],
  commit: string,
  runId: string,
): Record<string, unknown> & { results: Record<string, unknown>[] } {
  if (!commit || !runId)
    throw new Error("CI commit and run identity are required");
  const expected = new Set(ciGroups());
  const results: Record<string, unknown>[] = [];
  for (const input of inputs) {
    const report = record(input);
    if (typeof report.group !== "string" || !expected.delete(report.group)) {
      throw new Error("Unexpected or duplicate CI verification group");
    }
    if (
      report.schemaVersion !== 1 ||
      report.profile !== "release" ||
      report.status !== "passed" ||
      report.commit !== commit ||
      report.runId !== runId
    ) {
      throw new Error(`Failed or stale verification evidence: ${report.group}`);
    }
    results.push(...verifiedResults(report, report.group));
  }
  if (expected.size)
    throw new Error(`Missing verification groups: ${[...expected].join(", ")}`);
  return {
    schemaVersion: 1,
    profile: "release",
    status: "passed",
    commit,
    runId,
    results,
  };
}
