[Chinese](file_operations.md)

<a id="section_f011aadce4d5"></a>
# File operations and resource manager

<a id="section_ee98cca2ce18"></a>
## Unified entry

Opening files and folders by `workspace_open_dialog` calls Typora's `dialog.showOpenDialog`. The top file menu, Ctrl+O, Alt+K Alt+O, and the resource manager button share this entry, displaying a system file/folder selection window. Cancel without changing the document, directory, or unsaved content; only one selection window can be open at a time. After file selection, the existing file route is followed. Markdown uses the native editor, and other text uses the source code editor.

Selecting a folder switches the workspace as per the following R040.1. The old convention of 'only changing the mounted directory and preserving the current document' has been replaced by user feedback on 2026-09-19. Each panel reads the same host directory and updates it, without saving a second directory state. When a window is being opened, after the workbench is uninstalled, it returns the result without modifying the state.

<a id="section_f2a513a39c41"></a>
## File management

The top menu and keyboard shortcuts are registered by `workspace_file_commands`, continuing to retain Typora's new, native Markdown save, import, export, print, and preference settings. Shared commands add save all, code save as, reload and close directory, and existing functions are not redone because of the menu unification. Overall responsibilities see [Workbench architecture](workspace_architecture.en.md).

| Entry | Action |
| --- | --- |
| Ctrl+O／Alt+K Alt+O | System file/folder selection |
| Ctrl+S／Alt+K S | Save current document/all documents |
| Ctrl+Shift+S | System save as window; Markdown uses native save, code retains encoding, BOM, and line endings |
| Reload from Disk | Confirm when there is unsaved content for code, cancel and retain draft; native documents call host operations |
| Ctrl+W／Ctrl+F4 | Close active tab, share existing draft check |
| Alt+K F | Protect unsaved content before closing current workspace, clear associated tabs and context |

Code save as retains the same Monaco model and undo record, successfully saves baseline following new path; source file remains unchanged. Target is rejected if it is already open in another tab. Existing target undergoes conflict check, new target uses complete temporary file and hard link without overwriting target; file systems that do not support hard links report failure and retain draft. Do not write files when canceling selection or during selection, if the active document changes.

VS Code's multi-root workspaces, `.code-workspace` import/saving, configuring new window and extension sharing are not integrated, and are not disguised as available with actionless menus.

Resource manager menu provides actual operations based on selected file or folder:

| Action | behavior |
| --- | --- |
| New file/folder | Enter a name in the selected folder; use the parent directory of the selected file |
| Display in the system resource manager | Use the system location interface to display the selected item |
| Open in Integrated Terminal | Use the selected directory; use the parent directory of the selected file |
| Search in folder | Limit the search to this directory, support real directory names containing `[]` and `{}`, do not treat the path as a glob; the search panel can clear the range |
| Cut, copy, paste | Access system file list; cut and reuse documents in the workspace, copy and preserve source files from external sources; current acceptance boundary see below R009 |
| Rename, delete | Double-click a selected file, or use F2 or menu to rename; folders use F2 or menu; deleted files are moved to the trash after confirmation |
| Copy path / relative path | Copy system absolute path or current root directory relative path separately |
| Select to compare / compare with selected item | Read current content of two files; content of open source code that is unsaved is included in the comparison, disk content is not modified |

The menu does not directly modify the disk. `workspace_files` manages saving, drafts, file model, and write operations; search service manages search scope and cancel; Git diff editor is responsible for comparison presentation. Right-click menu only organizes available actions, and after switching directories, the old menu cannot continue to operate the old selection.

<a id="section_b477b2b2f83e"></a>
## Indentation basis

Fixed reference is VS Code 1.136.2's commit `88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f`. Use 8px hierarchy indentation from [listService.ts](https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/platform/list/browser/listService.ts), and remove the empty expanded slot of file rows according to the no-folder-icon rule in [views.css](https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/browser/parts/views/media/views.css). Seti file glyphs remain 16px, original line height is preserved.

