import { afterEach, describe, expect, it, vi } from "vitest";
import app from "./worker";
import type { Env } from "./types";

describe("release acceptance: Worker public error boundary", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns a generic 500 for a storage failure through the registered public route", async () => {
    const internalDetail = "private-storage-diagnostic-must-not-reach-client";
    // Interop fault fixture implements only the D1 boundary this route uses.
    // It is not a D1 emulator and does not claim Worker persistence coverage.
    const env = {
      DB: { prepare: () => { throw new Error(internalDetail); } },
      JWT_SECRET: "isolated-worker-fixture-secret-only",
    } as unknown as Env;
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const health = await app.request("/health", {}, env);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ data: { ok: true, runtime: "cloudflare-workers" } });

    const failed = await app.request("/api/auth/bootstrap", {}, env);
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Internal server error" },
    });
    const afterFailure = await app.request("/health", {}, env);
    expect(afterFailure.status).toBe(200);
    expect(await afterFailure.json()).toEqual({ data: { ok: true, runtime: "cloudflare-workers" } });
  });
});
