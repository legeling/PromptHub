import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useTemporaryFlag } from "../../../src/renderer/hooks/useTemporaryFlag";

describe("useTemporaryFlag", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("resets the flag after the configured delay", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTemporaryFlag(2000));

    act(() => {
      result.current[1]();
    });

    expect(result.current[0]).toBe(true);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current[0]).toBe(false);
  });

  it("clears the previous timer when triggered repeatedly", () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");
    const { result } = renderHook(() => useTemporaryFlag(2000));

    act(() => {
      result.current[1]();
      result.current[1]();
    });

    expect(clearTimeoutSpy).toHaveBeenCalledWith(expect.anything());

    act(() => {
      vi.advanceTimersByTime(1999);
    });

    expect(result.current[0]).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(result.current[0]).toBe(false);
  });

  it("clears a pending timer when unmounted", () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");
    const { result, unmount } = renderHook(() => useTemporaryFlag(2000));

    act(() => {
      result.current[1]();
    });

    clearTimeoutSpy.mockClear();
    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalledWith(expect.anything());
  });
});
