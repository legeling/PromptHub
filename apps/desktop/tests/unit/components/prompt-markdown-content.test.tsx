import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PromptMarkdownContent } from "../../../src/renderer/components/prompt/PromptMarkdownContent";

describe("PromptMarkdownContent", () => {
  it("renders markdown with search-term highlighting", () => {
    render(
      <PromptMarkdownContent
        content={"## Plan\n\nUse the weekly planner."}
        highlightTerms={["weekly"]}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "Plan" }),
    ).toBeInTheDocument();
    expect(screen.getByText("weekly")).toHaveClass("bg-primary/15");
  });

  it("sanitizes unsafe raw HTML", () => {
    render(
      <PromptMarkdownContent
        content={'Safe <script>alert(1)</script><img src=x onerror="alert(2)" />'}
        highlightTerms={[]}
      />,
    );

    expect(screen.getByText(/Safe/)).toBeInTheDocument();
    expect(document.querySelector("script")).not.toBeInTheDocument();
    expect(document.querySelector("img")).not.toBeInTheDocument();
  });

  it("does not render unsafe markdown link protocols as anchors", () => {
    render(
      <PromptMarkdownContent
        content={"[bad](javascript:alert(1)) [file](file:///etc/passwd) [ok](https://example.com/docs)"}
        highlightTerms={[]}
      />,
    );

    expect(screen.getByText("bad").closest("a")).toBeNull();
    expect(screen.getByText("file").closest("a")).toBeNull();
    expect(screen.getByRole("link", { name: "ok" })).toHaveAttribute(
      "href",
      "https://example.com/docs",
    );
  });
});
