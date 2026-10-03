import { useTranslation } from "react-i18next";
import { usePromptStore } from "../../stores/prompt.store";
import { PromptDetailMetadata } from "../prompt/PromptDetailMetadata";
import { PromptOutputFormatPanel } from "../prompt/PromptOutputFormatPanel";
import { PromptRelationshipPanel } from "../prompt/PromptRelationshipPanel";
import { usePromptWorkspaceDetailContext } from "./PromptWorkspaceDetailContext";

type PromptStoreState = ReturnType<typeof usePromptStore.getState>;
type SelectedPrompt = NonNullable<
  ReturnType<typeof usePromptWorkspaceDetailContext>["selectedPrompt"]
>;

function usePromptDetailPanelStore() {
  const prompts = usePromptStore((state) => state.prompts);
  const outputFormatItems = usePromptStore(
    (state) => state.outputFormatItems ?? [],
  );
  const createOutputFormatItem = usePromptStore(
    (state) => state.createOutputFormatItem,
  );
  const deleteOutputFormatItem = usePromptStore(
    (state) => state.deleteOutputFormatItem,
  );
  const reorderOutputFormatItem = usePromptStore(
    (state) => state.reorderOutputFormatItem,
  );
  const selectPrompt = usePromptStore((state) => state.selectPrompt);
  return {
    prompts,
    outputFormatItems,
    createOutputFormatItem,
    deleteOutputFormatItem,
    reorderOutputFormatItem,
    selectPrompt,
  };
}

function PromptDetailMetadataSummary({
  prompt,
  selectPrompt,
}: {
  prompt: SelectedPrompt;
  selectPrompt: (promptId: string) => void;
}) {
  const { t } = useTranslation();
  const detail = usePromptWorkspaceDetailContext();
  return (
    <PromptDetailMetadata
      prompt={prompt}
      parentPrompt={detail.parentPrompt}
      childPrompts={detail.childPrompts}
      folderOptions={detail.folderOptions}
      relationshipCount={detail.relationshipCount}
      outputFormatCount={detail.outputFormatCount}
      isRelatedPromptsOpen={detail.isDetailRelationshipsOpen}
      isOutputFormatOpen={detail.isDetailOutputFormatOpen}
      isRelatedPromptsDisabled={detail.isDetailInlineEditing}
      isOutputFormatDisabled={detail.isDetailInlineEditing}
      t={t}
      onMoveToFolder={(item, folderId) => {
        void detail.handleMovePrompt(item, folderId);
      }}
      onSelectPrompt={selectPrompt}
      onToggleRelatedPrompts={() =>
        detail.setIsDetailRelationshipsOpen((open) => !open)
      }
      onToggleOutputFormat={() =>
        detail.setIsDetailOutputFormatOpen((open) => !open)
      }
    />
  );
}

function PromptDetailRelationshipPanel({
  prompt,
  prompts,
  selectPrompt,
}: {
  prompt: SelectedPrompt;
  prompts: PromptStoreState["prompts"];
  selectPrompt: (promptId: string) => void;
}) {
  const detail = usePromptWorkspaceDetailContext();
  return detail.isDetailRelationshipsOpen ? (
    <PromptRelationshipPanel
      currentPrompt={prompt}
      prompts={prompts}
      relations={detail.relations}
      relationshipCount={detail.relationshipCount}
      onCreateRelation={detail.onCreateRelation}
      onDeleteRelation={detail.onDeleteRelation}
      onDetachPrompt={detail.onDetachPrompt}
      onSelectPrompt={selectPrompt}
      disabled={detail.isDetailInlineEditing}
      className="mb-4"
    />
  ) : null;
}

function PromptDetailOutputFormatPanel({
  prompt,
  store,
}: {
  prompt: SelectedPrompt;
  store: ReturnType<typeof usePromptDetailPanelStore>;
}) {
  const detail = usePromptWorkspaceDetailContext();
  if (!detail.isDetailOutputFormatOpen) return null;
  return (
    <PromptOutputFormatPanel
      currentPrompt={prompt}
      prompts={store.prompts}
      outputFormatItems={store.outputFormatItems}
      onCreateOutputFormatItem={store.createOutputFormatItem}
      onDeleteOutputFormatItem={store.deleteOutputFormatItem}
      onReorderOutputFormatItem={store.reorderOutputFormatItem}
      onSelectPrompt={store.selectPrompt}
      disabled={detail.isDetailInlineEditing}
      className="mb-4"
    />
  );
}

export function PromptDetailMetadataPanels() {
  const store = usePromptDetailPanelStore();
  const detail = usePromptWorkspaceDetailContext();
  const prompt = detail.selectedPrompt!;
  return (
    <>
      <PromptDetailMetadataSummary
        prompt={prompt}
        selectPrompt={detail.onRevealPrompt}
      />
      <PromptDetailRelationshipPanel
        prompt={prompt}
        prompts={store.prompts}
        selectPrompt={detail.onRevealPrompt}
      />
      <PromptDetailOutputFormatPanel prompt={prompt} store={store} />
    </>
  );
}
