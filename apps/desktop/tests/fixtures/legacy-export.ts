import type {
  Folder,
  Prompt,
  PromptVersion,
  Skill,
} from "@prompthub/shared/types";
import { zipSync } from "fflate";

export const legacyExportedAt = "2026-06-01T00:00:00.000Z";
export const legacyImage = Buffer.from([137, 80, 78, 71, 0, 128, 255]);
export const legacyBinary = Buffer.from([0, 255, 128, 17]);
export const legacySkillContent =
  "---\nname: legacy-skill\ndescription: Historical package\n---\nKeep all files\n";
export const legacyFolder: Folder = {
  id: "legacy-folder",
  name: "Historical folder",
  order: 0,
  createdAt: legacyExportedAt,
  updatedAt: legacyExportedAt,
};
export const legacyPrompt: Prompt = {
  id: "legacy-prompt",
  title: "Historical prompt",
  userPrompt: "Original body 中文",
  folderId: legacyFolder.id,
  variables: [],
  tags: ["historical"],
  images: ["legacy.png"],
  videos: [],
  isFavorite: true,
  isPinned: false,
  version: 2,
  currentVersion: 2,
  usageCount: 3,
  createdAt: legacyExportedAt,
  updatedAt: legacyExportedAt,
};
export const legacyVersions: PromptVersion[] = [1, 2].map((version) => ({
  id: `legacy-version-${version}`,
  promptId: legacyPrompt.id,
  version,
  userPrompt: version === 1 ? "First body" : legacyPrompt.userPrompt,
  variables: [],
  createdAt: legacyExportedAt,
}));
export const legacySkill: Skill = {
  id: "legacy-skill-id",
  name: "legacy-skill",
  content: legacySkillContent,
  protocol_type: "skill",
  is_favorite: true,
  currentVersion: 1,
  created_at: 1,
  updated_at: 2,
};

// Reconstructs the v0.5.8/v0.5.9 writer layout using synthetic public data.
// The JSON is authoritative for records; the ZIP also carries raw package files.
export function legacyExportPayload(): Record<string, unknown> {
  return {
    version: 1,
    exportedAt: legacyExportedAt,
    prompts: [legacyPrompt],
    folders: [legacyFolder],
    versions: legacyVersions,
    images: { "legacy.png": legacyImage.toString("base64") },
    skills: [legacySkill],
    skillVersions: [
      {
        id: "legacy-skill-version",
        skillId: legacySkill.id,
        version: 1,
        content: legacySkillContent,
        createdAt: legacyExportedAt,
      },
    ],
    skillFiles: {
      [legacySkill.id]: [
        { relativePath: "SKILL.md", content: legacySkillContent },
        { relativePath: "docs/nested.md", content: "Nested original file" },
      ],
    },
    settings: {
      state: { themeMode: "dark", githubToken: "historical-test-token" },
    },
  };
}

export function legacyExportText(payload = legacyExportPayload()): string {
  return JSON.stringify({
    kind: "prompthub-export",
    exportedAt: legacyExportedAt,
    scope: {
      prompts: true,
      folders: true,
      versions: true,
      images: true,
      videos: false,
      aiConfig: false,
      settings: true,
      rules: false,
      skills: true,
    },
    payload,
  });
}

export function legacyExportZip(
  extraFiles: Record<string, Uint8Array> = {},
  text = legacyExportText(),
): Uint8Array {
  const entries = {
    "import-with-prompthub.json": Buffer.from(text),
    "prompts/legacy.md": Buffer.from("Historical human-readable projection"),
    "images/legacy.png": legacyImage,
    "skills/legacy-skill/SKILL.md": Buffer.from(legacySkillContent),
    "skills/legacy-skill/docs/nested.md": Buffer.from("Nested original file"),
    "skills/legacy-skill/assets/blob.bin": legacyBinary,
    ...extraFiles,
  };
  // fflate uses instanceof Uint8Array; normalize Node buffers into the test's
  // realm so jsdom does not interpret their numeric properties as directories.
  return zipSync(Object.fromEntries(
    Object.entries(entries).map(([name, bytes]) => [name, Uint8Array.from(bytes)]),
  ));
}
