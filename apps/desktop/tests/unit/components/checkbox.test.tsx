import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Checkbox } from "../../../src/renderer/components/ui/Checkbox";

describe("Checkbox", () => {
  it("renders with a label", () => {
    render(<Checkbox checked={false} onChange={vi.fn()} label="Enable sync" />);
    expect(screen.getByText("Enable sync")).toBeInTheDocument();
  });

  it("supports an accessible name without a visible label", () => {
    render(
      <Checkbox
        checked={false}
        onChange={vi.fn()}
        ariaLabel="Select export item"
      />,
    );
    expect(screen.getByRole("checkbox", { name: "Select export item" })).toBeInTheDocument();
  });

  it("toggles via the underlying label click and reports the new value", () => {
    const onChange = vi.fn();
    render(<Checkbox checked={false} onChange={onChange} label="Toggle" />);
    fireEvent.click(screen.getByText("Toggle"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("reports the inverse when checked is true", () => {
    const onChange = vi.fn();
    render(<Checkbox checked onChange={onChange} label="On" />);
    fireEvent.click(screen.getByText("On"));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("reflects the checked state in the underlying input", () => {
    const { rerender } = render(
      <Checkbox checked={false} onChange={vi.fn()} label="Sync" />,
    );
    const input = screen.getByRole("checkbox") as HTMLInputElement;
    expect(input.checked).toBe(false);

    rerender(<Checkbox checked onChange={vi.fn()} label="Sync" />);
    expect(input.checked).toBe(true);
  });

  it("does not double-toggle when the native input change event fires", () => {
    const onChange = vi.fn();
    render(<Checkbox checked={false} onChange={onChange} label="Native" />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Native" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("ignores clicks when disabled", () => {
    const onChange = vi.fn();
    render(
      <Checkbox checked={false} onChange={onChange} label="Off" disabled />,
    );
    fireEvent.click(screen.getByText("Off"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
