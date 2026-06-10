import { shell } from "electron";
import type { HandlerDetails, WindowOpenHandlerResponse } from "electron";

const ALLOWED_EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

export function isAllowedExternalUrl(url: string): boolean {
  if (!url || url.trim() !== url) {
    return false;
  }

  try {
    return ALLOWED_EXTERNAL_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

export function handleExternalWindowOpen(
  details: Pick<HandlerDetails, "url">,
): WindowOpenHandlerResponse {
  if (isAllowedExternalUrl(details.url)) {
    void Promise.resolve(shell.openExternal(details.url)).catch((error: unknown) => {
      console.warn(
        "Failed to open external URL:",
        error instanceof Error ? error.message : error,
      );
    });
  }

  return { action: "deny" };
}
