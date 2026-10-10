import { useEffect, useState } from "react";
import type { Prompt } from "@prompthub/shared/types";
import { usePromptStore } from "../stores/prompt.store";

interface UsePromptDetailResult {
  /** Full prompt when loaded from the detail cache, null otherwise. */
  prompt: Prompt | null;
  /** True while the on-demand IPC fetch is in flight. */
  isLoading: boolean;
  /** True when the fetch failed (id not found / IPC error). */
  hasError: boolean;
  /** Re-fetch the detail, bypassing the cache. */
  reload: () => Promise<void>;
}

/**
 * Resolve a prompt's full content on demand from the prompt store's detail
 * cache. The first call for a given id triggers `getPromptDetail(id)` (one IPC
 * round-trip via prompt:get); subsequent calls for the same id hit the cache
 * without further IPC.
 *
 * 按需获取 prompt 完整内容：首次调用触发 prompt:get 并写入 store 详情缓存，
 * 之后同 id 直接命中缓存，不再发 IPC。
 */
export function usePromptDetail(id: string | null | undefined): UsePromptDetailResult {
  const getPromptDetail = usePromptStore((state) => state.getPromptDetail);
  const cached = usePromptStore((state) =>
    id ? state.promptDetailCache[id] : undefined,
  );

  const [prompt, setPrompt] = useState<Prompt | null>(cached ?? null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!id) {
      setPrompt(null);
      setIsLoading(false);
      setHasError(false);
      return;
    }
    // The store selector already mirrors cache state; keep local state in sync
    // whenever the cache changes (e.g. updatePrompt refreshes the cache).
    if (cached) {
      setPrompt(cached);
      setIsLoading(false);
      setHasError(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setHasError(false);
    getPromptDetail(id)
      .then((detail) => {
        if (cancelled) return;
        setPrompt(detail);
        if (!detail) setHasError(true);
      })
      .catch((error) => {
        console.error("usePromptDetail failed to load prompt detail:", error);
        if (!cancelled) {
          setPrompt(null);
          setHasError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, cached, getPromptDetail]);

  const reload = async () => {
    if (!id) return;
    setIsLoading(true);
    setHasError(false);
    try {
      const detail = await getPromptDetail(id);
      setPrompt(detail);
      if (!detail) setHasError(true);
    } catch (error) {
      console.error("usePromptDetail reload failed:", error);
      setPrompt(null);
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  };

  return { prompt, isLoading, hasError, reload };
}
