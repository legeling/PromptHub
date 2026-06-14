import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  exportDatabase,
  restoreFromBackup,
} from "../../../src/renderer/services/database-backup";
import { installWindowMocks } from "../../helpers/window";

const state = vi.hoisted(() => ({
  folders: [] as any[],
  prompts: [] as any[],
  promptRelations: [] as any[],
  promptVersions: new Map<string, any[]>(),
  skills: [] as any[],
  skillVersions: new Map<string, any[]>(),
  skillRepoPaths: new Map<string, string>(),
  nextSkillId: 1,
}));

vi.mock("../../../src/renderer/services/database", () => ({
  clearDatabase: async () => undefined,
  getAllFolders: async () => state.folders,
  getAllPrompts: async () => state.prompts,
  listPromptRelations: async () => state.promptRelations,
  getDatabase: async () => {
    throw new Error("IndexedDB fallback should not be used in filesystem integration test");
  },
}));

vi.mock("../../../src/renderer/services/settings-snapshot", () => ({
  getAiConfigSnapshot: () => ({
    aiProvider: "openai",
    aiApiKey: "integration-key",
  }),
  getSettingsStateSnapshot: () => ({
    state: { language: "en", theme: "dark" },
    settingsUpdatedAt: "2026-04-16T00:00:00.000Z",
  }),
  restoreAiConfigSnapshot: vi.fn(),
  restoreSettingsStateSnapshot: vi.fn(),
}));

async function listFilesRecursively(rootDir: string): Promise<Array<{ path: string; content: string }>> {
  const result: Array<{ path: string; content: string }> = [];

  async function walk(currentDir: string, relativePrefix = ""): Promise<void> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      const relativePath = relativePrefix
        ? path.join(relativePrefix, entry.name)
        : entry.name;

      if (entry.isDirectory()) {
        await walk(absolutePath, relativePath);
        continue;
      }

      result.push({
        path: relativePath.replaceAll(path.sep, "/"),
        content: await fs.readFile(absolutePath, "utf8"),
      });
    }
  }

  await walk(rootDir);
  return result;
}

