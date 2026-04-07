import { useMemo, useState, type Dispatch, type SetStateAction } from "react";

import { ChevronDownIcon, ChevronRightIcon, SearchIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { ModelInfo } from "../../../../services/ai";
import { getCategoryIcon } from "../../../ui/ModelIcons";
import { getModelCategory } from "../helpers";
import type { ModelFormState } from "../types";

const CATEGORY_ORDER = [
  "GPT",
  "Claude",
  "Gemini",
  "DeepSeek",
  "Qwen",
  "Doubao",
  "GLM",
  "Moonshot",
  "Llama",
  "Mistral",
  "Yi",
  "ERNIE",
  "Spark",
  "Baichuan",
  "Hunyuan",
  "Embedding",
  "Audio",
  "Image",
  "Other",
];

export function AvailableModelsList({
  availableModels,
  modelForm,
  setModelForm,
  selectedIds,
  onSelectionChange,
}: {
  availableModels: ModelInfo[];
  modelForm: ModelFormState;
  setModelForm: Dispatch<SetStateAction<ModelFormState>>;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set(),
  );

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const filteredModels = useMemo(() => {
    if (!searchQuery.trim()) return availableModels;
    const q = searchQuery.toLowerCase();
    return availableModels.filter(
      (m) =>
        m.id.toLowerCase().includes(q) || m.owned_by?.toLowerCase().includes(q),
    );
  }, [availableModels, searchQuery]);

  const categorizedModels = useMemo(() => {
    const map: Record<string, ModelInfo[]> = {};
    for (const model of filteredModels) {
      const category = getModelCategory({
        id: model.id,
        owned_by: model.owned_by,
      });
      if (!map[category]) map[category] = [];
      map[category].push(model);
    }
    return map;
  }, [filteredModels]);

  const sortedCategories = useMemo(() => {
    const categories = Object.keys(categorizedModels);
    return categories.sort((a, b) => {
      const ai = CATEGORY_ORDER.indexOf(a);
      const bi = CATEGORY_ORDER.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [categorizedModels]);

  if (availableModels.length === 0) {
    return null;
  }

  const toggleCategory = (category: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const toggleModel = (modelId: string) => {
    const next = new Set(selectedSet);
    if (next.has(modelId)) {
      next.delete(modelId);
    } else {
      next.add(modelId);
      // Also fill the model name field when only one is selected
      setModelForm((prev) => ({ ...prev, model: modelId }));
    }
    onSelectionChange(Array.from(next));
  };

  const toggleAllInCategory = (models: ModelInfo[]) => {
    const allSelected = models.every((m) => selectedSet.has(m.id));
    const next = new Set(selectedSet);
    if (allSelected) {
      models.forEach((m) => next.delete(m.id));
    } else {
      models.forEach((m) => next.add(m.id));
    }
    onSelectionChange(Array.from(next));
  };

  return (
    <div className="rounded-xl border border-border bg-muted/20">
      {/* Header */}
      <div className="border-b border-border/60 px-3 py-2.5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            {t("settings.selectModels")}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {t("settings.totalModels", { count: availableModels.length })}
            {searchQuery.trim() &&
              filteredModels.length !== availableModels.length &&
              ` · ${filteredModels.length}`}
            {selectedIds.length > 0 && (
              <span className="ml-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-primary">
                {t("settings.selectedModels", { count: selectedIds.length })}
              </span>
            )}
          </span>
        </div>
        {/* Search */}
        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("settings.searchModels")}
            className="h-8 w-full rounded-lg bg-background pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
        </div>
      </div>

      {/* Model list */}
      <div className="max-h-60 overflow-y-auto p-1.5">
        {sortedCategories.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            {t("settings.noModelsMatch")}
          </div>
        ) : (
          <div className="space-y-1">
            {sortedCategories.map((category) => {
              const models = categorizedModels[category];
              const isCollapsed = collapsedCategories.has(category);
              const allInCategorySelected = models.every((m) =>
                selectedSet.has(m.id),
              );
              const someInCategorySelected = models.some((m) =>
                selectedSet.has(m.id),
              );

              return (
                <div key={category}>
                  {/* Category header */}
                  <div className="flex items-center rounded-lg transition-colors hover:bg-muted/50">
                    <button
                      type="button"
                      onClick={() => toggleCategory(category)}
                      className="flex flex-1 items-center gap-2 px-2 py-1.5 text-left"
                    >
                      {isCollapsed ? (
                        <ChevronRightIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronDownIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
                      )}
                      <span className="shrink-0">
                        {getCategoryIcon(category, 16)}
                      </span>
                      <span className="text-xs font-medium">{category}</span>
                      <span className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                        {models.length}
                      </span>
                    </button>
                    {/* Select all in category */}
                    <button
                      type="button"
                      onClick={() => toggleAllInCategory(models)}
                      className={`mr-1.5 shrink-0 rounded px-2 py-0.5 text-[10px] transition-colors ${
                        allInCategorySelected
                          ? "bg-primary/15 text-primary"
                          : someInCategorySelected
                            ? "bg-primary/8 text-primary/70 hover:bg-primary/15"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      {allInCategorySelected
                        ? t("common.deselectAll")
                        : t("common.selectAll")}
                    </button>
                  </div>

                  {/* Models under this category */}
                  {!isCollapsed && (
                    <div className="ml-7 space-y-0.5">
                      {models.map((model) => {
                        const isSelected = selectedSet.has(model.id);
                        return (
                          <button
                            key={model.id}
                            type="button"
                            onClick={() => toggleModel(model.id)}
                            className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                              isSelected
                                ? "bg-primary/10 text-primary"
                                : "text-foreground hover:bg-muted/60"
                            }`}
                          >
                            {/* Checkbox indicator */}
                            <span
                              className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border text-[9px] ${
                                isSelected
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-background"
                              }`}
                            >
                              {isSelected ? "✓" : ""}
                            </span>
                            <span className="flex-1 truncate">{model.id}</span>
                            {model.owned_by ? (
                              <span
                                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${
                                  isSelected
                                    ? "bg-primary/20 text-primary"
                                    : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {model.owned_by}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
