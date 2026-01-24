import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../ui/Modal';
import { usePromptStore } from '../../stores/prompt.store';
import { FileUpIcon, CheckIcon, XIcon, FileJsonIcon } from 'lucide-react';

export interface ImportedPromptData {
  name?: string;
  title?: string;
  description?: string;
  userPrompt?: string;
  systemPrompt?: string;
  userPromptEn?: string;
  systemPromptEn?: string;
  tags?: string[];
  source?: string;
  version?: string;
}

interface ImportPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ImportedPromptData | null;
}

export function ImportPromptModal({ isOpen, onClose, data }: ImportPromptModalProps) {
  const { t } = useTranslation();
  const createPrompt = usePromptStore((state) => state.createPrompt);
  const [loading, setLoading] = useState(false);

  if (!data) return null;

  const handleImport = async () => {
    setLoading(true);
    try {
      // Prioritize 'name' or 'title'
      const title = data.name || data.title || t('prompt.newPrompt');
      
      await createPrompt({
        title: title,
        description: data.description || '',
        userPrompt: data.userPrompt || '',
        systemPrompt: data.systemPrompt || '',
        userPromptEn: data.userPromptEn || '',
        systemPromptEn: data.systemPromptEn || '',
        tags: Array.isArray(data.tags) ? data.tags : [],
        source: data.source || 'clipboard',
      });
      onClose();
    } catch (e) {
      console.error(e);
      // Ideally show toast here, but PromptStore usually handles errors or usage in component
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('import.clipboardTitle', 'Import Prompt from Clipboard')}
      size="lg"
    >
      <div className="space-y-6">
        <div className="flex items-start gap-4 p-4 bg-muted/40 rounded-lg border border-border/50">
          <div className="p-2 bg-primary/10 rounded-lg text-primary">
            <FileJsonIcon className="w-6 h-6" />
          </div>
          <div className="flex-1 space-y-1">
            <h3 className="font-medium text-foreground">
              {t('import.detectedPrompt', 'Prompt Detected')}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t('import.detectedDesc', 'Contents in your clipboard match the Prompt format. Do you want to import it?')}
            </p>
          </div>
        </div>

        <div className="border border-border rounded-lg overflow-hidden">
          <div className="bg-muted/50 px-4 py-2 border-b border-border flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {t('common.preview', 'PREVIEW')}
            </span>
          </div>
          <div className="p-4 space-y-4 bg-card">
            <div className="grid grid-cols-[80px_1fr] gap-4 text-sm">
              <span className="text-muted-foreground font-medium text-right">{t('prompt.title')}:</span>
              <span className="text-foreground font-medium">{data.name || data.title || '-'}</span>
              
              <span className="text-muted-foreground font-medium text-right">{t('prompt.description')}:</span>
              <span className="text-muted-foreground">{data.description || '-'}</span>
              
              <span className="text-muted-foreground font-medium text-right">{t('prompt.userPrompt')}:</span>
              <div className="relative">
                <div className="text-foreground/90 bg-muted/30 p-2 rounded border border-border/50 max-h-[150px] overflow-y-auto whitespace-pre-wrap font-mono text-xs">
                  {data.userPrompt || '-'}
                </div>
              </div>

              {(data.systemPrompt) && (
                <>
                  <span className="text-muted-foreground font-medium text-right">{t('prompt.systemPrompt')}:</span>
                  <div className="relative">
                     <div className="text-foreground/90 bg-muted/30 p-2 rounded border border-border/50 max-h-[100px] overflow-y-auto whitespace-pre-wrap font-mono text-xs">
                      {data.systemPrompt}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleImport}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium transition-colors shadow-sm disabled:opacity-50"
          >
            {loading ? (
              <span>{t('common.loading')}</span>
            ) : (
              <>
                <FileUpIcon className="w-4 h-4" />
                <span>{t('common.import', 'Import')}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
