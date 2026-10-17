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

async function expectGallery(page: Page): Promise<void> {
  await expect(
    page.getByRole("button", { name: "Gallery View", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("prompt-gallery-view")).toBeVisible();
  await expect(page.locator(".prompt-list-pane")).toHaveCount(0);
}

async function editGalleryPrompt(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: "Deploy Checklist", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  const editor = page.getByRole("dialog", { name: "Edit Prompt", exact: true });
  await editor
    .getByPlaceholder("Enter your Prompt content", { exact: false })
    .fill("Edited through the gallery detail.");
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
    .toBe("Edited through the gallery detail.");
  await expectGallery(page);
}

test("keeps gallery after editing and restoring a pinned startup folder", async () => {
  test.setTimeout(120_000);
  let launched = await launchPromptHub("prompt-workspace.seed.json");
  let app: ElectronApplication | null = launched.app;
  const profile = launched.userDataDir;
  try {
    await setAppSettings(launched.page, {
      language: "en",
      autoCheckUpdate: false,
    });
    await launched.page.evaluate(async () => {
      await window.api.folder.create({ name: "Other folder" });
      await window.api.settings.set({
        startupFolderMode: "pinned",
        pinnedStartFolderId: "folder_ops",
      });
    });
    await launched.page.reload();
    await launched.page
      .getByRole("button", { name: "Gallery View", exact: true })
      .click();
    for (const name of ["Ops", "Other folder", "Ops"]) {
      await launched.page
        .getByRole("button", { name, exact: true })
        .and(launched.page.locator("button"))
        .click();
      await expectGallery(launched.page);
    }
    await editGalleryPrompt(launched.page);
    await closePromptHub(launched.app, profile, { preserveUserDataDir: true });
    app = null;
    launched = await launchPromptHub(null, { userDataDir: profile });
    app = launched.app;
    await expectGallery(launched.page);
    await expect(
      launched.page
        .getByRole("button", { name: "Ops", exact: true })
        .and(launched.page.locator("button")),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      launched.page.getByText("Deploy Checklist", { exact: true }),
    ).toBeVisible();
  } finally {
    if (app) await closePromptHub(app, profile);
  }
});
