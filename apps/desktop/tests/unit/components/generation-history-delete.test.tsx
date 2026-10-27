import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeBatch } from "../../fixtures/generation-workbench";
import { renderWithI18n } from "../../helpers/i18n";
import { ImageGenerationWorkbench } from "../../../src/renderer/components/prompt/ImageGenerationWorkbench";
import { usePromptStore } from "../../../src/renderer/stores/prompt.store";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { useUIStore } from "../../../src/renderer/stores/ui.store";

const runner = vi.hoisted(() => ({
  delete: vi.fn(),
  listeners: [] as Array<(batches: unknown[]) => void>,
}));
const toast = vi.hoisted(() => vi.fn());
vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast: toast }),
}));
// Only the renderer runner is replaced here; registered IPC/storage are tested separately.
vi.mock("../../../src/renderer/services/generation-workbench-runner", () => ({
  loadGenerationBatches: async () => [],
  deleteGenerationBatch: runner.delete,
  getSupportedGenerationAspectRatios: () => ["1:1"],
  subscribeGenerationBatches: (listener: (batches: unknown[]) => void) => {
    runner.listeners.push(listener);
    return () => {
      runner.listeners = runner.listeners.filter((item) => item !== listener);
    };
  },
}));
function emitBatches(batches: unknown[]) {
  act(() => runner.listeners.forEach((listener) => listener(batches)));
}
describe("generation history deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runner.listeners = [];
    runner.delete.mockResolvedValue({ cleanupPending: false });
    usePromptStore.setState({ prompts: [] });
    useSettingsStore.setState({ aiModels: [] });
    useUIStore.setState({
      isSidebarCollapsed: false,
      isWorkbenchSidebarExpanded: false,
    });
  });
  it("offers deletion from failed history and requires confirmation before removing it", async () => {
    const failed = makeBatch({
      status: "failed",
      slots: [{ index: 0, status: "failed" }],
      targetCount: 1,
    });
    await renderWithI18n(<ImageGenerationWorkbench />);
    emitBatches([failed]);
    fireEvent.click(screen.getByRole("button", { name: "History works" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Delete batch: Architecture poster" }),
    );
    const dialog = screen.getByRole("alertdialog");
    expect(runner.delete).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(runner.delete).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Delete batch: Architecture poster" }),
    );
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Delete batch",
      }),
    );
    await waitFor(() => expect(runner.delete).toHaveBeenCalledWith("batch-1"));
    emitBatches([]);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(
      screen.queryByRole("button", {
        name: "Delete batch: Architecture poster",
      }),
    ).toBeNull();
  });

  it("names the output count, preserves history on failure, and lets the user retry", async () => {
    runner.delete.mockRejectedValueOnce(new Error("Disk unavailable"));
    await renderWithI18n(<ImageGenerationWorkbench />);
    emitBatches([makeBatch()]);
    fireEvent.click(screen.getByRole("button", { name: "Workbench actions" }));
    expect(
      screen.getByRole("button", { name: "Delete batch" }),
    ).toHaveAttribute("title", "Delete batch");
    fireEvent.click(screen.getByRole("button", { name: "Delete batch" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("2 generated image(s)");
    expect(dialog).toHaveTextContent(
      "Copies added to Prompts or downloaded elsewhere are kept",
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete batch" }),
    );
    await waitFor(() =>
      expect(within(dialog).getByRole("alert")).toHaveTextContent(
        "Could not delete",
      ),
    );
    expect(
      screen.getByRole("button", { name: "Switch batch" }),
    ).toHaveTextContent("Architecture poster");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete batch" }),
    );
    await waitFor(() => expect(runner.delete).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("disables deletion while work is pending in both history and batch actions", async () => {
    await renderWithI18n(<ImageGenerationWorkbench />);
    emitBatches([
      makeBatch({
        status: "running",
        counts: {
          pending: 1,
          running: 1,
          succeeded: 0,
          failed: 0,
          interrupted: 0,
          cancelled: 0,
          total: 2,
        },
      }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "History works" }));
    expect(
      screen.getByRole("button", { name: "Delete batch: Architecture poster" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Workbench actions" }));
    expect(screen.getByRole("button", { name: "Delete batch" })).toBeDisabled();
    expect(runner.delete).not.toHaveBeenCalled();
  });

  it("reports pending file cleanup without misreporting a committed deletion as failure", async () => {
    runner.delete.mockResolvedValueOnce({ cleanupPending: true });
    await renderWithI18n(<ImageGenerationWorkbench />);
    emitBatches([makeBatch()]);
    fireEvent.click(screen.getByRole("button", { name: "Workbench actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete batch" }));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Delete batch",
      }),
    );
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.stringContaining("cleanup will resume on restart"),
        "warning",
      ),
    );
  });
});
