import { describe, expect, it } from "vitest";
import {
  computeSkillContentHash,
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
