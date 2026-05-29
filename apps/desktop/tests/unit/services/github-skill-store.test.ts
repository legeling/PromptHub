import { describe, expect, it, vi } from "vitest";

import { computeDirectoryFingerprintFromHashes } from "@prompthub/shared/utils/skill-identity";
import { loadGitHubSkillRepo } from "../../../src/renderer/services/github-skill-store";

const storeMessages = {
  rateLimitMessage: "rate limited",
  networkMessage: "network down",
  invalidRepoMessage: "invalid repo",
};

describe("github skill store identity", () => {
  it("generates distinct source ids for the same skill on different branches", async () => {
    const fetchRemoteContent = vi.fn(async (url: string) => {
      if (url === "https://api.github.com/repos/example/skills") {
        return JSON.stringify({ default_branch: "main", owner: { login: "example" } });
      }

      if (url === "https://api.github.com/repos/example/skills/git/trees/main?recursive=1") {
        return JSON.stringify({
          tree: [{ path: "skills/writer/SKILL.md", type: "blob" }],
        });
      }

      if (url === "https://api.github.com/repos/example/skills/git/trees/dev?recursive=1") {
        return JSON.stringify({
          tree: [{ path: "skills/writer/SKILL.md", type: "blob" }],
        });
      }

      if (url === "https://raw.githubusercontent.com/example/skills/main/skills/writer/SKILL.md") {
        return "---\nname: writer\ndescription: Stable writer\n---\n\n# Writer\n";
      }

      if (url === "https://raw.githubusercontent.com/example/skills/dev/skills/writer/SKILL.md") {
        return "---\nname: writer\ndescription: Dev writer\n---\n\n# Writer\n";
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const main = await loadGitHubSkillRepo("https://github.com/example/skills", {
      ...storeMessages,
      branch: "main",
      directory: "skills",
      fetchRemoteContent,
      registrySkills: [],
    });

    const dev = await loadGitHubSkillRepo("https://github.com/example/skills", {
      ...storeMessages,
      branch: "dev",
      directory: "skills",
      fetchRemoteContent,
      registrySkills: [],
    });

    expect(main).toHaveLength(1);
    expect(dev).toHaveLength(1);
    expect(main[0]?.slug).toBe("writer");
    expect(dev[0]?.slug).toBe("writer");
    expect(main[0]?.source_id).not.toBe(dev[0]?.source_id);
  });

  it("keeps same-name skills from different paths as separate variants", async () => {
    const fetchRemoteContent = vi.fn(async (url: string) => {
      if (url === "https://api.github.com/repos/example/skills") {
        return JSON.stringify({ default_branch: "main", owner: { login: "example" } });
      }

      if (url === "https://api.github.com/repos/example/skills/git/trees/main?recursive=1") {
        return JSON.stringify({
          tree: [
            { path: "skills/stable/writer/SKILL.md", type: "blob" },
            { path: "skills/experimental/writer/SKILL.md", type: "blob" },
          ],
        });
      }

      if (url === "https://raw.githubusercontent.com/example/skills/main/skills/stable/writer/SKILL.md") {
        return "---\nname: writer\ndescription: Stable writer\n---\n\n# Writer\n";
      }

      if (url === "https://raw.githubusercontent.com/example/skills/main/skills/experimental/writer/SKILL.md") {
        return "---\nname: writer\ndescription: Experimental writer\n---\n\n# Writer\n";
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const skills = await loadGitHubSkillRepo("https://github.com/example/skills", {
      ...storeMessages,
      branch: "main",
      fetchRemoteContent,
      registrySkills: [],
    });

    expect(skills).toHaveLength(2);
    expect(skills.map((skill) => skill.slug)).toEqual(["writer", "writer"]);
    expect(new Set(skills.map((skill) => skill.source_id)).size).toBe(2);
  });

  it("dedupes duplicate tree entries by source id", async () => {
    const fetchRemoteContent = vi.fn(async (url: string) => {
      if (url === "https://api.github.com/repos/example/skills") {
        return JSON.stringify({ default_branch: "main", owner: { login: "example" } });
      }

      if (url === "https://api.github.com/repos/example/skills/git/trees/main?recursive=1") {
        return JSON.stringify({
          tree: [
            { path: "skills/writer/SKILL.md", type: "blob" },
            { path: "skills/writer/SKILL.md", type: "blob" },
          ],
        });
      }

      if (url === "https://raw.githubusercontent.com/example/skills/main/skills/writer/SKILL.md") {
        return "---\nname: writer\ndescription: Stable writer\n---\n\n# Writer\n";
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const skills = await loadGitHubSkillRepo("https://github.com/example/skills", {
      ...storeMessages,
      branch: "main",
      fetchRemoteContent,
      registrySkills: [],
    });

    expect(skills).toHaveLength(1);
    expect(skills[0]?.source_id).toBeDefined();
  });

  it("derives directory fingerprints from tree blob hashes", async () => {
    const fetchRemoteContent = vi.fn(async (url: string) => {
      if (url === "https://api.github.com/repos/example/skills") {
        return JSON.stringify({ default_branch: "main", owner: { login: "example" } });
      }

      if (url === "https://api.github.com/repos/example/skills/git/trees/main?recursive=1") {
        return JSON.stringify({
          tree: [
            {
              path: "skills/writer/SKILL.md",
              type: "blob",
              sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            },
            {
              path: "skills/writer/assets/icon.png",
              type: "blob",
              sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            },
          ],
        });
      }

      if (url === "https://raw.githubusercontent.com/example/skills/main/skills/writer/SKILL.md") {
        return "---\nname: writer\ndescription: Stable writer\n---\n\n# Writer\n";
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const skills = await loadGitHubSkillRepo("https://github.com/example/skills", {
      ...storeMessages,
      branch: "main",
      directory: "skills",
      fetchRemoteContent,
      registrySkills: [],
    });

    expect(skills).toHaveLength(1);
    expect(skills[0]?.directory_fingerprint).toBe(
      computeDirectoryFingerprintFromHashes([
        {
          path: "SKILL.md",
          contentHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
        {
          path: "assets/icon.png",
          contentHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        },
      ]),
    );
  });
});
