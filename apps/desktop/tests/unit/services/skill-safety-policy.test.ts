import { describe, expect, it } from "vitest";
import type { RegistrySkill, SkillStoreSource } from "@prompthub/shared/types";
import {
  getRegistrySkillSafetySourceContext,
  getSkillSafetyChannelForStore,
  isSkillSafetyChannel,
  isSkillSafetyPolicyValue,
  normalizeSkillSafetyStoreId,
  resolveSkillSafetyScanMode,
} from "../../../src/renderer/services/skill-safety-policy";

describe("Skill safety policy", () => {
  const basePolicy = {
    autoScanStoreSkillsBeforeInstall: true,
    skillSafetyChannelPolicies: {},
    skillSafetyStorePolicies: {},
  } as const;

  it("resolves exact store, channel, and global policy in that order", () => {
    expect(
      resolveSkillSafetyScanMode(
        {
          ...basePolicy,
          skillSafetyChannelPolicies: { "git-repo": "disabled" },
          skillSafetyStorePolicies: { "team-gitea": "enabled" },
        },
        { storeId: "team-gitea", channel: "git-repo" },
      ),
    ).toBe("enabled");

    expect(
      resolveSkillSafetyScanMode(
        {
          ...basePolicy,
          skillSafetyChannelPolicies: { "git-repo": "disabled" },
        },
        { storeId: "other-gitea", channel: "git-repo" },
      ),
    ).toBe("disabled");

    expect(
      resolveSkillSafetyScanMode(
        {
          ...basePolicy,
          autoScanStoreSkillsBeforeInstall: false,
        },
        { storeId: "official", channel: "official" },
      ),
    ).toBe("disabled");

    expect(
      resolveSkillSafetyScanMode(basePolicy, {
        storeId: "official",
        channel: "official",
      }),
    ).toBe("enabled");
  });

  it("classifies built-in and custom store channels consistently", () => {
    expect(getSkillSafetyChannelForStore("official")).toBe("official");
    expect(getSkillSafetyChannelForStore("prompthub-cloud")).toBe("official");
    expect(getSkillSafetyChannelForStore("community")).toBe("community");
    expect(getSkillSafetyChannelForStore("clawhub")).toBe("community");
    expect(getSkillSafetyChannelForStore("claude-code")).toBe("git-repo");
    expect(getSkillSafetyChannelForStore("team-gitea", "git-repo")).toBe(
      "git-repo",
    );
    expect(
      getSkillSafetyChannelForStore("team-market", "marketplace-json"),
    ).toBe("marketplace-json");
    expect(getSkillSafetyChannelForStore("team-files", "local-dir")).toBe(
      "local-dir",
    );
    expect(getSkillSafetyChannelForStore("team-official", "official")).toBe(
      "official",
    );
    expect(getSkillSafetyChannelForStore("unknown")).toBe("community");
  });

  it("rejects malformed persisted policy keys and values", () => {
    expect(isSkillSafetyChannel("git-repo")).toBe(true);
    expect(isSkillSafetyChannel("gitea")).toBe(false);
    expect(isSkillSafetyChannel(null)).toBe(false);
    expect(isSkillSafetyPolicyValue("enabled")).toBe(true);
    expect(isSkillSafetyPolicyValue("disabled")).toBe(true);
    expect(isSkillSafetyPolicyValue("inherit")).toBe(false);
    expect(normalizeSkillSafetyStoreId(" team-gitea ")).toBe("team-gitea");
    expect(normalizeSkillSafetyStoreId(" ")).toBeUndefined();
    expect(normalizeSkillSafetyStoreId(42)).toBeUndefined();
    expect(normalizeSkillSafetyStoreId("x".repeat(513))).toBeUndefined();
  });

  it("recovers exact custom-store context for later source updates", () => {
    const customStores: SkillStoreSource[] = [
      {
        id: "team-gitea",
        name: "Team Gitea",
        type: "git-repo",
        url: "https://gitea.example.com/team/skills/",
        enabled: true,
        createdAt: 1,
      },
      {
        id: "team-files",
        name: "Team Files",
        type: "local-dir",
        url: "/Users/demo/skills",
        enabled: true,
        createdAt: 2,
      },
    ];
    expect(
      getRegistrySkillSafetySourceContext(
        makeRegistrySkill({
          source_label: "https://gitea.example.com/team/skills",
        }),
        customStores,
      ),
    ).toEqual({ storeId: "team-gitea", channel: "git-repo" });
    expect(
      getRegistrySkillSafetySourceContext(
        makeRegistrySkill({ source_label: "Team Files" }),
        customStores,
      ),
    ).toEqual({ storeId: "team-files", channel: "local-dir" });
  });

  it("infers built-in and unattributed channels conservatively", () => {
    expect(
      getRegistrySkillSafetySourceContext(
        makeRegistrySkill({ source_id: "cloud:release-1" }),
        [],
      ),
    ).toEqual({ storeId: "prompthub-cloud", channel: "official" });
    expect(
      getRegistrySkillSafetySourceContext(
        makeRegistrySkill({
          source_url: "https://github.com/anthropics/skills",
        }),
        [],
      ),
    ).toEqual({ storeId: "claude-code", channel: "git-repo" });
    expect(
      getRegistrySkillSafetySourceContext(
        makeRegistrySkill({ source_url: "/Users/demo/skills/writer" }),
        [],
      ),
    ).toEqual({ storeId: "source-test", channel: "local-dir" });
    expect(
      getRegistrySkillSafetySourceContext(
        makeRegistrySkill({ source_url: "https://example.com/catalog.json" }),
        [],
      ),
    ).toEqual({ storeId: "source-test", channel: "community" });

    for (const [sourceUrl, storeId] of [
      ["https://skills.sh/catalog", "community"],
      ["https://clawhub.ai/skills/writer", "clawhub"],
      ["https://github.com/openai/skills", "openai-codex"],
    ] as const) {
      expect(
        getRegistrySkillSafetySourceContext(
          makeRegistrySkill({ source_url: sourceUrl }),
          [],
        ).storeId,
      ).toBe(storeId);
    }

    for (const sourceUrl of [
      "~/skills/writer",
      "file:///Users/demo/skills/writer",
      "C:\\skills\\writer",
    ]) {
      expect(
        getRegistrySkillSafetySourceContext(
          makeRegistrySkill({ source_url: sourceUrl }),
          [],
        ).channel,
      ).toBe("local-dir");
    }

    expect(
      getRegistrySkillSafetySourceContext(
        makeRegistrySkill({
          source_id: "",
          source_url: "ssh://git@gitea.example.com/team/skills",
        }),
        [],
      ),
    ).toEqual({ storeId: "unattributed", channel: "git-repo" });
  });

  it("sanitizes source locations while matching custom stores", () => {
    const customStores: SkillStoreSource[] = [
      {
        id: "team-market",
        name: "Team Market",
        type: "marketplace-json",
        url: "https://user:secret@example.com/catalog?token=secret#entry",
        enabled: true,
        createdAt: 1,
      },
      {
        id: "empty-store",
        name: "Empty Store",
        type: "community",
        url: " ",
        enabled: true,
        createdAt: 2,
      },
    ];
    expect(
      getRegistrySkillSafetySourceContext(
        makeRegistrySkill({
          source_label: "team-market",
          source_url: "https://example.com/catalog/writer",
          content_url: "",
          package_url: 42 as unknown as string,
        }),
        customStores,
      ),
    ).toEqual({ storeId: "team-market", channel: "marketplace-json" });
    expect(
      getRegistrySkillSafetySourceContext(
        makeRegistrySkill({
          source_label: "",
          source_url: "https://example.com/catalog/writer",
        }),
        customStores,
      ),
    ).toEqual({ storeId: "team-market", channel: "marketplace-json" });
    expect(
      getRegistrySkillSafetySourceContext(
        makeRegistrySkill({ source_url: "https://elsewhere.example/skill" }),
        customStores.slice(1),
      ),
    ).toEqual({ storeId: "source-test", channel: "community" });
  });
});

function makeRegistrySkill(
  overrides: Partial<RegistrySkill> = {},
): RegistrySkill {
  return {
    slug: "writer",
    name: "Writer",
    description: "Writer",
    category: "general",
    author: "PromptHub",
    tags: [],
    version: "1.0.0",
    content: "# Writer",
    source_id: "source-test",
    source_url: "",
    ...overrides,
  };
}
