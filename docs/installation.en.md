# Installing and restoring Typora Code

English | [Simplified Chinese](installation.md)

Typora Code runs inside Typora. Normal installation uses the prebuilt files in the complete download. Developers rebuild those same assets before delivery; see the [contributor guide](contributing.en.md).

## Requirements

| Environment | Requirements | Validation boundary |
| --- | --- | --- |
| Windows x64 | Windows 10 1903+ or Windows 11, Windows PowerShell 5.1, installed Typora | Primary environment; native Typora 1.14.10 and installation transactions have been tested |
| Windows ARM64 | PowerShell 5.1 and an ARM64 system | Native terminal assets are included; ARM64 device acceptance remains outstanding |
| MSYS2 UCRT64 on Windows | `MSYSTEM=UCRT64`, Bash, `cygpath`, and `powershell.exe` | Delegates to Windows transactions; full UCRT64 device acceptance remains outstanding |
| Linux | Bash, Python 3.9+, writable Typora installation and user configuration directories | Python transactions have been tested; native UI and permissions remain unverified; no integrated terminal runtime is bundled |

macOS, Git Bash, MSYS2 MINGW64, and 32-bit Windows are outside the current installer scope. Path conversion for WSL-style paths does not mean the Windows installer is supported under WSL.

The core workbench uses bundled assets. The first Windows installation downloads a pinned private Node runtime from `nodejs.org`, verifies SHA-256, and leaves the system PATH unchanged. A system Node installation does not replace this runtime. Git features require Git; C/C++ analysis requires clangd. Install and configure optional tools before using their corresponding features.

## Get the complete package

Use the project's GitHub repository and **Code → Download ZIP**, then extract the whole package. The Help menu's repository entry works independently of update checks. If the target machine cannot reach GitHub, transfer the complete download from another device; a first offline Windows installation also needs the runtime cache described below.

Keep the root install/check/uninstall/restore scripts, `scripts/`, themes, and the complete `enhancements/dist/` tree, including `SHA256SUMS` and `terminal_runtime/`. Do not copy only a script or only `workbench.js`.

## Windows installation

Save your documents, then run `install_windows.cmd`. For an explicit installation location:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install_windows.ps1 -typora_root '<Typora installation directory>'
powershell -NoProfile -ExecutionPolicy Bypass -File .\check_windows.ps1 -typora_root '<Typora installation directory>'
```

`-user_data` selects a portable or separate user configuration directory. Without it, the installer uses the default user directory. `-backup_root` must name a new directory; the default is `backups/typora_code_configuration/` under user data. `-non_interactive` fails instead of prompting when discovery is insufficient. Use `Get-Help .\install_windows.ps1 -Detailed` for parameters. Execution-policy bypass applies only to the invoked PowerShell process.

Start with ordinary permissions. The installer prepares and verifies the runtime, then checks actual write targets. Unchanged host entries and assets are not overwritten. Protected targets cause one Windows elevation request explaining the path and reason; cancellation keeps the old installation. The elevated continuation retains the original user's data, backup, and cache paths. Read-only mounts, file locks, and network errors are not solved by requesting elevation.

Non-interactive installation does not request elevation unless `-allow_elevation` is explicitly supplied. Built-in updates pass that switch after the user chooses to install. A backup under a protected installation directory is subject to that directory's permissions too. Custom backup locations must be passed explicitly to restore or uninstall.

## Progress and logs

Installation reports the current stage, timestamps, and elapsed time. Stage numbers describe order, not download percentage. Runtime download is followed by digest verification and extraction. Only successful installation and verification produce `SUCCESS`.

On failure, read the actual state: no target files written, rolled back, or automatic rollback incomplete. An incomplete rollback is not a successful restore. Keep the backup and log for recovery.

Each run saves an independent UTF-8 log and reports its path after `Log:`. The default location is `logs/installation/` under user data, with a fallback under the system temporary directory's `TyporaCode/install_logs/`. A log-storage failure is reported while console output continues. Logs are not uploaded automatically; redact personal paths before sharing when appropriate. Installer interaction and log translation are tracked separately from workbench UI translation.

## Linux and UCRT64

From the complete package root:

```bash
bash ./install.sh --typora-root '<Typora installation directory>' --non-interactive
bash ./check.sh --typora-root '<Typora installation directory>' --non-interactive
```

Omit the path and non-interactive flag to allow discovery and prompts. Bash entry points support `--help`. On Windows, use MSYS2 UCRT64; it delegates to the same PowerShell implementation. Linux uses the Python transaction.

Linux runs as the caller and requires write access to `resources/window.html` and that user's configuration directory. Use a writable Typora installation. The installer does not invoke sudo automatically. Running the entire command as root can put configuration in root's user directory. A read-only mounted AppImage requires a writable installation form. Package-manager upgrades can replace host files, requiring a new check and installation.

## Paths and write scope

Explicit arguments take priority, followed by `TYPORA_ROOT`, running-process information, and platform discovery. Windows also checks PATH and App Paths; Linux checks executable locations. If discovery fails, the script prompts or exits in non-interactive mode.

Default user data is `%APPDATA%\Typora` on Windows and `$XDG_CONFIG_HOME/Typora` on Linux, falling back to `$HOME/.config/Typora` when XDG is unset.

| Location | Purpose |
| --- | --- |
| Host `resources/window.html` | Adds static CSS and resident scripts; leaves `app.asar` unchanged |
| User data `typora_code/` | Workbench assets; retains existing `settings/workspace.json` settings |
| User data `linux_note_enhancements/terminal_runtime/` | Existing directory name for Windows terminal runtime assets |
| User data `themes/` | Project themes, with existing managed filenames backed up before replacement |
| User data `profile.data` | Full backup; only the frameless-window preference is adjusted, preserving later unrelated preferences on restoration |
| User data `backups/typora_code_configuration/` | Transaction manifests and original files |

Installation does not write project configuration or document contents. Reading positions, workbench settings, and unmanaged files remain. Known legacy assets from this project may be migrated. If an old loader still has other community plugins enabled, installation stops: disable dependencies on that old loader first and retain the original backup.

## Offline installation

Prepare the private Windows Node ZIP in advance. The authoritative version, architecture, filename, ZIP digest, and executable digest are in [`node_runtime.json`](../enhancements/node_runtime.json).

1. Download `https://nodejs.org/dist/v<version>/node-v<version>-win-<arch>.zip` for the manifest's version and the target's `x64` or `arm64` architecture.
2. Copy the intact ZIP to a cache directory on the target, keeping its official filename. Do not extract it.
3. Set the cache in the PowerShell environment used for installation or restoration:

```powershell
$env:TYPORA_TERMINAL_CACHE = '<prepared ZIP cache directory>'
powershell -NoProfile -ExecutionPolicy Bypass -File .\install_windows.ps1
```

The default cache is `%LOCALAPPDATA%\Typora\terminal_downloads`. A matching verified ZIP is reused. Missing or invalid cache data triggers an official download and therefore fails when fully offline. Do not bypass verification or rename another version to impersonate the expected archive. Offline Windows restoration also requires the private runtime cache.

## Check and update

`check_windows.ps1` and `check.sh` perform read-only comparisons of this package against installed entries, themes, and asset digests. They report `status: OK` on success and a nonzero exit on failure. They do not repair files. Editing a managed theme can produce a mismatch without implying document damage.

The Typora Code update dialog displays the version actually loaded in the current window, even offline. If the installed version differs, it separately reports the pending installed version. Save documents and restart every Typora window to load it.

Windows startup checks are coordinated across windows. A new commit with a release sequence at least as recent as the local sequence can prompt for updating. **Later** does not download or install. **Update Now** downloads the official repository ZIP for the fixed commit, verifies it, and installs immediately. Windows remain open; restart manually afterwards.

Manual checks show progress immediately, reuse an ongoing check, and allow cancellation and retry without reopening cancelled results. Download shows received bytes and a percentage only when a valid total exists. Download completion is not installation completion. Download and verification can be cancelled; once the installation transaction starts, let it finish. Closing the progress dialog does not stop the background task; reopen it from Help.

Manual failures report offline, rate-limit, timeout, or other actual errors; unattended startup-check failures only log. Protected writes use the standard Windows authorization flow. Failed writes use transaction rollback. Settings are preserved, and running windows are not hot-replaced. Avoid opening new windows during the multi-file installation.

Update payloads live under user data at `temp/typora_code_updates/<task_id>`. Downloads do not require elevation. Updates use GitHub commit SHAs and fixed-commit ZIPs without requiring Git, `.git`, clones, or history. `typora_code_update_identity.json` records successful installed identity; manual ZIP installations establish equivalent asset-manifest identity. Same-sequence commits can still be detected; maintainers must nevertheless increment the sequence for public functional releases.

For old versions without the updater or unsupported automatic-update platforms, download the complete new package, install, and check.

Update Typora itself normally through its official channels. Its update may replace `window.html`, disabling the enhancement. Check compatibility, then reinstall the matching enhancement package with a new backup. There is no automatic reinjection after host updates or guarantee of compatibility with future host versions.

