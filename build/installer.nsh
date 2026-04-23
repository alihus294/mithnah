; Custom NSIS hooks for electron-builder.
;
; DATA-PRESERVATION POLICY (operator reported in 0.8.33: a reinstall
; wiped every custom dua, the PIN hash, the undo stack, everything):
;   %APPDATA%\Mithnah is NEVER deleted — not on upgrade, not on
;   full uninstall, not ever. A caretaker who wants a clean slate
;   can delete the folder manually via Windows Explorer. Every
;   Windows app of record (Chrome, Firefox, Zoom, Teams) preserves
;   user-profile data across uninstall; we follow the same
;   expectation.
;
; What we DO still clean on full uninstall:
;   - Auto-launch registry entries (so the phantom "Mithnah" shortcut
;     doesn't keep trying to launch a missing exe at boot).
;   - electron-updater's differential-block cache under
;     %LOCALAPPDATA%\mithnah-updater (it's useless without the app).
;   - HKCU\Software\Mithnah keys (Electron scratch; rarely present).
;
; On upgrades (${isUpdated} flag set by electron-builder when the new
; installer invokes the old uninstaller) we skip even those so
; auto-launch stays working through the upgrade.

!macro customUnInstall
  ${IfNot} ${isUpdated}
    DetailPrint "Mithnah: full uninstall — cleaning registry + updater cache (user data preserved in $APPDATA\Mithnah)."

    ; electron-updater caches differential blocks under a sibling
    ; directory named after the app id. Kept in LOCAL (not roaming)
    ; because updates are machine-specific.
    RMDir /r "$LOCALAPPDATA\mithnah-updater"

    ; Auto-launch entry created by app.setLoginItemSettings.
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Mithnah"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "mithnah"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.squirrel.Mithnah.Mithnah"

    ; Scoped app keys Electron may have written under HKCU\Software\
    ; <productName>. Best-effort; often absent.
    DeleteRegKey HKCU "Software\Mithnah"
    DeleteRegKey HKCU "Software\mithnah"
  ${Else}
    DetailPrint "Mithnah: upgrade detected — preserving registry entries + user data."
  ${EndIf}
!macroend
