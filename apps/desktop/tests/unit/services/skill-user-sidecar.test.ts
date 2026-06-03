import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  readSkillUserSidecar,
  writeSkillUserSidecar,
} from "../../../src/renderer/services/skill-user-sidecar";

const skillApi = {
  createLocalDir: vi.fn(),
  getRepoPath: vi.fn(),
  readLocalFile: vi.fn(),
  writeLocalFile: vi.fn(),
};

describe("skill user sidecar", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      api: {
        skill: skillApi,
      },
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-04T12:00:00.000Z"));
    skillApi.createLocalDir.mockReset();
    skillApi.getRepoPath.mockReset();
    skillApi.readLocalFile.mockReset();
    skillApi.writeLocalFile.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("writes user notes into .prompthub/user.json without creating a version snapshot", async () => {
    const notes =
      "适合 Claude 写长文。\nKeep this one. '; DROP TABLE skills; -- <b>safe</b> 📝";

    const sidecar = await writeSkillUserSidecar({
      skillId: "skill-1",
      notes,
    });

    expect(skillApi.createLocalDir).toHaveBeenCalledWith(
      "skill-1",
      ".prompthub",
    );
    expect(skillApi.writeLocalFile).toHaveBeenCalledWith(
      "skill-1",
      ".prompthub/user.json",
      JSON.stringify(sidecar, null, 2),
      { skipVersionSnapshot: true },
    );
    expect(sidecar).toEqual({
      schemaVersion: 1,
      notes,
      updatedAt: Date.parse("2026-06-04T12:00:00.000Z"),
    });
  });

  it("reads valid user notes from the sidecar file", async () => {
    const sidecar = {
      schemaVersion: 1,
      notes: "个人备注\nSecond line",
      updatedAt: Date.parse("2026-06-04T12:00:00.000Z"),
    };
    skillApi.getRepoPath.mockResolvedValue("/tmp/skills/writer/repo");
    skillApi.readLocalFile.mockResolvedValue({
      path: ".prompthub/user.json",
      content: JSON.stringify(sidecar),
      isDirectory: false,
    });

    await expect(readSkillUserSidecar("skill-1")).resolves.toEqual(sidecar);
    expect(skillApi.readLocalFile).toHaveBeenCalledWith(
      "skill-1",
      ".prompthub/user.json",
    );
  });

  it.each([
    null,
    { schemaVersion: 2, notes: "wrong schema", updatedAt: 1 },
    { schemaVersion: 1, notes: 123, updatedAt: 1 },
    { schemaVersion: 1, notes: "bad date", updatedAt: Number.NaN },
  ])("ignores missing or invalid sidecar content %#", async (value) => {
    skillApi.getRepoPath.mockResolvedValue("/tmp/skills/writer/repo");
    skillApi.readLocalFile.mockResolvedValue(
      value === null
        ? null
        : {
            path: ".prompthub/user.json",
            content: JSON.stringify(value),
            isDirectory: false,
          },
    );

    await expect(readSkillUserSidecar("skill-1")).resolves.toBeNull();
  });

  it("does not read notes when the skill has no local repo", async () => {
    skillApi.getRepoPath.mockResolvedValue(null);

    await expect(readSkillUserSidecar("skill-1")).resolves.toBeNull();
    expect(skillApi.readLocalFile).not.toHaveBeenCalled();
  });
});
