import { beforeEach, describe, expect, it, vi } from "vitest";
import { copyGenerationImage } from "../../../src/renderer/services/generation-image-clipboard";

const write = vi.fn();
const read = vi.fn();
class ClipboardItemFixture {
  constructor(readonly data: Record<string, Blob>) {}
}

describe("generated image clipboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("ClipboardItem", ClipboardItemFixture);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { write },
    });
    Object.assign(window.api.generation, { readOutputReference: read });
    read.mockResolvedValue({ mimeType: "image/png", base64: "aW1hZ2U=" });
    write.mockResolvedValue(undefined);
  });

  it("writes image bytes as a PNG clipboard item, never prompt text or a URL", async () => {
    await copyGenerationImage("batch", "output");
    expect(read).toHaveBeenCalledWith({ batchId: "batch", outputId: "output" });
    const item: ClipboardItemFixture = write.mock.calls[0][0][0];
    expect(Object.keys(item.data)).toEqual(["image/png"]);
    expect(item.data["image/png"].type).toBe("image/png");
    expect(item.data["image/png"].size).toBe(5);
  });

  it("propagates unreadable output and clipboard denial instead of reporting success", async () => {
    read.mockRejectedValueOnce(new Error("Missing output"));
    await expect(copyGenerationImage("batch", "missing")).rejects.toThrow(
      "Missing output",
    );
    expect(write).not.toHaveBeenCalled();
    write.mockRejectedValueOnce(new Error("Clipboard denied"));
    await expect(copyGenerationImage("batch", "output")).rejects.toThrow(
      "Clipboard denied",
    );
  });
});
