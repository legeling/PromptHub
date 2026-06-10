import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TFunction } from "i18next";
import type { FormEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import { AgentSkillDetailActions } from "../../../src/renderer/components/skill/AgentSkillDetailActions";
import { renderWithI18n } from "../../helpers/i18n";

function translate(key: string, fallback?: string): string {
  return fallback ?? key;
}

describe("AgentSkillDetailActions", () => {
  it("exposes action buttons with stable non-submit and icon semantics", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });
    const onImport = vi.fn();
    const onOpenFolder = vi.fn();
    const onUninstall = vi.fn();
    const t = translate as TFunction;

    const view = await renderWithI18n(
      <form onSubmit={onSubmit}>
        <AgentSkillDetailActions
          onImport={onImport}
          onOpenFolder={onOpenFolder}
          onUninstall={onUninstall}
          t={t}
        />
      </form>,
      { language: "en" },
    );

    const importButton = screen.getByRole("button", {
      name: "Import to My Skills",
    });
    const openButton = screen.getByRole("button", {
      name: "Open Local Skill Folder",
    });
    const uninstallButton = screen.getByRole("button", { name: "Uninstall" });

    for (const button of [importButton, openButton, uninstallButton]) {
      expect(button).toHaveAttribute("type", "button");
      expect(button.querySelector("svg")).toHaveAttribute(
        "aria-hidden",
        "true",
      );
    }

    await user.click(importButton);
    await user.click(openButton);
    await user.click(uninstallButton);

    expect(onImport).toHaveBeenCalledTimes(1);
    expect(onOpenFolder).toHaveBeenCalledTimes(1);
    expect(onUninstall).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();

    view.rerender(
      <form onSubmit={onSubmit}>
        <AgentSkillDetailActions
          isManaged
          onOpenFolder={onOpenFolder}
          onOpenManagedSkill={vi.fn()}
          t={t}
        />
      </form>,
    );

    expect(
      screen.getByRole("button", { name: "Open in My Skills" }),
    ).toHaveAttribute("type", "button");
  });
});
