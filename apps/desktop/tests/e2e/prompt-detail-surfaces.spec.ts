import { expect, test, type Locator } from "@playwright/test";
import {
  closePromptHub,
  launchPromptHub,
  setAppSettings,
} from "./helpers/electron";

async function surface(locator: Locator) {
  return locator.evaluate((element) => {
    const css = getComputedStyle(element);
    return {
      background: css.backgroundColor,
      border: css.borderColor,
      radius: css.borderRadius,
    };
  });
}

test("compact detail keeps content aligned and editable in both themes", async () => {
  const { app, page, userDataDir } = await launchPromptHub(
    "prompt-workspace.seed.json",
  );
  try {
    await page.evaluate(async () => {
      await window.api.prompt.update("prompt_ops_1", {
        source: "Deployment handbook",
        notes: "Check the service health.\nKeep the rollback ready.",
      });
    });
    for (const theme of ["light", "dark"]) {
      await setAppSettings(page, {
        language: "en",
        themeMode: theme,
        renderMarkdown: true,
        autoCheckUpdate: false,
      });
      await expect
        .poll(() =>
          page
            .locator("html")
            .evaluate((element) => element.classList.contains("dark")),
        )
        .toBe(theme === "dark");
      await page
        .getByRole("button", { name: "Card View", exact: true })
        .click();
      await page.getByText("Deploy Checklist", { exact: true }).first().click();
      const notes = page.getByText("Check the service health.", {
        exact: false,
      });
      const source = page
        .getByText("Deployment handbook", { exact: true })
        .locator("..");
      const body = page
        .getByRole("button", {
          name: "Double-click to edit user prompt",
          exact: true,
        })
        .locator(":scope > div");
      await expect(notes).toBeVisible();
      const rows = page.getByTestId("prompt-detail-row");
      await expect(rows).toHaveCount(5);
      await expect(rows.getByText("Tags", { exact: true })).toBeVisible();
      const values = rows.getByTestId("prompt-detail-value");
      const positions = await values.evaluateAll((elements) =>
        elements.map((element) => element.getBoundingClientRect().x),
      );
      expect(new Set(positions).size).toBe(1);
      for (const row of await rows.all()) {
        const layout = await row.evaluate((element) => {
          const heading = element.firstElementChild?.getBoundingClientRect();
          const value = element
            .querySelector('[data-testid="prompt-detail-value"]')
            ?.getBoundingClientRect();
          if (!heading || !value)
            throw new Error("Detail section is incomplete");
          return {
            headingBottom: heading.bottom,
            headingX: heading.x,
            valueY: value.y,
            valueX: value.x,
          };
        });
        expect(layout.valueY).toBeGreaterThanOrEqual(layout.headingBottom);
        expect(layout.valueX).toBe(layout.headingX);
      }
      await expect(body).toHaveCSS("border-radius", "0px");
      await expect(body).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      expect((await source.boundingBox())?.height).toBeLessThan(40);
      await expect(notes).toHaveCSS("font-style", "normal");
      const toggle = page.getByRole("button", {
        name: "Show Plain Text",
        exact: true,
      });
      const toggleBounds = await toggle.boundingBox();
      const contentBounds = await body.boundingBox();
      expect(
        (toggleBounds?.y ?? Infinity) + (toggleBounds?.height ?? 0),
      ).toBeLessThanOrEqual(contentBounds?.y ?? 0);

      await toggle.click();
      await expect(body).toContainText("Review deploy health");
      const editTarget = page.getByRole("button", {
        name: "Double-click to edit user prompt",
        exact: true,
      });
      await editTarget.dblclick();
      const input = page.getByRole("textbox", {
        name: "User Prompt",
        exact: true,
      });
      await expect(input).toHaveCSS("border-radius", "0px");
      await expect(input).toHaveCSS("padding-left", "16px");
      await input.focus();
      const focusedBorder = await input.evaluate(
        (element) => getComputedStyle(element).borderColor,
      );
      for (const name of [
        "Title",
        "Description",
        "System Prompt",
        "User Prompt",
      ]) {
        const field = page.getByRole("textbox", { name, exact: true });
        await field.focus();
        await expect(field).toHaveCSS("border-radius", "0px");
        await expect(field).toHaveCSS("padding-left", "16px");
        await expect(field).toHaveCSS("border-color", focusedBorder);
      }
      await expect(input).toHaveCSS("resize", "vertical");
      await input.fill("Short draft");
      const shortHeight = await input.evaluate(
        (element) => element.clientHeight,
      );
      expect(shortHeight).toBeGreaterThanOrEqual(318);
      await input.fill(
        Array.from(
          { length: 35 },
          (_, i) => `Line ${i + 1}: a longer editing draft.`,
        ).join("\n"),
      );
      const longHeight = await input.evaluate(
        (element) => element.clientHeight,
      );
      expect(longHeight).toBeGreaterThan(shortHeight + 100);
      expect(longHeight).toBeLessThanOrEqual(
        await page.evaluate(() => innerHeight * 0.7),
      );
      await expect
        .poll(() =>
          input.evaluate(
            (element) => element.scrollHeight > element.clientHeight,
          ),
        )
        .toBe(true);
      await input.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: test.info().outputPath(`detail-long-edit-${theme}.png`),
      });
      const inputBounds = await input.boundingBox();
      const inputContainerBounds = await input.locator("..").boundingBox();
      expect(inputBounds?.width).toBe(inputContainerBounds?.width);
      await input.fill(
        `Review deploy health for {{service}}. Updated inline. ${theme}`,
      );
      await page.screenshot({
        path: test.info().outputPath(`detail-edit-${theme}.png`),
        animations: "disabled",
      });
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(editTarget).toContainText("Updated inline.");
      await expect
        .poll(() =>
          page.evaluate(
            async () =>
              (await window.api.prompt.getAll()).find(
                (prompt) => prompt.id === "prompt_ops_1",
              )?.userPrompt,
          ),
        )
        .toContain("Updated inline.");
      await page.screenshot({
        path: test.info().outputPath(`detail-${theme}.png`),
      });
      await page
        .getByRole("button", { name: "Gallery View", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Deploy Checklist", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      const modalNotes = dialog.getByText("Check the service health.", {
        exact: false,
      });
      const modalSource = dialog
        .getByText("Deployment handbook", { exact: true })
        .locator("..");
      const modalBody = dialog
        .getByText("You are a careful SRE assistant.", { exact: true })
        .locator("..");
      await expect(modalNotes).toBeVisible();
      expect(await surface(modalNotes)).toEqual(await surface(modalSource));
      expect(await surface(modalNotes)).toEqual(await surface(modalBody));
      await page.keyboard.press("Escape");
    }
    await page.getByRole("button", { name: "Card View", exact: true }).click();
    await page.getByText("Deploy Checklist", { exact: true }).first().click();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1100, 760),
    );
    const narrowBody = page.getByRole("button", {
      name: "Double-click to edit user prompt",
      exact: true,
    });
    await narrowBody.dblclick();
    const longText = "https://example.com/" + "long-path-".repeat(60);
    await page
      .getByRole("textbox", { name: "User Prompt", exact: true })
      .fill(longText);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(narrowBody).toContainText(longText);
    const row = narrowBody.locator(
      "xpath=ancestor::*[@data-testid='prompt-detail-row']",
    );
    const labelBounds = await row.locator(":scope > div").first().boundingBox();
    const valueBounds = await row
      .getByTestId("prompt-detail-value")
      .boundingBox();
    expect(valueBounds?.y).toBeGreaterThan(labelBounds?.y ?? Infinity);
    expect(
      await row.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath("detail-narrow.png"),
    });
  } finally {
    await closePromptHub(app, userDataDir);
  }
});
