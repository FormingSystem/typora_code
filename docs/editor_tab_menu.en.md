[Chinese](editor_tab_menu.md)

<a id="section_ef2d55e770d3"></a>
# Document tab right-click menu

<a id="section_f187cb52507a"></a>
## R030: Target and reference

On 2026-09-13, the user requested a VS Code-style context menu for open document tabs. Commands act on the right-clicked tab and its group; opening the menu does not activate a background tab. The previous split-view implementation that closed a tab, waited 167ms, and reopened it has been removed. The file service owns document state.

Fixed reference to VS Code 1.137.0, commit `645f29cc3176500b4b5762ba887cf2a7f0ffdf2c`:

- [Tab menu and split view submenu](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/workbench/browser/parts/editor/editor.contribution.ts#L394): Close, copy, preview, pin, and split view grouping; conditions available are derived from the target editor.
- [Close command](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/workbench/browser/parts/editor/editorCommands.ts#L853): Batch close non-sticky tabs; explicitly closing a single tab allows closing pinned items.
- [File actions](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/workbench/contrib/files/browser/fileActions.contribution.ts#L163): Copy path, save, and locate in Explorer are displayed based on the actual file capabilities.

<a id="section_7bc211fa1752"></a>
## Usage

Right-click on a tab of an already opened document. The menu is always targeted at that tab, and background tabs will not switch to the document content merely by right-clicking; grayed-out items indicate that the current document or editing group does not support the operation.

| Menu | Action |
| --- | --- |
| Close tab / Other / Right / Saved / All | Close within the group the tab is in; unsaved documents are handled by saving or canceling first; batch closing retains pinned items |
| Copy absolute path / relative path / breadcrumbs path | Copy the full file path, the path relative to the open directory, and the path separated by hierarchy levels respectively |
| Open preview / Reopen method | Markdown can switch back to native reading or source code editing; save or cancel first if unsaved |
| Show in system file manager / Show in Explorer | Locate the file in the operating system and workbench sidebar respectively |
| Keep open | End temporary preview state, retain regular tab |
| Pin / Unpin | Pin to the beginning of the group; the pin icon occupies the original close button position, clicking the icon unpins it, but right-clicking 'Close Tab' still allows closing |
| Split to right / Split to | Create a copy to the right, left, above, or below; source editors in the same window share the current draft. |
| Move to | Move the original tab to an existing adjacent editing group; disabled when there is no adjacent group |
| Move to new window / Copy to new window | Transfer using an existing document, the former removes the source after confirmation of receipt, the latter retains the source |

Windows shortcuts: `Alt+K` then press `U` to close saved, press `W` to close all, press `Enter` to keep open, press `Shift+Enter` to pin/unpin, press `O` to copy to new window. `Alt+\` split to the right, `Alt+K` then press `Alt+\` split downward; `Shift+Alt+R` locate in the system file manager. Shortcuts apply to the current tab, menus apply to the right-click target.

<a id="section_5e0f05c3fc2b"></a>
## Interaction and Status

Close, close others, close right, close saved, close all only apply to the target group. Batch closing pinned items is excluded; individually wait for unsaved dialog, cancel or save failure stops subsequent closing. Close saved performs another check of dirty status before execution. Asynchronous actions recheck leaf identity and group membership, do not delete another tab based on path.

Path groups provide absolute paths, relative paths, and breadcrumb paths; file location enters the system file manager and workbench explorer respectively. Markdown provides native preview reading and a Markdown/source code editor selection for 'reopen with'. Save or cancel unsaved content before switching editing modes; cannot replace draft with disk content.

'Keep open' ends temporary preview status; 'pin' keeps the tab at the top of the group and excludes it from batch closing, both are independent. Pinned status is held by the leaf state and saved with the existing layout. Split copy to a new group in the specified direction; 'move to' only enters existing adjacent groups. Source code split shares the same text model, save baseline, and formatting, cursor/scroll position is independent per view; move retains the original leaf and undo stack. Save or save as updates the status and path of all copies, only closing the last copy releases the model. Native Markdown editor and split reading view read the same in-memory document content, editing events update the preview, no forced write to disk for split views.

Move/copy to new window reuses the verified document transfer channel. Only move releases the original tab after confirmation and recheck of the source; copy retains the original tab. Failure, cancellation, and timeout retain the source, do not write temporary content.

Native Markdown save waits for the actual result of `File.saveUseNode`; when switching paths, still wait for the target file to load, reactivating an already loaded same document does not wait and does not trigger loading events again. Named documents that abandon modifications call the host to reload the saved content; unnamed native drafts currently only provide save/cancel, do not fabricate a clean state.

This round covers document operations. Share, Chat/Codex, language service references, etc., extension providers do not have equivalent host services, do not add invalid menu items; retain as differences in extension capabilities. Virtual, read-only, or unnamed documents disable unsupported file actions based on actual capabilities.

<a id="section_90d41f79a053"></a>
## Responsibilities and Presentation

Workbench editing action service owns target parsing, batch operations, and commands; menus only organize groups and disable states based on service capabilities. File service owns content and save, core layout provides adjacent split views and leaf movement, cross-window modules own transfer lifecycle. Remove old tab menu and its temporary patches, retain existing path actions of native file menus.

Menus reuse public workspace_menu: rounded corners, themes, shortcut key columns, disabled states, arrow keys, submenu flipping, scroll within window height. Tab size maintains existing baseline. Event resources for right-click target, window destruction, and menu closure are all cleaned up according to binding lifecycle.

<a id="section_ba88d9c1142e"></a>
## Acceptance

Cover background tab targets, disable conditions for single/first/last tabs, group isolation, fixed sorting, and batch retention; saving/canceling/failing of source code and Markdown; co-student split view sharing drafts and undo, adjacent movement; new window copy not release and move confirmation; long Chinese paths, light/dark mode, narrow windows, scaling, keyboard and menu boundaries. Build and check pass status, target UI, and isolation native host evidence are uniformly recorded in [Feedback Review Records](feedback_review.en.md#section_b374c89f7442). Electron covers real Chromium pointers and keyboards, native Typora checks use isolated documents, host APIs, and DOM actions, and the two are not mixed for physical device manual acceptance.

<a id="section_ef2ba0fb20b4"></a>
## R080: Explorer Preview and Persistent Open (2026-09-27)

The issue is that single-clicking the resource tree does not pass the existing preview intent, causing each read to leave a persistent document. By default, single-clicking a file immediately displays the complete native Markdown or source code in the main editing area, with only one replaceable preview tab retained per group; single-clicking another file replaces that preview, and after editing, it automatically remains open. Preview filenames use italics (fixed upstream singleeditortabscontrol.css preview title semantics), and persistent tabs revert to normal font. Alt+left click explicitly opens as persistent, and existing persistent files only activate, not demoted to preview. Closing 'Enable Preview Editor' still respects user settings, and normal clicks also persist. No limit on the number of persistent tabs or file size.

Fixed VS Code 6807068: `platform/list/browser/listService.ts` single-click pinned=false, double-click pinned=true, `contrib/files/browser/views/explorerView.ts` pass editor options, `browser/parts/editor/editorGroupView.ts` retain based on enablePreview/dirty/pinned, `common/editor/editorGroupModel.ts` hold preview identity per group. Use its preview lifecycle; this product changes Alt+left click to persistent, retaining existing directory expansion, Ctrl/Shift multi-select, F2, and double-click rename of selected files, double-clicking/tabs or 'keep open' still can be persistent. This authorization overrides the old frozen preview tab limits, without expanding sidebar layout.

The tree only submits preview intent, workspace_files manages each group's preview and editing promotion, and existing editor/document lifecycle management closes and releases. Failing or canceling does not first remove old previews; persistent, pinned, unsaved, and saving documents do not automatically close. Replacement only processes the target editing group, split view copies are retained, the last source code view closes and releases the shared model, and immediately removes the detach patch closure of that view, avoiding global recovery list strong references after closing. Native Markdown continues to use host editing/rendering and document cleanup adaptation, without creating a second renderer; navigation history only retains location information, not requiring permanent retention of all tabs. View closing, switching repositories, and uninstallation clean up preview references and stale requests.

Regression covers normal click 20 rounds, Alt persistent, retain after editing, reselecting same file does not demote, closing preview settings, multiple editing groups, failure/cancel and rapid clicks, directory/multi-select/rename; check actual release of leaf/source code model/native cache and listener cleanup. Original Typora verifies Markdown immediate display, input promotion, and unsaved content, records real results and synthetic/physical input boundaries; build and same candidate isolation uninstallation/native installation delivery.

<a id="section_cde8ead3c2e9"></a>
## R080.1: Preview replacement display transaction (2026-09-27)

The issue is that the old preview and the new file are displayed as two separate tabs, and then closing the old preview causes a jump. The goal is to complete the handover of identity, order, and active view within the same display transaction after a successful read; loading failures, cancellations, and dirty documents still comply with R080 protection. The file service owns the preview intent and replaceable determination, the editing group owns the tab position and lifecycle, and the native host owns the document content loading. Do not use delays, animations, or hiding the entire workbench to mask intermediate states.

Refer to the fixed VS Code 6807068 `workbench/common/editor/editorGroupModel.ts` openEditor/replaceEditor: previews use the original index for replacement, and closing the old item does not activate the neighbor. Before implementation, verify the timing of the native file:open and leaf:open events; acceptance records the tab identity, position, and document identity in each requestAnimationFrame, covering 20 rounds, fast selection, pinned tabs on both sides, source code and Markdown, read failures, and cross-group scenarios. Retain the native save cancellation, separately record the running window and candidate installation status.

Implementation: The native file:open, after the core completes the leaf mount, immediately submits the preview identity by the current file service request, without waiting for navigation positioning to complete; listen for release in the finally block of success, failure, and cancellation. The source code prepares content in the off-screen candidate view, still reusing the existing shared model; only mount when the current request and original active leaf remain unchanged, and stale candidates are released immediately. Read failures continue to display the existing error entry and retain the readable old preview. Replacement uses the existing move_workspace_leaf sorting port to occupy the old index, then closes the deactivated old leaf, without switching to the neighbor.
