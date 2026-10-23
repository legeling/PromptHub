import { useLayoutEffect, useRef } from "react";
import type { WorkspaceDomain } from "../services/local-data-refresh";
import {
  registerWorkspaceDraft,
  type WorkspaceDraft,
} from "../services/workspace-drafts";

export function useWorkspaceDraft(
  domain: WorkspaceDomain,
  draft: WorkspaceDraft,
): void {
  const current = useRef(draft);
  useLayoutEffect(() => {
    current.current = draft;
  });
  useLayoutEffect(
    () => registerWorkspaceDraft(domain, () => current.current),
    [domain],
  );
}
