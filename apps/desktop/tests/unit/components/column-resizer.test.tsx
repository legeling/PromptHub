import { afterEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { ColumnResizer } from "../../../src/renderer/components/ui/ColumnResizer";

/**
 * Behavioral tests for the drag-to-resize handle introduced in #119.
 *
 * We exercise:
 *   - Pointer drag translates pointer delta into clamped width updates.
 *   - Double-click restores the default width.
 *   - Keyboard shortcuts move the column in fine (16 px) and coarse
 *     (64 px with Shift) steps, and bound to [min, max].
 *   - Primary button filtering: right-click / middle-click must not start
 *     a drag.
 */

function renderResizer(overrides: Partial<Parameters<typeof ColumnResizer>[0]> = {}) {
  const onResize = vi.fn();
  const utils = render(
    <ColumnResizer
      currentWidth={300}
      min={200}
      max={600}
      defaultWidth={280}
      onResize={onResize}
      ariaLabel="Resize"
      {...overrides}
    />,
  );
  const handle = screen.getByRole("separator", { name: "Resize" });
  return { handle, onResize, ...utils };
}

describe("ColumnResizer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resizes the column as the pointer moves while dragging", () => {
    const { handle, onResize } = renderResizer({ currentWidth: 300 });

    fireEvent.pointerDown(handle, { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 160, pointerId: 1 });
    expect(onResize).toHaveBeenLastCalledWith(360);

    fireEvent.pointerMove(handle, { clientX: 40, pointerId: 1 });
    expect(onResize).toHaveBeenLastCalledWith(240);

    fireEvent.pointerUp(handle, { pointerId: 1 });
  });

  it("keeps pointer-capture failures silent while preserving drag behavior", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const debugSpy = vi
      .spyOn(console, "debug")
      .mockImplementation(() => undefined);
    const { handle, onResize } = renderResizer({ currentWidth: 300 });
    handle.setPointerCapture = vi.fn(() => {
      throw new Error("capture failed");
    });
    handle.releasePointerCapture = vi.fn(() => {
      throw new Error("release failed");
    });

    fireEvent.pointerDown(handle, { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 180, pointerId: 1 });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 220, pointerId: 1 });

    expect(handle.setPointerCapture).toHaveBeenCalledWith(1);
    expect(handle.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(onResize).toHaveBeenCalledTimes(1);
    expect(onResize).toHaveBeenCalledWith(380);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(debugSpy).not.toHaveBeenCalled();
  });

  it("clamps the width to [min, max] during a drag", () => {
    const { handle, onResize } = renderResizer({
      currentWidth: 250,
      min: 200,
      max: 400,
    });

    // Drag past max
    fireEvent.pointerDown(handle, { button: 0, clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 10_000, pointerId: 1 });
    expect(onResize).toHaveBeenLastCalledWith(400);

    // Drag past min
    fireEvent.pointerMove(handle, { clientX: -10_000, pointerId: 1 });
    expect(onResize).toHaveBeenLastCalledWith(200);

    fireEvent.pointerUp(handle, { pointerId: 1 });
  });

  it("ignores non-primary buttons so a right-click menu does not start a drag", () => {
    const { handle, onResize } = renderResizer({ currentWidth: 300 });
    fireEvent.pointerDown(handle, { button: 2, clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 50, pointerId: 1 });
    expect(onResize).not.toHaveBeenCalled();
  });

  it("restores the default width on double-click", () => {
    const { handle, onResize } = renderResizer({
      currentWidth: 500,
      defaultWidth: 280,
    });
    fireEvent.doubleClick(handle);
    expect(onResize).toHaveBeenCalledWith(280);
  });

  it("supports keyboard resize (ArrowLeft / ArrowRight / Shift)", () => {
    const { handle, onResize } = renderResizer({ currentWidth: 300 });

    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(onResize).toHaveBeenLastCalledWith(316);

    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(onResize).toHaveBeenLastCalledWith(284);

    fireEvent.keyDown(handle, { key: "ArrowRight", shiftKey: true });
    expect(onResize).toHaveBeenLastCalledWith(364);
  });

  it("Enter / Space / Home / End all trigger a reset to default", () => {
    const { handle, onResize } = renderResizer({
      currentWidth: 500,
      defaultWidth: 280,
    });

    for (const key of ["Enter", " ", "Home", "End"]) {
      onResize.mockClear();
      fireEvent.keyDown(handle, { key });
      expect(onResize).toHaveBeenCalledWith(280);
    }
  });

  it("exposes the current width through ARIA attributes", () => {
    const { handle } = renderResizer({ currentWidth: 420 });
    expect(handle.getAttribute("aria-valuenow")).toBe("420");
    expect(handle.getAttribute("aria-valuemin")).toBe("200");
    expect(handle.getAttribute("aria-valuemax")).toBe("600");
    expect(handle.getAttribute("aria-orientation")).toBe("vertical");
  });

  it("can pin the visible divider to the start of an external hit target", () => {
    const { handle } = renderResizer({ barPosition: "start" });
    const divider = handle.querySelector("[aria-hidden='true']");

    expect(divider).toHaveClass("left-0");
    expect(divider).not.toHaveClass("left-1/2");
    expect(divider).not.toHaveClass("-translate-x-1/2");
  });
});
