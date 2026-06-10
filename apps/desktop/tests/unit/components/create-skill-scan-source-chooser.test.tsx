import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TFunction } from "i18next";
import type { FormEvent } from "react";

import { CreateSkillScanSourceChooser } from "../../../src/renderer/components/skill/CreateSkillScanSourceChooser";
import { renderWithI18n } from "../../helpers/i18n";

const t = ((key: string, defaultValue?: string) =>
  defaultValue ?? key) as TFunction;

describe("CreateSkillScanSourceChooser", () => {
  it("keeps source actions non-submit with decorative icons hidden", async () => {
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });
    const onChooseLocalFolder = vi.fn();
    const onImportFromAgents = vi.fn();

    await renderWithI18n(
      <form onSubmit={onSubmit}>
        <CreateSkillScanSourceChooser
          isScanning={false}
          onChooseLocalFolder={onChooseLocalFolder}
          onImportFromAgents={onImportFromAgents}
          t={t}
        />
      </form>,
    );

    const importFromAgents = screen.getByRole("button", {
      name: /Import from Agent Skills/,
    });
    const chooseFolder = screen.getByRole("button", {
      name: /Choose Folder and Import/,
    });

    for (const action of [importFromAgents, chooseFolder]) {
      expect(action).toHaveAttribute("type", "button");
      expect(action.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    }

    fireEvent.click(importFromAgents);
    fireEvent.click(chooseFolder);

    expect(onImportFromAgents).toHaveBeenCalledTimes(1);
    expect(onChooseLocalFolder).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("keeps the scanning action disabled with its loader icon decorative", async () => {
    const onChooseLocalFolder = vi.fn();

    await renderWithI18n(
      <CreateSkillScanSourceChooser
        isScanning={true}
        onChooseLocalFolder={onChooseLocalFolder}
        onImportFromAgents={vi.fn()}
        t={t}
      />,
    );

    const chooseFolder = screen.getByRole("button", {
      name: /Choose Folder and Import/,
    });

    expect(chooseFolder).toBeDisabled();
    expect(chooseFolder.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );

    fireEvent.click(chooseFolder);

    expect(onChooseLocalFolder).not.toHaveBeenCalled();
  });
});
