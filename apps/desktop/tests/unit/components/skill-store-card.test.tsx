import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { RegistrySkill } from "@prompthub/shared/types";
import { SkillStoreCard } from "../../../src/renderer/components/skill/SkillStoreCard";

function makeSkill(overrides: Partial<RegistrySkill> = {}): RegistrySkill {
  const base: RegistrySkill = {
    slug: "test-skill",
    name: "Test Skill",
    description: "A skill for tests",
    category: "general" as RegistrySkill["category"],
    icon_emoji: "🧪",
    icon_background: "#f0f0f0",
    author: "tester",
    source_url: "https://example.com/skill",
    source_id: "test-skill-source",
    tags: [],
    version: "1.0.0",
    content: "# Test\n",
  };
  return { ...base, ...overrides };
}

/**
 * SkillStoreCard renders one of three trailing controls based on its props:
 *   - hasUpdate=true                → amber DownloadIcon (no button)
 *   - isInstalled=true (no update)  → green CheckIcon    (no button)
 *   - otherwise                      → install button (PlusIcon or spinner)
 *
 * Tests assert the visible affordance of each branch directly, not just the
 * absence of the install button — that way a regression that hides the
 * install button without rendering the success / update icon still fails.
 */
describe("SkillStoreCard", () => {
  function getTrailingIcon(container: HTMLElement): SVGElement {
    // The trailing control is the last svg inside the card (excluding the
    // SkillIcon emoji area, which renders text not an svg).
    const svgs = container.querySelectorAll("svg");
    const last = svgs[svgs.length - 1];
    if (!last) {
      throw new Error("No trailing icon rendered");
    }
    return last;
  }

  function getStateBadge(container: HTMLElement): HTMLElement | null {
    return container.querySelector(
      ".text-green-500, .text-amber-500",
    ) as HTMLElement | null;
  }

  it("renders skill name and description", () => {
    render(
      <SkillStoreCard
        skill={makeSkill({
          name: "Code Reviewer",
          description: "Reviews diffs",
        })}
        isInstalled={false}
        index={0}
        onClick={vi.fn()}
      />,
    );
    expect(screen.getByText("Code Reviewer")).toBeInTheDocument();
    expect(screen.getByText("Reviews diffs")).toBeInTheDocument();
  });

  it("calls onClick when the card itself is clicked", () => {
    const onClick = vi.fn();
    render(
      <SkillStoreCard
        skill={makeSkill()}
        isInstalled={false}
        index={0}
        onClick={onClick}
      />,
    );
    fireEvent.click(screen.getByText("Test Skill"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders the green check badge when isInstalled is true", () => {
    const { container } = render(
      <SkillStoreCard
        skill={makeSkill()}
        isInstalled
        index={0}
        onClick={vi.fn()}
      />,
    );
    const badge = getStateBadge(container);
    expect(badge).not.toBeNull();
    expect(badge!.className).toContain("text-green-500");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders the amber update badge when hasUpdate is true (overrides installed)", () => {
    const { container } = render(
      <SkillStoreCard
        skill={makeSkill()}
        isInstalled
        hasUpdate
        index={0}
        onClick={vi.fn()}
      />,
    );
    const badge = getStateBadge(container);
    expect(badge).not.toBeNull();
    expect(badge!.className).toContain("text-amber-500");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders the install button when not installed and triggers onQuickInstall", () => {
    const onQuickInstall = vi.fn();
    const skill = makeSkill();
    render(
      <SkillStoreCard
        skill={skill}
        isInstalled={false}
        index={0}
        onQuickInstall={onQuickInstall}
        onClick={vi.fn()}
      />,
    );
    const button = screen.getByRole("button");
    fireEvent.click(button);
    expect(onQuickInstall).toHaveBeenCalledTimes(1);
    expect(onQuickInstall.mock.calls[0][0]).toBe(skill);
  });

  it("disables the install button and shows a spinner while installing this skill", () => {
    const { container } = render(
      <SkillStoreCard
        skill={makeSkill({ source_id: "busy" })}
        isInstalled={false}
        installingSourceIds={{ busy: true }}
        index={0}
        onQuickInstall={vi.fn()}
        onClick={vi.fn()}
      />,
    );
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    // The spinner adds animate-spin to the icon.
    const spinner = container.querySelector(".animate-spin");
    expect(spinner).not.toBeNull();
  });

  it("matches installing state by source URL when source id is missing", () => {
    const { container } = render(
      <SkillStoreCard
        skill={makeSkill({
          source_id: undefined,
          source_url: "https://example.com/store/skill",
        })}
        isInstalled={false}
        installingSourceIds={{ "https://example.com/store/skill": true }}
        index={0}
        onQuickInstall={vi.fn()}
        onClick={vi.fn()}
      />,
    );

    expect(screen.getByRole("button")).toBeDisabled();
    expect(container.querySelector(".animate-spin")).not.toBeNull();
  });

  it("keeps the spinner visible while a pending skill has already moved to installed", () => {
    const { container } = render(
      <SkillStoreCard
        skill={makeSkill({ source_id: "busy" })}
        isInstalled
        installingSourceIds={{ busy: true }}
        index={0}
        onQuickInstall={vi.fn()}
        onClick={vi.fn()}
      />,
    );

    expect(screen.getByRole("button")).toBeDisabled();
    expect(container.querySelector(".animate-spin")).not.toBeNull();
    expect(container.querySelector(".text-green-500")).toBeNull();
  });

  it("does NOT disable the install button while another skill is installing", () => {
    render(
      <SkillStoreCard
        skill={makeSkill({ source_id: "skill-a" })}
        isInstalled={false}
        installingSourceIds={{ "skill-b": true }}
        index={0}
        onQuickInstall={vi.fn()}
        onClick={vi.fn()}
      />,
    );
    expect(screen.getByRole("button")).not.toBeDisabled();
  });

  it("renders icon-only batch selection and detail controls in batch mode", () => {
    const onClick = vi.fn();
    const onOpenDetail = vi.fn();
    const onQuickInstall = vi.fn();
    const skill = makeSkill();

    render(
      <SkillStoreCard
        skill={skill}
        isInstalled={false}
        batchMode
        isSelected
        index={0}
        onClick={onClick}
        onOpenDetail={onOpenDetail}
        onQuickInstall={onQuickInstall}
      />,
    );

    const selectButton = screen.getByRole("button", {
      name: "Unselect store skill",
    });
    expect(selectButton).toHaveAttribute("aria-pressed", "true");
    expect(selectButton.className).toContain("h-6");
    expect(selectButton.className).toContain("w-6");
    expect(selectButton.className).toContain("rounded-lg");
    expect(selectButton.className).toContain("bg-primary");
    fireEvent.click(selectButton);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onQuickInstall).not.toHaveBeenCalled();

    const detailButton = screen.getByRole("button", { name: "View detail" });
    expect(detailButton.className).toContain("h-7");
    expect(detailButton.className).toContain("w-7");
    expect(detailButton.className).toContain("rounded-lg");
    expect(detailButton.className).toContain("bg-card");
    fireEvent.click(detailButton);
    expect(onOpenDetail).toHaveBeenCalledTimes(1);
    expect(onOpenDetail.mock.calls[0][0]).toBe(skill);
  });

  it("keeps this card pending when multiple other skills are installing too", () => {
    const { container } = render(
      <SkillStoreCard
        skill={makeSkill({ source_id: "skill-a" })}
        isInstalled={false}
        installingSourceIds={{ "skill-a": true, "skill-b": true }}
        index={0}
        onQuickInstall={vi.fn()}
        onClick={vi.fn()}
      />,
    );

    expect(screen.getByRole("button")).toBeDisabled();
    expect(container.querySelector(".animate-spin")).not.toBeNull();
  });

  it("renders the weekly install count badge when present", () => {
    render(
      <SkillStoreCard
        skill={makeSkill({ weekly_installs: "1024" })}
        isInstalled={false}
        index={0}
        onClick={vi.fn()}
      />,
    );
    expect(screen.getByText("1024/wk")).toBeInTheDocument();
  });

  it("hides the weekly install count badge when not present", () => {
    render(
      <SkillStoreCard
        skill={makeSkill()}
        isInstalled={false}
        index={0}
        onClick={vi.fn()}
      />,
    );
    expect(screen.queryByText(/\/wk$/)).not.toBeInTheDocument();
  });

  it("uses the selected store name instead of technical branch and directory badges", () => {
    render(
      <SkillStoreCard
        skill={makeSkill({
          source_label: "anthropics/skills",
          source_branch: "main",
          source_directory: "skills/claude-api",
        })}
        isInstalled={false}
        index={0}
        storeLabel="Claude Code Store"
        onClick={vi.fn()}
      />,
    );

    expect(screen.getByText("Claude Code Store")).toBeInTheDocument();
    expect(screen.queryByText("Stable")).not.toBeInTheDocument();
    expect(screen.queryByText("main")).not.toBeInTheDocument();
    expect(screen.queryByText("skills/claude-api")).not.toBeInTheDocument();
  });

  it("uses the selected store tone for source badges", () => {
    render(
      <SkillStoreCard
        skill={makeSkill({
          store_url: "https://skills.sh/anthropics/skills/skill-creator",
          source_label: "anthropics/skills",
          source_url: "https://github.com/anthropics/skills",
        })}
        isInstalled={false}
        index={0}
        storeLabel="skills.sh Store"
        storeTone="community"
        onClick={vi.fn()}
      />,
    );

    expect(screen.getByText("skills.sh Store").className).toContain(
      "text-fuchsia",
    );
  });

  it("shows non-default branch names alongside the selected store name", () => {
    render(
      <SkillStoreCard
        skill={makeSkill({
          source_label: "team/skills",
          source_branch: "dev",
          source_directory: "skills/writer",
        })}
        isInstalled={false}
        index={0}
        storeLabel="Team Store"
        onClick={vi.fn()}
      />,
    );

    expect(screen.getByText("Team Store")).toBeInTheDocument();
    expect(screen.getByText("dev")).toBeInTheDocument();
    expect(screen.queryByText("Dev")).not.toBeInTheDocument();
    expect(screen.queryByText("skills/writer")).not.toBeInTheDocument();
  });
});
