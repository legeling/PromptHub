import { describe, expect, it } from "vitest";
import type { McpServerConfig } from "@prompthub/shared/types/mcp";
import {
  formToDraft,
  emptyMcpForm,
  serverToForm,
} from "../../../src/renderer/components/mcp/mcp-form-utils";

describe("mcp form utils", () => {
  it("preserves whitespace in literal values and positional empty arguments", () => {
    expect(
      formToDraft({
        ...emptyMcpForm,
        command: "node",
        args: " script \n\nend",
        env: "TOKEN= value=1  \nEMPTY=",
      }),
    ).toMatchObject({
      args: [" script ", "", "end"],
      env: { TOKEN: " value=1  ", EMPTY: "" },
    });
  });

  it("only submits changed fields when editing an existing config", () => {
    const server: McpServerConfig = {
      id: "existing",
      name: "existing",
      displayName: "Existing",
      command: "node",
      transport: "stdio",
      args: ["one\ntwo", "", " padded "],
      env: { TOKEN: "[REDACTED]" },
      envRefs: { HOME: "${HOME}" },
      enabled: true,
      source: { type: "manual" },
      createdAt: 1,
      updatedAt: 1,
    };
    expect(formToDraft(serverToForm(server), server)).toEqual({});
    expect(
      formToDraft({ ...serverToForm(server), displayName: "Renamed" }, server),
    ).toEqual({ displayName: "Renamed" });
    expect(
      formToDraft({ ...serverToForm(server), env: "", envRefs: "" }, server),
    ).toEqual({ env: {}, envRefs: {} });
  });
  it("keeps direct values and references in separate editable fields", () => {
    const server: McpServerConfig = {
      id: "mcp_private",
      name: "private-api",
      displayName: "Private API",
      transport: "streamable-http",
      url: "https://example.com/mcp",
      headers: { Authorization: "[REDACTED]" },
      headerRefs: { "X-Workspace": "${WORKSPACE_ID}" },
      env: { API_TOKEN: "[REDACTED]" },
      envRefs: { API_REGION: "${REGION:-local}" },
      enabled: true,
      source: { type: "manual" },
      createdAt: 1,
      updatedAt: 1,
    };

    const form = serverToForm(server);
    expect(form.env).toBe("API_TOKEN=[REDACTED]");
    expect(form.envRefs).toBe("API_REGION=${REGION:-local}");
    expect(form.headers).toBe("Authorization=[REDACTED]");
    expect(form.headerRefs).toBe("X-Workspace=${WORKSPACE_ID}");

    expect(formToDraft(form)).toMatchObject({
      env: { API_TOKEN: "[REDACTED]" },
      envRefs: { API_REGION: "${REGION:-local}" },
      headers: { Authorization: "[REDACTED]" },
      headerRefs: { "X-Workspace": "${WORKSPACE_ID}" },
    });
  });
});
