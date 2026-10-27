import { describe, expect, it } from "vitest";
import path from "node:path";

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
    for (const osKey of ["darwin", "win32", "linux"] as const) {
      const paths = osKey === "win32" ? path.win32 : path.posix;
      const rulePath = (platform: (typeof SKILL_PLATFORMS)[number]) =>
        paths.normalize(
          paths.join(platform.rootDir[osKey], platform.globalRuleFile ?? ""),
        );
      // Multiple Agents can consume one native rule file owned by a single record.
      const registeredPaths = new Set(
        SKILL_PLATFORMS.filter((platform) =>
          registeredPlatformIds.has(platform.id),
        ).map(rulePath),
      );
      const missingPlatformIds = SKILL_PLATFORMS.filter(
        (platform) =>
          platform.globalRuleFile && !registeredPaths.has(rulePath(platform)),
      ).map((platform) => platform.id);
      expect(missingPlatformIds, osKey).toEqual([]);
    }
  });

  it("keeps every registered rule platform in deterministic display order", () => {
    const orderedPlatformIds = new Set(RULE_PLATFORM_ORDER);
    const missingOrderEntries = Object.values(KNOWN_RULE_FILE_TEMPLATES)
      .map((template) => template.platformId)
      .filter((platformId) => !orderedPlatformIds.has(platformId));

    expect(missingOrderEntries).toEqual([]);
  });
});
