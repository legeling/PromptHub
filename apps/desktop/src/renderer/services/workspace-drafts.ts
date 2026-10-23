import type {
  WorkspaceDomain,
  PreparedWorkspaceRefresh,
} from "./local-data-refresh";

export interface WorkspaceDraft {
  dirty: boolean;
  saving: boolean;
  discard: () => void;
  prepare?: () => Promise<PreparedWorkspaceRefresh>;
}
const drafts = new Map<
  symbol,
  { domain: WorkspaceDomain; read: () => WorkspaceDraft }
>();

export function registerWorkspaceDraft(
  domain: WorkspaceDomain,
  read: () => WorkspaceDraft,
): () => void {
  const id = Symbol(domain);
  drafts.set(id, { domain, read });
  return () => {
    drafts.delete(id);
  };
}

export function hasWorkspaceDraft(domain: WorkspaceDomain): boolean {
  return [...drafts.values()].some(
    (entry) =>
      entry.domain === domain && (entry.read().dirty || entry.read().saving),
  );
}

export function discardWorkspaceDrafts(domain: WorkspaceDomain): boolean {
  const entries = [...drafts.values()]
    .filter((entry) => entry.domain === domain)
    .map((entry) => entry.read());
  if (entries.some((entry) => entry.saving)) return false;
  for (const entry of entries) if (entry.dirty) entry.discard();
  return true;
}

export function prepareWorkspaceEditors(
  domain: WorkspaceDomain,
): Promise<PreparedWorkspaceRefresh>[] {
  return [...drafts.entries()]
    .filter(([, entry]) => entry.domain === domain)
    .flatMap(([id, entry]) => {
      const prepare = entry.read().prepare;
      return prepare
        ? [
            prepare().then((snapshot) => ({
              ...snapshot,
              isCurrent: () => drafts.has(id) && snapshot.isCurrent(),
            })),
          ]
        : [];
    });
}
