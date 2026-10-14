import { expect, test, type Page } from "@playwright/test";
import fs from "fs";
import os from "os";
import path from "path";

import { writeCanonicalStorageAuthority } from "@prompthub/core/canonical-storage-authority";
import { writeRuntimeLayoutState } from "@prompthub/core/runtime-storage-context";

import {
  closePromptHub,
  launchPromptHub,
  sendAppCommand,
  setAppLanguage,
} from "./helpers/electron";

async function selectAgent(page: Page, name: string): Promise<void> {
  const search = page.getByPlaceholder("Search Agents");
  await search.fill(name);
  const agent = page.getByRole("button", { name, exact: true });
  await expect(agent).toBeVisible();
  await agent.click();
}

test("asks before creating an Agent-declared missing rule file", async ({}, testInfo) => {
  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-agent-rule-e2e-"),
  );
  const homeDir = path.join(userDataDir, "home");
  const geminiDir = path.join(homeDir, ".gemini");
  const rulePath = path.join(geminiDir, "GEMINI.md");
  fs.mkdirSync(geminiDir, { recursive: true });
  fs.writeFileSync(
    path.join(geminiDir, "settings.json"),
    JSON.stringify({ language: "en" }),
    "utf8",
  );

  const { app, page } = await launchPromptHub(null, {
    userDataDir,
    env: { HOME: homeDir, USERPROFILE: homeDir },
  });

  try {
    await setAppLanguage(page, "en");
    await page.setViewportSize({ width: 1440, height: 900 });
    await sendAppCommand(app, { type: "agent:manage" });
    await selectAgent(page, "Gemini");
    await page.getByRole("tab", { name: "Rules" }).click();

    await expect(
      page.getByRole("heading", { name: "Create GEMINI.md?" }),
    ).toBeVisible();
    await expect(page.getByText(rulePath)).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Rule Content" }),
    ).toHaveCount(0);
    expect(fs.existsSync(rulePath)).toBe(false);
    await page.screenshot({
      path: testInfo.outputPath("missing-gemini-rule.png"),
      animations: "disabled",
    });

    await page.getByRole("button", { name: "Create GEMINI.md" }).click();
    await expect(
      page.getByRole("textbox", { name: "Rule Content" }),
    ).toBeVisible();
    await expect(page.getByText("0 chars")).toBeVisible();
    expect(fs.existsSync(rulePath)).toBe(true);
    expect(fs.readFileSync(rulePath, "utf8")).toBe("");
  } finally {
    await closePromptHub(app, userDataDir);
  }
});

test("creates Kiro's declared global steering entry", async () => {
  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-agent-rule-e2e-"),
  );
  const homeDir = path.join(userDataDir, "home");
  const kiroDir = path.join(homeDir, ".kiro");
  const rulePath = path.join(kiroDir, "steering", "AGENTS.md");
  fs.mkdirSync(path.join(kiroDir, "settings"), { recursive: true });
  fs.writeFileSync(
    path.join(kiroDir, "settings", "cli.json"),
    JSON.stringify({ chat: { defaultModel: "auto" } }),
    "utf8",
  );

  const { app, page } = await launchPromptHub(null, {
    userDataDir,
    env: { HOME: homeDir, USERPROFILE: homeDir },
  });

  try {
    await setAppLanguage(page, "en");
    await page.setViewportSize({ width: 1440, height: 900 });
    await sendAppCommand(app, { type: "agent:manage" });
    await selectAgent(page, "Kiro");

    const rulesTab = page.getByRole("tab", { name: "Rules" });
    await expect(rulesTab).toBeEnabled();
    await rulesTab.click();
    await expect(
      page.getByRole("heading", { name: "Create AGENTS.md?" }),
    ).toBeVisible();
    await expect(page.getByText(rulePath)).toBeVisible();
    expect(fs.existsSync(rulePath)).toBe(false);

    await page.getByRole("button", { name: "Create AGENTS.md" }).click();
    await expect(
      page.getByRole("textbox", { name: "Rule Content" }),
    ).toBeVisible();
    expect(fs.readFileSync(rulePath, "utf8")).toBe("");
  } finally {
    await closePromptHub(app, userDataDir);
  }
});

