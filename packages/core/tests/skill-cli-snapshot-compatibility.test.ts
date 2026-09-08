import { describe, expect, it } from "vitest";
import { parseCliWorkspaceBundle } from "../src/cli/workspace-sync";

describe("CLI lossless Skill snapshot import", () => {
  const payload = {
    version: "prompthub-skill-snapshot-v2",
    exportedAt: "2026-09-08T00:00:00Z",
    prompts: [],
    folders: [],
    skills: [],
    skillVersions: [],
    skillFiles: {
      s: [{ relativePath: "icon.bin", content: "AP+A", encoding: "base64" }],
    },
  };
  it("preserves encoding in new bundle and raw sync formats", () => {
    const bundle = parseCliWorkspaceBundle(
      JSON.stringify({ kind: "prompthub-cli-workspace", version: 3, payload }),
    );
    expect(bundle.payload.skillFiles).toEqual(payload.skillFiles);
    expect(
      parseCliWorkspaceBundle(JSON.stringify(payload)).payload.skillFiles,
    ).toEqual(payload.skillFiles);
  });
  it("rejects invalid encoded input before a restore command can clear data", () => {
    expect(() =>
      parseCliWorkspaceBundle(
        JSON.stringify({
          ...payload,
          skillFiles: {
            s: [{ relativePath: "icon.bin", content: "x", encoding: "future" }],
          },
        }),
      ),
    ).toThrow();
  });
});
