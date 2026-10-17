import {
  expect,
  test,
  type Page,
  type ElectronApplication,
} from "@playwright/test";
import { writeFile } from "node:fs/promises";
import http from "node:http";
import { once } from "node:events";
import {
  launchPromptHub,
  closePromptHub,
  setAppSettings,
} from "./helpers/electron";

async function provider(failAt = 3, longAnswer = false, hold = false) {
  let calls = 0;
  const requests: unknown[] = [];
  let release: () => void = () => undefined;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const server = http.createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    requests.push(JSON.parse(body));
    calls++;
    if (hold) await pending;
    response.writeHead(calls === failAt ? 400 : 200, {
      "content-type": "application/json",
    });
    response.end(
      JSON.stringify(
        calls === failAt
          ? { error: { message: "Fixture model unavailable" } }
          : {
              choices: [
                {
                  message: {
                    content: longAnswer
                      ? `## 人物与动作

一位年轻女子，身着月白色广袖汉服，在飘雪中舞剑。衣袖随风翻卷，剑锋划出一道冷冽的银色弧线。

## 场景与光线

${"雪花落在古松与庭院之间，柔和逆光勾勒人物轮廓，画面保持清晰的层次。\n\n".repeat(8)}## 构图与风格

采用电影感构图，留出舒展的动作空间。`
                      : `History answer ${calls}`,
                  },
                  finish_reason: "stop",
                },
              ],
            },
      ),
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing fixture port");
  return {
    url: `http://127.0.0.1:${address.port}/v1`,
    requests,
    release,
    async close() {
      release();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

async function openTest(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Card View", exact: true }).click();
  await page.getByText("Deploy Checklist", { exact: true }).first().click();
  await page.getByRole("button", { name: "AI Test", exact: true }).click();
}

test("test variables survive drawer reopen and application restart and reach both models", async () => {
  test.setTimeout(120000);
  const remote = await provider(-1);
  let fixture = await launchPromptHub("prompt-workspace.seed.json");
  try {
    await setAppSettings(fixture.page, {
      language: "en",
      autoCheckUpdate: false,
      aiModels: ["model-a", "model-b"].map((id) => ({
        id,
        type: "chat",
        provider: "openai",
        apiProtocol: "openai",
        apiKey: "fixture-key",
        apiUrl: remote.url,
        model: id,
        isDefault: id === "model-a",
      })),
      scenarioModelDefaults: { promptTest: "model-a" },
    });
    await openTest(fixture.page);
    await fixture.page
      .getByRole("textbox", { name: "{{service}}", exact: true })
      .fill("Payments $& API");
    await fixture.page.keyboard.press("Escape");
    await openTest(fixture.page);
    await expect(
      fixture.page.getByRole("textbox", { name: "{{service}}", exact: true }),
    ).toHaveValue("Payments $& API");
    await closePromptHub(fixture.app, fixture.userDataDir, {
      preserveUserDataDir: true,
    });
    fixture = await launchPromptHub(null, { userDataDir: fixture.userDataDir });
    await openTest(fixture.page);
    await expect(
      fixture.page.getByRole("textbox", { name: "{{service}}", exact: true }),
    ).toHaveValue("Payments $& API");
    const panel = fixture.page.locator("aside").last();
    await panel.getByRole("button", { name: "AI Test", exact: true }).click();
    await expect(
      panel.getByText("History answer 1", { exact: true }),
    ).toBeVisible();
    await panel
      .getByRole("tab", { name: "Multi-Model Compare", exact: true })
      .click();
    for (const model of ["model-a", "model-b"])
      await panel.getByRole("button", { name: model, exact: true }).click();
    await panel
      .getByRole("button", { name: "Run Comparison", exact: true })
      .click();
    await expect(
      panel.getByRole("button", { name: "Run Comparison", exact: true }),
    ).toBeEnabled();
    expect(remote.requests).toHaveLength(3);
    for (const request of remote.requests)
      expect(request).toMatchObject({
        messages: expect.arrayContaining([
          {
            role: "user",
            content: "Review deploy health for Payments $& API.",
          },
        ]),
      });
    await capture(fixture.app, fixture.page, "remembered-test-variables.png");
  } finally {
    await closePromptHub(fixture.app, fixture.userDataDir);
    await remote.close();
  }
});

test("comparison sends selected output format to each model and saves it in history", async () => {
  test.setTimeout(120000);
  const remote = await provider(-1);
  const fixture = await launchPromptHub("prompt-workspace.seed.json");
  try {
    await setAppSettings(fixture.page, {
      language: "en",
      autoCheckUpdate: false,
      aiModels: ["model-a", "model-b"].map((id) => ({
        id,
        type: "chat",
        provider: "openai",
        apiProtocol: "openai",
        apiKey: "fixture-key",
        apiUrl: remote.url,
        model: id,
        isDefault: id === "model-a",
      })),
      scenarioModelDefaults: { promptTest: "model-a" },
    });
    await openTest(fixture.page);
    const panel = fixture.page.locator("aside").last();
    await panel
      .getByRole("tab", { name: "Multi-Model Compare", exact: true })
      .click();
    for (const model of ["model-a", "model-b"]) {
      await panel.getByRole("button", { name: model, exact: true }).click();
    }
    const schema = {
      type: "object",
      properties: { answer: { type: "string" } },
      required: ["answer"],
      additionalProperties: false,
    };
    for (const format of ["JSON Schema", "JSON Mode", "Text"]) {
      await panel.getByRole("button", { name: format, exact: true }).click();
      if (format === "JSON Schema") {
        await panel
          .getByLabel("Schema Definition", { exact: true })
          .fill("invalid");
        await panel
          .getByRole("button", { name: "Run Comparison", exact: true })
          .click();
        await expect(
          fixture.page.getByText("Invalid JSON Schema", { exact: true }),
        ).toBeVisible();
        expect(remote.requests).toHaveLength(0);
        await panel.getByLabel("Schema Name", { exact: true }).fill("answer");
        await panel
          .getByLabel("Schema Definition", { exact: true })
          .fill(JSON.stringify(schema));
        await capture(
          fixture.app,
          fixture.page,
          "comparison-output-schema.png",
        );
      }
      const previous = remote.requests.length;
      await panel
        .getByRole("button", { name: "Run Comparison", exact: true })
        .click();
      await expect.poll(() => remote.requests.length).toBe(previous + 2);
      await expect(
        panel.getByRole("button", { name: "Run Comparison", exact: true }),
      ).toBeEnabled();
      const responseFormat =
        format === "JSON Schema"
          ? {
              type: "json_schema",
              json_schema: { name: "answer", strict: true, schema },
            }
          : format === "JSON Mode"
            ? { type: "json_object" }
            : undefined;
      for (const request of remote.requests.slice(previous)) {
        expect(request).toMatchObject({ stream: true });
        if (responseFormat)
          expect(request).toMatchObject({ response_format: responseFormat });
        else expect(request).not.toHaveProperty("response_format");
      }
      await expect(
        panel.getByTestId("ai-test-results").getByText(/^\d+\.\d{2} s$/),
      ).toHaveCount(2);
    }
    await panel.getByRole("tab", { name: "Test history", exact: true }).click();
    const history = panel.getByRole("tabpanel", {
      name: "Test history",
      exact: true,
    });
    await history
      .getByRole("navigation")
      .getByRole("button")
      .filter({ hasText: "model-a" })
      .last()
      .click();
    const detail = history.getByTestId("test-history-detail");
    await detail.getByText("Test input", { exact: true }).click();
    await expect(
      detail.getByText(`json_schema: answer\n${JSON.stringify(schema)}`, {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      detail.getByTestId("ai-test-results").getByText(/^\d+\.\d{2} s$/),
    ).toHaveCount(2);
    await capture(fixture.app, fixture.page, "comparison-output-history.png");
  } finally {
    await closePromptHub(fixture.app, fixture.userDataDir);
    await remote.close();
  }
});

async function capture(
  app: ElectronApplication,
  page: Page,
  name: string,
): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.show();
    window.focus();
    window.webContents.invalidate();
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const png = await app.evaluate(async ({ BrowserWindow }) => {
    return (await BrowserWindow.getAllWindows()[0].webContents.capturePage())
      .toPNG()
      .toString("base64");
  });
  await writeFile(test.info().outputPath(name), Buffer.from(png, "base64"));
}

test("single and comparison history survives reopen and restart, and supports copying and deletion", async () => {
  test.setTimeout(120000);
  const remote = await provider();
  let fixture = await launchPromptHub("prompt-workspace.seed.json");
  try {
    await setAppSettings(fixture.page, {
      language: "en",
      autoCheckUpdate: false,
      aiModels: ["model-a", "model-b"].map((id) => ({
        id,
        type: "chat",
        provider: "openai",
        apiProtocol: "openai",
        apiKey: "fixture-key",
        apiUrl: remote.url,
        model: id,
        isDefault: id === "model-a",
        chatParams: { stream: false },
      })),
      scenarioModelDefaults: { promptTest: "model-a" },
    });
    await openTest(fixture.page);
    const panel = fixture.page.locator("aside").last();
    await panel.getByRole("tab", { name: "Test history", exact: true }).click();
    await expect(
      panel.getByText("No tests recorded for this Prompt yet."),
    ).toBeVisible();
    await expect(
      panel.getByRole("button", { name: "Delete record", exact: true }),
    ).toHaveCount(0);
    await panel.getByRole("tab", { name: "AI Test", exact: true }).click();
    await panel
      .getByRole("button", { name: "AI Test", exact: true })
      .last()
      .click();
    await expect(
      panel.getByText("History answer 1", { exact: true }),
    ).toBeVisible();
    await panel
      .getByRole("tab", { name: "Multi-Model Compare", exact: true })
      .click();
    await panel.getByRole("button", { name: "model-a", exact: true }).click();
    await panel.getByRole("button", { name: "model-b", exact: true }).click();
    await panel
      .getByRole("button", { name: "Run Comparison", exact: true })
      .click();
    await expect(
      panel.getByText("Fixture model unavailable", { exact: false }),
    ).toBeVisible();
    await panel.getByRole("tab", { name: "Test history", exact: true }).click();
    const history = fixture.page.getByRole("tabpanel", {
      name: "Test history",
      exact: true,
    });
    await expect(
      history
        .getByRole("navigation")
        .getByRole("button")
        .filter({ hasText: "model-a" }),
    ).toHaveCount(2);
    await expect(
      history
        .getByRole("navigation")
        .getByRole("button")
        .filter({ hasText: "model-b" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      history
        .getByText("Fixture model unavailable", { exact: false })
        .filter({ visible: true }),
    ).toBeVisible();
    await capture(fixture.app, fixture.page, "comparison-history.png");
    await fixture.page.keyboard.press("Escape");
    await test.step("Close the application with history persisted", async () => {
      await closePromptHub(fixture.app, fixture.userDataDir, {
        preserveUserDataDir: true,
      });
    });
    fixture = await test.step("Restart the application", () =>
      launchPromptHub(null, { userDataDir: fixture.userDataDir }));
    await openTest(fixture.page);
    await fixture.page
      .getByRole("tab", { name: "Test history", exact: true })
      .click();
    const restored = fixture.page.getByRole("tabpanel", {
      name: "Test history",
      exact: true,
    });
    await expect(
      restored
        .getByRole("navigation")
        .getByRole("button")
        .filter({ hasText: "model-a" }),
    ).toHaveCount(2);
    await restored
      .getByRole("button")
      .filter({ hasText: "1 / 1 succeeded" })
      .click();
    await expect(
      restored.getByText("History answer 1", { exact: true }),
    ).toBeVisible();
    await restored
      .getByText("Test input", { exact: true })
      .filter({ visible: true })
      .click();
    await expect(
      restored
        .getByText("System Prompt", { exact: true })
        .filter({ visible: true }),
    ).toBeVisible();
    const backup = await fixture.app.evaluate(({ clipboard }) =>
      clipboard.availableFormats().map((format) => ({
        format,
        data: clipboard.readBuffer(format).toString("base64"),
      })),
    );
    try {
      await restored
        .getByRole("button", { name: "Copy response", exact: true })
        .click();
      await expect
        .poll(() =>
          fixture.app.evaluate(({ clipboard }) => clipboard.readText()),
        )
        .toBe("History answer 1");
    } finally {
      await fixture.app.evaluate(({ clipboard }, previous) => {
        clipboard.clear();
        for (const item of previous)
          clipboard.writeBuffer(item.format, Buffer.from(item.data, "base64"));
      }, backup);
    }
    await restored
      .getByRole("button", { name: "Delete record", exact: true })
      .click();
    await restored.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(
      restored
        .getByRole("navigation")
        .getByRole("button")
        .filter({ hasText: "model-a" }),
    ).toHaveCount(1);
    await expect(
      restored.getByRole("button", { name: "Refresh", exact: true }),
    ).toBeVisible();
    await capture(fixture.app, fixture.page, "history-list.png");
    await expect(
      restored
        .getByText("Fixture model unavailable", { exact: false })
        .filter({ visible: true }),
    ).toBeVisible();
    await restored
      .getByRole("button", { name: "Delete record", exact: true })
      .click();
    await restored.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(
      restored.getByText("No tests recorded for this Prompt yet."),
    ).toBeVisible();
    await capture(fixture.app, fixture.page, "history-empty.png");
    await closePromptHub(fixture.app, fixture.userDataDir, {
      preserveUserDataDir: true,
    });
    fixture = await launchPromptHub(null, { userDataDir: fixture.userDataDir });
    await openTest(fixture.page);
    await fixture.page
      .getByRole("tab", { name: "Test history", exact: true })
      .click();
    await expect(
      fixture.page.getByText("No tests recorded for this Prompt yet."),
    ).toBeVisible();
  } finally {
    await closePromptHub(fixture.app, fixture.userDataDir);
    await remote.close();
  }
});

test("comparison and independent history tabs keep results and fixed controls across sizes", async () => {
  test.setTimeout(120000);
  const remote = await provider(0, true);
  const fixture = await launchPromptHub("prompt-workspace.seed.json");
  try {
    await fixture.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1606, 1011),
    );
    await setAppSettings(fixture.page, {
      language: "en",
      autoCheckUpdate: false,
      aiModels: ["gpt-6.1-sol", "gpt-6-luna", "gpt-6-astra"].map((id) => ({
        id,
        type: "chat",
        provider: "openai",
        apiProtocol: "openai",
        apiKey: "fixture-key",
        apiUrl: remote.url,
        model: id,
        isDefault: id === "gpt-6.1-sol",
        chatParams: { stream: false },
      })),
      scenarioModelDefaults: { promptTest: "gpt-6.1-sol" },
    });
    await openTest(fixture.page);
    const panel = fixture.page.getByRole("dialog", {
      name: "AI Test",
      exact: true,
    });
    await panel
      .getByRole("tab", { name: "Multi-Model Compare", exact: true })
      .click();
    for (const model of ["gpt-6.1-sol", "gpt-6-luna", "gpt-6-astra"])
      await panel.getByRole("button", { name: model, exact: true }).click();
    await panel
      .getByRole("button", { name: "Run Comparison", exact: true })
      .click();
    await expect(panel.getByRole("article")).toHaveCount(3);
    await expect(
      panel.getByText("人物与动作", { exact: true }).filter({ visible: true }),
    ).toHaveCount(3);
    await expect(panel.getByRole("navigation")).toHaveCount(0);
    await panel.getByRole("tab", { name: "Test history", exact: true }).click();
    const rail = panel.getByRole("navigation", { name: "Test history" });
    await expect(
      rail.getByRole("button").filter({ hasText: "3 / 3 succeeded" }),
    ).toHaveAttribute("aria-current", "page");
    const railBounds = await rail.boundingBox();
    const historyRow = rail
      .getByRole("button")
      .filter({ hasText: "3 / 3 succeeded" });
    expect((await historyRow.boundingBox())!.height).toBeLessThanOrEqual(64);
    const detailBounds = await panel
      .getByTestId("test-history-detail")
      .boundingBox();
    expect(railBounds).not.toBeNull();
    expect(detailBounds).not.toBeNull();
    expect(detailBounds!.x).toBeGreaterThanOrEqual(
      railBounds!.x + railBounds!.width - 1,
    );
    expect(Math.abs(detailBounds!.y - railBounds!.y)).toBeLessThan(2);
    await expect(
      panel.getByRole("button", { name: "Delete record", exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByRole("tab", { name: "Test history", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await capture(fixture.app, fixture.page, "drawer-history-light.png");
    await panel
      .getByRole("tab", { name: "Multi-Model Compare", exact: true })
      .click();
    await expect(panel.getByRole("navigation")).toHaveCount(0);
    await expect(
      panel.getByText("人物与动作", { exact: true }).filter({ visible: true }),
    ).toHaveCount(3);
    await fixture.page.evaluate(() =>
      document.documentElement.classList.add("dark"),
    );
    await panel
      .locator("summary")
      .filter({ hasText: "Test input" })
      .filter({ visible: true })
      .click();
    await capture(fixture.app, fixture.page, "drawer-compare-dark.png");
    await fixture.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(950, 700),
    );
    await expect(
      panel.getByRole("button", { name: "Run Comparison", exact: true }),
    ).toBeVisible();
    const bounds = await panel.boundingBox();
    const viewport = await fixture.page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
    }));
    expect(Math.abs(bounds!.x + bounds!.width - viewport.width)).toBeLessThan(
      2,
    );
    expect(bounds!.y).toBe(0);
    expect(Math.abs(bounds!.height - viewport.height)).toBeLessThan(2);
    await capture(fixture.app, fixture.page, "drawer-narrow-dark.png");
    await panel.getByRole("tab", { name: "Test history", exact: true }).click();
    await expect(rail).toBeVisible();
    expect((await historyRow.boundingBox())!.height).toBeLessThanOrEqual(64);
    await expect(panel.getByTestId("test-history-detail")).toBeVisible();
    await capture(fixture.app, fixture.page, "history-narrow-dark.png");
    await panel
      .getByRole("tab", { name: "Multi-Model Compare", exact: true })
      .click();
    await panel
      .getByRole("button", { name: "Run Comparison", exact: true })
      .focus();
    await fixture.page.keyboard.press("Tab");
    await expect(
      panel.getByRole("button", { name: "Expand", exact: true }),
    ).toBeFocused();
    await fixture.page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
  } finally {
    await closePromptHub(fixture.app, fixture.userDataDir);
    await remote.close();
  }
});

test("generation status spins without empty thinking and survives history navigation", async () => {
  test.setTimeout(120000);
  const remote = await provider(0, false, true);
  const fixture = await launchPromptHub("prompt-workspace.seed.json");
  try {
    await fixture.page.emulateMedia({ reducedMotion: "reduce" });
    await setAppSettings(fixture.page, {
      language: "en",
      autoCheckUpdate: false,
      motionPreference: "standard",
      aiModels: [
        {
          id: "model-a",
          type: "chat",
          provider: "openai",
          apiProtocol: "openai",
          apiKey: "fixture-key",
          apiUrl: remote.url,
          model: "model-a",
          isDefault: true,
          chatParams: { stream: false },
        },
      ],
      scenarioModelDefaults: { promptTest: "model-a" },
    });
    await openTest(fixture.page);
    const panel = fixture.page.getByRole("dialog", {
      name: "AI Test",
      exact: true,
    });
    await panel.getByRole("button", { name: "AI Test", exact: true }).click();
    const thinking = panel.getByRole("button", {
      name: "Thinking Process",
      exact: true,
    });
    const generating = panel
      .getByRole("status")
      .filter({ hasText: "Generating..." });
    await expect(thinking).toHaveCount(0);
    const spinner = generating.locator(".animate-spin");
    await expect(spinner).toHaveCount(1);
    const first = await spinner.evaluate(
      (element) => getComputedStyle(element).transform,
    );
    await expect
      .poll(() =>
        spinner.evaluate((element) => getComputedStyle(element).transform),
      )
      .not.toBe(first);
    await capture(fixture.app, fixture.page, "thinking-loading.png");
    await panel.getByRole("tab", { name: "Test history", exact: true }).click();
    await expect(
      panel.getByRole("navigation", { name: "Test history" }),
    ).toBeVisible();
    await expect(
      panel.getByRole("button", { name: "Testing...", exact: true }),
    ).toHaveCount(0);
    await panel.getByRole("tab", { name: "AI Test", exact: true }).click();
    await expect(generating).toBeVisible();
    await expect(thinking).toHaveCount(0);
    remote.release();
    await expect(
      panel.getByText("History answer 1", { exact: true }),
    ).toBeVisible();
    await expect(thinking).toHaveCount(0);
    await expect(generating).toHaveCount(0);
    await panel.getByRole("tab", { name: "AI Test", exact: true }).focus();
    await fixture.page.keyboard.press("End");
    await expect(
      panel.getByRole("tab", { name: "Test history", exact: true }),
    ).toBeFocused();
    await capture(fixture.app, fixture.page, "history-tab-list.png");
  } finally {
    remote.release();
    await closePromptHub(fixture.app, fixture.userDataDir);
    await remote.close();
  }
});
