[Chinese](recent_open.md)

<a id="section_00fc0924e9c3"></a>
# R059 Unified Management of Recent Files and Directories

2026-09-20: The native menu directly calls file/directory open, but missed the removal of stale history from the host, causing repeated errors for the same deleted project. This time, the two menus are merged into 'Open Recent', with directories first and files second, distinguishing by full path for projects with the same name; each group retains the host's access order. Each group can have a maximum of 10 items, 'More...' and Ctrl+R can filter and remove individual items from the complete list. 'Clear Recent Open Records...' cleans the history.

<a id="section_d84a8a344bc4"></a>
## Behavior and Failure Boundary

The display list does not access the disk item by item to avoid slowing down the menu with offline disks. When the user selects an item, the path and type are asynchronously verified; if the path is ENOENT/ENOTDIR and the root/disk root is reachable or the target type changes, the item is removed from the host's history and a non-modal prompt is shown, without calling the file open or clearing the current document. Reopening will not leave the same stale record. Permissions, I/O, timeouts, or unreachable disk roots retain the history, and the prompt allows retrying or manually removing. Read or removal failures must be visible, not fabricated as cleared. The check cannot eliminate external deletion race conditions; re-validation is required if the same missing type occurs again in open failures.

Individual removal takes effect immediately, only deleting the history index. Before clearing, confirm the scope, and use the host's removal interface snapshot at the time of confirmation to remove items, without overwriting the entire configuration or deleting items added in other windows after confirmation. Cancel zero writes; partial failures display errors and re-read the actual records. The list reads the main process's history each time it is opened or the window regains focus, without maintaining a second local storage. Opened files, workspaces, drafts, fixed directories, and settings and disk content are not part of the cleanup scope.

Directory open reuses R040.1/R040.2 directory switching and session recovery; file open reuses the file service, without implicitly cutting the parent directory into a workspace. Asynchronous verification binds the workspace version and floating layer survival, and the results of cancel, switch database, and destroy do not open files. During execution, repeated acceptance is only run once. Ctrl+R retains terminal/IME and upper modal input ownership; the list supports filtering, hit highlighting, up/down, first/last, Enter, Escape, and Tab access to the remove button.

<a id="section_9caec0eff100"></a>
## Responsibilities and Solutions

`workspace_recent_service.ts` owns the host's history reading/normalization, path validity, removal, and open transactions; the host `setting.getRecentFiles/removeRecentDocument/removeRecentFolder` is the only persistent owner. `workspace_recent.ts` adapts to common file/directory services and menus; `workspace_recent_view.ts` only owns filtering, selection, busy, and confirmation interfaces. The file command layer registers the lifecycle, and the top bar and keyboard shortcuts reuse these entry points. They share the QuickPick appearance, fixed upstream matching highlighting, workbench focus and interaction services; the main workbench layout is not changed.

The original Typora1.14.10's `frame.js` library directory failed branch calls `setting.removeRecentFolder`, and the recent file click failure calls `setting.removeRecentDocument`. This time, these already verified ports are reused, no profile.data is written, and no ASAR is modified. The complete VS Code workspace file, remote URI, multi-root, and hot exit backup are not host capabilities, so these types are not forged; Ctrl+P file search and Ctrl+R history selection are different purposes.

<a id="section_24133582b5a9"></a>
## Fixed upstream basis

VS Code1.137.0, commit `645f29cc3176500b4b5762ba887cf2a7f0ffdf2c`:

- [windowActions.ts](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/workbench/browser/actions/windowActions.ts)：BaseOpenRecentAction's directory/file grouping, matchOnDescription, sortByLabel=false, removeClose, Ctrl+R.
- [windowsMainService.ts](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/platform/windows/electron-main/windowsMainService.ts)：Path parsing failure removes recent item. This project separates permissions/offline and determines missing items separately to avoid mistakenly removing temporary unavailable resources.
- [menubar.ts](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/workbench/browser/parts/titlebar/menubarControl.ts)：Menu group and More/Clear entries. QuickPick reuses the 600px width, 22px line height and common theme/selection rules from R058 review, without estimating from screenshot zoom.

<a id="section_5f38394f7e16"></a>
## Acceptance and Impact

Unit: Real temporary paths, invalid/type change, permission/offline/time-out, cancel/iteration/repeat request, removal failure and 20/100/1000 round cleaning; history only changes when explicit operations are performed. Function: Real menu/keyboard shortcuts, grouping and order, long paths, filter highlighting, keyboard removal/clear cancellation, dynamic refresh, light/dark mode and focus restoration. System: Original host independent copy, real recent directory and file persistence removal, re-read/again selection, normal file/directory opening and keeping existing content. Regression coverage includes top bar, keyboard shortcuts, workspace switching/session, QuickOpen, file services. Execution evidence registration uses a unified test directory, not treating design clauses as passed.
