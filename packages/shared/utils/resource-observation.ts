import type { ResourcePresence } from "./resource-library";
import type {
  ResourceDistributionSnapshot,
  ResourceTargetObservation,
} from "../types/resource-observation";

/** Missing observations are not evidence of removal. Preserve the last value on errors. */
export function distributionPresence(
  targets: Readonly<Record<string, boolean>> | undefined,
): ResourcePresence {
  if (targets === undefined) return "unknown";
  return Object.values(targets).some(Boolean) ? "distributed" : "absent";
}

export function distributionCountPresence(
  count: number | undefined,
): ResourcePresence {
  return count === undefined ? "unknown" : count > 0 ? "distributed" : "absent";
}

export function observedDistributionPresence(
  targets: Record<string, ResourceTargetObservation> | undefined,
): ResourcePresence {
  if (!targets) return "unknown";
  const values = Object.values(targets);
  if (values.some((value) => value.installed === true)) return "distributed";
  return values.some((value) => value.installed === undefined)
    ? "unknown"
    : "absent";
}

export function mergeDistributionObservations(
  previous: ResourceDistributionSnapshot,
  next: ResourceDistributionSnapshot,
): ResourceDistributionSnapshot {
  return Object.fromEntries(
    Object.entries(next).map(([id, targets]) => [
      id,
      Object.fromEntries(
        Object.entries(targets).map(([targetId, result]) => [
          targetId,
          result.error ? { ...previous[id]?.[targetId], ...result } : result,
        ]),
      ),
    ]),
  );
}
