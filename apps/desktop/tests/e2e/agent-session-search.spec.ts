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
  setAppLanguage,
} from "./helpers/electron";

function writeCodexSession(
  codexRoot: string,
  id: string,
  cwd: string,
  title: string,
  body: string,
  extraMessages = 0,
): void {
  const sessionDir = path.join(codexRoot, "sessions", "2026", "08", "10");
  fs.mkdirSync(sessionDir, { recursive: true });
  const extraRecords = Array.from({ length: extraMessages }, (_, index) => ({
    timestamp: `2026-08-10T06:00:${String(index + 3).padStart(2, "0")}.000Z`,
    type: "response_item",
    payload: {
      id: `${id}-extra-${index + 1}`,
      type: "message",
      role: "assistant",
      content: [
        { type: "output_text", text: `Latest fixture message ${index + 1}` },
      ],
    },
  }));
  fs.writeFileSync(
    path.join(sessionDir, `rollout-${id}.jsonl`),
    [
      {
        timestamp: "2026-08-10T06:00:00.000Z",
        type: "session_meta",
        payload: { id, cwd, timestamp: "2026-08-10T06:00:00.000Z" },
      },
      {
        timestamp: "2026-08-10T06:00:01.000Z",
        type: "response_item",
        payload: {
          id: `${id}-user`,
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: title }],
        },
      },
      {
        timestamp: "2026-08-10T06:00:02.000Z",
        type: "response_item",
        payload: {
          id: `${id}-assistant`,
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: body }],
        },
      },
      ...extraRecords,
    ]
      .map((record) => JSON.stringify(record))
      .join("\n"),
    "utf8",
  );
}

function prepareCodexHome(userDataDir: string) {
  const homeDir = path.join(userDataDir, "home");
  const codexRoot = path.join(homeDir, ".codex");
  const wideTable = [
    "| File | Focus | Do not put here |",
    "| --- | --- | --- |",
    "| `docs/workflow/01-requirements/README.md` | what / why / success | framework, database table names, API contracts and implementation details |",
  ].join("\n");
  writeCodexSession(
    codexRoot,
    "11111111-1111-4111-8111-111111111111",
    "/workspace/Alpha",
    wideTable,
    "Visible release response ".repeat(200),
    24,
  );
  writeCodexSession(
    codexRoot,
    "22222222-2222-4222-8222-222222222222",
    "/workspace/Beta",
    "Database migration",
    "body-only-search-phrase",
  );
  fs.writeFileSync(
    path.join(codexRoot, "session_index.jsonl"),
    [
      {
        id: "11111111-1111-4111-8111-111111111111",
        thread_name: "Renamed release review",
        updated_at: "2026-08-10T06:01:00.000Z",
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        thread_name: "Migration check",
        updated_at: "2026-08-10T06:02:00.000Z",
      },
    ]
      .map((record) => JSON.stringify(record))
      .join("\n"),
    "utf8",
  );
  return { homeDir, codexRoot };
}

function prepareClaudeHome(userDataDir: string) {
  const homeDir = path.join(userDataDir, "home");
  const projectPath = path.join(homeDir, "work", "newpaper-repair");
  const sessionDir = path.join(
    homeDir,
    ".claude",
    "projects",
    "-Users-test-work-newpaper-repair",
  );
  fs.mkdirSync(projectPath, { recursive: true });
  fs.mkdirSync(sessionDir, { recursive: true });
  const sessionPath = path.join(
    sessionDir,
    "33333333-3333-4333-8333-333333333333.jsonl",
  );
  fs.writeFileSync(
    sessionPath,
    [
      {
        type: "user",
        isMeta: true,
        cwd: projectPath,
        message: {
          role: "user",
          content:
            "<local-command-caveat>Generated command context</local-command-caveat>",
        },
      },
      {
        type: "system",
        subtype: "local_command",
        cwd: projectPath,
        content: "Visible question",
      },
      { type: "last-prompt", content: "Visible question" },
      {
        type: "user",
        sessionId: "33333333-3333-4333-8333-333333333333",
        cwd: projectPath,
        timestamp: "2026-08-10T07:00:00.000Z",
        message: { role: "user", content: "Visible question" },
      },
      {
        type: "assistant",
        cwd: projectPath,
        timestamp: "2026-08-10T07:00:01.000Z",
        message: { role: "assistant", content: "Visible answer" },
      },
    ]
      .map((record) => JSON.stringify(record))
      .join("\n"),
    "utf8",
  );
  return { homeDir, sessionPath };
}

