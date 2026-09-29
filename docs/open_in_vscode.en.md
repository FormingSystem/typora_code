[Chinese](open_in_vscode.md)

<a id="section_83ff170f4081"></a>
# Open in VS Code (R078)

<a id="section_1930ef2496f8"></a>
## Target and Entry

2026-09-27: The file, folder (including workspace root), file tags, and document content in Explorer provide 'Open in VS Code'. Folders are opened as directories; files pass the actual complete file path, not just start the application. Reuse the column layout of existing menus, without adding exclusive styles.

<a id="section_248787d1cd64"></a>
## Environment Discovery and Execution

Each execution discovers VS Code from the current system environment, does not save the developer's machine path, and does not rely on the upstream research copy of this repository. Check PATH first; on Windows, also read the PATH registered by the system/user and App Paths (supports installation on other disks, user installation, and system installation), locate the standard installation directory through environment variables as a backup. On Windows, the official `bin/code.cmd` jumps to the same installation directory's `Code.exe`, without going through the command interpreter to concatenate user paths. On macOS, the backup uses the system Spotlight index to query the official bundle ID; on Linux, it uses `code` in PATH.

Upstream Reference: Fixed VS Code `6807068`'s `build/win32/code.iss` registration `App Paths/code.exe` and installation directory's `bin`; `src/vs/platform/environment/node/argv.ts` defines `--reuse-window` and path parameters. This tool uses the same command semantics, independently discovers the installation, and does not share VS Code configuration.

Shared Services hold discovery, path validation, and asynchronous startup, the menu only submits the target. Parameters are passed as an array, `shell:false`, supporting Chinese, spaces, and special characters. Opening existing files with file parameters, opening directories with directory parameters; do not force reuse of windows, decided by VS Code itself. Remove inherited `ELECTRON_RUN_AS_NODE`, avoid starting VS Code as a Node process. Display actual errors on startup failure; when installation is not found, prompt to install VS Code and enable PATH, do not automatically download and install.

<a id="section_d55ab8c634c2"></a>
## Documentation and Lifecycle Boundary

Open disk version, do not automatically save unsaved edits. Drafts without disk paths are disabled, and explain that they need to be saved first. SSH resources and history/differences cache are not local original files, do not pass them to local VS Code; remote opening requires independent verification of the Remote SSH protocol. Native Markdown only appends menu items, retains native editing menu; when binding, snapshot the real file identity, and after switching documents, the expiration operation is not executed. When destroyed, revert nodes, events, and adapter packaging.

<a id="section_411474f25213"></a>
## Acceptance

Testing uses independent temporary installation tree and injected platform environment: PATH, user/machine registration, non-default installation disk, portable directory, installation after re-discovery, missing programs, files/directories, Chinese spaces and shell characters, startup errors and environment isolation. UI covers resource tree, root directory, source code menu, tags and native document menu, unsaved/remote disabled, repeated binding and destruction. External process stand-in is used to check startup parameters, not equivalent to the actual VS Code loaded acceptance; the actual installation location on Windows is read-only discovery and separately recorded. Delivery reuses standard build, isolates installation and uninstallation and native installation.

2026-09-27 icon supplement: use the original blue brand icon from fixed upstream commit's src/vs/sessions/browser/media/vscode-icon.svg, source and summary stored in enhancements/vendor/vscode_brand/SOURCE.json, license distributed with the package. Shared menus carry 16px icons in a 2em icon column; native document contributions use the same size, without modifying other native entries.

<a id="section_ae5e48db7791"></a>
## R078.1 Engineering Identity and Jump Target

All entry texts are unified as 'Open Project with VS Code'; files or directories only determine the target location.

On 2026-09-27, users corrected the previous behavior of 'selecting a directory as the workspace'. The context_root of the shared file service is the current project owner. When generating the menu, the root of the project and the target are captured. The service passes the project root and the file as two parameters to VS Code at once, and subdirectories no longer shrink the workspace. When a single file has no workspace, it uses the parent directory. When the current project root becomes invalid, an error is displayed, and it is not silently changed to a sub-project.

Opening a file directly opens the actual file; reading a directory reads the direct ordinary files, prioritizing README, and if there are others, takes the first one by name, and locates it in VS Code with the default explorer.autoReveal to that file and its parent directory. When the directory is empty or contains only subdirectories, only the original project is opened, no temporary files are generated, and no recursive scanning or false claims of the directory being selected are made. VS Code CLI does not have any public parameters for arbitrary directory selection. No extensions are injected or the user's VS Code settings are modified. When the user closes autoReveal, respect its configuration. The native menu maintains single-start, drafts are not implicitly saved, and directory reading failures feedback real errors.

Acceptance of nested directories/files always carries the same project root, README is prioritized, empty directories, root failure, and Chinese paths are considered. The native menu uses the launch parameter as a substitute, and external windows still maintain single-column acceptance boundaries. This section replaces the previous agreement on directory single-path launch.
