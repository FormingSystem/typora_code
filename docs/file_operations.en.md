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
<a id="r041-operation-audit"></a>
## R041 operation reliability audit (2026-10-26)

The user reports that confirming deletion of a project `build` folder produces no feedback and leaves it present, alongside similar failures in other actions. Reopen R041 / BUG-files-002; similar symptoms do not prove the same cause as earlier Git failures. Audit execution and failure contracts without changing layout, expanding features or deleting user data.

Typora loads static styles and resident renderer scripts. Custom UI and domain services adapt native APIs; they do not run VS Code's workbench file services. Shared icons, Monaco and upstream design references do not supply those execution guarantees.

| Stage | Audit baseline owner and protection | Gap at that time |
| --- | --- | --- |
| Selection, confirmation, busy state, feedback and refresh | `workspace_file_tree.confirm_trash/run/reveal` | Acceptance sets a local flag without deletion progress; errors use the tree status line and navigation clears it; obsolete branches can return without structured cancellation |
| Exclusion and drafts | `workspace_files.file_operation/trash_entries` provide domain exclusion, draft checks and model cleanup | No subscribable identity, target, phase or outcome; unlike transfer, trash lacks a current-workspace entry check and needs service-boundary verification |
| Paths and batch execution | `trash_workspace_entries` checks boundaries/identity, deduplicates parents/children and reports completed paths | No end-to-end cancellation/progress contract; disk success followed by editor-cleanup failure needs a distinct result |
| Native trash | `trash_native_path` invokes `JSBridge.invoke("shell.trashItem")`, rejects false/errors and checks disappearance | Pending bridge replies have no phase notification or unknown-outcome state; Promise timeout is not native cancellation |
| Cross-domain feedback | Git has token-based `git_operation_progress`; updates have task feedback | File deletion still uses local booleans/text; layering exists but observable outcomes lack a consistent contract |

