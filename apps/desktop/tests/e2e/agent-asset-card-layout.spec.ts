import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test, expect, type Locator } from "@playwright/test";
import postcss from "postcss";
import tailwindcss from "tailwindcss";

test.use({ channel: process.env.PLAYWRIGHT_CHANNEL });

async function expectCardContained(card: Locator): Promise<void> {
  const geometry = await card.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const children = [
      ...element.querySelectorAll<HTMLElement>("[data-testid], button, span"),
    ];
    return {
      overflowing: children
        .filter((child) => {
          const rect = child.getBoundingClientRect();
          return rect.left < bounds.left || rect.right > bounds.right;
        })
        .map((child) => child.dataset.testid || child.tagName),
      scrollOverflow: element.scrollWidth > element.clientWidth,
    };
  });
  expect(geometry).toEqual({ overflowing: [], scrollOverflow: false });
  const metadata = await card
    .getByTestId("agent-asset-card-metadata")
    .boundingBox();
  const footer = await card.getByTestId("asset-actions").boundingBox();
  if (!metadata || !footer)
    throw new Error("Asset metadata and footer must have layout boxes");
  expect(metadata.y + metadata.height).toBeLessThanOrEqual(footer.y);
  const source = card.getByTestId("agent-asset-card-source");
  await expect(source).toHaveAttribute("title", await source.innerText());
}

async function fixtureDocument(): Promise<string> {
  const desktopRoot = path.resolve(__dirname, "../..");
  // Separate JSX compilation from Playwright's component-test JSX transform.
  const markup = execFileSync(
    process.execPath,
    ["--import", "tsx", "tests/fixtures/agent-asset-layout.tsx"],
    {
      cwd: desktopRoot,
      encoding: "utf8",
      timeout: 15_000,
      maxBuffer: 1024 * 1024,
    },
  );
  const cssFile = path.join(desktopRoot, "src/renderer/styles/globals.css");
  const css = await postcss([
    tailwindcss({
      config: path.join(desktopRoot, "tailwind.config.js"),
      content: [{ raw: markup, extension: "html" }],
    }),
  ]).process(await readFile(cssFile, "utf8"), { from: cssFile });
  return `<style>${css.css}</style><main>${markup}</main>`;
}

// Production React + Tailwind geometry only; not Electron/preload/IPC acceptance.
test("asset paths, management badges and all metadata stay inside narrow cards", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.setContent(await fixtureDocument());
  for (const theme of ["light", "dark"]) {
    await page.locator("html").evaluate((element, value) => {
      element.setAttribute("class", value);
    }, theme);
    for (const width of [640, 1100, 832]) {
      await page.locator("main").evaluate((element, value) => {
        element.style.width = `${value}px`;
      }, width);
      for (const card of await page.getByTestId("asset-card").all())
        await expectCardContained(card);
      const listOverflows = await page
        .getByTestId("asset-list")
        .evaluate((element) => element.scrollWidth > element.clientWidth);
      expect(listOverflows, `${theme} at ${width}px`).toBe(false);
    }
    await page.screenshot({
      path: testInfo.outputPath(`asset-cards-${theme}.png`),
    });
  }
  if (process.env.PROMPTHUB_LAYOUT_MUTATION === "1") {
    await page.getByTestId("asset-card").evaluateAll((cards) => {
      for (const card of cards) {
        card.classList.remove("min-w-0");
        card.querySelector("button")?.classList.remove("w-full");
        card
          .querySelector('[data-testid="agent-asset-card-content"]')
          ?.classList.remove("w-full");
        const metadata = card.querySelector(
          '[data-testid="agent-asset-card-metadata"]',
        );
        metadata?.setAttribute(
          "class",
          "mt-2 flex flex-wrap content-start items-start gap-1.5",
        );
      }
    });
    await expectCardContained(page.getByTestId("asset-card").first());
  }
});
