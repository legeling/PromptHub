!define PROMPTHUB_INSTALL_STATE_KEY "Software\\PromptHub\\InstallerState"

!macro customInit
  ReadRegStr $R0 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ReadRegStr $R1 HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation

  ${if} $R0 == ""
  ${andIf} $R1 == ""
    ReadRegStr $R2 HKLM "${PROMPTHUB_INSTALL_STATE_KEY}" InstallLocation
    ReadRegStr $R3 HKCU "${PROMPTHUB_INSTALL_STATE_KEY}" InstallLocation

    ${if} $R2 != ""
      StrCpy $installMode all
      SetShellVarContext all
      StrCpy $INSTDIR "$R2"
    ${elseif} $R3 != ""
      StrCpy $installMode CurrentUser
      SetShellVarContext current
      StrCpy $INSTDIR "$R3"
    ${endif}
  ${endif}
!macroend

!macro customInstall
  WriteRegStr SHELL_CONTEXT "${PROMPTHUB_INSTALL_STATE_KEY}" InstallLocation "$INSTDIR"
  WriteRegStr SHELL_CONTEXT "${PROMPTHUB_INSTALL_STATE_KEY}" InstallMode "$installMode"
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegKey SHELL_CONTEXT "${PROMPTHUB_INSTALL_STATE_KEY}"
  ${endif}
!macroend
