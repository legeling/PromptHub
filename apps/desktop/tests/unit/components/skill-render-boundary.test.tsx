import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FormEvent } from "react";

import { SkillRenderBoundary } from "../../../src/renderer/components/skill/SkillRenderBoundary";

function BrokenSkillPreview() {
  throw new Error("preview failed");
}

function renderFailedBoundary({
  onPrimaryAction = vi.fn(),
  onSecondaryAction = vi.fn(),
}: {
  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;
} = {}) {
  const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
  });
  const view = render(
    <form onSubmit={onSubmit}>
      <SkillRenderBoundary
        description="The preview failed without taking down the page."
        onPrimaryAction={onPrimaryAction}
        onSecondaryAction={onSecondaryAction}
        primaryActionLabel="Back to List"
        resetKey="release-helper"
        secondaryActionLabel="Retry"
        title="Preview Failed"
      >
        <BrokenSkillPreview />
      </SkillRenderBoundary>
    </form>,
  );

  return { ...view, onSubmit, onPrimaryAction, onSecondaryAction };
}

describe("SkillRenderBoundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps recovery actions non-submit with decorative icons hidden", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { container, onPrimaryAction, onSubmit, unmount } =
      renderFailedBoundary();

    expect(screen.getByText("Preview Failed")).toBeInTheDocument();

    const backToList = screen.getByRole("button", { name: "Back to List" });
    const retry = screen.getByRole("button", { name: "Retry" });

    expect(backToList).toHaveAttribute("type", "button");
    expect(retry).toHaveAttribute("type", "button");
    for (const icon of container.querySelectorAll("svg")) {
      expect(icon).toHaveAttribute("aria-hidden", "true");
    }

    fireEvent.click(backToList);

    expect(onPrimaryAction).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();

    unmount();

    const secondRender = renderFailedBoundary();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(secondRender.onPrimaryAction).not.toHaveBeenCalled();
    expect(secondRender.onSecondaryAction).toHaveBeenCalledTimes(1);
    expect(secondRender.onSubmit).not.toHaveBeenCalled();
  });
});
