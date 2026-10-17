import {
  act,
  fireEvent,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiTestDrawer } from "../../../src/renderer/components/prompt/AiTestDrawer";
import { ToastProvider } from "../../../src/renderer/components/ui/Toast";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";
import type { PromptTestRun } from "@prompthub/shared/types/prompt-test-history";

function run(id: string): PromptTestRun {
  return {
    id,
    promptId: "prompt-1",
    promptVersion: 1,
    createdAt: 1720000000000,
    mode: "single",
    systemPrompt: "",
    userPrompt: `Input ${id}`,
    outputFormat: "text",
    attachmentNames: [],
    results: [
      {
        model: id,
        provider: "openai",
        success: true,
        response: `Answer ${id}`,
        thinkingContent: "",
        error: "",
        latency: 20,
      },
    ],
  };
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.click(element);
  });
}
let records: PromptTestRun[];
async function renderHistory(): Promise<void> {
  await act(async () => {
    await renderWithI18n(
      <ToastProvider>
        <AiTestDrawer
          promptId="prompt-1"
          title="Prompt"
          mode="single"
          onMode={vi.fn()}
          onClose={vi.fn()}
          revision={0}
          renderContent={(text) => <p>{text}</p>}
        >
          <p>Current test</p>
        </AiTestDrawer>
      </ToastProvider>,
      { language: "en" },
    );
  });
  await click(screen.getByRole("tab", { name: "Test history" }));
}

describe("history list and detail", () => {
  beforeEach(() => {
    installWindowMocks();
    records = [run("newest"), run("older")];
    vi.mocked(window.api.prompt.testHistory.list).mockImplementation(
      async () => ({
        ok: true,
        data: records.map((item) => ({
          id: item.id,
          createdAt: item.createdAt,
          mode: item.mode,
          models: [item.id],
          resultCount: 1,
          successCount: 1,
        })),
      }),
    );
    vi.mocked(window.api.prompt.testHistory.get).mockImplementation(
      async (_promptId, id) => ({
        ok: true,
        data: records.find((item) => item.id === id) ?? null,
      }),
    );
    vi.mocked(window.api.prompt.testHistory.delete).mockImplementation(
      async (_promptId, id) => {
        records = records.filter((item) => item.id !== id);
        return { ok: true, data: undefined };
      },
    );
  });

  it("shows newest automatically, keeps the list visible and preserves selection on refresh", async () => {
    await renderHistory();
    expect(await screen.findByText("Answer newest")).toBeVisible();
    const list = screen.getByRole("navigation", { name: "Test history" });
    await click(within(list).getByRole("button", { name: /older/ }));
    expect(await screen.findByText("Answer older")).toBeVisible();
    expect(list).toBeVisible();
    expect(within(list).getByRole("button", { name: /older/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled(),
    );
    expect(screen.getByText("Answer older")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Back" }),
    ).not.toBeInTheDocument();
  });

  it("confirms deletion, selects a remaining record and shows empty after deleting the last", async () => {
    await renderHistory();
    await screen.findByText("Answer newest");
    await click(screen.getByRole("button", { name: "Delete record" }));
    await click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Answer newest")).toBeVisible();
    for (const id of ["newest", "older"]) {
      await click(screen.getByRole("button", { name: "Delete record" }));
      await click(screen.getByRole("button", { name: "Delete" }));
      await waitFor(() =>
        expect(screen.queryByText(`Answer ${id}`)).not.toBeInTheDocument(),
      );
      if (id === "newest")
        expect(await screen.findByText("Answer older")).toBeVisible();
    }
    expect(
      await screen.findByText("No tests recorded for this Prompt yet."),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Delete record" }),
    ).not.toBeInTheDocument();
  });

  it("retains the selected response when deletion fails", async () => {
    vi.mocked(window.api.prompt.testHistory.delete).mockResolvedValue({
      ok: false,
      error: "Fixture deletion failure",
    });
    await renderHistory();
    await screen.findByText("Answer newest");
    await click(screen.getByRole("button", { name: "Delete record" }));
    await click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.getByText("Answer newest")).toBeVisible();
    expect(screen.getByRole("button", { name: /older/ })).toBeVisible();
  });

  it("shows an empty state without a delete action for a never-tested prompt", async () => {
    records = [];
    await renderHistory();
    expect(
      await screen.findByText("No tests recorded for this Prompt yet."),
    ).toBeVisible();
    expect(
      screen.getByRole("navigation", { name: "Test history" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Delete record" }),
    ).not.toBeInTheDocument();
  });
});
