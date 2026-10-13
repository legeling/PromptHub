import { render, screen } from "@testing-library/react";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { expect, it, vi } from "vitest";
import { McpFullDetailPage } from "../../../src/renderer/components/mcp/McpFullDetailPage";
import en from "../../../src/renderer/i18n/locales/en.json";
import type { McpServerConfig } from "@prompthub/shared/types/mcp";
it("translates structured MCP health issues rather than displaying backend diagnostic text", async () => {
  const i18n = createInstance();
  await i18n.init({ lng: "en", resources: { en: { translation: en } } });
  const server: McpServerConfig = {
    id: "saved",
    name: "saved",
    displayName: "Saved MCP",
    transport: "stdio",
    command: "missing-fixture",
    enabled: true,
    source: { type: "manual" },
    createdAt: 0,
    updatedAt: 0,
  };
  render(
    <I18nextProvider i18n={i18n}>
      <McpFullDetailPage
        server={server}
        onCheckTargetSync={vi.fn()}
        onSyncTargets={vi.fn()}
        targetSyncChecks={[]}
        distributedTargetCount={0}
        platformPanel={null}
        onBack={vi.fn()}
        onDelete={vi.fn()}
        onSave={vi.fn()}
        onCheckServer={vi.fn()}
        onImportEnv={vi.fn()}
        healthCheck={{
          serverId: server.id,
          serverName: server.name,
          status: "error",
          checkedAt: new Date(0).toISOString(),
          issues: [
            {
              code: "COMMAND_NOT_FOUND",
              severity: "error",
              message: "legacy diagnostic",
            },
          ],
        }}
      />
    </I18nextProvider>,
  );
  expect(
    screen.getByText("Command not found: missing-fixture"),
  ).toBeInTheDocument();
  expect(screen.queryByText("legacy diagnostic")).not.toBeInTheDocument();
});
