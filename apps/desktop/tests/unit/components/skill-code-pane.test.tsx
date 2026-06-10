import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TFunction } from "i18next";
import type { FormEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Skill } from "@prompthub/shared/types";

import { SkillCodePane } from "../../../src/renderer/components/skill/SkillCodePane";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

const showToastMock = vi.fn();

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({
    showToast: showToastMock,
  }),
}));

function translate(key: string, fallback?: string): string {
  return fallback ?? key;
}

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: "skill-code",
    name: "Code Skill",
    description: "Shows raw skill content",
    instructions: "# Code Skill",
    content: "# Code Skill",
    protocol_type: "skill",
    author: "tester",
    tags: [],
    is_favorite: false,
    local_repo_path: "/tmp/code-skill",
    currentVersion: 1,
    created_at: 0,
    updated_at: 0,
    ...overrides,
  } as Skill;
}

describe("SkillCodePane", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders local source metadata as a keyboard-accessible button", async () => {
    const user = userEvent.setup();
    installWindowMocks({
      electron: {
        openPath: vi.fn().mockResolvedValue({ success: true }),
      },
    });

    await renderWithI18n(
      <SkillCodePane
        copyStatus={{ raw: false }}
        handleCopy={vi.fn()}
        selectedSkill={makeSkill({
          local_repo_path: "/tmp/code-skill",
          source_url: undefined,
        })}
        skillContent={"# Code Skill"}
        t={translate as TFunction}
      />,
      { language: "en" },
    );

    const sourceButton = screen.getByRole("button", {
      name: /Imported from Local Folder.*\/tmp\/code-skill/s,
    });

    expect(sourceButton).toHaveAttribute("type", "button");
    expect(document.querySelector("a[title='/tmp/code-skill']")).toBeNull();

    await user.click(sourceButton);

    expect(window.electron.openPath).toHaveBeenCalledWith("/tmp/code-skill");
  });

  it("reports local source open failures to the user", async () => {
    const user = userEvent.setup();
    installWindowMocks({
      electron: {
        openPath: vi.fn().mockResolvedValue({
          success: false,
          error: "Folder no longer exists",
        }),
      },
    });

    await renderWithI18n(
      <SkillCodePane
        copyStatus={{ raw: false }}
        handleCopy={vi.fn()}
        selectedSkill={makeSkill({
          local_repo_path: "/tmp/missing-skill",
          source_url: undefined,
        })}
        skillContent={"# Code Skill"}
        t={translate as TFunction}
      />,
      { language: "en" },
    );

    await user.click(
      screen.getByRole("button", {
        name: /Imported from Local Folder.*\/tmp\/missing-skill/s,
      }),
    );

    expect(showToastMock).toHaveBeenCalledWith(
      "Folder no longer exists",
      "error",
    );
  });

  it("keeps raw content copy action non-submit and hides decorative icons", async () => {
    const user = userEvent.setup();
    const handleCopy = vi.fn();
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });

    await renderWithI18n(
      <form onSubmit={onSubmit}>
        <SkillCodePane
          copyStatus={{ raw: false }}
          handleCopy={handleCopy}
          selectedSkill={makeSkill()}
          skillContent={"# Code Skill\nUse carefully."}
          t={translate as TFunction}
        />
      </form>,
      { language: "en" },
    );

    const copyButton = screen.getByRole("button", { name: "skill.copyMd" });

    expect(copyButton).toHaveAttribute("type", "button");
    expect(copyButton.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );

    await user.click(copyButton);

    expect(handleCopy).toHaveBeenCalledWith(
      "# Code Skill\nUse carefully.",
      "raw",
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
