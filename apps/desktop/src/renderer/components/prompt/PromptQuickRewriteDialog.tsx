import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoaderIcon, SparklesIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { Prompt, UpdatePromptDTO } from "@prompthub/shared/types";

import { rewritePromptDraft } from "../../services/ai";
import { resolveScenarioModel } from "../../services/ai-defaults";
import * as promptDb from "../../services/database";
import { useSettingsStore } from "../../stores/settings.store";
import { usePromptStore } from "../../stores/prompt.store";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { Textarea } from "../ui/Textarea";
import { useToast } from "../ui/Toast";

interface PromptQuickRewriteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  prompt: Prompt | null;
  onContinueEditing?: (prompt: Prompt) => void;
}

type RewriteAction = "save" | "edit";

type RewriteDraft = Pick<
  UpdatePromptDTO,
  "description" | "systemPrompt" | "userPrompt"
>;

function buildPromptSnapshot(prompt: Prompt): Required<RewriteDraft> {
  return {
    description: prompt.description ?? "",
    systemPrompt: prompt.systemPrompt ?? "",
    userPrompt: prompt.userPrompt,
  };
}

export function PromptQuickRewriteDialog({
  isOpen,
  onClose,
  prompt,
  onContinueEditing,
}: PromptQuickRewriteDialogProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const updatePrompt = usePromptStore((state) => state.updatePrompt);

  const aiModels = useSettingsStore((state) => state.aiModels);
  const scenarioModelDefaults = useSettingsStore(
    (state) => state.scenarioModelDefaults,
  );
  const modelRouteDefaults = useSettingsStore((state) => state.modelRouteDefaults);

  const rewriteModel = useMemo(
    () =>
      resolveScenarioModel(
        aiModels,
        scenarioModelDefaults,
        "translation",
        "chat",
        undefined,
        modelRouteDefaults,
      ),
    [aiModels, modelRouteDefaults, scenarioModelDefaults],
  );

  const [rewriteInstruction, setRewriteInstruction] = useState("");
  const [rewriteSummary, setRewriteSummary] = useState("");
  const [isRewritingPrompt, setIsRewritingPrompt] = useState(false);
  const [isApplyingDraft, setIsApplyingDraft] = useState(false);
  const [rewriteDraft, setRewriteDraft] = useState<RewriteDraft | null>(null);
  const isMountedRef = useRef(true);
  const isOpenRef = useRef(isOpen);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      isOpenRef.current = false;
    };
  }, []);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  const canApplyAsyncResult = useCallback(
    () => isMountedRef.current && isOpenRef.current,
    [],
  );

  useEffect(() => {
    if (!isOpen) {
      setRewriteInstruction("");
      setRewriteSummary("");
      setRewriteDraft(null);
      setIsRewritingPrompt(false);
      setIsApplyingDraft(false);
      return;
    }

    setRewriteSummary("");
    setRewriteDraft(null);
  }, [isOpen, prompt?.id]);

  const canRewrite = !!rewriteModel;

  const previewDraft = useMemo(() => {
    if (!prompt) {
      return null;
    }

    const base = buildPromptSnapshot(prompt);

    if (!rewriteDraft) {
      return base;
    }

    return {
      description: rewriteDraft.description ?? base.description,
      systemPrompt: rewriteDraft.systemPrompt ?? base.systemPrompt,
      userPrompt: rewriteDraft.userPrompt ?? base.userPrompt,
    };
  }, [prompt, rewriteDraft]);

  const handleApplyRewriteTemplate = (template: string) => {
    setRewriteInstruction((current) =>
      current.trim() ? `${current.trim()}\n${template}` : template,
    );
  };

  const handleRewritePrompt = async () => {
    if (!prompt) {
      return;
    }

    if (!canRewrite || !rewriteModel) {
      showToast(t("toast.configAI"), "error");
      return;
    }

    const instruction = rewriteInstruction.trim();
    if (!instruction) {
      showToast(t("prompt.aiRewriteNeedsInstruction"), "error");
      return;
    }

    if (!(prompt.systemPrompt?.trim() || prompt.userPrompt.trim())) {
      showToast(t("prompt.aiRewriteNeedsContent"), "error");
      return;
    }

    setIsRewritingPrompt(true);

    try {
      const rewritten = await rewritePromptDraft(rewriteModel, {
        promptType: prompt.promptType ?? "text",
        title: prompt.title,
        description: prompt.description ?? undefined,
        systemPrompt: prompt.systemPrompt ?? undefined,
        userPrompt: prompt.userPrompt,
        instruction,
      });

      if (!canApplyAsyncResult()) {
        return;
      }

      setRewriteDraft({
        description: rewritten.description,
        systemPrompt: rewritten.systemPrompt,
        userPrompt: rewritten.userPrompt,
      });
      setRewriteSummary(
        rewritten.summary || t("prompt.aiRewriteSummaryDefault"),
      );
      showToast(t("prompt.aiRewriteDone"), "success");
    } catch (error) {
      if (!canApplyAsyncResult()) {
        return;
      }
      showToast(
        error instanceof Error ? error.message : t("prompt.aiRewriteFailed"),
        "error",
      );
    } finally {
      if (canApplyAsyncResult()) {
        setIsRewritingPrompt(false);
      }
    }
  };

  const handleSubmitDraft = async (action: RewriteAction) => {
    if (!prompt || !rewriteDraft) {
      return;
    }

    setIsApplyingDraft(true);

    try {
      const updatedPrompt = await promptDb.updatePrompt(prompt.id, rewriteDraft);
      await updatePrompt(prompt.id, rewriteDraft);

      showToast(t("toast.saved"), "success");
      onClose();

      if (action === "edit") {
        onContinueEditing?.(updatedPrompt);
      }
    } catch (error) {
      console.error("Failed to apply quick AI rewrite:", error);
      showToast(t("toast.updateFailed"), "error");
    } finally {
      setIsApplyingDraft(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("prompt.quickRewriteTitle")}
      subtitle={prompt?.title ?? undefined}
      size="xl"
    >
      {!prompt || !previewDraft ? null : (
        <div className="-m-6 flex max-h-[75vh] flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
            <div className="space-y-5">
              <div className="rounded-2xl border border-border bg-muted/20 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <SparklesIcon aria-hidden="true" className="h-4 w-4 text-primary" />
                  {t("prompt.quickRewriteHeading")}
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {t("prompt.quickRewriteHint")}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
              {[
                t("prompt.aiRewriteTemplateClarity"),
                t("prompt.aiRewriteTemplateStructure"),
                (prompt.promptType ?? "text") === "image"
                  ? t("prompt.aiRewriteTemplateImage")
                  : t("prompt.aiRewriteTemplateConstraints"),
              ].map((template) => (
                <button
                  key={template}
                  type="button"
                  onClick={() => handleApplyRewriteTemplate(template)}
                  className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {template}
                </button>
              ))}
                </div>
                <div className="mt-3">
                  <Textarea
                    value={rewriteInstruction}
                    onChange={(event) => setRewriteInstruction(event.target.value)}
                    aria-label={t("prompt.aiRewriteTitle")}
                    placeholder={t("prompt.aiRewritePlaceholder")}
                    className="min-h-[120px]"
                  />
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="text-xs text-muted-foreground">
                    {canRewrite
                      ? t("prompt.quickRewriteReady")
                      : t("prompt.aiRewriteNeedsModel")}
                  </div>
                  <Button
                    type="button"
                    onClick={() => void handleRewritePrompt()}
                    disabled={!canRewrite || isRewritingPrompt || !rewriteInstruction.trim()}
                  >
                    {isRewritingPrompt ? (
                      <LoaderIcon aria-hidden="true" className="h-4 w-4 animate-spin" />
                    ) : (
                      <SparklesIcon aria-hidden="true" className="h-4 w-4" />
                    )}
                    {isRewritingPrompt
                      ? t("prompt.aiRewriteWorking")
                      : t("prompt.quickRewriteGenerate")}
                  </Button>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-background p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">
                      {t("prompt.quickRewritePreview")}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {rewriteSummary || t("prompt.quickRewritePreviewHint")}
                    </div>
                  </div>
                  {rewriteDraft ? (
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                      {t("prompt.quickRewriteDraftReady")}
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-4">
                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t("prompt.description")}
                    </div>
                    <div className="rounded-xl border border-border bg-muted/20 p-3 text-sm whitespace-pre-wrap text-foreground/90">
                      {previewDraft.description || "-"}
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t("prompt.systemPromptLabel")}
                    </div>
                    <div className="max-h-32 overflow-y-auto rounded-xl border border-border bg-muted/20 p-3 text-sm whitespace-pre-wrap text-foreground/90">
                      {previewDraft.systemPrompt || "-"}
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t("prompt.userPromptLabel")}
                    </div>
                    <div className="max-h-40 overflow-y-auto rounded-xl border border-border bg-muted/20 p-3 text-sm whitespace-pre-wrap text-foreground/90">
                      {previewDraft.userPrompt || "-"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="shrink-0 border-t border-border bg-background px-6 py-4">
            <div className="flex items-center justify-end gap-3">
              <Button type="button" variant="secondary" onClick={onClose}>
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!rewriteDraft || isApplyingDraft}
                onClick={() => void handleSubmitDraft("edit")}
              >
                {t("common.continueEditing")}
              </Button>
              <Button
                type="button"
                disabled={!rewriteDraft || isApplyingDraft}
                onClick={() => void handleSubmitDraft("save")}
              >
                {isApplyingDraft ? (
                  <LoaderIcon aria-hidden="true" className="h-4 w-4 animate-spin" />
                ) : null}
                {t("prompt.quickRewriteApplyAndSave")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
