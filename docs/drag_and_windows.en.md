[Chinese](drag_and_windows.md)

<a id="section_6b0db63c6fc4"></a>
# Tab Drag and Multi-window

File tabs use browser-native drag and drop: left-click and hold a tab, drag within the window to adjust order, drag to another window's tab bar to merge by inserting line, and release to create a new Typora window when dragging outside the current window. Minimize, maximize, and full screen share the actual window boundary, no longer using the edge of the editing area or sidebar to determine a new window.

Sidebar tools still use the existing left-click sorting and persistence, using the original icons and names. They adjust the tool order, but do not become file tabs. The divider, text selection, and thumbnail maintain their own operations.

<a id="section_21ba3a7a6a0b"></a>
## Same-window and cross-window drop points

When tabs are sorted within the same group, the layout model and DOM are synchronized, and the keyboard shortcut switching follows the new order; when moving across groups, the original leaf object is moved. When there are too many tabs, dragging to the edge of the tab bar automatically scrolls horizontally. If the same path has already been opened in the target window, compare the content and saved format according to R005.3; if consistent, reuse the target, otherwise retain both sides and prompt.

Tabs use the original node as the native drag image, and only submit when the actual drop occurs. Acquiring focus in another window does not count as cancellation; if the source is removed, the page is unloaded, or the Escape event has been received, the transfer is terminated. The dragend.buttons in Chromium is not reliable physical key evidence, and is not used to determine cancellation. The actual cancellation scope is verified in the verification records.

<a id="section_5ec5014857ee"></a>
## Document transfer and native new window

The native entry is for the Typora 1.14.9 version checked in `JSBridge.invoke("app.openFile", null, {mountFolder, anchor})`. The initialization anchor point only uses `#typora-code-window-<随机UUID>` text within the document; the host delays consuming again without jumping to external system protocols. When matching, clean up both initialization anchor points of the host at the same time.

Native Drag Data contains only exclusive MIME `application/x-typora-code-tab` and one-time UUID, without document content, file URL, or custom external protocol. After actually dropping in another window, both sides perform memory channel handshaking, and the target restores the document content, format, and position in the specified editing group and number, then confirms receipt. The source checks the snapshot, disk baseline, and original leaf identity, and only removes it if consistent. The new window inherits the source project, and the existing target window keeps its own project root directory.

No modifications to ASAR, registering Windows protocols, writing temporary document content, or writing engineering configuration. The source is a newly created window for this function, and only when the last real tab is removed does it pass through the host's close entry to close the empty attached window. Before closing, verify the native loading, saving, and draft status again; the main window remains open.

<a id="section_de6554004525"></a>
### Document and draft boundaries

| Situation | behavior |
| --- | --- |
| Markdown has been saved, including the preview tab | Open the file and restore the reading position; after the target acknowledgment, remove the source tag |
| Saved or unsaved source code | Transfer the current document content, language, encoding / BOM / line endings, selection, and scroll position, preserving the save baseline; after the target acknowledgment, remove the source |
| Native Markdown is unsaved, auto-save is closed | Verify the host's shared document status, complete document content, and saved baseline; after the target receipt, the host also confirms the removal of the source when another window holds the same document |
| Native Markdown auto-save is enabled, or the target has an unsaved Markdown file | Reject overwrite, retain source and explicitly prompt; Do not pass through as saved to bypass host |
| Untitled, Directory, Symbolic Link, Graph, diff, Terminal and other virtual tags | Not as a regular document cross-window transfer; unnamed document is saved first |
| Source is being edited again, disk changes, target has new operations, timeout / failure / cancellation | Keep the source and recovered content, reject further overwrite or deletion |

Reading disk limit is 16 MiB, large drafts will also be rejected. Reading and summarizing are executed asynchronously; once actual cross-window receiving or window creation starts, capture, receiving, and source release share a 25-second deadline. Pure in-window sorting does not read files. After cancellation, queue navigation will not start.

Source code explicit save still performs the original conflict check. Cross-process source complete rollback history is not migrated; A new document received creates a new edit history, and when merged with the same file, retains the original target edit history; The two windows do not support real-time collaboration. When native Markdown drafts cannot be safely switched, the source may be retained and a prompt may be displayed, and it should not be discarded or saved arbitrarily.

<a id="section_216ffa49c1d8"></a>
## Validate entry point

Execute in `enhancements/`:

```sh
npm run check:ui -- test_workspace_drag.cjs test_workspace_activity.cjs test_workspace_detached_window.cjs test_workspace_document_transfer.cjs
```

