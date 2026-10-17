import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RegistrySkill } from "@prompthub/shared/types";
import { SkillStoreInstallReviewDialog } from "../../../src/renderer/components/skill/SkillStoreInstallReviewDialog";
import { createTestI18n } from "../../helpers/i18n";

afterEach(cleanup);

const skill: RegistrySkill = {
  slug: "canvas-design",
  name: "Canvas Design",
  version: "1.0.0",
  description: "Design documents",
  category: "general",
  author: "Anthropic",
  source_url:
    "https://github.com/anthropics/skills/tree/main/skills/canvas-design",
  content: "# Canvas Design",
  tags: [],
};

describe("Skill install review source", () => {
  it.each([
    { label: undefined, url: skill.source_url, expected: "Claude Code 商店" },
    {
      label: "Team Design Store",
      url: skill.source_url,
      expected: "Team Design Store",
    },
    {
      label: undefined,
      url: "https://github.com/example/design",
      expected: "GitHub 导入",
    },
  ])(
    "shows the origin $expected and the actual source address",
    async ({ label, url, expected }) => {
      const { t } = await createTestI18n("zh");
      const onConfirm = vi.fn();
      const content = `description: ${"Long source text ".repeat(150)}END`;
      render(
        <SkillStoreInstallReviewDialog
          skill={{ ...skill, source_label: label, source_url: url }}
          content={content}
          isLoading={false}
          t={t}
          onClose={vi.fn()}
          onConfirm={onConfirm}
        />,
      );
      expect(screen.getByText("来源")).toBeInTheDocument();
      expect(screen.getByText(expected)).toBeInTheDocument();
      expect(screen.getByText(url)).toBeInTheDocument();
      expect(screen.queryByText("来源软件包")).not.toBeInTheDocument();
      expect(screen.getByText(content)).toHaveTextContent(content);
      fireEvent.click(screen.getByRole("button", { name: "确认并添加" }));
      expect(onConfirm).toHaveBeenCalledOnce();
    },
  );
});
