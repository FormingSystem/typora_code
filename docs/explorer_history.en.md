[Chinese](explorer_history.md)

<a id="section_eaeceabae4b0"></a>
# Explorer, Auto-save and Local History

2026-09-29 R082 bilingual release regression: an isolated baseline comparison confirmed that closing the last document could leave an Untitled row. Layout events are emitted by layout roots; Open Editors previously subscribed to an event of the same name on the workspace and missed closures that produced no new active document. The list now observes the existing main, floating, and right layout roots. The file service retains ownership of identity and empty-editor detection; no polling or duplicate document list is introduced. Regression coverage includes closing the final document, moving groups, empty layouts, and no refresh after disposal. Baseline failures and repaired results are recorded separately.

<a id="section_12ac82072904"></a>
## R037 Explorer Partition and Menu

2026-09-14, the user provides ten consecutive screenshots, requiring the completion of the Explorer and local history flow. This authorization adds "Open Editor" and "Timeline", covering the previous layout freeze. Folders continue to use the existing on-demand directory tree, and file operations continue to call the file service; "Open Editor" reads from the leaf of the workbench, without copying the tag state. Close, Close Other, Close Saved, and Reopen methods reuse the editor action service.

Partition titles support folding, more menus and title right-click share visibility settings; the folder partition remains visible. "Open Editor" is displayed in groups, defaulting to showing 9 lines, with internal scrolling beyond that. The file menu adds "Open With", clipboard comparison, and Timeline entry; the folder menu continues to reuse New, Clipboard, System Location, Find, and Terminal. The screenshots' markmap, image directory preview, chat, and file reference queries depend on the corresponding extension or language service; this project does not have these providers, so these entries are not added. Partition visibility belongs to the workbench view state, other settings use the following upstream key names.

Timeline follows the current file, and can be fixed; Git history and local history are independently filtered and merged in time order. History reading failures must be distinguished from empty records. When switching targets, refreshing, and closing, expired requests are canceled, and stale results cannot override new targets.

<a id="section_77295df11ffd"></a>
### R037 Partition Title Alignment

2026-09-14 Again Feedback: The arrows and text of "Open Editor", the root directory, and Timeline are not aligned, and the root directory still inherits the text/font of the main content/file tree. The reason is that the root directory retains the old title's 10px padding and independent font weight, and the other two lines have 4px padding and inherited font. The three same-level partitions are uniformly owned by `workspace_explorer_sections`; the root directory name node is reserved for file tree refresh, and only the same type of fold button is placed, without rebuilding the directory tree or copying the state.

Verify fixed VS Code `645f29cc3176500b4b5762ba887cf2a7f0ffdf2c`'s `paneview.css`, Modern UI `modernUI.contribution.ts`, `padding.css`, `paneHeaders.css` and `fontRamp.css`: This round uses 28px partition line height, two sides 4px margin, left 4px padding, 16px arrow, and two sides 2px spacing, 12px/600 title text; use the workbench UI font, without inheriting the main content or monospace font. The fixed version's arrow, title, and toolbar belong to the same line, and the three partitions do not use their own position compensation. Long name title is truncated to one line, and the original directory identity remains unchanged; the filename of the Timeline is treated as a secondary, collapsible text.

Toolbar follows the `paneview.css` condition: display when the partition is expanded and the mouse is within the partition, or when the partition contains keyboard focus; hide when folded. Toolbar uses the existing public interaction color, corner radius, and focus rules, and does not rewrite hover color. Clicking the title or pressing Enter / space only switches the corresponding partition; refresh retains the root name node and fold state. When destroyed, restore the original directory title structure and processor. Verification requires checking all three arrow lines and actual text lines, expand/fold, keyboard, long name, narrow sidebar, theme, and toolbar visibility; cannot just compare the outer frame.

Targeted verification in this run: the new assertions for actual text line boxes and arrow coordinates failed against the old version. After the fix, 55 history UI checks in hidden Electron and the related Explorer and file-search targets passed. Coverage includes Enter/Space expansion of all three sections, Tab access to the root-folder toolbar, hiding it after focus leaves, light/dark states in a 170px sidebar, ellipsis for long folder names with priority given to the timeline title, node preservation on refresh, and restoration on disposal. Upstream caches and red/green logs are in `.cache/explorer_header_alignment_20260914/`. The browser reported a content size of 1182×802 and `devicePixelRatio=1`; browser input and host-adapter stubs are recorded separately. The main task continues to record original Typora acceptance, installation, and commits. These hidden-Electron checks do not establish installation.

