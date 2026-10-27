import http from "node:http";
import { execFile } from "node:child_process";
import path from "node:path";

export const PROVIDER_REPLY = "PROMPTHUB_PROVIDER_NATIVE_OK";
export const PROVIDER_SECRET = "synthetic-native-test-only";
export const PROVIDER_PROCESS_TIMEOUT_MS = 45_000;
const MAX_OUTPUT_BYTES = 262_144;

interface Request {
  path: string;
  model: unknown;
  authenticated: boolean;
  body: unknown;
}

function respond(res: http.ServerResponse, url: string, model: unknown): void {
  res.setHeader("Content-Type", "text/event-stream");
  if (url.includes(":streamGenerateContent")) {
    res.write(
      `data: ${JSON.stringify({
        candidates: [
          {
            content: { role: "model", parts: [{ text: PROVIDER_REPLY }] },
            finishReason: "STOP",
            index: 0,
          },
        ],
        usageMetadata: {
          promptTokenCount: 1,
          candidatesTokenCount: 1,
          totalTokenCount: 2,
        },
        modelVersion: model,
      })}\n\n`,
    );
  } else if (url.endsWith("/responses")) {
    const item = {
      id: "msg_fixture",
      type: "message",
      status: "completed",
      role: "assistant",
      content: [{ type: "output_text", text: PROVIDER_REPLY, annotations: [] }],
    };
    const response = {
      id: "resp_fixture",
      object: "response",
      created_at: 1,
      status: "completed",
      model,
      output: [item],
      usage: {
        input_tokens: 1,
        output_tokens: 1,
        total_tokens: 2,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens_details: { reasoning_tokens: 0 },
      },
    };
    const events = [
      {
        type: "response.created",
        response: { ...response, status: "in_progress", output: [] },
      },
      {
        type: "response.output_item.added",
        output_index: 0,
        item: { ...item, status: "in_progress", content: [] },
      },
      {
        type: "response.content_part.added",
        item_id: item.id,
        output_index: 0,
        content_index: 0,
        part: { type: "output_text", text: "", annotations: [] },
      },
      {
        type: "response.output_text.delta",
        item_id: item.id,
        output_index: 0,
        content_index: 0,
        delta: PROVIDER_REPLY,
      },
      {
        type: "response.output_text.done",
        item_id: item.id,
        output_index: 0,
        content_index: 0,
        text: PROVIDER_REPLY,
      },
      {
        type: "response.content_part.done",
        item_id: item.id,
        output_index: 0,
        content_index: 0,
        part: item.content[0],
      },
      { type: "response.output_item.done", output_index: 0, item },
      { type: "response.completed", response },
    ];
    events.forEach((event, sequence_number) =>
      res.write(
        `event: ${event.type}\ndata: ${JSON.stringify({ ...event, sequence_number })}\n\n`,
      ),
    );
  } else {
    for (const delta of [{ role: "assistant", content: PROVIDER_REPLY }, {}]) {
      res.write(
        `data: ${JSON.stringify({ id: "chat_fixture", object: "chat.completion.chunk", created: 1, model, choices: [{ index: 0, delta, finish_reason: "role" in delta ? null : "stop" }] })}\n\n`,
      );
    }
    res.write("data: [DONE]\n\n");
  }
  res.end();
}

export async function createOpenAINativeGateway(): Promise<{
  endpoint: string;
  requests: Request[];
  close: () => Promise<void>;
}> {
  const requests: Request[] = [];
  const server = http.createServer(async (req, res) => {
    try {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const body: unknown = JSON.parse(raw);
      const model =
        body && typeof body === "object" && "model" in body
          ? body.model
          : (/\/models\/([^:]+):streamGenerateContent/.exec(
              req.url ?? "",
            )?.[1] ?? null);
      requests.push({
        body,
        path: req.url ?? "",
        model,
        authenticated:
          req.headers.authorization === `Bearer ${PROVIDER_SECRET}` ||
          req.headers["x-goog-api-key"] === PROVIDER_SECRET,
      });
      respond(res, req.url ?? "", model);
    } catch {
      res.writeHead(400).end("Invalid fixture request");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing fixture port");
  return {
    endpoint: `http://127.0.0.1:${address.port}/v1`,
    requests,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

export function runNativeProvider(
  executable: string,
  args: string[],
  home: string,
  config: string,
): Promise<{
  exitCode: string | number;
  stdout: string;
  stderr: string;
  killed: boolean;
}> {
  return new Promise((resolve) => {
    const child = execFile(
      executable,
      args,
      {
        cwd: path.join(home, "project"),
        timeout: PROVIDER_PROCESS_TIMEOUT_MS,
        maxBuffer: MAX_OUTPUT_BYTES,
        env: {
          PATH: process.env.PATH,
          LANG: "en_US.UTF-8",
          TERM: "dumb",
          HOME: home,
          CFFIXED_USER_HOME: home,
          XDG_CONFIG_HOME: path.join(home, ".config"),
          XDG_DATA_HOME: path.join(home, ".local/share"),
          XDG_CACHE_HOME: path.join(home, ".cache"),
          CODEX_HOME: config,
          PI_CODING_AGENT_DIR: config,
        },
      },
      (error, stdout, stderr) =>
        resolve({
          exitCode: error?.code ?? 0,
          stdout,
          stderr,
          killed: error?.killed ?? false,
        }),
    );
    child.stdin?.end();
  });
}
