import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Input } from "../../../src/renderer/components/ui/Input";

describe("Input", () => {
  it("associates the visible label with the input", () => {
    render(<Input label="Title" placeholder="Untitled" />);
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toBe(screen.getByPlaceholderText("Untitled"));
  });

  it("propagates the value via onChange", () => {
    const onChange = vi.fn();
    render(<Input defaultValue="" onChange={onChange} placeholder="Type here" />);
    const input = screen.getByPlaceholderText("Type here") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "hello" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(
      (onChange.mock.calls[0][0] as React.ChangeEvent<HTMLInputElement>).target
        .value,
    ).toBe("hello");
  });

  it("renders error message when error prop is set", () => {
    render(<Input label="Email" error="Invalid email" />);
    const input = screen.getByLabelText("Email");
    const error = screen.getByText("Invalid email");

    expect(error).toBeInTheDocument();
    expect(input).toHaveAccessibleDescription("Invalid email");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("forwards refs", () => {
    let captured: HTMLInputElement | null = null;
    render(
      <Input
        ref={(el) => {
          captured = el;
        }}
        placeholder="Ref"
      />,
    );
    expect(captured).toBeInstanceOf(HTMLInputElement);
    expect(captured?.placeholder).toBe("Ref");
  });

  it("respects type=password", () => {
    render(<Input type="password" placeholder="pwd" />);
    const input = screen.getByPlaceholderText("pwd") as HTMLInputElement;
    expect(input.type).toBe("password");
  });
});
