import {
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  closePromptHub,
  launchPromptHub,
  setAppSettings,
} from "./helpers/electron";

const SKILL_NAME = "agent-lifecycle-probe";
const DESCRIPTION = "Agent workbench lifecycle probe";
const UPDATED_DESCRIPTION = "Updated through the real Skill editor";
const AUTHOR = "PromptHub E2E";
const SNAPSHOT_NOTE = "Lifecycle snapshot with edited files";
const EXTRA_FILE = "docs/note.txt";
const EXTRA_FILE_CONTENT = "real file mutation from Electron\n";
const SKILL_MARKER = "<!-- AGENT_SKILL_LIFECYCLE_UPDATED -->";

async function readSkillState(page: Page, skillId: string) {
  return page.evaluate(async (id) => {
    const [skill, files, versions, installDetails] = await Promise.all([
      window.api.skill.get(id),
      window.api.skill.readLocalFiles(id),
      window.api.skill.versionGetAll(id),
      window.api.skill.getMdInstallStatusDetails(id),
    ]);
    return { skill, files, versions, installDetails };
  }, skillId);
}

async function editCurrentFile(
  page: Page,
  skillId: string,
  filePath: string,
  content: string,
): Promise<void> {
  const editorPane = page.locator(".skill-file-editor__editor");
  const editButton = editorPane.getByRole("button", {
    name: "Edit",
    exact: true,
  });
  if (await editButton.isVisible()) {
    await editButton.click();
  }
  const editor = editorPane.getByRole("textbox", { name: "Code editor" });
  await editor.fill(content);
  await editorPane.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByText("File saved", { exact: true }).last(),
  ).toBeVisible();
  // A prior save toast can still be visible while this write is pending.
  await expect
    .poll(async () => {
      const state = await readSkillState(page, skillId);
      return state.files.find((file) => file.path === filePath)?.content;
    })
    .toBe(content);
}

