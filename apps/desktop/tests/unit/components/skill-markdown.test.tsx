import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SkillMarkdown } from "../../../src/renderer/components/skill/SkillMarkdown";

describe("SkillMarkdown", () => {
  it("renders unsafe markdown links as text instead of empty clickable anchors", () => {
    render(
      <SkillMarkdown
        content={
          "[bad](javascript:alert(1)) [file](file:///etc/passwd) [ok](https://example.com/docs)"
        }
      />,
    );

    expect(screen.getByText("bad").closest("a")).toBeNull();
    expect(screen.getByText("file").closest("a")).toBeNull();
    expect(screen.getByRole("link", { name: "ok" })).toHaveAttribute(
      "href",
      "https://example.com/docs",
    );
  });

  it("keeps GitHub relative markdown links clickable when a safe base exists", () => {
    render(
      <SkillMarkdown
        content={"[setup](docs/setup.md)"}
        sourceUrl="https://github.com/anthropics/skills/tree/main/skills/pdf"
      />,
    );

    expect(screen.getByRole("link", { name: "setup" })).toHaveAttribute(
      "href",
      "https://github.com/anthropics/skills/blob/main/skills/pdf/docs/setup.md",
    );
  });
});
