import { describe, expect, it } from "vitest";

import { SKILL_PLATFORMS } from "@prompthub/shared/constants/platforms";
import {
  KNOWN_RULE_FILE_TEMPLATES,
  RULE_PLATFORM_ORDER,
} from "@prompthub/shared/constants/rules";

describe("Agent rule platform coverage", () => {
  it("registers every Agent with a dedicated global rule path in the Rules workspace", () => {
    const registeredPlatformIds = new Set<string>(
      Object.values(KNOWN_RULE_FILE_TEMPLATES).map(
        (template) => template.platformId,
      ),
    );
    const missingPlatformIds = SKILL_PLATFORMS.filter(
      (platform) =>
        platform.globalRuleFile &&
        platform.id !== "antigravity" &&
        !registeredPlatformIds.has(platform.id),
    ).map((platform) => platform.id);

    expect(missingPlatformIds).toEqual([]);
  });

  it("keeps every registered rule platform in deterministic display order", () => {
    const orderedPlatformIds = new Set(RULE_PLATFORM_ORDER);
    const missingOrderEntries = Object.values(KNOWN_RULE_FILE_TEMPLATES)
      .map((template) => template.platformId)
      .filter((platformId) => !orderedPlatformIds.has(platformId));

    expect(missingOrderEntries).toEqual([]);
  });
});
