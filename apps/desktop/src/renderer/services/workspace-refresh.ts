import { create } from "zustand";
import { usePromptStore } from "../stores/prompt.store";
import { useFolderStore } from "../stores/folder.store";
import { useSkillStore } from "../stores/skill.store";
import { useRulesStore } from "../stores/rules.store";
import {
  createWorkspaceRefreshController,
  type WorkspaceDomain,
  type WorkspaceRefreshResult,
  type PreparedWorkspaceRefresh,
} from "./local-data-refresh";
import {
  discardWorkspaceDrafts,
  hasWorkspaceDraft,
  prepareWorkspaceEditors,
} from "./workspace-drafts";

export const useWorkspaceRefreshState = create<{
  pending: Partial<Record<WorkspaceDomain, boolean>>;
}>(() => ({ pending: {} }));

export function isWorkspaceProtected(domain: WorkspaceDomain): boolean {
  if (hasWorkspaceDraft(domain)) return true;
  if (domain !== "rules") return false;
  const state = useRulesStore.getState();
  return (
    state.isSaving ||
    state.isRewriting ||
    (!!state.currentFile && state.draftContent !== state.currentFile.content)
  );
}

export function discardWorkspaceEdits(domain: WorkspaceDomain): boolean {
  const rules = useRulesStore.getState();
  if (domain === "rules" && (rules.isSaving || rules.isRewriting)) return false;
  if (!discardWorkspaceDrafts(domain)) return false;
  if (domain === "rules")
    rules.setDraftContent(rules.currentFile?.content ?? "");
  return true;
}

async function prepare(
  domain: WorkspaceDomain,
): Promise<() => WorkspaceRefreshResult> {
  // allSettled keeps the operation owned until every read finishes, even on failure.
  const reads =
    domain === "prompt"
      ? [
          usePromptStore.getState().prepareWorkspaceRefresh(),
          useFolderStore.getState().prepareWorkspaceRefresh(),
        ]
      : [
          domain === "skill"
            ? useSkillStore.getState().prepareWorkspaceRefresh()
            : useRulesStore.getState().prepareWorkspaceRefresh(),
        ];
  const results = await Promise.allSettled([
    ...reads,
    ...prepareWorkspaceEditors(domain),
  ]);
  const snapshots: PreparedWorkspaceRefresh[] = [];
  for (const result of results) {
    if (result.status === "rejected") throw result.reason;
    snapshots.push(result.value);
  }
  return () => {
    if (!snapshots.every((snapshot) => snapshot.isCurrent()))
      return "superseded";
    let removed = false;
    for (const snapshot of snapshots) removed = snapshot.commit() || removed;
    return removed ? "removed" : "updated";
  };
}

function controller(domain: WorkspaceDomain) {
  return createWorkspaceRefreshController({
    prepare: () => prepare(domain),
    isProtected: () => isWorkspaceProtected(domain),
  });
}
const controllers = {
  prompt: controller("prompt"),
  skill: controller("skill"),
  rules: controller("rules"),
};

export async function refreshWorkspace(
  domain: WorkspaceDomain,
): Promise<WorkspaceRefreshResult> {
  useWorkspaceRefreshState.setState((state) => ({
    pending: { ...state.pending, [domain]: true },
  }));
  try {
    return await controllers[domain].refresh();
  } finally {
    useWorkspaceRefreshState.setState((state) => ({
      pending: { ...state.pending, [domain]: false },
    }));
  }
}
