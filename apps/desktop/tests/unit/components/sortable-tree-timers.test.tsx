import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SortableTree } from "../../../src/renderer/components/layout/tree/SortableTree";
import type { Folder } from "@prompthub/shared/types";

const dndContextProps = vi.hoisted(() => ({
  current: null as null | {
    onDragStart?: (event: { active: { id: string } }) => void;
    onDragEnd?: (event: { over: { id: string } | null }) => void;
    onDragCancel?: () => void;
  },
}));

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children, ...props }: { children: React.ReactNode }) => {
    dndContextProps.current = props;
    return <div>{children}</div>;
  },
  DragOverlay: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  MeasuringStrategy: { WhileDragging: "WhileDragging" },
  closestCenter: vi.fn(() => []),
  defaultDropAnimationSideEffects: vi.fn(() => vi.fn()),
  pointerWithin: vi.fn(() => []),
  useDroppable: () => ({ setNodeRef: vi.fn() }),
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  arrayMove: <T,>(items: T[]) => items,
  verticalListSortingStrategy: vi.fn(),
}));

vi.mock("../../../src/renderer/components/layout/tree/SortableTreeItem", () => ({
  SortableTreeItem: ({ folder, onSelect }: { folder: Folder; onSelect?: () => void }) => (
    <button data-tree-item type="button" onClick={onSelect}>
      {folder.name}
    </button>
  ),
}));

const folders: Folder[] = [
  {
    id: "folder-1",
    name: "Folder 1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    order: 0,
  },
];

function renderTree() {
  return render(
    <SortableTree
      folders={folders}
      selectedFolderId={null}
      expandedIds={new Set()}
      unlockedFolderIds={new Set()}
      isCollapsed={false}
      currentPage="home"
      onSelectFolder={vi.fn()}
      onEditFolder={vi.fn()}
      onToggleExpand={vi.fn()}
      onReorderFolders={vi.fn()}
    />,
  );
}

describe("SortableTree timers", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    dndContextProps.current = null;
    document.body.style.removeProperty("cursor");
  });

  it("clears delayed drag reset timers when unmounted", () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");
    const { unmount } = renderTree();

    act(() => {
      dndContextProps.current?.onDragStart?.({ active: { id: "folder-1" } });
      dndContextProps.current?.onDragCancel?.();
    });

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 80);

    clearTimeoutSpy.mockClear();
    act(() => {
      unmount();
    });

    expect(clearTimeoutSpy).toHaveBeenCalledWith(expect.anything());
    expect(document.body.style.cursor).toBe("");
  });

  it("clears the previous delayed reset before scheduling another one", () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");
    renderTree();

    act(() => {
      dndContextProps.current?.onDragStart?.({ active: { id: "folder-1" } });
      dndContextProps.current?.onDragCancel?.();
    });

    clearTimeoutSpy.mockClear();

    act(() => {
      dndContextProps.current?.onDragStart?.({ active: { id: "folder-1" } });
      dndContextProps.current?.onDragCancel?.();
    });

    expect(clearTimeoutSpy).toHaveBeenCalledWith(expect.anything());
  });

  it("clears the previous delayed reset when a new drag starts", () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");
    renderTree();

    act(() => {
      dndContextProps.current?.onDragStart?.({ active: { id: "folder-1" } });
      dndContextProps.current?.onDragCancel?.();
    });

    clearTimeoutSpy.mockClear();

    act(() => {
      dndContextProps.current?.onDragStart?.({ active: { id: "folder-1" } });
    });

    expect(clearTimeoutSpy).toHaveBeenCalledWith(expect.anything());
  });
});
