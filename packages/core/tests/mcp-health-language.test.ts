import { expect, it } from "vitest";
import { createMcpHealthResult } from "../src/mcp-health";
it("returns stable health codes and English diagnostics without literal environment credentials", () => {
  const result = createMcpHealthResult({
    id: "fixture",
    name: "fixture",
    displayName: "Fixture",
    transport: "stdio",
    command: "/missing-audit-command",
    env: { TOKEN: "" },
    enabled: true,
    source: { type: "manual" },
    createdAt: 0,
    updatedAt: 0,
  });
  expect(result.issues).toContainEqual({
    code: "COMMAND_NOT_FOUND",
    severity: "error",
    field: "command",
    message: "Command not found: /missing-audit-command",
  });
  expect(
    result.issues.every((issue) => !/[\u3400-\u9fff]/u.test(issue.message)),
  ).toBe(true);
});
