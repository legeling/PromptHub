export function selectAllPromptIds(
  selectedIds: Iterable<string>,
  scopeIds: readonly string[],
): Set<string> {
  const next = new Set(selectedIds);
  for (const id of scopeIds) next.add(id);
  return next;
}

export function invertPromptSelection(
  selectedIds: Iterable<string>,
  scopeIds: readonly string[],
): Set<string> {
  const next = new Set(selectedIds);
  for (const id of scopeIds) {
    if (next.has(id)) next.delete(id);
    else next.add(id);
  }
  return next;
}
