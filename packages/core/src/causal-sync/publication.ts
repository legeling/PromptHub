import type { RemoteTextStorage } from "@prompthub/shared/types/remote-sync";
import {
  publishObservedRemoteText,
  verifyConditionalPublication,
  type ConditionalPublicationCapability,
  type RemotePublicationResult,
} from "../remote-publication";
import type { CausalSyncSession } from "./session";
import { generationText } from "./session-state";
import { parseCausalSyncGeneration } from "./validation";
import { preserveRemoteGeneration } from "./recovery";

export type CausalSyncPublicationResult =
  | RemotePublicationResult
  | {
      status: "unsupported";
      capability: Extract<
        ConditionalPublicationCapability,
        { supported: false }
      >;
    };

/** Payload objects must already be durable before this metadata-only HEAD commit. */
export async function publishCausalSyncOperation(
  session: CausalSyncSession,
  store: RemoteTextStorage,
  headPath: string,
  operationId: string,
  verifiedCapability?: ConditionalPublicationCapability,
): Promise<CausalSyncPublicationResult> {
  const operation = session.state()?.pending;
  if (
    !operation ||
    operation.operationId !== operationId ||
    operation.mode !== "publish"
  )
    throw new Error("Sync publication operation is missing or was replaced");
  if (operation.phase === "remote-confirmed") return { status: "published" };
  const candidate = generationText(operation.generation);
  const current = await store.downloadText(headPath);
  if (current.success && current.data === candidate) {
    session.confirmPublished(operationId, operation.generation);
    return { status: "published", etag: current.etag };
  }
  if (!current.success && !current.notFound)
    return { status: "uncertain", error: current.error };
  if ((current.success ? current.etag : null) !== operation.observedEtag) {
    session.recordConditionalConflict(operationId);
    return { status: "conflict" };
  }
  const capability =
    verifiedCapability ?? (await verifyConditionalPublication(store, headPath));
  if (capability.supported === false)
    return { status: "unsupported", capability };
  if (current.success && typeof current.data === "string")
    await preserveRemoteGeneration(
      store,
      headPath,
      parseCausalSyncGeneration(JSON.parse(current.data)),
    );
  const result = await publishObservedRemoteText(
    store,
    headPath,
    candidate,
    operation.observedEtag === null ? null : { etag: operation.observedEtag },
  );
  if (result.status === "published")
    session.confirmPublished(operationId, operation.generation);
  if (result.status === "conflict") {
    // Another invocation may already have confirmed this exact operation.
    if (session.state()?.pending?.phase === "remote-confirmed")
      return { status: "published" };
    session.recordConditionalConflict(operationId);
  }
  return result;
}
