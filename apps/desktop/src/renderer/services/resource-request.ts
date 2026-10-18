/** Coalesce simultaneous refreshes; failures remain visible to every caller. */
export function createResourceRequest(): (
  operation: () => Promise<void>,
) => Promise<void> {
  let current: Promise<void> | null = null;
  return (operation) => {
    if (current) return current;
    current = Promise.resolve()
      .then(operation)
      .finally(() => {
        current = null;
      });
    return current;
  };
}
