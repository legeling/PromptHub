import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ResizableHeader } from "../../../src/renderer/components/prompt/ResizableHeader";
import type { ColumnConfig } from "../../../src/renderer/hooks/useTableConfig";

function makeColumn(overrides: Partial<ColumnConfig> = {}): ColumnConfig {
  return {
    id: "title",
    label: "prompt.title",
    visible: true,
    width: 160,
    minWidth: 100,
    maxWidth: 300,
    resizable: true,
    reorderable: true,
    ...overrides,
  };
}

function renderHeader(overrides: Partial<ColumnConfig> = {}) {
  const onResize = vi.fn();
  const utils = render(
    <table>
      <thead>
        <tr>
          <ResizableHeader column={makeColumn(overrides)} onResize={onResize}>
            Title
          </ResizableHeader>
        </tr>
      </thead>
    </table>,
  );
  const handle = utils.container.querySelector<HTMLElement>(".cursor-col-resize");
  if (!handle) {
    throw new Error("Missing resize handle");
  }
  return { handle, onResize, ...utils };
}

function renderHeaderContainer(overrides: Partial<ColumnConfig> = {}) {
  return render(
    <table>
      <thead>
        <tr>
          <ResizableHeader
            column={makeColumn(overrides)}
            onResize={vi.fn()}
          >
            Title
          </ResizableHeader>
        </tr>
      </thead>
    </table>,
  );
}

describe("ResizableHeader", () => {
  afterEach(() => {
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    vi.restoreAllMocks();
  });

  it("restores the previous body cursor and selection styles after drag", () => {
    document.body.style.cursor = "default";
    document.body.style.userSelect = "text";
    const { handle } = renderHeader();

    fireEvent.mouseDown(handle, { clientX: 100 });
    expect(document.body.style.cursor).toBe("col-resize");
    expect(document.body.style.userSelect).toBe("none");

    fireEvent.mouseUp(document);

    expect(document.body.style.cursor).toBe("default");
    expect(document.body.style.userSelect).toBe("text");
  });

  it("cleans up drag listeners and body styles when unmounted mid-drag", () => {
    document.body.style.cursor = "default";
    document.body.style.userSelect = "text";
    const removeListenerSpy = vi.spyOn(document, "removeEventListener");
    const { handle, onResize, unmount } = renderHeader();

    fireEvent.mouseDown(handle, { clientX: 100 });
    unmount();

    fireEvent.mouseMove(document, { clientX: 150 });

    expect(onResize).not.toHaveBeenCalled();
    expect(removeListenerSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["mousemove", expect.any(Function)],
        ["mouseup", expect.any(Function)],
      ]),
    );
    expect(document.body.style.cursor).toBe("default");
    expect(document.body.style.userSelect).toBe("text");
  });

  it("does not render a drag handle for non-resizable columns", () => {
    const { container } = renderHeaderContainer({ resizable: false });

    expect(container.querySelector(".cursor-col-resize")).toBeNull();
  });
});
