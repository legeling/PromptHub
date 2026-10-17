import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AgentPetStoreService } from "../../../src/main/services/agent-pet-store-service";

const CATALOG_URL = "https://codexpet.top/pets.json";
const RAW_ROOT =
  "https://raw.githubusercontent.com/legeling/awesome-codex-pet/main/";
const PREVIEW_ROOT = "https://codexpet.top/assets/previews/";

function response(
  body: BodyInit,
  url: string,
  init: ResponseInit = {},
): Response {
  const value = new Response(body, init);
  Object.defineProperty(value, "url", { value: url });
  return value;
}

describe("AgentPetStoreService", () => {
  let root: string;
  const importPet = vi.fn();
  const getOverview = vi.fn();

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "prompthub-pet-store-"));
    importPet.mockReset();
    getOverview.mockReset().mockResolvedValue({ pets: [] });
  });

  afterEach(async () => {
    vi.useRealTimers();
    await fs.rm(root, { recursive: true, force: true });
  });

  it("loads, localizes, filters and pages one bounded official catalog cache", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toBe(CATALOG_URL);
      return response(
        JSON.stringify([
          {
            slug: "nova--alice",
            name: "Nova",
            localized_names: { zh: "星光" },
            author: "Alice",
            author_handle: "alice",
            primary_category: "Robots",
            license: "MIT",
            description: "A bright helper",
            spriteVersionNumber: 2,
          },
          {
            slug: "orbit--bob",
            name: "Orbit",
            author: "Bob",
            primary_category: "Robots",
            license: "CC BY 4.0",
            description: "A quiet helper",
          },
        ]),
        url,
      );
    });
    getOverview.mockResolvedValue({ pets: [{ id: "orbit--bob" }] });
    const service = new AgentPetStoreService({
      dataRoot: root,
      appearanceService: { importPet, getOverview } as never,
      fetchImpl: fetchImpl as never,
      now: () => 100,
    });

    await expect(
      service.list({
        agentId: "codex",
        locale: "zh",
        search: "星光",
        page: 1,
        pageSize: 1,
      }),
    ).resolves.toMatchObject({
      total: 1,
      page: 1,
      pageSize: 1,
      hasMore: false,
      items: [
        {
          id: "nova--alice",
          name: "Nova",
          localizedName: "星光",
          spriteVersionNumber: 2,
          installed: false,
        },
      ],
    });
    await service.list({ agentId: "codex", page: 1, pageSize: 10 });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("stages an allowlisted package, reuses validated import and always removes staging", async () => {
    const catalog = [{ slug: "nova--alice", name: "Nova", author: "Alice" }];
    const manifest = {
      id: "nova--alice",
      displayName: "Nova",
      description: "Official package",
      spritesheetPath: "spritesheet.webp",
      spriteVersionNumber: 2,
    };
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === CATALOG_URL) return response(JSON.stringify(catalog), url);
      if (url === `${RAW_ROOT}pets/nova--alice/pet.json`) {
        return response(JSON.stringify(manifest), url);
      }
      if (url === `${RAW_ROOT}pets/nova--alice/spritesheet.webp`) {
        return response(new Uint8Array([1, 2, 3]), url);
      }
      throw new Error(`unexpected URL ${url}`);
    });
    importPet.mockImplementation(async (stagingPath: string) => {
      expect(
        JSON.parse(
          await fs.readFile(path.join(stagingPath, "pet.json"), "utf8"),
        ),
      ).toEqual(manifest);
      expect(
        await fs.readFile(path.join(stagingPath, "spritesheet.webp")),
      ).toEqual(Buffer.from([1, 2, 3]));
      return {
        id: manifest.id,
        name: manifest.displayName,
        directoryPath: "/tmp/pets/nova--alice",
        description: manifest.description,
        spriteVersionNumber: 2,
        spritesheetName: "spritesheet.webp",
        spritesheetBytes: 3,
      };
    });
    const service = new AgentPetStoreService({
      dataRoot: root,
      appearanceService: { importPet, getOverview } as never,
      fetchImpl: fetchImpl as never,
    });

    await expect(
      service.install("codex", "nova--alice"),
    ).resolves.toMatchObject({
      id: "nova--alice",
      spriteVersionNumber: 2,
    });
    expect(await fs.readdir(path.join(root, "agent-pet-store"))).toEqual([]);

    importPet.mockRejectedValueOnce(new Error("already installed"));
    await expect(service.install("codex", "nova--alice")).rejects.toThrow(
      "already installed",
    );
    expect(await fs.readdir(path.join(root, "agent-pet-store"))).toEqual([]);
  });

  it("loads the published official gallery preview without downloading a full spritesheet", async () => {
    const catalog = [{ slug: "nova--alice", name: "Nova", author: "Alice" }];
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === CATALOG_URL) return response(JSON.stringify(catalog), url);
      if (url === `${PREVIEW_ROOT}nova--alice/webp/idle.webp`) {
        return response(new Uint8Array([4, 5, 6]), url);
      }
      throw new Error(`unexpected URL ${url}`);
    });
    const service = new AgentPetStoreService({
      dataRoot: root,
      appearanceService: { importPet, getOverview } as never,
      fetchImpl: fetchImpl as never,
    });

    await expect(service.getPreview("codex", "nova--alice")).resolves.toBe(
      "data:image/webp;base64,BAUG",
    );
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      CATALOG_URL,
      `${PREVIEW_ROOT}nova--alice/webp/idle.webp`,
    ]);
  });

  it("reuses a bounded persistent preview cache across service instances", async () => {
    const catalog = [{ slug: "nova--alice", name: "Nova", author: "Alice" }];
    let previewRequests = 0;
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === CATALOG_URL) return response(JSON.stringify(catalog), url);
      if (url === `${PREVIEW_ROOT}nova--alice/webp/idle.webp`) {
        previewRequests += 1;
        return response(new Uint8Array([4, 5, 6]), url);
      }
      throw new Error(`unexpected URL ${url}`);
    });

    const first = new AgentPetStoreService({
      dataRoot: root,
      appearanceService: { importPet, getOverview } as never,
      fetchImpl: fetchImpl as never,
    });
    await expect(first.getPreview("codex", "nova--alice")).resolves.toBe(
      "data:image/webp;base64,BAUG",
    );

    const second = new AgentPetStoreService({
      dataRoot: root,
      appearanceService: { importPet, getOverview } as never,
      fetchImpl: fetchImpl as never,
    });
    await expect(second.getPreview("codex", "nova--alice")).resolves.toBe(
      "data:image/webp;base64,BAUG",
    );

    expect(previewRequests).toBe(1);
    expect(
      await fs.readdir(path.join(root, "agent-pet-store", "cache", "previews")),
    ).toEqual(["nova--alice.webp"]);
  });

  it("expires stale previews and caps the persistent cache inventory", async () => {
    const catalog = [{ slug: "nova--alice", name: "Nova", author: "Alice" }];
    const now = Date.now();
    let previewRequests = 0;
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === CATALOG_URL) return response(JSON.stringify(catalog), url);
      if (url === `${PREVIEW_ROOT}nova--alice/webp/idle.webp`) {
        previewRequests += 1;
        return response(new Uint8Array([previewRequests]), url);
      }
      throw new Error(`unexpected URL ${url}`);
    });
    const cacheDirectory = path.join(
      root,
      "agent-pet-store",
      "cache",
      "previews",
    );
    await fs.mkdir(cacheDirectory, { recursive: true });
    for (let index = 0; index < 98; index += 1) {
      const filename = `cached-pet-${String(index).padStart(3, "0")}.webp`;
      const cachePath = path.join(cacheDirectory, filename);
      await fs.writeFile(cachePath, Buffer.from([index]));
      const modifiedAt = new Date(now - (98 - index) * 1_000);
      await fs.utimes(cachePath, modifiedAt, modifiedAt);
    }

    const first = new AgentPetStoreService({
      dataRoot: root,
      appearanceService: { importPet, getOverview } as never,
      fetchImpl: fetchImpl as never,
      now: () => now,
    });
    await first.getPreview("codex", "nova--alice");
    const cacheFiles = await fs.readdir(cacheDirectory);
    expect(cacheFiles).toHaveLength(96);
    expect(cacheFiles).not.toContain("cached-pet-000.webp");

    const previewPath = path.join(cacheDirectory, "nova--alice.webp");
    const staleAt = new Date(now - 8 * 24 * 60 * 60 * 1_000);
    await fs.utimes(previewPath, staleAt, staleAt);
    const second = new AgentPetStoreService({
      dataRoot: root,
      appearanceService: { importPet, getOverview } as never,
      fetchImpl: fetchImpl as never,
      now: () => now,
    });
    await expect(second.getPreview("codex", "nova--alice")).resolves.toBe(
      "data:image/webp;base64,Ag==",
    );
    expect(previewRequests).toBe(2);
  });

  it("falls back to the website thumbnail without contacting GitHub", async () => {
    const catalog = [{ slug: "nova--alice", name: "Nova", author: "Alice" }];
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === CATALOG_URL) return response(JSON.stringify(catalog), url);
      if (url === `${PREVIEW_ROOT}nova--alice/webp/idle.webp`) {
        return response("missing", url, { status: 404 });
      }
      if (url === `${PREVIEW_ROOT}nova--alice/thumbnail.webp`) {
        return response(new Uint8Array([1, 2, 3]), url);
      }
      throw new Error(`unexpected URL ${url}`);
    });
    const service = new AgentPetStoreService({
      dataRoot: root,
      appearanceService: { importPet, getOverview } as never,
      fetchImpl: fetchImpl as never,
    });

    await expect(service.getPreview("codex", "nova--alice")).resolves.toBe(
      "data:image/webp;base64,AQID",
    );
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      CATALOG_URL,
      `${PREVIEW_ROOT}nova--alice/webp/idle.webp`,
      `${PREVIEW_ROOT}nova--alice/thumbnail.webp`,
    ]);
  });

  it("keeps website failures on the website and allows an explicit catalog retry", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      response("unavailable", url, { status: 503 }),
    );
    const service = new AgentPetStoreService({
      dataRoot: root,
      appearanceService: { importPet, getOverview } as never,
      fetchImpl: fetchImpl as never,
    });
    await expect(service.list({ agentId: "codex" })).rejects.toThrow("503");
    fetchImpl.mockImplementationOnce(async (url) =>
      response(
        JSON.stringify([
          {
            slug: "nova--alice",
            name: "Nova",
            repositoryPath: "https://github.com/example/pet",
          },
        ]),
        url,
      ),
    );
    await expect(
      service.list({ agentId: "codex", refresh: true }),
    ).resolves.toMatchObject({ total: 1 });
    await expect(service.getPreview("codex", "nova--alice")).rejects.toThrow(
      "503",
    );
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      CATALOG_URL,
      CATALOG_URL,
      `${PREVIEW_ROOT}nova--alice/webp/idle.webp`,
      `${PREVIEW_ROOT}nova--alice/thumbnail.webp`,
    ]);
  });

  it("rejects redirected and oversized official responses before consuming them", async () => {
    const redirectedFetch = vi.fn(async () => {
      const value = response("[]", "https://example.com/pets.json");
      Object.defineProperty(value, "redirected", { value: true });
      return value;
    });
    const redirected = new AgentPetStoreService({
      dataRoot: root,
      appearanceService: { importPet, getOverview } as never,
      fetchImpl: redirectedFetch as never,
    });
    await expect(redirected.list({ agentId: "codex" })).rejects.toThrow(
      "redirect",
    );

    const oversized = new AgentPetStoreService({
      dataRoot: root,
      appearanceService: { importPet, getOverview } as never,
      fetchImpl: vi.fn(async (url: string) =>
        response("[]", url, { headers: { "content-length": "99999999" } }),
      ) as never,
    });
    await expect(oversized.list({ agentId: "codex" })).rejects.toThrow(
      "size limit",
    );
  });

  it("rejects unsafe package paths and aborts a bounded request on timeout", async () => {
    const unsafeFetch = vi.fn(async (url: string) => {
      if (url === CATALOG_URL) {
        return response(
          JSON.stringify([{ slug: "unsafe--pet", name: "Unsafe" }]),
          url,
        );
      }
      return response(
        JSON.stringify({
          id: "unsafe--pet",
          spritesheetPath: "../outside.webp",
        }),
        url,
      );
    });
    const unsafe = new AgentPetStoreService({
      dataRoot: root,
      appearanceService: { importPet, getOverview } as never,
      fetchImpl: unsafeFetch as never,
    });
    await expect(unsafe.install("codex", "../outside")).rejects.toThrow(
      "Invalid official Pet id",
    );
    await expect(unsafe.install("codex", "unsafe--pet")).rejects.toThrow(
      "spritesheet path is invalid",
    );
    expect(importPet).not.toHaveBeenCalled();

    vi.useFakeTimers();
    let aborted = false;
    const hangingFetch = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            aborted = true;
            reject(new Error("request aborted"));
          });
        }),
    );
    const timed = new AgentPetStoreService({
      dataRoot: root,
      appearanceService: { importPet, getOverview } as never,
      fetchImpl: hangingFetch as never,
    });
    const request = timed.list({ agentId: "codex" });
    const rejection = expect(request).rejects.toThrow(
      "PET_STORE_REQUEST_TIMEOUT",
    );
    await vi.advanceTimersByTimeAsync(10_001);
    await rejection;
    expect(aborted).toBe(true);
    hangingFetch.mockImplementationOnce(async () =>
      response("[]", CATALOG_URL),
    );
    await expect(
      timed.list({ agentId: "codex", refresh: true }),
    ).resolves.toMatchObject({ total: 0 });
  });
});
