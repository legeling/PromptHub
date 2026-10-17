import { useCallback, useEffect, useMemo } from "react";
import { usePromptStore } from "../../stores/prompt.store";
import {
  invertPromptSelection,
  selectAllPromptIds,
} from "./prompt-batch-selection-utils";

interface UsePromptBatchSelectionParams {
  allIdSet: ReadonlySet<string>;
  scopeIds: readonly string[];
}

interface PromptBatchSelection {
  active: boolean;
  selectedIds: ReadonlySet<string>;
  selectedIdList: string[];
  allScopeSelected: boolean;
  toggle: (id: string) => void;
  toggleSelectAllScope: () => void;
  selectAllScope: () => void;
  invertScopeSelection: () => void;
  clear: () => void;
}

/** All Prompt layouts share transient mode and selection; scope controls only all/invert. */
export function usePromptBatchSelection({
  allIdSet,
  scopeIds,
}: UsePromptBatchSelectionParams): PromptBatchSelection {
  const active = usePromptStore((state) => state.isBatchSelectionActive);
  const ids = usePromptStore((state) => state.selectedIds);
  const setIds = usePromptStore((state) => state.setSelectedIds);
  const clear = usePromptStore((state) => state.exitBatchSelection);
  const toggle = usePromptStore((state) => state.toggleBatchSelection);
  const selectedIdList = useMemo(() => (active ? ids : []), [active, ids]);
  const selectedIds = useMemo(() => new Set(selectedIdList), [selectedIdList]);
  useEffect(() => {
    if (!active) return;
    const kept = ids.filter((id) => allIdSet.has(id));
    if (kept.length === ids.length) return;
    if (kept.length === 0) clear();
    else setIds(kept);
  }, [active, ids, allIdSet, clear, setIds]);
  const scopeSet = useMemo(() => new Set(scopeIds), [scopeIds]);
  const allScopeSelected =
    scopeIds.length > 0 && scopeIds.every((id) => selectedIds.has(id));
  const toggleSelectAllScope = useCallback(() => {
    setIds(
      allScopeSelected
        ? selectedIdList.filter((id) => !scopeSet.has(id))
        : Array.from(selectAllPromptIds(selectedIds, scopeIds)),
    );
  }, [
    allScopeSelected,
    selectedIdList,
    selectedIds,
    scopeIds,
    scopeSet,
    setIds,
  ]);
  return {
    active,
    selectedIds,
    selectedIdList,
    allScopeSelected,
    toggle,
    clear,
    toggleSelectAllScope,
    selectAllScope: () =>
      setIds(Array.from(selectAllPromptIds(selectedIds, scopeIds))),
    invertScopeSelection: () =>
      setIds(Array.from(invertPromptSelection(selectedIds, scopeIds))),
  };
}