<a id="section_829c4eaec3b7"></a>
## R038 Save and History Recovery

The unified settings entry uses VS Code key names and semantics, storing in the existing workbench user settings. Desktop auto-save defaults to `off`, supports `afterDelay`, `onFocusChange`, and `onWindowChange`; delay defaults to 1000 milliseconds. Supports `files.autoSaveWorkspaceFilesOnly` and `files.autoSaveWhenNoErrors`, diagnostic errors come from the existing Monaco model. Setting changes are applied immediately. Auto-save does not create unnamed files, does not switch tabs, and does not show a save location dialog; source code continues to use file service conflict checks and actual successful results. If save fails, the draft is retained, and the system stops retrying the same failed content. The next time editing or an explicit save occurs, it can retry. The current configuration is located in the workbench user-level settings, and the complete workspace and language coverage system of VS Code is not imported.

Native Markdown obtains modification signals through already verified `File.updateChangeCount`, and successful disk writes of `app.sendEvent/didSave` obtain result paths, overriding 'save as'. It does not consider the save-before event as successful. During operation, the unified service takes over `File.option.enableAutoSave`, and the host draft backup continues to be retained. The native auto-save menu writes to the unified configuration. Auto-save writes call the silent path of `File.saveUseNode(false, true)`; when the window loses focus, it temporarily allows the current host document to save only through the synchronous entry, and restores the real foreground state immediately upon return. Real conflict handling, encoding, and error results still belong to Typora's save implementation, and this project does not replace the host disk writing algorithm.

Local history and auto-save each handle one thing: auto-save triggers writing back, and local history saves the actual disk bytes after successful saving. History is independent of Git, project directories, and currently open files, and is stored in the application user data directory `typora_code/History`. History is enabled by default, with 50 entries per file and 10 seconds of adjacent saves that can be merged; on 2026-09-25, according to [R075](resource_capacity.en.md), the 256 KB and 16 MiB file size thresholds are canceled, and the old maxFileSize configuration is no longer intercepted; the number of entries, merge window, and glob exclusion rules can be configured, and it does not scan private backups from VS Code or other applications. Each snapshot is independently atomic published and verified with a digest; serial saves of the same file use a monotonic timestamp for sorting, avoiding inverted records from the same millisecond.

List entries to recover first list files in this application's history, select then list save time; select a version to open comparison with current file, deleted files can be directly viewed in old version. Selecting a version does not recover the file. The recovery action first checks the current draft and disk identity, and retains the content before recovery; when truly recovering, it clearly prompts. This project chooses to first save the unsaved draft and keep a snapshot, then recover the version; this is an extra protection step compared to the upstream, which directly discards the unsaved draft. Saving conflicts will stop the recovery. Recovery failure cannot be marked as save success. When closing the history record or excluding the current file, you must first allow retention of the version before recovery to overwrite. After renaming files and directories, existing history is moved to the new path.

<a id="section_8836bf2f80a4"></a>
## Upstream basis

Fixed source code: Microsoft VS Code `645f29cc3176500b4b5762ba887cf2a7f0ffdf2c`, 1.137.0. Check files: `files/browser/files.contribution.ts` (automatic save and Open Editors configuration), `files/browser/views/openEditorsView.ts`, `localHistory/browser/localHistoryCommands.ts` (two-stage selection and recovery), `localHistory/browser/localHistoryTimeline.ts`, `services/workingCopy/common/workingCopyHistoryService.ts` and `workingCopyHistoryTracker.ts` (save event, history merge and migration). The complete upstream path is located at `src/vs/workbench/`. Cache is saved in ignored directory `.cache/explorer_history_20260914/`.

