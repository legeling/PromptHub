import path from "path";
import { describe, expect, it } from "vitest";

import { getRecoveryCandidatePaths } from "../../../src/main/services/recovery-paths";

describe("recovery-paths", () => {
  it("includes both PromptHub and prompthub roaming/local variants on Windows", () => {
    const results = getRecoveryCandidatePaths({
      currentPath: "C:\\Users\\Alice\\AppData\\Roaming\\PromptHub",
      appDataPath: "C:\\Users\\Alice\\AppData\\Roaming",
      homePath: "C:\\Users\\Alice",
      exePath: "D:\\Apps\\PromptHub\\PromptHub.exe",
      isPackaged: true,
      platform: "win32",
      localAppDataPath: "C:\\Users\\Alice\\AppData\\Local",
    });

    expect(results).toContain("C:\\Users\\Alice\\AppData\\Local\\PromptHub");
    expect(results).toContain(
      "C:\\Users\\Alice\\AppData\\Local\\Programs\\PromptHub\\data",
    );
    expect(results).toContain("D:\\Apps\\PromptHub\\data");
    expect(results).not.toContain("C:\\Users\\Alice\\AppData\\Roaming\\PromptHub");
  });

  it("deduplicates case-insensitive Windows paths", () => {
    const results = getRecoveryCandidatePaths({
      currentPath: "C:\\Users\\Alice\\AppData\\Roaming\\PromptHub",
      appDataPath: "C:\\Users\\Alice\\AppData\\Roaming",
      homePath: "C:\\Users\\Alice",
      exePath: "C:\\Users\\Alice\\AppData\\Local\\Programs\\PromptHub\\PromptHub.exe",
      isPackaged: true,
      platform: "win32",
      localAppDataPath: "C:\\Users\\Alice\\AppData\\Local",
    });

    const normalized = results.map((entry) => path.win32.normalize(entry).toLowerCase());
    expect(new Set(normalized).size).toBe(normalized.length);
  });

  it("keeps the existing macOS-style default path behavior on non-Windows platforms", () => {
    const results = getRecoveryCandidatePaths({
      currentPath: "/Users/alice/Library/Application Support/PromptHub",
      appDataPath: "/Users/alice/Library/Application Support",
      homePath: "/Users/alice",
      exePath: "/Applications/PromptHub.app/Contents/MacOS/PromptHub",
      isPackaged: true,
      platform: "darwin",
    });

    expect(results).toEqual(["/Users/alice/Library/Application Support/prompthub"]);
  });
});
