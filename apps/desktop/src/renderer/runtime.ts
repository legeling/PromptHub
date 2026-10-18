import type { WebRuntime } from "@prompthub/shared/utils/web-runtime";

export interface PromptHubRuntimeCapabilities {
  agentManagement: boolean;
  appUpdate: boolean;
  dataRecovery: boolean;
  desktopWindowControls: boolean;
  promptHubCloud: boolean;
  skillDistribution: boolean;
  skillFileEditing: boolean;
  skillLocalScan: boolean;
  skillPlatformIntegration: boolean;
  skillStore: boolean;
  skillSafetyScan: boolean;
  skillRemoteImport: boolean;
}

export interface PromptHubWebContext {
  mode: WebRuntime["mode"];
  capabilities?: WebRuntime["capabilities"];
  origin: string;
  username?: string;
  registrationAllowed?: boolean;
  initialized?: boolean;
}

type WebRuntimeWindow = Window &
  typeof globalThis & {
    __PROMPTHUB_WEB__?: boolean;
    __PROMPTHUB_WEB_CONTEXT__?: PromptHubWebContext;
    __PROMPTHUB_WEB_LOGOUT__?: (() => Promise<void>) | (() => void);
  };

function getRuntimeWindow(): WebRuntimeWindow | undefined {
  return typeof window === "undefined"
    ? undefined
    : (window as WebRuntimeWindow);
}

export function isWebRuntime(): boolean {
  return getRuntimeWindow()?.__PROMPTHUB_WEB__ === true;
}

export function isPromptHubCloudEnabled(): boolean {
  return (
    !isWebRuntime() &&
    import.meta.env.VITE_PROMPTHUB_CLOUD_ENABLED?.trim().toLowerCase() ===
      "true"
  );
}

export function getRuntimeCapabilities(): PromptHubRuntimeCapabilities {
  if (isWebRuntime()) {
    return {
      agentManagement: getWebContext()?.capabilities?.agentManagement === true,
      appUpdate: false,
      dataRecovery: false,
      desktopWindowControls: false,
      promptHubCloud: false,
      skillDistribution: false,
      skillFileEditing:
        getWebContext()?.capabilities?.skillFileEditing === true,
      skillLocalScan: false,
      skillPlatformIntegration: false,
      skillStore: false,
      skillSafetyScan: getWebContext()?.capabilities?.skillSafetyScan === true,
      skillRemoteImport:
        getWebContext()?.capabilities?.skillRemoteImport === true,
    };
  }

  return {
    agentManagement: true,
    appUpdate: true,
    dataRecovery: true,
    desktopWindowControls: true,
    promptHubCloud: isPromptHubCloudEnabled(),
    skillDistribution: true,
    skillFileEditing: true,
    skillLocalScan: true,
    skillPlatformIntegration: true,
    skillStore: true,
    skillSafetyScan: true,
    skillRemoteImport: true,
  };
}

export function getWebContext(): PromptHubWebContext | undefined {
  if (!isWebRuntime()) {
    return undefined;
  }

  return getRuntimeWindow()?.__PROMPTHUB_WEB_CONTEXT__;
}

export async function logoutWebSession(): Promise<void> {
  const logout = getRuntimeWindow()?.__PROMPTHUB_WEB_LOGOUT__;
  if (typeof logout === "function") {
    await logout();
  }
}
