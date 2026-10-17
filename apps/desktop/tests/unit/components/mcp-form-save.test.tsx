import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { McpServerForm } from "../../../src/renderer/components/mcp/McpServerForm";
import { renderWithI18n } from "../../helpers/i18n";

it("blocks repeated form submission, retains failed input and permits retry", async () => {
  let rejectSave: (error: Error) => void = () => {
    throw new Error("Save not started");
  };
  const pending = new Promise<void>((_resolve, reject) => {
    rejectSave = reject;
  });
  const onSave = vi
    .fn()
    .mockReturnValueOnce(pending)
    .mockResolvedValue(undefined);
  await renderWithI18n(
    <McpServerForm
      selectedServer={null}
      distributedTargetCount={0}
      onSave={onSave}
      onDelete={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText("Name", { exact: true }), {
    target: { value: "personal" },
  });
  fireEvent.change(screen.getByLabelText("Command", { exact: true }), {
    target: { value: "node" },
  });
  const form = screen.getByTestId("mcp-server-form");
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  rejectSave(new Error("fixture failure"));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("Could not save MCP"),
  );
  expect(screen.getByLabelText("Name", { exact: true })).toHaveValue(
    "personal",
  );
  expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  fireEvent.submit(form);
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
  );
});
