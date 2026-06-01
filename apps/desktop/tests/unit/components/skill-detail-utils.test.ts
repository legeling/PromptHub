import { describe, expect, it, vi } from "vitest";
import {
  downloadSkillZipExport,
  generateTextDiff,
  getSkillSourceMeta,
  groupSkillSafetyFindings,
  resolveGitHubMarkdownBase,
  resolveGitHubMarkdownUrl,
  resolveSkillDescription,
  restoreSkillVersion,
  stripFrontmatter,
} from "../../../src/renderer/components/skill/detail-utils";

describe("skill detail utils", () => {
  it("strips YAML frontmatter and keeps markdown body", () => {
    const content = `---
name: demo
description: example
---

# Title

Body`;

    expect(stripFrontmatter(content)).toBe("# Title\n\nBody");
    expect(stripFrontmatter("plain content")).toBe("plain content");
  });

  it("extracts multiline block descriptions from frontmatter", () => {
    const content = `---
name: demo
description: |
  Line one.
  Line two.
---

# Title`;

    expect(resolveSkillDescription(content)).toBe("Line one. Line two.");
  });

  it("restores a version through window api and reloads skills", async () => {
    const versionRollback = vi.fn().mockResolvedValue(undefined);
    const loadSkills = vi.fn().mockResolvedValue(undefined);

    (window as any).api = {
      skill: {
        versionRollback,
      },
    };

    await restoreSkillVersion(
      "skill-1",
      {
        id: "version-1",
        skillId: "skill-1",
        version: 3,
        content: "snapshot",
        note: "restore me",
        createdAt: new Date().toISOString(),
      } as any,
      loadSkills,
    );

    expect(versionRollback).toHaveBeenCalledWith("skill-1", 3);
    expect(loadSkills).toHaveBeenCalledTimes(1);
  });

  it("generates git-style diff lines for version comparison", () => {
    expect(generateTextDiff("line1\nline2", "line1\nline3")).toEqual([
      { type: "unchanged", content: "line1", oldLineNum: 1, newLineNum: 1 },
      { type: "remove", content: "line2", oldLineNum: 2 },
      { type: "add", content: "line3", newLineNum: 2 },
    ]);
  });

  it("localizes skill source labels through i18n keys", () => {
    const t = vi.fn(
      (key: string, fallback: string, options?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        "skill.sourceGithubStore": "Imported via Store",
        "skill.sourceRemoteGitRepo": "Imported from Remote Git Repository",
        "skill.sourceLocalFolder": "Imported from Local Folder",
        "skill.sourceCursorLocalFolder": "Imported from Cursor Folder",
        "skill.sourceAgentPlatformFolder": fallback.replace(
          "{{platform}}",
          String(options?.platform ?? ""),
        ),
      };
      return map[key] || fallback;
      },
    );

    const github = getSkillSourceMeta(
      {
        source_url: "https://github.com/org/repo",
        registry_slug: "official/repo",
      } as any,
      t as any,
    );
    const local = getSkillSourceMeta(
      {
        local_repo_path: "/Users/demo/.cursor/skills/example",
      } as any,
      t as any,
    );
    const localSourceUrl = getSkillSourceMeta(
      {
        source_url: "/Users/demo/project/skills/example",
      } as any,
      t as any,
    );
    const cherry = getSkillSourceMeta(
      {
        source_url:
          "/Users/demo/Library/Application Support/CherryStudio/Data/Skills/skill-creator",
      } as any,
      t as any,
    );

    expect(github?.sourceLabel).toBe("Imported via Store");
    expect(local?.sourceLabel).toBe("Imported from Cursor Agent Skills");
    expect(localSourceUrl?.kind).toBe("local");
    expect(localSourceUrl?.sourceLabel).toBe("Imported from Local Folder");
    expect(cherry?.kind).toBe("local");
    expect(cherry?.sourceLabel).toBe("Imported from Cherry Studio Agent Skills");
  });

  it("treats self-hosted git URLs as remote git repositories instead of local folders", () => {
    const remote = getSkillSourceMeta(
      {
        source_url: "https://gitea.example.com/org/skills/tree/main/writer",
      } as any,
      ((key: string, fallback: string) =>
        key === "skill.sourceGiteaRepo"
          ? "Imported from Gitea"
          : fallback) as any,
    );

    expect(remote).toMatchObject({
      kind: "remote",
      value: "https://gitea.example.com/org/skills/tree/main/writer",
      displayValue: "gitea.example.com/org/skills/tree/main/writer",
      sourceLabel: "Imported from Gitea",
    });
  });

  it("uses concrete source labels for Gitee and generic Git imports", () => {
    const gitee = getSkillSourceMeta(
      {
        source_url: "https://gitee.com/org/skills/tree/main/writer",
      } as any,
      ((key: string, fallback: string) =>
        key === "skill.sourceGiteeRepo"
          ? "Imported from Gitee"
          : fallback) as any,
    );
    const git = getSkillSourceMeta(
      {
        source_url: "https://git.example.com/org/skills/tree/main/writer",
      } as any,
      ((key: string, fallback: string) =>
        key === "skill.sourceGitRepo"
          ? "Imported from Git Repository"
          : fallback) as any,
    );

    expect(gitee?.sourceLabel).toBe("Imported from Gitee");
    expect(git?.sourceLabel).toBe("Imported from Git Repository");
  });

  it("resolves GitHub markdown base paths for repo subdirectories", () => {
    expect(
      resolveGitHubMarkdownBase(
        "https://github.com/anthropics/skills/tree/main/skills/pdf",
      ),
    ).toEqual({
      hrefBase: "https://github.com/anthropics/skills/blob/main/skills/pdf/",
      imageBase:
        "https://raw.githubusercontent.com/anthropics/skills/main/skills/pdf/",
    });
  });

  it("rewrites relative markdown assets against GitHub repo paths", () => {
    const base = resolveGitHubMarkdownBase(
      "https://github.com/anthropics/skills/tree/main/skills/pdf",
    );

    expect(resolveGitHubMarkdownUrl("./images/demo.png", base, "image")).toBe(
      "https://raw.githubusercontent.com/anthropics/skills/main/skills/pdf/images/demo.png",
    );
    expect(resolveGitHubMarkdownUrl("docs/setup.md", base, "link")).toBe(
      "https://github.com/anthropics/skills/blob/main/skills/pdf/docs/setup.md",
    );
  });

  it("groups repeated safety findings by code and severity", () => {
    const grouped = groupSkillSafetyFindings([
      {
        code: "script-file",
        severity: "warn",
        title: "Repository contains executable scripts",
        detail: "repo contains scripts",
        filePath: "scripts/a.ts",
        evidence: "scripts/a.ts",
      },
      {
        code: "script-file",
        severity: "warn",
        title: "Repository contains executable scripts",
        detail: "repo contains scripts",
        filePath: "scripts/b.ts",
        evidence: "scripts/b.ts",
      },
      {
        code: "secret-access",
        severity: "high",
        title: "Reads secret-bearing paths",
        detail: "references .env",
        filePath: "SKILL.md",
        evidence: ".env",
      },
    ] as any);

    expect(grouped).toHaveLength(2);
    expect(grouped[0]).toMatchObject({
      code: "secret-access",
      severity: "high",
      count: 1,
      filePaths: ["SKILL.md"],
    });
    expect(grouped[1]).toMatchObject({
      code: "script-file",
      severity: "warn",
      count: 2,
      filePaths: ["scripts/a.ts", "scripts/b.ts"],
    });
  });

  it("downloads zip exports using the provided file name", () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const originalCreateElement = document.createElement.bind(document);

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });

    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:skill-zip");
    const revokeObjectURL = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    const anchor = originalCreateElement("a");
    const clickSpy = vi.spyOn(anchor, "click").mockImplementation(() => {});
    const appendChild = vi.spyOn(document.body, "appendChild");
    const removeChild = vi.spyOn(document.body, "removeChild");
    const createElementSpy = vi
      .spyOn(document, "createElement")
      .mockImplementation((tagName) => {
        if (tagName === "a") {
          return anchor;
        }
        return originalCreateElement(tagName);
      });

    downloadSkillZipExport({
      fileName: "write.zip",
      base64: "UEsDBA==",
    });

    expect(anchor.download).toBe("write.zip");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(createObjectURL.mock.calls[0]?.[0]).toBeInstanceOf(Blob);
    expect((createObjectURL.mock.calls[0]?.[0] as Blob).type).toBe(
      "application/zip",
    );
    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(removeChild).toHaveBeenCalledWith(anchor);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:skill-zip");

    createElementSpy.mockRestore();
    clickSpy.mockRestore();

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: originalCreateObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: originalRevokeObjectURL,
    });
  });
});
