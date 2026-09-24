import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSkillStore } from "../../../src/renderer/stores/skill.store";
import { createSkillFixture } from "../../fixtures/skills";
vi.mock("../../../src/renderer/services/webdav-save-sync", () => ({
  scheduleAllSaveSync: vi.fn(),
}));

describe("Skill library single-command saves", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSkillStore.setState({ skills: [], isLoading: false, error: null });
  });
  it("does not perform a second file write after create or update", async () => {
    const skill = createSkillFixture({
      id: "single-save",
      name: "writer",
      instructions: "Old",
    });
    const create = vi
      .spyOn(window.api.skill, "create")
      .mockResolvedValue(skill);
    const update = vi
      .spyOn(window.api.skill, "update")
      .mockResolvedValue({ ...skill, instructions: "New" });
    const write = vi.spyOn(window.api.skill, "writeLocalFile");
    await useSkillStore
      .getState()
      .createSkill({ name: "writer", protocol_type: "skill", content: "Old" });
    await useSkillStore
      .getState()
      .updateSkill(skill.id, { instructions: "New" });
    expect(create).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(write).not.toHaveBeenCalled();
    expect(useSkillStore.getState().skills[0].instructions).toBe("New");
  });
  it("keeps the previous list value when the main-process save fails", async () => {
    const skill = createSkillFixture({
      id: "save-failed",
      name: "writer",
      instructions: "Old",
    });
    useSkillStore.setState({ skills: [skill] });
    vi.spyOn(window.api.skill, "update").mockRejectedValueOnce(
      new Error("disk full"),
    );
    await expect(
      useSkillStore.getState().updateSkill(skill.id, { instructions: "New" }),
    ).rejects.toThrow("disk full");
    expect(useSkillStore.getState().skills[0].instructions).toBe("Old");
  });
});
