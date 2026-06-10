import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import {
  Textarea,
  handleMarkdownListKeyDown,
} from "../../../src/renderer/components/ui/Textarea";

describe("Textarea", () => {
  it("renders the label and surfaces error", () => {
    render(<Textarea label="Body" error="Required" />);
    expect(screen.getByText("Body")).toBeInTheDocument();
    const textarea = screen.getByLabelText("Body");
    const error = screen.getByText("Required");

    expect(error).toBeInTheDocument();
    expect(textarea).toHaveAccessibleDescription("Required");
    expect(textarea).toHaveAttribute("aria-invalid", "true");
  });

  it("forwards onChange events", () => {
    const onChange = vi.fn();
    render(<Textarea value="" onChange={onChange} placeholder="text" />);
    fireEvent.change(screen.getByPlaceholderText("text"), {
      target: { value: "abc" },
    });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe("handleMarkdownListKeyDown", () => {
  function makeEvent(value: string, cursor: number) {
    const target = {
      selectionStart: cursor,
      selectionEnd: cursor,
      value,
    };
    return {
      key: "Enter",
      shiftKey: false,
      preventDefault: vi.fn(),
      currentTarget: target,
    } as unknown as React.KeyboardEvent<HTMLTextAreaElement>;
  }

  it("does nothing when Shift+Enter is pressed", () => {
    const onChange = vi.fn();
    const evt = {
      ...makeEvent("- a", 3),
      shiftKey: true,
    } as unknown as React.KeyboardEvent<HTMLTextAreaElement>;
    const handled = handleMarkdownListKeyDown(evt, "- a", onChange);
    expect(handled).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("continues an unordered list with the same marker", () => {
    const onChange = vi.fn();
    const evt = makeEvent("- first", 7);
    const handled = handleMarkdownListKeyDown(evt, "- first", onChange);
    expect(handled).toBe(true);
    // Insertion is "\n- " (length 3). Cursor lands at 10.
    expect(onChange).toHaveBeenCalledWith("- first\n- ", 10);
  });

  it("exits list mode when continuing an empty marker", () => {
    const onChange = vi.fn();
    const value = "- first\n- ";
    const evt = makeEvent(value, value.length);
    const handled = handleMarkdownListKeyDown(evt, value, onChange);
    expect(handled).toBe(true);
    expect(onChange).toHaveBeenCalledWith("- first\n", "- first\n".length);
  });

  it("increments numbers in ordered lists", () => {
    const onChange = vi.fn();
    const value = "1. one\n2. two";
    const evt = makeEvent(value, value.length);
    const handled = handleMarkdownListKeyDown(evt, value, onChange);
    expect(handled).toBe(true);
    // After "2. two" (len 13), insertion is "\n3. " (len 4), cursor lands at 17.
    expect(onChange).toHaveBeenCalledWith("1. one\n2. two\n3. ", value.length + 4);
  });

  it("starts a new checkbox when the previous item has content", () => {
    const onChange = vi.fn();
    const value = "- [ ] task";
    const evt = makeEvent(value, value.length);
    const handled = handleMarkdownListKeyDown(evt, value, onChange);
    expect(handled).toBe(true);
    // Insertion is "\n- [ ] " (length 7). Cursor lands at value.length + 7.
    expect(onChange).toHaveBeenCalledWith("- [ ] task\n- [ ] ", value.length + 7);
  });
});