Drag and drop fixture covers real Chromium dragIntercepted/Drag Data, native drag and drop, and real workspace model; multi-renderer testing covers window drop points, random channels, confirmation, cancellation, timeout, construction failure, and closing of empty windows. Document fixture uses real Monaco, temporary disk files, and native Markdown contract to validate document content and save baseline.

Native Typora integration results are displayed as a single column in [Feedback Recheck Records](feedback_review.en.md). The programmatic DragEvent of the private desktop and the real native window protocol do not claim to be physical mouse cross-window manual acceptance.

<a id="section_5eefb7c166f0"></a>
## R005.1 Pressure testing and resource cleanup (2026-09-20)

This round of user requirements involve pressure testing for split view, dragging out window creation, and dragging in merging, and fixing the performance/logical issues found. The existing same-window split view command, drag-and-drop sorting/moving, and cross-window protocol are acceptance objects, retaining the host Markdown single-active editor and draft protection boundary. The pressure testing expansion is not to be applied to any arbitrary control drag or complete VS Code host.

Comparing with the fixed VS Code 1.137.0(645f29cc3176500b4b5762ba887cf2a7f0ffdf2c) multiEditorTabsControl.ts and editorDropTarget.ts: actual drop only moves/merges, dragging out is determined by window boundaries and dragToOpenWindow; after removing an empty editor group, the remaining groups remain valid. The corresponding source code is in the Microsoft official repository src/vs/workbench/browser/parts/editor directory, and the research cache is not considered as a running dependency. The edge splitting and modifier key configuration need to be checked separately, and it is not allowed to refer to the current supported tab bar as a complete drag-and-drop configuration migration.

Reproduced: The drag-and-drop adapter still schedules a loop per frame even when no edge scrolling is needed, 14-15 empty callbacks are observed at 240ms; after removing the split view, the index is -1, the error removes the last weight, and when deleting the first column of the 50/30/20 three columns, it results in 60/40 instead of 55/45; 1000 sorts on the active tab trigger 1000 closes/reopens. The fix is held by the common drag-and-drop, split view, and leaf movement layer, and no compensation is added in each panel.

The same-window layer is verified in 20/100/1000 rounds for real layout model, DOM order, fixed tab, split view ratio, editor/draft identity, and destruction; the transmission layer uses two independent renderers' real BroadcastChannel, the same batch of windows are reused, with 20/100/1000 handshake and cancellation detection channel/timer residue, instead of opening 1000 windows at the same time. Statistics on the number of rounds, the longest single task, and idle frame calls; it is not allowed to directly take the asynchronous total time as the main thread stall. The file layer uses real Monaco, temporary files, and host contract to check the format, save baseline, cancel, and target draft; the original host independent copy covers the actual split view and handover entry. Test cancellation/late arrival shall not save, overwrite, or close user real documents.

Feedback or cancel promptly revokes the drop point and animation; run rAF only when the tag tab edge is at the edge and can still scroll, and restart when the drop point changes. When removing a group, first capture the index/weight, then modify the tree and DOM; invalid removal writes zero. If measurement finds other bottlenecks, continue tracking the true state owner and update the facts in this section. After fixing, rerun with the original load, build/check, native installation, and record the untested physical cross-window input.


<a id="section_0478a3090023"></a>
### This round's implementation and boundary comparison

- Animations run only when the 24px edge of the tag tab is at the edge and there is still scroll distance; the center, document content, end of scroll, cancel, and destroy do not leave loops. When removing a split view, first hide the drop point before reading the geometry; drop still rechecks the actual drop point.
- When deleting a split view, first take the associated weight; repeated deletion does not affect the alive nodes. When replacing nested split views, reapply the parent share. The divider only modifies the adjacent two split views, keeping the total share of the two split views and the rest; inherit the 120px minimum size, and for small containers, tightly fit the available two split view sizes, without generating negative weights.
- Active tag sorting remains open in the editor; cross-group insertion has been completed activation, and no longer toggles repeatedly; when the same active leaf is across groups, synchronize the active group mark. The content of the file and the save/draft are still managed by the original file service.
- Fix VS Code's `splitview.ts` where `onSashChange` and `resize` are allocated adjacent indices and constrained by minimum/maximum size; this workbench retains its own 120px constraint, and does not claim to implement its Alt symmetry adjustment, adhesion, multi-split view recursion, and all editor group settings. The current drag into the tag tab/document is merging, and automatic group creation when dragging on the four sides of the document is not yet implemented; four-direction split view uses existing menu commands. This round does not change this operation range.

