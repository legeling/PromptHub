/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "events";
import type { LookupAddress, LookupAllOptions } from "node:dns";

const lookupAllMock = vi.hoisted(() =>
  vi.fn<
    (hostname: string, options: LookupAllOptions) => Promise<LookupAddress[]>
  >(),
);

const httpRequestMock = vi.hoisted(() => vi.fn());
const getHttpRequestAgentMock = vi.hoisted(() => vi.fn());

vi.mock("http", async () => {
  const actual = await vi.importActual<typeof import("http")>("http");
  return {
    ...actual,
    request: httpRequestMock,
  };
});

vi.mock("https", async () => {
  const actual = await vi.importActual<typeof import("https")>("https");
  return {
    ...actual,
    request: httpRequestMock,
  };
});

vi.mock("dns/promises", () => ({
  lookup: lookupAllMock,
}));

vi.mock("../../../src/main/services/network-proxy", () => ({
  getHttpRequestAgent: getHttpRequestAgentMock,
}));

import {
  fetchRemoteBytes,
  fetchRemoteText,
  getRemoteFetchMaxBytes,
  resolvePublicAddress,
} from "../../../src/main/services/skill-installer-remote";

const REMOTE_FETCH_MAX_BYTES = 10 * 1024 * 1024;

describe("skill-installer-remote", () => {
  beforeEach(() => {
    lookupAllMock.mockReset();
    httpRequestMock.mockReset();
    getHttpRequestAgentMock.mockReset().mockReturnValue(undefined);
  });

  it("allows the issue 165 GitHub tree payload under the global byte cap", () => {
    const issue165TreePayloadBytes = 6_329_653;
    const githubRecursiveTreeUrl = new URL(
      "https://api.github.com/repos/sickn33/antigravity-awesome-skills/git/trees/main?recursive=1",
    );

    expect(getRemoteFetchMaxBytes(githubRecursiveTreeUrl)).toBe(
      REMOTE_FETCH_MAX_BYTES,
    );
    expect(issue165TreePayloadBytes).toBeLessThanOrEqual(
      getRemoteFetchMaxBytes(githubRecursiveTreeUrl),
    );
  });

  it.each([
    "https://raw.githubusercontent.com/sickn33/antigravity-awesome-skills/main/README.md",
    "https://api.github.com/repos/sickn33/antigravity-awesome-skills",
    "https://api.github.com/repos/sickn33/antigravity-awesome-skills/git/trees/main",
    "https://api.github.com/repos/sickn33/antigravity-awesome-skills/git/trees/main?recursive=true",
    "https://example.com/repos/sickn33/antigravity-awesome-skills/git/trees/main?recursive=1",
  ])("uses the same global byte cap for remote content %s", (targetUrl) => {
    expect(getRemoteFetchMaxBytes(new URL(targetUrl))).toBe(
      REMOTE_FETCH_MAX_BYTES,
    );
  });

  it("allows trusted remote hosts when DNS is mapped to 198.18.x.x compatibility addresses", async () => {
    lookupAllMock.mockResolvedValueOnce([
      { address: "198.18.0.195", family: 4 },
    ]);

    await expect(
      resolvePublicAddress("raw.githubusercontent.com"),
    ).resolves.toEqual({ address: "198.18.0.195", family: 4 });
  });

  it("allows trusted remote hosts when DNS is mapped to translated IPv6 compatibility addresses", async () => {
    lookupAllMock.mockResolvedValueOnce([
      { address: "::ffff:0:c612:c3", family: 6 },
    ]);

    await expect(
      resolvePublicAddress("raw.githubusercontent.com"),
    ).resolves.toEqual({ address: "::ffff:0:c612:c3", family: 6 });
  });

  it("allows ClawHub as a trusted preconfigured store host", async () => {
    lookupAllMock.mockResolvedValueOnce([
      { address: "198.18.0.195", family: 4 },
    ]);

    await expect(resolvePublicAddress("clawhub.ai")).resolves.toEqual({
      address: "198.18.0.195",
      family: 4,
    });
  });

  it("allows the www ClawHub host used by redirects or canonical URLs", async () => {
    lookupAllMock.mockResolvedValueOnce([
      { address: "198.18.0.196", family: 4 },
    ]);

    await expect(resolvePublicAddress("www.clawhub.ai")).resolves.toEqual({
      address: "198.18.0.196",
      family: 4,
    });
  });

  it("still blocks untrusted hosts that resolve to 198.18.x.x", async () => {
    lookupAllMock.mockResolvedValueOnce([
      { address: "198.18.0.42", family: 4 },
    ]);

    await expect(resolvePublicAddress("example.com")).rejects.toThrow(
      /Access to internal network addresses is not allowed/,
    );
  });

  it("allows proxy compatibility DNS answers for arbitrary public hosts", async () => {
    const proxyAgent = { proxy: true };
    getHttpRequestAgentMock.mockReturnValue(proxyAgent);
    lookupAllMock.mockResolvedValueOnce([
      { address: "198.18.0.42", family: 4 },
    ]);
    httpRequestMock.mockImplementationOnce((options, callback) => {
      const response = new EventEmitter() as EventEmitter & {
        headers: Record<string, string>;
        resume: () => void;
        statusCode: number;
      };
      response.statusCode = 200;
      response.headers = {};
      response.resume = vi.fn();
      const request = {
        destroy: vi.fn(),
        end: vi.fn(() => {
          callback(response);
          response.emit("data", Buffer.from("ok"));
          response.emit("end");
        }),
        on: vi.fn(),
      };
      return request;
    });

    await expect(
      fetchRemoteText("https://community.example/skill.md"),
    ).resolves.toBe("ok");
    expect(httpRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        hostname: "community.example",
        agent: proxyAgent,
        path: "/skill.md",
      }),
      expect.any(Function),
    );
    expect(httpRequestMock.mock.calls[0][0]).not.toHaveProperty("family");
  });

  it("still blocks real private addresses when a proxy is configured", async () => {
    getHttpRequestAgentMock.mockReturnValue({ proxy: true });
    lookupAllMock.mockResolvedValueOnce([
      { address: "192.168.31.12", family: 4 },
    ]);

    await expect(
      fetchRemoteText("https://internal.example/skill.md"),
    ).rejects.toThrow(/Access to internal network addresses is not allowed/);
    expect(httpRequestMock).not.toHaveBeenCalled();
  });

  it("allows proxy compatibility DNS answers for remote package bytes", async () => {
    const proxyAgent = { proxy: true };
    getHttpRequestAgentMock.mockReturnValue(proxyAgent);
    lookupAllMock.mockResolvedValueOnce([
      { address: "198.19.0.42", family: 4 },
    ]);
    httpRequestMock.mockImplementationOnce((options, callback) => {
      const response = new EventEmitter() as EventEmitter & {
        headers: Record<string, string>;
        resume: () => void;
        statusCode: number;
      };
      response.statusCode = 200;
      response.headers = {};
      response.resume = vi.fn();
      const request = {
        destroy: vi.fn(),
        end: vi.fn(() => {
          callback(response);
          response.emit("data", Buffer.from([1, 2, 3]));
          response.emit("end");
        }),
        on: vi.fn(),
      };
      return request;
    });

    await expect(
      fetchRemoteBytes("https://community.example/skill.zip"),
    ).resolves.toEqual(new Uint8Array([1, 2, 3]));
    expect(httpRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        hostname: "community.example",
        agent: proxyAgent,
        path: "/skill.zip",
      }),
      expect.any(Function),
    );
  });

  it("blocks private network addresses by default", async () => {
    lookupAllMock.mockResolvedValueOnce([
      { address: "192.168.31.12", family: 4 },
    ]);

    await expect(resolvePublicAddress("gitea.company.test")).rejects.toThrow(
      /Access to internal network addresses is not allowed/,
    );
  });

  it("allows explicit private network access for user-selected Git hosts", async () => {
    lookupAllMock.mockResolvedValueOnce([
      { address: "192.168.31.12", family: 4 },
    ]);

    await expect(
      resolvePublicAddress("gitea.company.test", {
        allowPrivateNetwork: true,
      }),
    ).resolves.toEqual({ address: "192.168.31.12", family: 4 });
  });

  it("does not let the private network option bypass localhost hostnames", async () => {
    await expect(
      resolvePublicAddress("localhost", { allowPrivateNetwork: true }),
    ).rejects.toThrow(/Access to local network addresses is not allowed/);
  });

  it("rejects public HTTP even when private network access is enabled", async () => {
    lookupAllMock.mockResolvedValueOnce([
      { address: "93.184.216.34", family: 4 },
    ]);

    await expect(
      fetchRemoteText("http://example.com/team/skills", 0, {
        allowPrivateNetwork: true,
        allowInsecurePrivateNetworkHttp: true,
      }),
    ).rejects.toThrow(/Only HTTPS URLs are allowed/);
    expect(httpRequestMock).not.toHaveBeenCalled();
  });

  it("allows HTTP only for explicitly trusted private Git hosts", async () => {
    lookupAllMock.mockResolvedValueOnce([
      { address: "192.168.31.12", family: 4 },
    ]);
    httpRequestMock.mockImplementationOnce((options, callback) => {
      const response = new EventEmitter() as EventEmitter & {
        headers: Record<string, string>;
        resume: () => void;
        statusCode: number;
      };
      response.statusCode = 200;
      response.headers = {};
      response.resume = vi.fn();
      const request = {
        destroy: vi.fn(),
        end: vi.fn(() => {
          callback(response);
          response.emit("data", Buffer.from("ok"));
          response.emit("end");
        }),
        on: vi.fn(),
      };
      return request;
    });

    await expect(
      fetchRemoteText("http://gitea.company.test/api/v1/repos/team/skills", 0, {
        allowPrivateNetwork: true,
        allowInsecurePrivateNetworkHttp: true,
      }),
    ).resolves.toBe("ok");
    expect(httpRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        hostname: "192.168.31.12",
        method: "GET",
        path: "/api/v1/repos/team/skills",
        protocol: "http:",
      }),
      expect.any(Function),
    );
  });
});

