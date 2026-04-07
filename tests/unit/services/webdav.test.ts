import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  testConnection,
  incrementalUpload,
  incrementalDownload,
  downloadFromWebDAV,
  uploadToWebDAV,
} from "../../../src/renderer/services/webdav";
import * as backup from "../../../src/renderer/services/database-backup";

// Mock backup workflow service
vi.mock("../../../src/renderer/services/database-backup", () => ({
  exportDatabase: vi.fn(),
  restoreFromBackup: vi.fn(),
}));

describe("WebDAV Service", () => {
  const mockConfig = {
    url: "https://example.com/dav/",
    username: "user",
    password: "pass",
  };

  beforeEach(() => {
    vi.clearAllMocks();

    global.fetch = vi.fn();
    window.api.skill.create.mockReset();

    Object.defineProperty(global, "crypto", {
      value: {
        subtle: {
          digest: vi
            .fn()
            .mockResolvedValue(new Uint8Array([0xde, 0xad, 0xbe, 0xef]).buffer),
          importKey: vi.fn(),
          deriveKey: vi.fn(),
          encrypt: vi.fn(),
          decrypt: vi.fn(),
        },
        getRandomValues: vi.fn((arr) => {
          for (let i = 0; i < arr.length; i++) arr[i] = 0;
          return arr;
        }),
      },
      writable: true,
    });
  });

  describe("testConnection", () => {
    it("should prefer window.electron.webdav if available", async () => {
      const mockTestConnection = vi
        .fn()
        .mockResolvedValue({ success: true, message: "OK" });
      window.electron = {
        ...window.electron,
        webdav: {
          testConnection: mockTestConnection,
          upload: vi.fn(),
          download: vi.fn(),
          ensureDirectory: vi.fn(),
        },
      } as any;

      const result = await testConnection(mockConfig);

      expect(mockTestConnection).toHaveBeenCalledWith(mockConfig);
      expect(result.success).toBe(true);
    });

    it("should fallback to fetch if electron API is missing", async () => {
      window.electron = { ipcRenderer: window.electron.ipcRenderer } as any;

      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
      });

      const result = await testConnection(mockConfig);

      expect(global.fetch).toHaveBeenCalledWith(
        mockConfig.url,
        expect.objectContaining({
          method: "PROPFIND",
          headers: expect.objectContaining({
            Authorization: expect.stringContaining("Basic"),
          }),
        }),
      );
      expect(result.success).toBe(true);
    });

    it("should handle 401 Unauthorized", async () => {
      window.electron = { ipcRenderer: window.electron.ipcRenderer } as any;

      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      });

      const result = await testConnection(mockConfig);
      expect(result.success).toBe(false);
      expect(result.message).toContain("Authentication failed");
    });
  });

  describe("incrementalUpload", () => {
    it("should perform incremental upload logic", async () => {
      /* @ts-ignore */
      backup.exportDatabase.mockResolvedValue({
        prompts: [{ id: 1, content: "test" }],
        folders: [],
        version: "4.0",
        images: {},
        settings: {},
        aiConfig: {},
      });

      const mockEnsureDir = vi.fn().mockResolvedValue(undefined);
      const mockDownload = vi
        .fn()
        .mockResolvedValue({ success: false, notFound: true });
      const mockUpload = vi.fn().mockResolvedValue({ success: true });

      window.electron = {
        ...window.electron,
        webdav: {
          ensureDirectory: mockEnsureDir,
          download: mockDownload,
          upload: mockUpload,
        },
      } as any;

      const result = await incrementalUpload(mockConfig);

      expect(mockEnsureDir).toHaveBeenCalled();
      expect(mockDownload).toHaveBeenCalledWith(
        expect.stringContaining("manifest.json"),
        mockConfig,
      );
      expect(mockUpload).toHaveBeenCalledWith(
        expect.stringContaining("data.json"),
        mockConfig,
        expect.any(String),
      );
      expect(mockUpload).toHaveBeenCalledWith(
        expect.stringContaining("manifest.json"),
        mockConfig,
        expect.any(String),
      );

      expect(result.success).toBe(true);
      expect(result.localChanged).toBe(false);
    });

    it("uploads full skill payload in incremental mode", async () => {
      /* @ts-ignore */
      backup.exportDatabase.mockResolvedValue({
        prompts: [{ id: 1, content: "test" }],
        folders: [],
        versions: [],
        version: "4.0",
        images: {},
        settings: {},
        aiConfig: {},
        skills: [{ id: "skill-1", name: "writer" }],
        skillVersions: [{ id: "ver-1", skillId: "skill-1", version: 1 }],
        skillFiles: {
          "skill-1": [{ relativePath: "SKILL.md", content: "# Writer" }],
        },
      });

      const mockDownload = vi
        .fn()
        .mockResolvedValue({ success: false, notFound: true });
      const mockUpload = vi.fn().mockResolvedValue({ success: true });

      window.electron = {
        ...window.electron,
        webdav: {
          ensureDirectory: vi.fn().mockResolvedValue(undefined),
          download: mockDownload,
          upload: mockUpload,
        },
      } as any;

      await incrementalUpload(mockConfig);

      const dataUploadCall = mockUpload.mock.calls.find(([url]) =>
        String(url).includes("data.json"),
      );
      expect(dataUploadCall).toBeTruthy();

      const uploadedPayload = JSON.parse(String(dataUploadCall?.[2]));
      expect(uploadedPayload.skills).toEqual([{ id: "skill-1", name: "writer" }]);
      expect(uploadedPayload.skillVersions).toEqual([
        { id: "ver-1", skillId: "skill-1", version: 1 },
      ]);
      expect(uploadedPayload.skillFiles).toEqual({
        "skill-1": [{ relativePath: "SKILL.md", content: "# Writer" }],
      });
    });

    it("skips manifest upload when nothing changed", async () => {
      /* @ts-ignore */
      backup.exportDatabase.mockResolvedValue({
        prompts: [{ id: 1, content: "test", videos: [] }],
        folders: [],
        version: "4.0",
        images: {},
        settings: {},
        aiConfig: {},
      });

      const unchangedManifest = JSON.stringify({
        version: "4.0",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        dataHash: "deadbeef",
        images: {},
        videos: {},
        encrypted: false,
      });
      const mockEnsureDir = vi.fn().mockResolvedValue(undefined);
      const mockDownload = vi.fn().mockResolvedValue({
        success: true,
        data: unchangedManifest,
      });
      const mockUpload = vi.fn().mockResolvedValue({ success: true });

      window.electron = {
        ...window.electron,
        webdav: {
          ensureDirectory: mockEnsureDir,
          download: mockDownload,
          upload: mockUpload,
        },
      } as any;

      const result = await incrementalUpload(mockConfig);

      expect(result.success).toBe(true);
      expect(result.localChanged).toBe(false);
      expect(result.message).toContain("Already up to date");
      expect(mockUpload).not.toHaveBeenCalledWith(
        expect.stringContaining("manifest.json"),
        mockConfig,
        expect.any(String),
      );
    });
  });

  describe("legacy upload", () => {
    it("uploads full skill payload in legacy mode", async () => {
      /* @ts-ignore */
      backup.exportDatabase.mockResolvedValue({
        prompts: [{ id: 1, content: "test" }],
        folders: [],
        versions: [],
        version: "4.0",
        images: {},
        videos: {},
        settings: {},
        aiConfig: {},
        skills: [{ id: "skill-1", name: "writer" }],
        skillVersions: [{ id: "ver-1", skillId: "skill-1", version: 1 }],
        skillFiles: {
          "skill-1": [{ relativePath: "SKILL.md", content: "# Writer" }],
        },
      });

      const mockUpload = vi.fn().mockResolvedValue({ success: true });

      window.electron = {
        ...window.electron,
        webdav: {
          ensureDirectory: vi.fn().mockResolvedValue(undefined),
          upload: mockUpload,
          download: vi.fn(),
        },
      } as any;

      await uploadToWebDAV(mockConfig, { incrementalSync: false });

      const legacyUploadCall = mockUpload.mock.calls.find(([url]) =>
        String(url).includes("prompthub-backup.json"),
      );
      expect(legacyUploadCall).toBeTruthy();

      const uploadedPayload = JSON.parse(String(legacyUploadCall?.[2]));
      expect(uploadedPayload.skills).toEqual([{ id: "skill-1", name: "writer" }]);
      expect(uploadedPayload.skillVersions).toEqual([
        { id: "ver-1", skillId: "skill-1", version: 1 },
      ]);
      expect(uploadedPayload.skillFiles).toEqual({
        "skill-1": [{ relativePath: "SKILL.md", content: "# Writer" }],
      });
    });
  });

  describe("download flows", () => {
    it("restores skills through the shared backup pipeline in incremental mode", async () => {
      const manifest = JSON.stringify({
        version: "4.0",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        dataHash: "deadbeef",
        images: {},
        videos: {},
        encrypted: false,
      });
      const data = JSON.stringify({
        version: "4.0",
        exportedAt: "2026-01-01T00:00:00.000Z",
        prompts: [],
        folders: [],
        versions: [],
        skills: [{ id: "skill-1", name: "writer" }],
        skillVersions: [{ id: "ver-1", skillId: "skill-1", version: 1 }],
        skillFiles: {
          "skill-1": [{ relativePath: "SKILL.md", content: "# Writer" }],
        },
      });

      const mockDownload = vi.fn(async (url: string) => {
        if (url.includes("manifest.json")) {
          return { success: true, data: manifest };
        }
        if (url.includes("data.json")) {
          return { success: true, data };
        }
        return { success: false, notFound: true };
      });

      window.electron = {
        ...window.electron,
        webdav: {
          ensureDirectory: vi.fn().mockResolvedValue(undefined),
          download: mockDownload,
          upload: vi.fn(),
        },
      } as any;

      await incrementalDownload(mockConfig);

      expect(backup.restoreFromBackup).toHaveBeenCalledWith(
        expect.objectContaining({
          skills: [{ id: "skill-1", name: "writer" }],
          skillVersions: [{ id: "ver-1", skillId: "skill-1", version: 1 }],
          skillFiles: {
            "skill-1": [{ relativePath: "SKILL.md", content: "# Writer" }],
          },
        }),
      );
      expect(window.api.skill.create).not.toHaveBeenCalled();
    });

    it("restores skills through the shared backup pipeline in legacy mode", async () => {
      const rawBackup = JSON.stringify({
        version: "3.1",
        exportedAt: "2026-01-01T00:00:00.000Z",
        prompts: [],
        folders: [],
        versions: [],
        skills: [{ id: "skill-1", name: "writer" }],
        skillVersions: [{ id: "ver-1", skillId: "skill-1", version: 1 }],
        skillFiles: {
          "skill-1": [{ relativePath: "SKILL.md", content: "# Writer" }],
        },
      });

      window.electron = {
        ...window.electron,
        webdav: {
          download: vi.fn().mockResolvedValue({
            success: true,
            data: rawBackup,
          }),
          upload: vi.fn(),
          ensureDirectory: vi.fn(),
        },
      } as any;

      await downloadFromWebDAV(mockConfig, { incrementalSync: false });

      expect(backup.restoreFromBackup).toHaveBeenCalledWith(
        expect.objectContaining({
          skills: [{ id: "skill-1", name: "writer" }],
          skillVersions: [{ id: "ver-1", skillId: "skill-1", version: 1 }],
          skillFiles: {
            "skill-1": [{ relativePath: "SKILL.md", content: "# Writer" }],
          },
        }),
      );
      expect(window.api.skill.create).not.toHaveBeenCalled();
    });
  });
});
