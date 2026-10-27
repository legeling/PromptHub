import type { RemoteSyncAdapter } from "./sync-backup-core";

export function createWorkspaceHttpAdapter(
  baseUrl: string,
  accessToken: string,
): RemoteSyncAdapter {
  const prefix = `${baseUrl}/api/backups/desktop/workspace/`;
  const headers = { Authorization: `Bearer ${accessToken}` };
  return {
    paths: {
      manifest: "manifest.json",
      data: "data.json",
      legacy: "legacy.json",
      image: (name) => name,
      video: (name) => name,
    },
    async uploadText(name, content, condition) {
      const response = await fetch(prefix + encodeURIComponent(name), {
        method: "PUT",
        headers: {
          ...headers,
          ...(condition && "ifMatch" in condition
            ? { "If-Match": condition.ifMatch }
            : {}),
          ...(condition && "ifNoneMatch" in condition
            ? { "If-None-Match": condition.ifNoneMatch }
            : {}),
        },
        body: content,
      });
      return {
        success: response.ok,
        etag: response.headers.get("etag") ?? undefined,
        conflict: response.status === 412,
        error: response.ok ? undefined : await response.text(),
      };
    },
    async downloadText(name) {
      const response = await fetch(prefix + encodeURIComponent(name), {
        headers,
      });
      return {
        success: response.ok,
        notFound: response.status === 404,
        data: response.ok ? await response.text() : undefined,
        etag: response.headers.get("etag") ?? undefined,
        error: response.ok
          ? undefined
          : `Backup download failed: ${response.status}`,
      };
    },
    async deleteText(name) {
      const response = await fetch(prefix + encodeURIComponent(name), {
        method: "DELETE",
        headers,
      });
      return {
        success: response.ok,
        error: response.ok
          ? undefined
          : `Backup cleanup failed: ${response.status}`,
      };
    },
  };
}
