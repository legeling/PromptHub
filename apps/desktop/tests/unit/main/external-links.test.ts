/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { openExternalMock } = vi.hoisted(() => ({
  openExternalMock: vi.fn(),
}));

vi.mock("electron", () => ({
  shell: {
    openExternal: openExternalMock,
  },
}));

describe("external window links", () => {
  beforeEach(() => {
    openExternalMock.mockReset();
  });

  it.each([
    "https://github.com/legeling/PromptHub",
    "http://localhost:5173/docs",
    "mailto:legeling567@gmail.com",
    "tel:+123456789",
  ])("allows expected external protocol %s", async (url) => {
    const { handleExternalWindowOpen, isAllowedExternalUrl } = await import(
      "../../../src/main/external-links"
    );

    expect(isAllowedExternalUrl(url)).toBe(true);
    expect(handleExternalWindowOpen({ url })).toEqual({ action: "deny" });
    expect(openExternalMock).toHaveBeenCalledWith(url);
  });

  it.each([
    "javascript:alert(1)",
    "file:///Users/demo/.ssh/id_rsa",
    "data:text/html,<script>alert(1)</script>",
    "local-image://demo/image.png",
    "ftp://example.com/file",
    "#local-anchor",
    "/relative/path",
    "",
    "not a url",
  ])("denies unsafe or non-external protocol %s", async (url) => {
    const { handleExternalWindowOpen, isAllowedExternalUrl } = await import(
      "../../../src/main/external-links"
    );

    expect(isAllowedExternalUrl(url)).toBe(false);
    expect(handleExternalWindowOpen({ url })).toEqual({ action: "deny" });
    expect(openExternalMock).not.toHaveBeenCalled();
  });
});