function prepareGeminiAndCursorHome(userDataDir: string) {
  const homeDir = path.join(userDataDir, "home");
  const geminiProjectPath = path.join(homeDir, "work", "gemini-project");
  const geminiCacheDir = path.join(homeDir, ".gemini", "tmp", "project-hash");
  fs.mkdirSync(path.join(geminiCacheDir, "chats"), { recursive: true });
  fs.mkdirSync(geminiProjectPath, { recursive: true });
  fs.writeFileSync(
    path.join(geminiCacheDir, ".project_root"),
    geminiProjectPath,
    "utf8",
  );
  fs.writeFileSync(
    path.join(geminiCacheDir, "chats", "gemini-session.json"),
    JSON.stringify({
      sessionId: "44444444-4444-4444-8444-444444444444",
      summary: "Gemini native title",
      startTime: "2026-08-10T08:00:00.000Z",
      lastUpdated: "2026-08-10T08:00:03.000Z",
      messages: [
        { type: "info", content: "Generated Gemini context" },
        { type: "user", content: "Gemini visible question" },
        { type: "gemini", content: "Gemini visible answer" },
        {
          type: "user",
          content: [
            {
              functionResponse: {
                response: { output: "Gemini tool result" },
              },
            },
          ],
        },
      ],
    }),
    "utf8",
  );

  const cursorProjectPath = path.join(
    homeDir,
    "work",
    "cursor-project-with-hyphen",
  );
  fs.mkdirSync(cursorProjectPath, { recursive: true });
  const cursorProjectKey = path
    .relative(path.parse(cursorProjectPath).root, cursorProjectPath)
    .split(path.sep)
    .join("-");
  const cursorSessionId = "55555555-5555-4555-8555-555555555555";
  const cursorTranscriptDir = path.join(
    homeDir,
    ".cursor",
    "projects",
    cursorProjectKey,
    "agent-transcripts",
    cursorSessionId,
  );
  fs.mkdirSync(cursorTranscriptDir, { recursive: true });
  fs.writeFileSync(
    path.join(cursorTranscriptDir, `${cursorSessionId}.jsonl`),
    [
      {
        role: "user",
        message: {
          content: [{ type: "text", text: "Cursor visible question" }],
        },
      },
      {
        role: "assistant",
        message: { content: [{ type: "text", text: "Cursor visible answer" }] },
      },
      {
        role: "tool",
        message: { content: [{ type: "text", text: "Hidden Cursor tool" }] },
      },
    ]
      .map((record) => JSON.stringify(record))
      .join("\n"),
    "utf8",
  );
  return { homeDir, cursorProjectKey };
}

async function openCodexSessions(
  app: ElectronApplication,
  page: Page,
): Promise<void> {
  await setAppLanguage(page, "en");
  await page.setViewportSize({ width: 1280, height: 820 });
  await sendAppCommand(app, { type: "agent:manage" });
  const agentSearch = page.getByPlaceholder("Search Agents");
  await agentSearch.fill("Codex");
  await page.getByRole("button", { name: "Codex", exact: true }).click();
  await page.getByRole("tab", { name: "Sessions" }).click();
}

async function openClaudeSessions(
  app: ElectronApplication,
  page: Page,
): Promise<void> {
  await setAppLanguage(page, "en");
  await page.setViewportSize({ width: 1280, height: 820 });
  await sendAppCommand(app, { type: "agent:manage" });
  const agentSearch = page.getByPlaceholder("Search Agents");
  await agentSearch.fill("Claude Code");
  await page.getByRole("button", { name: "Claude Code", exact: true }).click();
  await page.getByRole("tab", { name: "Sessions" }).click();
}

async function selectAgentSessions(page: Page, name: string): Promise<void> {
  const agentSearch = page.getByPlaceholder("Search Agents");
  await agentSearch.fill(name);
  await page.getByRole("button", { name, exact: true }).click();
  await page.getByRole("tab", { name: "Sessions" }).click();
}

async function submitHistorySearch(page: Page, query: string): Promise<void> {
  const search = page.getByRole("textbox", {
    name: "Search titles or projects",
  });
  await search.fill(query);
  await search.press("Enter");
}

