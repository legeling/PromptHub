import { afterEach, expect, it, vi } from "vitest";
import {
  downloadFromWebDAV,
  uploadToWebDAV,
} from "../../../src/renderer/services/webdav";
import { parseHistoryListing } from "../../../src/renderer/services/webdav-history";

const config = {
  url: "https://fixture.invalid/dav",
  username: "qa",
  password: "",
};
afterEach(() => vi.unstubAllGlobals());

it("restores both acknowledged uploads when storage accepts both latest manifests", async () => {
  const objects = new Map<string, string>();
  let captures = 0;
  let imported = "";
  const applied: string[] = [];
  vi.stubGlobal("electron", {
    webdav: {
      ensureDirectory: async () => ({ success: true }),
      download: async (url: string) =>
        objects.has(url)
          ? { success: true, etag: '"same"', data: objects.get(url) }
          : { success: false, notFound: true },
      upload: async (url: string, _config: unknown, text: string) => {
        objects.set(url, text);
        return { success: true };
      },
    },
    workspaceSnapshot: async (request: {
      action: string;
      sessionId?: string;
      data?: string;
    }) => {
      switch (request.action) {
        case "capture":
          return { success: true, sessionId: String(++captures), sizeBytes: 1 };
        case "read":
          return {
            success: true,
            data: btoa(request.sessionId!),
            sha256: "a".repeat(64),
            sizeBytes: 1,
          };
        case "begin-import":
          return { success: true, sessionId: "import" };
        case "append":
          imported = atob(request.data!);
          break;
        case "restore":
          applied.push(imported);
      }
      return { success: true };
    },
  });
  const results = await Promise.all([
    uploadToWebDAV(config),
    uploadToWebDAV(config),
  ]);
  expect(results.map((result) => result.success)).toEqual([true, true]);
  const archives = [...objects.keys()].filter((key) =>
    key.includes("/history/"),
  );
  expect(archives).toHaveLength(2);
  for (const url of archives) {
    const result = await downloadFromWebDAV(config, {
      versionFile: url.split("/").pop(),
    });
    expect(result.success).toBe(true);
  }
  expect(applied.sort()).toEqual(["1", "2"]);
  const archived = archives[0];
  objects.set(archived, "{}");
  await expect(
    downloadFromWebDAV(config, { versionFile: archived.split("/").pop() }),
  ).rejects.toThrow("corrupt");
  expect(applied).toHaveLength(2);
});

it("lists only snapshots belonging to the selected WebDAV directory", () => {
  const folder = "https://example.test/dav/history/";
  const name = "1795267600000-" + "a".repeat(64) + ".json";
  const other = name.replace("a", "b");
  const hrefs = [
    folder + name,
    "/dav/history/" + name,
    "/elsewhere/" + other,
    "https://other.test/dav/history/" + other,
    "/dav/history/deeper/" + other,
  ];
  const listing =
    '<d:multistatus xmlns:d="DAV:">' +
    hrefs
      .map((href) => "<d:response><d:href>" + href + "</d:href></d:response>")
      .join("") +
    "</d:multistatus>";
  expect(parseHistoryListing(listing, folder)).toEqual([name]);
});