Official explanation: [Automatic save](https://code.visualstudio.com/docs/editing/codebasics#_save-auto-save), [Local history](https://code.visualstudio.com/updates/v1_66#_local-history). This project imitates the layout and function design of VS Code, and the host saves adapt using Typora already checked entry.

<a id="section_f0f187526ebe"></a>
## Verification and delivery

_2026-09-14_ passes the automatic save scheduling corresponding to _`check:history`, native save adaptation, real temporary file history, file transaction and hidden _Electron_ interface verification. Covers four modes, continuous input, editing again during save, failure retention, source code diagnosis limit, native save background entry and success event, _18_ group coding / _BOM/EOL_, external conflict, read-only, recovery after deletion, renaming, multiple history instances, same millisecond sorting and damage detection.

Interface uses real workbench core and _Monaco_, covers partition visibility / folding, refresh arrow, close saved and cancel close dirty files, _Markdown_ reopen menu, _Git/_ local timeline, first select file then select version, retain draft before recovery, theme color token and destruction. Existing _`test_workspace_explorer.cjs`_ and _`test_workspace_files_search.cjs`_ regression passes. Native _Markdown_ uses host adaptation pole constructed by already checked _API_ in this project; this round has no real user's _Typora_ window, so these tests are not written as native real machine acceptance.

Complete entry and static CSS independent build through, output located at `.cache/explorer_history_20260914/build`. Timeline filtering uses fixed upstream Codicons `filter`, synchronized preservation of original SVG, source list and SHA256 check.

This time, side session adds new requirements, existing Git workspace difference belongs to main thread. Only add code for this requirement and narrow range connection, build and test use independent output; do not install, restart user Typora or merge main thread changes.


<a id="section_54b979f43485"></a>
### 2026-09-14 full delivery independent review

Automatic save fails on content revision record, editor lose focus and window lose focus will not repeat the same failed draft; new editor can trigger again. After closing the document, the unsent saves will no longer prompt errors or resubmit. Automatic save defaults to `off`, unnamed documents and documents not conforming to diagnosis / workspace constraints are not automatically written.

Restore confirmation is owned by actual history comparison leaf. Closing the comparison page or destroying the history module will close the associated confirmation; asynchronous preservation of the version before recovery, saved draft and final history write return for review of the associated object, tasks after closing cannot continue to recover or reopen files. Before recovery, reject the target draft and the target being saved / read; if the disk has been recovered and the editor produces modifications again, preserve the editing content to avoid stale reload. Cross-process external writes still depend on file identity and byte conflict checks, checks between file system replacement do not claim to have atomic CAS guarantee.

Add regression in old implementation reappear two out-of-focus modes repeated failure writing, as well as closing history comparison still replace target file; fix check actual writing times, document content, confirm destruction and stale open / reload. Explorer Title only creates one partition visibility menu, destroy time restore original folder title handler. This native Markdown save still passes already verified API isolation host fixture verification, does not equate it with real Typora save real machine verification.


<a id="section_915d6adcfbf4"></a>
### 2026-09-14 Original host save and recovery recheck

Complete candidates in the original Typora 1.14.10 independent user directory, private desktop through 73 items native save and history check. Use native CodeMirror to modify exclusive temporary Markdown, real saveUseNode/didSave, verify default auto-save disable, delayed auto-save, history SHA256, save draft first then restore, cancel zero write, native document asynchronous reload, and light and dark Explorer partition. Evidence `.cache/native_zoom_1_14_10/explorer_history_native_20260914_c`; Win32 pointer, renderer Esc and physical keyboard input clearly distinguish. The previous stage records of "no native save verification" are completed by this evidence, other platform boundaries continue to be retained.

<a id="section_49a1b6d0647f"></a>
## 2026-09-14 Integration Check: History Comparison Width

Native screenshot review found that the history comparison did not fill the editing group. The actual group uses horizontal flex, while the history view did not declare the remaining width, causing Monaco to stay at the initial content width; this is unrelated to auto-save or history data. The history view uses the geometric contract of an existing source code document: `flex:1 1 0`, `width:100%`, `min-width:0`, and `align-self:stretch`, and the comparison document content continues to be responded to by the same `git_diff_editor` for size changes, without adding fixed pixels or compensating for blank spaces.

Regression compared the leaf, history view, and Monaco container width under the real workbench core, and continued to cover the cancellation and restoration, saving drafts, and destruction cleanup. New assertions failed before the fix; 34 history interface checks passed after the fix, and the target of complete UI regression also passed. The evidence were respectively `.cache/history_geometry_red_20260914.log`, `.cache/history_geometry_green_20260914.log`, and `.cache/git_progress_final_ui_20260914.log`. The native revalidation and installation results of this round are recorded separately in the feedback record.

The final original Typora same build passed 74 save/history checks. The actual consistency of leaves, views, and Monaco width assertions passed. The screenshot has been rechecked; the evidence is `.cache/native_zoom_1_14_10/history_geometry_native_20260914_a`. The full candidate has been installed and verified OK. The running user window needs to be normally restarted to load. See [this delivery](feedback_review.en.md#section_d25f8ba7d2df).

<a id="section_fd274f35dab9"></a>
## R061 Fold slot and tree indentation

2026-09-20 User feedback: Explorer partition, root layer file tree, and timeline have obvious larger white space on the left side compared to Git. On the same day, R046's partition horizontal `margin 4 + padding 4 + icon margin 2` was replaced with a combination; the height, font, and action visibility are kept as the original design.

The reason is that the partition uses the outer and inner margins of Modern pane, while Git partition uses a compact slot, and the file tree independently adds an initial value of 8px in the renderer. The same responsibility does not share the geometric owner. The goal is to let the three types of partitions of Explorer share the left 4px, 16px icon, and 4px text spacing with SCM's change/committer title; the title text starts from 24px of the sidebar content. This horizontal combination is the adaptation value of this product to retain the existing Git layout, and it is not claimed that all pane of upstream use this combination as original.

Fixed VS Code `645f29cc3176500b4b5762ba887cf2a7f0ffdf2c`'s `src/vs/base/browser/ui/tree/media/tree.css` definition tree twistie to 16px, with 6px tailing, and 3px horizontal displacement; the default indentation of `listService.ts` tree is 8px. Explorer root tree removed extra 8px padding. The directory arrow and SCM resource group use the same tree slot, and the sub-level still adds 8px per level. Seti's undefined folder icon convention remains unchanged, and the file icon retains the same root starting point as the directory glyph. The partition title and tree content belong to different semantic roles. The original 28px/22px/26px line heights are retained, and the tree depth is not considered as the partition white space elimination.

Shared geometric token is placed in `workspace_interaction.css`. Each domain only consumes the token. Explorer renderer only provides semantic depth, and no longer calculates pixel padding. The partition expansion status, tree selection, and file commands still belong to the original service, without adding new persistence, asynchronous requests, or failure processes; folding, canceling renaming, and destruction continue to use the existing behaviors. The main text, third-party editors, and central Git Graph file tree are not included in this sidebar fix.

Validate reuse TC-files-009／TC-files-008 with native TC-system-native-stability：Compare three Explorer partitions and SCM titles actual icons and text starting points；Root layer／sub-layer directory validation 3px starting point and 8px depth difference；Cover expand／collapse，narrow view，light／dark，100%／125% scaling，keyboard and tool hits．Independent Electron is functional geometric evidence，real Typora fixture covers host CSS；Run evidence and installation status are separately recorded delivery records，not replacing results with design statements．

<a id="section_c94ef053fa21"></a>
## R046 Explorer icon and content hierarchy

2026-09-19 User feedback project directory and timeline icon hierarchy is unclear．Existing partitions already have same-level titles and rules for revealing actions on hover／focus；the problem is Explorer root node still uses equal-width font for body text，panel titles again read body theme font，timeline buttons and metadata inheritance boundaries are incomplete．The icon itself and hit area must be separately constrained，cannot rely on scaling the entire sidebar to solve．

This round retains the active toolbar，single root file tree，open editors and timeline structures，26px tree rows and file operations．Do not add repeated root nodes，multi-root workspaces or expanded panels from example workspaces．File types continue to use Seti；collapse arrows and auxiliary operations continue to use original official Codicons，no redraw or change of meaning．

Adopt the verified fixed VS Code 1.137.0 commit `645f29cc3176500b4b5762ba887cf2a7f0ffdf2c` `src/vs/workbench/contrib/modernUI/browser/media/fontRamp.css` (content 13px/400, partition 12px/600, secondary description 11px/400), `src/vs/base/browser/ui/splitview/paneview.css` (expand partition hover/focus-within display operations, 2px inner margin and 4px spacing), and existing 16px Codicons rules. Retain the 28px partition row and 20px partition button (16px font + 2px on each side), clearly define border-box; the top-level tools continue with the existing 25px target while fixing 16px font. Tree names, open editors, and timeline entries uniformly use the workbench UI font and theme foreground, metadata uses descriptionForeground. Original selections, disabled, hover, and focus continue to be managed by the common interaction layer.

Responsibility：Explorer style owns panel content font／icon benchmark，partition style owns title and operation slot，timeline only owns data content；no addition of status，event or configuration．Hidden operations still reach through focused title after Tab；collapse when hidden，retract when leaving partition．Failure／cancellation is consistent with original command service，this round does not change business actions．Impact scope is Explorer，open editors，timeline；shared Git icon factory，edit body text，SCM and terminal size do not modify．

Validate association with existing Explorer historical function suite and Explorer suite，add actual SVG，file name and timeline text style assertions，cover theme body text intentionally using monospaced font isolation，narrow view，keyboard focus and action visibility；reuse native stability fixture to validate original host two themes and screenshots．CSS changes have no independent algorithm，do not copy meaningless unit tests；existing large directory virtualization regression covers content scrolling．Original failure and pass runs are separately archived，this round results are separately recorded from old acceptance，installation after normal restart will load．

<a id="section_c11c8a522e82"></a>
### R046 This round validation and delivery

This round's target suite TC-files-008, 009, 013, 016 and TC-system-native-stability have all passed; the new font isolation assertion in 009 failed in the old version, but was fixed and passed, and regression on actual 16px icon, three-zone folding/hover/focus, 170px narrow sidebar, timeline secondary text and destruction. 008 continues to cover 2000 lines of virtual file tree; this CSS has no new states or algorithms, so the old 20/100/1000 pressure results are not counted again in this round.

The original Typora 1.14.10 passed 37 checks in the independent user directory/private desktop, including 16 new Explorer checks. The actual separator received renderer keyboard events, in 300/220 CSS px two levels, and in 20px operation target within GitHub/Night two themes, 16px glyph, UI font, title not overlapping, sidebar not covering the editing area; four screenshots were all manually checked. The window is 2100×1300 physical pixels, DPR1.25, zoom1; this input is not a physical keyboard acceptance.

The fixture's initial version failed when Explorer was not yet mounted; later, although the stage that only checks DOM geometry passed the assertions, the screenshots exposed the first frame not displayed and the forced width not synchronized with the editing area. It has been fixed to actual visible hit, font readiness, and real separator entry, and the final run `2026-09-19T10-47-19-004Z_0227aa` is used as delivery evidence. The prior records are not deleted and are not considered as complete visual acceptance.

`npm run build`, `npm run check` passed; it has been installed using the standard installer, check_windows is OK, 23 installation assets are consistent, 5 host/configuration protection summaries remain unchanged. This round does not restart the user window, and the document can be saved and then normally restarted to load. Requirements, source code summaries, failure/pass reports, and native screenshots summaries are seen in [machine-readable evidence](../enhancements/tests/evidence/explorer_hierarchy_20260919.json). Other platforms, different system DPI and physical input still belong to the original acceptance boundary; this round's visual fix does not close existing unresolved issues. The development skill has been synchronized to supplement real layout and visibility evidence rules, and the check has passed.

<a id="section_d9ae57b2ba1c"></a>
## R052 Empty editing area and last file

On 2026-09-19 user comparison with VS Code feedback: no file open still shows New tab, last file difficult to close or replace. Root causes are divided into three places: the core.empty layout placeholder is treated as a document; the closed native Markdown still has cache, and opening the same path skips disk reading; after recycling the current Markdown, the host turns the old content into a hidden draft, and subsequent opening is intercepted.

<a id="section_d0df1b46ee11"></a>
### Scope and behavior

The empty list retains the 'Open Editors' partition title, default minVisible is 0, no fake rows; real empty paths unnamed drafts, tool editors are retained, original display/sorting/visible row settings remain unchanged. No new panels or full VS Code configuration system is added. Fix the VS Code 1.137.0 commit `645f29cc3176500b4b5762ba887cf2a7f0ffdf2c` `src/vs/workbench/contrib/files/browser/views/openEditorsView.ts` with `g.editors` to generate rows, `g.count` to calculate real entries, do not count empty group placeholders; default minimum visible items is 0.

After closing the last document, the empty placeholder is closed as an idempotent operation; the time line is not fixed to clear old targets, but still follows the user's choice; the status bar no longer displays the number of cached documents/ spelling, and real Markdown re-opening recovers. The identity of layout, unnamed drafts, and host cache shall not be mixed.

<a id="section_7a7c6690053c"></a>
### Implementation and state owner

- `workspace_file_uri` provides a unique determination for empty leaf; Explorer only consumes real leaves, file close service rejects removal of empty placeholder, status bar reuses the same determination; timeline still has fixed status and request round.
- Reading navigation handles 'target equals host cache, but no Markdown leaf' in serial open transactions: when not dirty, await host `File.reloadFromDisk()`, do not pass forced discard, then open again. Opened split view / background draft does not reload. Navigation stops on failure, cancellation, or identity change.
- Before file recovery transaction, capture native path and document content, reject dirty or busy status; native adaptation `prepare_deleted_native_document` switches to new empty document upon successful recovery and when identity/content remains, through `File.loadFile("", true)` to new empty document. This host interface marks the new empty document dirty, so only when actual path and content are both empty does it call `NSChangeCleared`, cannot clear non-empty draft marks.
- Native release occurs before removing target leaf, to avoid emptying other files activated later; failed recovery does not close leaves, does not degenerate into permanent deletion. During deletion, changes in document content retain editor and prompt to save as; if switched to another document, do not touch it. Prohibit workspace switching during file operations. Only execute real host interface, do not rewrite bundle, ASAR or fabricate disk save.

Host basis is verified Typora 1.14.10 original `appsrc/window/frame.js`'s `loadFile`, `reloadFromDisk`, and `ChangeType.NSChangeCleared` (see ASAR summary in native evidence). `document.switchToUntitled` only converts main process identity and retains snapshot, cannot independently release renderer old content.

<a id="section_f172a718765b"></a>
### Acceptance and regression

Associate `TC-files-009` function testing (real core/Monaco, empty placeholder, real unnamed, 100 power closure, original configuration and save/timeline), `TC-files-015` identity unit (20/100/1000), `TC-files-native-document` release unit pressure (20/100/1000 and concurrency/failure protection), and `TC-system-native-empty-editor` original host system verification. Native use cases follow real close button and delete confirmation, covering rename, cancel delete, real recovery then open other files, save cancel/success with 20 loop; only operate on dedicated temporary documents. Supplement reading, link, edit actions, source code lifecycle, workspace switching and status bar regression.

The first slow single check is masked by the monitor's delayed refresh; continuous immediate reopen and delete then open failure records are retained in the current evidence. Cross-computer permissions/different host versions do not automatically close due to this Windows isolation; final build, install, load status are separately recorded in delivery report.


<a id="section_e3472da0e572"></a>
### R061 reoccurrence boundary check

2026-09-20 user again points out left white border. Last time only verified internal slot, still cannot prove host sidebar and activity bar connection. This time first record panel, host sidebar-content, activity bar and root layer row actual boundaries, then distinguish outer white space, normal hierarchy and old window not loaded candidates. If multiple layers are overlapped, fix layout owner; do not offset container issues by moving icon. Regression adds sidebar absolute boundary and real tree depth, does not consider old native test as current result.

This review: the current candidate in Github workbench, custom cpp_github-consolas and Night themes, 220/300px sidebar, 100%/125% window scaling down, the right boundary of the active bar, sidebar-content, Explorer, and the tree root border meet, the root directory padding-left = 0, file character offset 3px; no additional blank containers need to be shifted again. Therefore, no hasty changes to the already compliant sidebar geometry. Absolute boundary assertions have been added and 2026.09.20.15 has been installed, the actual loaded version of the user screenshot window is still unknown, needs to be saved and then normally restarted for verification; this on-site user confirmation remains pending acceptance. [This evidence](../enhancements/tests/evidence/menu_overflow_20260920.json).


<a id="section_72860a6ce480"></a>
### Uniform ( 2026-09-20 ) for the entire row partition title of R061

Subsequent screenshots indicate that only the arrow slot is insufficient: Explorer only colors the title button, while SCM changes color the entire row. A new common header/title/actions role has been added, all primary partitions are unified with 4px left and right margin, full row hover background color and 4px rounded corners, sub-title transparent, tool buttons retain public independent interaction. Explorer, open editor, timeline, SCM changes and submit image integration; resource group belongs to the tree content, retain real hierarchy, do not mix with primary title. Refer to fixed 1.137.0 `padding.css`'s pane-header common margin and action margin responsibilities; retain the currently confirmed arrow 4px absolute starting point (external distance instead of internal distance), as well as the existing 28/22px height of each area, do not expand to full layout migration.

Geometry and background are held by common CSS, each view is only responsible for folding state, content and actions. Dynamic title/tool addition, expansion/folding, narrow sidebar, light/dark/scale and original host measurement of the entire row boundary, text starting point and tool click, check hover does not shorten background color or trigger folding; destroy and remove this module's additional roles. Tree item indentation remains unchanged.
