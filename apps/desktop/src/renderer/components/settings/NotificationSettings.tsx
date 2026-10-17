import { type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import type { NotificationCategory } from "@prompthub/shared/types/notifications";
import { useSettingsStore } from "../../stores/settings.store";
import { Select } from "../ui/Select";
import { SettingItem, SettingSection, ToggleSwitch } from "./shared";

const groups: Array<{ name: string; categories: NotificationCategory[] }> = [
  { name: "application", categories: ["appUpdate"] },
  { name: "data", categories: ["syncSuccess", "syncFailure"] },
  { name: "prompts", categories: ["promptTest", "generation"] },
  { name: "resources", categories: ["resourceTask", "resourceUpdate"] },
];

function CategorySetting({
  category,
}: {
  category: NotificationCategory;
}): ReactElement {
  const { t } = useTranslation();
  const prefs = useSettingsStore((state) => state.notificationPreferences);
  const update = useSettingsStore((state) => state.setNotificationPreferences);
  return (
    <SettingItem label={t(`notificationSettings.${category}`)}>
      <Select
        className="w-48 shrink-0"
        ariaLabel={t(`notificationSettings.${category}`)}
        value={prefs.delivery[category]}
        options={[
          { value: "off", label: t("notificationSettings.off") },
          { value: "inApp", label: t("notificationSettings.inApp") },
          { value: "system", label: t("notificationSettings.systemMode") },
        ]}
        onChange={(mode) => {
          if (mode === "off" || mode === "inApp" || mode === "system")
            update({
              ...prefs,
              delivery: { ...prefs.delivery, [category]: mode },
            });
        }}
      />
    </SettingItem>
  );
}

function SystemSettings(): ReactElement {
  const { t } = useTranslation();
  const settings = useSettingsStore();
  const prefs = settings.notificationPreferences;
  const toggles = [
    {
      name: "enabled",
      checked: settings.enableNotifications,
      change: settings.setEnableNotifications,
    },
    {
      name: "onlyWhenAway",
      checked: prefs.onlyWhenAway,
      change: (value: boolean) =>
        settings.setNotificationPreferences({ ...prefs, onlyWhenAway: value }),
    },
    {
      name: "sound",
      checked: prefs.sound,
      change: (value: boolean) =>
        settings.setNotificationPreferences({ ...prefs, sound: value }),
    },
  ];
  return (
    <SettingSection title={t("notificationSettings.system")}>
      {toggles.map((item) => (
        <SettingItem
          key={item.name}
          label={t(`notificationSettings.${item.name}`)}
        >
          <ToggleSwitch
            ariaLabel={t(`notificationSettings.${item.name}`)}
            checked={item.checked}
            onChange={item.change}
          />
        </SettingItem>
      ))}
    </SettingSection>
  );
}

function FeedbackSettings(): ReactElement {
  const { t } = useTranslation();
  const settings = useSettingsStore();
  return (
    <SettingSection title={t("notificationSettings.feedback")}>
      <SettingItem label={t("notificationSettings.copy")}>
        <ToggleSwitch
          ariaLabel={t("notificationSettings.copy")}
          checked={settings.showCopyNotification}
          onChange={settings.setShowCopyNotification}
        />
      </SettingItem>
      <SettingItem label={t("notificationSettings.save")}>
        <ToggleSwitch
          ariaLabel={t("notificationSettings.save")}
          checked={settings.showSaveNotification}
          onChange={settings.setShowSaveNotification}
        />
      </SettingItem>
    </SettingSection>
  );
}

export function NotificationSettings(): ReactElement {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {t("notificationSettings.description")}
      </p>
      <SystemSettings />
      {groups.map((group) => (
        <SettingSection
          key={group.name}
          title={t(`notificationSettings.${group.name}`)}
        >
          {group.categories.map((category) => (
            <CategorySetting key={category} category={category} />
          ))}
        </SettingSection>
      ))}
      <FeedbackSettings />
    </div>
  );
}
