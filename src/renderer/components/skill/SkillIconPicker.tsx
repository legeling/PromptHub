import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ImageIcon, UploadIcon, XIcon } from 'lucide-react';
import { BUILTIN_SKILL_REGISTRY } from '../../../shared/constants/skill-registry';
import { SkillIcon } from './SkillIcon';

interface SkillIconPickerProps {
  name: string;
  iconUrl?: string;
  iconEmoji?: string;
  onChange: (next: { iconUrl?: string; iconEmoji?: string }) => void;
}

export function SkillIconPicker({ name, iconUrl, iconEmoji, onChange }: SkillIconPickerProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const presetIcons = useMemo(() => {
    const seen = new Set<string>();
    return BUILTIN_SKILL_REGISTRY.filter((skill) => {
      if (!skill.icon_url || seen.has(skill.icon_url)) return false;
      seen.add(skill.icon_url);
      return true;
    }).slice(0, 18);
  }, []);

  const handleUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (result) {
        onChange({ iconUrl: result, iconEmoji: undefined });
      }
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
      <div className="flex items-start gap-4">
        <div className="shrink-0">
          <SkillIcon iconUrl={iconUrl} iconEmoji={iconEmoji} name={name || 'Skill'} size="xl" />
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div>
            <div className="text-sm font-medium text-foreground">{t('skill.icon', '图标')}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('skill.iconHint', '可以上传自己的图标，或从预置图标里直接选择。')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:border-primary/40 hover:bg-accent transition-colors"
            >
              <UploadIcon className="w-3.5 h-3.5" />
              {t('skill.uploadIcon', '上传图标')}
            </button>
            <button
              type="button"
              onClick={() => onChange({ iconUrl: undefined, iconEmoji: undefined })}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <XIcon className="w-3.5 h-3.5" />
              {t('common.clear', '清空')}
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={handleUpload}
          />
        </div>
      </div>

      <div>
        <div className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground mb-2">
          {t('skill.presetIcons', '预置图标')}
        </div>
        <div className="grid grid-cols-6 md:grid-cols-9 gap-2">
          {presetIcons.map((preset) => {
            const active = iconUrl === preset.icon_url && !iconEmoji;
            return (
              <button
                key={preset.slug}
                type="button"
                onClick={() => onChange({ iconUrl: preset.icon_url, iconEmoji: undefined })}
                className={`group rounded-xl border p-2 transition-all ${
                  active
                    ? 'border-primary bg-primary/10 shadow-[0_0_0_1px_rgba(96,165,250,0.2)]'
                    : 'border-border bg-background hover:border-primary/40 hover:bg-accent/60'
                }`}
                title={preset.name}
              >
                <div className="flex items-center justify-center">
                  <SkillIcon
                    iconUrl={preset.icon_url}
                    iconEmoji={preset.icon_emoji}
                    name={preset.name}
                    size="md"
                  />
                </div>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => onChange({ iconUrl: undefined, iconEmoji: undefined })}
            className={`rounded-xl border p-2 transition-all ${
              !iconUrl && !iconEmoji
                ? 'border-primary bg-primary/10 shadow-[0_0_0_1px_rgba(96,165,250,0.2)]'
                : 'border-border bg-background hover:border-primary/40 hover:bg-accent/60'
            }`}
            title={t('skill.useDefaultIcon', '使用默认图标')}
          >
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted text-muted-foreground mx-auto">
              <ImageIcon className="w-4 h-4" />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
