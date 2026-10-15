import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
import {
  generatedDraft,
  generationRequest,
  startPromptAiServer,
} from "./helpers/prompt-ai-server";

async function configureModel(page: Page, url: string): Promise<void> {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Model Services", exact: true })
    .click();
  await page.getByRole("button", { name: "Add Provider", exact: true }).click();
  const provider = page.getByRole("dialog", {
    name: "Add Provider",
    exact: true,
  });
  await provider
    .getByRole("textbox", { name: "Provider Name", exact: true })
    .fill("Isolated AI provider");
  await provider
    .getByLabel("API Key", { exact: true })
    .fill("fixture-only-key");
  await provider
    .getByRole("textbox", { name: "API URL", exact: true })
    .fill(url);
  await provider
    .getByRole("button", { name: "Save Changes", exact: true })
    .click();
  await expect(provider).not.toBeVisible();
  await page.getByRole("button", { name: "Add Model", exact: true }).click();
  const model = page.getByRole("dialog", { name: "Add Model", exact: true });
  await model
    .getByRole("textbox", { name: "Custom Name (Optional)", exact: true })
    .fill("Local review model");
  await model
    .getByRole("textbox", { name: "Model Name", exact: true })
    .fill("fixture-review-model");
  await model
    .getByRole("button", { name: "Test Current Config", exact: true })
    .click();
  await expect(
    page.getByText(/Local review model test succeeded/),
  ).toBeVisible();
  await model.getByRole("button", { name: "Add Model", exact: true }).click();
  await expect(model).not.toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
}

async function openGeneration(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: "Creation mode", exact: true })
    .click();
  await page
    .getByRole("button", { name: /^AI Generate Describe your goal/ })
    .click();
  await page
    .getByRole("textbox", { name: "Describe the Prompt you want", exact: true })
    .fill(generationRequest);
}

async function readPrompts(page: Page) {
  return page.evaluate(() => window.api.prompt.getAll());
}

async function expectDraft(page: Page, title: string): Promise<void> {
  await page.getByText(title, { exact: true }).first().click();
  await expect(
    page.getByRole("button", {
      name: "Double-click to edit user prompt",
      exact: true,
    }),
  ).toHaveText(generatedDraft.userPrompt);
  await expect(
    page.getByRole("button", {
      name: "Double-click to edit system prompt",
      exact: true,
    }),
  ).toHaveText(generatedDraft.systemPrompt);
  const prompts = await readPrompts(page);
  expect(prompts.find((prompt) => prompt.title === title)).toMatchObject({
    title,
    promptType: "text",
    userPrompt: generatedDraft.userPrompt,
    systemPrompt: generatedDraft.systemPrompt,
    description: generatedDraft.description,
    tags: generatedDraft.tags,
  });
}

test("configures AI in Settings, generates and saves a prompt, preserves data on failure, retries and reopens", async () => {
  test.setTimeout(120_000);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-ai-ui-"));
  const profile = path.join(root, "profile");
  const server = await startPromptAiServer();
  let app: ElectronApplication | null = null;
  try {
    let launched = await launchPromptHub(null, { userDataDir: profile });
    app = launched.app;
    await setAppSettings(launched.page, {
      language: "en",
      autoCheckUpdate: false,
    });
    await configureModel(launched.page, server.url);
    await openGeneration(launched.page);
    await launched.page
      .getByRole("button", { name: "Generate & Create", exact: true })
      .click();
    await expect(
      launched.page.getByRole("textbox", {
        name: "Describe the Prompt you want",
      }),
    ).not.toBeVisible();
    await expectDraft(launched.page, generatedDraft.title);
    const beforeFailure = await readPrompts(launched.page);
    expect(beforeFailure).toHaveLength(1);

    await openGeneration(launched.page);
    for (const failure of ["http-error", "invalid"] as const) {
      server.setReply(failure);
      await launched.page
        .getByRole("button", { name: "Generate & Create", exact: true })
        .click();
      await expect(
        launched.page.getByText(
          failure === "http-error"
            ? "AI analysis failed"
            : "Failed to parse AI response",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        launched.page.getByRole("textbox", {
          name: "Describe the Prompt you want",
        }),
      ).toHaveValue(generationRequest);
      await expect(
        launched.page.getByRole("button", {
          name: "Generate & Create",
          exact: true,
        }),
      ).toBeEnabled();
      expect(await readPrompts(launched.page)).toEqual(beforeFailure);
    }
    const retryTitle = "Retried release review";
    server.setReply("valid", retryTitle);
    await launched.page
      .getByRole("button", { name: "Generate & Create", exact: true })
      .click();
    await expect(
      launched.page.getByRole("textbox", {
        name: "Describe the Prompt you want",
      }),
    ).not.toBeVisible();
    await expectDraft(launched.page, retryTitle);
    expect(await readPrompts(launched.page)).toHaveLength(2);

    await closePromptHub(app, profile, { preserveUserDataDir: true });
    app = null;
    launched = await launchPromptHub(null, { userDataDir: profile });
    app = launched.app;
    await expectDraft(launched.page, generatedDraft.title);
    await expectDraft(launched.page, retryTitle);
    await launched.page
      .getByRole("button", { name: "Settings", exact: true })
      .click();
    await launched.page
      .getByRole("button", { name: "Model Services", exact: true })
      .click();
    await expect(
      launched.page.getByText("Isolated AI provider", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      launched.page.getByText("Local review model", { exact: true }).first(),
    ).toBeVisible();
    await launched.page
      .getByRole("button", { name: "Back", exact: true })
      .click();
    const reopenedTitle = "Reopened model review";
    server.setReply("valid", reopenedTitle);
    await openGeneration(launched.page);
    await launched.page
      .getByRole("button", { name: "Generate & Create", exact: true })
      .click();
    await expect(
      launched.page.getByRole("textbox", {
        name: "Describe the Prompt you want",
      }),
    ).not.toBeVisible();
    await expectDraft(launched.page, reopenedTitle);
    expect(await readPrompts(launched.page)).toHaveLength(3);
    expect(server.requests).toHaveLength(6);
    for (const request of server.requests) {
      expect(request).toMatchObject({
        path: "/v1/chat/completions",
        authenticated: true,
        body: { model: "fixture-review-model" },
      });
    }
  } finally {
    try {
      if (app) await closePromptHub(app, profile);
    } finally {
      await server.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});
