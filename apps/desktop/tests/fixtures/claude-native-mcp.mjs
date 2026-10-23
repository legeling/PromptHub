import { createInterface } from "node:readline";

// Owned acceptance fixture: only echoes a fixed marker, never reads user data.
const input = createInterface({ input: process.stdin });
for await (const line of input) {
  const message = JSON.parse(line);
  if (message.id === undefined) continue;
  let result;
  if (message.method === "initialize")
    result = {
      protocolVersion: message.params.protocolVersion,
      capabilities: { tools: {} },
      serverInfo: { name: "prompthub-fixture", version: "1.0.0" },
    };
  else if (message.method === "tools/list")
    result = {
      tools: [
        {
          name: "echo",
          description: "Return fixture marker",
          inputSchema: { type: "object", properties: {} },
        },
      ],
    };
  else if (message.method === "tools/call")
    result = { content: [{ type: "text", text: "NATIVE_MCP_RESULT" }] };
  else result = {};
  process.stdout.write(
    JSON.stringify({ jsonrpc: "2.0", id: message.id, result }) + "\n",
  );
}
