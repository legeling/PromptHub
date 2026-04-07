import { useState } from "react";
import {
  SettingsIcon,
  PaletteIcon,
  DatabaseIcon,
  InfoIcon,
  GlobeIcon,
  BellIcon,
  ArrowLeftIcon,
  BrainIcon,
  KeyIcon,
  SparklesIcon,
  KeyboardIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { GeneralSettings } from "./GeneralSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { LanguageSettings } from "./LanguageSettings";
import { NotificationsSettings } from "./NotificationsSettings";
import { SecuritySettings } from "./SecuritySettings";
import { ShortcutsSettings } from "./ShortcutsSettings";
import { SkillSettings } from "./SkillSettings";
import { AboutSettings } from "./AboutSettings";
import { DataSettings } from "./DataSettings";
import { AISettingsPrototype } from "./AISettingsPrototype";

interface SettingsPageProps {
  onBack: () => void;
}

// Settings menu items - use i18n keys instead of hardcoded text
// 设置菜单项 - 使用 key 而非硬编码文本
const SETTINGS_MENU = [
  { id: "general", labelKey: "settings.general", icon: SettingsIcon },
  { id: "appearance", labelKey: "settings.appearance", icon: PaletteIcon },
  { id: "data", labelKey: "settings.data", icon: DatabaseIcon },
  { id: "ai", labelKey: "settings.ai", icon: BrainIcon },
  { id: "skill", labelKey: "settings.skill", icon: SparklesIcon },
  { id: "shortcuts", labelKey: "settings.shortcuts", icon: KeyboardIcon },
  { id: "language", labelKey: "settings.language", icon: GlobeIcon },
  { id: "notifications", labelKey: "settings.notifications", icon: BellIcon },
  { id: "security", labelKey: "settings.security", icon: KeyIcon },
  { id: "about", labelKey: "settings.about", icon: InfoIcon },
];

export function SettingsPage({ onBack }: SettingsPageProps) {
  const [activeSection, setActiveSection] = useState("general");
  const { t } = useTranslation();

  const renderContent = () => {
    switch (activeSection) {
      case "general":
        return <GeneralSettings />;
      case "appearance":
        return <AppearanceSettings />;
      case "security":
        return <SecuritySettings />;
      case "data":
        return <DataSettings />;
      case "ai":
        return <AISettingsPrototype />;
      case "shortcuts":
        return <ShortcutsSettings />;
      case "language":
        return <LanguageSettings />;
      case "notifications":
        return <NotificationsSettings />;
      case "skill":
        return <SkillSettings onNavigate={setActiveSection} />;
      case "about":
        return <AboutSettings />;
    }
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* 设置侧边栏 */}
      <div className="w-56 bg-card border-r border-border flex flex-col">
        {/* 返回按钮 */}
        <div className="p-3 border-b border-border">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            <span>{t("common.back")}</span>
          </button>
        </div>

        {/* 菜单列表 */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-1">
          {SETTINGS_MENU.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-all duration-150 ${
                activeSection === item.id
                  ? "bg-primary text-white shadow-sm"
                  : "text-foreground/80 hover:bg-muted/70"
              }`}
            >
              <item.icon className="w-4 h-4" />
              <span>{t(item.labelKey)}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* 设置内容区 - 自适应宽度 */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-lg font-semibold mb-4">
            {t(
              SETTINGS_MENU.find((m) => m.id === activeSection)?.labelKey || "",
            )}
          </h1>
          <div
            key={activeSection}
            className="animate-in fade-in slide-in-from-bottom-2 duration-200"
          >
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
}
