import { describe, expect, it } from "vitest";

import {
  filterSkillsShLeaderboardEntries,
  getSkillsShIndexUrl,
  normalizeSkillsShFilterKey,
  parseSkillsShDetail,
  parseSkillsShLeaderboard,
  parseSkillsShTotalCount,
} from "../../../src/renderer/services/skills-sh-store";
import { buildSkillSourceId } from "@prompthub/shared/utils/skill-identity";

describe("skills-sh-store", () => {
  it("maps skills.sh source-specific filters to official browse URLs", () => {
    expect(getSkillsShIndexUrl("all")).toBe("https://skills.sh");
    expect(getSkillsShIndexUrl("official")).toBe("https://skills.sh/official");
    expect(getSkillsShIndexUrl("audits")).toBe("https://skills.sh/audits");
    expect(getSkillsShIndexUrl("trending")).toBe(
      "https://skills.sh/trending",
    );
    expect(getSkillsShIndexUrl("hot")).toBe("https://skills.sh/hot");
    expect(getSkillsShIndexUrl("topic:react")).toBe(
      "https://skills.sh/topic/react",
    );
    expect(getSkillsShIndexUrl("topic:design")).toBe(
      "https://skills.sh/topic/design",
    );
    expect(getSkillsShIndexUrl("office")).toBe("https://skills.sh");
    expect(normalizeSkillsShFilterKey("topic:testing")).toBe("topic:testing");
    expect(normalizeSkillsShFilterKey("dev")).toBe("all");
  });

  it("parses leaderboard cards into unique detail entries", () => {
    const html = `
      <main>
        <a href="/vercel-labs/skills/find-skills">
          <span>1</span>
          <span>find-skills</span>
          <span>vercel-labs/skills</span>
          <span>774.9K</span>
        </a>
        <a href="/openai/codex/api-design-review">
          <span>2</span>
          <span>api-design-review</span>
          <span>openai/codex</span>
          <span>193.2K</span>
        </a>
        <a href="/vercel-labs/skills/find-skills">
          <span>1</span>
          <span>find-skills</span>
          <span>vercel-labs/skills</span>
          <span>774.9K</span>
        </a>
      </main>
    `;

    expect(parseSkillsShLeaderboard(html, { limit: 10 })).toEqual([
      expect.objectContaining({
        owner: "vercel-labs",
        repo: "skills",
        skillName: "find-skills",
        weeklyInstalls: "774.9K",
      }),
      expect.objectContaining({
        owner: "openai",
        repo: "codex",
        skillName: "api-design-review",
        weeklyInstalls: "193.2K",
      }),
    ]);
  });

  it("parses plain skills.sh links even when the card text is not rendered in the anchor", () => {
    const html = `
      <main>
        <a href="/agentspace-so/runcomfy-agent-skills/ai-image-generation"></a>
        <a href="/anthropics/skills/frontend-design"></a>
        <a href="/agent/claude-code"></a>
      </main>
    `;

    expect(parseSkillsShLeaderboard(html, { limit: 10 })).toEqual([
      expect.objectContaining({
        owner: "agentspace-so",
        repo: "runcomfy-agent-skills",
        skillName: "ai-image-generation",
      }),
      expect.objectContaining({
        owner: "anthropics",
        repo: "skills",
        skillName: "frontend-design",
      }),
    ]);
  });

  it("parses the total skill count from skills.sh Next payloads", () => {
    expect(parseSkillsShTotalCount('{"totalSkills":9603}')).toBe(9603);
    expect(parseSkillsShTotalCount('\\"totalSkills\\":9603')).toBe(9603);
  });

  it("parses skills from the embedded skills.sh Next data index", () => {
    const html = `
      <script>
        self.__next_f.push([1, '\\"source\\":\\"github/awesome-copilot\\",\\"skillId\\":\\"gh-cli\\",\\"name\\":\\"gh-cli\\"']);
        self.__next_f.push([1, '"source":"firecrawl/cli","skillId":"firecrawl-parse","name":"firecrawl-parse"']);
      </script>
    `;

    expect(parseSkillsShLeaderboard(html, { limit: 10 })).toEqual([
      expect.objectContaining({
        owner: "github",
        repo: "awesome-copilot",
        skillName: "gh-cli",
        detailPath: "/github/awesome-copilot/gh-cli",
      }),
      expect.objectContaining({
        owner: "firecrawl",
        repo: "cli",
        skillName: "firecrawl-parse",
        detailPath: "/firecrawl/cli/firecrawl-parse",
      }),
    ]);
  });

  it("filters the skills.sh lightweight index before fetching details", () => {
    const entries = parseSkillsShLeaderboard(
      `
        <a href="/github/awesome-copilot/gh-cli"></a>
        <a href="/firecrawl/cli/firecrawl-parse"></a>
      `,
      { limit: 10 },
    );

    expect(filterSkillsShLeaderboardEntries(entries, "awesome copilot")).toEqual([
      expect.objectContaining({ skillName: "gh-cli" }),
    ]);
    expect(filterSkillsShLeaderboardEntries(entries, "firecrawl parse")).toEqual([
      expect.objectContaining({ skillName: "firecrawl-parse" }),
    ]);
  });

  it("maps detail page content into a registry skill", () => {
    const html = `
      <article>
        <h1>find-skills</h1>
        <h2>Summary</h2>
        <p>Use this skill whenever the user asks how to find or discover skills.</p>
        <h2>SKILL.md</h2>
        <pre><code>---
name: find-skills
description: Discover relevant skills and recommend the best next step.
tags: [search, discovery]
---

# Finding Skills

Use this skill to look up the right capability for a task.
        </code></pre>
        <h2>Weekly Installs</h2>
        <p>774.9K</p>
        <h2>Repository</h2>
        <p>vercel-labs/skills</p>
        <h2>GitHub Stars</h2>
        <p>8.3K</p>
        <h2>Installed on</h2>
        <p>opencode 689.9K</p>
        <p>codex 79.4K</p>
        <p>claude 5.7K</p>
        <h2>Security audits</h2>
        <p>No auditors found</p>
      </article>
    `;

    const skill = parseSkillsShDetail(html, {
      owner: "vercel-labs",
      repo: "skills",
      skillName: "find-skills",
      detailPath: "/vercel-labs/skills/find-skills",
      detailUrl: "https://skills.sh/vercel-labs/skills/find-skills",
      weeklyInstalls: "774.9K",
    });

    expect(skill).toEqual(
      expect.objectContaining({
        slug: "vercel-labs-skills-find-skills",
        name: "find-skills",
        install_name: "find-skills",
        source_id: buildSkillSourceId({
          sourceType: "skills-sh",
          sourceUrl: "https://skills.sh",
          skillPath: "/vercel-labs/skills/find-skills",
        }),
        source_label: "skills.sh",
        description:
          "Use this skill whenever the user asks how to find or discover skills.",
        category: "general",
        source_url: "https://github.com/vercel-labs/skills",
        store_url: "https://skills.sh/vercel-labs/skills/find-skills",
        source_directory: "skills/find-skills",
        canonical_skill_path: "skills/find-skills/SKILL.md",
        weekly_installs: "774.9K",
        github_stars: "8.3K",
        compatibility: ["opencode", "codex", "claude"],
        tags: ["search", "discovery"],
        installed_on: ["opencode", "codex", "claude"],
        security_audits: ["No auditors found"],
      }),
    );
    expect(skill?.content).toContain("# Finding Skills");
  });

  it("does not guess a skills/<name> package directory for non-standard skills.sh repos", () => {
    const html = `
      <article>
        <h2>Summary</h2>
        <p>React best practices for Vercel projects.</p>
        <h2>SKILL.md</h2>
        <pre><code>---
name: vercel-react-best-practices
description: Review React apps against Vercel guidance.
---

# React Best Practices
        </code></pre>
        <h2>Repository</h2>
        <p>vercel-labs/agent-skills</p>
      </article>
    `;

    const skill = parseSkillsShDetail(html, {
      owner: "vercel-labs",
      repo: "agent-skills",
      skillName: "vercel-react-best-practices",
      detailPath:
        "/vercel-labs/agent-skills/vercel-react-best-practices",
      detailUrl:
        "https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices",
    });

    expect(skill).toEqual(
      expect.objectContaining({
        source_url: "https://github.com/vercel-labs/agent-skills",
        source_directory: undefined,
        canonical_skill_path: undefined,
      }),
    );
  });

  it("does not infer a fake category for skills.sh entries without native category metadata", () => {
    const html = `
      <article>
        <h2>Summary</h2>
        <p>Review web API code and suggest improvements.</p>
        <h2>SKILL.md</h2>
        <pre><code># API Reviewer</code></pre>
      </article>
    `;

    const skill = parseSkillsShDetail(html, {
      owner: "demo",
      repo: "skills",
      skillName: "api-reviewer",
      detailPath: "/demo/skills/api-reviewer",
      detailUrl: "https://skills.sh/demo/skills/api-reviewer",
    });

    expect(skill?.category).toBe("general");
  });

  it("generates distinct source ids for different skills with the same display name", () => {
    const html = `
      <article>
        <h2>SKILL.md</h2>
        <pre><code>---
name: writer
description: Writer helper.
---

# Writer
        </code></pre>
      </article>
    `;

    const first = parseSkillsShDetail(html, {
      owner: "alpha",
      repo: "skills",
      skillName: "writer",
      detailPath: "/alpha/skills/writer",
      detailUrl: "https://skills.sh/alpha/skills/writer",
    });
    const second = parseSkillsShDetail(html, {
      owner: "beta",
      repo: "skills",
      skillName: "writer",
      detailPath: "/beta/skills/writer",
      detailUrl: "https://skills.sh/beta/skills/writer",
    });

    expect(first?.name).toBe("writer");
    expect(second?.name).toBe("writer");
    expect(first?.source_id).toBeDefined();
    expect(second?.source_id).toBeDefined();
    expect(first?.source_id).not.toBe(second?.source_id);
  });

  it("falls back to the default compatibility list when Installed on is absent", () => {
    const html = `
      <article>
        <h1>find-skills</h1>
        <h2>Summary</h2>
        <p>Use this skill whenever the user asks how to find or discover skills.</p>
        <h2>SKILL.md</h2>
        <pre><code>---
name: find-skills
description: Discover relevant skills and recommend the best next step.
tags: [search, discovery]
---

# Finding Skills
        </code></pre>
      </article>
    `;

    const skill = parseSkillsShDetail(html, {
      owner: "vercel-labs",
      repo: "skills",
      skillName: "find-skills",
      detailPath: "/vercel-labs/skills/find-skills",
      detailUrl: "https://skills.sh/vercel-labs/skills/find-skills",
    });

    expect(skill?.compatibility).toEqual([
      "claude",
      "codex",
      "cursor",
      "opencode",
      "antigravity",
    ]);
  });
});
