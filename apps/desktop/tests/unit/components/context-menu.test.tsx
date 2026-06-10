import { render, screen, fireEvent, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  ContextMenu,
  type ContextMenuItem,
} from "../../../src/renderer/components/ui/ContextMenu";

describe("ContextMenu", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      vi.runOnlyPendingTimers();
    });
    vi.useRealTimers();
  });

  function makeItems(onEach: () => void = vi.fn()): ContextMenuItem[] {
    return [
      { label: "Copy", onClick: onEach },
      { label: "Delete", onClick: onEach, variant: "destructive" },
      { label: "Disabled", onClick: vi.fn(), disabled: true },
    ];
  }

  it("renders all items at the requested position", () => {
    render(
      <ContextMenu x={50} y={80} items={makeItems()} onClose={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Copy" })).toHaveAttribute(
      "type",
      "button",
    );
    expect(screen.getByRole("button", { name: "Delete" })).toHaveAttribute(
      "type",
      "button",
    );
    expect(screen.getByRole("button", { name: "Disabled" })).toHaveAttribute(
      "type",
      "button",
    );
  });

  it("invokes the action and then closes when an item is clicked", () => {
    const onClose = vi.fn();
    const onClick = vi.fn();
    render(
      <ContextMenu
        x={0}
        y={0}
        items={[{ label: "Run", onClick }]}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClick or close when item is disabled", () => {
    const onClose = vi.fn();
    const onClick = vi.fn();
    render(
      <ContextMenu
        x={0}
        y={0}
        items={[{ label: "Skip", onClick, disabled: true }]}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(onClick).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on outside mousedown", () => {
    const onClose = vi.fn();
    render(
      <ContextMenu x={0} y={0} items={makeItems()} onClose={onClose} />,
    );
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when window is resized", () => {
    const onClose = vi.fn();
    render(
      <ContextMenu x={0} y={0} items={makeItems()} onClose={onClose} />,
    );
    fireEvent(window, new Event("resize"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <ContextMenu x={0} y={0} items={makeItems()} onClose={onClose} />,
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders a shortcut hint when provided", () => {
    render(
      <ContextMenu
        x={0}
        y={0}
        items={[{ label: "Save", onClick: vi.fn(), shortcut: "⌘S" }]}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("⌘S")).toBeInTheDocument();
  });

  it("keeps submenu open while moving across the hover gap", () => {
    render(
      <ContextMenu
        x={0}
        y={0}
        items={[
          {
            label: "Move to...",
            children: [{ label: "Folder A", onClick: vi.fn() }],
          },
        ]}
        onClose={vi.fn()}
      />,
    );

    const moveButton = screen.getByRole("button", { name: /Move to\.\.\./i });
    const moveRow = moveButton.parentElement as HTMLElement;
    expect(moveButton).toHaveAttribute("type", "button");
    expect(moveButton).toHaveAttribute("aria-haspopup", "menu");
    expect(moveButton).toHaveAttribute("aria-expanded", "false");

    act(() => {
      fireEvent.mouseEnter(moveRow);
    });
    expect(moveButton).toHaveAttribute("aria-expanded", "true");
    const childButton = screen.getByRole("button", { name: "Folder A" });
    expect(childButton).toHaveAttribute("type", "button");
    expect(childButton).toBeInTheDocument();
    expect(moveButton.querySelector("svg")).toHaveAttribute("aria-hidden", "true");

    act(() => {
      fireEvent.mouseLeave(moveRow);
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.getByRole("button", { name: "Folder A" })).toBeInTheDocument();
  });

  it("hides inset child indicators from assistive technology", () => {
    render(
      <ContextMenu
        x={0}
        y={0}
        items={[
          {
            label: "Move to...",
            children: [{ label: "Nested folder", insetLevel: 1, onClick: vi.fn() }],
          },
        ]}
        onClose={vi.fn()}
      />,
    );

    const moveButton = screen.getByRole("button", { name: /Move to\.\.\./i });
    fireEvent.mouseEnter(moveButton.parentElement as HTMLElement);

    const childButton = screen.getByRole("button", { name: "Nested folder" });
    expect(childButton.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("hides custom menu item icons from assistive technology", () => {
    render(
      <ContextMenu
        x={0}
        y={0}
        items={[
          {
            label: "Copy",
            icon: <svg data-testid="copy-icon" />,
            onClick: vi.fn(),
          },
          {
            label: "Move to...",
            children: [
              {
                label: "Folder A",
                icon: <svg data-testid="folder-icon" />,
                onClick: vi.fn(),
              },
            ],
          },
        ]}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId("copy-icon").closest("span")).toHaveAttribute(
      "aria-hidden",
      "true",
    );

    const moveButton = screen.getByRole("button", { name: /Move to\.\.\./i });
    fireEvent.mouseEnter(moveButton.parentElement as HTMLElement);

    expect(screen.getByTestId("folder-icon").closest("span")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});
