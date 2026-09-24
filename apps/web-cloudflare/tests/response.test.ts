import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { ErrorCode, HttpError, readJson } from "../src/response";

function createReaderApp(maxBytes: number) {
  const app = new Hono();
  app.post("/read", async (c) => c.json(await readJson(c, { maxBytes })));
  app.onError((error, c) => {
    if (error instanceof HttpError) {
      return c.json(
        { error: { code: error.code, message: error.message } },
        error.status as 400 | 413,
      );
    }
    return c.json(
      { error: { code: ErrorCode.INTERNAL_ERROR, message: "unexpected" } },
      500,
    );
  });
  return app;
}

function requestWithStream(
  chunks: Uint8Array[],
  headers: Record<string, string> = {},
  hooks: { onRead?: () => void; onCancel?: () => void } = {},
): Request {
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      hooks.onRead?.();
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(chunks[index]);
      index += 1;
    },
    cancel() {
      hooks.onCancel?.();
    },
  }, { highWaterMark: 0 });
  return new Request("https://example.com/read", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

describe("bounded JSON request reader", () => {
  it("cancels an oversized stream before reading another chunk", async () => {
    const reads: number[] = [];
    let cancelled = false;
    const request = requestWithStream(
      [bytes('{"payload":"too-large"}')],
      {},
      {
        onRead: () => reads.push(1),
        onCancel: () => {
          cancelled = true;
        },
      },
    );

    const response = await createReaderApp(4).request(request);

    expect(response.status).toBe(413);
    expect(cancelled).toBe(true);
    expect(reads).toHaveLength(1);
    expect(request.body?.locked).toBe(false);
  });

  it("accepts a body exactly at the byte limit", async () => {
    const body = '{"ok":true}';
    const response = await createReaderApp(
      new TextEncoder().encode(body).byteLength,
    ).request(requestWithStream([bytes(body)]));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("rejects invalid JSON after bounded UTF-8 decoding", async () => {
    const response = await createReaderApp(32).request(
      requestWithStream([bytes("not-json")]),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: ErrorCode.BAD_REQUEST },
    });
  });

  it("rejects an invalid Content-Length before reading the body", async () => {
    let reads = 0;
    const request = requestWithStream(
      [bytes('{"ok":true}')],
      { "Content-Length": "not-a-number" },
      {
        onRead: () => {
          reads += 1;
        },
      },
    );
    const response = await createReaderApp(32).request(request);

    expect(response.status).toBe(400);
    expect(reads).toBe(0);
    expect(request.bodyUsed).toBe(false);
  });

  it("maps a body stream read failure to a bad request", async () => {
    let reads = 0;
    const body = new ReadableStream<Uint8Array>({
      pull() {
        reads += 1;
        return Promise.reject(new Error("stream failed"));
      },
    }, { highWaterMark: 0 });
    const request = new Request("https://example.com/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    const response = await createReaderApp(32).request(request);

    expect(response.status).toBe(400);
    expect(reads).toBe(1);
    expect(request.body?.locked).toBe(false);
  });
});
