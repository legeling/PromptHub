import { test, expect } from "@playwright/test";
import { AUTO_GALLERY_GRID_STYLE } from "../../src/renderer/components/ui/gallery-layout";

test.use({ channel: process.env.PLAYWRIGHT_CHANNEL });

test("automatic galleries fit three cards before falling back at narrow widths", async ({
  page,
}) => {
  await page.setContent('<main id="gallery"></main>');
  await page.locator("#gallery").evaluate((element, columns) => {
    Object.assign(element.style, {
      display: "grid",
      gap: "16px",
      gridTemplateColumns: columns,
    });
    for (let index = 0; index < 8; index++) {
      const card = document.createElement("article");
      card.textContent = `Card ${index + 1}`;
      element.append(card);
    }
  }, AUTO_GALLERY_GRID_STYLE.gridTemplateColumns);

  for (const [width, columns] of [
    [240, 1],
    [500, 2],
    [751, 2],
    [752, 3],
    [864, 3],
    [1280, 5],
  ]) {
    await page.locator("#gallery").evaluate((element, value) => {
      element.style.width = `${value}px`;
    }, width);
    const layout = await page.locator("#gallery").evaluate((element) => ({
      columns: getComputedStyle(element).gridTemplateColumns.split(" ").length,
      overflow: element.scrollWidth > element.clientWidth,
    }));
    expect(layout, `content width ${width}px`).toEqual({
      columns,
      overflow: false,
    });
  }
});