/**
 * Issue #108 regression: the GitHub PAT from settings must be attached only
 * when the target host is an official GitHub endpoint. This prevents leaking
 * the token to any third party via redirects or user-controlled URLs.
 */
describe("shouldAttachGithubAuth (issue #108)", () => {
  // Imported lazily so the dns mock above does not leak into this block.
  async function load() {
    const mod =
      await import("../../../src/main/services/skill-installer-remote");
    return mod.shouldAttachGithubAuth;
  }

  it.each(["api.github.com", "raw.githubusercontent.com"])(
    "attaches the token for trusted host %s",
    async (host) => {
      const shouldAttachGithubAuth = await load();
      expect(shouldAttachGithubAuth(host)).toBe(true);
    },
  );

  it.each([
    "api.github.com".toUpperCase(),
    "Api.GitHub.com",
    "RAW.githubusercontent.com",
  ])("is case-insensitive for trusted host %s", async (host) => {
    const shouldAttachGithubAuth = await load();
    expect(shouldAttachGithubAuth(host)).toBe(true);
  });

  it.each([
    "example.com",
    "codeload.github.com",
    "github.com", // the git endpoint, NOT the API — no token here
    "evilgithub.com",
    "api.github.com.evil.com",
    "raw.githubusercontent.com.attacker.net",
    "skills.sh",
  ])("never attaches the token for untrusted host %s", async (host) => {
    const shouldAttachGithubAuth = await load();
    expect(shouldAttachGithubAuth(host)).toBe(false);
  });

  it("returns false for empty or garbage hostnames", async () => {
    const shouldAttachGithubAuth = await load();
    expect(shouldAttachGithubAuth("")).toBe(false);
    expect(shouldAttachGithubAuth("   ")).toBe(false);
    expect(shouldAttachGithubAuth("http://api.github.com")).toBe(false);
  });
});
