import { useCallback, useEffect, useMemo, useState } from "react";
import {
  GlobeIcon,
  LaptopIcon,
  LogOutIcon,
  RefreshCwIcon,
  StoreIcon,
  UserIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  DeviceManagementSettings,
  Settings,
} from "@prompthub/shared/types";
import { getWebContext, logoutWebSession } from "../../runtime";
import { Select } from "../ui/Select";
import { SettingItem, SettingSection, ToggleSwitch } from "./shared";

function detectClientBrowser(userAgent: string): string {
  if (/edg\//i.test(userAgent)) return "Microsoft Edge";
  if (/chrome\//i.test(userAgent) && !/edg\//i.test(userAgent)) {
    return "Google Chrome";
  }
  if (/safari\//i.test(userAgent) && !/chrome\//i.test(userAgent)) {
    return "Safari";
  }
  if (/firefox\//i.test(userAgent)) return "Firefox";
  if (/opr\//i.test(userAgent) || /opera/i.test(userAgent)) return "Opera";
  return "Browser";
}

function detectClientPlatform(userAgent: string): string {
  if (/mac os x/i.test(userAgent)) return "macOS";
  if (/windows/i.test(userAgent)) return "Windows";
  if (/android/i.test(userAgent)) return "Android";
  if (/(iphone|ipad|ios)/i.test(userAgent)) return "iOS";
  if (/linux/i.test(userAgent)) return "Linux";
  return "Unknown OS";
}

const DEFAULT_DEVICE_SETTINGS: DeviceManagementSettings = {
  syncCadence: "manual",
  storeAutoSync: true,
  storeSyncCadence: "1d",
};

interface ConnectedDeviceRecord {
  id: string;
  type: "desktop" | "browser";
  name: string;
  platform: string;
  appVersion?: string;
  clientVersion?: string;
  lastSeenAt: string;
}

function getOrCreateBrowserDeviceId(): string {
  const storageKey = "prompthub-web-device-id";
  const existing = window.localStorage.getItem(storageKey);
  if (existing) {
    return existing;
  }

  const nextId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `browser-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(storageKey, nextId);
  return nextId;
}

function formatSeenAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export function WebDeviceSettings() {
  const { t } = useTranslation();
  const webContext = getWebContext();
  const [deviceSettings, setDeviceSettings] = useState<DeviceManagementSettings>(
    DEFAULT_DEVICE_SETTINGS,
  );
  const [devices, setDevices] = useState<ConnectedDeviceRecord[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);

  const clientLabel = useMemo(() => {
    if (typeof navigator === "undefined") {
      return "Browser";
    }

    return `${detectClientBrowser(navigator.userAgent)} · ${detectClientPlatform(
      navigator.userAgent,
    )}`;
  }, []);

  const currentBrowserDeviceId = useMemo(
    () =>
      typeof window === "undefined" ? "" : getOrCreateBrowserDeviceId(),
    [],
  );

  const loadDevices = useCallback(async () => {
    setLoadingDevices(true);
    try {
      const userAgent = navigator.userAgent;
      await fetch("/api/devices/heartbeat", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: currentBrowserDeviceId,
          type: "browser",
          name: detectClientBrowser(userAgent),
          platform: detectClientPlatform(userAgent),
          clientVersion: "self-hosted-web",
          userAgent,
        }),
      });

      const response = await fetch("/api/devices", {
        credentials: "same-origin",
      });
      if (!response.ok) {
        throw new Error("Failed to load devices");
      }
      const payload = (await response.json()) as {
        data?: ConnectedDeviceRecord[];
      };
      setDevices(Array.isArray(payload.data) ? payload.data : []);
    } catch (error) {
      console.warn("Failed to load connected devices:", error);
    } finally {
      setLoadingDevices(false);
    }
  }, [currentBrowserDeviceId]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const settings = (await window.api?.settings?.get?.()) as
        | Settings
        | undefined;
      if (cancelled || !settings) {
        return;
      }

      setDeviceSettings({
        ...DEFAULT_DEVICE_SETTINGS,
        ...(settings.device ?? {}),
      });
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void loadDevices();
  }, [loadDevices]);

  const updateDeviceSettings = async (
    nextPartial: Partial<DeviceManagementSettings>,
  ) => {
    const nextValue = {
      ...deviceSettings,
      ...nextPartial,
    };
    setDeviceSettings(nextValue);
    await window.api?.settings?.set?.({
      device: nextValue,
    });
  };

  return (
    <div className="space-y-6">
      <SettingSection title={t("settings.deviceManagement")}>
        <SettingItem
          label={t("settings.currentUser")}
          description={t("settings.browserSessionDesc")}
        >
          <div className="flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-sm">
            <UserIcon
              aria-hidden="true"
              className="h-4 w-4 text-muted-foreground"
            />
            <span>{webContext?.username || "PromptHub User"}</span>
          </div>
        </SettingItem>
        <SettingItem
          label={t("settings.connectedClient")}
          description={t("settings.connectedClientDesc")}
        >
          <div className="flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-sm text-foreground">
            <LaptopIcon
              aria-hidden="true"
              className="h-4 w-4 text-muted-foreground"
            />
            <span>{clientLabel}</span>
          </div>
        </SettingItem>
      </SettingSection>

      <SettingSection title={t("settings.connectedDevices")}>
        <div className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {t("settings.connectedDevicesDesc")}
            </p>
            <button
              type="button"
              onClick={() => void loadDevices()}
              className="inline-flex h-8 items-center gap-2 rounded-lg border border-border px-3 text-sm text-foreground transition-colors hover:bg-muted"
            >
              <RefreshCwIcon aria-hidden="true" className="h-4 w-4" />
              <span>{t("settings.refreshDevices")}</span>
            </button>
          </div>

          {devices.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
              {loadingDevices
                ? t("common.loading", "Loading...")
                : t("settings.noConnectedDevices")}
            </div>
          ) : (
            <div className="space-y-3">
              {devices.map((device) => {
                const isCurrentBrowser =
                  device.type === "browser" &&
                  device.id === currentBrowserDeviceId;
                return (
                  <div
                    key={device.id}
                    className="rounded-xl border border-border bg-card px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {device.type === "desktop" ? (
                            <LaptopIcon
                              aria-hidden="true"
                              className="h-4 w-4 text-primary"
                            />
                          ) : (
                            <GlobeIcon
                              aria-hidden="true"
                              className="h-4 w-4 text-primary"
                            />
                          )}
                          <span className="truncate text-sm font-medium text-foreground">
                            {device.name}
                          </span>
                          {isCurrentBrowser ? (
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                              {t("settings.currentDevice")}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                          <div>
                            {t("settings.deviceType")}:{" "}
                            {device.type === "desktop"
                              ? t("settings.deviceTypeDesktop")
                              : t("settings.deviceTypeBrowser")}
                          </div>
                          <div>
                            {t("settings.devicePlatform", "Platform")}:{" "}
                            {device.platform}
                          </div>
                          <div>
                            {t("settings.deviceVersion")}:{" "}
                            {device.appVersion ||
                              device.clientVersion ||
                              "unknown"}
                          </div>
                          <div>
                            {t("settings.deviceLastSeen")}:{" "}
                            {formatSeenAt(device.lastSeenAt)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SettingSection>

      <SettingSection title={t("settings.clientSync")}>
        <SettingItem
          label={t("settings.deviceSyncCadence")}
          description={t("settings.deviceSyncCadenceDesc")}
        >
          <div className="w-44">
            <Select
              ariaLabel={t("settings.deviceSyncCadence")}
              value={deviceSettings.syncCadence || "manual"}
              onChange={(value) =>
                void updateDeviceSettings({
                  syncCadence: value as DeviceManagementSettings["syncCadence"],
                })
              }
              options={[
                { value: "manual", label: t("settings.syncCadenceManual") },
                { value: "15m", label: t("settings.syncCadence15m") },
                { value: "1h", label: t("settings.syncCadence1h") },
                { value: "1d", label: t("settings.syncCadence1d") },
              ]}
            />
          </div>
        </SettingItem>
      </SettingSection>

      <SettingSection title={t("settings.storeSync")}>
        <SettingItem
          label={t("settings.storeAutoSync")}
          description={t("settings.storeAutoSyncDesc")}
        >
          <ToggleSwitch
            ariaLabel={t("settings.storeAutoSync")}
            checked={deviceSettings.storeAutoSync}
            onChange={(checked) =>
              void updateDeviceSettings({
                storeAutoSync: checked,
              })
            }
          />
        </SettingItem>
        <SettingItem
          label={t("settings.storeSyncCadence")}
          description={t("settings.storeSyncCadenceDesc")}
        >
          <div className="w-44">
            <Select
              ariaLabel={t("settings.storeSyncCadence")}
              value={deviceSettings.storeSyncCadence || "1d"}
              onChange={(value) =>
                void updateDeviceSettings({
                  storeSyncCadence:
                    value as DeviceManagementSettings["storeSyncCadence"],
                })
              }
              options={[
                { value: "manual", label: t("settings.syncCadenceManual") },
                { value: "1h", label: t("settings.syncCadence1h") },
                { value: "1d", label: t("settings.syncCadence1d") },
              ]}
            />
          </div>
        </SettingItem>
        <div className="px-4 py-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <StoreIcon
              aria-hidden="true"
              className="h-4 w-4 text-primary"
            />
            <span>{t("settings.storeSync")}</span>
          </div>
          <p className="mt-2">{t("settings.storeSyncHint")}</p>
        </div>
      </SettingSection>

      <SettingSection title={t("settings.browserSession")}>
        <SettingItem
          label={t("settings.signOut")}
          description={t("settings.browserSessionDesc")}
        >
          <button
            type="button"
            onClick={() => void logoutWebSession()}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            <LogOutIcon aria-hidden="true" className="h-4 w-4" />
            <span>{t("settings.signOut")}</span>
          </button>
        </SettingItem>
      </SettingSection>
    </div>
  );
}
