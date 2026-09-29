[Chinese](statusbar_layout.md)

<a id="section_a67475ac8606"></a>
# Bottom bar native control and overlay layout design

Requirements: R012, R012.1, R013, R015. Source: 2026-09-12 user screenshots and supplementary feedback.

<a id="section_93224c913e16"></a>
## R012 Bottom bar overlay positioning

<a id="section_0b5f30b093e0"></a>
### Issues and Goals

After the terminal expands, the status bar 'Recent Directories' menu only shows a shadow; after clicking the pin, the title list reappears in the top right corner of the window. These are different native controls: `#sidebar-files-menu` belongs to the status bar directory menu, `#unpin-outline-btn` is opened through the host `hideSidebar()` / `showOutline()` to `#toc-dropmenu`. At that time, the goal was to have the native floating layer appear above the actual status bar entry. Subsequently, R012.1 canceled the status bar outline operation; currently, only the directory, word count details, and language panel continue to use the status bar positioning.

ReadOnly check on host `appsrc/window/frame.js`、`style/window.css`、`style/base-control.css`：The directory menu moves with the original container to the footer, but the footer's stacking level is 4, lower than the terminal panel's 100; the native floating outline is fixed at `top:0; right:4px`, level 25. The existing margin container uses inline-size containment, and cannot directly use the coordinates of nested floating layers as window coordinates.

2026-09-12 Original ASAR isolation reproduction further confirmation: Host sets `li.show` for available rows, but the display selector of `base-control.css` is `#sidebar-files-menu li.show #ty-sidebar-footer .show`, which cannot match the actual menu hierarchy, leading all rows to remain `display:none`, with only about 5px of menu border and padding. This is also the reason for the 'only shadow' independent case. The style adaptation only restores `li.show` display, and does not display the unmarked non-available operations together.

<a id="section_3ad29ae05fc5"></a>
### Interaction, responsibilities and solution

- `workspace_footer` Continue to retain native status bar nodes for moving and cleaning; the unified status bar geometry adapter manages the positioning of directories, word count details, and spelling panels, avoiding similar menus from being obscured by the terminal.
- Retain the original DOM identity, native content generation, directory selection, and closing events; do not clone menus or take over recent directory data. Native nodes in the outline continue to be retained, and the status bar entry is hidden according to R012.1.
- The enabled state is read from the host class and actual visibility. Using the real-time rectangular positioning of the entry button and status bar, prioritize positioning above the button; the size is constrained by the window boundary and the bottom of the title bar. For long content, internal scrolling is allowed. The status bar hierarchy is elevated only when nested floating layers are open; floating layers are positioned above the terminal and below the top bar menu and modal windows.
- Listen for geometry changes in the window, sidebar, status bar, and editing root node, and merge them into the animation frame update; read the actual positioning origin to handle containment, without caching absolute screen coordinates. After the sidebar is collapsed, the directory menu still uses the file entry remaining in the status bar.
- Retain native close, cancel, and failure behaviors; the adapter does not call file or terminal services. Uninstall to remove observations and style attributes, restoring native nodes; do not modify documents, drafts, terminal sessions, or installation packages.

<a id="section_493faf2bcfbe"></a>
### Acceptance and regression

Isolate Electron's use of the production status bar, terminal panel, and native selector rules, verifying the hiding/expanding/maximizing of the terminal, the opening/closing of the sidebar, narrow windows, long menus, and window scaling. Check that floating layers are fully within the visible area, adjacent to the bottom of the entry, and centered on the menu rather than the terminal; retain native nodes and events, and do not leave any residue after closing or uninstalling. Screenshots are only for geometric evidence and do not replace real host clicks for acceptance.

<a id="section_5a15a96918eb"></a>
## R013 Word count statistics centered

<a id="section_96298b747933"></a>
### Issues and solutions

Right-aligned text count text offset. Host `#footer-word-count` retains `padding-bottom:8px`, and inherits the old 30px line height and negative top and bottom margins; the workbench has adopted a compact status bar, and using these values would cause the count box to be misaligned with the text center.

Only standardize the box model of the text count button: height follows the available height of the status bar, clear the old negative margins and single bottom padding, use symmetric horizontal padding and flex centering, maintain the current font size, text, count arrow, and native click events. The original hidden rules of the source code/diff view take precedence; do not change the count logic or global UI font size. The text count details reuse the geometry adaptation of R012's floating layer.

<a id="section_58e1838cd429"></a>
### Acceptance and Boundaries

