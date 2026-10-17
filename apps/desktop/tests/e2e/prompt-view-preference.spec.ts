import {
  expect,
  test,
  type Page,
  type ElectronApplication,
} from "@playwright/test";
import {
  closePromptHub,
  launchPromptHub,
  setAppSettings,
} from "./helpers/electron";

const layouts = [
  { mode: "card", label: "Card View", selector: ".prompt-list-pane" },
  {
    mode: "gallery",
    label: "Gallery View",
    selector: '[data-testid="prompt-gallery-view"]',
  },
  {
    mode: "kanban",
    label: "Kanban View",
    selector: '[data-testid="prompt-kanban-view"]',
  },
  {
    mode: "list",
    label: "List View",
    selector: '[data-testid="prompt-table-view"]',
  },
];

async function expectLayout(
  page: Page,
  layout: (typeof layouts)[number],
): Promise<void> {
  await expect(
    page.getByRole("button", { name: layout.label, exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(layout.selector)).toBeVisible();
  for (const other of layouts.filter(
    (candidate) => candidate.mode !== layout.mode,
  )) {
    await expect(page.locator(other.selector)).toHaveCount(0);
  }
}

for (const layout of layouts) {
  test(`preserves ${layout.mode} through collection navigation and restart`, async () => {
    test.setTimeout(120_000);
    let launched = await launchPromptHub("prompt-workspace.seed.json");
    let app: ElectronApplication | null = launched.app;
    const profile = launched.userDataDir;
    try {
      await setAppSettings(launched.page, {
        language: "en",
        autoCheckUpdate: false,
      });
      await launched.page
        .getByRole("button", { name: layout.label, exact: true })
        .click();
      await expectLayout(launched.page, layout);
      for (const label of ["Ops", "Favorites", "Ops"]) {
        await launched.page
          .getByRole("button", { name: label, exact: true })
          .and(launched.page.locator("button"))
          .click();
        await expectLayout(launched.page, layout);
      }
      await expect(
        launched.page.getByText("Deploy Checklist", { exact: true }).first(),
      ).toBeVisible();
      // Sidebar tag controls are scoped to avoid matching the same tag on cards.
      const tag = launched.page
        .locator(".sidebar-tag-section")
        .getByRole("button", { name: "deploy", exact: true });
      await tag.click();
      await expectLayout(launched.page, layout);
      await tag.click();
      for (const label of ["Relationship Graph", "Image Workbench"]) {
        await launched.page
          .getByRole("button", { name: label, exact: true })
          .click();
        await expect(launched.page.locator(".prompt-list-header")).toHaveCount(
          0,
        );
        if (label === "Image Workbench") {
          await launched.page.getByTitle("Expand", { exact: true }).click();
        }
        await launched.page
          .getByRole("button", { name: "Ops", exact: true })
          .and(launched.page.locator("button"))
          .click();
        await expectLayout(launched.page, layout);
      }
      await launched.page.reload();
      await expectLayout(launched.page, layout);
      await closePromptHub(launched.app, profile, {
        preserveUserDataDir: true,
      });
      app = null;
      launched = await launchPromptHub(null, { userDataDir: profile });
      app = launched.app;
      await expectLayout(launched.page, layout);
      await launched.page
        .getByRole("button", { name: "Ops", exact: true })
        .and(launched.page.locator("button"))
        .click();
      await expectLayout(launched.page, layout);
    } finally {
      if (app) await closePromptHub(app, profile);
    }
  });
}
