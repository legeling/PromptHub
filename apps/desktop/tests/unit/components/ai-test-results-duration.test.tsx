import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AiTestResults } from "../../../src/renderer/components/prompt/AiTestResults";
import { ToastProvider } from "../../../src/renderer/components/ui/Toast";
import { renderWithI18n } from "../../helpers/i18n";

describe("AI result duration", () => {
  it.each([
    [11758, "11.76 s"],
    [20, "0.02 s"],
    [0, "0.00 s"],
  ])("converts %i milliseconds to %s", async (latency, expected) => {
    await renderWithI18n(
      <ToastProvider>
        <AiTestResults
          results={[
            { model: "model-a", provider: "openai", success: true, latency },
          ]}
          renderContent={(text) => text}
        />
      </ToastProvider>,
      { language: "en" },
    );
    expect(screen.getByText(expected)).toBeInTheDocument();
  });
});
