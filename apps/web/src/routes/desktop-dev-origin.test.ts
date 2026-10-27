import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SKILL_SNAPSHOT_CAPABILITY_HEADER } from "@prompthub/shared/utils/skill-file-snapshot";
import {
  createTestApp,
  setupSyncRouteTestLifecycle,
} from "./sync.test-helpers";

const desktopOrigin = "http://127.0.0.1:5173";

describe("desktop development API origin", () => {
  setupSyncRouteTestLifecycle();
  let dataDir: string;
  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-dev-origin-"));
    vi.stubEnv("DESKTOP_DEV_ORIGIN", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("keeps cross-origin API access disabled by default", async () => {
    const app = await createTestApp(dataDir);
    const response = await app.request("/api/auth/captcha", {
      headers: { Origin: desktopOrigin },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("allows the configured renderer to fetch captcha without enabling cookie credentials", async () => {
    vi.stubEnv("DESKTOP_DEV_ORIGIN", desktopOrigin);
    const app = await createTestApp(dataDir);
    const response = await app.request("/api/auth/captcha", {
      headers: { Origin: desktopOrigin },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      desktopOrigin,
    );
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
    expect(response.headers.get("vary")).toContain("Origin");
    expect(await response.json()).toHaveProperty("data.captchaId");
    const health = await app.request("/health", {
      headers: { Origin: desktopOrigin },
    });
    expect(health.status).toBe(200);
    expect(health.headers.get("access-control-allow-origin")).toBe(desktopOrigin);
    expect(await health.json()).toHaveProperty("version");
  });

  it("handles backup preflight before authentication but keeps actual backup access authenticated", async () => {
    vi.stubEnv("DESKTOP_DEV_ORIGIN", desktopOrigin);
    const app = await createTestApp(dataDir);
    const route = "/api/backups/desktop/workspace/manifest.json";
    const preflight = await app.request(route, {
      method: "OPTIONS",
      headers: {
        Origin: desktopOrigin,
        "Access-Control-Request-Method": "PUT",
        "Access-Control-Request-Headers":
          `authorization,content-type,if-match,if-none-match,${SKILL_SNAPSHOT_CAPABILITY_HEADER}`,
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe(
      desktopOrigin,
    );
    expect(preflight.headers.get("access-control-allow-methods")).toContain(
      "PUT",
    );
    expect(
      preflight.headers.get("access-control-allow-headers")?.toLowerCase(),
    ).toContain("if-match");
    expect(
      preflight.headers.get("access-control-allow-headers")?.toLowerCase(),
    ).toContain(SKILL_SNAPSHOT_CAPABILITY_HEADER.toLowerCase());
    const response = await app.request(route, {
      headers: { Origin: desktopOrigin },
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("access-control-expose-headers")).toContain(
      "ETag",
    );
  });

  it("does not allow a different origin or local port", async () => {
    vi.stubEnv("DESKTOP_DEV_ORIGIN", desktopOrigin);
    const app = await createTestApp(dataDir);
    for (const origin of [
      "http://127.0.0.1:5174",
      "https://example.com",
      "null",
    ]) {
      const response = await app.request("/api/auth/captcha", {
        headers: { Origin: origin },
      });
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
    }
  });

  it.each(["*", "null", "https://example.com", "http://127.0.0.1:5173/path"])(
    "rejects invalid development origin %s",
    async (origin) => {
      vi.stubEnv("DESKTOP_DEV_ORIGIN", origin);
      await expect(createTestApp(dataDir)).rejects.toThrow(
        "DESKTOP_DEV_ORIGIN",
      );
    },
  );
});
