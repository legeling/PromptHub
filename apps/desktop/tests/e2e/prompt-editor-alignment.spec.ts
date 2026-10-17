import { expect, test, type Locator } from "@playwright/test";
import {
  closePromptHub,
  launchPromptHub,
  setAppSettings,
} from "./helpers/electron";

async function expectAligned(input: Locator): Promise<void> {
  const geometry = await input.evaluate((element) => {
    const frame = element.closest('[data-testid="prompt-split-editor"]');
    const preview = frame?.querySelector(
      '[data-testid="prompt-editor-preview"]',
    );
    if (!frame || !preview)
      throw new Error("Missing split editor frame or preview");
    const left = element.getBoundingClientRect();
    const right = preview.getBoundingClientRect();
    return {
      top: Math.abs(left.top - right.top),
      bottom: Math.abs(left.bottom - right.bottom),
      height: frame.clientHeight,
    };
  });
  expect(geometry.top).toBeLessThanOrEqual(1);
  expect(geometry.bottom).toBeLessThanOrEqual(1);
  expect(geometry.height).toBeLessThanOrEqual(280);
}

test("split editor keeps long content aligned and independently scrollable", async () => {
  const { app, page, userDataDir } = await launchPromptHub(
    "prompt-workspace.seed.json",
  );
  try {
    await setAppSettings(page, {
      language: "en",
      autoCheckUpdate: false,
      themeMode: "light",
    });
    await page.getByRole("button", { name: "Card View", exact: true }).click();
    await page.getByText("Deploy Checklist", { exact: true }).first().click();
    await page
      .getByRole("button", { name: "Edit Prompt", exact: true })
      .click();
    const editor = page.getByRole("dialog", {
      name: "Edit Prompt",
      exact: true,
    });
    const input = editor.getByRole("textbox", {
      name: "User Prompt",
      exact: true,
    });
    const content = Array.from(
      { length: 45 },
      (_, i) =>
        `Paragraph ${i + 1}: A long prompt with **Markdown** and enough text to wrap across several lines.`,
    ).join("\n\n");
    await input.fill(content);
    await input.scrollIntoViewIfNeeded();
    await expectAligned(input);
    await input.press("Control+End");
    await expect
      .poll(() => input.evaluate((node) => node.scrollTop))
      .toBeGreaterThan(0);
    const preview = editor.getByTestId("prompt-editor-preview").last();
    await expect.poll(() => preview.evaluate((node) => node.scrollTop)).toBe(0);
    await preview.hover();
    await page.mouse.wheel(0, 400);
    await expect
      .poll(() => preview.evaluate((node) => node.scrollTop))
      .toBeGreaterThan(0);
    await page.screenshot({
      path: test.info().outputPath("editor-aligned-light.png"),
    });
    await editor
      .getByRole("button", { name: "Fullscreen", exact: true })
      .first()
      .click();
    await expectAligned(input);
    await editor
      .getByRole("button", { name: "Exit Fullscreen", exact: true })
      .click();
    await setAppSettings(page, { themeMode: "dark" });
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.getByText("Deploy Checklist", { exact: true }).first().click();
    await page
      .getByRole("button", { name: "Edit Prompt", exact: true })
      .click();
    await input.fill(content);
    await input.scrollIntoViewIfNeeded();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1100, 760),
    );
    await expectAligned(input);
    await page.screenshot({
      path: test.info().outputPath("editor-aligned-dark-narrow.png"),
    });
    await input.fill("");
    await expectAligned(input);
    await input.fill("Short prompt");
    await expectAligned(input);
    await editor.getByRole("button", { name: "Save", exact: true }).click();
    await expect(editor).not.toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          async () =>
            (await window.api.prompt.getAll()).find(
              (prompt) => prompt.id === "prompt_ops_1",
            )?.userPrompt,
        ),
      )
      .toBe("Short prompt");
  } finally {
    await closePromptHub(app, userDataDir);
  }
});
