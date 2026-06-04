import { describe, expect, it } from "vitest";
import {
  computeSkillContentHash,
  findInstalledRegistrySkill,
  getRegistrySkillUpdateStatus,
} from "../../../src/renderer/services/skill-store-update";
import { createSkillFixture } from "../../fixtures/skills";
import type { RegistrySkill } from "@prompthub/shared/types";

const registrySkill: RegistrySkill = {
  slug: "writer",
  name: "Writer",
  description: "Write better",
  category: "general",
  author: "PromptHub",
  source_url: "https://github.com/example/skills/tree/main/writer",
  content_url: "https://raw.githubusercontent.com/example/skills/main/writer/SKILL.md",
  tags: ["writing"],
  version: "1.1.0",
  content: "---\ndescription: Write better\nname: writer\n---\n\n# Writer\n\nRemote update\n",
};

describe("skill store update detection", () => {
  describe("findInstalledRegistrySkill", () => {
    it("matches a legacy install by content URL when the remote source id changes", () => {
      const installedSkill = createSkillFixture({
        id: "skill-legacy-writer",
        name: "writer",
        registry_slug: "writer",
        content_url: registrySkill.content_url,
      });

      const match = findInstalledRegistrySkill([installedSkill], {
        ...registrySkill,
        source_id: "claude-code:writer:new-source-id",
      });

      expect(match?.id).toBe("skill-legacy-writer");
    });

    it("does not match skills by display name alone across different sources", () => {
      const installedSkill = createSkillFixture({
        id: "skill-stable-writer",
        name: "writer",
        registry_slug: "stable-writer",
        source_id: "claude-code:stable-writer",
        source_url: "https://github.com/anthropics/skills/tree/main/stable-writer",
        content_url:
          "https://raw.githubusercontent.com/anthropics/skills/main/stable-writer/SKILL.md",
      });

      const match = findInstalledRegistrySkill([installedSkill], {
        ...registrySkill,
        slug: "fork-writer",
        name: "Writer",
        install_name: "writer",
        source_id: "custom-gitea:fork-writer",
        source_url: "https://gitea.example.com/team/skills/src/branch/main/fork-writer",
        content_url:
          "https://gitea.example.com/team/skills/raw/branch/main/fork-writer/SKILL.md",
      });

      expect(match).toBeNull();
    });

    it("does not let a registry slug fallback override an explicit source id mismatch", () => {
      const installedSkill = createSkillFixture({
        id: "skill-main-writer",
        name: "writer",
        registry_slug: "writer",
        source_id: "source-main-writer",
      });

      const match = findInstalledRegistrySkill([installedSkill], {
        ...registrySkill,
        slug: "writer",
        source_id: "source-dev-writer",
        source_url: "https://github.com/example/skills/tree/dev/writer",
      });

      expect(match).toBeNull();
    });
  });

  it("normalizes line endings and frontmatter order before hashing", async () => {
    const first = await computeSkillContentHash(
      "---\nname: writer\ndescription: Write better\n---\n\n# Writer\r\n",
    );
    const second = await computeSkillContentHash(
      "---\r\ndescription: Write better\r\nname: writer\r\n---\r\n\r\n# Writer\n",
    );

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it("reports update-available only when remote changed and local content is still pristine", async () => {
    const installedHash = await computeSkillContentHash("# Writer\n\nOriginal\n");
    const localSkill = createSkillFixture({
      id: "skill-writer",
      name: "writer",
      registry_slug: "writer",
      content_url: registrySkill.content_url,
      content: "# Writer\n\nOriginal\n",
      instructions: "# Writer\n\nOriginal\n",
      installed_content_hash: installedHash,
      installed_version: "1.0.0",
    });

    const status = await getRegistrySkillUpdateStatus(localSkill, registrySkill);

    expect(status.status).toBe("update-available");
    expect(status.localModified).toBe(false);
    expect(status.remoteChanged).toBe(true);
  });

  it("does not report local-modified when local content already matches the remote source despite a stale install baseline", async () => {
    const staleInstalledHash = await computeSkillContentHash(
      "# Writer\n\nCached store summary\n",
    );
    const currentRemoteContent = "# Writer\n\nCurrent package content\n";
    const localSkill = createSkillFixture({
      id: "skill-writer",
      name: "writer",
      registry_slug: "writer",
      content_url: registrySkill.content_url,
      content: currentRemoteContent,
      instructions: currentRemoteContent,
      installed_content_hash: staleInstalledHash,
      installed_version: "1.0.0",
    });

    const status = await getRegistrySkillUpdateStatus(
      localSkill,
      registrySkill,
      currentRemoteContent,
    );

    expect(status.status).toBe("up-to-date");
    expect(status.localModified).toBe(false);
    expect(status.remoteChanged).toBe(false);
  });

  it("reports conflict when both local and remote content changed", async () => {
    const installedHash = await computeSkillContentHash("# Writer\n\nOriginal\n");
    const localSkill = createSkillFixture({
      id: "skill-writer",
      name: "writer",
      registry_slug: "writer",
      content_url: registrySkill.content_url,
      content: "# Writer\n\nLocal edits\n",
      instructions: "# Writer\n\nLocal edits\n",
      installed_content_hash: installedHash,
      installed_version: "1.0.0",
    });

    const status = await getRegistrySkillUpdateStatus(localSkill, registrySkill);

    expect(status.status).toBe("conflict");
    expect(status.localModified).toBe(true);
    expect(status.remoteChanged).toBe(true);
  });
});
