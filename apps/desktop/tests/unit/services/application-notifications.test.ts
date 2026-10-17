import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { installWindowMocks } from "../../helpers/window";
import { notifyTaskResult } from "../../../src/renderer/services/application-notifications";

const flush = vi.hoisted(() => vi.fn());
vi.mock("../../../src/renderer/services/renderer-persistence-writes", () => ({
  flushRendererPersistence: flush,
}));
beforeEach(() => flush.mockReset().mockResolvedValue(undefined));
afterEach(() => vi.restoreAllMocks());
it("keeps notification transport failures out of the task result", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const publish = vi.fn(() => {
    throw new Error("preload disconnected");
  });
  installWindowMocks({
    electron: {
      applicationNotifications: {
        publish,
        onFeedback: vi.fn(() => () => undefined),
      },
    },
  });
  expect(() => notifyTaskResult("promptTest", "success")).not.toThrow();
  await waitFor(() =>
    expect(log).toHaveBeenCalledWith(
      "Application notification transport failed:",
      expect.any(Error),
    ),
  );
  expect(publish).toHaveBeenCalledWith(
    expect.objectContaining({ category: "promptTest", outcome: "success" }),
  );
});

it("waits for the latest policy to persist before publishing a completed task", async () => {
  let finish = (): void => undefined;
  flush.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const publish = vi.fn().mockResolvedValue({ success: true, delivery: "off" });
  installWindowMocks({
    electron: {
      applicationNotifications: {
        publish,
        onFeedback: vi.fn(() => () => undefined),
      },
    },
  });
  notifyTaskResult("generation", "success");
  await waitFor(() => expect(flush).toHaveBeenCalledOnce());
  expect(publish).not.toHaveBeenCalled();
  finish();
  await waitFor(() => expect(publish).toHaveBeenCalledOnce());
});

it("does not send with stale preferences when their save fails", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  flush.mockRejectedValueOnce(new Error("settings could not be saved"));
  const publish = vi.fn();
  installWindowMocks({
    electron: {
      applicationNotifications: {
        publish,
        onFeedback: vi.fn(() => () => undefined),
      },
    },
  });
  expect(() => notifyTaskResult("promptTest", "success")).not.toThrow();
  await waitFor(() => expect(log).toHaveBeenCalled());
  expect(publish).not.toHaveBeenCalled();
});
