async function asClipboardPng(blob: Blob): Promise<Blob> {
  if (blob.type === "image/png") return blob;
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Cannot create image clipboard canvas");
    context.drawImage(bitmap, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) =>
          result
            ? resolve(result)
            : reject(new Error("Cannot encode clipboard image")),
        "image/png",
      );
    });
  } finally {
    bitmap.close();
  }
}

/** Read the managed original, not the preview's zoomed or cropped pixels. */
export async function copyGenerationImage(
  batchId: string,
  outputId: string,
): Promise<void> {
  const image = await window.api.generation.readOutputReference({
    batchId,
    outputId,
  });
  const bytes = Uint8Array.from(atob(image.base64), (char) =>
    char.charCodeAt(0),
  );
  const png = await asClipboardPng(new Blob([bytes], { type: image.mimeType }));
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}
