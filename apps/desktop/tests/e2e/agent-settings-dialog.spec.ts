import { expect, test } from "@playwright/test";
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

test.describe("E2E: Agent settings dialog", () => {
  test("edits the selected Agent without navigating away", async ({}, testInfo) => {
    const userDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-agent-settings-e2e-"),
    );
    const homeDir = path.join(userDataDir, "home");
    const claudeDir = path.join(homeDir, ".claude");
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, "settings.json"),
      JSON.stringify({ model: "claude-sonnet" }, null, 2),
      "utf8",
    );

    const { app, page } = await launchPromptHub(null, {
      userDataDir,
      env: { HOME: homeDir, USERPROFILE: homeDir },
    });

    try {
      await setAppLanguage(page, "en");
      await page.setViewportSize({ width: 1280, height: 820 });
      await sendAppCommand(app, { type: "agent:manage" });
      await page
        .getByRole("button", { name: "Claude Code", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Manage skills" }),
      ).toHaveCount(0);
      await page.getByRole("button", { name: "More actions" }).click();
      await page.getByRole("button", { name: "Edit Agent" }).click();

      const dialog = page.getByRole("dialog", { name: "Edit Claude Code" });
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByRole("textbox", { name: "Root directory" }),
      ).toHaveValue(claudeDir);
      await expect(
        page.getByRole("heading", { name: "Claude Code", exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath("agent-settings-dialog.png"),
        animations: "disabled",
      });

      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog).toBeHidden();
      await expect(
        page.getByRole("heading", { name: "Claude Code", exact: true }),
      ).toBeVisible();
    } finally {
      await closePromptHub(app, userDataDir);
    }
  });

  test("saves the Agent root and persists selection and pinning across restart", async () => {
    test.setTimeout(60_000);
    const userDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-agent-settings-persistence-e2e-"),
    );
    writeRuntimeLayoutState(userDataDir);
    writeCanonicalStorageAuthority(userDataDir, {
      consistencyId: "e".repeat(64),
      operationId: "agent-settings-persistence-e2e",
    });
    const homeDir = path.join(userDataDir, "home");
    const claudeDir = path.join(homeDir, ".claude");
    const codexDir = path.join(homeDir, ".codex");
    const replacementClaudeDir = path.join(homeDir, "custom-claude");
    for (const directory of [claudeDir, codexDir, replacementClaudeDir]) {
      fs.mkdirSync(directory, { recursive: true });
    }
    fs.writeFileSync(
      path.join(claudeDir, "settings.json"),
      JSON.stringify({ model: "claude-sonnet" }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(replacementClaudeDir, "settings.json"),
      JSON.stringify({ model: "claude-opus" }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(codexDir, "config.toml"),
      'model = "gpt-5"\n',
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
      await page
        .getByRole("button", { name: "Claude Code", exact: true })
        .click();

      await page.getByRole("button", { name: "More actions" }).click();
      await page.getByRole("button", { name: "Edit Agent" }).click();
      let dialog = page.getByRole("dialog", { name: "Edit Claude Code" });
      await dialog
        .getByRole("textbox", { name: "Root directory" })
        .fill(replacementClaudeDir);
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(
        page.getByText(claudeDir, { exact: true }).first(),
      ).toBeVisible();
      expect(
        (await page.evaluate(() => window.api.settings.get()))
          .builtinAgentOverrides?.claude?.rootPath,
      ).not.toBe(replacementClaudeDir);

      await page.getByRole("button", { name: "More actions" }).click();
      await page.getByRole("button", { name: "Edit Agent" }).click();
      dialog = page.getByRole("dialog", { name: "Edit Claude Code" });
      await dialog
        .getByRole("textbox", { name: "Root directory" })
        .fill(replacementClaudeDir);
      await dialog.getByRole("button", { name: "Save" }).click();
      await expect(
        page.getByText(replacementClaudeDir, { exact: true }).first(),
      ).toBeVisible();
      await expect
        .poll(
          async () =>
            (await page.evaluate(() => window.api.settings.get()))
              .builtinAgentOverrides?.claude?.rootPath,
        )
        .toBe(replacementClaudeDir);

      const codexButton = page.getByRole("button", {
        name: "Codex",
        exact: true,
      });
      await codexButton.hover();
      await codexButton
        .locator("..")
        .getByRole("button", { name: "Pin" })
        .click();
      await expect(
        page
          .getByRole("list")
          .getByRole("button", { name: "Codex", exact: true }),
      ).toBeVisible();

      await closePromptHub(activeApp, userDataDir, {
        preserveUserDataDir: true,
      });
      const relaunched = await launchPromptHub(null, launchOptions);
      activeApp = relaunched.app;
      page = relaunched.page;
      await sendAppCommand(activeApp, { type: "agent:manage" });
      await expect(
        page.getByRole("heading", { name: "Claude Code", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(replacementClaudeDir, { exact: true }).first(),
      ).toBeVisible();
      const agentButtons = page
        .getByRole("list")
        .getByRole("button", { name: /^(Codex|Claude Code)$/ });
      await expect(agentButtons).toHaveCount(2);
      await expect(agentButtons.nth(0)).toHaveAccessibleName("Codex");
      await expect(agentButtons.nth(1)).toHaveAccessibleName("Claude Code");
      await expect(
        page
          .getByRole("button", { name: "Codex", exact: true })
          .locator("..")
          .getByRole("button", { name: "Unpin" }),
      ).toBeAttached();
    } finally {
      await closePromptHub(activeApp, userDataDir);
    }
  });
});
