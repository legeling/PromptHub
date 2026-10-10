import { create } from "zustand";

interface ConfirmationOptions {
  message: string;
  title?: string;
  confirmText?: string;
  variant?: "default" | "destructive";
}

interface PendingConfirmation extends ConfirmationOptions {
  resolve: (confirmed: boolean) => void;
}

// Transient renderer UI state; never persisted or shared across processes.
export const useConfirmationState = create<{
  pending: PendingConfirmation | null;
}>(() => ({ pending: null }));

export function settleConfirmation(confirmed: boolean): void {
  const { pending } = useConfirmationState.getState();
  useConfirmationState.setState({ pending: null });
  pending?.resolve(confirmed);
}

export function requestConfirmation(
  options: ConfirmationOptions,
): Promise<boolean> {
  // Replacing a request cancels its continuation instead of leaving it hanging.
  settleConfirmation(false);
  return new Promise((resolve) => {
    useConfirmationState.setState({ pending: { ...options, resolve } });
  });
}
