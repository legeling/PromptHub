import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  webRuntimeSchema,
  type WebRuntime,
} from "@prompthub/shared/utils/web-runtime";
import { fetchWithAuthRetry } from "../api/auth-session";

export function WebRuntimeBoundary({
  children,
}: {
  children: (runtime: WebRuntime) => ReactNode;
}): ReactNode {
  const { t } = useTranslation();
  const [runtime, setRuntime] = useState<WebRuntime | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    async function load(): Promise<void> {
      try {
        const response = await fetchWithAuthRetry("/api/runtime");
        if (!response.ok)
          throw new Error(`Runtime discovery failed: ${response.status}`);
        const payload: unknown = await response.json();
        const value = webRuntimeSchema.parse(
          typeof payload === "object" && payload !== null && "data" in payload
            ? payload.data
            : null,
        );
        if (!cancelled) setRuntime(value);
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load web runtime capabilities:", error);
          setFailed(true);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [attempt]);
  if (runtime) return children(runtime);
  return (
    <div className="flex min-h-screen items-center justify-center gap-4 bg-background text-foreground">
      {failed ? (
        <>
          <p role="alert">{t("runtime.loadFailed")}</p>
          <button
            type="button"
            className="rounded-lg border border-border px-4 py-2"
            onClick={() => setAttempt((value) => value + 1)}
          >
            {t("common.retry")}
          </button>
        </>
      ) : (
        <p role="status">{t("common.loading")}</p>
      )}
    </div>
  );
}
