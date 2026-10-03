/**
 * Shared multi-selection state for prompt views (table / gallery).
 * 提示词视图（表格 / 画廊）共享的多选状态。
 *
 * Behavior mirrors the historical PromptTableView selection semantics:
 * - selection is pruned when underlying prompts disappear;
 * - "select all" only toggles the current action scope (page rows for the
 *   table, visible cards for the gallery);
 * - handlers clear the selection after invoking a batch action.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

interface UsePromptBatchSelectionParams {
  /** All ids the view can currently hold; stale selections are pruned against it. */
  allIdSet: ReadonlySet<string>;
  /** Ids affected by the "select all" toggle (page scope). */
  scopeIds: readonly string[];
}

interface PromptBatchSelection {
  selectedIds: ReadonlySet<string>;
  selectedIdList: string[];
  allScopeSelected: boolean;
  toggle: (id: string) => void;
  toggleSelectAllScope: () => void;
  clear: () => void;
}

export function usePromptBatchSelection({
  allIdSet,
  scopeIds,
}: UsePromptBatchSelectionParams): PromptBatchSelection {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set<string>(),
  );

  useEffect(() => {
    setSelectedIds((current) => {
      const kept = Array.from(current).filter((id) => allIdSet.has(id));
      return kept.length === current.size ? current : new Set(kept);
    });
  }, [allIdSet]);

  const toggle = useCallback((id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const scopeKey = useMemo(() => scopeIds.join("\u001f"), [scopeIds]);

  const allScopeSelected =
    scopeIds.length > 0 && scopeIds.every((id) => selectedIds.has(id));

  const toggleSelectAllScope = useCallback(() => {
    const scope = scopeKey === "" ? [] : scopeKey.split("\u001f");
    setSelectedIds((current) => {
      const next = new Set(current);
      const everythingSelected =
        scope.length > 0 && scope.every((id) => current.has(id));
      scope.forEach((id) => {
        if (everythingSelected) {
          next.delete(id);
        } else {
          next.add(id);
        }
      });
      return next;
    });
  }, [scopeKey]);

  const clear = useCallback(() => {
    setSelectedIds(new Set<string>());
  }, []);

  const selectedIdList = useMemo(
    () => Array.from(selectedIds),
    [selectedIds],
  );

  return {
    selectedIds,
    selectedIdList,
    allScopeSelected,
    toggle,
    toggleSelectAllScope,
    clear,
  };
}
