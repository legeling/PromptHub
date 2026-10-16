import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  publishCanonicalEntries,
  recoverCanonicalEntryPublication,
} from "../src/canonical-entry-publication";

const roots: string[] = [];

function createRoot(): string {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-entry-publication-"),
  );
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("canonical entry publication", () => {
  it.each([false, true])(
    "handles deletion below an absent parent during commit or rollback (failure %s)",
    (fail) => {
      const root = createRoot();
      const absent = path.join(root, "data", "never-created", "body.md");
      const publish = () =>
        publishCanonicalEntries({
          rootPath: root,
          operationKey: "absent-deletion",
          entries: [{ targetPath: absent, delete: true }],
          verify() {
            if (fail) throw new Error("injected verification failure");
          },
        });
      if (fail) expect(publish).toThrow("injected verification failure");
      else expect(publish()).toMatchObject({ cleanupPending: false });
      expect(fs.existsSync(path.dirname(absent))).toBe(false);
      expect(recoverCanonicalEntryPublication(root, "absent-deletion")).toBe(
        "none",
      );
    },
  );

  it("publishes replacements and deletions as one verified unit", () => {
    const root = createRoot();
    const first = path.join(root, "data", "mcp", "one");
    const removed = path.join(root, "data", "mcp", "removed");
    fs.mkdirSync(first, { recursive: true });
    fs.mkdirSync(removed, { recursive: true });
    fs.writeFileSync(path.join(first, "value.txt"), "old");

    publishCanonicalEntries({
      rootPath: root,
      operationKey: "mcp-library",
      entries: [
        {
          targetPath: first,
          prepare(stagePath) {
            fs.mkdirSync(stagePath);
            fs.writeFileSync(path.join(stagePath, "value.txt"), "new");
          },
        },
        { targetPath: removed, delete: true },
      ],
      verify() {
        expect(fs.readFileSync(path.join(first, "value.txt"), "utf8")).toBe(
          "new",
        );
        expect(fs.existsSync(removed)).toBe(false);
      },
    });

    expect(fs.readFileSync(path.join(first, "value.txt"), "utf8")).toBe("new");
    expect(fs.existsSync(removed)).toBe(false);
    expect(recoverCanonicalEntryPublication(root, "mcp-library")).toBe("none");
  });

  it("rolls every entry back when publication or verification fails", () => {
    const root = createRoot();
    const first = path.join(root, "data", "mcp", "one");
    const second = path.join(root, "config", "devices", "mcp.json");
    fs.mkdirSync(first, { recursive: true });
    fs.mkdirSync(path.dirname(second), { recursive: true });
    fs.writeFileSync(path.join(first, "value.txt"), "old");
    fs.writeFileSync(second, "old-config");

    expect(() =>
      publishCanonicalEntries({
        rootPath: root,
        operationKey: "mcp-library",
        entries: [
          {
            targetPath: first,
            prepare(stagePath) {
              fs.mkdirSync(stagePath);
              fs.writeFileSync(path.join(stagePath, "value.txt"), "new");
            },
          },
          {
            targetPath: second,
            prepare(stagePath) {
              fs.writeFileSync(stagePath, "new-config");
            },
          },
        ],
        verify() {
          throw new Error("verification failed");
        },
      }),
    ).toThrow("verification failed");

    expect(fs.readFileSync(path.join(first, "value.txt"), "utf8")).toBe("old");
    expect(fs.readFileSync(second, "utf8")).toBe("old-config");
  });

  it("rejects escaped targets and unsafe journals", () => {
    const root = createRoot();
    expect(() =>
      publishCanonicalEntries({
        rootPath: root,
        operationKey: "mcp-library",
        entries: [
          {
            targetPath: path.join(root, "..", "escape"),
            prepare() {},
          },
        ],
      }),
    ).toThrow(/escapes/u);

    const journal = path.join(
      root,
      "data",
      "operations",
      "journals",
      "mcp-library-publication.json",
    );
    fs.mkdirSync(path.dirname(journal), { recursive: true });
    fs.symlinkSync(path.join(root, "elsewhere"), journal);
    expect(() => recoverCanonicalEntryPublication(root, "mcp-library")).toThrow(
      /unsafe/u,
    );
  });
});