Check that the text and arrow are vertically centered within the button content box, and the button is centered within the status bar content box, in the terminal switch, narrow window, different bit depths, and 100% / 125% zoom; the text count click still calls the native processing. Check that the source code status still hides the count, and after cleaning, restore the host style.

<a id="section_628e1953338f"></a>
## Verify records

2026-09-12 The bottom bar floating layer geometry adapter and the word box model have been implemented. The target regression `npm run check:ui -- test_workspace_footer.cjs test_workspace_editor_status.cjs test_workspace_document_margin.cjs` has been passed through: 44 items in the bottom bar, 15 items in the editor state, and 18 items in the margin. New checks have been added for using the production terminal panel and style, native selector, and event semantics, including window clamping, actual pointer hit, 22px/30px bottom bar, different bit numbers, and 100%/125% scaling. The screenshot has been verified for the adjacent bottom button of the pin layer, with the word text and arrow centered.

The first start of Electron in the sandbox failed due to GPU sub-process loading failure, and it was changed to run in a normal process environment to verify the isolated hidden window. Another test failed because the new long word count test case did not restore the old narrow window fixture, but it passed after restoring the fixture and running again. The above fixtures do not start the user Typora, and it is not equal to the native window manual acceptance. Shared build, installation, and real host results are maintained by the requirement ledger and feedback records.

2026-09-12 Additional original Typora ASAR private desktop verification has been added, with 10 items passing. The real host, workbench build, and ConPTY are run independently with the user directory and project fixture; no user desktop switching. The renderer mouse events trigger native delegation processing, verifying the actual switch of the recent directory entry to the host directory, the pin layer collapsing the sidebar after floating outline is close to the bottom and can be jumped, and the word count details native switch with text and arrow centering. The floating layer center hits the real menu node, and all original fixtures' summaries, document content, modification status, and running terminal PID are maintained. Three original window screenshots have been checked one by one. This evidence includes real host events and hit tests, and it does not claim user desktop manual mouse acceptance.

The first round of native regression reproduced and fixed the real problem of the menu being only 5px. The middle rounds were not completed due to the fixture not waiting for the sidebar 300ms layout transition, missing isolation of historical directories, and missing assertion string escaping. The final test case passed after stable layout sampling and passing the already verified native `setting.addRecentFolder` as an independent user directory test history. The native screenshots cover the current three feedbacks; narrow window, terminal maximize/hide, and multiple-digit number scaling are covered by the above isolated Electron regression. The original test cases and screenshots are saved in the ignored `.cache/native_single_row_compare/footer_native_20260912_e/`.

<a id="section_bf6f7f836249"></a>
## R015 Language identifier centered

User screenshot from September 12, 2026 indicates that the language indicator in the lower right corner is still floating upward. In Typora 1.14.10 `style/window.css`, `#footer-spell-check` shares the bottom 8px padding with the word count button, and inherits negative top and bottom margins and a 30px line height; Previously, R013 only corrected the word count button. Two similar controls share the bottom status bar's centered box model, and the language text, as well as the downloading/completed/error icons, maintain their native node, visibility, and events. The menu continues to be adapted by R012, and the configuration and dictionary are managed by the host, without adding new language status.

Verify 22px/30px status bar, 100%/125% zoom, terminal switch, different language text and download status; text center and status bar content box are consistent, clicking still opens the native language menu, source code/diff remains hidden, and uninstallation restores the style. This round of verification records are at the end of the text.

<a id="section_c5d3ebb43169"></a>
## R012.1 Remove the outline entry from the status bar

After September 12, 2026, the outline operations in the status bar will be explicitly removed, as there is already an independent entry in the activity bar. This requirement replaces the previous 'floating layer placed on the right side of the document' adjustment for the status bar. The status bar hides the native outline pin and removes duplicate sidebars/outline entries, retains the original nodes for host access and uninstalls/reinstalls, and removes the no longer needed outline icon replacement and status bar outline floating layer positioning. The outline still enters from the left activity bar and view menu; the recent directory, word count, language menu, and document margin remain unchanged.

Acceptance includes file tree/outline/sidebar collapse state, terminal switch, and zoom: the status bar does not display or retains the blank outline button slot, the activity bar outline can be displayed/hid with correct selection state, other native menus are available, and the original nodes are restored during uninstallation/reinstallation.


<a id="section_2eb54779c67b"></a>
## R019 Margin Percentage Centering

2026-09-12 User pointed out that the '6%' position next to the margin slider is too low. The Typora 1.14.10 `lib.asar/bootstrape/css/bootstrap.css` was read, where the HTML `output` has `padding-top:7px`. Previously, the component only defined width and font, without canceling inherited form padding; simply centering the parent container with flex could not center the text.

