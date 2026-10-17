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

const title = "Prompt lifecycle acceptance";
const originalContent = "Original instructions for the lifecycle check.";
const updatedContent = "Updated instructions saved through the editor.";

async function createPromptInFolder(page: Page): Promise<string> {
  await page
    .getByRole("button", { name: "Create folder", exact: true })
    .click();
  await page.getByPlaceholder("Enter folder name").fill("Lifecycle folder");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText("Lifecycle folder", { exact: true }).click();
  await page.getByRole("button", { name: "New", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "New Prompt", exact: true });
  await dialog.getByPlaceholder("Name your Prompt").fill(title);
  await dialog
    .getByPlaceholder("Enter your Prompt content", { exact: false })
    .fill(originalContent);
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const prompt = await page.evaluate(async (name) => {
    const prompts = await window.api.prompt.getAll();
    const folders = await window.api.folder.getAll();
    return { prompt: prompts.find((item) => item.title === name), folders };
  }, title);
  expect(prompt.prompt).toMatchObject({ title, userPrompt: originalContent });
  expect(prompt.folders).toContainEqual(
    expect.objectContaining({
      id: prompt.prompt?.folderId,
      name: "Lifecycle folder",
    }),
  );
  if (!prompt.prompt)
    throw new Error("UI-created prompt missing from persistence");
  return prompt.prompt.id;
}

async function editAndRestore(page: Page, id: string): Promise<void> {
  await page.getByText(title, { exact: true }).first().click();
  await page
    .getByRole("button", {
      name: "Double-click to edit user prompt",
      exact: true,
    })
    .dblclick();
  await page
    .getByRole("textbox", { name: "User Prompt", exact: true })
    .fill(updatedContent);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => readPromptContent(page, id)).toBe(updatedContent);
  await page
    .getByRole("button", { name: "Version History", exact: true })
    .click();
  const history = page.getByRole("dialog", {
    name: "Version History",
    exact: true,
  });
  await history.getByRole("button", { name: /^v1\b/ }).click();
  await expect(
    history.getByText(originalContent, { exact: true }),
  ).toBeVisible();
  await history
    .getByRole("button", { name: "Restore This Version", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(history).not.toBeVisible();
  await expect.poll(() => readPromptContent(page, id)).toBe(originalContent);
}

async function readPromptContent(
  page: Page,
  id: string,
): Promise<string | undefined> {
  return page.evaluate(
    async (promptId) =>
      (await window.api.prompt.getAll()).find((item) => item.id === promptId)
        ?.userPrompt,
    id,
  );
}

async function checkCreationTimeAfterFavorites(
  page: Page,
  id: string,
): Promise<string> {
  await page.getByText(title, { exact: true }).first().click();
  const saved = await page.evaluate(
    async (promptId) =>
      (await window.api.prompt.getAll()).find((item) => item.id === promptId),
    id,
  );
  if (!saved) throw new Error("Created prompt missing before favorite check");
  const timestamp = page.locator("time[datetime]");
  await expect(timestamp).toHaveAttribute("datetime", saved.createdAt);
  const visibleTime = await timestamp.innerText();
  for (const { action, isFavorite } of [
    { action: "Add to Favorites", isFavorite: true },
    { action: "Remove from Favorites", isFavorite: false },
  ]) {
    await page.getByRole("button", { name: action, exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(
          async (promptId) =>
            (await window.api.prompt.getAll()).find(
              (item) => item.id === promptId,
            )?.isFavorite,
          id,
        ),
      )
      .toBe(isFavorite);
    await expect(timestamp).toHaveAttribute("datetime", saved.createdAt);
    await expect(timestamp).toHaveText(visibleTime);
  }
  return saved.createdAt;
}

test("creates a folder and prompt, edits, restores history, reopens, and confirms deletion through the UI", async () => {
  test.setTimeout(120_000);
  let launched = await launchPromptHub(null);
  let app: ElectronApplication | null = launched.app;
  const profile = launched.userDataDir;
  try {
    await setAppSettings(launched.page, {
      language: "en",
      themeMode: "light",
      autoCheckUpdate: false,
    });
    const id = await createPromptInFolder(launched.page);
    const createdAt = await checkCreationTimeAfterFavorites(launched.page, id);
    await editAndRestore(launched.page, id);
    await expect(launched.page.locator("time[datetime]")).toHaveAttribute(
      "datetime",
      createdAt,
    );
    await launched.page
      .getByRole("button", { name: "Toggle theme", exact: true })
      .click();
    await expect(launched.page.locator("html")).toHaveClass(/dark/);
    await closePromptHub(app, profile, { preserveUserDataDir: true });
    app = null;
    launched = await launchPromptHub(null, { userDataDir: profile });
    app = launched.app;
    await expect(launched.page.locator("html")).toHaveClass(/dark/);
    await expect(
      launched.page.getByRole("button", { name: "Settings", exact: true }),
    ).toBeVisible();
    await expect
      .poll(() => readPromptContent(launched.page, id))
      .toBe(originalContent);
    await launched.page
      .getByRole("button", { name: "Lifecycle folder", exact: true })
      .click();
    await launched.page.getByText(title, { exact: true }).first().click();
    await expect(launched.page.locator("time[datetime]")).toHaveAttribute(
      "datetime",
      createdAt,
    );
    await expect(
      launched.page.getByRole("button", {
        name: "Double-click to edit user prompt",
      }),
    ).toHaveText(originalContent);
    await launched.page
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await launched.page
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    expect(await readPromptContent(launched.page, id)).toBe(originalContent);
    await launched.page
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await launched.page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Confirm", exact: true })
      .click();
    await expect
      .poll(() => readPromptContent(launched.page, id))
      .toBeUndefined();
    await launched.page.reload();
    await expect(launched.page.getByText(title, { exact: true })).toHaveCount(
      0,
    );
  } finally {
    if (app) await closePromptHub(app, profile);
  }
});