describe("database-backup filesystem integration", () => {
  let tempRoot: string;
  let imagesDir: string;
  let videosDir: string;
  let skillsRoot: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "prompthub-backup-fs-"));
    imagesDir = path.join(tempRoot, "images");
    videosDir = path.join(tempRoot, "videos");
    skillsRoot = path.join(tempRoot, "skills");

    await Promise.all([
      fs.mkdir(imagesDir, { recursive: true }),
      fs.mkdir(videosDir, { recursive: true }),
      fs.mkdir(skillsRoot, { recursive: true }),
    ]);

    state.folders = [
      {
        id: "folder-1",
        name: "Integration Folder",
        parentId: null,
        order: 0,
        createdAt: "2026-04-16T00:00:00.000Z",
        updatedAt: "2026-04-16T00:00:00.000Z",
      },
    ];
    state.prompts = [
      {
        id: "prompt-1",
        title: "Integration Prompt",
        description: "Filesystem round-trip",
        promptType: "text",
        systemPrompt: "You are the integration prompt.",
        userPrompt: "Verify {{target}} from backup.",
        variables: [
          {
            name: "target",
            type: "text",
            required: true,
          },
        ],
        tags: ["backup", "filesystem"],
        folderId: "folder-1",
        images: ["integration-image.png"],
        videos: ["integration-video.mp4"],
        isFavorite: false,
        isPinned: false,
        version: 2,
        currentVersion: 2,
        usageCount: 0,
        notes: "Filesystem backup note",
        createdAt: "2026-04-16T00:00:00.000Z",
        updatedAt: "2026-04-16T00:00:00.000Z",
      },
      {
        id: "prompt-2",
        title: "Integration Context",
        description: "Relation target",
        promptType: "text",
        systemPrompt: "",
        userPrompt: "Context prompt.",
        variables: [],
        tags: ["backup"],
        folderId: "folder-1",
        images: [],
        videos: [],
        isFavorite: false,
        isPinned: false,
        version: 1,
        currentVersion: 1,
        usageCount: 0,
        createdAt: "2026-04-16T00:00:00.000Z",
        updatedAt: "2026-04-16T00:00:00.000Z",
      },
    ];
    state.promptRelations = [
      {
        id: "relation-1",
        sourcePromptId: "prompt-1",
        targetPromptId: "prompt-2",
        kind: "related_to",
        note: "Shared context",
        createdAt: "2026-04-16T00:00:00.000Z",
        updatedAt: "2026-04-16T00:00:00.000Z",
      },
    ];
    state.promptVersions = new Map([
      [
        "prompt-1",
        [
          {
            id: "prompt-version-1",
            promptId: "prompt-1",
            version: 1,
            systemPrompt: "You are the integration prompt.",
            userPrompt: "Verify {{target}} from backup.",
            variables: [
              {
                name: "target",
                type: "text",
                required: true,
              },
            ],
            note: "Initial snapshot",
            createdAt: "2026-04-16T00:00:00.000Z",
          },
        ],
      ],
    ]);

    const skillRepoPath = path.join(skillsRoot, "integration-skill");
    await fs.mkdir(path.join(skillRepoPath, "notes"), { recursive: true });
    await fs.writeFile(
      path.join(skillRepoPath, "SKILL.md"),
      "# Integration Skill\n\nFilesystem backup content.",
      "utf8",
    );
    await fs.writeFile(
      path.join(skillRepoPath, "notes", "example.md"),
      "Filesystem skill note",
      "utf8",
    );

    state.skills = [
      {
        id: "skill-1",
        name: "integration-skill",
        description: "Filesystem integration skill",
        instructions: "# Integration Skill\n\nFilesystem backup content.",
        content: "# Integration Skill\n\nFilesystem backup content.",
        protocol_type: "skill",
        version: "1.0.0",
        author: "PromptHub",
        tags: ["backup", "filesystem"],
        is_favorite: false,
        currentVersion: 1,
        created_at: 1,
        updated_at: 1,
      },
    ];
    state.skillVersions = new Map([
      [
        "skill-1",
        [
          {
            id: "skill-version-1",
            skillId: "skill-1",
            version: 1,
            content: "# Integration Skill\n\nFilesystem backup content.",
            note: "Initial skill snapshot",
            createdAt: "2026-04-16T00:00:00.000Z",
          },
        ],
      ],
    ]);
    state.skillRepoPaths = new Map([["skill-1", skillRepoPath]]);
    state.nextSkillId = 2;

    await fs.writeFile(
      path.join(imagesDir, "integration-image.png"),
      Buffer.from("integration-image-bytes"),
    );
    await fs.writeFile(
      path.join(videosDir, "integration-video.mp4"),
      Buffer.from("integration-video-bytes"),
    );

    installWindowMocks({
      api: {
        prompt: {
          getAll: vi.fn(async () => state.prompts),
          delete: vi.fn(async (promptId: string) => {
            state.prompts = state.prompts.filter((prompt) => prompt.id !== promptId);
            state.promptVersions.delete(promptId);
            state.promptRelations = state.promptRelations.filter(
              (relation) =>
                relation.sourcePromptId !== promptId &&
                relation.targetPromptId !== promptId,
            );
            return true;
          }),
          insertDirect: vi.fn(async (prompt: any) => {
            state.prompts.push(prompt);
          }),
          createRelation: vi.fn(async (relation: any) => {
            state.promptRelations.push({
              id: `restored-${state.promptRelations.length + 1}`,
              createdAt: "2026-04-16T00:00:00.000Z",
              updatedAt: "2026-04-16T00:00:00.000Z",
              ...relation,
            });
          }),
          syncWorkspace: vi.fn(async () => undefined),
        },
        folder: {
          getAll: vi.fn(async () => state.folders),
          delete: vi.fn(async (folderId: string) => {
            state.folders = state.folders.filter((folder) => folder.id !== folderId);
            return true;
          }),
          insertDirect: vi.fn(async (folder: any) => {
            state.folders.push(folder);
          }),
        },
        version: {
          getAll: vi.fn(async (promptId: string) => state.promptVersions.get(promptId) ?? []),
          insertDirect: vi.fn(async (version: any) => {
            const versions = state.promptVersions.get(version.promptId) ?? [];
            versions.push(version);
            state.promptVersions.set(version.promptId, versions);
          }),
        },
        skill: {
          getAll: vi.fn(async () => state.skills),
          versionGetAll: vi.fn(async (skillId: string) => state.skillVersions.get(skillId) ?? []),
          readLocalFiles: vi.fn(async (skillId: string) => {
            const repoPath = state.skillRepoPaths.get(skillId);
            if (!repoPath) {
              return [];
            }
            return (await listFilesRecursively(repoPath)).map((file) => ({
              path: file.path,
              content: file.content,
              isDirectory: false,
            }));
          }),
          deleteAll: vi.fn(async () => {
            state.skills = [];
            state.skillVersions.clear();
            state.skillRepoPaths.clear();
          }),
          create: vi.fn(async (input: any) => {
            const id = `restored-skill-${state.nextSkillId++}`;
            const repoPath = path.join(skillsRoot, id);
            await fs.mkdir(repoPath, { recursive: true });

            const restoredSkill = {
              ...input,
              id,
              created_at: Date.now(),
              updated_at: Date.now(),
            };
            state.skills.push(restoredSkill);
            state.skillRepoPaths.set(id, repoPath);
            return restoredSkill;
          }),
          insertVersionDirect: vi.fn(async (version: any) => {
            const versions = state.skillVersions.get(version.skillId) ?? [];
            versions.push(version);
            state.skillVersions.set(version.skillId, versions);
          }),
          update: vi.fn(async (skillId: string, patch: any) => {
            state.skills = state.skills.map((skill) =>
              skill.id === skillId ? { ...skill, ...patch } : skill,
            );
          }),
          writeLocalFile: vi.fn(async (skillId: string, relativePath: string, content: string) => {
            const repoPath = state.skillRepoPaths.get(skillId);
            if (!repoPath) {
              throw new Error(`Unknown skill repo path for ${skillId}`);
            }
            const filePath = path.join(repoPath, relativePath);
            await fs.mkdir(path.dirname(filePath), { recursive: true });
            await fs.writeFile(filePath, content, "utf8");
          }),
        },
      },
      electron: {
        getImageSize: vi.fn(async (fileName: string) => {
          const stat = await fs.stat(path.join(imagesDir, fileName));
          return stat.size;
        }),
        readImageBase64: vi.fn(async (fileName: string) => {
          const buffer = await fs.readFile(path.join(imagesDir, fileName));
          return buffer.toString("base64");
        }),
        saveImageBase64: vi.fn(async (fileName: string, base64: string) => {
          await fs.writeFile(path.join(imagesDir, fileName), Buffer.from(base64, "base64"));
          return true;
        }),
        getVideoSize: vi.fn(async (fileName: string) => {
          const stat = await fs.stat(path.join(videosDir, fileName));
          return stat.size;
        }),
        readVideoBase64: vi.fn(async (fileName: string) => {
          const buffer = await fs.readFile(path.join(videosDir, fileName));
          return buffer.toString("base64");
        }),
        saveVideoBase64: vi.fn(async (fileName: string, base64: string) => {
          await fs.writeFile(path.join(videosDir, fileName), Buffer.from(base64, "base64"));
          return true;
        }),
      },
    });
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("round-trips media files and skill files through the backup service with real filesystem IO", async () => {
    const backup = await exportDatabase();

    expect(backup.versions).toEqual([
      expect.objectContaining({
        id: "prompt-version-1",
        promptId: "prompt-1",
        note: "Initial snapshot",
      }),
    ]);
    expect(backup.promptRelations).toEqual([
      expect.objectContaining({
        sourcePromptId: "prompt-1",
        targetPromptId: "prompt-2",
        kind: "related_to",
      }),
    ]);
    expect(backup.images).toEqual({
      "integration-image.png": Buffer.from("integration-image-bytes").toString("base64"),
    });
    expect(backup.videos).toEqual({
      "integration-video.mp4": Buffer.from("integration-video-bytes").toString("base64"),
    });
    expect(backup.skillFiles?.["skill-1"]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relativePath: "SKILL.md",
        }),
        expect.objectContaining({
          relativePath: "notes/example.md",
          content: "Filesystem skill note",
        }),
      ]),
    );

    state.prompts = [];
    state.folders = [];
    state.promptRelations = [];
    state.promptVersions.clear();
    state.skills = [];
    state.skillVersions.clear();
    state.skillRepoPaths.clear();

    await fs.writeFile(path.join(imagesDir, "integration-image.png"), "corrupted", "utf8");
    await fs.writeFile(path.join(videosDir, "integration-video.mp4"), "corrupted", "utf8");

    await restoreFromBackup(backup);

    expect(state.prompts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Integration Prompt",
          notes: "Filesystem backup note",
        }),
        expect.objectContaining({
          title: "Integration Context",
        }),
      ]),
    );
    expect(state.promptRelations).toEqual([
      expect.objectContaining({
        sourcePromptId: "prompt-1",
        targetPromptId: "prompt-2",
        kind: "related_to",
      }),
    ]);
    expect(state.folders).toEqual([
      expect.objectContaining({
        name: "Integration Folder",
      }),
    ]);

    const restoredPrompt = state.prompts[0];
    const restoredPromptVersions = state.promptVersions.get(restoredPrompt.id) ?? [];
    expect(restoredPromptVersions).toEqual([
      expect.objectContaining({
        id: "prompt-version-1",
        note: "Initial snapshot",
      }),
    ]);

    expect(state.skills).toHaveLength(1);
    const restoredSkill = state.skills[0];
    const restoredSkillVersions = state.skillVersions.get(restoredSkill.id) ?? [];
    expect(restoredSkillVersions).toEqual([
      expect.objectContaining({
        id: "skill-version-1",
        note: "Initial skill snapshot",
      }),
    ]);

    const restoredImageBytes = await fs.readFile(
      path.join(imagesDir, "integration-image.png"),
      "utf8",
    );
    const restoredVideoBytes = await fs.readFile(
      path.join(videosDir, "integration-video.mp4"),
      "utf8",
    );
    expect(restoredImageBytes).toBe("integration-image-bytes");
    expect(restoredVideoBytes).toBe("integration-video-bytes");

    const restoredSkillFiles = await listFilesRecursively(
      state.skillRepoPaths.get(restoredSkill.id)!,
    );
    expect(restoredSkillFiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "SKILL.md",
          content: "# Integration Skill\n\nFilesystem backup content.",
        }),
        expect.objectContaining({
          path: "notes/example.md",
          content: "Filesystem skill note",
        }),
      ]),
    );
  });
});
