import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test, expect, type Page } from "@playwright/test";
import {
  closePromptHub,
  launchPromptHub,
  setAppSettings,
} from "./helpers/electron";
import { getElectronLaunchEnvironment } from "./helpers/electron-launch-options";

const execute = promisify(execFile);
const cliTimeoutMs = 30_000;
const cliOutputBytes = 1024 * 1024;

async function cli(profile: string, ...args: string[]): Promise<void> {
  await execute(
    process.execPath,
    ["--import", "tsx", "src/index.ts", "--data-dir", profile, ...args],
    {
      cwd: path.resolve("../cli"),
      env: getElectronLaunchEnvironment(profile),
      timeout: cliTimeoutMs,
      maxBuffer: cliOutputBytes,
    },
  );
}

async function cancelRefresh(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toContainText("There are unsaved changes");
  await confirmation
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(confirmation).toBeHidden();
}

async function discardAndRefresh(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", {
      name: "Discard and refresh",
      exact: true,
    })
    .click();
}

test("refreshes live CLI writes, details, tags and counts while protecting Prompt drafts (#198)", async () => {
  const { app, page, userDataDir } = await launchPromptHub(
    "prompt-workspace.seed.json",
  );
  try {
    await setAppSettings(page, { language: "en", autoCheckUpdate: false });
    const all = page.getByRole("button", { name: "All", exact: true });
    await all.click();
    await expect(page.getByText("1 prompts", { exact: true })).toBeVisible();
    await page.getByText("Deploy Checklist", { exact: true }).first().click();
    await cli(
      userDataDir,
      "prompt",
      "create",
      "--title",
      "CLI added",
      "--user-prompt",
      "External create",
    );
    await cli(
      userDataDir,
      "prompt",
      "update",
      "prompt_ops_1",
      "--user-prompt",
      "External revision",
      "--tags",
      "external-tag",
      "--favorite",
    );
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(page.getByText("2 prompts", { exact: true })).toBeVisible();
    await expect(page.getByText("CLI added", { exact: true })).toBeVisible();
    const content = page.getByRole("button", {
      name: "Double-click to edit user prompt",
      exact: true,
    });
    await expect(content).toContainText("External revision");
    await expect(
      page.getByText("external-tag", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Remove from Favorites", exact: true }),
    ).toBeVisible();
    await content.dblclick();
    const editor = page.getByRole("textbox", {
      name: "User Prompt",
      exact: true,
    });
    await editor.fill("Unsaved local draft");
    await cli(
      userDataDir,
      "prompt",
      "update",
      "prompt_ops_1",
      "--user-prompt",
      "External revision two",
    );
    await cancelRefresh(page);
    await expect(editor).toHaveValue("Unsaved local draft");
    await discardAndRefresh(page);
    await expect(content).toContainText("External revision two");
    await cli(userDataDir, "prompt", "delete", "prompt_ops_1");
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(page.getByText("1 prompts", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Deploy Checklist", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText(
        "Workspace refreshed. The selected item no longer exists.",
        { exact: true },
      ),
    ).toBeVisible();
  } finally {
    await closePromptHub(app, userDataDir);
  }
});

test("refreshes external Skill file edits and preserves an unsaved file draft (#198)", async () => {
  const { app, page, userDataDir } = await launchPromptHub(null);
  try {
    await setAppSettings(page, { language: "en", autoCheckUpdate: false });
    await page.getByRole("button", { name: "Skills", exact: true }).click();
    await page.getByRole("button", { name: /new/i }).click();
    const create = page.getByTestId("create-skill-modal-container");
    await create.getByRole("button", { name: "Create Manually" }).click();
    await create.getByPlaceholder("my-skill-name").fill("refresh-skill");
    await create
      .getByPlaceholder("Briefly describe what this skill does")
      .fill("Refresh regression");
    await create.locator("textarea").first().fill("# Initial Skill");
    await create.getByRole("button", { name: "Create Skill" }).click();
    await expect(
      page.getByRole("heading", {
        name: "Copy title: refresh-skill",
        exact: true,
      }),
    ).toBeVisible();
    const repo = await page.evaluate(async () => {
      const skill = (await window.api.skill.getAll()).find(
        (item) => item.name === "refresh-skill",
      );
      if (!skill) throw new Error("Created Skill is missing");
      await window.api.skill.writeLocalFile(
        skill.id,
        "note.txt",
        "Initial file",
      );
      return window.api.skill.getRepoPath(skill.id);
    });
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await page.getByRole("button", { name: "Files", exact: true }).click();
    await page.getByRole("button", { name: "note.txt", exact: true }).click();
    const pane = page.locator(".skill-file-editor__editor");
    await expect(pane).toContainText("Initial file");
    fs.writeFileSync(path.join(repo, "note.txt"), "External file revision");
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(pane).toContainText("External file revision");
    await pane.getByRole("button", { name: "Edit", exact: true }).click();
    const editor = pane.getByRole("textbox", {
      name: "Code editor",
      exact: true,
    });
    await editor.fill("Unsaved Skill draft");
    fs.writeFileSync(path.join(repo, "note.txt"), "External file revision two");
    await cancelRefresh(page);
    await expect(editor).toHaveText("Unsaved Skill draft");
    await discardAndRefresh(page);
    await expect(pane).toContainText("External file revision two");
    expect(fs.readFileSync(path.join(repo, "note.txt"), "utf8")).toBe(
      "External file revision two",
    );
  } finally {
    await closePromptHub(app, userDataDir);
  }
});

test("refreshes external Rules conflicts without overwriting target bytes (#198)", async () => {
  const { app, page, userDataDir } = await launchPromptHub(null);
  try {
    await setAppSettings(page, { language: "en", autoCheckUpdate: false });
    const project = path.join(userDataDir, "rule-project");
    fs.mkdirSync(project);
    const file = path.join(project, "AGENTS.md");
    fs.writeFileSync(file, "# Managed rule version");
    await page.evaluate(async (rootPath) => {
      await window.api.rules.addProject({
        id: "refresh-rule",
        name: "Refresh Rule",
        rootPath,
      });
    }, project);
    await page.getByRole("button", { name: "Rules", exact: true }).click();
    // Wait for initial loading to consume the original file before editing it.
    await expect(page.locator(".cm-content")).toContainText(
      "Managed rule version",
    );
    const refresh = page
      .getByRole("banner")
      .getByRole("button", { name: "Refresh", exact: true });
    await expect(refresh).toBeVisible();
    fs.writeFileSync(file, "# External rule version");
    await refresh.click();
    const dialog = page.getByRole("dialog", { name: /Rule conflict/i });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Managed rule version");
    await expect(dialog).toContainText("External rule version");
    expect(fs.readFileSync(file, "utf8")).toBe("# External rule version");
  } finally {
    await closePromptHub(app, userDataDir);
  }
});
