import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type {
  PromptWorkspaceRecoveryApi,
  PromptWorkspaceReview,
} from "@prompthub/shared/types/prompt-workspace-recovery";
import PromptWorkspaceRecovery from "../../../src/renderer/components/app/PromptWorkspaceRecovery";
import { createTestI18n, renderWithI18n } from "../../helpers/i18n";
import en from "../../../src/renderer/i18n/locales/en.json";

const review: PromptWorkspaceReview = {
  fingerprint: "a".repeat(64),
  reappeared: false,
  sourceFileCount: 1,
  conflicts: [
    {
      key: "prompt-1",
      kind: "prompt",
      id: "one",
      title: "My prompt",
      differingFields: ["userPrompt"],
      variants: [
        { source: "database", fields: { userPrompt: "SQL body" } },
        { source: "workspace", fields: { userPrompt: "Historical body" } },
      ],
    },
  ],
};
function api(): PromptWorkspaceRecoveryApi {
  return {
    review: vi.fn().mockResolvedValue({ success: true, review }),
    resolve: vi
      .fn()
      .mockResolvedValue({ success: true, recoveryPath: "/profile/recovery" }),
    openDataDirectory: vi.fn().mockResolvedValue({ success: true }),
    restart: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn().mockResolvedValue(undefined),
  };
}

it.each(["en", "zh", "zh-TW", "ja", "de", "fr", "es"])(
  "provides every recovery message directly in %s",
  async (language) => {
    const i18n = await createTestI18n(language);
    for (const [key, value] of Object.entries(en.startupRecovery)) {
      const keys =
        typeof value === "string"
          ? [key]
          : Object.keys(value).map((child) => `${key}.${child}`);
      for (const item of keys)
        expect(
          i18n.getResource(language, "translation", `startupRecovery.${item}`),
        ).toBeTypeOf("string");
    }
  },
);

it("requires an explicit source and confirmation; cancel never writes", async () => {
  const recovery = api();
  await renderWithI18n(<PromptWorkspaceRecovery api={recovery} />, {
    settleAsyncEffects: true,
  });
  await screen.findByText("My prompt");
  expect(screen.getByText("SQL body")).toBeVisible();
  expect(screen.getByText("Historical body")).toBeVisible();
  expect(
    screen
      .getAllByRole("radio")
      .every((radio) => !radio.hasAttribute("checked")),
  ).toBe(true);
  const apply = screen.getByRole("button", { name: "Review and apply" });
  expect(apply).toBeDisabled();
  fireEvent.click(screen.getByRole("radio", { name: "Historical workspace" }));
  fireEvent.click(apply);
  const dialog = screen.getByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(recovery.resolve).not.toHaveBeenCalled();
  fireEvent.click(apply);
  await act(async () => {
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Apply choices",
      }),
    );
  });
  await screen.findByText("Recovery complete");
  expect(recovery.resolve).toHaveBeenCalledOnce();
  expect(recovery.resolve).toHaveBeenCalledWith({
    fingerprint: review.fingerprint,
    choices: [{ key: "prompt-1", source: "workspace" }],
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Restart PromptHub" }));
  });
  await waitFor(() => expect(recovery.restart).toHaveBeenCalledOnce());
});

it("shows a stale review error and refresh clears previous choices", async () => {
  const recovery = api();
  vi.mocked(recovery.resolve).mockResolvedValue({
    success: false,
    error: "Data changed; refresh review",
  });
  await renderWithI18n(<PromptWorkspaceRecovery api={recovery} />, {
    settleAsyncEffects: true,
  });
  fireEvent.click(
    await screen.findByRole("radio", { name: "Current database" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Review and apply" }));
  await act(async () => {
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Apply choices",
      }),
    );
  });
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Data changed; refresh review",
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Refresh review" }));
  });
  await waitFor(() => expect(recovery.review).toHaveBeenCalledTimes(2));
  expect(
    screen.getByRole("button", { name: "Review and apply" }),
  ).toBeDisabled();
  expect(recovery.restart).not.toHaveBeenCalled();
});

it("renders review failure, directory action, and quit without loading normal business data", async () => {
  const recovery = api();
  vi.mocked(recovery.review).mockResolvedValue({
    success: false,
    error: "Cannot read source",
  });
  await renderWithI18n(<PromptWorkspaceRecovery api={recovery} />, {
    settleAsyncEffects: true,
  });
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Cannot read source",
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Open data folder" }));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Quit" }));
  });
  await waitFor(() => expect(recovery.quit).toHaveBeenCalledOnce());
  expect(recovery.openDataDirectory).toHaveBeenCalledOnce();
  expect(recovery.resolve).not.toHaveBeenCalled();
});

it("requires every conflict choice and supports keyboard cancellation", async () => {
  const recovery = api();
  vi.mocked(recovery.review).mockResolvedValue({
    success: true,
    review: {
      ...review,
      conflicts: [
        ...review.conflicts,
        {
          ...review.conflicts[0],
          key: "prompt-2",
          id: "two",
          title: "Second prompt",
        },
      ],
    },
  });
  await renderWithI18n(<PromptWorkspaceRecovery api={recovery} />, {
    settleAsyncEffects: true,
  });
  fireEvent.click(
    await screen.findByRole("radio", { name: "Current database" }),
  );
  expect(
    screen.getByRole("button", { name: "Review and apply" }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("Second prompt")).toBeVisible();
  fireEvent.click(screen.getByRole("radio", { name: "Historical workspace" }));
  fireEvent.click(screen.getByRole("button", { name: "Review and apply" }));
  const cancel = within(screen.getByRole("alertdialog")).getByRole("button", {
    name: "Cancel",
  });
  await waitFor(() => expect(cancel).toHaveFocus());
  fireEvent.keyDown(cancel, { key: "Escape" });
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(recovery.resolve).not.toHaveBeenCalled();
});
