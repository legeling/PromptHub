import type { Prompt, PromptRelation } from "@prompthub/shared/types";
import { parsePromptReferences } from "./prompt-description-refs";

/** Marker stored in PromptRelation.note for links derived from `@`-mentions. */
export const MENTION_RELATION_NOTE = "@mention";

export interface RelationReconcilePlan {
  /** Target prompt ids to link to (create related_to if missing). */
  toCreate: string[];
  /** Existing relation ids that should be removed. */
  toDelete: string[];
}

function otherEndpoint(relation: PromptRelation, promptId: string): string | null {
  if (relation.sourcePromptId === promptId) {
    return relation.targetPromptId;
  }
  if (relation.targetPromptId === promptId) {
    return relation.sourcePromptId;
  }
  return null;
}

/**
 * Compute the relation changes needed when `promptId`'s description changes to
 * `newDescription`.
 *
 * Mention-derived relations (note === MENTION_RELATION_NOTE) are undirected and
 * deduped at the DB layer, so a link may have been created by *either* end's
 * description. We therefore only delete a mention relation when neither side
 * still references the other — the current prompt no longer mentions the peer
 * AND the peer's description no longer mentions the current prompt.
 *
 * Manually-created relations (note !== MENTION_RELATION_NOTE) are never touched.
 */
export function reconcileDescriptionRelations(
  promptId: string,
  newDescription: string | null | undefined,
  allPrompts: Prompt[],
  relations: PromptRelation[],
): RelationReconcilePlan {
  const referencedIds = new Set(parsePromptReferences(newDescription));
  // Self-reference is meaningless; the DB would reject it anyway.
  referencedIds.delete(promptId);

  const promptById = new Map(allPrompts.map((prompt) => [prompt.id, prompt]));
  // Only keep references to prompts that actually exist.
  for (const id of [...referencedIds]) {
    if (!promptById.has(id)) {
      referencedIds.delete(id);
    }
  }

  const mentionRelations = relations.filter(
    (relation) => relation.note === MENTION_RELATION_NOTE,
  );

  const existingPeerIds = new Set<string>();
  const toDelete: string[] = [];

  for (const relation of mentionRelations) {
    const peerId = otherEndpoint(relation, promptId);
    if (peerId === null) {
      continue;
    }
    existingPeerIds.add(peerId);

    if (referencedIds.has(peerId)) {
      continue; // still referenced by this prompt
    }

    // This prompt dropped the mention; keep the link only if the peer's
    // description still references this prompt.
    const peer = promptById.get(peerId);
    const peerStillRefs = peer
      ? parsePromptReferences(peer.description).includes(promptId)
      : false;
    if (!peerStillRefs) {
      toDelete.push(relation.id);
    }
  }

  const toCreate = [...referencedIds].filter((id) => !existingPeerIds.has(id));

  return { toCreate, toDelete };
}