<a id="section_a638483610fb"></a>
## Verification

`test_workspace_startup.cjs` covers production binding, all open entry points, selected result routing, canceling saved drafts, native directory changes, real menu new and unsaved source code comparison. `test_workspace_explorer.cjs` covers hierarchy geometry, new, copy/move, conflict, rename, trash callback and uninstall. `test_workspace_search.mjs` covers special character directory scope and rejection outside the root directory. Real disk encoding of 'save as', mixed line breaks, subsequent save baseline, target competition and failure clearance are verified by `test_workspace_text_document.mjs`. System choice cancellation and model preservation are verified by `test_workspace_file_editing.cjs`.

2026-09-12 Also confirmed in isolated native Typora 1.14.9 that the system file and folder selection window actually appears, and after cancellation, the original document and mounted directory remain unchanged. The routing of the system window selection results is covered by the above production binding fixture; this record does not represent the completion of physical mouse acceptance item by item.

<a id="section_49d72d299fe3"></a>
## R009 System file clipboard

2026-09-13, connect system file list with resource manager copy/paste, preserve original cut and document transactions in the workspace. Windows exchanges multiple files/folders through native `CF_HDROP`, Linux exchanges through file URI list, and the main text path and file list are separated. Windows uses system PowerShell's STA clipboard adapter, fixed programs receive JSON through standard input, paths do not enter executable commands; does not rely on additional installation of PowerShell7. Linux provides clipboard through host Electron, native desktop interoperability still requires corresponding platform testing.

Fix the [NativeClipboardService](https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/services/clipboard/electron-browser/clipboardService.ts) for [VS Code commit `88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f`] to `code/file-list` save resources, [fileActions.ts](https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/contrib/files/browser/fileActions.ts)'s `pasteShouldMove` belongs to the current window file operations. Here, the same responsibility division is adopted, and the system file format is used to meet cross-application exchange. The Windows format is based on [Microsoft Shell Clipboard Documentation](https://learn.microsoft.com/en-us/windows/win32/shell/clipboard), and the string path is not treated as a file.

`workspace_file_clipboard` is the sole owner of the file cut action. The platform adapter only reads and writes the file list and version. The intent of cutting is bound to the version, source directory, and original path upon writing. Other applications rewrite the clipboard after the old intent becomes invalid, and cannot treat later copied files as pending move items. Only when the current window, same workspace, and version match, the cut execution moves the file. Cross-window/system sources use copy and retain the source. The file list sent externally also uses the copy effect to avoid external applications moving the currently edited file while bypassing the document transaction. When users paste external cut lists, it prompts 'source file retained', and does not impersonate the cross-application cut delete protocol.

File copying is stored in the selected directory. External paths become the source entry only when the user pastes; the source directory and target workspace are separately checked, but still reject symbolic links, devices, relative paths, and directory copying into itself. The entire batch is pre-checked for name conflicts, and defaults to rejecting overwrite. If it fails, it only rolls back the creation of the current batch and the identity remains unchanged. It does not recursively delete external newly added content. Copy disk bytes, and do not automatically save unsaved documents; internal moving still goes through the original rename transaction to retain the model, tag path, and draft. Cutting is canceled locally after successfully pasting in the current window. Windows checks the version and clears it when holding the clipboard lock; Linux's Electron interface does not provide atomic version checking and clearing, so it retains the system file list, cancels the local intent, and avoids mistakenly clearing other applications' new copies. Subsequent pastes are checked according to the new file source. The old path of already moved files will not be considered as still valid cuts.

The UI only displays the service's cut mark and calls copy/paste actions. Keyboard shortcuts are limited to the resource manager focus, and the main text editor retains the native text clipboard. Read failures, clipboard lock, empty file list, and target conflicts display clear errors; asynchronous read returns when the root or target changes or the interface is destroyed, stop writing. During file operations, the owner cannot be uninstalled, and after completion, refresh the current tree; cancel or failure does not discard the original file and draft. After the host loses focus and regains focus, refresh the cut mark, and do not continuously poll the clipboard. Success or failure of refresh can only cancel the cut intent started at the beginning of the request. Old requests cannot cancel new cuts established later. Platform write returns a snapshot of this write: Windows reads it before releasing the lock; Linux calculates the version based on the unique identifier and content of the write; after writing, it does not read the system clipboard again to claim other applications' versions.

