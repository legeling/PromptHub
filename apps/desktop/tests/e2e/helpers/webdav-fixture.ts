import http from "node:http";
import { once } from "node:events";
import { createHash } from "node:crypto";

type StoredObject = { data: string; etag: string };
type WebDAVRequest = { method: string; path: string };

export interface WebDAVFixture {
  url: string;
  objects: Map<string, StoredObject>;
  requests: WebDAVRequest[];
  close(): Promise<void>;
}

async function respond(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  objects: Map<string, StoredObject>,
): Promise<void> {
  const key = request.url ?? "/";
  const prior = objects.get(key);
  if (request.method === "PROPFIND") {
    response.writeHead(key === "/dav" || prior ? 207 : 404).end();
    return;
  }
  if (request.method === "GET") {
    if (prior) response.writeHead(200, { ETag: prior.etag }).end(prior.data);
    else response.writeHead(404).end();
    return;
  }
  if (
    (request.headers["if-none-match"] === "*" && prior) ||
    (request.headers["if-match"] && request.headers["if-match"] !== prior?.etag)
  ) {
    response.writeHead(412).end();
    return;
  }
  if (request.method === "DELETE") {
    objects.delete(key);
    response.writeHead(204).end();
    return;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const data = Buffer.concat(chunks).toString("utf8");
  const etag = `"${createHash("sha256").update(data).digest("hex")}"`;
  objects.set(key, { data, etag });
  response.writeHead(200, { ETag: etag }).end();
}

export async function createWebDAVFixture(): Promise<WebDAVFixture> {
  const objects = new Map<string, StoredObject>();
  const requests: WebDAVRequest[] = [];
  const server = http.createServer((request, response) => {
    requests.push({ method: request.method ?? "", path: request.url ?? "/" });
    void respond(request, response, objects).catch(() =>
      response.writeHead(500).end(),
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing fixture port");
  return {
    url: `http://127.0.0.1:${address.port}/dav`,
    objects,
    requests,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
