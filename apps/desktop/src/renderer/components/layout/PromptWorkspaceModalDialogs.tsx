import { lazy, Suspense } from "react";
import { usePromptStore } from "../../stores/prompt.store";
import type { PromptWorkspaceDialogsProps } from "./prompt-workspace-dialog-types";

const AiTestModal = lazy(() =>
  import("../prompt/AiTestModal").then((module) => ({
    default: module.AiTestModal,
  })),
);
const PromptDetailModal = lazy(() =>
  import("../prompt/PromptDetailModal").then((module) => ({
    default: module.PromptDetailModal,
  })),
);
const QuickTagModal = lazy(() =>
  import("../prompt/QuickTagModal").then((module) => ({
    default: module.QuickTagModal,
  })),
);

function PromptAiTestDialog({
  aiTestInitialMode,
  aiTestPrompt,
  handleSaveAiResponse,
  handleUsageIncrement,
  isAiTestModalOpen,
  setAiTestPrompt,
  setIsAiTestModalOpen,
}: Pick<
  PromptWorkspaceDialogsProps,
  | "aiTestInitialMode"
  | "aiTestPrompt"
  | "handleSaveAiResponse"
  | "handleUsageIncrement"
  | "isAiTestModalOpen"
  | "setAiTestPrompt"
  | "setIsAiTestModalOpen"
>) {
  const updatePrompt = usePromptStore((state) => state.updatePrompt);
  if (!isAiTestModalOpen) return null;
  return (
    <Suspense fallback={null}>
      <AiTestModal
        isOpen
        onClose={() => {
          setIsAiTestModalOpen(false);
          setAiTestPrompt(null);
        }}
        prompt={aiTestPrompt}
        initialMode={aiTestInitialMode}
        onUsageIncrement={handleUsageIncrement}
        onSaveResponse={handleSaveAiResponse}
        onAddImage={(fileName) =>
          addGeneratedImage(
            fileName,
            aiTestPrompt,
            updatePrompt,
            setAiTestPrompt,
          )
        }
      />
    </Suspense>
  );
}

async function addGeneratedImage(
  fileName: string,
  prompt: PromptWorkspaceDialogsProps["aiTestPrompt"],
  updatePrompt: ReturnType<typeof usePromptStore.getState>["updatePrompt"],
  setPrompt: PromptWorkspaceDialogsProps["setAiTestPrompt"],
) {
  if (!prompt) return;
  const images = [...(prompt.images || []), fileName];
  await updatePrompt(prompt.id, { images });
  setPrompt({ ...prompt, images });
}

function PromptDetailDialog({
  detailPrompt,
  handleCopyPrompt,
  isDetailModalOpen,
  onCreateRelation,
  onDeleteRelation,
  setDetailPrompt,
  setEditingPrompt,
  setIsDetailModalOpen,
}: Pick<
  PromptWorkspaceDialogsProps,
  | "detailPrompt"
  | "handleCopyPrompt"
  | "isDetailModalOpen"
  | "onCreateRelation"
  | "onDeleteRelation"
  | "setDetailPrompt"
  | "setEditingPrompt"
  | "setIsDetailModalOpen"
>) {
  const prompts = usePromptStore((state) => state.prompts);
  const relations = usePromptStore((state) => state.relations ?? []);
  const selectPrompt = usePromptStore((state) => state.selectPrompt);
  if (!isDetailModalOpen) return null;
  return (
    <Suspense fallback={null}>
      <PromptDetailModal
        isOpen
        onClose={() => closePromptDetail(setIsDetailModalOpen, setDetailPrompt)}
        prompt={detailPrompt}
        onCopy={handleCopyPrompt}
        onEdit={setEditingPrompt}
        onQuickRewriteEdit={setEditingPrompt}
        prompts={prompts}
        relations={relations}
        onCreateRelation={onCreateRelation}
        onDeleteRelation={onDeleteRelation}
        onSelectPrompt={selectPrompt}
      />
    </Suspense>
  );
}

function closePromptDetail(
  setOpen: PromptWorkspaceDialogsProps["setIsDetailModalOpen"],
  setPrompt: PromptWorkspaceDialogsProps["setDetailPrompt"],
) {
  setOpen(false);
  setPrompt(null);
}

function PromptQuickTagDialog({
  quickTagPrompts,
  setQuickTagPrompts,
}: Pick<
  PromptWorkspaceDialogsProps,
  "quickTagPrompts" | "setQuickTagPrompts"
>) {
  if (quickTagPrompts.length === 0) return null;
  return (
    <Suspense fallback={null}>
      <QuickTagModal
        isOpen
        onClose={() => setQuickTagPrompts([])}
        prompts={quickTagPrompts}
      />
    </Suspense>
  );
}

export function PromptWorkspaceModalDialogs(
  props: PromptWorkspaceDialogsProps,
) {
  return (
    <>
      <PromptAiTestDialog {...props} />
      <PromptDetailDialog {...props} />
      <PromptQuickTagDialog {...props} />
    </>
  );
}
