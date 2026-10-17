import { act, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePromptMediaManager } from "../../../src/renderer/components/prompt/usePromptMediaManager";
import { installWindowMocks } from "../../helpers/window";

function renderMediaManager() {
  installWindowMocks();
  window.electron.selectImage = vi
    .fn()
    .mockResolvedValue(["/tmp/reference.png"]);
  window.electron.saveImage = vi.fn().mockResolvedValue(["reference.png"]);
  window.electron.selectVideo = vi
    .fn()
    .mockResolvedValue(["/tmp/reference.mp4"]);
  window.electron.saveVideo = vi.fn().mockResolvedValue(["reference.mp4"]);
  const showToast = vi.fn();
  const hook = renderHook(
    ({ isOpen }) =>
      usePromptMediaManager({
        isOpen,
        translate: (key) => key,
        showToast,
      }),
    { initialProps: { isOpen: true }, wrapper: StrictMode },
  );
  return { ...hook, showToast };
}

// Native dialogs/storage are replaced here; this suite exercises React's
// development effect replay and the media manager's visible state contract.
describe("Prompt media lifecycle under StrictMode", () => {
  afterEach(() => vi.restoreAllMocks());

  it("retains selected images and videos after effect replay and reopening", async () => {
    const { result, rerender } = renderMediaManager();
    await act(async () => {
      await result.current.handleSelectImage();
      await result.current.handleSelectVideo();
    });
    expect(result.current.images).toEqual(["reference.png"]);
    expect(result.current.videos).toEqual(["reference.mp4"]);
    rerender({ isOpen: false });
    rerender({ isOpen: true });
    window.electron.saveImage = vi.fn().mockResolvedValue(["second.png"]);
    await act(async () => {
      await result.current.handleSelectImage();
    });
    expect(result.current.images).toEqual(["reference.png", "second.png"]);
  });

  it("reports a copy failure and permits retry without losing earlier media", async () => {
    const { result, showToast } = renderMediaManager();
    await act(async () => {
      await result.current.handleSelectImage();
    });
    window.electron.saveImage = vi.fn().mockResolvedValue([]);
    await act(async () => {
      await result.current.handleSelectImage();
    });
    expect(result.current.images).toEqual(["reference.png"]);
    expect(showToast).toHaveBeenCalledWith("prompt.uploadFailed", "error");
    window.electron.saveImage = vi.fn().mockResolvedValue(["retry.png"]);
    await act(async () => {
      await result.current.handleSelectImage();
    });
    expect(result.current.images).toEqual(["reference.png", "retry.png"]);
  });

  it.each(["close", "unmount"])(
    "discards a picker result after actual %s",
    async (action) => {
      const { result, rerender, unmount, showToast } = renderMediaManager();
      let resolveSelection: (paths: string[]) => void = () => undefined;
      window.electron.selectImage = vi.fn(
        () =>
          new Promise<string[]>((resolve) => {
            resolveSelection = resolve;
          }),
      );
      let pending: Promise<void> = Promise.resolve();
      act(() => {
        pending = result.current.handleSelectImage();
      });
      if (action === "close") rerender({ isOpen: false });
      else unmount();
      await act(async () => {
        resolveSelection(["/tmp/reference.png"]);
        await pending;
      });
      expect(window.electron.saveImage).not.toHaveBeenCalled();
      expect(result.current.images).toEqual([]);
      expect(showToast).not.toHaveBeenCalled();
    },
  );
});
