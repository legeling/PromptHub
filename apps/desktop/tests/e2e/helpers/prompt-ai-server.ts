import http from "node:http";
import { once } from "node:events";

export const generationRequest =
  "Draft a reusable release checklist for {{project}}.";
export const generatedDraft = {
  title: "Release checklist",
  promptType: "text",
  systemPrompt: "Act as a careful release reviewer.",
  userPrompt:
    "Review {{project}}.\nReturn risks, checks, and a go/no-go decision. 🚀",
  description: "A reusable release review",
  suggestedFolder: null,
  tags: ["release", "review"],
};

interface RequestRecord {
  path: string | undefined;
  body: Record<string, unknown>;
  authenticated: boolean;
}

export async function startPromptAiServer(): Promise<{
  url: string;
  requests: RequestRecord[];
  setReply: (reply: "valid" | "http-error" | "invalid", title?: string) => void;
  close: () => Promise<void>;
}> {
  const requests: RequestRecord[] = [];
  let reply: "valid" | "http-error" | "invalid" = "valid";
  let title = generatedDraft.title;
  const server = http.createServer(async (request, response) => {
    try {
      let raw = "";
      for await (const chunk of request) raw += chunk;
      const body: unknown = JSON.parse(raw);
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new Error("Expected a JSON request object");
      }
      requests.push({
        path: request.url,
        body: { ...body },
        authenticated:
          request.headers.authorization === "Bearer fixture-only-key",
      });
      if (request.url !== "/v1/chat/completions") {
        response.writeHead(404).end();
        return;
      }
      const isGeneration = raw.includes(generationRequest);
      if (isGeneration && reply === "http-error") {
        response.writeHead(401, { "content-type": "application/json" });
        response.end(
          JSON.stringify({ error: { message: "Fixture credential rejected" } }),
        );
        return;
      }
      const content = isGeneration
        ? reply === "invalid"
          ? "This is not a structured prompt draft"
          : JSON.stringify({ ...generatedDraft, title })
        : "Connection verified by local fixture";
      if ("stream" in body && body.stream === true) {
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.end(
          `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`,
        );
      } else {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ choices: [{ message: { content } }] }));
      }
    } catch (error) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { message: String(error) } }));
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing fixture port");
  return {
    url: `http://127.0.0.1:${address.port}/v1`,
    requests,
    setReply: (nextReply, nextTitle = generatedDraft.title) => {
      reply = nextReply;
      title = nextTitle;
    },
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
