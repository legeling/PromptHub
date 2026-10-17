import { useTranslation } from "react-i18next";
import {
  SHORTCUT_KEY_CLASS_NAME,
  ShortcutSettingRow,
  SettingSection,
} from "./shared";
import { SHORTCUT_REFERENCE } from "./shortcut-reference";

export function ShortcutReference(): JSX.Element {
  const { t } = useTranslation();
  const isMac = /mac/i.test(navigator.platform);
  const modifier = isMac ? "⌘" : "Ctrl";

  return (
    <>
      {SHORTCUT_REFERENCE.map((group) => (
        <SettingSection
          key={group.title}
          title={t(`settings.shortcutReference.${group.title}`)}
        >
          {group.entries.map((entry) => (
            <ShortcutSettingRow
              key={entry.label}
              label={t(`settings.shortcutReference.${entry.label}`)}
            >
              <div className="ml-auto flex max-w-full flex-wrap justify-end gap-2 pr-10">
                {(isMac && entry.macKeys ? entry.macKeys : entry.keys).map(
                  (keys) => (
                    <kbd
                      key={keys}
                      className={`${SHORTCUT_KEY_CLASS_NAME} app-settings-input inline-flex items-center justify-center`}
                    >
                      {keys.replace("Mod", modifier)}
                    </kbd>
                  ),
                )}
              </div>
            </ShortcutSettingRow>
          ))}
        </SettingSection>
      ))}
    </>
  );
}
