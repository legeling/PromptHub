import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SyncReviewHost } from "../../../src/renderer/components/ui/SyncReviewHost";
import {
  presentSyncReview,
  useSyncReviewStore,
} from "../../../src/renderer/stores/sync-review.store";
import { renderWithI18n } from "../../helpers/i18n";

vi.mock("../../../src/renderer/services/renderer-persistence", () => ({
  flushRendererPersistence: vi.fn(async () => {}),
}));
afterEach(() => {
  act(() => useSyncReviewStore.setState({ pending: null, isOpen: false }));
});
it("requires an explicit baseline choice and sends its review token through the bridge", async () => {
  const invoke = vi.fn().mockResolvedValue({
    status: "committed",
    localChanged: false,
    cleanupPending: false,
  });
  window.electron = { ...window.electron, causalSync: invoke };
  await renderWithI18n(<SyncReviewHost />, { language: "en" });
  act(() =>
    presentSyncReview("webdav", {
      status: "baseline-required",
      reason: "unrelated-local-data",
      token: "a".repeat(64),
    }),
  );
  expect((await screen.findByRole("dialog")).textContent).toContain(
    "starting library",
  );
  expect(invoke).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Use remote library as baseline" }),
  );
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith({
      provider: "webdav",
      resolution: { kind: "baseline", choice: "remote", token: "a".repeat(64) },
    }),
  );
  await waitFor(() => expect(useSyncReviewStore.getState().pending).toBeNull());
});
it("retains a dismissed review without repeatedly opening it", async () => {
  await renderWithI18n(<SyncReviewHost />, { language: "en" });
  const review = {
    status: "baseline-required" as const,
    reason: "unrelated-local-data" as const,
    token: "b".repeat(64),
  };
  act(() => presentSyncReview("s3", review));
  await screen.findByRole("dialog");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  act(() => presentSyncReview("s3", review));
  expect(useSyncReviewStore.getState().isOpen).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Review sync conflict" }));
  expect(useSyncReviewStore.getState().isOpen).toBe(true);
});
