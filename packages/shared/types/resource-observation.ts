export interface ResourceTargetObservation {
  installed?: boolean;
  contentState?: "synced" | "needs-sync" | "conflict" | "unverified";
  checkedAt: number;
  error?: string;
}

export type ResourceDistributionSnapshot = Record<
  string,
  Record<string, ResourceTargetObservation>
>;
