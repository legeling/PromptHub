import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  closePromptHub,
  launchPromptHub,
  sendAppCommand,
  setAppSettings,
} from "./helpers/electron";

const LONG_KEY =
  "NODE_REPL_NATIVE_PIPE_CONNECT_TIMEOUT_MS_WITH_AN_EXTRA_LONG_SUFFIX";
const EDIT_KEY = "NODE_REPL_UNTRUSTED_ENV_ALLOWLIST";

async function expectContainedHeader(input: Locator): Promise<void> {
  const card = input.locator("..");
  const label = card.locator("label");
  const badge = card.getByText("已填写", { exact: true });
  await expect(badge).toBeVisible();
  const bounds = await card.evaluate((element) => {
    const labelElement = element.querySelector("label");
    const badgeElement = labelElement?.nextElementSibling;
    if (
      !(labelElement instanceof HTMLElement) ||
      !(badgeElement instanceof HTMLElement)
    ) {
      throw new Error("Environment card header is missing");
    }
    const cardRect = element.getBoundingClientRect();
    const labelRect = labelElement.getBoundingClientRect();
    const badgeRect = badgeElement.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(badgeElement);
    return {
      cardRight: cardRect.right,
      cardWidth: cardRect.width,
      minimumWidth: Math.min(
        element.parentElement?.getBoundingClientRect().width ?? 0,
        parseFloat(getComputedStyle(document.documentElement).fontSize) * 18,
      ),
      labelRight: labelRect.right,
      badgeLeft: badgeRect.left,
      badgeRight: badgeRect.right,
      badgeLines: range.getClientRects().length,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    };
  });
  expect(bounds.badgeLines).toBe(1);
  expect(bounds.cardWidth).toBeGreaterThanOrEqual(bounds.minimumWidth - 1);
  expect(bounds.labelRight).toBeLessThanOrEqual(bounds.badgeLeft);
  expect(bounds.badgeRight).toBeLessThanOrEqual(bounds.cardRight);
  expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.clientWidth + 1);
  await expect(label).not.toBeEmpty();
}

async function checkEnvironmentCards(page: Page): Promise<void> {
  const detail = page.getByTestId("mcp-full-detail-page");
  const longInput = detail.locator(`input[id$="-${LONG_KEY}"]`);
  const editInput = detail.locator(`input[id$="-${EDIT_KEY}"]`);
  await longInput.scrollIntoViewIfNeeded();
  await expectContainedHeader(longInput);
  await editInput.fill("layout-fixture-value");
  await expect(editInput).toHaveValue("layout-fixture-value");
  await expectContainedHeader(editInput);
}

async function seedEnvironmentFixture(page: Page): Promise<void> {
  await page.evaluate(
    async ({ longKey, editKey }) => {
      await window.api.mcp.createServer({
        name: "env-layout",
        displayName: "Env Layout",
        transport: "stdio",
        command: "fixture-command",
        enabled: true,
        source: { type: "manual" },
        env: {
          [longKey]: "fixture-value",
          [editKey]: "fixture-value",
          NODE_REPL_NODE_PATH: "fixture-value",
        },
      });
    },
    { longKey: LONG_KEY, editKey: EDIT_KEY },
  );
}

test("long MCP variable names keep Chinese status badges inside cards", async () => {
  test.setTimeout(90_000);
  const { app, page, userDataDir } = await launchPromptHub(null);
  try {
    await seedEnvironmentFixture(page);
    for (const theme of ["light", "dark"] as const) {
      await setAppSettings(page, {
        language: "zh",
        themeMode: theme,
        isDarkMode: theme === "dark",
        autoCheckUpdate: false,
      });
      await sendAppCommand(app, { type: "asset:create", asset: "mcp" });
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: "关闭", exact: true }).click();
      await page
        .getByRole("button", { name: /Env Layout/ })
        .first()
        .click();
      for (const width of [1440, 1100, 800]) {
        await page.setViewportSize({ width, height: 900 });
        await checkEnvironmentCards(page);
        await page.screenshot({
          path: test.info().outputPath(`env-${theme}-${width}.png`),
        });
      }
    }
  } finally {
    await closePromptHub(app, userDataDir);
  }
});
