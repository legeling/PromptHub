import { SparklesIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PromptDetailActionBar } from "./PromptDetailActionBar";
import { PromptDetailFields } from "./PromptDetailFields";
import { PromptDetailHeader } from "./PromptDetailHeader";
import { PromptDetailMetadataPanels } from "./PromptDetailMetadataPanels";
import { PromptDetailSupplement } from "./PromptDetailSupplement";
import { usePromptWorkspaceDetailContext } from "./PromptWorkspaceDetailContext";

function EmptyPromptDetail() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
      <div className="w-16 h-16 rounded-2xl bg-accent/50 flex items-center justify-center mb-4">
        <SparklesIcon className="w-8 h-8 text-muted-foreground/50" />
      </div>
      <p>{t("prompt.selectPrompt")}</p>
    </div>
  );
}

function SelectedPromptDetail() {
  const prompt = usePromptWorkspaceDetailContext().selectedPrompt!;
  return (
    <div
      key={prompt.id}
      className="flex-1 flex flex-col overflow-hidden animate-in fade-in slide-in-from-right-3 duration-base"
    >
      <div className="flex-1 overflow-y-auto [container-type:inline-size]">
        <div className="w-full px-5 py-4 [@container(min-width:640px)]:px-6">
          <PromptDetailHeader />
          <PromptDetailMetadataPanels />
          <div className="border-t border-border/70 [container-type:inline-size]">
            <PromptDetailSupplement />
            <PromptDetailFields />
          </div>
        </div>
      </div>
      <PromptDetailActionBar />
    </div>
  );
}

export function PromptWorkspaceDetailBody() {
  const { selectedPrompt } = usePromptWorkspaceDetailContext();
  return (
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden app-wallpaper-panel">
      {selectedPrompt ? <SelectedPromptDetail /> : <EmptyPromptDetail />}
    </div>
  );
}
