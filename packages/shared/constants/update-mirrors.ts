export const UPDATE_MIRRORS = [
  {
    id: "ghfast",
    label: "ghfast.top",
    prefix: "https://ghfast.top/https://github.com",
  },
  {
    id: "gh-proxy",
    label: "gh-proxy.com",
    prefix: "https://gh-proxy.com/https://github.com",
  },
  {
    id: "gitmirror",
    label: "hub.gitmirror.com",
    prefix: "https://hub.gitmirror.com/https://github.com",
  },
  {
    id: "isteed",
    label: "cors.isteed.cc",
    prefix: "https://cors.isteed.cc/github.com",
  },
] as const;

export type UpdateMirrorSource =
  | "automatic"
  | (typeof UPDATE_MIRRORS)[number]["id"];

export function normalizeUpdateMirrorSource(
  value: unknown,
): UpdateMirrorSource {
  return (
    UPDATE_MIRRORS.find((mirror) => mirror.id === value)?.id ?? "automatic"
  );
}
