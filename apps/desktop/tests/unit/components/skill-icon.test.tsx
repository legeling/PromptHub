import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ICON_DOCUMENT } from "@prompthub/shared/constants/skill-icons";

import {
  resolveSkillIconUrl,
  SkillIcon,
} from "../../../src/renderer/components/skill/SkillIcon";

describe("SkillIcon", () => {
  it("uses computed foreground color for custom pastel backgrounds", () => {
    render(
      <SkillIcon
        name="Skill"
        backgroundColor="#f2d6de"
        size="md"
      />,
    );

    const label = screen.getByText("S");
    const container = label.parentElement;

    expect(container).not.toBeNull();
    expect(container?.className).not.toContain("text-slate-900");
    expect(container?.className).not.toContain("text-slate-700");
    expect(container).toHaveStyle({
      backgroundColor: "rgb(242, 214, 222)",
      color: "rgb(30, 41, 59)",
    });
  });

  it("does not render unsafe icon URL protocols", () => {
    render(
      <SkillIcon
        name="Unsafe Skill"
        iconUrl="javascript:alert(1)"
        size="md"
      />,
    );

    expect(document.querySelector('img[src="javascript:alert(1)"]')).toBeNull();
    expect(screen.getByText("U")).toBeInTheDocument();
  });

  it("keeps safe remote and preset data icon URLs renderable", () => {
    expect(resolveSkillIconUrl(" https://example.com/icon.png ")).toBe(
      "https://example.com/icon.png",
    );
    expect(resolveSkillIconUrl(ICON_DOCUMENT)).toBe(ICON_DOCUMENT);
    expect(resolveSkillIconUrl("file:///tmp/icon.png")).toBe("");
    expect(resolveSkillIconUrl("data:text/html;base64,PHNjcmlwdD4=")).toBe("");

    render(
      <SkillIcon name="Document Skill" iconUrl={ICON_DOCUMENT} size="md" />,
    );

    expect(screen.getByRole("img", { name: "Document Skill" }))
      .toHaveAttribute("src", ICON_DOCUMENT);
  });
});
