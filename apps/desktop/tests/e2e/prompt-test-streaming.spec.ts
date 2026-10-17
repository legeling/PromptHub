import { expect, test } from "@playwright/test";
import http from "node:http";
import { once } from "node:events";
import {
  launchPromptHub,
  closePromptHub,
  setAppSettings,
} from "./helpers/electron";

test("AI test streams before completion, compares concurrently, and falls back only when unsupported", async () => {
  test.setTimeout(120000);
  const requests: boolean[] = [];
  let mode: "sse" | "unsupported" = "sse";
  const pending: http.ServerResponse[] = [];
  const server = http.createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const stream = JSON.parse(body).stream === true;
    requests.push(stream);
    if (mode === "unsupported" && stream) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(
        JSON.stringify({ error: { message: "Streaming is not supported" } }),
      );
    } else if (stream) {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write(
        'data: {"choices":[{"delta":{"content":"First streamed words"}}]}\n\n',
      );
      pending.push(response);
    } else {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          choices: [{ message: { content: "Fallback complete answer" } }],
        }),
      );
    }
  });
  const finish = () => {
    for (const response of pending.splice(0))
      response.end(
        'data: {"choices":[{"delta":{"content":" and final words"}}]}\n\ndata: [DONE]\n\n',
      );
  };
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing fixture port");
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
        apiUrl: `http://127.0.0.1:${address.port}/v1`,
        model: id,
        isDefault: id === "model-a",
        chatParams: { stream: false },
      })),
      scenarioModelDefaults: { promptTest: "model-a" },
    });
    const { page } = fixture;
    await page.getByRole("button", { name: "Card View", exact: true }).click();
    await page.getByText("Deploy Checklist", { exact: true }).first().click();
    await page.getByRole("button", { name: "AI Test", exact: true }).click();
    const panel = page.getByRole("dialog", { name: "AI Test", exact: true });
    await panel.getByRole("button", { name: "AI Test", exact: true }).click();
    await expect(
      panel.getByText("First streamed words", { exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByRole("button", { name: "Thinking Process", exact: true }),
    ).toHaveCount(0);
    await expect(
      panel.getByRole("status").filter({ hasText: "Generating..." }),
    ).toBeVisible();
    expect(requests).toEqual([true]);
    await panel.getByRole("tab", { name: "Test history", exact: true }).click();
    await panel.getByRole("tab", { name: "AI Test", exact: true }).click();
    await expect(
      panel.getByText("First streamed words", { exact: true }),
    ).toBeVisible();
    finish();
    await expect(
      panel.getByText("First streamed words and final words", { exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByRole("button", { name: "AI Test", exact: true }),
    ).toBeEnabled();

    await panel
      .getByRole("tab", { name: "Multi-Model Compare", exact: true })
      .click();
    await panel.getByRole("button", { name: "model-a", exact: true }).click();
    await panel.getByRole("button", { name: "model-b", exact: true }).click();
    await panel
      .getByRole("button", { name: "Run Comparison", exact: true })
      .click();
    await expect(
      panel.getByText("First streamed words", { exact: true }),
    ).toHaveCount(2);
    await expect(
      panel.getByRole("button", { name: "Thinking Process", exact: true }),
    ).toHaveCount(0);
    await expect(
      panel.getByRole("status").filter({ hasText: "Generating..." }),
    ).toHaveCount(2);
    expect(requests).toEqual([true, true, true]);
    finish();
    await expect(
      panel.getByText("First streamed words and final words", { exact: true }),
    ).toHaveCount(2);
    await expect(
      panel.getByRole("button", { name: "Run Comparison", exact: true }),
    ).toBeEnabled();

    mode = "unsupported";
    await panel.getByRole("tab", { name: "AI Test", exact: true }).click();
    await panel.getByRole("button", { name: "AI Test", exact: true }).click();
    await expect(
      panel.getByText("Fallback complete answer", { exact: true }),
    ).toBeVisible();
    expect(requests).toEqual([true, true, true, true, false]);
    await panel.getByRole("tab", { name: "Test history", exact: true }).click();
    await expect(panel.getByRole("button", { name: /model-a/ })).toHaveCount(3);
    await panel
      .getByRole("button", { name: /model-a/ })
      .first()
      .click();
    await expect(
      panel
        .getByRole("tabpanel", { name: "Test history", exact: true })
        .getByTestId("ai-test-results")
        .getByText("Fallback complete answer", { exact: true }),
    ).toBeVisible();
  } finally {
    finish();
    await closePromptHub(fixture.app, fixture.userDataDir);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
