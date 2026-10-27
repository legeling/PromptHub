import { expect, test } from "@playwright/test";
import fs from "fs";
import os from "os";
import path from "path";

import {
  closePromptHub,
  launchPromptHub,
  sendAppCommand,
  setAppLanguage,
} from "./helpers/electron";

test("Agent discovery does not create or report absent platform roots", async () => {
  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-agent-discovery-e2e-"),
  );
  const homeDir = path.join(userDataDir, "home");
  const emptyBinDir = path.join(homeDir, "empty-bin");
  const claudeRoot = path.join(homeDir, ".claude");
  const geminiRoot = path.join(homeDir, ".gemini");
  fs.mkdirSync(emptyBinDir, { recursive: true });
  fs.mkdirSync(claudeRoot, { recursive: true });
  fs.writeFileSync(
    path.join(claudeRoot, "settings.json"),
    JSON.stringify({ language: "en", model: "claude-sonnet" }),
    "utf8",
  );
  expect(fs.existsSync(geminiRoot)).toBe(false);

  const { app, page } = await launchPromptHub(null, {
    userDataDir,
    env: { HOME: homeDir, PATH: emptyBinDir, USERPROFILE: homeDir },
  });

  try {
    await setAppLanguage(page, "en");
    // Allow the startup tray's bounded quota scan to finish before discovery.
    await page.waitForTimeout(8_000);
    await sendAppCommand(app, { type: "agent:manage" });

    await expect(page.getByRole("heading", { name: "Agents" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Claude Code", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Antigravity CLI", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Gemini CLI", exact: true }),
    ).toHaveCount(0);
    expect(fs.existsSync(geminiRoot)).toBe(false);
  } finally {
    await closePromptHub(app, userDataDir);
  }
});
