import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StartupErrorPage } from "../../../src/renderer/components/app/StartupErrorPage";
import { formatStartupErrorLog } from "../../../src/renderer/utils/startup-error-log";
import { renderWithI18n } from "../../helpers/i18n";
import { useState } from "react";
import * as indexedDbMigration from "../../../src/renderer/services/migrations/indexeddb";

afterEach(() => vi.restoreAllMocks());

describe("startup error diagnostics", () => {
  it("keeps IndexedDB recovery choices when the startup parent rerenders", async () => {
    const migrate = vi
      .spyOn(indexedDbMigration, "migrateIndexedDbSource")
      .mockResolvedValue({
        status: "conflict",
        review: {
          fingerprint: "review",
          reappeared: false,
          sourceFileCount: 0,
          conflicts: [
            {
              key: "prompt",
              id: "prompt",
              kind: "prompt",
              title: "Conflicting prompt",
              differingFields: ["userPrompt"],
              variants: [
                { source: "database", fields: { userPrompt: "Current" } },
                { source: "indexeddb", fields: { userPrompt: "Historical" } },
              ],
            },
          ],
        },
      });
    const error = new indexedDbMigration.IndexedDbRecoveryRequired();
    function Parent(): JSX.Element {
      const [revision, setRevision] = useState(0);
      return (
        <>
          <button onClick={() => setRevision(revision + 1)}>
            Rerender parent {revision}
          </button>
          <StartupErrorPage error={error} />
        </>
      );
    }
    await renderWithI18n(<Parent />);
    const radio = await screen.findByRole("radio", {
      name: "Historical browser data",
    });
    fireEvent.click(radio);
    fireEvent.click(screen.getByRole("button", { name: "Rerender parent 0" }));
    await screen.findByRole("button", { name: "Rerender parent 1" });
    expect(radio).toBeChecked();
    expect(migrate).toHaveBeenCalledOnce();
  });

  it("retains the failure and stack while redacting credentials and home paths", () => {
    const error = new Error("Unprotected proxy secret in settings");
    error.stack =
      'Error: Unprotected proxy secret in settings\n at hydrate (/Users/example/PromptHub/app.js:12:4)\n password="private value"\n Authorization: Bearer private-token\n https://user:pass@example.test/?token=private-query';
    error.cause = new Error('apiKey: "private key" C:\\Users\\example\\app.js');
    const report = formatStartupErrorLog(error);
    expect(report).toContain("Unprotected proxy secret in settings");
    expect(report).toContain("app.js:12:4");
    expect(report).toContain("Caused by:");
    for (const secret of [
      "private value",
      "private-token",
      "user:pass",
      "private-query",
      "private key",
      "/Users/example",
      "C:\\Users\\example",
    ]) {
      expect(report).not.toContain(secret);
    }
  });

  it("handles missing stacks, string causes and cyclic error causes", () => {
    const error = new Error("Initialization failed");
    error.stack = undefined;
    error.cause = "password=private-secret";
    expect(formatStartupErrorLog(error)).toContain(
      "Error: Initialization failed",
    );
    expect(formatStartupErrorLog(error)).not.toContain("private-secret");
    error.cause = error;
    expect(
      formatStartupErrorLog(error).match(/Initialization failed/g),
    ).toHaveLength(1);
  });

  it("copies visible diagnostics without a data-service call and keeps reload available", async () => {
    let clipboard = "";
    vi.spyOn(navigator.clipboard, "writeText").mockImplementation(
      async (text) => {
        clipboard = text;
      },
    );
    const reload = vi.fn();
    await renderWithI18n(
      <StartupErrorPage
        error={new Error("Unprotected proxy secret in settings")}
        reload={reload}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy error log" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Error log copied"),
    );
    expect(clipboard).toBe(screen.getByTestId("startup-error-log").textContent);
    expect(clipboard).toContain("Unprotected proxy secret in settings");
    expect(clipboard).toContain("PromptHub startup error");
    fireEvent.click(screen.getByRole("button", { name: "Reload PromptHub" }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it("reports copy failure, retains selectable diagnostics, and allows retry", async () => {
    const write = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockRejectedValueOnce(new Error("denied"))
      .mockResolvedValue(undefined);
    await renderWithI18n(
      <StartupErrorPage error={new Error("Settings hydration failed")} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy error log" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Could not copy"),
    );
    expect(screen.getByTestId("startup-error-log")).toHaveTextContent(
      "Settings hydration failed",
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy error log" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Error log copied"),
    );
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("provides Chinese copy and diagnostic labels", async () => {
    await renderWithI18n(
      <StartupErrorPage error={new Error("Startup failed")} />,
      { language: "zh" },
    );
    expect(screen.getByRole("button", { name: "复制错误日志" })).toBeVisible();
    expect(screen.getByText("错误详情")).toBeVisible();
  });
});
