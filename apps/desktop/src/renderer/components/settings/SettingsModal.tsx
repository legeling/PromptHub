import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Button } from '../ui';
import { SunIcon, MoonIcon, MonitorIcon, GlobeIcon, DatabaseIcon, InfoIcon } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Theme = 'light' | 'dark' | 'system';
type Language = 'zh' | 'en';

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { t } = useTranslation();
  const [theme, setTheme] = useState<Theme>('system');
  const [language, setLanguage] = useState<Language>('zh');
  const [autoSave, setAutoSave] = useState(true);

  const themeOptions = [
    { value: 'light', label: t('settings.light'), icon: SunIcon },
    { value: 'dark', label: t('settings.dark'), icon: MoonIcon },
    { value: 'system', label: t('settings.system'), icon: MonitorIcon },
  ];

  const languageOptions = [
    { value: 'zh', label: '简体中文' },
    { value: 'en', label: 'English' },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('settings.title')} size="md">
      <div className="space-y-6">
        {/* Appearance */}
        {/* 外观 */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <SunIcon aria-hidden="true" className="w-4 h-4 text-primary" />
            {t('settings.appearance')}
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {themeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setTheme(option.value as Theme)}
                aria-pressed={theme === option.value}
                className={`
                  flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all
                  ${theme === option.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                  }
                `}
              >
                <option.icon aria-hidden="true" className={`w-6 h-6 ${theme === option.value ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className={`text-sm font-medium ${theme === option.value ? 'text-primary' : 'text-foreground'}`}>
                  {option.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Language */}
        {/* 语言 */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <GlobeIcon aria-hidden="true" className="w-4 h-4 text-primary" />
            {t('settings.language')}
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {languageOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setLanguage(option.value as Language)}
                aria-pressed={language === option.value}
                className={`
                  flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all
                  ${language === option.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                  }
                `}
              >
                <span className={`text-sm font-medium ${language === option.value ? 'text-primary' : 'text-foreground'}`}>
                  {option.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Data */}
        {/* 数据 */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <DatabaseIcon aria-hidden="true" className="w-4 h-4 text-primary" />
            {t('settings.data')}
          </h3>
          <div className="space-y-2">
            <label className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
              <span className="text-sm">{t('settings.autoSave')}</span>
              <button
                type="button"
                role="switch"
                aria-checked={autoSave}
                aria-label={t('settings.autoSave')}
                onClick={() => setAutoSave(!autoSave)}
                className={`
                  relative w-12 h-7 rounded-full transition-colors
                  ${autoSave ? 'bg-primary' : 'bg-muted-foreground/30'}
                `}
              >
                <span
                  className={`
                    absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-transform
                    ${autoSave ? 'left-6' : 'left-1'}
                  `}
                />
              </button>
            </label>
            <button type="button" className="w-full flex items-center justify-between p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors">
              <span className="text-sm">{t('settings.export')}</span>
              <span className="text-xs text-muted-foreground">{t('settings.exportDesc')}</span>
            </button>
            <button type="button" className="w-full flex items-center justify-between p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors">
              <span className="text-sm">{t('settings.import')}</span>
              <span className="text-xs text-muted-foreground">{t('settings.importDesc')}</span>
            </button>
          </div>
        </div>

        {/* About */}
        {/* 关于 */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <InfoIcon aria-hidden="true" className="w-4 h-4 text-primary" />
            {t('settings.about')}
          </h3>
          <div className="p-4 rounded-xl bg-muted/50 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center">
              <span className="text-white text-xl font-bold">P</span>
            </div>
            <h4 className="font-semibold text-foreground">PromptHub</h4>
            <p className="text-xs text-muted-foreground mt-1">v0.4.8</p>
            <p className="text-xs text-muted-foreground mt-2">
              {t('app.description')}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        {/* 操作按钮 */}
        <div className="flex justify-end pt-2">
          <Button variant="primary" onClick={onClose}>
            {t('common.done')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
