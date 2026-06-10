import { afterEach, describe, expect, it, vi } from "vitest";

import { downloadGeneratedImage } from "../../../src/renderer/utils/download-generated-image";

describe("downloadGeneratedImage", () => {
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: originalCreateObjectUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevokeObjectUrl,
    });
  });

  it("downloads data URLs without creating object URLs", async () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    await downloadGeneratedImage({
      imageUrl: "data:image/png;base64,AAAA",
      fileName: "generated.png",
    });

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it("revokes object URLs after downloading remote images", async () => {
    const blob = new Blob(["image"], { type: "image/png" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        blob: vi.fn().mockResolvedValue(blob),
      }),
    );
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn().mockReturnValue("blob:generated-image"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    await downloadGeneratedImage({
      imageUrl: "https://example.com/generated.png",
      fileName: "generated.png",
    });

    expect(fetch).toHaveBeenCalledWith("https://example.com/generated.png");
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:generated-image");
  });

  it("revokes object URLs when clicking the download link fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        blob: vi.fn().mockResolvedValue(new Blob(["image"])),
      }),
    );
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn().mockReturnValue("blob:generated-image"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      throw new Error("click failed");
    });

    await expect(
      downloadGeneratedImage({
        imageUrl: "https://example.com/generated.png",
        fileName: "generated.png",
      }),
    ).rejects.toThrow("click failed");

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:generated-image");
    expect(document.querySelectorAll("a[download='generated.png']")).toHaveLength(0);
  });

  it("does not fetch or click unsupported generated image URLs", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    await expect(
      downloadGeneratedImage({
        imageUrl: "javascript:alert(1)",
        fileName: "generated.png",
      }),
    ).rejects.toThrow("Unsupported generated image URL");

    await expect(
      downloadGeneratedImage({
        imageUrl: "data:text/html;base64,PHNjcmlwdD4=",
        fileName: "generated.html",
      }),
    ).rejects.toThrow("Unsupported generated image URL");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(clickSpy).not.toHaveBeenCalled();
  });
});
