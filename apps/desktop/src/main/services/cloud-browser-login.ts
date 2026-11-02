import callbackMessages from "./cloud-browser-login.locales.json";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { CloudUser } from "@prompthub/shared/types";
import { normalizeCloudBaseUrl } from "./cloud-api";

// Bounds the lifetime of an abandoned browser login and its local listener.
export const CLOUD_BROWSER_LOGIN_TIMEOUT_MS = 10 * 60_000;
type LoginResult = { user: CloudUser; baseUrl: string };
export interface BrowserExchangeInput {
  baseUrl: string;
  ticket: string;
  codeVerifier: string;
  signal: AbortSignal;
}

function callbackMessage(acceptLanguage: string | undefined): string {
  const messages: Record<string, string> = callbackMessages;
  for (const preference of (acceptLanguage ?? "en").split(",")) {
    const locale = preference.split(";")[0].trim().toLowerCase();
    const message = messages[locale] ?? messages[locale.split("-")[0]];
    if (message) return message;
  }
  return callbackMessages.en;
}

export class CloudBrowserLogin {
  private cancelPending: (() => void) | null = null;
  constructor(
    private readonly options: {
      openExternal: (url: string) => Promise<unknown>;
      exchange: (input: BrowserExchangeInput) => Promise<LoginResult>;
    },
  ) {}

  cancel(): void {
    this.cancelPending?.();
  }

  // One login owns the listener, cancellation and completion as one lifecycle.
  start(inputUrl: string): Promise<LoginResult> {
    if (this.cancelPending)
      return Promise.reject(new Error("cloud_browser_login_in_progress"));
    const baseUrl = normalizeCloudBaseUrl(inputUrl);
    const state = randomBytes(32).toString("base64url");
    const codeVerifier = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");
    const abort = new AbortController();
    return new Promise((resolve, reject) => {
      let finished = false;
      let exchanging = false;
      let callbackUrl = "";
      const finish = (error?: Error, result?: LoginResult) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        this.cancelPending = null;
        if (error) abort.abort(error);
        server.close();
        server.closeAllConnections();
        if (error) reject(error);
        else if (result) resolve(result);
      };
      const server = createServer((request, response) => {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Referrer-Policy", "no-referrer");
        response.setHeader("Content-Type", "text/plain; charset=utf-8");
        const callback = new URL(callbackUrl);
        let url: URL;
        try {
          url = new URL(request.url ?? "/", callback);
        } catch {
          response.writeHead(400).end("Invalid login callback.");
          return;
        }
        const ticket = url.searchParams.get("ticket") ?? "";
        if (
          request.method !== "GET" ||
          request.headers.host !== callback.host ||
          url.origin !== callback.origin ||
          url.pathname !== callback.pathname ||
          url.searchParams.get("state") !== state ||
          !/^[A-Za-z0-9_-]{43}$/.test(ticket) ||
          exchanging
        ) {
          response.writeHead(400).end("Invalid login callback.");
          return;
        }
        exchanging = true;
        response.end(callbackMessage(request.headers["accept-language"]));
        void this.options
          .exchange({ baseUrl, ticket, codeVerifier, signal: abort.signal })
          .then((result) => finish(undefined, result))
          .catch(() =>
            finish(new Error("cloud_browser_login_exchange_failed")),
          );
      });
      const timer = setTimeout(
        () => finish(new Error("cloud_browser_login_expired")),
        CLOUD_BROWSER_LOGIN_TIMEOUT_MS,
      );
      timer.unref();
      this.cancelPending = () =>
        finish(new Error("cloud_browser_login_cancelled"));
      server.on("error", () =>
        finish(new Error("cloud_browser_login_listener_failed")),
      );
      server.listen(0, "127.0.0.1", () => {
        if (finished) {
          server.close();
          return;
        }
        const address = server.address();
        if (!address || typeof address === "string") {
          finish(new Error("cloud_browser_login_listener_failed"));
          return;
        }
        callbackUrl = `http://127.0.0.1:${address.port}/auth/callback`;
        const start = new URL(`${baseUrl}/api/v1/auth/desktop/start`);
        start.search = new URLSearchParams({
          callbackUrl,
          state,
          codeChallenge,
        }).toString();
        void this.options
          .openExternal(start.toString())
          .catch(() => finish(new Error("cloud_browser_open_failed")));
      });
    });
  }
}
