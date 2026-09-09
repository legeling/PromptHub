// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
describe("business and content assessment dependency boundary", () => {
  it.each([
    "main/services/skill-package-lifecycle-desktop.ts",
    "main/services/skill-installer-remote-package.ts",
    "renderer/stores/skill/skill-source-update-remote.ts",
    "renderer/stores/skill/skill-registry-actions.ts",
    "renderer/components/skill/SkillStore.tsx",
  ])(
    "keeps %s independent of content scanners and trust retries",
    (relative) => {
      const content = fs.readFileSync(
        path.resolve(__dirname, "../../../src", relative),
        "utf8",
      );
      expect(content).not.toMatch(
        /(?:scanSkillSafety|assertStagedRemoteSkillPackageSafe|runSkillContentSafetyScan|saveRemotePackageWithTrustedReview|runTrustedSkillPackageOperation)\(/,
      );
    },
  );
});
