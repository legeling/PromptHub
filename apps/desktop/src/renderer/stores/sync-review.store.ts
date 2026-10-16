import { create } from "zustand";
import type {
  CausalSyncReview,
  DesktopCausalSyncRequest,
} from "@prompthub/shared/types/causal-sync";

interface PendingSyncReview {
  provider: DesktopCausalSyncRequest["provider"];
  review: CausalSyncReview;
}
export const useSyncReviewStore = create<{
  pending: PendingSyncReview | null;
  isOpen: boolean;
}>(() => ({ pending: null, isOpen: false }));
export function presentSyncReview(
  provider: DesktopCausalSyncRequest["provider"],
  review: CausalSyncReview,
): void {
  const current = useSyncReviewStore.getState();
  useSyncReviewStore.setState({
    pending: { provider, review },
    isOpen:
      current.pending?.review.token === review.token ? current.isOpen : true,
  });
}
