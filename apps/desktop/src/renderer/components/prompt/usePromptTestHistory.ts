import { useCallback, useEffect, useRef, useState } from "react";
import type {
  PromptTestRun,
  PromptTestRunSummary,
} from "@prompthub/shared/types/prompt-test-history";

/** List and selection share one owner; request generations reject stale responses. */
export function usePromptTestHistory(
  promptId: string,
  revision: number,
  enabled = true,
): {
  rows: PromptTestRunSummary[];
  selected: PromptTestRun | null;
  loading: boolean;
  error: boolean;
  more: boolean;
  load: (offset?: number) => Promise<void>;
  open: (id: string) => Promise<void>;
  remove: () => Promise<void>;
} {
  const [rows, setRows] = useState<PromptTestRunSummary[]>([]);
  const [selected, setSelected] = useState<PromptTestRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [more, setMore] = useState(false);
  const generation = useRef(0);
  const selection = useRef<PromptTestRun | null>(null);
  const open = useCallback(
    async (id: string): Promise<void> => {
      const current = ++generation.current;
      setLoading(true);
      setError(false);
      try {
        const result = await window.api.prompt.testHistory.get(promptId, id);
        if (!result.ok || !result.data)
          throw new Error("History entry is unavailable");
        if (current === generation.current) {
          selection.current = result.data;
          setSelected(result.data);
        }
      } catch (cause) {
        console.error("Opening prompt test history failed", cause);
        if (current === generation.current) setError(true);
      } finally {
        if (current === generation.current) setLoading(false);
      }
    },
    [promptId],
  );
  const load = useCallback(
    async (offset = 0): Promise<void> => {
      const current = ++generation.current;
      setLoading(true);
      setError(false);
      try {
        const result = await window.api.prompt.testHistory.list(
          promptId,
          offset,
        );
        if (result.ok === false) throw new Error(result.error);
        if (current !== generation.current) return;
        setRows((previous) =>
          offset ? [...previous, ...result.data] : result.data,
        );
        setMore(result.data.length === 50);
        if (!offset) {
          const retained = result.data.find(
            (row) =>
              selection.current?.promptId === promptId &&
              row.id === selection.current.id,
          );
          const target = retained ?? result.data[0];
          if (target) await open(target.id);
          else {
            selection.current = null;
            setSelected(null);
          }
        }
      } catch (cause) {
        console.error("Loading prompt test history failed", cause);
        if (current === generation.current) setError(true);
      } finally {
        if (current === generation.current) setLoading(false);
      }
    },
    [promptId, open],
  );
  useEffect(() => {
    selection.current = null;
    setSelected(null);
    setRows([]);
  }, [promptId]);
  useEffect(() => {
    if (!enabled) return;
    void load();
    return () => {
      generation.current += 1;
    };
  }, [load, revision, enabled]);

  async function remove(): Promise<void> {
    if (!selected) return;
    const current = ++generation.current;
    setLoading(true);
    setError(false);
    try {
      const result = await window.api.prompt.testHistory.delete(
        promptId,
        selected.id,
      );
      if (result.ok === false) throw new Error(result.error);
      if (current !== generation.current) return;
      selection.current = null;
      setSelected(null);
      setRows((previous) => previous.filter((row) => row.id !== selected.id));
      await load();
    } catch (cause) {
      console.error("Deleting prompt test history failed", cause);
      if (current === generation.current) {
        setError(true);
        setLoading(false);
      }
    }
  }
  return { rows, selected, loading, error, more, load, open, remove };
}
