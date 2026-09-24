import type { RequestListener, RequestOptions } from "node:http";
/**
 * @vitest-environment node
 */
import {
  Agent as HttpAgent,
  createServer,
  request as httpRequest,
  type Server,
} from "node:http";
import { EventEmitter, once } from "node:events";
import type { ClientRequest, IncomingMessage } from "node:http";

import { afterEach, describe, expect, it, vi } from "vitest";

import { testOpenAICompatibleProviderConnection } from "../../../src/main/services/agent-provider-connectivity";
import * as networkProxy from "../../../src/main/services/network-proxy";

const servers: Server[] = [];

async function listen(handler: RequestListener): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected a TCP test server");
  }
  return `http://127.0.0.1:${address.port}/v1`;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
});

describe("Agent provider connectivity", () => {
  it("tests the bounded models endpoint without returning the credential", async () => {
    let authorization = "";
    const endpoint = await listen((request, response) => {
      authorization = String(request.headers.authorization ?? "");
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          data: [{ id: "gpt-5.4" }, { id: "gpt-5.4-mini" }],
        }),
      );
    });

    const result = await testOpenAICompatibleProviderConnection({
      endpoint,
      credential: "top-secret-provider-key",
      model: "gpt-5.4",
      protocol: "responses",
    });

    expect(result).toMatchObject({
      status: "ok",
      protocol: "responses",
      model: "gpt-5.4",
      modelCount: 2,
      modelAvailable: true,
      retryCount: 0,
    });
    expect(result.endpointOrigin).toMatch(/^http:\/\/127\.0\.0\.1:/);
    expect(result.totalMs).toBeGreaterThanOrEqual(0);
    expect(authorization).toBe("Bearer top-secret-provider-key");
    expect(JSON.stringify(result)).not.toContain("top-secret-provider-key");
  });

  it("classifies authentication and model availability without response leakage", async () => {
    const authEndpoint = await listen((_request, response) => {
      response.writeHead(401, { "content-type": "application/json" });
      response.end('{"error":"credential top-secret-provider-key rejected"}');
    });
    const modelEndpoint = await listen((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ data: [{ id: "other-model" }] }));
    });

    await expect(
      testOpenAICompatibleProviderConnection({
        endpoint: authEndpoint,
        credential: "top-secret-provider-key",
        model: "gpt-5.4",
        protocol: "chat",
      }),
    ).resolves.toMatchObject({
      status: "auth-error",
      modelCount: null,
      modelAvailable: null,
      errorCode: "http-401",
    });
    await expect(
      testOpenAICompatibleProviderConnection({
        endpoint: modelEndpoint,
        credential: "top-secret-provider-key",
        model: "gpt-5.4",
        protocol: "chat",
      }),
    ).resolves.toMatchObject({
      status: "model-not-found",
      modelCount: 1,
      modelAvailable: false,
    });
  });

  it("enforces timeout and response-size limits", async () => {
    const slowEndpoint = await listen(() => undefined);
    const largeEndpoint = await listen((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ data: [{ id: "x".repeat(512) }] }));
    });

    await expect(
      testOpenAICompatibleProviderConnection(
        {
          endpoint: slowEndpoint,
          credential: "secret",
          model: "gpt-5.4",
          protocol: "responses",
        },
        { timeoutMs: 20 },
      ),
    ).resolves.toMatchObject({ status: "timeout" });
    await expect(
      testOpenAICompatibleProviderConnection(
        {
          endpoint: largeEndpoint,
          credential: "secret",
          model: "gpt-5.4",
          protocol: "responses",
        },
        { maxBytes: 64 },
      ),
    ).resolves.toMatchObject({ status: "response-too-large" });
  });

  it("blocks invalid, credential-bearing, and private network targets", async () => {
    const baseInput = {
      credential: "secret",
      model: "gpt-5.4",
      protocol: "responses" as const,
    };

    await expect(
      testOpenAICompatibleProviderConnection({
        ...baseInput,
        endpoint: "not a URL",
      }),
    ).resolves.toMatchObject({ status: "invalid-endpoint" });
    await expect(
      testOpenAICompatibleProviderConnection({
        ...baseInput,
        endpoint: "file:///tmp/provider",
      }),
    ).resolves.toMatchObject({ status: "invalid-endpoint" });
    await expect(
      testOpenAICompatibleProviderConnection({
        ...baseInput,
        endpoint: "https://user:password@example.com/v1",
      }),
    ).resolves.toMatchObject({ status: "invalid-endpoint" });
    await expect(
      testOpenAICompatibleProviderConnection(
        {
          ...baseInput,
          endpoint: "https://provider.example/v1",
        },
        {
          lookupHost: async () => [{ address: "192.168.1.20", family: 4 }],
        },
      ),
    ).resolves.toMatchObject({ status: "blocked-address" });
  });

  it("rejects missing credentials before opening a network request", async () => {
    await expect(
      testOpenAICompatibleProviderConnection({
        endpoint: "https://provider.example/v1",
        credential: null,
        model: "gpt-5.4",
        protocol: "chat",
      }),
    ).resolves.toMatchObject({
      status: "no-credentials",
      totalMs: 0,
      modelCount: null,
      modelAvailable: null,
    });
  });

  it("classifies HTTP, protocol, content-length, and network failures", async () => {
    const httpEndpoint = await listen((_request, response) => {
      response.writeHead(500);
      response.end("provider secret should not be returned");
    });
    const protocolEndpoint = await listen((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"unexpected":true}');
    });
    const invalidJsonEndpoint = await listen((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end("{not-json");
    });
    const primitiveJsonEndpoint = await listen((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end("null");
    });
    const lengthEndpoint = await listen((_request, response) => {
      response.writeHead(200, {
        "content-type": "application/json",
        "content-length": "512",
      });
      response.end('{"data":[]}');
    });
    const input = {
      credential: "secret",
      model: "gpt-5.4",
      protocol: "chat" as const,
    };

    await expect(
      testOpenAICompatibleProviderConnection({
        ...input,
        endpoint: httpEndpoint,
      }),
    ).resolves.toMatchObject({
      status: "http-error",
      errorCode: "http-500",
    });
    await expect(
      testOpenAICompatibleProviderConnection({
        ...input,
        endpoint: protocolEndpoint,
      }),
    ).resolves.toMatchObject({ status: "protocol-error" });
    await expect(
      testOpenAICompatibleProviderConnection({
        ...input,
        endpoint: invalidJsonEndpoint,
      }),
    ).resolves.toMatchObject({ status: "protocol-error" });
    await expect(
      testOpenAICompatibleProviderConnection({
        ...input,
        endpoint: primitiveJsonEndpoint,
      }),
    ).resolves.toMatchObject({ status: "protocol-error" });
    await expect(
      testOpenAICompatibleProviderConnection(
        { ...input, endpoint: lengthEndpoint },
        { maxBytes: 64 },
      ),
    ).resolves.toMatchObject({ status: "response-too-large" });
    await expect(
      testOpenAICompatibleProviderConnection({
        ...input,
        endpoint: "http://127.0.0.1:1/v1",
      }),
    ).resolves.toMatchObject({ status: "network-error" });
  });

  it("accepts a public HTTPS target through the validated request boundary", async () => {
    const localEndpoint = new URL(
      await listen((_request, response) => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            data: [null, [], {}, { id: 7 }, { id: "available" }],
          }),
        );
      }),
    );
    const result = await testOpenAICompatibleProviderConnection(
      {
        endpoint: "https://provider.example/v1",
        credential: "secret",
        model: null,
        protocol: "responses",
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
              port: Number(localEndpoint.port),
              agent: undefined,
            },
            listener,
          ),
      },
    );

    expect(result).toMatchObject({
      status: "ok",
      endpointOrigin: "https://provider.example",
      model: null,
      modelCount: 1,
      modelAvailable: null,
    });
  });

  it("applies default HTTP ports and handles the request timeout event", async () => {
    const localEndpoint = new URL(
      await listen((_request, response) => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end('{"data":[]}');
      }),
    );
    const connectLocally = (
      options: RequestOptions,
      listener: (response: IncomingMessage) => void,
    ) =>
      httpRequest(
        {
          ...options,
          hostname: "127.0.0.1",
          port: Number(localEndpoint.port),
          agent: undefined,
        },
        listener,
      );
    await expect(
      testOpenAICompatibleProviderConnection(
        {
          endpoint: "http://localhost/v1",
          credential: "secret",
          model: null,
          protocol: "chat",
        },
        { requestImpl: connectLocally },
      ),
    ).resolves.toMatchObject({ status: "ok" });

    await expect(
      testOpenAICompatibleProviderConnection(
        {
          endpoint: "http://localhost/v1",
          credential: "secret",
          model: null,
          protocol: "chat",
        },
        {
          requestImpl: (options, listener) => {
            const request = connectLocally(options, listener);
            process.nextTick(() => request.emit("timeout"));
            return request;
          },
        },
      ),
    ).resolves.toMatchObject({ status: "timeout" });
  });

  it("covers IPv6 resolution, configured proxy agents, and malformed responses", async () => {
    const localEndpoint = new URL(
      await listen((_request, response) => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end('{"data":[]}');
      }),
    );
    const proxyAgent = new HttpAgent();
    vi.spyOn(networkProxy, "getHttpRequestAgent").mockReturnValue(proxyAgent);
    const connectLocally = (
      options: RequestOptions,
      listener: (response: IncomingMessage) => void,
    ) =>
      httpRequest(
        {
          ...options,
          protocol: "http:",
          hostname: "127.0.0.1",
          family: 4,
          port: Number(localEndpoint.port),
          agent: undefined,
        },
        listener,
      );
    await expect(
      testOpenAICompatibleProviderConnection(
        {
          endpoint: "https://8.8.8.8/v1",
          credential: "secret",
          model: null,
          protocol: "chat",
        },
        { requestImpl: connectLocally },
      ),
    ).resolves.toMatchObject({ status: "ok" });
    await expect(
      testOpenAICompatibleProviderConnection(
        {
          endpoint: "https://provider.example/v1",
          credential: "secret",
          model: null,
          protocol: "chat",
        },
        {
          lookupHost: async () => [
            { address: "2606:4700:4700::1111", family: 6 },
          ],
          requestAgent: null,
          requestImpl: connectLocally,
        },
      ),
    ).resolves.toMatchObject({ status: "ok" });
    await expect(
      testOpenAICompatibleProviderConnection({
        endpoint: "http://[::1]:1/v1",
        credential: "secret",
        model: null,
        protocol: "chat",
      }),
    ).resolves.toMatchObject({ status: "network-error" });

    const malformedRequest = Object.assign(new EventEmitter(), {
      end: vi.fn(),
      destroy: vi.fn(),
    }) as unknown as ClientRequest;
    const malformedResponse = Object.assign(new EventEmitter(), {
      statusCode: undefined,
      headers: {},
      resume: vi.fn(),
    }) as unknown as IncomingMessage;
    await expect(
      testOpenAICompatibleProviderConnection(
        {
          endpoint: "http://localhost/v1",
          credential: "secret",
          model: null,
          protocol: "chat",
        },
        {
          requestImpl: (_options, listener) => {
            process.nextTick(() => listener(malformedResponse));
            return malformedRequest;
          },
        },
      ),
    ).resolves.toMatchObject({
      status: "http-error",
      errorCode: "http-0",
    });
  });

  it("covers endpoint validation and DNS failure categories", async () => {
    const input = {
      credential: "secret",
      model: "gpt-5.4",
      protocol: "responses" as const,
    };
    for (const endpoint of [
      null,
      "https://provider.example/v1?token=secret",
      "https://provider.example/v1#fragment",
      "http://provider.example/v1",
    ]) {
      await expect(
        testOpenAICompatibleProviderConnection({ ...input, endpoint }),
      ).resolves.toMatchObject({ status: "invalid-endpoint" });
    }
    await expect(
      testOpenAICompatibleProviderConnection({
        ...input,
        endpoint: "https://localhost.localdomain/v1",
      }),
    ).resolves.toMatchObject({ status: "blocked-address" });
    await expect(
      testOpenAICompatibleProviderConnection({
        ...input,
        endpoint: "https://192.168.1.20/v1",
      }),
    ).resolves.toMatchObject({ status: "blocked-address" });
    await expect(
      testOpenAICompatibleProviderConnection(
        { ...input, endpoint: "https://provider.example/v1" },
        { lookupHost: async () => [] },
      ),
    ).resolves.toMatchObject({ status: "blocked-address" });
    await expect(
      testOpenAICompatibleProviderConnection(
        { ...input, endpoint: "https://provider.example/v1" },
        {
          lookupHost: async () => {
            throw new Error("dns failure");
          },
        },
      ),
    ).resolves.toMatchObject({ status: "network-error" });
    await expect(
      testOpenAICompatibleProviderConnection({
        ...input,
        endpoint: "https://definitely-missing.prompthub.invalid/v1",
      }),
    ).resolves.toMatchObject({ status: "network-error" });
  });
});
