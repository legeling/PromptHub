import { describe, expect, it } from "vitest";
import { loadGitHubSkillRepo } from "../../../src/renderer/services/github-skill-store";
import { getSkillPackageReadErrorCode } from "@prompthub/shared/utils/skill-package-read-error";

const options = {
  registrySkills: [],
  rateLimitMessage: "rate limited",
  networkMessage: "network unavailable",
  invalidRepoMessage: "invalid repository",
};
const repo = "https://github.com/example/skills";
const names = ["one", "two", "three", "four", "five", "six"];
function catalogResponse(url: string): string | undefined {
  if (url === "https://api.github.com/repos/example/skills") {
    return JSON.stringify({ default_branch: "main" });
  }
  if (url.includes("/git/trees/")) {
    return JSON.stringify({
      tree: names.map((name) => ({
        type: "blob",
        path: `skills/${name}/SKILL.md`,
      })),
    });
  }
  return undefined;
}
function content(url: string): string {
  return `---\nname: ${url.split("/").at(-2)}\ndescription: Example\n---\n# Example`;
}

describe("GitHub store completeness", () => {
  it.each(["metadata", "content"])(
    "preserves authentication guidance when %s loading fails",
    async (phase) => {
      await expect(
        loadGitHubSkillRepo(repo, {
          ...options,
          formatError: getSkillPackageReadErrorCode,
          fetchRemoteContent: async (url) => {
            const metadata = catalogResponse(url);
            if (phase === "content" && metadata) return metadata;
            throw new Error("GitHub HTTP 401 fetching remote content");
          },
        }),
      ).rejects.toThrow(/^github-authentication$/);
    },
  );
  it("uses the GitHub file API when the raw host is unreachable and decodes UTF-8", async () => {
    const apiPaths: string[] = [];
    const skills = await loadGitHubSkillRepo(repo, {
      ...options,
      fetchRemoteContent: async (url) => {
        const response = catalogResponse(url);
        if (response) return response;
        if (url.startsWith("https://raw.githubusercontent.com/"))
          throw new Error("Connection timed out");
        apiPaths.push(url);
        const name = url.split("/").at(-2);
        return JSON.stringify({
          encoding: "base64",
          content: Buffer.from(
            `---\nname: ${name}\ndescription: Café\n---\n# Example`,
          ).toString("base64"),
        });
      },
    });
    expect(skills.map((skill) => skill.slug)).toEqual(names);
    expect(skills[0].description).toBe("Café");
    expect(apiPaths[0]).toBe(
      "https://api.github.com/repos/example/skills/contents/skills/one/SKILL.md?ref=main",
    );
  });

  it.each(["{}", '{"truncated":true,"tree":[]}'])(
    "rejects incomplete tree metadata: %s",
    async (tree) => {
      await expect(
        loadGitHubSkillRepo(repo, {
          ...options,
          fetchRemoteContent: async (url) =>
            url.includes("/git/trees/") ? tree : '{"default_branch":"main"}',
        }),
      ).rejects.toThrow("network unavailable");
    },
  );

  it("loads every package with bounded concurrency and retries a transient failure", async () => {
    let active = 0;
    let peak = 0;
    let attempts = 0;
    const skills = await loadGitHubSkillRepo(repo, {
      ...options,
      fetchRemoteContent: async (url) => {
        const response = catalogResponse(url);
        if (response) return response;
        active += 1;
        peak = Math.max(peak, active);
        await Promise.resolve();
        active -= 1;
        if (url.includes("/four/") && ++attempts === 1) {
          throw new Error("ECONNRESET");
        }
        return content(url);
      },
    });
    expect(skills.map((skill) => skill.slug)).toEqual(names);
    expect(peak).toBeLessThanOrEqual(4);
    expect(attempts).toBe(2);
    expect(skills[3].content).toContain("name: four");
  });

  it.each(["timeout", "empty"])(
    "rejects a partial catalog after %s instead of publishing three successes",
    async (failure) => {
      await expect(
        loadGitHubSkillRepo(repo, {
          ...options,
          fetchRemoteContent: async (url) => {
            const response = catalogResponse(url);
            if (response) return response;
            if (
              ["four", "five", "six"].some((name) => url.includes(`/${name}/`))
            ) {
              if (failure === "empty") return "";
              throw new Error("Request timed out");
            }
            return content(url);
          },
        }),
      ).rejects.toThrow("network unavailable");
    },
  );

  it("does not disguise an unreadable Skill as the repository README", async () => {
    const requested: string[] = [];
    await expect(
      loadGitHubSkillRepo(repo, {
        ...options,
        fetchRemoteContent: async (url) => {
          requested.push(url);
          if (url.includes("/git/trees/"))
            return JSON.stringify({
              tree: [
                { type: "blob", path: "skills/one/SKILL.md" },
                { type: "blob", path: "README.md" },
              ],
            });
          if (url.endsWith("SKILL.md")) throw new Error("HTTP 404");
          return catalogResponse(url) ?? "# Repository";
        },
      }),
    ).rejects.toThrow();
    expect(requested.some((url) => url.endsWith("README.md"))).toBe(false);
  });
});
