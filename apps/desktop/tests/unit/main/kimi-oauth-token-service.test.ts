/**
 * @vitest-environment node
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createKimiOAuthTokenService } from "../../../src/main/services/kimi-oauth-token-service";

const NOW = 1_800_000_000_000;
const OLD_ACCESS = "kimi-old-access-token";
const OLD_REFRESH = "kimi-old-refresh-token";
const NEW_ACCESS = "kimi-new-access-token";
const NEW_REFRESH = "kimi-new-refresh-token";

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function token(overrides: Record<string, unknown> = {}): string {
  return `${JSON.stringify(
    {
      access_token: OLD_ACCESS,
      refresh_token: OLD_REFRESH,
      expires_at: NOW / 1000 - 1,
      expires_in: 900,
      scope: "kimi-code",
      token_type: "Bearer",
      future_field: { keep: true },
      ...overrides,
    },
    null,
    2,
  )}\n`;
}

async function createRoot(raw = token()): Promise<string> {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "prompthub-kimi-token-"),
  );
  roots.push(root);
  await fs.mkdir(path.join(root, "credentials"), { recursive: true });
  await fs.writeFile(path.join(root, "credentials", "kimi-code.json"), raw, {
    mode: 0o600,
  });
  return root;
}

const roots: string[] = [];

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("Kimi OAuth token service", () => {
  it("refreshes an expired current credential through the official contract", async () => {
    const root = await createRoot();
    const fetchImpl = vi.fn().mockResolvedValue(
      response(200, {
        access_token: NEW_ACCESS,
        refresh_token: NEW_REFRESH,
        expires_in: 900,
        scope: "kimi-code",
        token_type: "Bearer",
      }),
    );
    const service = createKimiOAuthTokenService({
      fetchImpl: fetchImpl as typeof fetch,
      now: () => NOW,
      sleep: async () => undefined,
    });

    await expect(service.getAccessToken(root)).resolves.toEqual({
      kind: "ok",
      accessToken: NEW_ACCESS,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://auth.kimi.com/api/oauth/token",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/x-www-form-urlencoded",
        }),
        body: expect.any(String),
      }),
    );
    const body = new URLSearchParams(fetchImpl.mock.calls[0][1].body);
    expect(Object.fromEntries(body)).toEqual({
      client_id: "17e5f671-d194-4dfb-9706-5516cb48c098",
      grant_type: "refresh_token",
      refresh_token: OLD_REFRESH,
    });

    const persisted = JSON.parse(
      await fs.readFile(
        path.join(root, "credentials", "kimi-code.json"),
        "utf8",
      ),
    );
    expect(persisted).toMatchObject({
      access_token: NEW_ACCESS,
      refresh_token: NEW_REFRESH,
      expires_at: NOW / 1000 + 900,
      expires_in: 900,
      future_field: { keep: true },
    });
    expect(
      (await fs.stat(path.join(root, "credentials", "kimi-code.json"))).mode &
        0o777,
    ).toBe(0o600);
    await expect(
      fs.access(path.join(root, "oauth", "kimi-code.lock")),
    ).rejects.toThrow();
  });

  it("uses a fresh token without touching the network or file", async () => {
    const raw = token({ expires_at: NOW / 1000 + 3600 });
    const root = await createRoot(raw);
    const fetchImpl = vi.fn();
    const service = createKimiOAuthTokenService({
      fetchImpl: fetchImpl as typeof fetch,
      now: () => NOW,
    });

    await expect(service.getAccessToken(root)).resolves.toEqual({
      kind: "ok",
      accessToken: OLD_ACCESS,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(
      await fs.readFile(
        path.join(root, "credentials", "kimi-code.json"),
        "utf8",
      ),
    ).toBe(raw);
  });

  it.each([
    [NOW + 3_600_000],
    [String(NOW / 1000 + 3600)],
    [String(NOW + 3_600_000)],
    [new Date(NOW + 3_600_000).toISOString()],
    ["not-a-date"],
  ])("accepts supported expiry encoding %s", async (expiresAt) => {
    const root = await createRoot(token({ expires_at: expiresAt }));
    const fetchImpl = vi.fn();
    const service = createKimiOAuthTokenService({
      fetchImpl: fetchImpl as typeof fetch,
      now: () => NOW,
    });

    await expect(service.getAccessToken(root)).resolves.toEqual({
      kind: "ok",
      accessToken: OLD_ACCESS,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses the production defaults for a non-expiring credential", async () => {
    const root = await createRoot(
      token({ expires_at: null, expires_in: "invalid", refresh_token: null }),
    );

    await expect(
      createKimiOAuthTokenService().getAccessToken(root),
    ).resolves.toEqual({ kind: "ok", accessToken: OLD_ACCESS });
  });

  it.each([
    ["missing", null],
    ["malformed", "{"],
    ["array", "[]"],
    ["missing access token", JSON.stringify({ refresh_token: OLD_REFRESH })],
  ])("returns no credentials for %s input", async (_label, raw) => {
    const root =
      raw === null
        ? await fs.mkdtemp(path.join(os.tmpdir(), "prompthub-kimi-token-"))
        : await createRoot(raw);
    if (raw === null) roots.push(root);
    const service = createKimiOAuthTokenService({ now: () => NOW });

    await expect(service.getAccessToken(root)).resolves.toEqual({
      kind: "no-credentials",
    });
  });

  it("treats an expired credential without a refresh token as expired", async () => {
    const root = await createRoot(token({ refresh_token: "" }));

    await expect(
      createKimiOAuthTokenService({ now: () => NOW }).getAccessToken(root),
    ).resolves.toEqual({ kind: "expired" });
  });

  it("forces renewal after the usage endpoint rejects a fresh access token", async () => {
    const root = await createRoot(token({ expires_at: NOW / 1000 + 3600 }));
    const fetchImpl = vi.fn().mockResolvedValue(
      response(200, {
        access_token: NEW_ACCESS,
        refresh_token: NEW_REFRESH,
        expires_in: 900,
      }),
    );
    const service = createKimiOAuthTokenService({
      fetchImpl: fetchImpl as typeof fetch,
      now: () => NOW,
      sleep: async () => undefined,
    });

    await expect(
      service.getAccessToken(root, { forceRefresh: true }),
    ).resolves.toEqual({ kind: "ok", accessToken: NEW_ACCESS });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("coalesces concurrent refreshes in one process", async () => {
    const root = await createRoot();
    let release: ((value: Response) => void) | undefined;
    let signalStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    const fetchImpl = vi.fn(() => {
      signalStarted?.();
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    });
    const service = createKimiOAuthTokenService({
      fetchImpl: fetchImpl as typeof fetch,
      now: () => NOW,
      sleep: async () => undefined,
    });

    const first = service.getAccessToken(root);
    const second = service.getAccessToken(root);
    await started;
    expect(release).toBeTypeOf("function");
    release?.(
      response(200, {
        access_token: NEW_ACCESS,
        refresh_token: NEW_REFRESH,
        expires_in: 900,
      }),
    );

    await expect(Promise.all([first, second])).resolves.toEqual([
      { kind: "ok", accessToken: NEW_ACCESS },
      { kind: "ok", accessToken: NEW_ACCESS },
    ]);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("re-reads credentials after a competing process releases the native lock", async () => {
    const root = await createRoot();
    const lockPath = path.join(root, "oauth", "kimi-code.lock");
    await fs.mkdir(lockPath, { recursive: true });
    const fetchImpl = vi.fn();
    const sleep = vi.fn(async () => {
      await fs.writeFile(
        path.join(root, "credentials", "kimi-code.json"),
        token({ access_token: NEW_ACCESS, expires_at: NOW / 1000 + 3600 }),
      );
      await fs.rmdir(lockPath);
    });
    const service = createKimiOAuthTokenService({
      fetchImpl: fetchImpl as typeof fetch,
      now: () => NOW,
      sleep,
    });

    await expect(service.getAccessToken(root)).resolves.toEqual({
      kind: "ok",
      accessToken: NEW_ACCESS,
    });
    expect(sleep).toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    [401, { error: "invalid_grant" }, "expired"],
    [400, { error: "invalid_request" }, "unavailable"],
  ] as const)(
    "maps refresh HTTP %i without changing the credential",
    async (status, body, expectedKind) => {
      const raw = token();
      const root = await createRoot(raw);
      const service = createKimiOAuthTokenService({
        fetchImpl: vi
          .fn()
          .mockResolvedValue(response(status, body)) as typeof fetch,
        now: () => NOW,
        sleep: async () => undefined,
      });

      await expect(service.getAccessToken(root)).resolves.toMatchObject({
        kind: expectedKind,
      });
      expect(
        await fs.readFile(
          path.join(root, "credentials", "kimi-code.json"),
          "utf8",
        ),
      ).toBe(raw);
    },
  );

  it("bounds lock waiting and transport retries", async () => {
    const lockedRoot = await createRoot();
    await fs.mkdir(path.join(lockedRoot, "oauth", "kimi-code.lock"), {
      recursive: true,
    });
    const locked = createKimiOAuthTokenService({
      fetchImpl: vi.fn() as unknown as typeof fetch,
      lockAttempts: 2,
      now: () => NOW,
      sleep: async () => undefined,
    });
    await expect(locked.getAccessToken(lockedRoot)).resolves.toEqual({
      kind: "unavailable",
      errorCode: "refresh-lock-timeout",
    });

    const networkRoot = await createRoot();
    const fetchImpl = vi
      .fn()
      .mockRejectedValue(new Error(`Bearer ${OLD_REFRESH}`));
    const network = createKimiOAuthTokenService({
      fetchImpl: fetchImpl as typeof fetch,
      now: () => NOW,
      sleep: async () => undefined,
    });
    const result = await network.getAccessToken(networkRoot);
    expect(result).toEqual({ kind: "unavailable", errorCode: "network-error" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(result)).not.toContain(OLD_REFRESH);
  });

  it("retries a throttled refresh with the bounded default backoff", async () => {
    const root = await createRoot();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(429, {}))
      .mockResolvedValueOnce(
        response(200, {
          access_token: NEW_ACCESS,
          refresh_token: NEW_REFRESH,
          expires_in: 900,
        }),
      );
    const service = createKimiOAuthTokenService({
      fetchImpl: fetchImpl as typeof fetch,
      now: () => NOW,
    });

    await expect(service.getAccessToken(root)).resolves.toEqual({
      kind: "ok",
      accessToken: NEW_ACCESS,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each([
    [403, {}, "expired"],
    [400, { error: "invalid_grant" }, "expired"],
    [418, {}, "unavailable"],
    [200, {}, "unavailable"],
  ] as const)(
    "classifies refresh response %i as %s",
    async (status, body, expectedKind) => {
      const root = await createRoot();
      const service = createKimiOAuthTokenService({
        fetchImpl: vi
          .fn()
          .mockResolvedValue(response(status, body)) as typeof fetch,
        now: () => NOW,
        sleep: async () => undefined,
      });

      await expect(service.getAccessToken(root)).resolves.toMatchObject({
        kind: expectedKind,
      });
    },
  );

  it("handles malformed refresh JSON and abort failures without leaking secrets", async () => {
    const malformedRoot = await createRoot();
    const malformedResponse = new Response("invalid JSON", { status: 418 });
    const malformed = createKimiOAuthTokenService({
      fetchImpl: vi.fn().mockResolvedValue(malformedResponse) as typeof fetch,
      now: () => NOW,
      sleep: async () => undefined,
    });
    await expect(malformed.getAccessToken(malformedRoot)).resolves.toEqual({
      kind: "unavailable",
      errorCode: "http-error",
    });

    const abortRoot = await createRoot();
    const abortError = new Error(`aborted ${OLD_REFRESH}`);
    abortError.name = "AbortError";
    const aborted = createKimiOAuthTokenService({
      fetchImpl: vi.fn().mockRejectedValue(abortError) as typeof fetch,
      now: () => NOW,
      sleep: async () => undefined,
    });
    const result = await aborted.getAccessToken(abortRoot);
    expect(result).toEqual({ kind: "unavailable", errorCode: "timeout" });
    expect(JSON.stringify(result)).not.toContain(OLD_REFRESH);
  });

  it("rejects non-object refresh payloads", async () => {
    const root = await createRoot();
    const service = createKimiOAuthTokenService({
      fetchImpl: vi.fn().mockResolvedValue(response(200, null)) as typeof fetch,
      now: () => NOW,
      sleep: async () => undefined,
    });

    await expect(service.getAccessToken(root)).resolves.toEqual({
      kind: "unavailable",
      errorCode: "invalid-response",
    });
  });

  it("uses the Windows refresh path without creating a native lock", async () => {
    const root = await createRoot();
    const service = createKimiOAuthTokenService({
      fetchImpl: vi.fn().mockResolvedValue(
        response(200, {
          access_token: NEW_ACCESS,
          refresh_token: NEW_REFRESH,
          expires_in: 900,
        }),
      ) as typeof fetch,
      now: () => NOW,
      platform: "win32",
      sleep: async () => undefined,
    });

    await expect(service.getAccessToken(root)).resolves.toEqual({
      kind: "ok",
      accessToken: NEW_ACCESS,
    });
    await expect(fs.access(path.join(root, "oauth"))).rejects.toThrow();
  });

  it("keeps the upstream lock alive while a refresh is in flight", async () => {
    const root = await createRoot();
    vi.useFakeTimers();
    let release: ((response: Response) => void) | undefined;
    let signalFetchStarted: (() => void) | undefined;
    const fetchStarted = new Promise<void>((resolve) => {
      signalFetchStarted = resolve;
    });
    let signalHeartbeat: (() => void) | undefined;
    const heartbeat = new Promise<void>((resolve) => {
      signalHeartbeat = resolve;
    });
    vi.spyOn(fs, "utimes").mockImplementation(async () => {
      signalHeartbeat?.();
    });
    const service = createKimiOAuthTokenService({
      fetchImpl: vi.fn(
        () => {
          signalFetchStarted?.();
          return new Promise<Response>((resolve) => {
            release = resolve;
          });
        },
      ) as typeof fetch,
      lockHeartbeatMs: 1,
      now: () => NOW,
      sleep: async () => undefined,
    });

    const pending = service.getAccessToken(root);
    await fetchStarted;
    await vi.advanceTimersByTimeAsync(1);
    await heartbeat;
    release?.(
      response(200, {
        access_token: NEW_ACCESS,
        refresh_token: NEW_REFRESH,
        expires_in: 900,
      }),
    );
    await expect(pending).resolves.toEqual({
      kind: "ok",
      accessToken: NEW_ACCESS,
    });
    expect(fs.utimes).toHaveBeenCalled();
  });

  it("maps credential read and native lock failures without throwing", async () => {
    const virtual = createKimiOAuthTokenService({
      fetchImpl: vi.fn() as unknown as typeof fetch,
      now: () => NOW,
      readFile: async () => {
        throw new Error("read failed");
      },
      validateCredentialFile: false,
    });
    await expect(virtual.getAccessToken("/virtual/kimi")).resolves.toEqual({
      kind: "no-credentials",
    });

    const root = await createRoot();
    await fs.writeFile(path.join(root, "oauth"), "not-a-directory");
    const locked = createKimiOAuthTokenService({
      fetchImpl: vi.fn() as unknown as typeof fetch,
      now: () => NOW,
    });
    await expect(locked.getAccessToken(root)).resolves.toEqual({
      kind: "unavailable",
      errorCode: "refresh-lock-error",
    });
  });

  it("maps a native lock creation failure", async () => {
    const root = await createRoot();
    await fs.mkdir(path.join(root, "oauth"));
    const denied = Object.assign(new Error("denied"), { code: "EACCES" });
    vi.spyOn(fs, "mkdir")
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(denied);
    const service = createKimiOAuthTokenService({
      fetchImpl: vi.fn() as unknown as typeof fetch,
      now: () => NOW,
    });

    await expect(service.getAccessToken(root)).resolves.toEqual({
      kind: "unavailable",
      errorCode: "refresh-lock-error",
    });
  });

  it.each([
    ["removed", null],
    ["expired without refresh token", token({ refresh_token: "" })],
  ])(
    "uses the credential state found after locking: %s",
    async (_label, raw) => {
      const root = await createRoot();
      const lockPath = path.join(root, "oauth", "kimi-code.lock");
      const credentialPath = path.join(root, "credentials", "kimi-code.json");
      await fs.mkdir(lockPath, { recursive: true });
      const sleep = vi.fn(async () => {
        if (raw === null) {
          await fs.rm(credentialPath);
        } else {
          await fs.writeFile(credentialPath, raw);
        }
        await fs.rmdir(lockPath);
      });
      const service = createKimiOAuthTokenService({
        fetchImpl: vi.fn() as unknown as typeof fetch,
        now: () => NOW,
        sleep,
      });

      await expect(service.getAccessToken(root)).resolves.toEqual(
        raw === null ? { kind: "no-credentials" } : { kind: "expired" },
      );
    },
  );

  it("rejects file access errors and a credential swapped before lock acquisition", async () => {
    const inaccessibleRoot = await createRoot();
    const denied = Object.assign(new Error("denied"), { code: "EACCES" });
    vi.spyOn(fs, "lstat").mockRejectedValueOnce(denied);
    await expect(
      createKimiOAuthTokenService({ now: () => NOW }).getAccessToken(
        inaccessibleRoot,
      ),
    ).resolves.toEqual({
      kind: "unavailable",
      errorCode: "unsafe-credential-file",
    });
    vi.restoreAllMocks();

    const raceRoot = await createRoot();
    const credentialPath = path.join(raceRoot, "credentials", "kimi-code.json");
    const outsidePath = path.join(raceRoot, "outside.json");
    let firstRead = true;
    const readFile = async (filePath: string) => {
      const raw = await fs.readFile(filePath, "utf8");
      if (firstRead) {
        firstRead = false;
        await fs.rename(credentialPath, outsidePath);
        await fs.symlink(outsidePath, credentialPath);
      }
      return raw;
    };
    const raced = createKimiOAuthTokenService({
      fetchImpl: vi.fn() as unknown as typeof fetch,
      now: () => NOW,
      readFile,
    });
    await expect(raced.getAccessToken(raceRoot)).resolves.toEqual({
      kind: "unavailable",
      errorCode: "unsafe-credential-file",
    });
  });

  it("does not follow a symlink or report success when atomic persistence fails", async () => {
    const symlinkRoot = await createRoot();
    const target = path.join(symlinkRoot, "outside.json");
    const credentialPath = path.join(
      symlinkRoot,
      "credentials",
      "kimi-code.json",
    );
    await fs.rename(credentialPath, target);
    await fs.symlink(target, credentialPath);
    const service = createKimiOAuthTokenService({
      fetchImpl: vi.fn() as unknown as typeof fetch,
      now: () => NOW,
    });
    await expect(service.getAccessToken(symlinkRoot)).resolves.toEqual({
      kind: "unavailable",
      errorCode: "unsafe-credential-file",
    });

    const writeRoot = await createRoot();
    const writeFailure = createKimiOAuthTokenService({
      fetchImpl: vi.fn().mockResolvedValue(
        response(200, {
          access_token: NEW_ACCESS,
          refresh_token: NEW_REFRESH,
          expires_in: 900,
        }),
      ) as typeof fetch,
      now: () => NOW,
      sleep: async () => undefined,
      writeCredentials: async () => {
        throw new Error(`cannot write ${NEW_REFRESH}`);
      },
    });
    const result = await writeFailure.getAccessToken(writeRoot);
    expect(result).toEqual({
      kind: "unavailable",
      errorCode: "credential-write-error",
    });
    expect(JSON.stringify(result)).not.toContain(NEW_REFRESH);
  });

  it("rejects a credential swapped after refresh and cleans up an interrupted atomic write", async () => {
    const raceRoot = await createRoot();
    const credentialPath = path.join(raceRoot, "credentials", "kimi-code.json");
    const outsidePath = path.join(raceRoot, "outside.json");
    const fetchImpl = vi.fn(async () => {
      await fs.rename(credentialPath, outsidePath);
      await fs.symlink(outsidePath, credentialPath);
      return response(200, {
        access_token: NEW_ACCESS,
        refresh_token: NEW_REFRESH,
        expires_in: 900,
      });
    });
    const raced = createKimiOAuthTokenService({
      fetchImpl: fetchImpl as typeof fetch,
      now: () => NOW,
      sleep: async () => undefined,
    });
    await expect(raced.getAccessToken(raceRoot)).resolves.toEqual({
      kind: "unavailable",
      errorCode: "unsafe-credential-file",
    });

    const writeRoot = await createRoot();
    const close = vi.fn(async () => undefined);
    vi.spyOn(fs, "open").mockResolvedValue({
      writeFile: async () => {
        throw new Error("disk full");
      },
      sync: async () => undefined,
      close,
    } as never);
    const interrupted = createKimiOAuthTokenService({
      fetchImpl: vi.fn().mockResolvedValue(
        response(200, {
          access_token: NEW_ACCESS,
          refresh_token: NEW_REFRESH,
          expires_in: 900,
        }),
      ) as typeof fetch,
      now: () => NOW,
      sleep: async () => undefined,
    });
    await expect(interrupted.getAccessToken(writeRoot)).resolves.toEqual({
      kind: "unavailable",
      errorCode: "credential-write-error",
    });
    expect(close).toHaveBeenCalledOnce();
  });
});