test("saves, restores, and reloads Agent rule history", async () => {
  test.setTimeout(60_000);
  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-agent-rule-history-e2e-"),
  );
  writeRuntimeLayoutState(userDataDir);
  writeCanonicalStorageAuthority(userDataDir, {
    consistencyId: "f".repeat(64),
    operationId: "agent-rule-history-e2e",
  });
  const homeDir = path.join(userDataDir, "home");
  const geminiDir = path.join(homeDir, ".gemini");
  const rulePath = path.join(geminiDir, "GEMINI.md");
  fs.mkdirSync(geminiDir, { recursive: true });
  fs.writeFileSync(
    path.join(geminiDir, "settings.json"),
    JSON.stringify({ language: "en" }),
    "utf8",
  );
  const launchOptions = {
    userDataDir,
    env: { HOME: homeDir, USERPROFILE: homeDir },
  };
  let activeApp = (await launchPromptHub(null, launchOptions)).app;

  try {
    let page = await activeApp.firstWindow();
    await setAppLanguage(page, "en");
    await sendAppCommand(activeApp, { type: "agent:manage" });
    await selectAgent(page, "Gemini");
    await page.getByRole("tab", { name: "Rules" }).click();
    await page.getByRole("button", { name: "Create GEMINI.md" }).click();

    const firstRevision = "# First rule revision\n\nKeep exact history bytes.";
    const secondRevision = "# Second rule revision\n\nReplace the first draft.";
    let editor = page.getByRole("textbox", { name: "Rule Content" });
    await editor.fill(firstRevision);
    await page.getByRole("button", { name: "Save and overwrite file" }).click();
    await expect
      .poll(() => fs.readFileSync(rulePath, "utf8"))
      .toBe(firstRevision);

    await editor.fill(secondRevision);
    await page.getByRole("button", { name: "Save and overwrite file" }).click();
    await expect
      .poll(() => fs.readFileSync(rulePath, "utf8"))
      .toBe(secondRevision);

    await page.getByRole("button", { name: /^Version Snapshots/ }).click();
    const history = page.getByRole("dialog", { name: "Version Snapshots" });
    const firstSnapshot = history
      .getByRole("button")
      .filter({ hasText: "# First rule revision" });
    await expect(firstSnapshot).toBeVisible();
    await firstSnapshot.click();
    await history.getByRole("button", { name: "Restore to Draft" }).click();
    editor = page.getByRole("textbox", { name: "Rule Content" });
    await expect(editor).toContainText("# First rule revision");
    await expect(editor).toContainText("Keep exact history bytes.");
    expect(fs.readFileSync(rulePath, "utf8")).toBe(secondRevision);
    await page.getByRole("button", { name: "Save and overwrite file" }).click();
    await expect
      .poll(() => fs.readFileSync(rulePath, "utf8"))
      .toBe(firstRevision);

    await closePromptHub(activeApp, userDataDir, { preserveUserDataDir: true });
    const relaunched = await launchPromptHub(null, launchOptions);
    activeApp = relaunched.app;
    page = relaunched.page;
    await sendAppCommand(activeApp, { type: "agent:manage" });
    await selectAgent(page, "Gemini");
    await page.getByRole("tab", { name: "Rules" }).click();
    editor = page.getByRole("textbox", { name: "Rule Content" });
    await expect(editor).toContainText("# First rule revision");
    await expect(editor).toContainText("Keep exact history bytes.");
    expect(fs.readFileSync(rulePath, "utf8")).toBe(firstRevision);
    await page.getByRole("button", { name: /^Version Snapshots/ }).click();
    const reloadedHistory = page.getByRole("dialog", {
      name: "Version Snapshots",
    });
    const secondSnapshot = reloadedHistory
      .getByRole("button")
      .filter({ hasText: "# Second rule revision" });
    await expect(secondSnapshot).toBeVisible();
    await secondSnapshot
      .locator("..")
      .getByRole("button", { name: "Delete snapshot" })
      .click();
    const deleteDialog = page.getByRole("alertdialog", {
      name: "Delete snapshot",
    });
    await deleteDialog.getByRole("button", { name: "Delete" }).click();
    await expect(secondSnapshot).toHaveCount(0);
    expect(fs.readFileSync(rulePath, "utf8")).toBe(firstRevision);
  } finally {
    await closePromptHub(activeApp, userDataDir);
  }
});
