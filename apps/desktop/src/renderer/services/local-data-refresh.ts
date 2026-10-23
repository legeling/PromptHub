export type WorkspaceDomain = "prompt" | "skill" | "rules";
export type WorkspaceRefreshResult =
  | "updated"
  | "removed"
  | "protected"
  | "superseded";
export interface PreparedWorkspaceRefresh {
  isCurrent: () => boolean;
  commit: () => boolean;
}

export function createWorkspaceRefreshController(dependencies: {
  prepare: () => Promise<() => WorkspaceRefreshResult>;
  isProtected: () => boolean;
}): { refresh: () => Promise<WorkspaceRefreshResult> } {
  let inFlight: Promise<WorkspaceRefreshResult> | null = null;
  return {
    refresh: () => {
      if (inFlight) return inFlight;
      if (dependencies.isProtected()) return Promise.resolve("protected");
      inFlight = dependencies
        .prepare()
        .then((commit) => (dependencies.isProtected() ? "protected" : commit()))
        .finally(() => {
          inFlight = null;
        });
      return inFlight;
    },
  };
}
