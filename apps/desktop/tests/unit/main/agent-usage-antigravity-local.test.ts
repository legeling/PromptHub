import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

import { describe, expect, it, vi } from "vitest";

import {
  type AntigravityLocalRequestResult,
  createAntigravityLocalUsageClient,
  getAntigravityHelperBinaryCandidates,
  mapAntigravityLocalUsage,
  mapAntigravityQuotaSummary,
  parseAntigravityHelperReadyPort,
  parseAntigravityProcessList,
  parseLoopbackListeningPorts,
  probeAntigravityBackgroundUsage,
} from "../../../src/main/services/agent-usage-antigravity-local";

const CSRF_TOKEN = "12345678-1234-1234-1234-123456789abc";

function localPayload() {
  return {
    userStatus: {
      userTier: { name: "Pro" },
      planStatus: {
        planInfo: { monthlyPromptCredits: 1_000 },
        availablePromptCredits: 625,
      },
      cascadeModelConfigData: {
        clientModelConfigs: [
          {
            label: "Gemini 3 Pro",
            modelOrAlias: { model: "gemini-3-pro" },
            quotaInfo: {
              remainingFraction: 0.4,
              resetTime: "2027-01-02T00:00:00.000Z",
            },
          },
          {
            label: "Gemini 3 Flash",
            modelOrAlias: { model: "gemini-3-flash" },
            quotaInfo: { remainingFraction: 1 },
          },
        ],
      },
    },
  };
}

function quotaSummaryPayload() {
  return {
    response: {
      groups: [
        {
          displayName: "Gemini Models",
          buckets: [
            {
              bucketId: "gemini-weekly",
              displayName: "Weekly Limit",
              window: "weekly",
              remainingFraction: 0.8,
              resetTime: "2027-01-09T00:00:00.000Z",
            },
            {
              bucketId: "gemini-5h",
              displayName: "Five Hour Limit",
              window: "5h",
              remainingFraction: 0.5,
              resetTime: "2027-01-02T05:00:00.000Z",
            },
          ],
        },
        {
          displayName: "Claude and GPT models",
          buckets: [
            {
              bucketId: "3p-weekly",
              window: "weekly",
              remainingFraction: 1,
            },
            {
              bucketId: "3p-5h",
              window: "5h",
              remainingFraction: 0.25,
            },
          ],
        },
      ],
    },
  };
}

class FakeHelperProcess extends EventEmitter {
  exitCode: number | null = null;
  stdin = { end: vi.fn() };
  stdout = new PassThrough();
  stderr = new PassThrough();
  exitOnTerminate = true;
  kill = vi.fn((signal?: NodeJS.Signals) => {
    if (signal === "SIGTERM" && this.exitOnTerminate) {
      this.exitCode = 0;
      queueMicrotask(() => this.emit("exit", 0));
    }
    return true;
  });
}

