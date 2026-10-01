import { useTranslation } from "react-i18next";
import type { Dispatch, SetStateAction } from "react";

export interface PromptSourceNotesFieldsProps {
  source: string;
  setSource: Dispatch<SetStateAction<string>>;
  notes: string;
  setNotes: Dispatch<SetStateAction<string>>;
  handleSourceFocus: () => void;
  handleSourceBlur: () => void;
  showSourceSuggestions: boolean;
  setShowSourceSuggestions: Dispatch<SetStateAction<boolean>>;
  sourceHistory: string[];
}

/**
 * Source + notes inputs shared by the Create/Edit prompt dialogs.
 * Extracted in v0.6.2 (#76) so both dialogs can fold these secondary
 * fields through `CollapsibleSection` without duplicating the markup.
 * 新建/编辑弹窗共用的“来源 + 备注”字段组。
 */
export function PromptSourceNotesFields({
  source,
  setSource,
  notes,
  setNotes,
  handleSourceFocus,
  handleSourceBlur,
  showSourceSuggestions,
  setShowSourceSuggestions,
  sourceHistory,
}: PromptSourceNotesFieldsProps) {
  const { t } = useTranslation();

  return (
    <>
      {/* 来源 / Source */}
      <div className="space-y-1.5 relative">
        <label className="block text-sm font-medium text-foreground">
          {t("prompt.sourceOptional")}
        </label>
        <div className="relative">
          <input
            type="text"
            placeholder={t("prompt.sourcePlaceholder")}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            onFocus={handleSourceFocus}
            onBlur={handleSourceBlur}
            className="w-full h-10 px-4 rounded-xl bg-muted/50 border-0 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-background transition-all duration-base"
          />
          {showSourceSuggestions && sourceHistory.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
              {sourceHistory
                .filter((s) =>
                  s.toLowerCase().includes(source.toLowerCase()),
                )
                .slice(0, 8)
                .map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="w-full px-3 py-2 text-sm text-left hover:bg-accent/50 transition-colors truncate"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setSource(item);
                      setShowSourceSuggestions(false);
                    }}
                  >
                    {item}
                  </button>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* 备注 / Notes */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-foreground">
          {t("prompt.notesOptional")}
        </label>
        <textarea
          placeholder={t("prompt.notesPlaceholder")}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full min-h-[80px] px-4 py-3 rounded-xl bg-muted/50 border-0 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-background transition-all duration-base resize-none"
        />
      </div>
    </>
  );
}