test("submits Agent History title and project search with Enter", async ({}, testInfo) => {
  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-session-search-e2e-"),
  );
  const { homeDir, codexRoot } = prepareCodexHome(userDataDir);

  const { app, page } = await launchPromptHub(null, {
    userDataDir,
    env: {
      HOME: homeDir,
      USERPROFILE: homeDir,
      CODEX_HOME: codexRoot,
    },
  });

  try {
    await openCodexSessions(app, page);

    await expect(
      page.getByText("Renamed release review").first(),
    ).toBeVisible();
    await expect(page.getByText("Migration check").first()).toBeVisible();

    await page.getByRole("button", { name: /Renamed release review/ }).click();
    const transcript = page.getByTestId("conversation-transcript");
    const table = transcript.getByRole("table");
    await expect(table).toBeVisible();
    expect(
      await transcript.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    expect(
      await table.evaluate((element) => {
        const wrapper = element.parentElement;
        return wrapper
          ? getComputedStyle(wrapper).overflowX === "auto" &&
              wrapper.scrollWidth >= wrapper.clientWidth
          : false;
      }),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("agent-session-wide-table.png"),
      animations: "disabled",
    });
    await page.getByRole("button", { name: "Latest messages" }).click();
    await expect(page.getByText("Latest fixture message 24")).toBeVisible();
    await expect(page.getByText("Page 2 of 2")).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("agent-session-latest.png"),
      animations: "disabled",
    });

    await page.getByRole("button", { name: "Sort conversations" }).click();
    await page.getByRole("option", { name: "Largest first" }).click();
    const sortedRows = await page.locator("aside button").allTextContents();
    expect(
      sortedRows.findIndex((text) => text.includes("Renamed release review")),
    ).toBeLessThan(
      sortedRows.findIndex((text) => text.includes("Migration check")),
    );

    const draftSearch = page.getByRole("textbox", {
      name: "Search titles or projects",
    });
    await draftSearch.fill("body-only-search-phrase");
    await expect(
      page.getByText("Renamed release review").first(),
    ).toBeVisible();
    await expect(page.getByText("Migration check").first()).toBeVisible();
    await draftSearch.press("Enter");
    await expect(page.getByText("No sessions found.")).toBeVisible();

    await submitHistorySearch(page, "Alpha");
    await expect(
      page.getByText("Renamed release review").first(),
    ).toBeVisible();
    await expect(page.getByText("Migration check")).toHaveCount(0);

    await submitHistorySearch(page, "");
    await expect(
      page.getByText("Renamed release review").first(),
    ).toBeVisible();
    await expect(page.getByText("Migration check").first()).toBeVisible();
    await page
      .getByRole("button", { name: /Migration check/ })
      .click({ button: "right" });
    const contextMenu = page.getByRole("menu", {
      name: "Conversation actions",
    });
    await expect(contextMenu).toBeVisible();
    await expect(
      contextMenu.getByRole("menuitem", { name: "Continue in Codex" }),
    ).toBeVisible();
    await expect(
      contextMenu.getByRole("menuitem", { name: "Export Markdown" }),
    ).toBeVisible();
    await expect(
      contextMenu.getByRole("menuitem", { name: "Export JSON" }),
    ).toBeVisible();
    await expect(
      contextMenu.getByRole("menuitem", { name: "Show in folder" }),
    ).toBeVisible();
    await expect(
      contextMenu.getByRole("menuitem", { name: "Open project folder" }),
    ).toBeVisible();
    await expect(
      contextMenu.getByRole("menuitem", { name: "Delete permanently" }),
    ).toBeVisible();
    await expect(
      contextMenu.getByRole("menuitem", { name: "Edit details" }),
    ).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath("agent-session-search.png"),
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "More conversation actions" })
      .click();
    const moreMenu = page.getByRole("menu");
    await expect(
      moreMenu.getByRole("menuitem", { name: "Show in folder" }),
    ).toBeVisible();
    await expect(
      moreMenu.getByRole("menuitem", { name: "Open project folder" }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("agent-session-more-locations.png"),
      animations: "disabled",
    });
    await page.keyboard.press("Escape");

    const markdownPath = testInfo.outputPath("migration-check.md");
    await app.evaluate(({ dialog }, filePath) => {
      Reflect.set(dialog, "showSaveDialog", async () => ({
        canceled: false,
        filePath,
      }));
    }, markdownPath);
    await page.getByRole("button", { name: "Export conversation" }).click();
    await page.getByRole("menuitem", { name: "Export Markdown" }).click();
    await expect.poll(() => fs.existsSync(markdownPath)).toBe(true);
    const markdown = fs.readFileSync(markdownPath, "utf8");
    expect(markdown).toContain("Database migration");
    expect(markdown).toContain("body-only-search-phrase");
    expect(markdown).not.toContain("session_meta");

    const jsonPath = testInfo.outputPath("migration-check.json");
    await app.evaluate(({ dialog }, filePath) => {
      Reflect.set(dialog, "showSaveDialog", async () => ({
        canceled: false,
        filePath,
      }));
    }, jsonPath);
    await page.getByRole("button", { name: "Export conversation" }).click();
    await page.getByRole("menuitem", { name: "Export JSON" }).click();
    await expect.poll(() => fs.existsSync(jsonPath)).toBe(true);
    expect(JSON.parse(fs.readFileSync(jsonPath, "utf8"))).toMatchObject({
      version: 1,
      agentId: "codex",
      sessionId: "22222222-2222-4222-8222-222222222222",
      entries: [
        { role: "user", text: "Database migration" },
        { role: "assistant", text: "body-only-search-phrase" },
      ],
    });
  } finally {
    await closePromptHub(app, userDataDir);
  }
});

