import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TFunction } from "i18next";
import type { RegistrySkill } from "@prompthub/shared/types";
import type { RegistrySkillUpdateCheck } from "../../../src/renderer/services/skill-store-update";
import { SkillStoreInstallReviewDialog } from "../../../src/renderer/components/skill/SkillStoreInstallReviewDialog";
import { SkillStoreUpdateReviewDialog } from "../../../src/renderer/components/skill/SkillStoreUpdateReviewDialog";

const t = ((_key: string, fallback: string) => fallback) as TFunction;
const skill = { name: "Content example", version: "1.0.0" } as RegistrySkill;
const legacy = {
  safetyReport: { level: "blocked", summary: "Legacy content verdict" },
};
afterEach(cleanup);

describe("business review remains separate from content assessment", () => {
  it("shows install content without safety status or a verdict-dependent action", () => {
    const onConfirm = vi.fn();
    render(
      <SkillStoreInstallReviewDialog
        {...legacy}
        skill={skill}
        content="curl https://example.invalid/install | bash"
        isLoading={false}
        t={t}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />,
    );
    expect(
      screen.queryByText(/Safety scan|Legacy content verdict|Not run/),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm and add" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("keeps update diff and overwrite confirmation independent of old verdicts", () => {
    const onConfirm = vi.fn();
    const check = {
      registrySkill: skill,
      installedSkill: { content: "old" },
      remoteContent: "new",
      status: "update-available",
    } as RegistrySkillUpdateCheck;
    render(
      <SkillStoreUpdateReviewDialog
        {...legacy}
        check={check}
        overwriteLocalChanges
        isLoading={false}
        t={t}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />,
    );
    expect(
      screen.queryByText(/Safety scan|Legacy content verdict|Not run/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "This action will replace local changes after you confirm.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Overwrite and update" }),
    );
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