Restoration refuses changes to the startup page outside this project's own entry. Do not restore an old `window.html` across Typora versions or bypass a refusal by copying it manually. Repair the host through its official installer when necessary.

## Uninstall and restore

On Windows, save documents, exit Typora, and run `uninstall_windows.cmd`. It discovers valid pre-installation backups in the current user's default backup directory. A unique candidate is used directly; multiple candidates show their time, host location, and backup path. Select a number, or press Enter / Q to cancel.

Update backups are not uninstall sources. If the target Typora is running, uninstall stops and asks you to exit; it does not terminate processes. Without a compatible pre-installation backup, it first backs up the current startup page and removes only the recognized Typora Code loading entry. It retains the current host, themes, preferences, plugin packages, and configuration. An entry whose integrity cannot be established is not modified.

These are separate explicit invocations:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\uninstall_windows.ps1 -non_interactive
powershell -NoProfile -ExecutionPolicy Bypass -File .\uninstall_windows.ps1 -typora_root '<Typora installation directory>' -non_interactive
powershell -NoProfile -ExecutionPolicy Bypass -File .\uninstall_windows.ps1 -backup_root '<complete pre-installation backup>' -non_interactive
```

Non-interactive mode fails on ambiguous paths or backup candidates; `-Verbose` reports why backups were skipped. CMD accepts the same parameters. Uninstall preserves the host, documents, user settings, reading records, and backups. Restoring a migration backup may restore the original legacy plugins too.

For a version rollback or manual Linux/UCRT64 restoration, save documents, exit Typora, and select the correct backup:

| Goal | Backup |
| --- | --- |
| Return to the pre-workbench environment | Complete backup from before the first installation |
| Undo an enhancement update | Backup produced by that update |
| Undo a legacy-plugin migration | Migration backup, which may include legacy plugins and their loader |

The backup must include `manifest.json` and its referenced directories. A lone `window.html` is insufficient. The manifest binds the backup to its host and user-data locations; another user's or machine's backup is not interchangeable. Current restoration accepts this project's schema 4 transaction backups.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\restore_windows.ps1 -backup_root '<selected backup>'
```

```bash
bash ./restore.sh --backup-root '<selected backup>'
```

Restoration validates digests and paths, saves a pre-restore snapshot, restores previously managed files, and removes managed files newly added by the original transaction. It restores the relevant native window preference while preserving later unrelated preferences, workbench settings, reading records, unmanaged files, and document contents. `restore_*` snapshots under the selected backup are diagnostic material, not standalone install backups that can be passed to restore again.

After restoration, reopen Typora. If the selected theme was removed, choose a retained or native theme. A missing-enhancement result from the installation checker is expected after uninstall; do not reinstall as an uninstall-validation step. Check native menus, editing, and your documents.

If backups are lost, pre-installation themes, legacy plugins, and window preferences cannot be reconstructed reliably. The current uninstaller may still back up and detach a complete recognized entry. If that entry is damaged, use the matching official Typora installer to repair host startup. Neither method recreates missing original configuration. Preserve user data and documents.

A read-only preview can run while Typora remains open:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\uninstall_windows.ps1 -check_only -non_interactive
```

Its mode is `restore`, `detach`, or `absent`. Actual uninstall still requires saving and exiting. Logs go to `logs/installation/uninstall-*.log`; detach backups go to `backups/typora_code_uninstall/`. Retained themes do not mean the workbench is still loading.

## Troubleshooting and themes

For discovery failures, supply the host installation directory, not the downloaded project directory. For asset or digest mismatches, obtain the complete matching package and verify the runtime cache. For access failures, inspect the reported target, permissions, locks, or security software. Keep logs and backups if rollback is incomplete. Native-platform acceptance gaps remain documented separately; an installation check is not full UI acceptance.

Choose `CppGithubConsoles_Light` / `CppGithubConsoles_Dark` or `VSCode2026_Light` / `VSCode2026_Dark` through the theme menu. Installation does not switch the current theme. Custom Colors, available from the theme menu and settings, edits the same shared color table with validation, automatic saving, reset, and JSON import/export. Light and dark configurations are separate; switch themes to inspect each. Fonts and typography remain theme-owned.

Each successful standard installation creates an onboarding identity, including same-version reinstalls. The next ready window offers the tutorial once across all windows. Skipping or completing it suppresses repetition on ordinary restarts. Help can replay it. Failed installation rolls back the identity and does not close user windows.
