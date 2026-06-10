import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";

import { buildSkillVariantBadges } from "../../../src/renderer/services/skill-variant-badges";

const t = ((_: string, defaultValue?: string) => defaultValue ?? "") as TFunction;

describe("skill variant badges", () => {
  it("classifies explicit HTTP(S) source labels as community sources", () => {
    const badges = buildSkillVariantBadges(
      { source_label: "https://example.com/skills/demo" },
      t,
    );

    expect(badges[0]).toMatchObject({
      key: "source-community",
      tone: "community",
      label: "Community",
    });
  });

  it("does not classify non-HTTP source labels with an http prefix as community sources", () => {
    expect(
      buildSkillVariantBadges({ source_label: "httpx://example.com/skills" }, t)[0],
    ).toMatchObject({
      key: "source-git",
      tone: "git",
      label: "Git",
    });

    expect(
      buildSkillVariantBadges({ source_label: "http-local-team" }, t)[0],
    ).toMatchObject({
      key: "source-git",
      tone: "git",
      label: "Git",
    });
  });
});
