import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UpdateReleaseNotes } from "../../../src/renderer/components/UpdateReleaseNotes";
import { extractReleaseSection } from "../../../src/utils/release-notes";
import { renderWithI18n } from "../../helpers/i18n";

const publishedNotes = extractReleaseSection(
  readFileSync(resolve(__dirname, "../../../../../CHANGELOG.md"), "utf8"),
  "0.6.0",
);

const bilingualNotes = `### 新功能 / Features

- **搜索**：支持 [说明](https://example.com/help) 和 \`搜索代码\`。
  - **Search**: Supports [Guide](https://example.com/help) and \`search code\`.

### 问题修复 / Fixes

- **保存**：保留数据。
  - **Save**: Preserve data.

### 优化 / Improvements

- **性能**：更快。
  - **Performance**: Faster.
`;

describe("UpdateReleaseNotes language projection", () => {
  it("presents category icons and separate titles without losing inline Markdown", async () => {
    await renderWithI18n(<UpdateReleaseNotes notes={bilingualNotes} />);
    const category = screen.getByRole("heading", { name: "New features" });
    expect(category.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    const title = screen.getByText("Search").closest("p");
    expect(title?.textContent).toBe("Search");
    const body = screen.getByRole("link", { name: "Guide" }).closest("p");
    expect(body?.textContent).toBe("Supports Guide and search code.");
    expect(screen.getByText("search code").tagName).toBe("CODE");
  });

  it.each([
    {
      language: "zh",
      category: "新功能",
      body: "完整数据同步与冲突处理",
      hidden: "Complete Data Sync And Conflict Handling",
    },
    {
      language: "zh-TW",
      category: "新功能",
      body: "完整数据同步与冲突处理",
      hidden: "Complete Data Sync And Conflict Handling",
    },
    {
      language: "en",
      category: "New features",
      body: "Complete Data Sync And Conflict Handling",
      hidden: "完整数据同步与冲突处理",
    },
    {
      language: "ja",
      category: "新機能",
      body: "Complete Data Sync And Conflict Handling",
      hidden: "完整数据同步与冲突处理",
    },
    {
      language: "fr",
      category: "Nouveautés",
      body: "Complete Data Sync And Conflict Handling",
      hidden: "完整数据同步与冲突处理",
    },
    {
      language: "de",
      category: "Neue Funktionen",
      body: "Complete Data Sync And Conflict Handling",
      hidden: "完整数据同步与冲突处理",
    },
    {
      language: "es",
      category: "Nuevas funciones",
      body: "Complete Data Sync And Conflict Handling",
      hidden: "完整数据同步与冲突处理",
    },
  ] satisfies Array<{
    language: "zh" | "zh-TW" | "en" | "ja" | "fr" | "de" | "es";
    category: string;
    body: string;
    hidden: string;
  }>)(
    "renders the published 0.6.0 notes for $language",
    async ({ language, category, body, hidden }) => {
      expect(publishedNotes).toBeTruthy();
      const { container } = await renderWithI18n(
        <UpdateReleaseNotes notes={publishedNotes} />,
        { language },
      );
      expect(screen.getByRole("heading", { name: category })).toBeVisible();
      expect(screen.getByText(body)).toBeVisible();
      expect(screen.queryByText(hidden)).not.toBeInTheDocument();
      expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(3);
      expect(screen.getAllByRole("listitem")).toHaveLength(16);
      expect(container.querySelector("li ul")).toBeNull();
    },
  );

  it("updates categories and bodies when the open dialog's language changes", async () => {
    const { i18n } = await renderWithI18n(
      <UpdateReleaseNotes notes={bilingualNotes} />,
    );
    expect(screen.getByRole("heading", { name: "Bug fixes" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Improvements" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Guide" })).toHaveAttribute(
      "href",
      "https://example.com/help",
    );
    await act(async () => {
      await i18n.changeLanguage("zh");
    });
    expect(screen.getByRole("heading", { name: "问题修复" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "优化" })).toBeVisible();
    expect(screen.getByText("搜索")).toBeVisible();
    expect(screen.queryByText("Search")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "说明" })).toHaveAttribute(
      "href",
      "https://example.com/help",
    );
    expect(screen.getByText("搜索代码").tagName).toBe("CODE");
    await act(async () => {
      await i18n.changeLanguage("en");
    });
    expect(screen.getByText("Search")).toBeVisible();
    expect(screen.queryByText("搜索")).not.toBeInTheDocument();
  });

  it("retains unpaired notes, ordinary lists, shared blocks and Markdown safety", async () => {
    const notes = `### 新功能 / Features

- **中文独有**：保留原文。
- **English only**: Keep this item.
- **操作步骤**：按顺序执行。
  - First step
  - Second step
- **图像**：查看示例。
  - **Images**: View example.

  ![Safe badge](https://img.shields.io/badge/release-stable-blue)

  ![Blocked image](https://example.com/tracker.png)

  \`\`\`md
  ### 新功能 / Features
  - **原始代码**：不应翻译。
    - **Raw code**: Do not translate.
  \`\`\`

[Unsafe link](javascript:alert(1))

### Custom section

- **原始内容**：保留。
  - **Original content**: Retain.
`;
    const { container } = await renderWithI18n(
      <UpdateReleaseNotes notes={notes} />,
    );
    expect(screen.getByText("中文独有")).toBeVisible();
    expect(screen.getByText("English only")).toBeVisible();
    expect(screen.getByText("First step")).toBeVisible();
    expect(screen.getByText("Second step")).toBeVisible();
    expect(screen.getByText("Images")).toBeVisible();
    expect(screen.queryByText("图像")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Safe badge" })).toHaveAttribute(
      "referrerpolicy",
      "no-referrer",
    );
    expect(
      screen.queryByRole("img", { name: "Blocked image" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Blocked image")).toBeVisible();
    expect(container.querySelector("pre code")).toHaveTextContent("原始代码");
    expect(container.querySelector("pre code")).toHaveTextContent("Raw code");
    expect(
      screen.queryByRole("link", { name: "Unsafe link" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("原始内容")).toBeVisible();
    expect(screen.getByText("Original content")).toBeVisible();
  });

  it.each([
    ["Added", "New features"],
    ["Fixed", "Bug fixes"],
    ["Changed", "Improvements"],
    ["Maintenance", "Maintenance"],
    ["Security", "Security"],
    ["Upgrade Notes", "Upgrade notes"],
    ["Architecture", "Architecture"],
  ])(
    "localizes the existing %s category without removing single-language content",
    async (source, label) => {
      await renderWithI18n(
        <UpdateReleaseNotes
          notes={`### ${source}\n\n- Original release item`}
        />,
      );
      expect(screen.getByRole("heading", { name: label })).toBeVisible();
      expect(screen.getByText("Original release item")).toBeVisible();
    },
  );
});
