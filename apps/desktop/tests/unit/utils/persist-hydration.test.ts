import { afterEach, describe, expect, it, vi } from "vitest";

import { waitForPersistHydration } from "../../../src/renderer/utils/persist-hydration";

describe("waitForPersistHydration", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("resolves immediately when the store is already hydrated", async () => {
    const onFinishHydration = vi.fn();

    await waitForPersistHydration({
      hasHydrated: () => true,
      onFinishHydration,
    });

    expect(onFinishHydration).not.toHaveBeenCalled();
  });

  it("handles synchronous hydration callbacks without touching an uninitialized timer", async () => {
    vi.useFakeTimers();
    const unsubscribe = vi.fn();

    await waitForPersistHydration({
      hasHydrated: () => false,
      onFinishHydration: (finish) => {
        finish();
        return unsubscribe;
      },
    });

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("falls back to the timeout when hydration never finishes", async () => {
    vi.useFakeTimers();
    let resolved = false;

    const promise = waitForPersistHydration({
      hasHydrated: () => false,
      onFinishHydration: () => vi.fn(),
    }).then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(499);
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await promise;

    expect(resolved).toBe(true);
  });
});
