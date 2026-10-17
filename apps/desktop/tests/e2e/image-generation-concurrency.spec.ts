import {
  expect,
  test,
  type Page,
  type ElectronApplication,
} from "@playwright/test";
import http from "node:http";
import { once } from "node:events";
import {
  launchPromptHub,
  closePromptHub,
  setAppSettings,
} from "./helpers/electron";

async function startProvider() {
  const pending: http.ServerResponse[] = [];
  const server = http.createServer(async (request, response) => {
    for await (const chunk of request) void chunk;
    if (request.url !== "/v1/images/generations") {
      response.writeHead(404).end();
      return;
    }
    pending.push(response);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing provider port");
  return {
    url: `http://127.0.0.1:${address.port}/v1`,
    pending,
    complete(index: number, base64: string) {
      pending[index].writeHead(200, { "content-type": "application/json" });
      pending[index].end(JSON.stringify({ data: [{ b64_json: base64 }] }));
    },
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

async function assertCopiedPixels(
  app: ElectronApplication,
  page: Page,
  base64: string,
): Promise<void> {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Zoom in", exact: true }).click();
  await dialog.getByRole("button", { name: "Copy image", exact: true }).click();
  await expect(page.getByText("Image copied", { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      app.evaluate(({ clipboard, nativeImage }, data) => {
        const expected = nativeImage.createFromBuffer(
          Buffer.from(data, "base64"),
        );
        const actual = clipboard.readImage();
        return (
          !actual.isEmpty() && actual.toBitmap().equals(expected.toBitmap())
        );
      }, base64),
    )
    .toBe(true);
}

test("four provider requests overlap and viewer copies original image pixels", async () => {
  const provider = await startProvider();
  const { app, page, userDataDir } = await launchPromptHub(
    "image-generation-workbench-visual.seed.json",
  );
  const clipboardBackup = await app.evaluate(({ clipboard }) =>
    clipboard.availableFormats().map((format) => ({
      format,
      data: clipboard.readBuffer(format).toString("base64"),
    })),
  );
  try {
    await setAppSettings(page, {
      aiModels: [
        {
          id: "concurrency-model",
          type: "image",
          provider: "openai",
          apiProtocol: "openai",
          apiUrl: provider.url,
          apiKey: "fixture-only-key",
          model: "gpt-image-1",
          name: "Local image provider",
        },
      ],
    });
    const images = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 40;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Cannot prepare image fixture");
      context.fillStyle = "#427ba5";
      context.fillRect(0, 0, 64, 40);
      return {
        png: canvas.toDataURL("image/png").split(",")[1],
        jpeg: canvas.toDataURL("image/jpeg").split(",")[1],
      };
    });
    await page
      .getByRole("button", { name: "Image Workbench", exact: true })
      .click();
    await page
      .getByPlaceholder(
        "Enter an image Prompt or reuse an existing image Prompt",
      )
      .fill("Concurrent images");
    await page.getByRole("spinbutton", { name: "Image count" }).fill("4");
    await page.getByRole("button", { name: "Generate", exact: true }).click();
    await expect.poll(() => provider.pending.length).toBe(4);
    const readBatch = () =>
      page.evaluate(async () => (await window.api.generation.list())[0]);
    await expect.poll(async () => (await readBatch()).counts.running).toBe(4);
    provider.complete(2, images.png);
    await expect.poll(async () => (await readBatch()).counts.succeeded).toBe(1);
    expect((await readBatch()).counts.running).toBe(3);
    await page
      .getByRole("button", { name: "Generated image 3", exact: true })
      .click();
    await assertCopiedPixels(app, page, images.png);
    await page.keyboard.press("Escape");
    provider.complete(1, images.jpeg);
    provider.complete(3, images.png);
    provider.complete(0, images.png);
    await expect.poll(async () => (await readBatch()).counts.succeeded).toBe(4);
    await page
      .getByRole("button", { name: "Generated image 2", exact: true })
      .click();
    // A thumbnail focuses an output; the second click opens its large preview.
    if ((await page.getByRole("dialog").count()) === 0)
      await page
        .getByRole("button", { name: "Generated image 2", exact: true })
        .click();
    await assertCopiedPixels(app, page, images.jpeg);
    await page.keyboard.press("Escape");
  } finally {
    await app.evaluate(({ clipboard }, previous) => {
      clipboard.clear();
      for (const item of previous)
        clipboard.writeBuffer(item.format, Buffer.from(item.data, "base64"));
    }, clipboardBackup);
    await closePromptHub(app, userDataDir);
    await provider.close();
  }
});
