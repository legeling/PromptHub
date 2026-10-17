import { create } from "zustand";
import type { CliStatus } from "@prompthub/shared/types";

interface CLIStatusState {
  status: CliStatus | null;
  error: string | null;
  hasChecked: boolean;
  isChecking: boolean;
  request: Promise<void> | null;
  check: (force?: boolean) => Promise<void>;
}

// UI observations, not installation authority. Main owns the persistent cache;
// explicit refresh and installation completion bypass it.
export const useCLIStatusStore = create<CLIStatusState>((set, get) => ({
  status: null,
  error: null,
  hasChecked: false,
  isChecking: false,
  request: null,
  check: (force = false): Promise<void> => {
    const state = get();
    if (state.request) return state.request;
    if (!force && state.hasChecked) return Promise.resolve();
    set({ isChecking: true, error: null });
    const request = Promise.resolve()
      .then(async () => {
        const status = await window.electron?.cli?.getStatus?.(force);
        if (!status) throw new Error("CLI status bridge is unavailable");
        set({ status });
      })
      .catch((error: unknown) => {
        set({ error: error instanceof Error ? error.message : String(error) });
      })
      .finally(() => {
        set({ hasChecked: true, isChecking: false, request: null });
      });
    set({ request });
    return request;
  },
}));
