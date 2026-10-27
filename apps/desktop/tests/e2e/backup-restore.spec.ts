import fs from "fs";
import path from "path";
import { expect, test } from "@playwright/test";
import Database from "@prompthub/db/adapter";
import { PromptDB } from "@prompthub/db/prompt";
import { resolveRuntimeStorageContext } from "@prompthub/core/runtime-storage-context";

import {
  closePromptHub,
  launchPromptHub,
  setAppLanguage,
} from "./helpers/electron";

const IMAGE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn0l1cAAAAASUVORK5CYII=";
const VIDEO_BASE64 = Buffer.from("prompthub-backup-video").toString("base64");

test.describe("E2E: backup restore", () => {
  test("exports and restores prompts, versions, media, and skill files through the real backup pipeline", async () => {
    const launched = await launchPromptHub(null);
    const { userDataDir } = launched;
    let { app, page } = launched;

    try {
      await setAppLanguage(page, "en");

      const exported = await page.evaluate(
        async ({ imageBase64, videoBase64 }) => {
          if (!window.__PROMPTHUB_E2E_BACKUP__) {
            throw new Error("E2E backup bridge is unavailable");
          }

          const imageFileName = "backup-image.png";
          const videoFileName = "backup-video.mp4";

          const folder = await window.api.folder.create({
            name: "Backup Folder",
          });

          await window.electron.saveImageBase64?.(imageFileName, imageBase64);
          await window.electron.saveVideoBase64?.(videoFileName, videoBase64);

          const prompt = await window.api.prompt.create({
            title: "Backup Prompt",
            description: "Backed up from E2E",
            promptType: "text",
            systemPrompt: "You are the backup validation prompt.",
            userPrompt: "Validate the backup for {{target}}.",
            variables: [
              {
                name: "target",
                type: "text",
                required: true,
              },
            ],
            tags: ["backup", "e2e"],
            folderId: folder.id,
            images: [imageFileName],
            videos: [videoFileName],
            notes: "Backup note",
          });

          const promptVersion = await window.api.version.create(
            prompt.id,
            "Backup snapshot",
          );

          const skill = await window.api.skill.create({
            name: "backup-skill",
            description: "Skill included in E2E backup",
            instructions: "# Backup Skill\n\nFollow the E2E restore path.",
            content: "# Backup Skill\n\nFollow the E2E restore path.",
            protocol_type: "skill",
            version: "1.0.0",
            author: "PromptHub E2E",
            tags: ["backup", "e2e"],
            source_id: "backup-skill-source-id",
            source_label: "backup/source",
            source_branch: "release",
            source_directory: "skills/.curated/backup-skill",
            canonical_skill_path: "skills/.curated/backup-skill/SKILL.md",
            is_favorite: false,
            currentVersion: 1,
            versionTrackingEnabled: true,
          });

          await window.api.skill.writeLocalFile(
            skill.id,
            "notes/example.md",
            "Backed up skill note",
          );
          await window.api.skill.versionCreate(skill.id, "Backup snapshot");

          const repoPath = await window.api.skill.getRepoPath(skill.id);
          const backup = await window.__PROMPTHUB_E2E_BACKUP__.exportDatabase();

          return {
            backup,
            promptId: prompt.id,
            folderId: folder.id,
            skillId: skill.id,
            promptVersionId: promptVersion.id,
            repoPath,
          };
        },
        {
          imageBase64: IMAGE_BASE64,
          videoBase64: VIDEO_BASE64,
        },
      );

      expect(
        exported.backup.prompts.some(
          (prompt) => prompt.id === exported.promptId,
        ),
      ).toBe(true);
      expect(
        exported.backup.versions.some(
          (version) => version.id === exported.promptVersionId,
        ),
      ).toBe(true);
      expect(exported.backup.images?.["backup-image.png"]).toBe(IMAGE_BASE64);
      expect(exported.backup.videos?.["backup-video.mp4"]).toBe(VIDEO_BASE64);
      expect(
        exported.backup.skills?.some((skill) => skill.id === exported.skillId),
      ).toBe(true);
      expect(
        exported.backup.skills?.some(
          (skill) =>
            skill.id === exported.skillId &&
            skill.source_id === "backup-skill-source-id" &&
            skill.source_directory === "skills/.curated/backup-skill" &&
            skill.canonical_skill_path ===
              "skills/.curated/backup-skill/SKILL.md",
        ),
      ).toBe(true);
      expect(
        exported.backup.skillFiles?.[exported.skillId]?.some(
          (file) =>
            file.relativePath === "notes/example.md" &&
            file.content === "Backed up skill note",
        ),
      ).toBe(true);

      await page.evaluate(async (backup) => {
        if (!window.__PROMPTHUB_E2E_BACKUP__) {
          throw new Error("E2E backup bridge is unavailable");
        }

        const prompts = await window.api.prompt.getAll();
        for (const prompt of prompts) {
          await window.api.prompt.delete(prompt.id);
        }

        const folders = await window.api.folder.getAll();
        for (const folder of folders) {
          await window.api.folder.delete(folder.id);
        }

        await window.api.skill.deleteAll();
        await window.electron.saveImageBase64?.(
          "backup-image.png",
          "Y29ycnVwdGVkLWltYWdl",
        );
        await window.electron.saveVideoBase64?.(
          "backup-video.mp4",
          "Y29ycnVwdGVkLXZpZGVv",
        );

        await window.__PROMPTHUB_E2E_BACKUP__.restoreFromBackup(backup);
      }, exported.backup);

      // Atomic restore requires relaunch; E2E intentionally disables the OS scheduler.
      await closePromptHub(app, userDataDir, { preserveUserDataDir: true });
      ({ app, page } = await launchPromptHub(null, { userDataDir }));
      const restored = await page.evaluate(async () => {
        const prompts = await window.api.prompt.getAll();
        const folders = await window.api.folder.getAll();
        const skills = await window.api.skill.getAll();
        const restoredPrompt = prompts.find(
          (prompt) => prompt.title === "Backup Prompt",
        );
        const restoredSkill = skills.find(
          (skill) => skill.name === "backup-skill",
        );

        if (!restoredPrompt || !restoredSkill) {
          throw new Error("Restored prompt or skill is missing");
        }

        const promptVersions = await window.api.version.getAll(
          restoredPrompt.id,
        );
        const skillFiles = await window.api.skill.readLocalFiles(
          restoredSkill.id,
        );
        const repoPath = await window.api.skill.getRepoPath(restoredSkill.id);
        const imageBase64 =
          await window.electron.readImageBase64?.("backup-image.png");
        const videoBase64 =
          await window.electron.readVideoBase64?.("backup-video.mp4");

        return {
          promptId: restoredPrompt.id,
          folderId: restoredPrompt.folderId,
          promptTitle: restoredPrompt.title,
          promptNotes: restoredPrompt.notes,
          promptVersions: promptVersions.map((version) => ({
            id: version.id,
            note: version.note,
          })),
          folders: folders.map((folder) => ({
            id: folder.id,
            name: folder.name,
          })),
          skillId: restoredSkill.id,
          skillSourceId: restoredSkill.source_id ?? null,
          skillSourceDirectory: restoredSkill.source_directory ?? null,
          skillCanonicalSkillPath: restoredSkill.canonical_skill_path ?? null,
          skillRepoPath: repoPath,
          skillFiles: skillFiles.map((file) => ({
            path: file.path,
            content: file.content,
          })),
          imageBase64,
          videoBase64,
        };
      });

      expect(restored.promptTitle).toBe("Backup Prompt");
      expect(restored.promptNotes).toBe("Backup note");
      expect(restored.folders).toEqual([
        expect.objectContaining({
          id: restored.folderId,
          name: "Backup Folder",
        }),
      ]);
      expect(
        restored.promptVersions.some(
          (version) => version.note === "Backup snapshot",
        ),
      ).toBe(true);
      expect(restored.imageBase64).toBe(IMAGE_BASE64);
      expect(restored.videoBase64).toBe(VIDEO_BASE64);
      expect(restored.skillSourceId).toBe("backup-skill-source-id");
      expect(restored.skillSourceDirectory).toBe(
        "skills/.curated/backup-skill",
      );
      expect(restored.skillCanonicalSkillPath).toBe(
        "skills/.curated/backup-skill/SKILL.md",
      );
      expect(restored.skillFiles).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "notes/example.md",
            content: "Backed up skill note",
          }),
        ]),
      );

      const imagePath = path.join(
        userDataDir,
        "data",
        "assets",
        "images",
        "backup-image.png",
      );
      const videoPath = path.join(
        userDataDir,
        "data",
        "assets",
        "videos",
        "backup-video.mp4",
      );
      const skillFilePath = path.join(
        restored.skillRepoPath,
        "notes",
        "example.md",
      );

      expect(fs.existsSync(imagePath)).toBe(true);
      expect(fs.existsSync(videoPath)).toBe(true);
      const database = new Database(
        resolveRuntimeStorageContext(userDataDir).databasePath,
        { readOnly: true },
      );
      try {
        expect(new PromptDB(database).getById(restored.promptId)).toMatchObject(
          {
            id: restored.promptId,
            title: "Backup Prompt",
            notes: "Backup note",
          },
        );
      } finally {
        database.close();
      }
      expect(fs.existsSync(skillFilePath)).toBe(true);
      expect(fs.readFileSync(skillFilePath, "utf8")).toBe(
        "Backed up skill note",
      );
    } finally {
      await closePromptHub(app, userDataDir);
    }
  });
});
