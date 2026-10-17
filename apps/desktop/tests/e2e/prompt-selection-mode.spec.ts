import { expect, test, type Page } from "@playwright/test";
import { isElectronHeaded } from "./helpers/electron-launch-options";
import {
  closePromptHub,
  launchPromptHub,
  setAppSettings,
} from "./helpers/electron";

async function toggleDeploySelection(
  page: Page,
  title = "Deploy Checklist",
): Promise<void> {
  const checkbox = page.getByRole("checkbox", {
    name: new RegExp(`(?:Select|Deselect) ${title}`),
  });
  const label = checkbox.locator("xpath=ancestor::label");
  if (await label.count()) await label.click();
  else await checkbox.click();
}

test("explicit selection in every layout and compact detail actions", async () => {
  test.setTimeout(120_000);
  const { app, page, userDataDir } = await launchPromptHub(
    "prompt-workspace.seed.json",
  );
  try {
    const capture = async (name: string): Promise<void> => {
      if (isElectronHeaded()) {
        await page.screenshot({
          path: test.info().outputPath(name),
          animations: "disabled",
        });
      }
    };
    await setAppSettings(page, { language: "en", autoCheckUpdate: false });
    await page.reload();
    for (const layout of [
      "Card View",
      "Gallery View",
      "Kanban View",
      "List View",
    ]) {
      await page.getByRole("button", { name: layout, exact: true }).click();
      await expect(page.getByRole("checkbox")).toHaveCount(0);
      await page
        .getByRole("button", { name: "Multi-select", exact: true })
        .click();
      const bar = page.getByRole("toolbar", {
        name: "Batch actions",
        exact: true,
      });
      await expect(bar).toBeVisible();
      if (layout === "Card View") {
        await capture("prompt-selection-empty.png");
      }
      await expect(
        page.getByRole("checkbox", { name: /Select Deploy Checklist/ }),
      ).toBeVisible();
      await toggleDeploySelection(page);
      await expect(
        page.getByRole("checkbox", {
          name: /(?:Select|Deselect) Deploy Checklist/,
        }),
      ).toBeChecked();
      await toggleDeploySelection(page);
      await expect(bar).toBeVisible();
      if (layout === "List View") {
        await toggleDeploySelection(page);
        await page
          .getByRole("button", { name: "Batch Favorite", exact: true })
          .click();
        await expect
          .poll(() =>
            page.evaluate(
              async () =>
                (await window.api.prompt.getAll()).find(
                  (prompt) => prompt.id === "prompt_ops_1",
                )?.isFavorite,
            ),
          )
          .toBe(true);
      }
      await bar
        .getByRole("button", { name: "Clear Selection", exact: true })
        .click();
      await expect(page.getByRole("checkbox")).toHaveCount(0);
      await page
        .getByRole("button", { name: "Multi-select", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Ops", exact: true })
        .and(page.locator("button"))
        .click();
      await expect(page.getByRole("checkbox")).toHaveCount(0);
      await page.getByRole("button", { name: "All", exact: true }).click();
    }
    await page
      .getByRole("button", { name: "Multi-select", exact: true })
      .click();
    await toggleDeploySelection(page);
    await page.reload();
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await page.getByRole("button", { name: "Card View", exact: true }).click();
    await page
      .getByRole("button", { name: "Deploy Checklist", exact: true })
      .click();
    const robot = page
      .getByTestId("prompt-detail-header-actions")
      .locator("button svg.lucide-bot");
    await expect(robot).toHaveCount(1);
    const icons = page.locator(
      "[data-testid='prompt-detail-header-actions'] button svg",
    );
    expect(
      await icons.evaluateAll((nodes) =>
        nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          return [rect.width, rect.height];
        }),
      ),
    ).toEqual([
      [16, 16],
      [16, 16],
      [16, 16],
      [16, 16],
    ]);
    await capture("prompt-browse-actions.png");
    await page
      .getByRole("button", { name: "Toggle theme", exact: true })
      .click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await capture("prompt-browse-actions-dark.png");
    await robot.locator("..").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await capture("prompt-selection-ai-dialog.png");
  } finally {
    await closePromptHub(app, userDataDir);
  }
});