test("projects Claude cwd labels and hides internal transcript records", async ({}, testInfo) => {
  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-claude-session-e2e-"),
  );
  const { homeDir, sessionPath } = prepareClaudeHome(userDataDir);
  const launchOptions = {
    userDataDir,
    env: { HOME: homeDir, USERPROFILE: homeDir },
  };
  let activeApp = (await launchPromptHub(null, launchOptions)).app;

  try {
    let page = await activeApp.firstWindow();
    await openClaudeSessions(activeApp, page);
    await expect(page.getByText("Visible question").first()).toBeVisible();
    await expect(page.getByText("Visible answer")).toBeVisible();
    await expect(page.getByText("Event", { exact: true })).toHaveCount(0);
    await expect(page.getByText(/Generated command context/)).toHaveCount(0);
    const sessionRow = page.getByRole("button", { name: /Visible question/ });
    await expect(sessionRow).not.toContainText("Size unknown");

    await page.getByRole("button", { name: "Filter by project" }).click();
    await expect(
      page.getByRole("option", { name: "newpaper-repair", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("option", { name: /^-Users-/ })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await sessionRow.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Delete permanently" }).click();
    await expect(
      page.getByText(/This permanently deletes the native conversation data/),
    ).toBeVisible();
    await page.getByRole("button", { name: "Delete permanently" }).click();
    await expect(page.getByText("No sessions found.")).toBeVisible();
    expect(fs.existsSync(sessionPath)).toBe(false);
    await page.screenshot({
      path: testInfo.outputPath("agent-session-claude-projection.png"),
      animations: "disabled",
    });

    await closePromptHub(activeApp, userDataDir, {
      preserveUserDataDir: true,
    });
    const relaunched = await launchPromptHub(null, launchOptions);
    activeApp = relaunched.app;
    page = relaunched.page;
    await openClaudeSessions(activeApp, page);
    await expect(page.getByText("No sessions found.")).toBeVisible();
    expect(fs.existsSync(sessionPath)).toBe(false);
  } finally {
    await closePromptHub(activeApp, userDataDir);
  }
});

test("hides retired Gemini without deleting its sessions and projects Cursor native identities", async ({}, testInfo) => {
  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-gemini-cursor-session-e2e-"),
  );
  const { homeDir, cursorProjectKey } = prepareGeminiAndCursorHome(userDataDir);
  const { app, page } = await launchPromptHub(null, {
    userDataDir,
    env: { HOME: homeDir, USERPROFILE: homeDir },
  });

  try {
    await setAppLanguage(page, "en");
    await page.setViewportSize({ width: 1280, height: 820 });
    await sendAppCommand(app, { type: "agent:manage" });
    await expect(
      page.getByRole("button", { name: "Gemini", exact: true }),
    ).toHaveCount(0);
    const retainedSession = path.join(
      homeDir,
      ".gemini",
      "tmp",
      "project-hash",
      "chats",
      "gemini-session.json",
    );
    expect(fs.readFileSync(retainedSession, "utf8")).toContain(
      "Gemini native title",
    );
    await selectAgentSessions(page, "Cursor");
    await expect(
      page.getByText("Cursor visible question").first(),
    ).toBeVisible();
    await expect(page.getByText("Cursor visible answer")).toBeVisible();
    await expect(page.getByText("Hidden Cursor tool")).toHaveCount(0);
    await page.getByRole("button", { name: "Filter by project" }).click();
    await expect(
      page.getByRole("option", {
        name: "cursor-project-with-hyphen",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("option", { name: cursorProjectKey, exact: true }),
    ).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath("agent-session-cursor-projection.png"),
      animations: "disabled",
    });
  } finally {
    await closePromptHub(app, userDataDir);
  }
});
