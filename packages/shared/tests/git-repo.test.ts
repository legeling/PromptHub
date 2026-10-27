import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { parseGitRepo, parseGitHubTreeLocation } from "../utils/git-repo.ts";

describe("Git repository namespaces", () => {
  for (const base of [
    "http://172.26.0.18",
    "http://gitlab.internal:8080",
    "https://gitlab.com",
  ]) {
    for (const suffix of ["", "/", ".git", ".git/"]) {
      it(`accepts nested repository ${base} with suffix ${suffix}`, () => {
        const root = `${base}/eCore-ai/Skills/his-requirement-design-stable`;
        const parsed = parseGitRepo(root + suffix);
        assert.equal(parsed?.owner, "eCore-ai/Skills");
        assert.equal(parsed?.repo, "his-requirement-design-stable");
        assert.equal(parsed?.repositoryUrl, root);
        assert.equal(parsed?.cloneUrl, root);
      });
    }
  }

  it("preserves nested SSH transport and complete namespace", () => {
    const url = "git@172.26.0.18:eCore-ai/Skills/design.git";
    assert.deepEqual(parseGitRepo(url), {
      host: "172.26.0.18",
      owner: "eCore-ai/Skills",
      repo: "design",
      protocol: "ssh",
      cloneUrl: url,
      repositoryUrl: "https://172.26.0.18/eCore-ai/Skills/design",
    });
  });

  it("does not require letters in namespace and repository names", () => {
    assert.equal(
      parseGitRepo("https://gitlab.example/123/456/789")?.owner,
      "123/456",
    );
  });

  it("preserves existing two-level repository and tree URLs", () => {
    for (const host of ["github.com", "gitea.example.com"]) {
      const root = `https://${host}/team/skills`;
      assert.equal(parseGitRepo(root)?.cloneUrl, root);
      assert.equal(
        parseGitRepo(`${root}/tree/main/skills/writer`)?.cloneUrl,
        root,
      );
    }
    assert.deepEqual(
      parseGitHubTreeLocation(
        "https://github.com/team/skills/tree/main/skills/writer",
      ),
      {
        branch: "main",
        directory: "skills/writer",
      },
    );
  });

  for (const url of [
    "",
    "https://host/owner",
    "file:///tmp/team/repo",
    "--upload-pack=evil",
    "http://host/team/../repo",
    "http://host/team/./repo",
    "http://host/team//repo",
    "http://host/team/%2e%2e/repo",
    "http://host/team/repo?x=1",
    "http://host/team/repo#fragment",
    "http://host/team/re\npo",
    "http://host/team/re\0po",
    "git@host:team/../repo.git",
    "git@host:team//repo.git",
    "https://github.com/team/skills/blob/main/SKILL.md",
    "https://github.com/team/skills/extra",
  ]) {
    it(`rejects malformed or unsafe repository ${JSON.stringify(url)}`, () => {
      assert.equal(parseGitRepo(url), null);
    });
  }
});
