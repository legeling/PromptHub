import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  SkillCodeEditor,
  getSkillCodeEditorLanguageName,
} from "../../../src/renderer/components/skill/SkillCodeEditor";

describe("SkillCodeEditor", () => {
  it("detects common editor languages from file paths", () => {
    expect(getSkillCodeEditorLanguageName("scripts/main.ts")).toBe(
      "typescript",
    );
    expect(getSkillCodeEditorLanguageName("scripts/tool.py")).toBe("python");
    expect(getSkillCodeEditorLanguageName("config/openai.yaml")).toBe("yaml");
    expect(getSkillCodeEditorLanguageName("README.md")).toBe("markdown");
    expect(getSkillCodeEditorLanguageName("unknown.asset")).toBe("plaintext");
  });

  it("renders a CodeMirror editor surface for code content", async () => {
    const { container } = render(
      <SkillCodeEditor
        path="scripts/main.ts"
        value="export const value: string = 'ok';"
        editable={false}
        onChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector(".cm-editor")).not.toBeNull();
    });

    expect(screen.getByTestId("skill-code-editor")).toHaveAttribute(
      "data-language",
      "typescript",
    );
    expect(container.querySelector(".cm-content")).toHaveTextContent(
      "export const value",
    );
    expect(container.querySelector(".cm-scroller")).not.toBeNull();
    expect(container.querySelector(".cm-content")).toHaveClass(
      "cm-lineWrapping",
    );
  });

  it("does not report parent-driven value updates as user edits", async () => {
    const onChange = vi.fn();
    const { container, rerender } = render(
      <SkillCodeEditor
        path="scripts/main.py"
        value=""
        editable={true}
        onChange={onChange}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector(".cm-editor")).not.toBeNull();
    });

    rerender(
      <SkillCodeEditor
        path="scripts/main.py"
        value={"def run():\n    return 'ok'\n"}
        editable={true}
        onChange={onChange}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector(".cm-content")).toHaveTextContent(
        "def run",
      );
    });

    expect(onChange).not.toHaveBeenCalled();
  });
});