Acceptance covers real system format read/write, Chinese/Space/multiple files/folders, binary, external copy-in and reverse read, internal cut, external cut preserves source, re-copy cancels old intent, same name rejection and failure rollback, root change/uninstall cancellation, document focus and draft preservation. System clipboard real test uses an independent Windows window station, whose clipboard is independent of the user's current desktop; the rest of the platforms explicitly record that it has not been tested, and cannot extrapolate results from Windows.

<a id="section_4ec1e27dd46e"></a>
### This round acceptance boundary

File operation engine, clipboard version and asynchronous lifecycle, real resource manager keyboard/menu wiring and document host have passed this round regression. Copy preserves disk UTF-16 and binary bytes, does not save draft; internal cut preserves model, undo record, encoding and subsequent save path. Windows PowerShell 5.1 has been compiled with complete native adapter.

Real Windows clipboard exchange still needs isolation testing, and cannot treat the UI of the port substitute as system interoperability through. Independent launcher is `enhancements/scripts/run_file_clipboard_windows.ps1`, runs in administrator PowerShell; it only creates a new named window station, and the child process confirms the window station identity before reading and writing the test clipboard, releases resources after exit, and does not take over existing window stations. Permissions come from [Windows CreateWindowStation](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-createwindowstationw), ordinary users cannot specify a new window station name. This permission is only for isolation testing, and normal file clipboard use does not require administrator. Linux file URI adapter has not been verified through native desktop interoperability.


<a id="section_72e88d841899"></a>
## R028 File line single click, double click and loading feedback

2026-09-13: User feedback that file group search can only click the arrow to fold, resource manager continuous clicks occasionally respond slowly, and users require that selected items can be renamed on double click. Subsequently, on the same day, users corrected the behavior of the folder: folders do not use double-click renaming, single-click only switches the expand state. This section is based on this correction; selected files double-click renaming and search result double-click opening are still retained.

The arrow, file icon, name, path, and inline blank of the search file group all belong to the same expand/fold target; the remove button is independent. Single click immediately switches once, while preserving the name line selection and the preview positioning below; matching lines still only select/preview, double click or Enter opens; file group double click restores the switch state before the gesture, then remembers the matching. Group supports Space, left/right arrow keys, and button keyboard operations, which should not bubble into another action.

The arrow, name, and inline blank of the resource manager directory single click immediately expand/fold, including selected directories; continuous fast clicks switch sequentially, and do not discard due to the browser marking the second click as a double-click sequence. Directories do not participate in the double-click rename determination, and do not save or restore the expand state before double-click; folders are renamed through F2 or right-click menu. During reading, it can be folded again, and the same request is reused upon reopening. Stale results cannot be expanded again. Files remain single-click open; selected files on the next double-click enter inline renaming; unselected files' first double-click only opens once. Modifier key multi-select, drag, rename input, right-click, and independent operation buttons do not trigger directory switch. Using the browser's file double-click sequence, do not query system thresholds or add a wait timer to single-click. Esc/focus loss cancels renaming without writing to disk, Enter continues shared renaming transaction and conflict protection.