function findCanonicalPackageFile(
  userDataDir: string,
  relativePath: string,
): string | null {
  const root = path.join(userDataDir, "data", "skills");
  if (!fs.existsSync(root)) return null;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(root, entry.name, "files", relativePath);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

test("creates, reads, updates, versions, distributes, restarts, and deletes a Skill", async () => {
  test.setTimeout(120_000);

  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-agent-skill-e2e-"),
  );
  const homeDir = path.join(userDataDir, "home");
  const emptyBinDir = path.join(homeDir, "empty-bin");
  const codexRoot = path.join(homeDir, ".codex");
  const codexSkillsDir = path.join(codexRoot, "skills");
  const unrelatedTarget = path.join(codexSkillsDir, "unrelated", "KEEP.txt");
  const installedSkillDir = path.join(codexSkillsDir, SKILL_NAME);

  fs.mkdirSync(emptyBinDir, { recursive: true });
  fs.mkdirSync(path.dirname(unrelatedTarget), { recursive: true });
  fs.writeFileSync(
    path.join(codexRoot, "config.toml"),
    'model = "test-model"\n',
  );
  fs.writeFileSync(unrelatedTarget, "keep-me\n");

  const launchOptions = {
    userDataDir,
    env: { HOME: homeDir, PATH: emptyBinDir, USERPROFILE: homeDir },
  };
  let activeApp: ElectronApplication | null = null;

  try {
    let launched = await launchPromptHub(null, launchOptions);
    activeApp = launched.app;
    let { page } = launched;
    await page.setViewportSize({ width: 1440, height: 900 });
    await setAppSettings(page, {
      language: "en",
      minimizeOnLaunch: false,
      autoCheckUpdate: false,
    });

    await page.getByRole("button", { name: "Skills", exact: true }).click();
    await page.getByRole("button", { name: /new/i }).click();
    const createModal = page.getByTestId("create-skill-modal-container");
    await expect(createModal).toBeVisible();
    await createModal.getByRole("button", { name: "Create Manually" }).click();
    await createModal.getByPlaceholder("my-skill-name").fill(SKILL_NAME);
    await createModal
      .getByPlaceholder("Briefly describe what this skill does")
      .fill(DESCRIPTION);
    await createModal
      .locator("textarea")
      .first()
      .fill("# Agent Lifecycle Probe\n\nInitial instructions.\n");
    await createModal.getByRole("button", { name: "Create Skill" }).click();

    await expect
      .poll(async () => {
        const skills = await page.evaluate(() => window.api.skill.getAll());
        return skills.find((skill) => skill.name === SKILL_NAME) ?? null;
      })
      .toBeTruthy();

    const skill = await page.evaluate(async () => {
      const skills = await window.api.skill.getAll();
      return skills.find((item) => item.name === "agent-lifecycle-probe")!;
    });
    expect(skill.id).toBeTruthy();
    expect(skill.local_repo_path).toBeTruthy();
    const sourceRepoPath = String(skill.local_repo_path);
    await expect(page.getByRole("heading", { name: SKILL_NAME })).toBeVisible();
    expect(
      fs.readFileSync(path.join(sourceRepoPath, "SKILL.md"), "utf8"),
    ).toContain("Initial instructions.");

    await page.getByRole("button", { name: "Edit Skill" }).click();
    const editDialog = page
      .getByRole("heading", { name: "Edit Skill Metadata" })
      .locator("..")
      .locator("..");
    await expect(editDialog).toBeVisible();
    await page.getByLabel("Description").fill(UPDATED_DESCRIPTION);
    await page.getByLabel("Author").fill(AUTHOR);
    await editDialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      page.getByText(UPDATED_DESCRIPTION, { exact: true }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Files", exact: true }).click();
    await page.getByTitle("New File").click();
    await page.getByLabel("Enter file name").fill(EXTRA_FILE);
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await editCurrentFile(page, skill.id, EXTRA_FILE, EXTRA_FILE_CONTENT);

    await page.getByRole("button", { name: "SKILL.md", exact: true }).click();
    const beforeSkillMd = await page.evaluate(async (skillId) => {
      const files = await window.api.skill.readLocalFiles(skillId);
      return files.find((file) => file.path === "SKILL.md")?.content ?? "";
    }, skill.id);
    await editCurrentFile(
      page,
      skill.id,
      "SKILL.md",
      `${beforeSkillMd.trimEnd()}\n\n${SKILL_MARKER}\n`,
    );

    let state = await readSkillState(page, skill.id);
    expect(state.skill).toMatchObject({
      id: skill.id,
      name: SKILL_NAME,
      description: UPDATED_DESCRIPTION,
      author: AUTHOR,
    });
    expect(state.files.find((file) => file.path === EXTRA_FILE)?.content).toBe(
      EXTRA_FILE_CONTENT,
    );
    expect(
      state.files.find((file) => file.path === "SKILL.md")?.content,
    ).toContain(SKILL_MARKER);

    await page.getByRole("button", { name: "Snapshot", exact: true }).click();
    await page.getByLabel("Enter a note for this snapshot").fill(SNAPSHOT_NOTE);
    await page
      .getByRole("button", { name: "Create Snapshot", exact: true })
      .click();
    await expect(
      page.getByText("Version snapshot created", { exact: true }).last(),
    ).toBeVisible();
    await expect
      .poll(async () => {
        const versions = await page.evaluate(
          (id) => window.api.skill.versionGetAll(id),
          skill.id,
        );
        return (
          versions.find((version) => version.note === SNAPSHOT_NOTE) ?? null
        );
      })
      .toBeTruthy();

    await page.getByRole("button", { name: "Version History" }).click();
    await expect(
      page.getByText(SNAPSHOT_NOTE, { exact: true }).first(),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "Version History" }),
    ).not.toBeVisible();
    await page
      .getByTestId("skill-view-transition")
      .getByRole("button", { name: "Preview", exact: true })
      .click();

    const codexTarget = page.getByRole("button", {
      name: "Codex",
      exact: true,
    });
    await expect(codexTarget).toBeVisible();
    await page.getByRole("button", { name: "Symlink", exact: true }).click();
    await codexTarget.click();
    await page
      .getByRole("button", { name: "Apply changes", exact: true })
      .click();
    await expect(
      page.getByText("Applied 1 changes.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect.poll(() => fs.existsSync(installedSkillDir)).toBe(true);
    expect(fs.lstatSync(installedSkillDir).isSymbolicLink()).toBe(true);
    expect(fs.realpathSync(installedSkillDir)).toBe(
      fs.realpathSync(sourceRepoPath),
    );
    state = await readSkillState(page, skill.id);
    expect(state.installDetails.codex).toEqual({
      installed: true,
      mode: "symlink",
      contentState: "synced",
    });

    await expect(codexTarget).toHaveAttribute("aria-pressed", "true");
    await codexTarget.click();
    await page
      .getByRole("button", { name: "Apply changes", exact: true })
      .click();
    await expect.poll(() => fs.existsSync(installedSkillDir)).toBe(false);
    expect(fs.existsSync(sourceRepoPath)).toBe(true);
    expect(fs.readFileSync(path.join(sourceRepoPath, EXTRA_FILE), "utf8")).toBe(
      EXTRA_FILE_CONTENT,
    );
    state = await readSkillState(page, skill.id);
    expect(state.files.find((file) => file.path === EXTRA_FILE)?.content).toBe(
      EXTRA_FILE_CONTENT,
    );
    expect(fs.readFileSync(unrelatedTarget, "utf8")).toBe("keep-me\n");

    await closePromptHub(activeApp, userDataDir, { preserveUserDataDir: true });
    activeApp = null;
    expect(fs.readFileSync(path.join(sourceRepoPath, EXTRA_FILE), "utf8")).toBe(
      EXTRA_FILE_CONTENT,
    );
    launched = await launchPromptHub(null, launchOptions);
    activeApp = launched.app;
    page = launched.page;
    await page.setViewportSize({ width: 1440, height: 900 });
    const canonicalExtraFile = findCanonicalPackageFile(
      userDataDir,
      EXTRA_FILE,
    );
    expect(canonicalExtraFile).not.toBeNull();
    expect(fs.readFileSync(canonicalExtraFile!, "utf8")).toBe(
      EXTRA_FILE_CONTENT,
    );
    await page.getByRole("button", { name: "Skills", exact: true }).click();
    await page
      .locator("div.group")
      .filter({ has: page.getByRole("heading", { name: SKILL_NAME }) })
      .first()
      .click();

    state = await readSkillState(page, skill.id);
    expect(state.skill).toMatchObject({
      description: UPDATED_DESCRIPTION,
      author: AUTHOR,
    });
    expect(state.files.find((file) => file.path === EXTRA_FILE)?.content).toBe(
      EXTRA_FILE_CONTENT,
    );
    expect(
      state.versions.some((version) => version.note === SNAPSHOT_NOTE),
    ).toBe(true);
    expect(state.installDetails.codex.installed).toBe(false);

    await page.getByRole("button", { name: "Delete", exact: true }).click();
    const deleteDialog = page.getByRole("alertdialog", {
      name: "Confirm Delete",
    });
    await expect(deleteDialog).toContainText(
      "Deletes this Skill's PromptHub record, managed package, and version history. Linked external source folders are preserved.",
    );
    await deleteDialog
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await expect
      .poll(async () => {
        const skills = await page.evaluate(() => window.api.skill.getAll());
        return skills.some((item) => item.id === skill.id);
      })
      .toBe(false);
    expect(
      await page.evaluate((id) => window.api.skill.versionGetAll(id), skill.id),
    ).toEqual([]);
    expect(fs.existsSync(sourceRepoPath)).toBe(false);
    expect(fs.existsSync(canonicalExtraFile!)).toBe(false);
    expect(fs.existsSync(installedSkillDir)).toBe(false);
    expect(fs.readFileSync(unrelatedTarget, "utf8")).toBe("keep-me\n");

    await closePromptHub(activeApp, userDataDir, { preserveUserDataDir: true });
    activeApp = null;
    launched = await launchPromptHub(null, launchOptions);
    activeApp = launched.app;
    page = launched.page;
    await expect
      .poll(async () => {
        const skills = await page.evaluate(() => window.api.skill.getAll());
        return skills.some((item) => item.id === skill.id);
      })
      .toBe(false);
    expect(fs.existsSync(sourceRepoPath)).toBe(false);
    expect(fs.existsSync(canonicalExtraFile!)).toBe(false);
    expect(fs.readFileSync(unrelatedTarget, "utf8")).toBe("keep-me\n");
  } finally {
    if (activeApp) {
      await closePromptHub(activeApp, userDataDir);
    } else {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  }
});
