import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AgentProviderProfileFormDialog } from "../../../src/renderer/components/agent/AgentProviderProfileFormDialog";
import { renderWithI18n } from "../../helpers/i18n";

it("offers only the implemented native model configuration for Antigravity CLI", async () => {
  const onCreate = vi.fn().mockResolvedValue({ id: "created" });
  await renderWithI18n(
    <AgentProviderProfileFormDialog
      isOpen
      platformId="antigravity-cli"
      profile={null}
      busy={false}
      onClose={vi.fn()}
      onCreate={onCreate}
      onUpdate={vi.fn()}
    />,
  );
  expect(screen.queryByLabelText("Credential (write-only)")).toBeNull();
  expect(screen.queryByLabelText("Endpoint (optional)")).toBeNull();
  fireEvent.click(screen.getByLabelText("Protocol"));
  expect(screen.queryByRole("option", { name: "OpenAI Chat" })).toBeNull();
  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: "CLI model" },
  });
  fireEvent.change(screen.getByLabelText("Primary model"), {
    target: { value: "Gemini 4 Argon" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save provider" }));
  await waitFor(() =>
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: expect.objectContaining({
          platformId: "antigravity-cli",
          protocol: "platform-native",
          endpoint: null,
        }),
      }),
    ),
  );
});
