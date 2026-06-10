import { resolveGeneratedImageUrl } from "./generated-image-url";

interface DownloadGeneratedImageOptions {
  imageUrl: string;
  fileName: string;
}

export async function downloadGeneratedImage({
  imageUrl,
  fileName,
}: DownloadGeneratedImageOptions): Promise<void> {
  const resolved = resolveGeneratedImageUrl(imageUrl);
  if (!resolved) {
    throw new Error("Unsupported generated image URL");
  }

  const anchor = document.createElement("a");
  let href = resolved.url;
  let objectUrl: string | null = null;

  try {
    if (resolved.kind === "remote") {
      const response = await fetch(resolved.url);
      const blob = await response.blob();
      objectUrl = URL.createObjectURL(blob);
      href = objectUrl;
    }

    anchor.href = href;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    if (anchor.parentNode) {
      anchor.parentNode.removeChild(anchor);
    }
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  }
}