Verification of layers: the real core model/DOM is 20, 100, 1000 rounds of four-way split and merge; two renderers have real channels of 20, 100, 1000 times of handover and 2000 times of cancellation; the original Typora independent copy also has 20 times of real Monaco split and merge/revert, as well as 20 times of real window creation→draft reception→merge→empty window renderer exit. Native window creation merge uses renderer event-driven actual entry, which is not yet physical mouse cross-screen testing. The first window exit fixture depends on the unload callback and timeout, changed to check the exclusive renderer PID exit; no changes to the production close logic.

Execution of native window creation pressure: set `TYPORA_NATIVE_TEST_ROOT` as already verified host and run `enhancements/scripts/test_drag_windows_native.ps1`; it reuses the unique copy/private desktop process. Total time includes host startup, polling, and IPC, cannot be considered as blocking the main thread. Stage evidence is seen in `enhancements/tests/evidence/drag_stress_20260920.json`.


<a id="section_f1021bd6e5ac"></a>
## R005.2 Drag and drop direct execution and non-modal feedback (2026-09-20)

User feedback that dragging out/merging appears a button pop-up with the title 'Move Tag'. The drop itself authorizes the move, and the protocol accepted/committed is the acknowledgment between windows, so it should not require the user to click again. The current controller passes the failure or retained copy information to workspace_dialog, causing a blocking feeling; changed to reuse the core Notice, no focus competition, no confirmation action, and no prompt on success. The source/target controller still manages the transaction and cleanup; the notification is displayed as shared core, cannot use hidden prompts to hide the handover failure.

Verify the VS of Code with multiEditorTabsControl.ts and editorDropTarget.ts, and directly moveEditor/moveEditors the drop path. This round retains the existing layout and drag-and-drop range; normal handover requires checking the actual source code and Markdown. If an error occurs, first locate the cause. On failure or cancellation, do not save or discard the document content. Do not bypass the real dirty document protection. Acceptance adds no modal dialogs, focus retention, shared notifications, and the original native dual-window roundtrip for saved/unsaved Markdown. Previous rounds that only tested the source code's 20 do not replace this item.

User feedback: New window restores other files from the original window. The real host has already enabled restoreWhenLaunch = 2 and reenacted the reception and session recovery competition, and the 'File is being read, switched, saved, or renamed' moving tab box appears. The startup intent is determined by the same security anchor point parsing function; the session service synchronously captures during the transfer party's cleanup of the anchor point. The attached window does not perform initial directory restoration, and does not write its local/empty layout into this directory session, to avoid overwriting the main window's records. After the user successfully switches directories, it transfers to normal session ownership; regular startup, explicit file, and invalid anchor points use the original configuration.

The continuous removal and immediate reinsertion of native pressure reenacts the host's previous round switch that has not yet ended. Reception is rejected by busy protection before the tag is created. The file service only waits for the actual read, switch, and parse status to end before the capture/reception transaction starts, with a maximum of 5 seconds; it stops upon cancellation, destruction, root directory, or original target change. Save/renaming is not automatically retried here; the fingerprint and draft verification after starting the read snapshot is still strictly failed, and does not replay the inserted document. Acceptance covers the brief busy, timeout, cancellation, and target change during the waiting period, and retains the failure evidence found.

<a id="section_44ed6acec8e1"></a>
## R005.3 Same file no difference merge (2026-09-20)

Conflict does not occur for the same path. This section replaces the previous rule of 'reject target open file uniformly': the file service reads the real memory snapshot on existing target, reuses and activates the target editor when the document content and save format are consistent, without creating new tabs, without overwriting content, and without rebuilding the undo record. The source code also checks the encoding/BOM/ line endings and save baseline, and Markdown normalizes the document content and baseline by host line endings. Different editor types retain two copies and prompt accordingly. dirty itself is not the sole basis for content differences.

Compare and verify the root directory, target survival, cancellation, and file identity before and after, confirm the snapshot after activation; after ACK, the source is checked according to the existing fingerprint before release. If there are multiple targets for the same file, they must be checked one by one, and it is not allowed to skip another different draft. When there are actual differences in the main content or saved format, prompt "The content or saved format of the same file is different, and two windows of the document have been retained." Do not automatically select the new one by timestamp, and do not overwrite any version. The timeline mainly records saved versions, not all unsaved inputs' persistent backups. It is not allowed to discard drafts because there is a timeline.

This round only adjusts the transfer of tags for the same file and the closing of existing empty side windows, without adding whole window batch merging or conflict overwrite wizard. Acceptance includes source code/Markdown of saved same content, same draft, different drafts, format differences, changes during target comparison period, existing undo identity, zero disk write, and native dual-window same file merging. The transfer of ordinary different files and session recovery remains the original rules.
