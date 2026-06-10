import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EndpointFormModal } from "../../../src/renderer/components/settings/ai-workbench/EndpointFormModal";
import type { EndpointDraft } from "../../../src/renderer/components/settings/ai-workbench/types";
import { renderWithI18n } from "../../helpers/i18n";

function createEndpointDraft(): EndpointDraft {
  return {
    key: "",
    name: "",
    provider: "custom",
    apiProtocol: "openai",
    apiKey: "",
    apiUrl: "",
  };
}

describe("EndpointFormModal", () => {
  it("exposes provider type and protocol selects by field labels", async () => {
    const setEndpointDraft = vi.fn();

    await renderWithI18n(
      <EndpointFormModal
        endpointDraft={createEndpointDraft()}
        setEndpointDraft={setEndpointDraft}
        onClose={() => undefined}
        onSave={() => undefined}
      />,
      { language: "en" },
    );

    expect(
      screen.getByRole("button", { name: "Provider Type" }),
    ).toHaveAttribute("aria-haspopup", "listbox");
    expect(screen.getByRole("button", { name: "Protocol" })).toHaveAttribute(
      "aria-haspopup",
      "listbox",
    );

    fireEvent.click(screen.getByRole("button", { name: "Provider Type" }));
    fireEvent.click(await screen.findByRole("option", { name: "Gemini" }));

    expect(setEndpointDraft).toHaveBeenCalled();
  });
});