Percentage output uses the R008.1 shared text rules to clear margin/padding, and centers within the original 30px output slot. Retains the existing 0–24% single-side margin formula, storage key, keyboard range operation, failure recovery, and narrow status bar hiding strategy. Acceptance of 0%, 6%, and 24%, 22px/30px status bar, and 100%/125% window zoom; verifies that the slider, output, word count, and language are on the same baseline, and that the main content/document and settings fields do not change due to layout changes.

<a id="section_6cb040c104ad"></a>
## R008.1 Unified Status Bar Layout Covenant

2026-09-12 User requested that patch-style fixes be applied to individual controls. The status bar is a common layout boundary: provides `workspace-footer-group`, `workspace-footer-control`, and `workspace-footer-text` three reusable roles, respectively responsible for layout group, interactive operations, and text. Public styles uniquely manage vertical height, box model, upper and lower margin/padding, centering, and text line height. Operation spacing is managed by group gap. Unified clearing of the host's inherited negative horizontal margin; uses existing style reference counter for installation and cleanup. Native adapter declares roles for verified nodes and restores them upon uninstallation. Custom components declare roles when created.

Git branch/sync/commit graph, file actions, source code buttons, margin slider, word count, language, source code/diff status area all use the covenant. Independent modules only manage their own width, horizontal spacing, truncation, icons, business status, and commands; visibility is still determined by native status, `hidden`, and responsive rules. Pop-up menus are not part of the status bar line, and do not apply the status bar height rules. When components are added, roles are reused, and they can no longer rely on the host's common label/output form styles or new offset compensation.

Typora real-time still found numeric control inheritance `margin-right:-8px`, causing overlap with language click area; shared operation roles uniformly set to zero horizontal margin, regression simultaneously checks area non-overlap.

Native node identity and events are preserved; no second state storage. Shared rules first use host negative margin, single-side padding, label/output contamination fixture verification, then verify actual Typora. One matrix covers similar controls, terminal hide/expand/maximize, sidebar switch, source code/diff, light/dark, zoom and narrow window; correct issues within common boundaries, do not use a single screenshot to pass alternative overall verification.


<a id="section_5dc8defe1f5e"></a>
## This round of shared layout verification

