export interface PersistHydrationController {
  hasHydrated?: () => boolean;
  onFinishHydration?: (callback: () => void) => () => void;
}

export function waitForPersistHydration(
  persistController: PersistHydrationController | undefined,
  timeoutMs = 500,
): Promise<void> {
  if (!persistController || persistController.hasHydrated?.()) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    let finished = false;
    let timeoutId: number | null = null;
    let unsubscribe: (() => void) | undefined;

    const finish = () => {
      if (finished) {
        return;
      }

      finished = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
      unsubscribe?.();
      resolve();
    };

    timeoutId = window.setTimeout(finish, timeoutMs);
    unsubscribe = persistController.onFinishHydration?.(finish);

    if (finished) {
      unsubscribe?.();
    }
  });
}
