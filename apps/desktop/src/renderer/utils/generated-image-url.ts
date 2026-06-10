const GENERATED_IMAGE_DATA_URL_PATTERN =
  /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/i;

export type GeneratedImageUrl =
  | { kind: "remote"; url: string }
  | { kind: "data"; url: string; base64: string };

export function resolveGeneratedImageUrl(
  imageUrl?: string | null,
): GeneratedImageUrl | null {
  const trimmed = imageUrl?.trim() ?? "";
  if (!trimmed) {
    return null;
  }

  if (GENERATED_IMAGE_DATA_URL_PATTERN.test(trimmed)) {
    return {
      kind: "data",
      url: trimmed,
      base64: trimmed.slice(trimmed.indexOf(",") + 1),
    };
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return { kind: "remote", url: parsed.toString() };
    }
  } catch {
    return null;
  }

  return null;
}
