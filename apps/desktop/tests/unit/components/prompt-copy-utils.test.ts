import { afterEach, describe, expect, it, vi } from "vitest";

import type { Prompt } from "@prompthub/shared/types";
import {
  buildPromptCopyText,
  copyTextToClipboard,
  hasUserDefinedPromptVariables,
  resolvePromptContentByLanguage,
} from "../../../src/renderer/components/prompt/prompt-copy-utils";

const basePrompt: Prompt = {
  id: "prompt-1",
  title: "Prompt",
  userPrompt: "中文用户提示词",
  userPromptEn: "English user prompt",
  systemPrompt: "中文系统提示词",
  systemPromptEn: "English system prompt",
  variables: [],
  tags: [],
  isFavorite: false,
  isPinned: false,
  version: 1,
  currentVersion: 1,
  usageCount: 0,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

describe("prompt-copy-utils", () => {
  const originalClipboard = navigator.clipboard;
  const originalExecCommand = document.execCommand;
  const originalIsSecureContext = globalThis.isSecureContext;

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: originalClipboard,
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: originalExecCommand,
    });
    Object.defineProperty(globalThis, "isSecureContext", {
      configurable: true,
      value: originalIsSecureContext,
    });
    vi.restoreAllMocks();
  });

  it("resolves English prompt content when English mode is enabled", () => {
    expect(resolvePromptContentByLanguage(basePrompt, true)).toEqual({
      systemPrompt: "English system prompt",
      userPrompt: "English user prompt",
    });
  });

  it("falls back to the default prompt content when English text is missing", () => {
    expect(
      resolvePromptContentByLanguage(
        {
          ...basePrompt,
          systemPromptEn: undefined,
          userPromptEn: undefined,
        },
        true,
      ),
    ).toEqual({
      systemPrompt: "中文系统提示词",
      userPrompt: "中文用户提示词",
    });
  });

  it("ignores system variables when deciding whether to open the variable modal", () => {
    expect(
      hasUserDefinedPromptVariables(
        "Today is {{CURRENT_DATE}}",
        "Use {{CURRENT_TIME}} for the answer",
      ),
    ).toBe(false);
  });

  it("detects user variables and copies only user prompt text", () => {
    expect(
      hasUserDefinedPromptVariables(
        "Role: {{role}}",
        "Task: {{task}}",
      ),
    ).toBe(true);
    expect(
      buildPromptCopyText({
        systemPrompt: "System",
        userPrompt: "User",
      }),
    ).toBe("User");
  });

  it("does not include system prompt or role labels when copying user prompt text", () => {
    const copyText = buildPromptCopyText({
      systemPrompt: "System-only instructions",
      userPrompt: "User-only task",
    });

    expect(copyText).toBe("User-only task");
    expect(copyText).not.toContain("[System]");
    expect(copyText).not.toContain("[User]");
    expect(copyText).not.toContain("System-only instructions");
  });

  it("detects default-value user variables by normalized variable name", () => {
    expect(
      hasUserDefinedPromptVariables(
        "Today is {{CURRENT_DATE}}",
        "Task: {{task:write release notes}}",
      ),
    ).toBe(true);
  });

  it("copies Markdown text with the Clipboard API when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    await copyTextToClipboard("# Title\n\n```ts\nconst ok = true;\n```");

    expect(writeText).toHaveBeenCalledWith(
      "# Title\n\n```ts\nconst ok = true;\n```",
    );
  });

  it("falls back to textarea copy when Clipboard API is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand,
    });

    await copyTextToClipboard("# Markdown\n\n- item");

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("prefers textarea fallback in insecure browser contexts", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    Object.defineProperty(globalThis, "isSecureContext", {
      configurable: true,
      value: false,
    });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand,
    });

    await copyTextToClipboard("# Markdown on self-hosted HTTP");

    expect(writeText).not.toHaveBeenCalled();
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("falls back to textarea copy when Clipboard API rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("NotAllowedError"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand,
    });

    await copyTextToClipboard("## Markdown table\n\n| A | B |\n| - | - |");

    expect(writeText).toHaveBeenCalled();
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("reports copy failure when Clipboard API and fallback both fail", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn().mockReturnValue(false),
    });

    await expect(copyTextToClipboard("copy me")).rejects.toThrow(
      /Clipboard copy failed/,
    );
  });
});
