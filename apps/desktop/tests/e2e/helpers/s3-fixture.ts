import http from "node:http";
import { once } from "node:events";
import { createHash } from "node:crypto";

/** Controlled S3-compatible object transport. SDK requests are real; AWS credential validation is outside this fixture. */
export async function createS3Fixture(): Promise<{
  endpoint: string;
  close(): Promise<void>;
}> {
  const objects = new Map<string, { data: Buffer; etag: string }>();
  const server = http.createServer((request, response) => {
    void (async () => {
      const key = new URL(request.url ?? "/", "http://fixture").pathname;
      const prior = objects.get(key);
      if (request.method === "GET" || request.method === "HEAD") {
        if (prior)
          response
            .writeHead(200, {
              ETag: prior.etag,
              "Content-Length": prior.data.length,
            })
            .end(request.method === "GET" ? prior.data : undefined);
        else
          response
            .writeHead(404, { "Content-Type": "application/xml" })
            .end("<Error><Code>NoSuchKey</Code></Error>");
        return;
      }
      if (
        (request.headers["if-none-match"] === "*" && prior) ||
        (request.headers["if-match"] &&
          request.headers["if-match"] !== prior?.etag)
      ) {
        response
          .writeHead(412, { "Content-Type": "application/xml" })
          .end("<Error><Code>PreconditionFailed</Code></Error>");
        return;
      }
      if (request.method === "DELETE") {
        objects.delete(key);
        response.writeHead(204).end();
        return;
      }
      if (request.method !== "PUT") {
        response.writeHead(405).end();
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const data = Buffer.concat(chunks);
      const etag = '"' + createHash("sha256").update(data).digest("hex") + '"';
      objects.set(key, { data, etag });
      response.writeHead(200, { ETag: etag }).end();
    })().catch((error) => {
      console.error("S3 fixture failed", error);
      response.writeHead(500).end();
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing S3 fixture port");
  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
