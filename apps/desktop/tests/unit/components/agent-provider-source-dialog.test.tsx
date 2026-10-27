import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { AgentProviderSourceCandidate } from "@prompthub/shared";
import { AgentProviderSourceDialog } from "../../../src/renderer/components/agent/AgentProviderSourceDialog";
import { renderWithI18n } from "../../helpers/i18n";

const candidates: AgentProviderSourceCandidate[] = [
  {
    source: "prompthub",
    sourceId: "gateway",
    name: "Gateway",
    providerKind: "custom",
    protocol: "anthropic-messages",
    protocols: ["anthropic-messages"],
    endpoint: "https://gateway.example.com",
    credentialReady: true,
    compatible: true,
    incompatibility: null,
    models: [
      {
        id: "selected",
        name: "Selected",
        model: "native-model",
        isDefault: true,
      },
    ],
  },
];

it("preserves an explicitly selected API key instead of the gateway default", async () => {
  const onImport = vi.fn().mockResolvedValue({ id: "profile" });
  const props = {
    isOpen: true,
    platformId: "claude",
    candidates,
    loading: false,
    importing: false,
    onLoad: vi.fn().mockResolvedValue(candidates),
    onImport,
    onClose: vi.fn(),
  };
  const view = await renderWithI18n(<AgentProviderSourceDialog {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Credential type" }));
  fireEvent.click(
    screen.getByRole("option", { name: "API key (ANTHROPIC_API_KEY)" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Import" }));
  await waitFor(() =>
    expect(onImport).toHaveBeenCalledWith({
      platformId: "claude",
      sourceId: "gateway",
      modelId: "selected",
      protocol: "anthropic-messages",
      credentialEnvKey: "ANTHROPIC_API_KEY",
    }),
  );
  view.rerender(<AgentProviderSourceDialog {...props} importing />);
  expect(
    screen.getByRole("button", { name: "Credential type" }),
  ).toBeDisabled();
});

it.each([
  ["https://gateway.example.com", "ANTHROPIC_AUTH_TOKEN"],
  ["https://api.anthropic.com", "ANTHROPIC_API_KEY"],
])(
  "chooses the native default for %s before import",
  async (endpoint, credentialEnvKey) => {
    const onImport = vi.fn().mockResolvedValue({ id: "profile" });
    const sources = [{ ...candidates[0], endpoint }];
    await renderWithI18n(
      <AgentProviderSourceDialog
        isOpen
        platformId="claude"
        candidates={sources}
        loading={false}
        importing={false}
        onLoad={vi.fn().mockResolvedValue(sources)}
        onImport={onImport}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    await waitFor(() =>
      expect(onImport).toHaveBeenCalledWith(
        expect.objectContaining({ credentialEnvKey }),
      ),
    );
  },
);

it("does not send Claude authentication settings for another Agent", async () => {
  const onImport = vi.fn().mockResolvedValue({ id: "profile" });
  await renderWithI18n(
    <AgentProviderSourceDialog
      isOpen
      platformId="qwen"
      candidates={candidates}
      loading={false}
      importing={false}
      onLoad={vi.fn().mockResolvedValue(candidates)}
      onImport={onImport}
      onClose={vi.fn()}
    />,
  );
  expect(screen.queryByRole("button", { name: "Credential type" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Import" }));
  await waitFor(() =>
    expect(onImport).toHaveBeenCalledWith({
      platformId: "qwen",
      sourceId: "gateway",
      modelId: "selected",
      protocol: "anthropic-messages",
    }),
  );
});
