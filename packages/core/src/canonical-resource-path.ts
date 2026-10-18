const SAFE_RESOURCE_PATH_BYTE = /^[A-Za-z0-9._-]$/u;

export function encodeCanonicalResourceDirectory(resourceId: string): string {
  if (typeof resourceId !== "string" || resourceId.length === 0) {
    throw new Error("Canonical resource id is required");
  }
  return Array.from(new TextEncoder().encode(resourceId), (byte) => {
    const character = String.fromCharCode(byte);
    return SAFE_RESOURCE_PATH_BYTE.test(character)
      ? character
      : `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
  }).join("");
}
