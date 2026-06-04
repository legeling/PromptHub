import { describe, expect, it, vi } from "vitest";

import {
  CLAWHUB_BASE_URL,
  loadClawHubSkills,
  loadClawHubSkillsPage,
} from "../../../src/renderer/services/clawhub-store";

describe("clawhub store", () => {
  it("maps ClawHub catalog entries to registry skills with fetched SKILL.md content", async () => {
    const skillMd = [
      "---",
      "name: smart-api-connector",
      "description: Connect APIs safely",
      "version: 2.0.0",
      "author: claw",
      "tags: [api, dev]",
      "---",
      "",
      "# Smart API Connector",
      "",
      "Use this skill for API integration.",
      "",
    ].join("\n");
    const fetchRemoteContent = vi.fn(async (url: string) => {
      if (url.startsWith(`${CLAWHUB_BASE_URL}/api/v1/skills?`)) {
        return JSON.stringify({
          skills: [
            {
              slug: "smart-api-connector",
              owner: { username: "coderclaw" },
              displayName: "Smart API Connector",
              description: "Fallback description",
              stars: 42,
            },
          ],
        });
      }

      if (
        url ===
        `${CLAWHUB_BASE_URL}/api/v1/skills/smart-api-connector/file?path=SKILL.md`
      ) {
        return skillMd;
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const skills = await loadClawHubSkills({ fetchRemoteContent, limit: 5 });

    expect(fetchRemoteContent).toHaveBeenCalledWith(
      `${CLAWHUB_BASE_URL}/api/v1/skills?sort=recommended&limit=5`,
    );
    expect(fetchRemoteContent).not.toHaveBeenCalledWith(
      expect.stringContaining("nonSuspiciousOnly"),
    );
    expect(skills).toHaveLength(1);
    expect(skills[0]).toEqual(
      expect.objectContaining({
        name: "smart-api-connector",
        source_label: "ClawHub",
        source_url: "https://clawhub.ai/coderclaw/smart-api-connector",
        content_url:
          "https://clawhub.ai/api/v1/skills/smart-api-connector/file?path=SKILL.md",
        content: skillMd,
        category: "general",
        version: "2.0.0",
        author: "claw",
        tags: ["api", "dev"],
      }),
    );
    expect(skills[0].source_id).toMatch(/^[a-f0-9]{64}$/);
  });

  it("does not infer a fake category when ClawHub does not provide one", async () => {
    const fetchRemoteContent = vi.fn(async (url: string) => {
      if (url.startsWith(`${CLAWHUB_BASE_URL}/api/v1/skills?`)) {
        return JSON.stringify({
          skills: [
            {
              slug: "web-api-reviewer",
              owner: { username: "coderclaw" },
              displayName: "Web API Reviewer",
              description: "Review web API code and suggest improvements.",
            },
          ],
        });
      }

      if (
        url ===
        `${CLAWHUB_BASE_URL}/api/v1/skills/web-api-reviewer/file?path=SKILL.md`
      ) {
        return "# Web API Reviewer";
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const skills = await loadClawHubSkills({ fetchRemoteContent, limit: 5 });

    expect(skills[0].category).toBe("general");
  });

  it("returns the ClawHub next cursor for lazy pagination", async () => {
    const fetchRemoteContent = vi.fn(async (url: string) => {
      if (url.startsWith(`${CLAWHUB_BASE_URL}/api/v1/skills?`)) {
        return JSON.stringify({
          items: [
            {
              slug: "sonoscli",
              displayName: "Sonoscli",
              summary: "Control Sonos speakers.",
            },
          ],
          nextCursor: "cursor-2",
        });
      }

      if (url === `${CLAWHUB_BASE_URL}/api/v1/skills/sonoscli/file?path=SKILL.md`) {
        return "# Sonoscli";
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const page = await loadClawHubSkillsPage({
      cursor: "cursor-1",
      fetchRemoteContent,
      limit: 5,
    });

    expect(fetchRemoteContent).toHaveBeenCalledWith(
      `${CLAWHUB_BASE_URL}/api/v1/skills?sort=recommended&limit=5&cursor=cursor-1`,
    );
    expect(page.skills).toHaveLength(1);
    expect(page.nextCursor).toBe("cursor-2");
  });

  it("uses the ClawHub search endpoint when a search query is provided", async () => {
    const fetchRemoteContent = vi.fn(async (url: string) => {
      if (url === `${CLAWHUB_BASE_URL}/api/v1/search?q=data&limit=5`) {
        return JSON.stringify({
          results: [
            {
              slug: "data-analysis",
              owner: { username: "analyst" },
              displayName: "Data Analysis",
              description: "Analyze structured datasets.",
            },
          ],
        });
      }

      if (
        url ===
        `${CLAWHUB_BASE_URL}/api/v1/skills/data-analysis/file?path=SKILL.md`
      ) {
        return "# Data Analysis";
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const page = await loadClawHubSkillsPage({
      fetchRemoteContent,
      limit: 5,
      searchQuery: " data ",
    });

    expect(fetchRemoteContent).toHaveBeenCalledWith(
      `${CLAWHUB_BASE_URL}/api/v1/search?q=data&limit=5`,
    );
    expect(fetchRemoteContent).not.toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/skills?sort="),
    );
    expect(page.skills).toEqual([
      expect.objectContaining({
        name: "Data Analysis",
        source_url: "https://clawhub.ai/analyst/data-analysis",
      }),
    ]);
    expect(page.nextCursor).toBeUndefined();
  });

  it("accepts nested ClawHub pagination cursors from compatible list responses", async () => {
    const fetchRemoteContent = vi.fn(async (url: string) => {
      if (url.startsWith(`${CLAWHUB_BASE_URL}/api/v1/skills?`)) {
        return JSON.stringify({
          data: [
            {
              slug: "gifgrep",
              displayName: "GifGrep",
              summary: "Search GIF providers.",
            },
          ],
          pagination: {
            nextCursor: "nested-cursor-2",
          },
        });
      }

      if (url === `${CLAWHUB_BASE_URL}/api/v1/skills/gifgrep/file?path=SKILL.md`) {
        return "# GifGrep";
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const page = await loadClawHubSkillsPage({
      fetchRemoteContent,
      limit: 5,
    });

    expect(page.skills).toHaveLength(1);
    expect(page.nextCursor).toBe("nested-cursor-2");
  });
});
