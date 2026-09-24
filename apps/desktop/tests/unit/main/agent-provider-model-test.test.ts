import type { RequestListener } from "node:http";
/**
 * @vitest-environment node
 */
import { EventEmitter, once } from "node:events";
import {
  Agent as HttpAgent,
  createServer,
  request as httpRequest,
  type ClientRequest,
  type IncomingMessage,
  type Server,
} from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import { testOpenAICompatibleProviderModel } from "../../../src/main/services/agent-provider-model-test";

const servers: Server[] = [];

async function listen(
  handler: RequestListener,
): Promise<{ server: Server; endpoint: string }> {
  const server = createServer(handler);
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected a TCP server address");
  }
  return { server, endpoint: `http://127.0.0.1:${address.port}/v1` };
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => {
      server.closeAllConnections?.();
      return new Promise<void>((resolve) => server.close(() => resolve()));
    }),
  );
});

describe("OpenAI-compatible Provider model test", () => {
  it("streams a minimal Responses request and records the first output token", async () => {
    let authorization = "";
    let requestBody = "";
    const { endpoint } = await listen((request, response) => {
      authorization = request.headers.authorization ?? "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => {
        requestBody += chunk;
      });
      request.on("end", () => {
        response.writeHead(200, {
          "Content-Type": "text/event-stream",
        });
        response.write(
          'data: {"type":"response.output_text.delta","delta":"OK"}\n\n',
        );
        response.end("data: [DONE]\n\n");
      });
    });

    const result = await testOpenAICompatibleProviderModel({
      endpoint,
      credential: "main-only-secret",
      model: "gpt-test",
      protocol: "responses",
      signal: new AbortController().signal,
    });

    expect(result).toMatchObject({
      status: "ok",
      endpointOrigin: new URL(endpoint).origin,
      model: "gpt-test",
      retryCount: 0,
      outputPreview: "OK",
    });
    expect(result.firstTokenMs).toEqual(expect.any(Number));
    expect(authorization).toBe("Bearer main-only-secret");
    expect(JSON.parse(requestBody)).toMatchObject({
      model: "gpt-test",
      stream: true,
    });
    expect(JSON.stringify(result)).not.toContain("main-only-secret");
  });

  it("supports Chat Completions streams, usage, terminal buffers, and safe previews", async () => {
    const { endpoint } = await listen((_request, response) => {
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.write(
        [
          "data: null",
          'data: {"choices":null}',
          'data: {"choices":[null]}',
          'data: {"choices":[{"delta":null}]}',
          "",
        ].join("\n"),
      );
      response.write('data: {"choices":[{"delta":{"content":"main-only-');
      response.end(
        'secret\\u0001-OK"}}],"usage":{"prompt_tokens":7,"completion_tokens":2}}',
      );
    });

    const result = await testOpenAICompatibleProviderModel(
      {
        endpoint,
        credential: "main-only-secret",
        model: "chat-model",
        protocol: "chat",
        signal: new AbortController().signal,
      },
      { maxPreviewChars: 16, requestAgent: null },
    );

    expect(result).toMatchObject({
      status: "ok",
      inputTokens: 7,
      outputTokens: 2,
      outputPreview: "[redacted]-OK",
    });
    expect(JSON.stringify(result)).not.toContain("main-only-secret");
    expect(result.outputPreview).not.toMatch(/[\u0000-\u001f\u007f]/);
  });

  it("fails closed before network access for invalid inputs and private targets", async () => {
    const aborted = new AbortController();
    aborted.abort("cancelled");
    await expect(
      testOpenAICompatibleProviderModel({
        endpoint: "https://provider.example/v1",
        credential: "secret",
        model: "model",
        protocol: "responses",
        signal: aborted.signal,
      }),
    ).resolves.toMatchObject({ status: "cancelled", totalMs: 0 });
    await expect(
      testOpenAICompatibleProviderModel({
        endpoint: "https://provider.example/v1",
        credential: null,
        model: "model",
        protocol: "responses",
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ status: "no-credentials", totalMs: 0 });
    for (const input of [
      { endpoint: null, model: "model" },
      { endpoint: "not a URL", model: "model" },
      { endpoint: "https://provider.example/v1", model: null },
    ]) {
      await expect(
        testOpenAICompatibleProviderModel({
          ...input,
          credential: "secret",
          protocol: "responses",
          signal: new AbortController().signal,
        }),
      ).resolves.toMatchObject({ status: "invalid-endpoint" });
    }
    await expect(
      testOpenAICompatibleProviderModel(
        {
          endpoint: "https://provider.example/v1",
          credential: "secret",
          model: "model",
          protocol: "responses",
          signal: new AbortController().signal,
        },
        {
          lookupHost: async () => [{ address: "192.168.1.30", family: 4 }],
        },
      ),
    ).resolves.toMatchObject({ status: "blocked-address" });
    await expect(
      testOpenAICompatibleProviderModel(
        {
          endpoint: "https://provider.example/v1",
          credential: "secret",
          model: "model",
          protocol: "responses",
          signal: new AbortController().signal,
        },
        {
          lookupHost: async () => {
            throw new Error("dns failed");
          },
        },
      ),
    ).resolves.toMatchObject({ status: "network-error" });
  });

  it("classifies authentication, quota, model, and generic HTTP failures", async () => {
    const cases: Array<{
      statusCode: number;
      body: string;
      expected: string;
    }> = [
      { statusCode: 401, body: "bad key", expected: "auth-error" },
      { statusCode: 403, body: "forbidden", expected: "auth-error" },
      { statusCode: 402, body: "payment required", expected: "quota-error" },
      {
        statusCode: 400,
        body: "insufficient_quota",
        expected: "quota-error",
      },
      {
        statusCode: 404,
        body: "configured model does not exist",
        expected: "model-not-found",
      },
      { statusCode: 418, body: "teapot", expected: "http-error" },
    ];
    for (const testCase of cases) {
      const { endpoint } = await listen((_request, response) => {
        response.writeHead(testCase.statusCode);
        response.end(testCase.body);
      });
      await expect(
        testOpenAICompatibleProviderModel(
          {
            endpoint,
            credential: "secret",
            model: "model",
            protocol: "responses",
            signal: new AbortController().signal,
          },
          { maxRetries: 0 },
        ),
      ).resolves.toMatchObject({
        status: testCase.expected,
        errorCode: `http-${testCase.statusCode}`,
      });
    }
  });

  it("retries one bounded transient failure and never retries more than once", async () => {
    let attempts = 0;
    const { endpoint } = await listen((_request, response) => {
      attempts += 1;
      if (attempts === 1) {
        response.writeHead(429);
        response.end("rate limit");
        return;
      }
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.end(
        'data: {"type":"response.output_text.delta","delta":"OK"}\n\n',
      );
    });

    await expect(
      testOpenAICompatibleProviderModel(
        {
          endpoint,
          credential: "secret",
          model: "model",
          protocol: "responses",
          signal: new AbortController().signal,
        },
        { retryDelayMs: 0, maxRetries: 99 },
      ),
    ).resolves.toMatchObject({ status: "ok", retryCount: 1 });
    expect(attempts).toBe(2);

    let unavailableAttempts = 0;
    const unavailable = await listen((_request, response) => {
      unavailableAttempts += 1;
      response.writeHead(503);
      response.end("unavailable");
    });
    await expect(
      testOpenAICompatibleProviderModel(
        {
          endpoint: unavailable.endpoint,
          credential: "secret",
          model: "model",
          protocol: "chat",
          signal: new AbortController().signal,
        },
        { retryDelayMs: 0, maxRetries: 99 },
      ),
    ).resolves.toMatchObject({ status: "http-error", retryCount: 1 });
    expect(unavailableAttempts).toBe(2);

    const abortController = new AbortController();
    const abortDuringRetry = await listen((_request, response) => {
      response.writeHead(503);
      response.end("retry later");
    });
    await expect(
      testOpenAICompatibleProviderModel(
        {
          endpoint: abortDuringRetry.endpoint,
          credential: "secret",
          model: "model",
          protocol: "responses",
          signal: abortController.signal,
        },
        {
          maxRetries: 1,
          get retryDelayMs() {
            abortController.abort("cancelled");
            return 0;
          },
        },
      ),
    ).resolves.toMatchObject({ status: "cancelled", retryCount: 1 });

    const abortDuringDelay = new AbortController();
    let retryDelayRead!: () => void;
    const retryDelayStarted = new Promise<void>((resolve) => {
      retryDelayRead = resolve;
    });
    const delayedRetry = await listen((_request, response) => {
      response.writeHead(503);
      response.end("retry later");
    });
    const delayed = testOpenAICompatibleProviderModel(
      {
        endpoint: delayedRetry.endpoint,
        credential: "secret",
        model: "model",
        protocol: "responses",
        signal: abortDuringDelay.signal,
      },
      {
        get retryDelayMs() {
          retryDelayRead();
          return undefined;
        },
        maxRetries: 1,
      },
    );
    await retryDelayStarted;
    abortDuringDelay.abort("cancelled");
    await expect(delayed).resolves.toMatchObject({
      status: "cancelled",
      retryCount: 1,
    });
  });

  it("enforces header, streamed, and error-body response size limits", async () => {
    const contentLength = await listen((_request, response) => {
      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Content-Length": "512",
      });
      response.end("data: [DONE]\n\n");
    });
    const streamed = await listen((_request, response) => {
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.end(`data: ${"x".repeat(512)}\n\n`);
    });
    const errorBody = await listen((_request, response) => {
      response.writeHead(500);
      response.end("x".repeat(512));
    });
    for (const endpoint of [
      contentLength.endpoint,
      streamed.endpoint,
      errorBody.endpoint,
    ]) {
      await expect(
        testOpenAICompatibleProviderModel(
          {
            endpoint,
            credential: "secret",
            model: "model",
            protocol: "responses",
            signal: new AbortController().signal,
          },
          { maxBytes: 64, maxRetries: 0 },
        ),
      ).resolves.toMatchObject({ status: "response-too-large" });
    }
  });

  it("fails closed when an HTTP or token stream is interrupted", async () => {
    const interruptedHttp = await listen((_request, response) => {
      response.writeHead(500);
      response.flushHeaders();
      response.socket?.destroy();
    });
    await expect(
      testOpenAICompatibleProviderModel(
        {
          endpoint: interruptedHttp.endpoint,
          credential: "secret",
          model: "model",
          protocol: "responses",
          signal: new AbortController().signal,
        },
        { maxRetries: 0 },
      ),
    ).resolves.toMatchObject({ status: "network-error" });

    const interruptedStream = await listen((_request, response) => {
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.write(
        'data: {"type":"response.output_text.delta","delta":"partial"}\n\n',
      );
      response.socket?.destroy();
    });
    await expect(
      testOpenAICompatibleProviderModel(
        {
          endpoint: interruptedStream.endpoint,
          credential: "secret",
          model: "model",
          protocol: "responses",
          signal: new AbortController().signal,
        },
        { maxRetries: 0 },
      ),
    ).resolves.toMatchObject({ status: "network-error" });

    const syntheticResult = (
      statusCode: number | undefined,
      emit: (response: IncomingMessage) => void,
    ) => {
      const syntheticIncoming = Object.assign(new EventEmitter(), {
        statusCode,
        headers: {},
        setEncoding: () => syntheticIncoming,
        resume: () => syntheticIncoming,
        destroy: () => syntheticIncoming,
      }) as unknown as IncomingMessage;
      const syntheticRequest = Object.assign(new EventEmitter(), {
        write: () => true,
        end: () => undefined,
        destroy: () => syntheticRequest,
      }) as unknown as ClientRequest;
      return testOpenAICompatibleProviderModel(
        {
          endpoint: "http://localhost/v1",
          credential: "secret",
          model: "model",
          protocol: "responses",
          signal: new AbortController().signal,
        },
        {
          maxRetries: 0,
          requestAgent: null,
          requestImpl: (_options, listener) => {
            process.nextTick(() => {
              listener(syntheticIncoming);
              emit(syntheticIncoming);
            });
            return syntheticRequest;
          },
        },
      );
    };
    await expect(
      syntheticResult(500, (response) => {
        response.emit("error", new Error("first reset"));
        response.emit("error", new Error("second reset"));
      }),
    ).resolves.toMatchObject({ status: "network-error" });
    await expect(
      syntheticResult(undefined, (response) => response.emit("end")),
    ).resolves.toMatchObject({
      status: "http-error",
      errorCode: "http-0",
    });

    const incoming = Object.assign(new EventEmitter(), {
      statusCode: 200,
      headers: {},
      setEncoding: () => incoming,
      resume: () => incoming,
      destroy: () => incoming,
    }) as unknown as IncomingMessage;
    const request = Object.assign(new EventEmitter(), {
      write: () => true,
      end: () => undefined,
      destroy: () => request,
    }) as unknown as ClientRequest;
    await expect(
      testOpenAICompatibleProviderModel(
        {
          endpoint: "http://localhost/v1",
          credential: "secret",
          model: "model",
          protocol: "responses",
          signal: new AbortController().signal,
        },
        {
          maxRetries: 0,
          requestAgent: null,
          requestImpl: (_options, listener) => {
            process.nextTick(() => {
              listener(incoming);
              incoming.emit(
                "data",
                'data: {"type":"response.output_text.delta","delta":"partial"}\n\n',
              );
              incoming.emit("error", new Error("stream reset"));
            });
            return request;
          },
        },
      ),
    ).resolves.toMatchObject({ status: "network-error" });
  });

  it("distinguishes connect, first-token, total, network, and explicit cancellation", async () => {
    const noHeaders = await listen(() => undefined);
    await expect(
      testOpenAICompatibleProviderModel(
        {
          endpoint: noHeaders.endpoint,
          credential: "secret",
          model: "model",
          protocol: "responses",
          signal: new AbortController().signal,
        },
        { connectTimeoutMs: 10, totalTimeoutMs: 100, maxRetries: 0 },
      ),
    ).resolves.toMatchObject({ status: "connect-timeout" });

    const noToken = await listen((_request, response) => {
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.flushHeaders();
    });
    await expect(
      testOpenAICompatibleProviderModel(
        {
          endpoint: noToken.endpoint,
          credential: "secret",
          model: "model",
          protocol: "responses",
          signal: new AbortController().signal,
        },
        { firstTokenTimeoutMs: 10, totalTimeoutMs: 100, maxRetries: 0 },
      ),
    ).resolves.toMatchObject({ status: "first-token-timeout" });

    const total = await listen(() => undefined);
    await expect(
      testOpenAICompatibleProviderModel(
        {
          endpoint: total.endpoint,
          credential: "secret",
          model: "model",
          protocol: "responses",
          signal: new AbortController().signal,
        },
        {
          connectTimeoutMs: 100,
          firstTokenTimeoutMs: 100,
          totalTimeoutMs: 10,
          maxRetries: 0,
        },
      ),
    ).resolves.toMatchObject({ status: "total-timeout" });

    await expect(
      testOpenAICompatibleProviderModel(
        {
          endpoint: "http://127.0.0.1:1/v1",
          credential: "secret",
          model: "model",
          protocol: "responses",
          signal: new AbortController().signal,
        },
        { retryDelayMs: 0, maxRetries: 0 },
      ),
    ).resolves.toMatchObject({ status: "network-error" });

    const cancelController = new AbortController();
    const cancellable = await listen(() => undefined);
    const running = testOpenAICompatibleProviderModel(
      {
        endpoint: cancellable.endpoint,
        credential: "secret",
        model: "model",
        protocol: "responses",
        signal: cancelController.signal,
      },
      { connectTimeoutMs: 100, totalTimeoutMs: 100, maxRetries: 0 },
    );
    await once(cancellable.server, "request");
    cancelController.abort("cancelled");
    await expect(running).resolves.toMatchObject({ status: "cancelled" });

    const responseController = new AbortController();
    let responseReceived!: () => void;
    const responseReady = new Promise<void>((resolve) => {
      responseReceived = resolve;
    });
    const cancellableResponse = await listen((_request, response) => {
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.flushHeaders();
    });
    const responseRunning = testOpenAICompatibleProviderModel(
      {
        endpoint: cancellableResponse.endpoint,
        credential: "secret",
        model: "model",
        protocol: "responses",
        signal: responseController.signal,
      },
      {
        firstTokenTimeoutMs: 100,
        totalTimeoutMs: 100,
        maxRetries: 0,
        requestImpl: (options, listener) =>
          httpRequest(options, (response) => {
            listener(response);
            responseReceived();
          }),
      },
    );
    await responseReady;
    responseController.abort("cancelled");
    await expect(responseRunning).resolves.toMatchObject({
      status: "cancelled",
    });
  });

  it("rejects malformed streams and supports a validated public proxy boundary", async () => {
    const malformed = await listen((_request, response) => {
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.end("data: not-json\n\ndata: [DONE]\n\n");
    });
    await expect(
      testOpenAICompatibleProviderModel({
        endpoint: malformed.endpoint,
        credential: "secret",
        model: "model",
        protocol: "responses",
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ status: "protocol-error" });

    const ignoredEvents = await listen((_request, response) => {
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.end(
        [
          "event: response",
          "data: null",
          'data: {"response":{"usage":{"input_tokens":"bad","output_tokens":-1}}}',
          'data: {"type":"other","delta":7}',
          'data: {"type":"response.output_text.delta","delta":"   "}',
          "",
        ].join("\n"),
      );
    });
    await expect(
      testOpenAICompatibleProviderModel({
        endpoint: ignoredEvents.endpoint,
        credential: "secret",
        model: "model",
        protocol: "responses",
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({
      status: "ok",
      inputTokens: null,
      outputTokens: null,
      outputPreview: null,
    });

    const local = new URL(
      (
        await listen((_request, response) => {
          response.writeHead(200, { "Content-Type": "text/event-stream" });
          response.end(
            'data: {"type":"response.output_text.delta","delta":"OK"}\n\n',
          );
        })
      ).endpoint,
    );
    const result = await testOpenAICompatibleProviderModel(
      {
        endpoint: "https://provider.example/v1",
        credential: "secret",
        model: "model",
        protocol: "responses",
        signal: new AbortController().signal,
      },
      {
        lookupHost: async () => [{ address: "8.8.8.8", family: 4 }],
        requestAgent: new HttpAgent(),
        requestImpl: (options, listener) =>
          httpRequest(
            {
              ...options,
              protocol: "http:",
              hostname: "127.0.0.1",
              family: 4,
              port: Number(local.port),
              agent: undefined,
            },
            listener,
          ),
      },
    );
    expect(result).toMatchObject({
      status: "ok",
      endpointOrigin: "https://provider.example",
      outputPreview: "OK",
    });

    const loopbackResult = await testOpenAICompatibleProviderModel(
      {
        endpoint: "http://localhost/v1",
        credential: "secret",
        model: "model",
        protocol: "responses",
        signal: new AbortController().signal,
      },
      {
        requestAgent: null,
        requestImpl: (options, listener) =>
          httpRequest(
            {
              ...options,
              hostname: "127.0.0.1",
              port: Number(local.port),
              agent: undefined,
            },
            listener,
          ),
      },
    );
    expect(loopbackResult.status).toBe("ok");
  });
});
