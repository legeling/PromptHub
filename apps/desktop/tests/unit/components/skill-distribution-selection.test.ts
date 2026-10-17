import { describe, expect, it } from "vitest";
import { SKILL_PLATFORMS } from "@prompthub/shared/constants/platforms";
import { SHARED_AGENT_SKILLS_DISTRIBUTION_TARGET } from "../../../src/renderer/services/shared-skill-distribution-target";
import {
  selectNativeDistributionTargets,
  summarizeDistributionSelection,
} from "../../../src/renderer/components/skill/skill-distribution-selection";

const platforms = [
  ...SKILL_PLATFORMS.filter((p) => ["claude", "cursor"].includes(p.id)),
  SHARED_AGENT_SKILLS_DISTRIBUTION_TARGET,
];
describe("Distribution selection", () => {
  it("selects native targets without enabling shared storage and restores pending native removals", () => {
    const changes = selectNativeDistributionTargets(
      platforms,
      { claude: true },
      new Set(["claude"]),
    );
    expect([...changes]).toEqual(["cursor"]);
    expect(
      summarizeDistributionSelection(platforms, { claude: true }, changes),
    ).toEqual({
      platformCount: 2,
      sharedSelected: false,
      installs: 1,
      removals: 0,
      duplicateDiscovery: false,
    });
  });
  it.each([false, true])(
    "preserves explicit shared changes when selecting all (installed=%s)",
    (installed) => {
      const changes = selectNativeDistributionTargets(
        platforms,
        { "agent-skills-global": installed },
        new Set(["agent-skills-global"]),
      );
      expect(changes.has("agent-skills-global")).toBe(true);
      expect(
        summarizeDistributionSelection(
          platforms,
          { "agent-skills-global": installed },
          changes,
        ),
      ).toMatchObject({
        platformCount: 2,
        sharedSelected: !installed,
        installs: installed ? 2 : 3,
        removals: installed ? 1 : 0,
      });
    },
  );
});