This verification of VS Code 1.137.0 fixed commit `645f29cc3176500b4b5762ba887cf2a7f0ffdf2c`：[Tree pointer handling](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/base/browser/ui/tree/abstractTree.ts#L2525) switches foldable nodes on each pointer click; [Explorer configuration and opening handling](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/workbench/contrib/files/browser/views/explorerView.ts#L564) allows full row expansion by default, directories do not enter file opening paths; [Expansion mode configuration](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/platform/list/browser/listService.ts#L1478) defaults to `singleClick`. Adopting this directory interaction strategy; no new settings items or changes to file opening conventions are added. The original implementation discarded all `detail >= 2` clicks, and then restored the expansion state upon directory double-click, which are the two reasons why quick clicks seem to fail.

`workspace_search` still has grouping and hit selection. `workspace_explorer` has directory nodes, unique expansion state, and request; visible rows reuse nodes based on their identity, only updating attributes and actual changes in child content, recycling off-screen nodes when scrolling, avoiding expansion/monitoring refresh replacing the node under the mouse while losing double-click. Each request's directory level reading is completed and displayed; request animation frame merging updates, no longer causing drawing delay due to continuous cancellation of reflow. Switching root directory/destroying discards old results; stopping monitoring when hidden, reading completion does not re-open sidebar or fold directory. File writing continues to be handled by existing services, new interactions do not directly execute disk renaming.

Acceptance uses real Chromium mouse sequences to check arrow/text/blank single clicks, removal of isolation, quick consecutive clicks on selected and unselected folders, next frame feedback for each click, file double-click renaming and directory double-click not renaming, modifier keys, input cancellation, loading state switch, and no duplicate reading; check slow directories, normal multi-level directories, refresh, 2000 virtual list items, light and dark themes, 220px narrow column and 100%/125% page zoom. Regression on search repeated positioning, Markdown/source code preview and opening, Explorer F2/keyboard/conflict/draft protection, and in isolation check Typora's actual host layout and entry. Test evidence and delivery status are written into feedback records, not following the old numbers.

<a id="section_bbc6321c1812"></a>
## 2026-09-19 R040 R041 R042 Refresh and host operations

R040: After File.setMountFolder, the library.onRootChanged in frame.js of Typora 1.14.10 calls setting.addRecentFolder. The local set_folder only calls the former, causing historical loss. After successful execution, it waits for the native history to be written, without establishing a separate storage for recent directories. The workspace switching behavior is replaced by subsequent R040.1. Canceling or failure does not write, and explicit reporting of 'already open but history not updated' is made when history writing fails. The menu reads the latest record from the main process each time it is opened and displays the full path hint.

R041: In the same version, the library deletion uses the boolean return of JSBridge.invoke("shell.trashItem", path). The Electron shell in the renderer process and the main process capabilities should not be confused. The file and Git share a stateless native trash adapter. When there is a bridge, it is called only once; false/exception rejection, no further attempts at recycling or permanent deletion. In independent Electron runtime environments without a bridge, shell.trashItem is used, and after completion, the target is verified to have disappeared. Path/draft and batch parts that fail continue to be managed by the file/Git services. UI lock confirmation prevents reentrancy and accurately reports failures. Ordinary actions do not require general execution confirmation. The trash confirmation still retains the semantics of already verified destructive operations, with zero writing. Actual cross-account permissions still need to be verified on the corresponding host, and cannot be bypassed through permission fixes.

R042: After successful file transactions, the model is re-recognized with the new path and the first line for shared Monaco model language, preserving the same model, undo, format, and dirty status. Non-Markdown files that become Markdown use the existing reopen_leaf default native entry for the clean tag. The dirty source code retains the editing and Markdown highlighting, and switches after successful saving and without further editing, without silent saving or discarding drafts. Explicitly opened Markdown source code does not force a switch even if the .md file is renamed to .md. Multiple copies and background tags maintain group affiliation, without competing for active focus. Failed cases retain editable source code and display the reason. Icons/outline/breadcrumbs and search use existing renaming events and model language notifications.

Acceptance: TC-files corresponds to system selection, cancellation/lateness, duplicate history, native bridge true/false/throw/interface missing/fake success, temporary file recycling, suffix change clean/dirty and subsequent saving, multiple copies/directory renaming and file protection.

R041 deletion confirmation reads the existing File.option.noWarnigForDeleteFile in the host, respecting the user's effective configuration for canceling deletion warnings. When not set, it retains one accurate target confirmation, without establishing a second set of preferences. Confirmation and non-confirmation share the same execution/marshaling/error/refresh entry.