test("visible batch actions affect two selected prompts and preserve the unselected prompt", async () => {
  test.setTimeout(120_000);
  const { app, page, userDataDir } = await launchPromptHub(
    "prompt-workspace.seed.json",
  );
  try {
    await setAppSettings(page, { language: "en", autoCheckUpdate: false });
    const fixture = await page.evaluate(async () => {
      const second = await window.api.prompt.create({
        title: "Batch Second",
        userPrompt: "Second checklist",
      });
      const untouched = await window.api.prompt.create({
        title: "Untouched",
        userPrompt: "Independent checklist",
      });
      const folder = await window.api.folder.create({
        name: "Batch Destination",
      });
      return {
        secondId: second.id,
        untouchedId: untouched.id,
        folderId: folder.id,
      };
    });
    await page.reload();
    await page.getByRole("button", { name: "Card View", exact: true }).click();
    await page
      .getByRole("button", { name: "Multi-select", exact: true })
      .click();
    await toggleDeploySelection(page);
    await toggleDeploySelection(page, "Batch Second");
    const bar = page.getByRole("toolbar", {
      name: "Batch actions",
      exact: true,
    });
    for (const name of [
      "Batch Favorite",
      "Batch Move",
      "Tags",
      "Batch Delete",
    ]) {
      const button = bar.getByRole("button", { name, exact: true });
      await expect(button).toBeEnabled();
      await expect(button).toHaveAttribute("title", name);
      await expect(button).toHaveText("");
      await expect(button.locator("svg")).toHaveCount(1);
      const bounds = await button.boundingBox();
      const toolbar = await bar.boundingBox();
      expect(bounds).not.toBeNull();
      expect(toolbar).not.toBeNull();
      if (bounds && toolbar) {
        expect(bounds.width).toBe(32);
        expect(bounds.height).toBe(32);
        expect(toolbar.height).toBeLessThanOrEqual(48);
        expect(bounds.x).toBeGreaterThanOrEqual(toolbar.x);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(
          toolbar.x + toolbar.width,
        );
      }
    }
    if (isElectronHeaded())
      await page.screenshot({
        path: test.info().outputPath("two-selected-actions.png"),
        animations: "disabled",
      });
    await bar
      .getByRole("button", { name: "Batch Favorite", exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate(async () =>
          (await window.api.prompt.getAll())
            .filter((p) => p.isFavorite)
            .map((p) => p.title)
            .sort(),
        ),
      )
      .toEqual(["Batch Second", "Deploy Checklist"]);
    await bar.getByRole("button", { name: "Batch Move", exact: true }).click();
    await page
      .getByRole("menuitem", { name: "Batch Destination", exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate(
          async (folderId) =>
            (await window.api.prompt.getAll())
              .filter((p) => p.folderId === folderId)
              .map((p) => p.title)
              .sort(),
          fixture.folderId,
        ),
      )
      .toEqual(["Batch Second", "Deploy Checklist"]);
    await bar.getByRole("button", { name: "Tags", exact: true }).click();
    const tags = page.getByRole("dialog");
    await tags.getByRole("textbox").fill("batch-verified");
    await tags.getByRole("textbox").press("Enter");
    await expect
      .poll(() =>
        page.evaluate(async () =>
          (await window.api.prompt.getAll())
            .filter((p) => p.tags.includes("batch-verified"))
            .map((p) => p.title)
            .sort(),
        ),
      )
      .toEqual(["Batch Second", "Deploy Checklist"]);
    await tags
      .getByRole("button", { name: "Close", exact: true })
      .last()
      .click();
    await bar
      .getByRole("button", { name: "Batch Delete", exact: true })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    expect(
      await page.evaluate(
        async () => (await window.api.prompt.getAll()).length,
      ),
    ).toBe(3);
    await expect(page.getByRole("checkbox", { checked: true })).toHaveCount(2);
    await bar
      .getByRole("button", { name: "Batch Delete", exact: true })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate(async () =>
          (await window.api.prompt.getAll()).map((p) => p.id),
        ),
      )
      .toEqual([fixture.untouchedId]);
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Untouched", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("checkbox")).toHaveCount(0);
  } finally {
    await closePromptHub(app, userDataDir);
  }
});
