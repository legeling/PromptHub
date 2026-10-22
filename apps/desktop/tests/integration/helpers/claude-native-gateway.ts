import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";

const NATIVE_TIMEOUT_MS = 45_000;
const NATIVE_OUTPUT_BYTES = 65_536;
export const NATIVE_REPLY = "PROMPTHUB_NATIVE_GATEWAY_OK";

interface CapturedRequest {
  body: Record<string, unknown>;
  model: unknown;
  apiKey: string | string[] | undefined;
  authorization: string | undefined;
}

function respond(
  res: http.ServerResponse,
  model: unknown,
  stream: unknown,
  tool?: { name: string; input: Record<string, unknown> },
): void {
  const block = tool
    ? { type: "tool_use", id: "tool_fixture", ...tool }
    : { type: "text", text: NATIVE_REPLY };
  const message = {
    id: "msg_fixture",
    type: "message",
    role: "assistant",
    model,
    content: [block],
    stop_reason: tool ? "tool_use" : "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  };
  if (!stream) {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(message));
    return;
  }
  res.setHeader("Content-Type", "text/event-stream");
  for (const event of [
    {
      type: "message_start",
      message: { ...message, content: [], stop_reason: null },
    },
    {
      type: "content_block_start",
      index: 0,
      content_block: tool
        ? { ...block, input: {} }
        : { type: "text", text: "" },
    },
    {
      type: "content_block_delta",
      index: 0,
      delta: tool
        ? { type: "input_json_delta", partial_json: JSON.stringify(tool.input) }
        : { type: "text_delta", text: NATIVE_REPLY },
    },
    { type: "content_block_stop", index: 0 },
    {
      type: "message_delta",
      delta: { stop_reason: message.stop_reason, stop_sequence: null },
      usage: { output_tokens: 1 },
    },
    { type: "message_stop" },
  ])
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  res.end();
}

export async function createClaudeGateway(
  expectedCredential: string,
  chooseTool?: (
    body: Record<string, unknown>,
  ) => { name: string; input: Record<string, unknown> } | undefined,
): Promise<{
  endpoint: string;
  requests: CapturedRequest[];
  close: () => Promise<void>;
}> {
  const requests: CapturedRequest[] = [];
  const server = http.createServer(async (req, res) => {
    try {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      if (req.url?.includes("count_tokens")) {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ input_tokens: 1 }));
        return;
      }
      requests.push({
        body,
        model: body.model,
        apiKey: req.headers["x-api-key"],
        authorization: req.headers.authorization,
      });
      if (
        req.headers["x-api-key"] !== expectedCredential &&
        req.headers.authorization !== `Bearer ${expectedCredential}`
      ) {
        res.writeHead(401, {
          "Content-Type": "application/json",
          "x-should-retry": "false",
        });
        res.end(
          JSON.stringify({
            type: "error",
            error: {
              type: "authentication_error",
              message: "Invalid fixture credential",
            },
          }),
        );
        return;
      }
      respond(res, body.model, body.stream, chooseTool?.(body));
    } catch (error) {
      res.writeHead(400).end(String(error));
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Fixture listener unavailable");
  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    requests,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}

export async function runNativeClaude(
  home: string,
  config: string,
): Promise<string> {
  return runIsolatedClaude(home, config, [
    "-p",
    "Return the supplied marker.",
    "--output-format",
    "json",
    "--tools",
    "",
    "--strict-mcp-config",
    "--mcp-config",
    '{"mcpServers":{}}',
    "--setting-sources",
    "user",
    "--settings",
    '{"disableAllHooks":true}',
    "--no-session-persistence",
  ]);
}

export function isolatedClaudeEnvironment(
  home: string,
  config: string,
): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    HOME: home,
    USERPROFILE: home,
    CLAUDE_CONFIG_DIR: config,
    XDG_CONFIG_HOME: path.join(home, ".config"),
    LANG: "en_US.UTF-8",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    DISABLE_AUTOUPDATER: "1",
  };
}

export async function runIsolatedClaude(
  home: string,
  config: string,
  args: string[],
): Promise<string> {
  const cwd = path.join(home, "project");
  await fs.mkdir(cwd, { recursive: true });
  return new Promise((resolve, reject) => {
    const child = execFile(
      "claude",
      args,
      {
        cwd,
        timeout: NATIVE_TIMEOUT_MS,
        maxBuffer: NATIVE_OUTPUT_BYTES,
        env: isolatedClaudeEnvironment(home, config),
      },
      (error, stdout, stderr) =>
        error
          ? reject(
              new Error(
                `Native Claude failed: ${error.message}\n${stderr}\n${stdout}`,
              ),
            )
          : resolve(stdout),
    );
    child.stdin?.end();
  });
}
