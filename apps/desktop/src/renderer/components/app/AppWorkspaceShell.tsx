import type { DragEndEvent } from "@dnd-kit/core";
import { DndContext, pointerWithin } from "@dnd-kit/core";
import type { ReactNode } from "react";

import type { UpdateStatus } from "../UpdateDialog";
import { MainContent, Sidebar, TitleBar, TopBar } from "../layout";
import { BackgroundImageBackdrop } from "../ui/BackgroundImageBackdrop";
import { DesktopAppCommandBridge } from "./DesktopAppCommandBridge";

export type AppWorkspacePage = "home" | "settings";

interface AppWorkspaceShellProps {
  currentPage: AppWorkspacePage;
  onNavigate: (page: AppWorkspacePage) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onOpenUpdater: () => void;
  updateAvailable: UpdateStatus | null;
  webRuntime: boolean;
  backgroundImageFileName?: string;
  backgroundImageOpacity: number;
  backgroundImageBlur: number;
  settingsContent: ReactNode;
  overlayContent: ReactNode;
}

export function AppWorkspaceShell({
  currentPage,
  onNavigate,
  onDragEnd,
  onOpenUpdater,
  updateAvailable,
  webRuntime,
  backgroundImageFileName,
  backgroundImageOpacity,
  backgroundImageBlur,
  settingsContent,
  overlayContent,
}: AppWorkspaceShellProps) {
  const hasBackgroundImage = Boolean(backgroundImageFileName);

  return (
    <DndContext onDragEnd={onDragEnd} collisionDetection={pointerWithin}>
      <div
        className={`relative flex h-screen flex-col overflow-hidden bg-background text-foreground ${
          hasBackgroundImage ? "app-background-mode-image" : ""
        }`}
      >
        {backgroundImageFileName ? (
          <BackgroundImageBackdrop
            src={backgroundImageFileName}
            alt=""
            opacity={backgroundImageOpacity}
            blur={backgroundImageBlur}
          />
        ) : null}

        <div
          className={`relative z-10 flex h-screen flex-col overflow-hidden ${
            hasBackgroundImage ? "app-wallpaper-shell" : ""
          }`}
        >
          {!webRuntime ? <TitleBar /> : null}
          {!webRuntime ? (
            <DesktopAppCommandBridge
              currentPage={currentPage}
              onNavigate={onNavigate}
              onOpenUpdater={onOpenUpdater}
            />
          ) : null}

          <div className="flex flex-1 overflow-x-visible overflow-y-hidden">
            <Sidebar
              currentPage={currentPage}
              onNavigate={onNavigate}
              layout="rail"
            />

            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              {currentPage === "home" ? (
                <TopBar
                  onOpenSettings={() => onNavigate("settings")}
                  updateAvailable={updateAvailable}
                  onShowUpdateDialog={onOpenUpdater}
                />
              ) : null}

              <div className="flex min-h-0 flex-1 overflow-hidden">
                {currentPage === "home" ? (
                  <Sidebar
                    currentPage={currentPage}
                    onNavigate={onNavigate}
                    layout="panel"
                  />
                ) : null}

                <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                  {currentPage === "home" ? <MainContent /> : settingsContent}
                </div>
              </div>
            </div>
          </div>

          {overlayContent}
        </div>
      </div>
    </DndContext>
  );
}
