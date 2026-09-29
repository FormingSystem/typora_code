[Chinese](installation.md)

<a id="section_92ea59e8469c"></a>
# Typora Code Installation and Recovery Guide


Typora Code is a community workbench enhancement running in Typora. Regular users install using the pre-built files in the downloaded package; developers modify the source code and then generate the same set of files according to the [Build Instructions](../enhancements/README.en.md#section_3a010e92a2c3).

<a id="section_9de1e5d75b55"></a>
## Environment Requirements

| Environment | Necessary Conditions | Current Verification Scope |
| --- | --- | --- |
| Windows x64 | Windows 10 1903+ / Windows 11, Windows PowerShell 5.1, Typora installed | Main usage environment; native window and transaction installation of Typora 1.14.10 have been verified, previous results are seen in [Feedback Records](feedback_review.en.md) |
| Windows ARM64 | PowerShell 5.1, ARM64 system; native files for the corresponding terminal are provided in the package | Runtime assets are prepared, ARM64 real devices have not been accepted yet |
| Windows MSYS2 UCRT64 | `MSYSTEM=UCRT64`，Bash、`cygpath`、`powershell.exe` | Bash transfer to Windows transaction; complete UCRT64 real device process has not been accepted yet |
| Linux | Bash, Python 3.9+, writable Typora installation directory and user configuration directory | Python installation transaction has been tested; native interface and permission process for Linux have not been accepted; no integrated terminal runtime package is available |

macOS, Git Bash, MSYS2 MINGW64, and Windows 32-bit are not within the current installation support scope. Path conversion support for WSL-style paths does not imply support for running Windows installation procedures within WSL. Typora's own system requirements are subject to the [official download page](https://typora.io/); for Linux host installation methods, see the [official Linux guide](https://support.typora.io/Typora-on-Linux/).

The core workbench uses bundled files. On Windows, the first installation will also download a fixed private Node runtime from `nodejs.org` and check its SHA-256, without modifying the system PATH; the installed system Node cannot replace this fixed runtime. Git functionality requires `git` to be found in the current environment; the C/C++ outline requires clangd, whose path can be specified in the workbench's 'Parsing Environment Settings'. When these optional tools are not available, install the required tools first and then use the corresponding features.

<a id="section_8b262e1c5e32"></a>
## Download the full installation package

Existing users can open the [project repository](https://github.com/FormingSystem/typora_code) via the system browser from **Help → Typora Code GitHub Repository**, selecting **Code → Download ZIP**, and extracting the entire directory. This entry does not depend on the success of the update check. If the target machine cannot connect to GitHub, download the package on another connected device and transfer the full package; for a pure offline first installation, also prepare the runtime cache described in the following 'Offline Installation' section. Please confirm that the following are present:

```text
install_windows.cmd / install_windows.ps1 / install.sh
check_windows.ps1 / check.sh
uninstall_windows.cmd / uninstall_windows.ps1
restore_windows.ps1 / restore.sh
cpp_github-consolas.css / cpp_github-consolas_light.css / cpp_github-consolas_dark.css
scripts/
enhancements/dist/SHA256SUMS
enhancements/dist/terminal_runtime/
enhancements/node_runtime.json
```

A working tree obtained from Git is also applicable. Do not download only a single script or just copy theme files; the installer requires the same version of scripts, themes, manifests, and runtime files. This guide uses the source package from the repository and does not assume the presence of an independent Release installer.

<a id="section_416b242f0fb5"></a>
## Windows Installation

1. First, install and open Typora, confirming that the host can run normally. Save all unsaved documents; the installer will not forcibly close the window.
2. Fully extract Typora Code. Double-click `install_windows.cmd` in the root directory; it invokes a PowerShell script in the same directory, displays the results, and keeps the window open for viewing.
3. If automatic discovery of the installation location fails, enter the Typora installation directory as prompted. The installer also accepts paths for `Typora.exe`, `resources`, or `resources/window.html`.
4. Record the complete backup directory after `Backup:`. The backup before the first installation serves as the basis for restoring the original environment in the future, and it should also be retained during updates.
5. Perform a read-only check, restart Typora normally, and select 'Theme → cpp github consolas'.

When a specific path needs to be explicitly specified or for automation, execute the following in the root directory of the downloaded package:

```powershell
# Replace the quoted placeholder with the actual installation directory.
powershell -NoProfile -ExecutionPolicy Bypass -File .\install_windows.ps1 -typora_root '<Typora安装目录>' -non_interactive
powershell -NoProfile -ExecutionPolicy Bypass -File .\check_windows.ps1 -typora_root '<Typora安装目录>' -non_interactive
```

The installation supports `-user_data '<实际Typora用户目录>'` to specify a portable/independent configuration directory; automatic updates will pass in the real location currently used by the host; omitting it will still use the default user data directory. Additional support for `-backup_root '<新的备份目录>'`, the specified directory must not already exist. By default, the `backups/typora_code_configuration/` under the user data directory is used. `-non_interactive` will directly fail when the path cannot be discovered, suitable for automation, and will not wait for input. PowerShell help can be viewed via `Get-Help .\install_windows.ps1 -Detailed`; `ExecutionPolicy Bypass` only affects the current PowerShell process.

A regular installation does not require pre-launching with administrator privileges. The script first downloads and verifies the runtime, then checks the actual target that needs to be written to; the host launch page and runtime assets that have not changed are not overwritten. If the target is protected, the specific path and reason will be displayed, and then a Windows UAC authorization will be requested once; the original version is retained if canceled. When reauthorizing for an update, the original user directory, backup, and cache are explicitly reused, and the default configuration of the administrator account is not used. Read-only, occupied, and network failures will not erroneously trigger elevation; if authorization is granted but still denied, it indicates that the ACL or security software policy needs to be checked.

`-non_interactive` does not pop up UAC by default; automated calls that require system authorization can add `-allow_elevation`. The built-in update has passed this switch after the user clicks install. Backups can be specified to a new subdirectory under the Typora installation directory using `-backup_root` `backup`, but this location is also subject to directory permissions and cannot bypass the host write permissions by moving backups; when customizing backup, recovery, or uninstallation, the complete path must be explicitly passed. The default user backup and writable user configuration continue to be retained.

<a id="section_ac2c0ff8053d"></a>
## View installation progress and logs

The installation window displays timestamps, current operations, and actual duration by stage, for example:

```text
[14:32:10] [STEP 3/6] Prepare terminal runtime
[14:32:10] [INFO] Reusing the cache verified by SHA-256; no download is needed.
[14:32:11] [OK] Terminal runtime preparation completed in 1.2 seconds.
[14:32:11] [STEP 4/6] Back up existing configuration
```

The stage number indicates the order of execution, not the download percentage. The first download will explain the reason for waiting, and after the download completes, it will continue to display the summary verification and extraction. Only when the installation and verification are both successful will `SUCCESS` be displayed; when an error occurs, the current stage, reason, and actual status such as 'target files have not been written yet,' 'rolled back,' or 'automatic rollback not completed' will be displayed. Do not consider the last status as a successful recovery; instead, retain the backup and logs and handle them accordingly.

Each installation saves a UTF-8 log independently, and the full path is displayed after `Log:`. The default directory is under the user data's `logs/installation/` (Windows is `%APPDATA%\Typora\logs\installation`); when the directory is not writable, it will attempt to use the system temporary directory's `TyporaCode/install_logs/`. If log storage is unavailable, a prompt will be shown, but the console will continue to output; the installer will not automatically upload logs. Before feedback, you can optionally obscure personal paths in the logs.

<a id="section_aa40555ad895"></a>
## Linux and UCRT64

Execute in the root directory of the complete download package:

```bash
bash ./install.sh --typora-root '<Typora安装目录>' --non-interactive
bash ./check.sh --typora-root '<Typora安装目录>' --non-interactive
```

Omitting the path and `--non-interactive` allows automatic discovery and interactive input. All three Bash entries support `--help`. On Windows, **MSYS2 UCRT64** must be used, and Bash will hand over the installation, check, and recovery to the same PowerShell implementation. On Linux, the Python transaction manages the workbench and themes.

On Linux, operations are performed as the caller, requiring the current user to be able to write to the host `resources/window.html` and their own configuration directory. Please use an independent Typora installation that is writable by the current user; the script will not automatically call sudo. Do not blindly use sudo for the entire installation command, as the configuration may end up in the root user's directory. AppImage with read-only mounting cannot be directly modified persistently; a writable installation form must be used first. Upgrading or reinstalling Typora via the package manager may replace the host files, and then follow the update steps below to check.

<a id="section_e198eb51b951"></a>
## Path and Write Scope

The path should prefer explicit parameters. If not specified, it reads `TYPORA_ROOT`, then checks the running process and system discovery information; on Windows, it also checks PATH and App Paths registry information, and on Linux, it checks the executable file path. If the final location cannot be determined, it will interactively ask or exit in non-interactive mode.

The 'User Data Directory' on Windows is `%APPDATA%\Typora`, on Linux is `$XDG_CONFIG_HOME/Typora`, and when XDG is not set, it is `$HOME/.config/Typora`.

| Location | Installation purpose and retention rules |
| --- | --- |
| Typora Installation Directory `resources/window.html` | Add static CSS and persistent script entry points; `app.asar` remains unchanged |
| User Data `typora_code/` | Workbench runtime assets; `settings/workspace.json` retains existing settings |
| User Data `linux_note_enhancements/terminal_runtime/` | Existing directory name for the current Windows terminal runtime assets |
| User Data `themes/cpp_github-consolas.css` | Theme for this project; back up files with the same name before overwriting |
| User Data `profile.data` | Full backup, only adjust the borderless window field; when restoring this field, retain later preferences |
| User Data `backups/typora_code_configuration/` | List of backups and original files for each independent installation |

Installation does not write configuration to open projects and does not modify document content. Reading positions, workbench settings, and unmanaged files are retained. Installation will migrate confirmed old plugin assets from previous deployments of this project; if old loaders are still enabled and other community plugins are detected, installation will stop. You should first disable plugins that depend on old loaders in the original plugin manager and retain the original backup.

<a id="section_8ca823303fe0"></a>
## Offline Installation

Core assets do not require internet connectivity; the download cache for Windows private Node can be prepared in advance. Fixed versions, architectures, ZIP files, and executable file summaries are based on the current package's [`enhancements/node_runtime.json`](../enhancements/node_runtime.json).

1. Get the corresponding ZIP from `https://nodejs.org/dist/v<version>/node-v<version>-win-<arch>.zip` on a connected machine; `arch` is `x64` or `arm64`, matching the target Windows architecture.
2. Place the complete ZIP in a self-selected cache directory on the target machine, retaining the official file name, without unpacking.
3. Set the cache and run in the same PowerShell where installation or recovery is executed:

```powershell
$env:TYPORA_TERMINAL_CACHE = '<已准备ZIP的缓存目录>'
powershell -NoProfile -ExecutionPolicy Bypass -File .\install_windows.ps1
```

The default cache is `%LOCALAPPDATA%\Typora\terminal_downloads`. If it matches and the summary is correct, it will be reused; if it is missing or the summary is incorrect, it will attempt an official download, and will fail in a completely offline environment. Do not skip the summary verification or use other version files renamed as cache. Windows recovery also uses this private runtime to handle native configurations, and the cache must be retained before offline recovery.

<a id="section_8257844c2dfc"></a>
## Check and Update

`check_windows.ps1` / `check.sh` only performs a read-only comparison of **this download package** with installed entry points, themes, and release summaries; it displays `status: OK` on success and returns a non-zero value on failure. It does not repair files. If you have modified the same-named theme for this project, it will also report a difference, which is not equivalent to Typora document corruption.

**Check the current running version:** Open 'Help → Check Typora Code Update', the top of each stage will display the actual version loaded by the current window, independent of internet connectivity. If a different version or new commit is already installed on the disk, it will additionally display 'Installed Version (takes effect after restart)'; the running version will switch only after saving the file and normally restarting all Typora windows.

**Update Typora Code:** After installing a version with the update module, Windows will check once in multiple windows at startup; if new commits are detected and the remote release number is not lower than the local one, the version number, commit hash, and fix announcement will be displayed. Choosing 'Later' will not download or install; choosing 'Update Now' will download the official repository ZIP, verify it, and immediately perform an in-place installation. After completion, save the document and manually restart all Typora windows for the changes to take effect. The windows will not automatically close. The 'Check Typora Code Update' option in the Help menu will immediately show 'Checking for updates...' and then display the latest version, new version announcement, or failure reason after completion. If a background check is already in progress, the same request is reused, and repeated clicks will not result in multiple network connections; you can cancel and retry, and canceled stale results will not reappear as popups. If there is an existing installation task, the progress of that task will be displayed. The check, verification of extraction, and installation will continuously show an activity bar; during download, the actual received size is displayed, and if the server provides a valid total size, the download percentage is shown. A download of 100% does not mean installation is complete; once installation begins, it cannot be canceled midway, closing the progress window will not interrupt the background task, and you can check again from the Help menu. After a successful update, a clear prompt will indicate that a manual restart is required.

2026.09.20.2 On first launch, it will briefly display 'Loading workbench...' and then show the workspace once ready; if an initialization error occurs or if it takes longer than 15 seconds, it will revert to native operations. If it continuously gets stuck on the old interface, first retain the error message and run check, using [Stability Design](startup_stability.en.md) to distinguish between startup failure and normal data loading.


Cancellation is possible during download and verification; wait for completion once the installation transaction begins. Closing the progress window does not terminate the background update. Manual checks encountering offline, throttling, or timeout will explain the error; failed startup checks without manual intervention are only logged; if actual write permissions are insufficient, the reason will be explained and a request for Windows system authorization will be made, without silent elevation, and canceling retains the original version. Errors and logs can be viewed; if installation writing fails, the backup rollback is used. User settings are retained, and the current window is not hot-swapped. During multi-file installation, do not actively open new windows; restart normally after completion.

Download and extraction by default use the `temp/typora_code_updates/<任务ID>` in the Typora user data directory, creating it if it does not exist; it does not write cache to protected program installation directories. The updater only retrieves commit SHA from GitHub API and downloads a ZIP with a fixed SHA, without requiring Git, `.git`, clone, or history. The hash of a successfully installed version is recorded in `typora_code_update_identity.json` in the user data directory; the first manual ZIP installation establishes equivalent identity via the asset manifest. Download does not elevate privileges; only when modifying protected host entry points will the installation authorization process be used.

When upgrading from an older version without the update module or using a platform that does not yet support automatic installation, the full new package must still be obtained, run install, and then run check. Each installation creates a new backup. New commits with the same number will also prompt and display the commit description; maintainers releasing feature fixes still require incrementing the version, writing an announcement, and pushing verified assets, see [Update Design and Release Contract](workspace_update.en.md).

**Update Typora:** Proceed with the official update as usual. The update may overwrite `window.html`, and enhanced features will no longer be loaded; use the current enhanced package to check, verify the compatibility of the new host, and reinstall to generate a new backup. The script will not block or rewrite the official update process. There is currently no automatic re-injection mechanism after an update, and it cannot be guaranteed that future Typora versions will not require adaptation.

The recovery script will reject changes to content other than the **project entry point** on the startup page, preventing old backups from overwriting upgraded or externally modified pages; this is not a complete host version check. Do not restore old `window.html` across Typora versions, nor manually bypass the rejection using old files. When a new host requires fixes, use its official installation package and then install a matching enhanced version.

<a id="section_1b97e4a77bb2"></a>
## Uninstall and recovery

**Enhanced Windows Uninstallation:** Save your documents and exit Typora, then double-click the root directory `uninstall_windows.cmd`. It automatically detects valid pre-installation backups in the user's default backup directory; if there is only one candidate, it is used directly, and if there are multiple candidates, they are displayed with timestamps, installation locations, and backup paths. Enter a number to select, or press Enter or input Q to cancel. The result window is retained for viewing.

`uninstall` will exclude update backups and complete the uninstallation using the original recovery transaction. If the target Typora is still running, it will stop and prompt to exit, but will not close the process. If there are no compatible pre-installation backups (e.g., old schema backups, Typora has already been upgraded), it will first back up the current startup page, then only remove TyporaCode's own loading entry, preserving the current host version, theme, preferences, plugin packages, and configuration. It will not treat update backups as uninstallation sources, nor delete the entire user data directory; it will still refuse to make changes if the entry's integrity cannot be confirmed. To limit the installation location, use a custom backup location, or use it for automation, run the following in the package root directory:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\uninstall_windows.ps1 -non_interactive
powershell -NoProfile -ExecutionPolicy Bypass -File .\uninstall_windows.ps1 -typora_root '<Typora安装目录>' -non_interactive
powershell -NoProfile -ExecutionPolicy Bypass -File .\uninstall_windows.ps1 -backup_root '<安装前完整备份目录>' -non_interactive
```

The above are three independent usages. `-non_interactive` will fail immediately if it cannot determine the installation location or encounters multiple backup candidates, without waiting for input; adding `-Verbose` allows you to view the reason backups were skipped. CMD also accepts the same parameters. Uninstallation retains the Typora core, documents, user settings, reading history, and backups; the environment migrated from old plugins will restore the old plugins from this backup.

**Revert to an enhanced version or manually restore on Linux / UCRT64:** Continue using `restore`, explicitly specifying the selected backup.

First, save your documents and exit Typora, then select the correct backup directory:

| Target | Selected Backup |
| --- | --- |
| Uninstall the standalone workbench and return to the pre-installation environment | **Complete backup before the first installation** |
| Revert a specific enhanced update | The backup generated by that update; restores to the enhanced version before the update |
| Revert to the original environment after migration from old plugins | Backup from the time of migration; it may restore the original plugin and old loader, but does not represent a pure Typora |

The backup directory must contain `manifest.json` and the corresponding subdirectories; it cannot only copy `window.html`. The manifest records the original user data and installation path, and cannot be replaced with backups from other users or machines; the current recovery supports transaction backups of this project's schema 4.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\restore_windows.ps1 -backup_root '<所选备份目录>'
```

```bash
bash ./restore.sh --backup-root '<所选备份目录>'
```

Recovery will verify the checksum and path, first saving a snapshot before recovery, then restoring the original managed files according to the manifest and removing the newly installed managed files at that time. Native window fields are restored, while other later-modified preferences are retained; workbench settings, reading history, unmanaged files, and document content are retained. The snapshot before recovery is saved in the `restore_*` subdirectory of the selected backup for troubleshooting; it is not another complete installation backup that can be directly passed to restore.

After a successful recovery, reopen Typora; if the current theme was removed during uninstallation, select a native or previously saved theme from the 'Theme' menu. At this point, the missing enhanced installation check is an expected result, and you should not run install again as 'uninstallation verification'. Check if the native menus, editing, and your documents are functioning normally.

**Backup Lost:** It cannot guarantee the restoration of the same named theme, old plugins, or original window fields. The new version of uninstallation can first back up and revoke the current complete workbench entry; if the entry is damaged and cannot be safely identified, use the official Typora installation package of the same version to repair the host files and restore the native startup, then select a native theme. Neither of these methods can rebuild the lost original configuration. Retain user data and documents, and avoid deleting the entire directory.

You can first run a read-only pre-check without exiting Typora:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\uninstall_windows.ps1 -check_only -non_interactive
```

Pre-check shows `restore` (backup before valid installation), `detach` (remove current entry), or `absent` (no workbench entry). Actual uninstallation still requires saving and exiting first. Each actual run generates the user data directory `logs/installation/uninstall-*.log`; backups before removing the entry are in `backups/typora_code_uninstall/`, preserving the original launch page and transaction summary. When permissions are insufficient, the installation directory is indicated, and the reason for needing administrator rights is explained. Uninstalled themes can be switched in the Typora theme menu; this does not mean the enhancement is still loaded.

<a id="section_0c3480b6b599"></a>
## Common Issues

| Prompt or Phenomenon | Handling |
| --- | --- |
| Typora not found / waiting for path | Specify `-typora_root` or `--typora-root`; confirm it is not the Typora Code download package directory |
| Asset / digest / SHA-256 mismatch | Re-download the complete package of the same version; verify cache errors according to the offline section, without skipping verification |
| Access denied / Permission denied | Windows interactive installation requests UAC once based on actual write permissions; for unattended installation, pass -allow_elevation. If authorized but still fails, check the specific target ACL or security software; read-only/occupied cases require separate handling |
| Other enabled community plugins | First disable other plugins that depend on the old loader in the original environment, then install |
| Interface remains old after installation | Save first, then fully exit and reopen Typora; check the results of this package's check and theme selection |
| Enhancements are missing after upgrade | Reinstall the current host entry by checking for updates |
| Rejection of host page changes | Stop using this old backup to overwrite the host; repair the current version through the official installer |

Before each error, retain the complete console output, the used enhancement version, Typora version, and backup directory; when providing feedback, obscure personal directory information. Native installation baseline, user-specified, and unverifiable backups are retained; after a successful installation, only the latest verifiable product upgrade backup is retained. Old versions without marked upgrades are only reclaimed after verification of ownership and integrity, see [Backup Retention Rules](workspace_update.en.md#section_046e09bded20).

<a id="section_d6eed20ed143"></a>
## Community plugins and host updates

After workbench installation, open the manager from the left side 'Extensions' (Ctrl+Shift+X). Plugin configuration can be accessed from the 'Community Plugin Settings' on the unified settings page or the 'Settings' option on the plugin row. Plugins can be installed from the community directory or a local ZIP file; new plugins are disabled by default. After clicking 'Trust and Enable,' they run. Plugins have permissions of the Typora process and should only be enabled from trusted sources. Activation and deactivation are synchronized across already opened windows; after updating a running plugin, save the document and manually restart all windows for the new version to take effect. Uninstallation retains personal settings and possibly old package caches referenced by other windows.

If official Typora updates overwrite the launch entry, re-run the standard installation and check of this project; it still uses the original Typora icon. Installation is based on the upgraded host page and does not restore the old kernel; community packages, enabled configurations, and personal settings are retained. Windows file transaction simulation has verified this behavior, which cannot replace the unexecuted real official upgrade compatibility acceptance. Complete API and platform boundaries are detailed in [Community Plugin Design](community_plugins.en.md).

<a id="section_b29601d988db"></a>
## Default text rendering value migration (R034.5)

When 2026.09.24.3 first loads the unified text rendering service, missing contracts or soft line wrap configurations earlier than 2026092403 use the automatic line wrap default value. Valid selections from this version onward are retained; only word_wrap is migrated, other host, workbench, SSH, or terminal configurations are not reset. Settings and contracts are stored in the host user data's Local Storage, read by the unique runtime service; standard uninstallation retains user data, and reinstallation continues to use it. Disk installation completion and old window loading of new contracts are two stages, requiring a normal restart. When storage is unavailable, this window uses memory settings and records a warning without modifying the document content.

<a id="section_7b46b5ce94b3"></a>
## Light and dark themes with custom colors

After installation, select **CppGithubConsoles_Light** or **CppGithubConsoles_Dark** from the theme menu. Both use the same Consolas font priority and document content formatting, with Dark using the Night style dark theme. The original theme remains available.

**Theme → Customize Colors…** or **Settings → Customize Colors** opens the same color palette, allowing you to search for color items such as document content, links, titles, workbench, terminals, etc. Enter a valid hexadecimal color value or drag the color picker to see changes immediately and save automatically; individual items or the current theme can be restored to default, with support for JSON import/export. Light and dark configurations are saved separately; after modifying the configuration of one theme, switch to that theme to observe the changes.

For manual color testing, find `cpp_github-consolas_dark.css` from **Theme → Open Theme Folder**, and the link selector is `a, a:hover, a:visited`; when the workbench is running, the default role for links is located in the source code `enhancements/src/workspace_colors.css` at `--workspace-markdown-link`, which takes precedence over theme CSS. For daily debugging, it is recommended to directly use the `markdown_link` in the color palette, without editing installation files or rebuilding. JSON saves color configurations, not the entire theme; fonts and formatting continue to be owned by the theme.

<a id="section_e6f8ab21071e"></a>
### R081 Post-Installation Operation Guide

Each standard installation generates a new installation identifier. On the next startup, a ready window automatically displays the guide once. Reinstalling the same version also prompts; duplicates across multiple windows are removed, and skipping or completing the guide prevents repetition on regular restarts. The Help menu can always be revisited and opens the offline user_guide.md. On installation failure, the rollback identifier is retained, and user windows are not closed prematurely. The design is described in [Operation Guide](onboarding.en.md).

2026-09-27 added themes `VSCode2026_Light` / `VSCode2026_Dark`, which use fixed VS Code 2026 Light / Dark color schemes, along with the Consolas font and existing formatting. Original `CppGithubConsoles_Light` / `CppGithubConsoles_Dark` and `Night` are retained. Installation does not switch the current theme; after restarting, select the new theme from the theme menu.