The pinned development snapshot `68070681e87284e2f22728f15fe3f3651fbf932b` was inspected: [fileActions.ts](https://github.com/microsoft/vscode/blob/68070681e87284e2f22728f15fe3f3651fbf932b/src/vs/workbench/contrib/files/browser/fileActions.ts), [explorerService.ts](https://github.com/microsoft/vscode/blob/68070681e87284e2f22728f15fe3f3651fbf932b/src/vs/workbench/contrib/files/browser/explorerService.ts), and [diskFileSystemProviderServer.ts](https://github.com/microsoft/vscode/blob/68070681e87284e2f22728f15fe3f3651fbf932b/src/vs/platform/files/electron-main/diskFileSystemProviderServer.ts). VS Code connects target/draft/read-only confirmation, bulk edits, progress, cancellation tokens and errors. Explorer progress is delayed 500ms; multi-item edits can request cancellation. Its main process also uses Electron `shell.trashItem`; this is not an infallible alternative API, nor proof that individual native recycling is interruptible.

The audit established this contract: the file service owns operation/workspace/provider identity, target snapshots, preparation/execution/verification/refresh phases and outcomes. UI invokes and subscribes; hiding it must not discard business state. Share feedback contracts while retaining domain ownership, without a global workbench lock. Separate operation errors from tree loading messages. Represent rejection, cancellation, partial completion and unknown results; refresh failures must not replace execution errors. Revalidate ownership after confirmation and before execution. Cancellation stops subsequent items. Reconcile unacknowledged native calls rather than unlocking and retrying on timeout. Display real phases/known totals only; preserve drafts and user windows, with no automatic permanent deletion. Wiring was pending at the audit commit; current implementation and verification follow below.

Reuse Explorer, file-service and native stability fixtures for real confirmation input, host invocation, disk verification, refresh and a second operation. Cover slow/pending replies, failure, duplicate acceptance, cancellation, partial completion, workspace changes, hiding/disposal, error retention and editor cleanup failure. Use temporary build-like directories with 20/100/1000 children, occupied files, Unicode/long paths and slow providers; distinguish workloads from iterations/assertions. Immediate-success rename substitutes and previous short-path native tests do not establish large-directory reliability.

See [audit evidence](../enhancements/tests/evidence/file_operation_audit_20261026.json). Controlled providers demonstrate feedback gaps, not the user's native failure. Product repair and installation were pending at that stage; current delivery follows below. The incident's direct cause remains unknown, and previous R041 results do not close this recurrence.

### R041 implementation and verification

On 2026-10-26 the user explicitly requested repair, verification and a remote push. `workspace_file_operation` replaces the file service's exclusion counter, owning task identity, root/workspace generation, target snapshots, phases, errors and recycled paths. Existing create, move, rename, history and clipboard calls share this owner. Deletion rechecks generation and drafts before each write, records recycling before editor cleanup, and preserves disk completion if cleanup fails.

The tree subscribes and reuses shared progress drawing. Its status area keeps existing dimensions but allows long errors to scroll. After five seconds without a recycling reply, the label explicitly reports an unknown outcome; this product diagnostic threshold does not come from VS Code. It neither cancels the native call nor unlocks/retries it. Multi-target cancellation stops subsequent items after the current reply; refresh has no ineffective cancel action. Acceptance registers work before closing the dialog.

Errors are service-owned and survive reveal, refresh and panel hiding/reopening. A new task replaces the last result. Disposable refresh subscriptions join the final task phase; execution errors are visible before awaiting refresh, and refresh failures append without replacing them. Workspace switching and disposal reject unfinished writes; stale roots are refused. Controls share service busy state; disposal removes subscriptions and waiting timers. No second file model or cross-domain global lock is introduced.

Scope is the reproduced feedback/lifecycle gaps. Permission, file-lock and native refusal failures must be reported accurately, without permanent deletion or bypassing protection. Final implementation, native verification and delivery/push status require current delivery evidence, not the earlier audit record.

The final core check, four UI suites, 391 native assertions and isolated install/uninstall checks passed. The workbench is installed locally; user windows need a normal restart, and the outer Directory-menu ownership conflict is preserved. Main-process recycling explicitly invalidates shared directory caches; native acceptance waits for both disk results and rendered row removal. See the [delivery evidence](../enhancements/tests/evidence/file_operation_delivery_20261026.json) for current results, corrected development failures and remaining limits.

<a id="r041-permanent-delete"></a>
### R041 explicit permanent deletion after recycling fails (2026-10-26)

The user clarified that VS Code first recycles, then asks separately before permanent deletion, and requested the downloaded source as the implementation reference. Pinned commit 6807068, `fileActions.ts:226-250`, changes `useTrash` only after that confirmation; `diskFileSystemProviderServer.ts` still uses Electron recycling. Isolated Typora and installed VS Code both fail on long descendant paths, while short folders, read-only files and dangling junctions recycle individually. The reported tree contains 587 paths longer than 260 characters, but it has not been deleted for diagnosis; other incident-specific factors are not excluded.

Explorer continues to recycle by default. Only a classified native recycling failure offers a separate permanent-delete dialog with remaining targets, irreversible consequences and Cancel initially focused. Pending replies, validation/draft protection, editor cleanup and refresh errors do not offer this path. Cancel/close retains the error and performs no further writes. The native no-warning preference cannot bypass this confirmation. This supersedes the previous absence of a permanent-delete entry, without permitting automatic fallback.

Before the second confirmation, the file service captures target identities and workspace generation in a single-use execution request. Execution rechecks ownership, identity, drafts and exclusion. Recycling and permanent deletion share deduplication, boundary checks, item progress, completed paths, editor cleanup and cache invalidation. Permanent deletion awaits asynchronous fs.rm with maxRetries=3 and retryDelay=100ms instead of upstream detached rename-and-remove cleanup. Filesystem APIs handle long paths without shell-built commands or host/system changes. Nested junction targets are not traversed. Partial irreversible results are reported. Git recycling and remote providers do not acquire this option.

Tests cover long paths, read-only objects, dangling/live junctions with external target preservation, cancellation, duplicate acceptance, replacement, root changes, drafts, partial completion and real input. Compare the installed VS Code using isolated directories and distinguish recycling from permanent deletion. Standard local installation and isolated uninstall/reinstall remain required; current evidence determines delivery status.

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

## R028.1 Dismissing inline rename outside its input (2026-10-02)

Double-click rename only handled Enter/Escape, leaving the input active after clicking unrelated controls. Register the input with the shared dismissal owner. Outside pointer input cancels the draft without swallowing the destination action; focus departure, window blur and panel hiding also cancel. Inside clicks keep editing. Escape returns focus to the tree, while outside cancellation does not steal focus. Preserve R028's cancel-without-writing contract; Enter alone submits the existing rename/create transaction and IME composition does not submit. An already started write retains its original completion/error ownership.

The file tree owns the edit and registration; workspace_focus owns shared listeners. Release on completion, root change, hiding and disposal. Cancelling creation removes its placeholder; failures remain retryable. Pinned 6807068 explorerViewer.ts BLUR/onFinish provides the lifecycle reference. Its valid-input blur submission is deliberately not adopted because this project already specifies cancellation.

Reproduce using trusted Chromium clicks on a control that prevents focus transfer; verify one destination action, no rename, inside clicks, editor/blank targets, Escape/Enter, conflicts, create cancellation, hiding and disposal. Verify the native outline entry on isolated documents and regress shared dismissal, file operations and workspace changes, followed by the same-candidate install/uninstall lifecycle.

## R028.2 Preserve Explorer position when switching adjacent files (2026-10-03)

Clicking a row already selects it, but active-leaf:change/file:open then called reveal, which unconditionally centered the target and walked the expansion/rebuild path. Adjacent visible files therefore moved under the pointer.

Automatic following should scroll only when a row is not fully visible, retaining nodes, expansion and scroll position. The explicit locate-current-file action keeps its centering intent. File opening, preview tabs, rename, multiselection, persistence and directory refresh semantics stay with their existing owners.

workspace_explorer passes automatic intent; workspace_file_tree owns selection, virtualization and positioning. Known flattened targets synchronize selection directly without directory reads or rebuilding; repeated same-target events do not repaint. Collapsed targets retain lazy expansion. Per-request identity prevents stale reveals from replacing newer requests, in addition to root/disposal generation checks. Queued frames stop after hiding. No new setting, observer, polling or global refresh.

Baseline: pinned VS Code 6807068, src/vs/workbench/contrib/files/browser/views/explorerView.ts selectResource only calls tree.reveal(item,0.5) when getRelativeTop(item) is null. Adopt its visible-row stability and selection/reveal separation while retaining explicit centering.

Validate real Chromium pointer input plus document events, per-frame scroll/row geometry/node identity/reads/expansion during 20 adjacent switches, duplicate events, offscreen and explicit reveal, stale requests, editor focus and 2000-row virtualization. Original Typora uses an isolated corpus and trusted input, with input/open/frame and settling measurements. Record pressure/platform limits separately and deliver the same candidate through build/check, isolated uninstall cycles and local installation.
<a id="explorer-drag-drop"></a>
## R002.1 Explorer drag and drop (2026-10-07)

Connect in-tree file and folder dragging to the existing shared transfer transaction. Dragging a selected row carries the selection; an unselected row carries only itself. Selected descendants are deduplicated. Folders receive entries, files resolve to their parent, and the root header or tree background resolve to the workspace root. Ctrl copies on Windows/Linux; otherwise the gesture moves. Existing sort order remains. Cross-window moves and external system drops are outside this change.

The pinned VS Code 68070681e87284e2f22728f15fe3f3651fbf932b FileDragAndDrop in explorerViewer.ts supplies target resolution, distinct parents and invalid destination rules. abstractTree.ts supplies the 500ms expansion delay. Highlighting uses the existing list.dropBackground token. Upstream enableDragAndDrop and confirmDragAndDrop default to true; this project retains direct drag execution without another confirmation, rejects name collisions as a batch and does not adopt overwrite prompts or automatic copy renaming.

The tree owns the drag session, feedback and bounded expansion/scroll tasks. The file service owns transfer_workspace_entries and move_file, preserving document models, drafts and path notifications. Drag data identifies only this tree session, never arbitrary external paths. Revalidate root, nodes and busy state at drop; the service validates real paths, links and collisions again. Errors refresh actual state and retain the existing partial rollback diagnostics. Cancel, drag end, leaving, hiding, root changes and disposal clean up feedback and pending tasks. Hover expands without opening a document; drop stops duplicate host handling. Scrolling adopts listView.ts's 35px edge zone and maximum 14px step per animation frame. The virtual tree retains the drag source until the gesture ends.

Acceptance covers temporary filesystem moves/copies, multiselection, parent deduplication, collision/link/descendant/no-op rejection, clipboard preservation, hover expansion, edge scrolling, cancellation, stale roots and duplicate drops. DOM event coverage and trusted mouse/native host evidence are reported separately. Existing document relocation tests cover drafts, model identity and subsequent save paths. Build, installation and uninstall evidence remain separate; no untested platform or external drop support is claimed.

<a id="file-operation-undo"></a>
## R002.2 File move undo and redo (2026-10-07)

Explorer previously executed moves without recording file transactions; Ctrl+Z was not reassigned. Drag moves, cut/paste and renames now share one undo owner. With tree focus, Ctrl+Z undoes and Ctrl+Y or Ctrl+Shift+Z redoes; context menu actions use the same entry. Inputs, Markdown, Monaco and terminals retain their own content undo. Drag completion retains tree focus; replay refreshes and reveals the resulting paths.

The pinned VS Code commit 68070681e87284e2f22728f15fe3f3651fbf932b routes UndoCommand/RedoCommand in files.contribution.ts by Explorer focus to UNDO_REDO_SOURCE. RenameOperation in bulkFileEdits.ts reverses resource paths through workingCopyFileService. This implementation adopts focus ownership, one history item per batch and existing document relocation, without importing the full BulkEdit platform.

The file service owns at most 100 in-memory batches for the current window/workspace. Its existing move adapter retains document identity, drafts, navigation and save paths. Successful steps are tracked; a fully rolled-back transfer adds no history, while remaining partial changes can be undone. Replay preflights the entire batch and refuses missing sources, collisions, links or boundary violations. A mid-batch failure rolls completed steps back; rollback failure clears uncertain history and lists affected paths. Replay moves the current resource and contents, not old document text; there is no cross-process identity lock.

A new move clears redo. Workspace switches, disposal and unsupported disk mutations clear history. Undo for copies, creation, trash deletion and cross-window/restart history is outside this change and must not be presented as supported. Empty history reports a status instead of undoing the background editor. Busy/repeated requests cannot race filesystem writes.

Use isolated directories for single/multiple files, folders, drag/cut/rename, repeated undo/redo, collisions/missing paths/links, execution and rollback failures, workspace/disposal invalidation, new-edit branching and 20/100/1000 transactions. Verify native Markdown/source drafts and subsequent saves. Distinguish trusted Electron input from native DOM events and record local install, isolated uninstall and loaded-window status separately.

## R028.3 Sticky parent folders (2026-10-25)

Expanded ancestors remain at the top of a scrolled file tree so users can collapse them directly. Each ancestor leaves when its subtree ends. Unrelated siblings and flat search results are excluded; existing sections and activation semantics remain unchanged.

The reference is VS Code commit `68070681e87284e2f22728f15fe3f3651fbf932b`, `listService.ts` and `abstractTree.ts`: enabled by default, at most seven rows and 40% of the viewport. Keep the established 26px project row height, indentation and shared colors. Move each original row between the normal and sticky layers, preserving identity, selection, context actions and drag behavior without duplicating business state.

The shared file tree owns expansion and nodes. Model rebuilding caches display parents and subtree bounds; scrolling examines only the visible ancestor chain within the existing animation frame. Compact folders use display ancestry. Keyboard/reveal account for occlusion and collapsed sticky folders stay visible. Loading failures, cancellation, root changes, hiding and disposal retain existing ownership without new reads or observers.

Extend Explorer checks for nested/sibling boundaries, direct collapse, keyboard, light/dark, zoom/narrow layouts, 1000 children, repeated scrolling, refresh/root changes, compact folders and the shared selector. Record native host acceptance separately. Use standard isolated install/uninstall/rollback tests and read-only user uninstall preflight. Other platforms and user windows awaiting restart remain explicit limits.


Environment boundary: compact folders are currently inactive in the runtime; this change does not enable them or claim compact-mode acceptance. Ancestors use display hierarchy. The native runner admits the pinned 1.14.15 ASAR only for this Explorer fixture; other fixtures retain their original host gate.