2026-09-12, R008.1, R019, R015, R012.1: The final four UI goals of the bottom bar, margin, editor state and diff have all passed; tested native negative margin, label/output form style, 22px/30px height, 0%/6%/24%, different languages and download status, narrow sidebar and 100%/125% zoom, and retained the recent directory and language menu activation/localization test. The private instance of Native Typora 1.14.10 completed 25 verifications, including actual 100%/120% window zoom, 6% alignment, word/ language hit area non-overlap, bottom bar outline removal, terminal switch and unmodified original text. Specific logs and installation status are seen in [This round of feedback records](feedback_review.en.md#section_677451aa798a).


<a id="section_6ac21166748e"></a>
## 2026-09-12 Bottom bar repeated defect recheck

R012, R008.1, R015 again received actual screenshots: when the sidebar is collapsed, the directory menu only remains the border, the bottom bar left and right text have different heights, and the right language entry is missing when not hovered. Previously, the common box model and local rectangle assertion did not cover this state, and cannot close the new feedback with old acceptance.

This round continues to use the same layout and native adaptation ownership. First, verify the actual host DOM, inherited style, theme and visibility, then fix the corresponding rules. The menu is still an independent floating layer, not including the height, line height and text layout of the bottom bar; the left and right operation text use consistent font and text box; the available language entry should be visible when not hovered, and the real language and availability continue to be managed by the host. Keep the original text, unsaved draft, directory history, keyboard operations and terminal sessions.

Acceptance is based on the current original Typora instance and complete production style: open/close sidebar, file tree/outline, terminal hide/expand/maximize, same theme and zoom, pointer leaves the bottom bar. Record menu content and actual visible item height, text Range rectangle, calculated font/line height/opacity and hit target; verify the actual selection of recent directory and language menu, prohibit only comparing outer rectangle to claim text alignment. Supplement the regression that can be reproduced first, then synchronize the final build, installation and evidence. The root cause and verification results are added in this section after reproduction.


It has been reproduced in the same theme, 120% zoom original 1.14.10 private instance: when the outline is hidden, the menu height is 5.90px, and when switched to the file tree, it is 213.71px; calling the native availability refresh does not change the former. The root cause is that `active-tab-outline` is mirrored to the entire file operation group after moving, and the native `.active-tab-outline .file-action-item{display:none!important}` simultaneously hides the menu line that already has `show`. The fix is only to record the dedicated context for direct bottom bar lines, and the list/tree sort status still synchronizes with the native class; the independent directory menu continues to display only the host available lines.

The language node actually exists, and the host `#footer-spell-check{opacity:0}` changes to 1 only when hovering over the bottom bar / menu open. The user has explicitly required that the entry remains visible during the current document activation period, so the native adaptation only fixes the opacity of this entry; the source code/diff state, download/error icons, language content and menu are still decided by the native owner.

The center of the text rectangles on the left and right of the main content is the same, but previously `line-height:1` caused 12px tags to clip 15.7px text; the source code button on the left was covered by the host inline `display:block`; the 16px icon is aligned with the 25px content box. The common rules are changed to inherit the same font from the status bar, and natural line height for text, while also centering content in normal block layout. Single icons use block boxes to eliminate baseline whitespace. This rule does not forcibly modify the host's display, thus preserving the native hidden semantics, and does not use a step-by-step top offset compensation for buttons.


This acceptance: new regressions first reappear the outline context hidden available menu lines in the old implementation, then fixed and through the status bar, margins, editor state, and diff, four UI targets; build and complete check passed. The original Typora 1.14.10 isolated instance passed 14 tests, including outline display/ collapse with file tree, menu coverage on real terminals and the ability to switch directories, language continues to display even when not hovering / closing the language menu / focused terminal, 100% → 120% → 100% shared text and icon geometry. The maximum text Range center difference is 0.24px, tags are not clipped, icons are centered; the current zoom and outline collapse combination menu recovers from 5.90px to 217.88px. The source code/diff ownership, terminal maximization, narrow bar, 125% zoom and lifecycle are covered by the above UI targets, but it is not claimed that all are covered by real machines.

Native events and nodes are still managed by the host, the original text, modified status, file summary and running terminal PID are maintained. The fixed menu and persistent language screenshots have been checked; the current document's language no longer follows hover/focus hidden, but when switching active document/editor, it still uses the original status ownership. Evidence and installation are seen in [feedback records](feedback_review.en.md#section_a498febe6460).

On 2026-09-12, the actual text/icon centering of the status bar was extracted to [common inline layout](workspace_interaction.en.md#section_775ee7f88b35), the tags reuse the same content rules and retain an independent 35px height; the status bar's own height, business visibility and 900px compact threshold are maintained.

<a id="section_d3075c795be1"></a>
## R008.2 Common geometry and visibility of native icon buttons

On 2026-09-20, we again received feedback on new file offset and list switch icon blankness. The real window.html of Typora 1.14.10 retains the footer-btn class for these two buttons; base-control.css sets display:none, left and right 8px padding for them, and window.css only changes to inline-block when footer is hovered. The new icon still has inline position:relative and top:1px. Current tests omit these real classes and offsets, the old outer box centering conclusion cannot cover the icon shape.

Maintain the existing 22px operation slot and 16px official Codicon (R008.1/R021 have been verified sources), do not change the icon or change the status bar ratio. Add shared workspace-footer-icon-control role specifications for horizontal padding, flex display and centering of single icon operations; workspace-footer-icon-content specifies the carrier for icon operations inside, clear font icon position offset and baseline whitespace. The host adapter registers and destroys roles for new, more, list/tree switch and source code buttons, does not set top compensation for each button, does not include menu icons or outline expand arrows into the status bar rules.

Priority: Explicit hidden, host hide, and business hidden related to outline/source code/diff remain effective; 'non-hover hidden' is the presentation rule of the old location, which is canceled in this round. The two native packaging for icon switching are still determined by use-file-tree-style/use-file-list-style, and only the shared content layout is applied to the current display packaging, without forcing the display of both icon types at the same time. Events, original nodes, directory menus, and sorting status continue to be held by the original owner.

Validation adopts real host class, inline style, and selector to reproduce the old version failure, then checks the actual SVG center, complete hit, and non-hover visibility, cannot only measure the button outer frame. Covers 22/30px, 100/125% scaling, light/dark, source code/Git/margin/word count/language same area geometry, switching mode, menu events, and unload recovery; original Typora independent copy records real DOM and business visibility. Continue to use the bottom bar, status, and common interaction use cases, without adding new duplicate function frameworks.

2026-09-23 R008.3: The positioning refresh of the bottom bar file operations, word count, and language menu is unified to [Expand floating layer refreshor](workspace_interaction.en.md#section_f42f0a0f4c13). Decimal positions no longer repeatedly reverse push the origin; self-layout notifications do not trigger the next frame, real content changes still update. Original nodes, native delegation events, and existing geometry are retained.
