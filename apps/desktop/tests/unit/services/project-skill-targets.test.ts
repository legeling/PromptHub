import { describe, expect, it } from "vitest";
import type { ScannedSkill, Skill } from "@prompthub/shared/types";
import { getProjectTargetDirsRequiringDeployment } from "../../../src/renderer/services/project-skill-targets";

function librarySkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: "skill-writer-main",
    name: "writer",
    description: "Writer",
    instructions: "# Writer",
    content: "# Writer",
    protocol_type: "skill",
    author: "PromptHub",
    local_repo_path: "/prompthub/skills/writer-main/repo",
    directory_fingerprint: "fingerprint-main",
    tags: [],
    is_favorite: false,
    created_at: 1,
    updated_at: 1,
    ...overrides,
  };
}

function scannedSkill(overrides: Partial<ScannedSkill> = {}): ScannedSkill {
  return {
    name: "writer",
    description: "Writer",
    author: "PromptHub",
    tags: [],
    instructions: "# Writer",
    filePath: "/repo/.agents/skills/writer/SKILL.md",
    localPath: "/repo/.agents/skills/writer",
    platforms: ["Project"],
    installMode: "copy",
    directory_fingerprint: "fingerprint-main",
    ...overrides,
  };
}

describe("project skill target deployment", () => {
  it("skips a target only when the deployed logical name already matches the same library skill", () => {
    const targetDir = "/repo/.agents/skills";
    const skill = librarySkill();

    expect(
      getProjectTargetDirsRequiringDeployment(
        [scannedSkill()],
        skill,
        [targetDir],
      ),
    ).toEqual([]);
  });

  it("requires deployment when the target has the same logical name from another variant", () => {
    const targetDir = "/repo/.agents/skills";
    const skill = librarySkill({
      id: "skill-writer-dev",
      directory_fingerprint: "fingerprint-dev",
      local_repo_path: "/prompthub/skills/writer-dev/repo",
    });

    expect(
      getProjectTargetDirsRequiringDeployment(
        [
          scannedSkill({
            directory_fingerprint: "fingerprint-main",
          }),
        ],
        skill,
        [targetDir],
      ),
    ).toEqual([targetDir]);
  });
});
