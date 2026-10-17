import { expect, test } from "@playwright/test";
import {
  closePromptHub,
  launchPromptHub,
  setAppSettings,
} from "./helpers/electron";

test("edits in a square inner pane and opens both test modes from the footer", async () => {
  const { app, page, userDataDir } = await launchPromptHub(
    "prompt-workspace.seed.json",
  );
  try {
    await setAppSettings(page, {
      language: "en",
      autoCheckUpdate: false,
      aiModels: ["model-a", "model-b"].map((id) => ({
        id,
        type: "chat",
        provider: "openai",
        apiProtocol: "openai",
        apiKey: "fixture-key",
        apiUrl: "https://example.com/v1",
        model: id,
        isDefault: id === "model-a",
      })),
      scenarioModelDefaults: { promptTest: "model-a" },
    });
    await page.getByRole("button", { name: "Card View", exact: true }).click();
    await page.getByText("Deploy Checklist", { exact: true }).first().click();
    await expect(
      page.getByRole("button", { name: "Run Comparison", exact: true }),
    ).toHaveCount(0);
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
    await input.fill("Updated through the split editor.");
    await expect(input.locator("..")).toHaveCSS("border-radius", "0px");
    await expect(
      editor
        .getByText("Updated through the split editor.", { exact: true })
        .last(),
    ).toBeVisible();
    await input.evaluate((element) =>
      element.scrollIntoView({ block: "center" }),
    );
    await page.screenshot({
      path: test.info().outputPath("editor-inner-pane.png"),
      animations: "disabled",
    });
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
      .toBe("Updated through the split editor.");
    await page.getByRole("button", { name: "AI Test", exact: true }).click();
    const panel = page.locator("aside").filter({
      has: page.getByRole("button", {
        name: "Multi-Model Compare",
        exact: true,
      }),
    });
    const single = panel
      .getByRole("button", { name: "AI Test", exact: true })
      .first();
    await expect(single).toHaveAttribute("aria-pressed", "true");
    const compare = panel.getByRole("button", {
      name: "Multi-Model Compare",
      exact: true,
    });
    await compare.click();
    await expect(compare).toHaveAttribute("aria-pressed", "true");
    await expect(
      panel.getByText("model-a", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      panel.getByText("model-b", { exact: true }).first(),
    ).toBeVisible();
    await panel.getByRole("button", { name: "model-a", exact: true }).click();
    await panel.getByRole("button", { name: "model-b", exact: true }).click();
    await expect(
      panel.getByRole("button", { name: "Run Comparison", exact: true }),
    ).toBeEnabled();
    await page.screenshot({
      path: test.info().outputPath("comparison-in-test-panel.png"),
      animations: "disabled",
    });
    await single.click();
    await expect(single).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
  } finally {
    await closePromptHub(app, userDataDir);
  }
});
