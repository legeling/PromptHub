import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSkillStore } from "../../../src/renderer/stores/skill.store";
import { createSkillFixture } from "../../fixtures/skills";
import { installWindowMocks } from "../../helpers/window";

beforeEach(() =>
  useSkillStore.setState({
    skills: [createSkillFixture({ id: "distribution-a" })],
    skillPlatformStatuses: {},
    deployedSkillNames: new Set(),
    distributionStatusError: null,
  }),
);

describe("shared Skill distribution status", () => {
  it("publishes icons and counts together, reuses the result, and refreshes added skills", async () => {
    const batch = vi
      .fn()
      .mockResolvedValue({ "distribution-a": { claude: true, cursor: false } });
    installWindowMocks({ api: { skill: { getMdInstallStatusBatch: batch } } });
    await useSkillStore.getState().loadDeployedStatus({ force: true });
    expect(
      useSkillStore.getState().skillPlatformStatuses["distribution-a"],
    ).toEqual({ claude: true, cursor: false });
    expect([...useSkillStore.getState().deployedSkillNames]).toEqual([
      "distribution-a",
    ]);
    await useSkillStore.getState().loadDeployedStatus();
    expect(batch).toHaveBeenCalledTimes(1);
    useSkillStore.setState({
      skills: [
        ...useSkillStore.getState().skills,
        createSkillFixture({ id: "distribution-b" }),
      ],
    });
    batch.mockResolvedValue({
      "distribution-a": { claude: true },
      "distribution-b": { cursor: true },
    });
    await useSkillStore.getState().loadDeployedStatus();
    expect(batch).toHaveBeenCalledTimes(2);
    expect([...useSkillStore.getState().deployedSkillNames]).toEqual([
      "distribution-a",
      "distribution-b",
    ]);
  });

  it("preserves the last scan on failure and updates both surfaces after recovery", async () => {
    const batch = vi
      .fn()
      .mockResolvedValue({ "distribution-a": { claude: true } });
    installWindowMocks({ api: { skill: { getMdInstallStatusBatch: batch } } });
    await useSkillStore.getState().loadDeployedStatus({ force: true });
    batch.mockResolvedValueOnce({});
    await useSkillStore.getState().loadDeployedStatus({ force: true });
    expect(useSkillStore.getState().distributionStatusError).toContain(
      "incomplete",
    );
    expect(
      useSkillStore.getState().skillPlatformStatuses["distribution-a"].claude,
    ).toBe(true);
    batch.mockRejectedValueOnce(new Error("Scan unavailable"));
    await useSkillStore.getState().loadDeployedStatus({ force: true });
    expect(useSkillStore.getState().distributionStatusError).toBe(
      "Scan unavailable",
    );
    expect(
      useSkillStore.getState().skillPlatformStatuses["distribution-a"].claude,
    ).toBe(true);
    expect(
      useSkillStore.getState().deployedSkillNames.has("distribution-a"),
    ).toBe(true);
    batch.mockResolvedValue({ "distribution-a": { claude: false } });
    await useSkillStore.getState().loadDeployedStatus({ force: true });
    expect(useSkillStore.getState().distributionStatusError).toBeNull();
    expect(
      useSkillStore.getState().skillPlatformStatuses["distribution-a"].claude,
    ).toBe(false);
    expect(useSkillStore.getState().deployedSkillNames.size).toBe(0);
  });
});
