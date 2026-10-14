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
  sendAppCommand,
  setAppSettings,
} from "./helpers/electron";

async function openSkills(app: ElectronApplication, page: Page): Promise<void> {
  await sendAppCommand(app, { type: "agent:manage" });
  await page.getByPlaceholder("Search Agents").fill("Qwen Work");
  await page
    .getByRole("button", { name: "Qwen Work (CN)", exact: true })
    .click();
  await page.getByRole("tab", { name: "Skills", exact: true }).click();
}

test("discovers and imports Qwen Work native skills from the Agent workspace, then reopens (#224)", async () => {
  test.setTimeout(120_000);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "issue-224-gui-"));
  const home = path.join(profile, "home");
  const source = path.join(home, ".qwenworkcn", "skills", "work-writer");
  fs.mkdirSync(path.join(source, "docs"), { recursive: true });
  fs.writeFileSync(
    path.join(source, "SKILL.md"),
    "---\nname: work-writer\ndescription: Qwen Work native package\nversion: 1.0.0\n---\n# Writer\n",
  );
  fs.writeFileSync(
    path.join(source, "docs/note.txt"),
    "Whole package resource\n",
  );
  const options = {
    userDataDir: profile,
    env: { HOME: home, USERPROFILE: home },
  };
  let app: ElectronApplication | null = null;
  try {
    let launched = await launchPromptHub(null, options);
    app = launched.app;
    let page = launched.page;
    await page.setViewportSize({ width: 1440, height: 900 });
    await setAppSettings(page, {
      language: "en",
      autoCheckUpdate: false,
      minimizeOnLaunch: false,
    });
    await openSkills(app, page);
    let card = page
      .getByTestId("agent-skill-asset-card")
      .filter({ hasText: "work-writer" });
    await expect(card).toContainText("Qwen Work native package");
    await card
      .getByRole("button", { name: "Import to My Skills", exact: true })
      .click();
    await expect(card).toContainText("In My Skills");
    const skills = await page.evaluate(() => window.api.skill.getAll());
    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      name: "work-writer",
      description: "Qwen Work native package",
      source_url: source,
    });
    const managed = skills[0].local_repo_path;
    expect(managed).toBeTruthy();
    expect(fs.readFileSync(path.join(managed!, "docs/note.txt"), "utf8")).toBe(
      "Whole package resource\n",
    );
    await closePromptHub(app, profile, { preserveUserDataDir: true });
    app = null;
    launched = await launchPromptHub(null, options);
    app = launched.app;
    page = launched.page;
    await openSkills(app, page);
    card = page
      .getByTestId("agent-skill-asset-card")
      .filter({ hasText: "work-writer" });
    await expect(card).toContainText("In My Skills");
    await card
      .getByRole("button", { name: "Open in My Skills", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Copy title: work-writer",
        exact: true,
      }),
    ).toBeVisible();
    const files = await page.evaluate(
      (id) => window.api.skill.readLocalFiles(id),
      skills[0].id,
    );
    expect(
      files
        .filter((file) => !file.isDirectory)
        .map((file) => file.path)
        .sort(),
    ).toEqual(["SKILL.md", "docs/note.txt"]);
    expect(fs.existsSync(path.join(home, ".qwen"))).toBe(false);
  } finally {
    if (app) await closePromptHub(app, profile);
    else fs.rmSync(profile, { recursive: true, force: true });
  }
});
