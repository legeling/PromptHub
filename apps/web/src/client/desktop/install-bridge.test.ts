import { beforeEach, describe, expect, it, vi } from "vitest";
import rootPackage from "../../../../../package.json";

async function loadInstallDesktopBridge() {
  const module = await import("./install-bridge");
  return module.installDesktopBridge;
}

describe("installDesktopBridge media helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, "api");
    Reflect.deleteProperty(window, "electron");
    Reflect.deleteProperty(window, "__PROMPTHUB_WEB__");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ data: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );
  });

  it("falls back when crypto.randomUUID is unavailable for pasted image uploads", async () => {
    const installDesktopBridge = await loadInstallDesktopBridge();
    const originalCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {},
    });

    installDesktopBridge();

    const electronBridge = Reflect.get(window, "electron") as {
      saveImageBuffer: (buffer: ArrayBuffer) => Promise<string>;
    };
    const fileName = await electronBridge.saveImageBuffer(
      new Uint8Array([1, 2, 3]).buffer,
    );

    expect(fileName).toMatch(/^image-/);
    expect(fileName).toMatch(/\.png$/);

    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: originalCrypto,
    });
  });

  it("opens media previews without exposing the opener window", async () => {
    const installDesktopBridge = await loadInstallDesktopBridge();
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);

    installDesktopBridge();

    const electronBridge = Reflect.get(window, "electron") as {
      openImage: (fileName: string) => Promise<boolean>;
      openVideo: (fileName: string) => Promise<boolean>;
    };

    await expect(electronBridge.openImage("cover image.png")).resolves.toBe(
      true,
    );
    await expect(electronBridge.openVideo("demo video.mp4")).resolves.toBe(
      true,
    );

    expect(openSpy).toHaveBeenCalledWith(
      "/api/media/images/cover%20image.png",
      "_blank",
      "noopener,noreferrer",
    );
    expect(openSpy).toHaveBeenCalledWith(
      "/api/media/videos/demo%20video.mp4",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("reports unsupported openPath targets instead of pretending local paths opened", async () => {
    const installDesktopBridge = await loadInstallDesktopBridge();
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);

    installDesktopBridge();

    const electronBridge = Reflect.get(window, "electron") as {
      openPath: (
        targetPath: string,
      ) => Promise<{ success: boolean; error?: string }>;
    };

    await expect(
      electronBridge.openPath("https://example.com/docs"),
    ).resolves.toEqual({
      success: true,
    });
    expect(openSpy).toHaveBeenCalledWith(
      "https://example.com/docs",
      "_blank",
      "noopener,noreferrer",
    );

    await expect(electronBridge.openPath("/tmp/project")).resolves.toEqual({
      success: false,
      error: "Opening local paths is not supported in the web runtime",
    });
    await expect(
      electronBridge.openPath("javascript:alert(1)"),
    ).resolves.toEqual({
      success: false,
      error: "Opening local paths is not supported in the web runtime",
    });

    expect(openSpy).toHaveBeenCalledTimes(1);
  });

  it("cleans up hidden file inputs when browser file selection is blocked", async () => {
    const installDesktopBridge = await loadInstallDesktopBridge();
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {
      throw new Error("blocked file picker");
    });

    installDesktopBridge();

    const electronBridge = Reflect.get(window, "electron") as {
      selectImage: () => Promise<string[]>;
    };

    await expect(electronBridge.selectImage()).resolves.toEqual([]);
    expect(document.body.querySelectorAll('input[type="file"]')).toHaveLength(
      0,
    );
  });

  it("exposes prompt tag helpers and rules bridge methods", async () => {
    const installDesktopBridge = await loadInstallDesktopBridge();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        if (url.endsWith("/api/prompts/meta/tags")) {
          return new Response(JSON.stringify({ data: ["alpha", "beta"] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.endsWith("/api/rules") || url.endsWith("/api/rules/scan")) {
          return new Response(JSON.stringify({ data: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ data: { success: true } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    installDesktopBridge();

    const api = Reflect.get(window, "api") as {
      prompt: {
        getAllTags: () => Promise<string[]>;
        renameTag: (oldTag: string, newTag: string) => Promise<boolean>;
        deleteTag: (tag: string) => Promise<{ deleted: boolean; referenced: number }>;
      };
      rules: {
        list: () => Promise<unknown[]>;
        scan: () => Promise<unknown[]>;
        addProject: (input: {
          name: string;
          rootPath: string;
        }) => Promise<unknown>;
        removeProject: (projectId: string) => Promise<{ success: boolean }>;
      };
    };

    await expect(api.prompt.getAllTags()).resolves.toEqual(["alpha", "beta"]);
    await expect(api.prompt.renameTag("alpha", "beta")).resolves.toBe(true);
    await expect(api.prompt.deleteTag("beta")).resolves.toEqual({
      deleted: true,
      referenced: 0,
    });
    await expect(api.rules.list()).resolves.toEqual([]);
    await expect(api.rules.scan()).resolves.toEqual([]);
    await expect(
      api.rules.addProject({ name: "Docs Site", rootPath: "/workspace/docs" }),
    ).resolves.toEqual({
      success: true,
    });
    await expect(api.rules.removeProject("docs-site")).resolves.toEqual({
      success: true,
    });
  });

  it("maps Agent config file editing to authenticated web routes", async () => {
    const installDesktopBridge = await loadInstallDesktopBridge();
    const calls: Array<{ url: string; method: string; body?: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        calls.push({
          url,
          method: init?.method ?? "GET",
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        return new Response(
          JSON.stringify({
            data: url.endsWith("/read")
              ? { path: "config.toml", content: "model='gpt-5'" }
              : url.endsWith("/config-files") && init?.method === "PUT"
                ? { path: "config.toml", content: "model='gpt-5.1'" }
                : [{ path: "config.toml", isDirectory: false }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    installDesktopBridge();
    const agent = (Reflect.get(window, "api") as { agent: Record<string, any> })
      .agent;

    await expect(agent.listConfigFiles("codex")).resolves.toHaveLength(1);
    await expect(
      agent.readConfigFile("codex", "config.toml"),
    ).resolves.toMatchObject({ content: "model='gpt-5'" });
    await expect(
      agent.writeConfigFile("codex", "config.toml", "model='gpt-5.1'", "rev-1"),
    ).resolves.toMatchObject({ content: "model='gpt-5.1'" });

    expect(calls).toEqual([
      {
        url: "/api/agents/codex/config-files",
        method: "GET",
        body: undefined,
      },
      {
        url: "/api/agents/codex/config-files/read",
        method: "POST",
        body: { relativePath: "config.toml" },
      },
      {
        url: "/api/agents/codex/config-files",
        method: "PUT",
        body: {
          relativePath: "config.toml",
          content: "model='gpt-5.1'",
          expectedRevision: "rev-1",
        },
      },
    ]);
  });

  it("maps Agent provider profile CRUD to self-hosted routes", async () => {
    const installDesktopBridge = await loadInstallDesktopBridge();
    const calls: Array<{ url: string; method: string; body?: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        calls.push({
          url,
          method: init?.method ?? "GET",
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        const data = url.endsWith("export")
          ? {}
          : url.endsWith("provider-profiles") &&
              (init?.method ?? "GET") === "GET"
            ? [{ id: "profile-1", platformId: "codex" }]
            : { id: "profile-1", platformId: "codex" };
        return new Response(JSON.stringify({ data }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    installDesktopBridge();
    const agent = (Reflect.get(window, "api") as { agent: Record<string, any> })
      .agent;
    await agent.listProviderProfiles({ platformId: "codex" });
    await agent.createProviderProfile({ profile: { platformId: "codex" } });
    await agent.updateProviderProfile({ id: "profile-1" });
    await agent.archiveProviderProfile("profile-1", 9);
    await agent.duplicateProviderProfile("profile-1", "Copy");
    await agent.exportProviderProfile("profile-1");
    await agent.deleteProviderProfile("profile-1");

    expect(calls.map(({ url, method }) => [url, method])).toEqual([
      ["/api/agents/codex/provider-profiles", "GET"],
      ["/api/agents/codex/provider-profiles", "POST"],
      ["/api/agents/codex/provider-profiles/profile-1", "PUT"],
      ["/api/agents/codex/provider-profiles/profile-1/archive", "POST"],
      ["/api/agents/codex/provider-profiles/profile-1/duplicate", "POST"],
      ["/api/agents/codex/provider-profiles/profile-1/export", "GET"],
      ["/api/agents/codex/provider-profiles/profile-1", "DELETE"],
    ]);
    expect(calls[3].body).toEqual({ expectedUpdatedAt: 9 });
    expect(calls[4].body).toEqual({ name: "Copy" });
  });

  it("maps desktop prompt restore helpers to real web endpoints", async () => {
    const installDesktopBridge = await loadInstallDesktopBridge();
    const calls: Array<{ url: string; method: string; body?: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        calls.push({
          url,
          method: init?.method ?? "GET",
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        return new Response(JSON.stringify({ data: { ok: true } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    installDesktopBridge();

    const api = Reflect.get(window, "api") as {
      prompt: {
        insertDirect: (prompt: { id: string }) => Promise<boolean>;
        syncWorkspace: () => Promise<boolean>;
      };
      folder: {
        insertDirect: (folder: { id: string }) => Promise<boolean>;
      };
      version: {
        insertDirect: (version: { id: string }) => Promise<boolean>;
        delete: (versionId: string) => Promise<boolean>;
      };
    };

    await expect(api.folder.insertDirect({ id: "folder-1" })).resolves.toBe(
      true,
    );
    await expect(api.prompt.insertDirect({ id: "prompt-1" })).resolves.toBe(
      true,
    );
    await expect(api.version.insertDirect({ id: "version-1" })).resolves.toBe(
      true,
    );
    await expect(api.version.delete("version-1")).resolves.toBe(true);
    await expect(api.prompt.syncWorkspace()).resolves.toBe(true);

    expect(calls).toEqual([
      {
        url: "/api/folders/direct-insert",
        method: "POST",
        body: { id: "folder-1" },
      },
      {
        url: "/api/prompts/direct-insert",
        method: "POST",
        body: { id: "prompt-1" },
      },
      {
        url: "/api/prompts/versions/direct-insert",
        method: "POST",
        body: { id: "version-1" },
      },
      {
        url: "/api/prompts/versions/version-1",
        method: "DELETE",
        body: undefined,
      },
      { url: "/api/prompts/workspace/sync", method: "POST", body: undefined },
    ]);
  });

  it("maps prompt hierarchy, relations, and output formats to durable web routes", async () => {
    const installDesktopBridge = await loadInstallDesktopBridge();
    const calls: Array<{ url: string; method: string; body?: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        calls.push({
          url,
          method: init?.method ?? "GET",
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        return new Response(JSON.stringify({ data: { ok: true } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    installDesktopBridge();

    const api = Reflect.get(window, "api") as {
      prompt: {
        move: (
          id: string,
          parentId: string | null,
          order: number,
        ) => Promise<unknown>;
        createRelation: (data: Record<string, unknown>) => Promise<unknown>;
        listRelations: (query: Record<string, string>) => Promise<unknown>;
        updateRelation: (
          id: string,
          data: Record<string, unknown>,
        ) => Promise<unknown>;
        deleteRelation: (id: string) => Promise<boolean>;
        createOutputFormat: (data: Record<string, unknown>) => Promise<unknown>;
        listOutputFormat: (query: Record<string, string>) => Promise<unknown>;
        updateOutputFormat: (
          id: string,
          data: Record<string, unknown>,
        ) => Promise<unknown>;
        deleteOutputFormat: (id: string) => Promise<boolean>;
        reorderOutputFormat: (
          sourceId: string,
          itemId: string,
          order: number,
        ) => Promise<boolean>;
      };
    };

    await api.prompt.move("prompt/a", null, 2);
    await api.prompt.createRelation({
      sourcePromptId: "source/a",
      targetPromptId: "target/b",
      kind: "depends_on",
    });
    await api.prompt.listRelations({
      promptId: "source/a",
      direction: "outgoing",
    });
    await api.prompt.updateRelation("relation/a", { note: "required first" });
    await api.prompt.deleteRelation("relation/a");
    await api.prompt.createOutputFormat({
      sourcePromptId: "source/a",
      targetPromptId: null,
    });
    await api.prompt.listOutputFormat({ sourcePromptId: "source/a" });
    await api.prompt.updateOutputFormat("format/a", { sortOrder: 1 });
    await api.prompt.deleteOutputFormat("format/a");
    await api.prompt.reorderOutputFormat("source/a", "format/a", 1);

    expect(calls).toEqual([
      {
        url: "/api/prompts/prompt%2Fa/move",
        method: "POST",
        body: { parentId: null, sortOrder: 2 },
      },
      {
        url: "/api/prompts/relations",
        method: "POST",
        body: {
          sourcePromptId: "source/a",
          targetPromptId: "target/b",
          kind: "depends_on",
        },
      },
      {
        url: "/api/prompts/relations?promptId=source%2Fa&direction=outgoing",
        method: "GET",
        body: undefined,
      },
      {
        url: "/api/prompts/relations/relation%2Fa",
        method: "PUT",
        body: { note: "required first" },
      },
      {
        url: "/api/prompts/relations/relation%2Fa",
        method: "DELETE",
        body: undefined,
      },
      {
        url: "/api/prompts/output-formats",
        method: "POST",
        body: { sourcePromptId: "source/a", targetPromptId: null },
      },
      {
        url: "/api/prompts/output-formats?sourcePromptId=source%2Fa",
        method: "GET",
        body: undefined,
      },
      {
        url: "/api/prompts/output-formats/format%2Fa",
        method: "PUT",
        body: { sortOrder: 1 },
      },
      {
        url: "/api/prompts/output-formats/format%2Fa",
        method: "DELETE",
        body: undefined,
      },
      {
        url: "/api/prompts/output-formats/format%2Fa/reorder",
        method: "PUT",
        body: { sourcePromptId: "source/a", sortOrder: 1 },
      },
    ]);
  });

  it("encodes entity ids in desktop bridge API path segments", async () => {
    const installDesktopBridge = await loadInstallDesktopBridge();
    const calls: Array<{ url: string; method: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        calls.push({
          url,
          method: init?.method ?? "GET",
        });
        return new Response(
          JSON.stringify({ data: { ok: true, content: "exported" } }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }),
    );

    installDesktopBridge();

    const api = Reflect.get(window, "api") as {
      prompt: {
        get: (id: string) => Promise<unknown>;
        search: (query: Record<string, unknown>) => Promise<unknown>;
        update: (id: string, data: Record<string, unknown>) => Promise<unknown>;
        delete: (id: string) => Promise<boolean>;
        copy: (id: string) => Promise<unknown>;
      };
      version: {
        getAll: (promptId: string) => Promise<unknown>;
        create: (promptId: string, note?: string) => Promise<unknown>;
        rollback: (promptId: string, version: number) => Promise<unknown>;
        delete: (versionId: string) => Promise<boolean>;
      };
      folder: {
        update: (id: string, data: Record<string, unknown>) => Promise<unknown>;
        delete: (id: string) => Promise<boolean>;
      };
      skill: {
        get: (id: string) => Promise<unknown>;
        update: (id: string, data: Record<string, unknown>) => Promise<unknown>;
        delete: (id: string) => Promise<boolean>;
        versionGetAll: (skillId: string) => Promise<unknown>;
        versionCreate: (skillId: string, note?: string) => Promise<unknown>;
        versionRollback: (skillId: string, version: number) => Promise<unknown>;
        versionDelete: (skillId: string, versionId: string) => Promise<boolean>;
        saveSafetyReport: (
          skillId: string,
          report: Record<string, unknown>,
        ) => Promise<unknown>;
        export: (
          skillId: string,
          format: "skillmd" | "json",
        ) => Promise<string>;
      };
    };

    await api.prompt.get("prompt/a?b#c");
    await api.prompt.search({
      scope: "private",
      tags: ["legal,review", "landing page"],
    });
    await api.prompt.update("prompt/a?b#c", { title: "safe" });
    await api.prompt.delete("prompt/a?b#c");
    await api.prompt.copy("prompt/a?b#c");
    await api.version.getAll("prompt/a?b#c");
    await api.version.create("prompt/a?b#c", "snapshot");
    await api.version.rollback("prompt/a?b#c", 2);
    await api.version.delete("version/a?b#c");
    await api.folder.update("folder/a?b#c", { name: "safe" });
    await api.folder.delete("folder/a?b#c");
    await api.skill.get("skill/a?b#c");
    await api.skill.update("skill/a?b#c", { name: "safe" });
    await api.skill.delete("skill/a?b#c");
    await api.skill.versionGetAll("skill/a?b#c");
    await api.skill.versionCreate("skill/a?b#c", "snapshot");
    await api.skill.versionRollback("skill/a?b#c", 3);
    await api.skill.versionDelete("skill/a?b#c", "version/a?b#c");
    await api.skill.saveSafetyReport("skill/a?b#c", {
      level: "safe",
      findings: [],
      scannedAt: 1000,
      summary: "ok",
      recommendedAction: "allow",
      checkedFileCount: 1,
      scanMethod: "ai",
    });
    await api.skill.export("skill/a?b#c", "skillmd");

    expect(calls.map((call) => call.url)).toEqual([
      "/api/prompts/prompt%2Fa%3Fb%23c",
      "/api/prompts?scope=private&tag=legal%2Creview&tag=landing+page",
      "/api/prompts/prompt%2Fa%3Fb%23c",
      "/api/prompts/prompt%2Fa%3Fb%23c",
      "/api/prompts/prompt%2Fa%3Fb%23c/copy",
      "/api/prompts/prompt%2Fa%3Fb%23c/versions",
      "/api/prompts/prompt%2Fa%3Fb%23c/versions",
      "/api/prompts/prompt%2Fa%3Fb%23c/versions/2/rollback",
      "/api/prompts/versions/version%2Fa%3Fb%23c",
      "/api/folders/folder%2Fa%3Fb%23c",
      "/api/folders/folder%2Fa%3Fb%23c",
      "/api/skills/skill%2Fa%3Fb%23c",
      "/api/skills/skill%2Fa%3Fb%23c",
      "/api/skills/skill%2Fa%3Fb%23c",
      "/api/skills/skill%2Fa%3Fb%23c/versions",
      "/api/skills/skill%2Fa%3Fb%23c/versions",
      "/api/skills/skill%2Fa%3Fb%23c/versions/3/rollback",
      "/api/skills/skill%2Fa%3Fb%23c/versions/version%2Fa%3Fb%23c",
      "/api/skills/skill%2Fa%3Fb%23c/safety-report",
      "/api/skills/skill%2Fa%3Fb%23c/export",
    ]);
  });

  it("reports the build version through the web runtime updater bridge", async () => {
    const installDesktopBridge = await loadInstallDesktopBridge();

    installDesktopBridge();

    const electronBridge = Reflect.get(window, "electron") as {
      updater: {
        getVersion: () => Promise<string>;
      };
    };

    await expect(electronBridge.updater.getVersion()).resolves.toBe(
      `${rootPackage.version}-web`,
    );
  });

  it("rejects Desktop-owned skill filesystem and platform operations", async () => {
    const installDesktopBridge = await loadInstallDesktopBridge();

    installDesktopBridge();

    const api = Reflect.get(window, "api") as {
      skill: {
        writeLocalFile: (
          skillId: string,
          path: string,
          content: string,
        ) => Promise<boolean>;
        getSupportedPlatforms: () => Promise<unknown>;
        scanPlatformSkills: (platformId: string) => Promise<unknown>;
      };
    };

    await expect(
      api.skill.writeLocalFile("skill-1", "SKILL.md", "content"),
    ).rejects.toThrow(
      "Local skill-file writes is not supported in the web runtime",
    );
    await expect(api.skill.getSupportedPlatforms()).rejects.toThrow(
      "Local skill-platform discovery is not supported in the web runtime",
    );
    await expect(api.skill.scanPlatformSkills("claude")).rejects.toThrow(
      "Skill platform scanning is not supported in the web runtime",
    );
  });

  it("exposes the authenticated Web Agent inventory bridge", async () => {
    const inventory = {
      target: "logical-only",
      agents: [],
      capabilities: {
        inventory: true,
        settings: true,
        hostDetection: false,
        filesystemMutation: false,
        configFiles: false,
        providers: false,
        sessions: false,
        launch: false,
        maintenance: false,
      },
    };
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: inventory }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const installDesktopBridge = await loadInstallDesktopBridge();
    installDesktopBridge();

    const api = Reflect.get(window, "api") as {
      agent: {
        listManaged: () => Promise<typeof inventory>;
        getServiceManifest: (agentId: string) => Promise<unknown>;
        getService: (agentId: string, domain: string) => Promise<unknown>;
      };
    };

    await expect(api.agent.listManaged()).resolves.toEqual(inventory);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/agents",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );

    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              { domain: "skills", serviceAvailable: true, status: "available" },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { agentId: "custom/agent", domain: "skills" },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

    await expect(api.agent.getServiceManifest("custom/agent")).resolves.toEqual(
      [{ domain: "skills", serviceAvailable: true, status: "available" }],
    );
    await expect(
      api.agent.getService("custom/agent", "skills"),
    ).resolves.toEqual({
      agentId: "custom/agent",
      domain: "skills",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/agents/custom%2Fagent/services",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/agents/custom%2Fagent/services/skills",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
  });
});
