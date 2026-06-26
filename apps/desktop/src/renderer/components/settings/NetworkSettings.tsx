import { useTranslation } from "react-i18next";
import type {
  NetworkProxyMode,
  NetworkProxyProtocol,
} from "@prompthub/shared/types";
import { useSettingsStore } from "../../stores/settings.store";
import {
  PasswordInput,
  SettingItem,
  SettingSection,
  ToggleSwitch,
} from "./shared";
import { Select } from "../ui/Select";

const NETWORK_PROXY_MODE_OPTIONS: Array<{
  value: NetworkProxyMode;
  labelKey: string;
}> = [
  { value: "system", labelKey: "settings.networkProxyModeSystem" },
  { value: "direct", labelKey: "settings.networkProxyModeDirect" },
  { value: "manual", labelKey: "settings.networkProxyModeManual" },
];

const NETWORK_PROXY_PROTOCOL_OPTIONS: Array<{
  value: NetworkProxyProtocol;
  label: string;
}> = [
  { value: "http", label: "HTTP" },
  { value: "https", label: "HTTPS" },
  { value: "socks5", label: "SOCKS5" },
];

export function NetworkSettings() {
  const { t } = useTranslation();
  const settings = useSettingsStore();

  return (
    <div className="space-y-6">
      <SettingSection title={t("settings.networkProxy", "网络代理")}>
        <SettingItem
          label={t("settings.networkProxyMode", "代理模式")}
          description={t(
            "settings.networkProxyModeDesc",
            "用于 Skill、MCP、Plugin、AI 请求和同步等需要访问网络的功能",
          )}
        >
          <Select
            ariaLabel={t("settings.networkProxyMode", "代理模式")}
            value={settings.networkProxy.mode}
            onChange={(value) =>
              settings.setNetworkProxy({
                mode: value as NetworkProxyMode,
              })
            }
            options={NETWORK_PROXY_MODE_OPTIONS.map((option) => ({
              value: option.value,
              label: t(option.labelKey),
            }))}
            className="w-40"
          />
        </SettingItem>
        {settings.networkProxy.mode === "manual" ? (
          <>
            <SettingItem
              label={t("settings.networkProxyProtocol", "代理协议")}
              description={t(
                "settings.networkProxyProtocolDesc",
                "按你的本地代理服务选择 HTTP、HTTPS 或 SOCKS5",
              )}
            >
              <Select
                ariaLabel={t("settings.networkProxyProtocol", "代理协议")}
                value={settings.networkProxy.protocol}
                onChange={(value) =>
                  settings.setNetworkProxy({
                    protocol: value as NetworkProxyProtocol,
                  })
                }
                options={NETWORK_PROXY_PROTOCOL_OPTIONS}
                className="w-32"
              />
            </SettingItem>
            <SettingItem
              label={t("settings.networkProxyHost", "代理地址")}
              description={t(
                "settings.networkProxyHostDesc",
                "填写主机和端口，例如 127.0.0.1:7890",
              )}
            >
              <div className="flex w-full max-w-md items-center gap-2">
                <input
                  aria-label={t("settings.networkProxyHost", "代理地址")}
                  className="h-10 min-w-0 flex-1 rounded-lg app-settings-input px-3 text-sm"
                  value={settings.networkProxy.host}
                  placeholder="127.0.0.1"
                  onChange={(event) =>
                    settings.setNetworkProxy({ host: event.target.value })
                  }
                />
                <input
                  aria-label={t("settings.networkProxyPort", "端口")}
                  className="h-10 w-24 rounded-lg app-settings-input px-3 text-sm"
                  inputMode="numeric"
                  value={String(settings.networkProxy.port)}
                  onChange={(event) =>
                    settings.setNetworkProxy({
                      port: Number(event.target.value),
                    })
                  }
                />
              </div>
            </SettingItem>
            <SettingItem
              label={t("settings.networkProxyAuth", "代理认证")}
              description={t(
                "settings.networkProxyAuthDesc",
                "如果代理不需要用户名和密码，可以留空",
              )}
            >
              <div className="grid w-full max-w-md grid-cols-2 gap-2">
                <input
                  aria-label={t("settings.networkProxyUsername", "用户名")}
                  className="h-10 min-w-0 rounded-lg app-settings-input px-3 text-sm"
                  value={settings.networkProxy.username}
                  placeholder={t("settings.networkProxyUsername", "用户名")}
                  onChange={(event) =>
                    settings.setNetworkProxy({ username: event.target.value })
                  }
                />
                <PasswordInput
                  ariaLabel={t("settings.networkProxyPassword", "密码")}
                  value={settings.networkProxy.password}
                  placeholder={t("settings.networkProxyPassword", "密码")}
                  onChange={(value) =>
                    settings.setNetworkProxy({ password: value })
                  }
                />
              </div>
            </SettingItem>
            <SettingItem
              label={t("settings.networkProxyBypass", "不代理地址")}
              description={t(
                "settings.networkProxyBypassDesc",
                "用逗号分隔，例如 <local>,localhost,127.0.0.1",
              )}
            >
              <input
                aria-label={t("settings.networkProxyBypass", "不代理地址")}
                className="h-10 w-full max-w-md rounded-lg app-settings-input px-3 text-sm"
                value={settings.networkProxy.bypass}
                onChange={(event) =>
                  settings.setNetworkProxy({ bypass: event.target.value })
                }
              />
            </SettingItem>
          </>
        ) : null}
      </SettingSection>
      <SettingSection title={t("settings.networkMirrorSource", "镜像源")}>
        <SettingItem
          label={t("settings.tryMirrorSource")}
          description={t("settings.mirrorSourceRisk")}
        >
          <ToggleSwitch
            ariaLabel={t("settings.tryMirrorSource")}
            checked={settings.useUpdateMirror}
            onChange={settings.setUseUpdateMirror}
          />
        </SettingItem>
      </SettingSection>
    </div>
  );
}
