let flushSettings: (() => void) | null = null;
const pendingWrites = new Set<Promise<unknown>>();
const failedWrites = new Map<string, unknown>();

export function trackCanonicalWrite(
  key: string,
  write: Promise<unknown>,
): void {
  pendingWrites.add(write);
  void write
    .then(
      () => failedWrites.delete(key),
      (error) => {
        failedWrites.set(key, error);
        console.warn(`Failed to persist canonical ${key}:`, error);
      },
    )
    .finally(() => pendingWrites.delete(write));
}

export async function flushRendererPersistence(): Promise<void> {
  flushSettings?.();
  await Promise.all([...pendingWrites]);
  if (failedWrites.size)
    throw new Error(
      "Canonical renderer persistence has an unresolved write failure",
    );
}

export function setRendererSettingsFlush(flush: () => void): void {
  flushSettings = flush;
}

export function resetRendererPersistenceWrites(): void {
  flushSettings = null;
  pendingWrites.clear();
  failedWrites.clear();
}
