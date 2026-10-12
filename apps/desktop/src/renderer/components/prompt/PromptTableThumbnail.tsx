import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { PromptSummary } from '@prompthub/shared/types';
import { LocalImage } from '../ui/LocalImage';
import { ImagePreviewModal } from '../ui/ImagePreviewModal';

export function PromptTableThumbnail({ prompt }: { prompt: PromptSummary }): ReactElement | null {
  const { t } = useTranslation();
  const [previewOpen, setPreviewOpen] = useState(false);
  if (prompt.promptType !== 'image') return null;
  const imageSrc = prompt.images?.[0] ?? '';
  return (
    <div className="shrink-0" onClick={event => event.stopPropagation()}>
      <LocalImage
        src={imageSrc}
        alt={prompt.title}
        aria-label={t('prompt.preview')}
        className="h-12 w-12 rounded-md border border-border/60 object-cover"
        onClick={imageSrc ? () => setPreviewOpen(true) : undefined}
      />
      <ImagePreviewModal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        imageSrc={imageSrc || null}
        imageSources={prompt.images}
      />
    </div>
  );
}