describe("Antigravity local usage adapter", () => {
  it("accepts only Antigravity language-server processes with a bounded CSRF token", () => {
    const output = [
      `100 /tmp/language_server_macos --csrf_token ${CSRF_TOKEN}`,
      `101 /Applications/Antigravity.app/Contents/Resources/bin/language_server_macos --app_data_dir antigravity --extension_server_port 43100 --csrf_token ${CSRF_TOKEN}`,
      "102 /Applications/Antigravity.app/Contents/Resources/bin/language_server_macos --app_data_dir antigravity --csrf_token ../../secret",
      `103 /Applications/Other.app/language_server_macos --app_data_dir other --csrf_token ${CSRF_TOKEN}`,
    ].join("\n");

    expect(parseAntigravityProcessList(output)).toEqual([
      {
        pid: 101,
        csrfToken: CSRF_TOKEN,
        extensionPort: 43100,
      },
    ]);
  });

  it("extracts only valid loopback listening ports", () => {
    const output = [
      "language_ 101 user 10u IPv4 0x1 0t0 TCP 127.0.0.1:43101 (LISTEN)",
      "language_ 101 user 11u IPv6 0x2 0t0 TCP [::1]:43102 (LISTEN)",
      "language_ 101 user 12u IPv4 0x3 0t0 TCP *:43103 (LISTEN)",
      "language_ 101 user 13u IPv4 0x4 0t0 TCP 10.0.0.2:43104 (LISTEN)",
    ].join("\n");

    expect(parseLoopbackListeningPorts(output)).toEqual([43101, 43102]);
  });

  it("uses only the installed macOS application as a background helper", () => {
    expect(
      getAntigravityHelperBinaryCandidates("darwin", "/Users/test"),
    ).toEqual([
      "/Applications/Antigravity.app/Contents/Resources/bin/language_server",
      "/Users/test/Applications/Antigravity.app/Contents/Resources/bin/language_server",
    ]);
    expect(getAntigravityHelperBinaryCandidates("linux", "/home/test")).toEqual(
      [],
    );
    expect(
      parseAntigravityHelperReadyPort(
        "listening on secure port at 43100 for HTTPS",
      ),
    ).toBeNull();
    expect(
      parseAntigravityHelperReadyPort(
        [
          "listening on fixed port at 43100 for HTTPS (gRPC)",
          "listening on fixed port at 43101 for HTTP",
        ].join("\n"),
      ),
    ).toBe(43101);
    expect(parseAntigravityHelperReadyPort("listening at 0")).toBeNull();
  });

  it("recognizes the current Antigravity 2.x language-server command without a declared port", () => {
    const output = `63132 /Applications/Antigravity.app/Contents/Resources/bin/language_server --standalone --override_ide_name antigravity --https_server_port 0 --csrf_token ${CSRF_TOKEN} --app_data_dir antigravity --enable_sidecars`;

    expect(parseAntigravityProcessList(output)).toEqual([
      { pid: 63132, csrfToken: CSRF_TOKEN, extensionPort: null },
    ]);
  });

  it("keeps plan identity but ignores legacy credit counters", () => {
    expect(mapAntigravityLocalUsage(localPayload())).toEqual({
      plan: "Pro",
      metrics: [],
    });
  });

  it("maps each Antigravity model group to semantic weekly and five-hour quotas", () => {
    expect(mapAntigravityQuotaSummary(quotaSummaryPayload())).toEqual([
      {
        id: "antigravity:gemini-weekly:weekly",
        label: "Weekly quota",
        scope: { kind: "model-group", id: "group-0", label: "Gemini Models" },
        period: { kind: "calendar", unit: "week" },
        value: { kind: "percentage", remainingPercent: 80 },
        resetsAt: Date.parse("2027-01-09T00:00:00.000Z"),
      },
      {
        id: "antigravity:gemini-5h:5h",
        label: "5-hour window",
        scope: { kind: "model-group", id: "group-0", label: "Gemini Models" },
        period: { kind: "rolling", durationSeconds: 18_000 },
        value: { kind: "percentage", remainingPercent: 50 },
        resetsAt: Date.parse("2027-01-02T05:00:00.000Z"),
      },
      {
        id: "antigravity:3p-weekly:weekly",
        label: "Weekly quota",
        scope: {
          kind: "model-group",
          id: "group-1",
          label: "Claude and GPT models",
        },
        period: { kind: "calendar", unit: "week" },
        value: { kind: "percentage", remainingPercent: 100 },
        resetsAt: null,
      },
      {
        id: "antigravity:3p-5h:5h",
        label: "5-hour window",
        scope: {
          kind: "model-group",
          id: "group-1",
          label: "Claude and GPT models",
        },
        period: { kind: "rolling", durationSeconds: 18_000 },
        value: { kind: "percentage", remainingPercent: 25 },
        resetsAt: null,
      },
    ]);
  });

  it("queries the first responsive loopback port from the running desktop session", async () => {
    const commandRunner = {
      resolve: vi.fn(async (command: string) =>
        command === "ps"
          ? "/bin/ps"
          : command === "lsof"
            ? "/usr/sbin/lsof"
            : null,
      ),
      run: vi.fn(async (command: string) => {
        if (command === "/bin/ps") {
          return {
            stdout: `101 /Applications/Antigravity.app/Contents/Resources/bin/language_server_macos --app_data_dir antigravity --extension_server_port 43100 --csrf_token ${CSRF_TOKEN}`,
            stderr: "",
          };
        }
        return {
          stdout:
            "language_ 101 user 10u IPv4 0x1 0t0 TCP 127.0.0.1:43101 (LISTEN)",
          stderr: "",
        };
      }),
    };
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        kind: "unavailable",
        errorCode: "connection-refused",
      })
      .mockResolvedValueOnce({ kind: "ok", body: localPayload() })
      .mockResolvedValueOnce({ kind: "ok", body: quotaSummaryPayload() });
    const client = createAntigravityLocalUsageClient({
      commandRunner,
      platform: "darwin",
      request,
    });

    const result = await client.getUsage();

    expect(result).toEqual({
      kind: "ok",
      plan: "Pro",
      metrics: expect.arrayContaining([
        expect.objectContaining({
          id: "antigravity:gemini-weekly:weekly",
          scope: expect.objectContaining({ kind: "model-group" }),
        }),
      ]),
    });
    if (result.kind === "ok") {
      expect(result.metrics).toHaveLength(4);
      expect(result.metrics.map((metric) => metric.id)).not.toContain(
        "promptCredits",
      );
    }
    expect(request).toHaveBeenNthCalledWith(1, {
      port: 43100,
      csrfToken: CSRF_TOKEN,
      path: "/exa.language_server_pb.LanguageServerService/GetUserStatus",
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      port: 43101,
      csrfToken: CSRF_TOKEN,
      path: "/exa.language_server_pb.LanguageServerService/GetUserStatus",
    });
    expect(request).toHaveBeenNthCalledWith(3, {
      port: 43101,
      csrfToken: CSRF_TOKEN,
      path: "/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary",
    });
  });

  it("uses a temporary native helper when no trusted desktop process exists", async () => {
    const request = vi.fn();
    const probeBackgroundUsage = vi.fn(async () => ({
      kind: "ok" as const,
      plan: "Pro",
      metrics: mapAntigravityQuotaSummary(quotaSummaryPayload()),
    }));
    const client = createAntigravityLocalUsageClient({
      platform: "darwin",
      commandRunner: {
        resolve: vi.fn(async (command: string) =>
          command === "ps" ? "/bin/ps" : null,
        ),
        run: vi.fn(async () => ({ stdout: "", stderr: "" })),
      },
      request,
      probeBackgroundUsage,
    });

    await expect(client.getUsage()).resolves.toMatchObject({
      kind: "ok",
      plan: "Pro",
      metrics: expect.arrayContaining([
        expect.objectContaining({
          id: "antigravity:gemini-weekly:weekly",
        }),
      ]),
    });
    expect(request).not.toHaveBeenCalled();
    expect(probeBackgroundUsage).toHaveBeenCalledTimes(1);
  });

  it("uses the temporary helper when process discovery is unavailable", async () => {
    const probeBackgroundUsage = vi.fn(async () => ({
      kind: "ok" as const,
      plan: null,
      metrics: mapAntigravityQuotaSummary(quotaSummaryPayload()),
    }));
    const commandRunner = {
      resolve: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce("/bin/ps"),
      run: vi.fn(async () => {
        throw new Error("process list denied");
      }),
    };
    const client = createAntigravityLocalUsageClient({
      platform: "darwin",
      commandRunner,
      probeBackgroundUsage,
    });

    await expect(client.getUsage()).resolves.toMatchObject({ kind: "ok" });
    await expect(client.getUsage()).resolves.toMatchObject({ kind: "ok" });

    expect(probeBackgroundUsage).toHaveBeenCalledTimes(2);
  });

  it("queries quota through a bounded temporary helper and always stops it", async () => {
    const child = new FakeHelperProcess();
    const spawnProcess = vi.fn<
      NonNullable<
        Parameters<typeof probeAntigravityBackgroundUsage>[0]["spawnProcess"]
      >
    >(() => {
      queueMicrotask(() =>
        child.stdout.write("listening on fixed port at 43100 for HTTP\n"),
      );
      return child;
    });
    const request = vi
      .fn()
      .mockResolvedValueOnce({ kind: "ok", body: quotaSummaryPayload() })
      .mockResolvedValueOnce({
        kind: "unavailable",
        errorCode: "connection-refused",
      });

    const result = await probeAntigravityBackgroundUsage({
      platform: "darwin",
      homeDir: "/Users/test",
      fileExists: vi.fn(async (candidate) =>
        candidate.startsWith("/Applications/Antigravity.app"),
      ),
      reservePort: vi.fn(async () => 43100),
      randomToken: () => CSRF_TOKEN,
      resolveAppVersion: vi.fn(async () => "2.3.1"),
      spawnProcess,
      request,
      startupTimeoutMs: 100,
      stopTimeoutMs: 100,
    });

    expect(result).toMatchObject({
      kind: "ok",
      metrics: expect.arrayContaining([
        expect.objectContaining({
          id: "antigravity:gemini-weekly:weekly",
        }),
      ]),
    });
    expect(spawnProcess).toHaveBeenCalledWith(
      "/Applications/Antigravity.app/Contents/Resources/bin/language_server",
      expect.arrayContaining([
        "--standalone",
        "--override_ide_version",
        "2.3.1",
        "--disable_telemetry",
        "--use_ls_chrome_devtools_mcp=false",
        "--http_server_port",
        "43100",
        "--csrf_token",
        CSRF_TOKEN,
        "--app_data_dir",
        "antigravity",
      ]),
    );
    expect(spawnProcess.mock.calls[0]?.[1]).not.toContain("--enable_sidecars");
    expect(request).toHaveBeenNthCalledWith(1, {
      port: 43100,
      csrfToken: CSRF_TOKEN,
      path: "/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary",
    });
    expect(child.stdin.end).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(JSON.stringify(result)).not.toContain(CSRF_TOKEN);
  });

  it("retries the quota request while the background helper is still initializing", async () => {
    const child = new FakeHelperProcess();
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        kind: "unavailable",
        errorCode: "local-session-unavailable",
      })
      .mockResolvedValueOnce({ kind: "ok", body: quotaSummaryPayload() })
      .mockResolvedValueOnce({
        kind: "unavailable",
        errorCode: "connection-refused",
      });
    const result = probeAntigravityBackgroundUsage({
      platform: "darwin",
      fileExists: vi.fn(async () => true),
      reservePort: vi.fn(async () => 43100),
      randomToken: () => CSRF_TOKEN,
      resolveAppVersion: vi.fn(async () => "2.3.1"),
      spawnProcess: vi.fn(() => {
        queueMicrotask(() =>
          child.stdout.write("listening on fixed port at 43100 for HTTP\n"),
        );
        return child;
      }),
      request,
      queryTimeoutMs: 100,
      retryDelayMs: 0,
      startupTimeoutMs: 100,
      stopTimeoutMs: 100,
    });

    await expect(result).resolves.toMatchObject({
      kind: "ok",
      metrics: expect.arrayContaining([
        expect.objectContaining({
          id: "antigravity:gemini-weekly:weekly",
        }),
      ]),
    });
    expect(request).toHaveBeenCalledTimes(3);
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("does not spawn an unverified helper and classifies startup failures", async () => {
    const spawnProcess = vi.fn();
    await expect(
      probeAntigravityBackgroundUsage({
        platform: "linux",
        homeDir: "/home/test",
        spawnProcess,
      }),
    ).resolves.toEqual({ kind: "not-running" });
    expect(spawnProcess).not.toHaveBeenCalled();

    const child = new FakeHelperProcess();
    const failed = probeAntigravityBackgroundUsage({
      platform: "darwin",
      homeDir: "/Users/test",
      fileExists: vi.fn(async () => true),
      reservePort: vi.fn(async () => 43100),
      randomToken: () => CSRF_TOKEN,
      spawnProcess: vi.fn(() => {
        queueMicrotask(() => child.emit("error", new Error("denied")));
        return child;
      }),
      startupTimeoutMs: 100,
      stopTimeoutMs: 100,
    });

    await expect(failed).resolves.toEqual({
      kind: "unavailable",
      errorCode: "background-helper-unavailable",
    });
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("stops the helper when quota retrieval fails", async () => {
    const child = new FakeHelperProcess();
    const result = probeAntigravityBackgroundUsage({
      platform: "darwin",
      fileExists: vi.fn(async () => true),
      reservePort: vi.fn(async () => 43100),
      randomToken: () => CSRF_TOKEN,
      spawnProcess: vi.fn(() => {
        queueMicrotask(() =>
          child.stdout.write("listening on fixed port at 43100 for HTTP\n"),
        );
        return child;
      }),
      request: vi.fn(
        async (): Promise<AntigravityLocalRequestResult> => ({
          kind: "unavailable",
          errorCode: "connection-refused",
        }),
      ),
      queryTimeoutMs: 0,
      startupTimeoutMs: 100,
      stopTimeoutMs: 100,
    });

    await expect(result).resolves.toEqual({
      kind: "unavailable",
      errorCode: "connection-refused",
    });
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("force kills a helper that ignores graceful termination", async () => {
    const child = new FakeHelperProcess();
    child.exitOnTerminate = false;
    const result = probeAntigravityBackgroundUsage({
      platform: "darwin",
      fileExists: vi.fn(async () => true),
      reservePort: vi.fn(async () => 43100),
      randomToken: () => CSRF_TOKEN,
      spawnProcess: vi.fn(() => {
        child.stdin.end.mockImplementationOnce(() => {
          throw new Error("stdin unavailable");
        });
        return child;
      }),
      startupTimeoutMs: 1,
      stopTimeoutMs: 1,
    });

    await expect(result).resolves.toEqual({
      kind: "unavailable",
      errorCode: "background-helper-unavailable",
    });
    expect(child.kill).toHaveBeenNthCalledWith(1, "SIGTERM");
    expect(child.kill).toHaveBeenNthCalledWith(2, "SIGKILL");
  });

  it("never includes the CSRF token in an unavailable result", async () => {
    const client = createAntigravityLocalUsageClient({
      platform: "darwin",
      commandRunner: {
        resolve: vi.fn(async (command: string) =>
          command === "ps" ? "/bin/ps" : null,
        ),
        run: vi.fn(async () => ({
          stdout: `101 /Applications/Antigravity.app/language_server_macos --app_data_dir antigravity --extension_server_port 43100 --csrf_token ${CSRF_TOKEN}`,
          stderr: "",
        })),
      },
      request: vi.fn(
        async (): Promise<AntigravityLocalRequestResult> => ({
          kind: "unavailable",
          errorCode: "connection-refused",
        }),
      ),
    });

    const result = await client.getUsage();

    expect(result).toEqual({
      kind: "unavailable",
      errorCode: "connection-refused",
    });
    expect(JSON.stringify(result)).not.toContain(CSRF_TOKEN);
  });
});
