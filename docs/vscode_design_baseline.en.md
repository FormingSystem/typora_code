[Chinese](vscode_design_baseline.md)

<a id="section_3128a3ab1a00"></a>
# VS Code UI design baseline

2026-09-24 R020.1/R034.8/R034.9: Clone the latest VS Code according to user requirements, fix `68070681e87284e2f22728f15fe3f3651fbf932b` (package 1.140.0, main development snapshot, not the stable release). The current workbench adopts the complete semantic color scheme of Light/Dark 2026, covering the old Modern colors of R074; the layout and dimensions retain the confirmed agreements of each area. The common model and transparent color for list selection/focus/hover are used, no longer designed separately for Git/Explorer. The source code files and SHA256 are seen in [source list](vscode_design_sources.json), and the adoption rules are seen in [shared selection](workspace_interaction.en.md#section_9868a19a3019) and [color comparison](workspace_colors.en.md#section_11dbcbed8727). The research cache does not participate in the operation.

2026-09-23 R074: Users reauthorize the color hierarchy of the unified functional area. The workbench color is changed to the same fixed commit's Light Modern/Dark Modern, framework `#F8F8F8`/`#181818`, functional content `#FFFFFF`/`#1F1F1F`, separator `#E5E5E5`/`#2B2B2B`; the following old 2026 colors are covered by this item, and the geometric and layout agreements are retained. Markdown, native preferences, and community settings still present by the original theme/owner. The scope, status mapping, and verification are seen in [color design](workspace_colors.en.md).

2026-09-10 Top bar regression fix: On Windows/Linux, the active bar uses the same `--typ-workspace-top` top boundary and available window bottom edge as the editing area, fixing the problem that the core `100vh` was covered by the 35px top bar from y=0; the 48px function row and 24px official icon are kept. The original 64px bitmap of Typora contains transparent margins, and according to user requirements, the image box is changed from 16px to 24px, the left and right margins are changed to 4px, and the total placeholder remains 32px.

The module boundary adopts fixed Light 2026/Dark 2026's `sideBar.border`, `editorGroupHeader.tabsBorder`, `statusBar.border` common values `#F0F1F2`/`#2A2B2C`, the sidebar and status bar backgrounds take `sideBar.background`'s `#FAFAFD`/`#191A1B`. The implementation is seen in `workspace_chrome.css`: the sidebar drag line no longer reads the host `--window-border-color` which becomes transparent when maximized, the lower edge of the tab bar and the upper edge of the status bar use 1px thin line, no new card, rounded corner, or global padding is added. The target verification of the active bar covers 0/35px top margin, window size changes, 125%/150% scaling, real click of Explorer and bottom buttons, and the boundary between maximized light/dark themes; the target verification of the title bar checks 24px identifier and original menu placeholder.

The current product is according to user confirmation, with `59412a2` as the reference for flat layout and functional scope, retaining stable fixes, and is not a full library restoration. The VS Code numbers in this text are previous verified research facts, and are no longer as mandatory targets for Modern transformation or unlimited function expansion.

The current implementation of search and drag is respectively seen in [Large Directory Search Performance](search_performance.en.md) and [Left-Click Drag and Independent Window](drag_and_windows.en.md). Search references independent matching and streaming result responsibilities, and does not connect to the VS Code backend; tags are implemented according to the native HTML DnD, tag images, and actual window boundaries of fixed VS Code, removing the 30px offset rule; independent windows use Typora host. The active bar retains a 6px drag start.

Current interface: Typora borderless window with 35px single-line top bar (Typora seven types of menus and terminal), 48px continuous active bar, 35px edit tab, 26px Explorer tree line and 22px SCM line; Explorer has no Open Editors and compact directory chain, outline is independent; Explorer and real file tabs use fixed Seti, outline retains original fa-list. Search single-click below preview, double-click to open; on 2026-09-12, according to the latest requirements, terminal defaults to independent bottom panel and can be moved to the editor; SCM does not add file filter box. Central Git Graph retains the verified extension layout and correctness fix.

Edit tab uses 13px Segoe UI with Light 2026 / Dark 2026 status colors; Ctrl+P and central search entry in the top bar open `440ec3f` file selector. The current width of the selector is `min(62vw, 600px, calc(100vw - 12px))`, and the maximum height is `min(70vh, 560px)`; result line is 22px, input box is 23px. `440ec3f` is a historical commit identifier, not 440px size. Single-line top bar is 35px, menu line is 24px, search box is 22px, window control buttons are 46px wide, taken from fixed VS Code source code; physical keyboard and native accelerator conflicts have not been verified; verification records are seen in [Feedback Recheck Records](feedback_review.en.md).

Differences in the editor's front and back changes, open version / file, search and more actions are located on the right side of the tab line of the corresponding editor group, using 16px Codicons and 24px buttons; when switching to other types of tabs, the group difference actions are removed. Below retains 26px high, 13px font version path line: in parallel mode, it displays old and new versions side by side, and in inline mode, it displays both versions in the same line and the mode entry. 26px is the compact path line value of this workbench, and it does not claim that all VS Code versions use the same height.

Auto layout adopts fixed VS Code and Monaco 0.56.0's [diff options default value][diff_options]: `renderSideBySideInlineBreakpoint=900`, `useInlineViewWhenSpaceIsLimited=true`. In normal display mode, when manual options are set to side by side, the actual width of the difference editor does not exceed 900 CSS px, then it uses inline mode, and when it exceeds 900 CSS px, it recovers to side by side; it is based on the width of the editor within the corresponding editor group, not the entire window width. Title follows Monaco's actual rendering mode update. Manual inline and automatic narrow mode switching are independent; manual inline does not recover to side by side when the group width changes. `splitViewDefaultRatio=0.5` only indicates the initial left and right versions each occupy half, and does not participate in the 900px threshold calculation.

More diff menu integrated with Monaco's actual support for hidden unmodified areas, `experimental.showMoves`, and inline and accessibility viewers when space is insufficient. `F7` / `Shift + F7` use the next/previous of the accessibility diff viewer; regular next/previous changes retain the tab row arrows. Mode switching retains the current selection and viewing position, and does not add placeholder buttons for unimplemented workbench features.

<a id="section_cc27cf1bbac5"></a>
## Verified VS Code reference materials

On 2026-09-12, file and terminal values still take from the fixed commit below:

| Object | Adopted value | Upstream location and native boundary |
| --- | --- | --- |
| File tree indentation | 8px per level; file lines have no empty expand slots | `src/vs/platform/list/browser/listService.ts`, `src/vs/workbench/browser/parts/views/media/views.css`; retain the 26px line height of this workbench |
| Explorer and terminal pop-up menus | 13px font, 24px line height, 4px padding top and bottom | `src/vs/base/browser/ui/menu/menu.ts`; common components apply the same geometry |
| Terminal panel | Initial height takes 40% of available height; user adjustable; top bar 35px | `src/vs/workbench/browser/parts/panel/panelPart.ts` and workbench panel title rules; subtract the host title bar and status bar |
| Terminal session and tool icons | List 22px line height, 16px font, 22px operation target | `src/vs/workbench/contrib/terminal/browser/media/terminal.css`; list default 120px, narrow mode 46px, drag boundary see below R006.1 |
| Terminal activity bar entry | 24px font, 48px click target | `activitybarPart.ts`'s `ICON_SIZE=24`; 48px adopted current confirmed continuous activity bar function line, panel tools still 16px |
| Terminal configuration default | Windows font 14, buffer 1000 lines, minimum contrast 4.5, list on the right, hidden when single session | `src/vs/workbench/contrib/terminal/common/terminalConfiguration.ts`; actual setting range see [Terminal description](terminal_operations.en.md) |

System file / folder selection window calls Typora 1.14.9 which already has `dialog.showOpenDialog`; local code does not draw a path input box instead of system selection. Menu behavior and service responsibilities see [File operations](file_operations.en.md) and [Workbench architecture](workspace_architecture.en.md).

Research date of 2026-09-09: **VS Code 1.136.2, commit `88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f`, Light 2026, Modern UI, default layout density**. The software version is taken from the local release file, the theme and editor font are taken from the effective user configuration; the Modern UI is taken from the actual effective `config.workbench.experimental.modernUI=true` in the local experimental configuration, not just the default value in the settings file.

[Machine-readable research record](../enhancements/src/vscode_design_baseline.json) saves the verified values, whether it is used in the current runtime depends on the actual entry; [Source and summary list](vscode_design_sources.json) records the fixed source code and the method of evidence collection; [Icon slot table](icon_mapping.en.md) records the official icons actually used in the frozen version. Screenshots can only help to discover omissions, and cannot replace source code values.

| Upstream object | Verified reference values and semantics | Fixed version basis |
| --- | --- | --- |
| Workbench content, menu, and filename | 13px / 400; Windows Segoe WPC, Segoe UI, Chinese uses upstream Microsoft YaHei fallback | [Workbench font](https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/browser/media/style.css), [Modern font hierarchy][font] |
| Sidebar title, partition title | 12px / 600 | [Modern font hierarchy][font] |
| Digital badge | 10px / 400; do not let the 13px of the content cover | [Modern font hierarchy][font] |
| Source code editor | Local `editor.fontSize=16`, Consolas/Microsoft YaHei/Courier New; line height is calculated by the default value of the editor | Local effective editor configuration; has been refined to the runtime baseline |
| General command icon | Official Codicons, usually 16px; retain the original shape and status according to the role of the control | [Workbench icon rules](https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/browser/media/style.css), [Icon slot table](icon_mapping.en.md) |
| File type icon | JSON mapping, shape, light color coverage of the built-in `vs-seti` theme; unified according to the latest user requirements for use in Explorer, search, quick open, SCM/history/Graph real file lines and file/diff tabs; Git operations and outline symbols retain their dedicated icons | [Built-in Seti](https://github.com/microsoft/vscode/tree/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/extensions/theme-seti) |
| Active bar | Modern target 36×36px, icon 24px, 8px between targets, selected background 32×32px; 44px card with 4px outer placeholder | [Active bar constants][activity], [Modern active bar][activity_style] |
| Partition Title / File Tree Row | Modern partition title 28px; file tree line 22px, do not share one line height | [Modern initialization][modern], [Explorer line height][explorer] |
| Card Spacing, Border and Corner Radius | Margin 4px, adjacent card spacing 4px, inner 0px, border 1px, large rounded corners 8px; shared boundaries remove corresponding corners/replicated borders according to upstream | [Layout constants][layout], [floating panel][floating], [size registration][sizes] |
| Small Control Corner Radius | small 4px, medium 6px, large 8px, According to Corresponding Control Source Code | [Size Registration][sizes] |
| Scroll Bar | Modern UI Default 8px | [Modern Initialization][modern] |
| Window zoom | Current user and repository have not overwritten `window.zoomLevel`, configuration baseline 0; system DPI and image pixel ratio are recorded separately | Fixed version window configuration; cannot use CSS transform to compensate for incorrect dimensions |
| Color | Light 2026 and its inheritance rules; modern activity items use `modernActivityBarItem.*`, cannot mistakenly use classic `activityBar.*` | [Light 2026][light], [Theme Role][theme] |
| Git Graph | Fixed extension v1.30.0 layout/settings, workbench border and font use the above host baseline | [Git Graph Matrix](../enhancements/git_graph_features.en.md) |

Before each interface change, first locate upstream rules, status, and effective branch, record it in the corresponding matrix and implement. Verification should distinguish actual CSS layout pixels, DPI, window zoom, viewport, and content scrolling. Do not subtract screenshot dimensions directly under different zoom levels. Sidebars and editing groups that change with user dragging should be validated proportionally and constrained, not write dead positions in screenshots.

Hover tooltip uses fixed version [hoverWidget.css](https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/base/browser/ui/hover/hoverWidget.css) inner padding `4px 8px`, maximum content width `500px`, and line height `1.5`. Background and border read Light/Dark 2026's `editorHoverWidget.*`. Display delay is the user-specified **1000ms**, not VS Code's default delay; floating layer displays original link and target position within the project, percentage-encoded Chinese paths and titles are displayed as readable text; selectable text or original link can be chosen, and when moved into the floating layer, there is a 250ms grace period. It does not modify Typora's main content DOM, does not read the target file or access the network.

The current table is the design basis, not a full function or full visual acceptance completion declaration. Complete source code values, actual style application, hidden Electron interactions, real Typora windows, and screenshots with the same DPI are different evidence layers; if any layer is missing, keep the gap in [Workbench Matrix](workbench_parity.en.md).

[font]: https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/contrib/modernUI/browser/media/fontRamp.css
[activity]: https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/browser/parts/activitybar/activitybarPart.ts
[activity_style]: https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/contrib/modernUI/browser/media/activityBar.css
[modern]: https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/contrib/modernUI/browser/modernUI.contribution.ts
[explorer]: https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/contrib/files/browser/views/explorerViewer.ts
[layout]: https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/services/layout/browser/layoutService.ts
[floating]: https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/browser/media/floatingPanels.css
[sizes]: https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/platform/theme/common/sizes/baseSizes.ts
[light]: https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/extensions/theme-defaults/themes/2026-light.json
[theme]: https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/common/theme.ts
[diff_options]: https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/editor/common/config/diffEditor.ts

Single-line top bar with height of 35px: On the left, retain the seven categories of menus: Typora files, edit, paragraphs, formatting, view, theme, and help. Add a terminal menu before the help menu based on the authorization on 2026-09-12. In the middle, include back, forward, and file search. On the right, reuse the host window buttons. The menu is organized by the local renderer, and only calls the verified Typora API. It does not use the entire `Menu.popup` or modify ASAR. The capabilities and dynamic states are defined by the actual wiring, and it does not claim to be equivalent to a complete native menu. The menu rolls down below the top bar according to the available height, supporting Shift + scroll.

The current implementation, historical baseline, and verification results of each layer are unified in [Feedback Recheck Record](feedback_review.en.md). The running count of the old layout cannot prove that the subsequent activity bar, visible title, margin, or status bar obstruction issues have been fixed. This document only maintains the design source and the actual adopted rules.
The Markdown document content continues to use the original status bar margin slider: single side 0% to 24%, default 0%, only changing the width of the active document content box and retaining the reading paragraph. The outline is synchronized with the complete visible title. The document thumbnail and title recognition share the readable viewport excluding the status bar. These are the current reading behaviors, not from the old Modern layout size table. Operations are seen in [Reading Position and Title Localization](../enhancements/README.en.md#section_6d0ba836f995).

<a id="section_8920777d488a"></a>
## 2026-09-13 Graph Local Verification

R024 This time, the VS Code 1.137.0 fixed version is read from the local files. The `645f29cc3176500b4b5762ba887cf2a7f0ffdf2c` is only used to verify the button, hover, and layout of the built-in SCM Graph. The rest of the workbench continues to use the previously frozen basis. The actual user configuration boundary, adopted numerical values, and all Graph-specific keys' differences are seen in [Graph Configuration Verification](git_graph_configuration.en.md). No use of the previously revoked 1-second delay guess, and no overall migration of the old baseline table.

2026-09-13 Rounded corner supplement: R020/R022 use the same fixed 1.137.0 source code of `cornerRadius.small=4px`, share the coverage of the status bar, Graph commit/file line and normal operations; the split seam retains independent shapes. This reference comes from the Modern UI control rules, and it cannot be generally referred to as all VS Code configurations have the same rounded corners; this project only adopts the default of the controls as required by the user, and the complete source and responsibilities are seen in [Rounded Design](workspace_interaction.en.md#section_ab9c036c1658).


2026-09-13, R006.1: Fix the `TerminalTabsListSizes` definition of 1.136.2 to 22px lines, 46px narrow list, 80px wide list minimum, 120px default, and 500px maximum. `terminalTabbedView.ts` defines the main terminal minimum as 120px, and `terminalGroup.ts` defines the split view minimum as 80px. According to this, add list and split view separators. Allow the same window to drag and drop groups/group internal sessions. The final confirmation only distinguishes the physical hover and click states, without changing the already delivered Git actions. The Terminal source is from the Microsoft official fixed commit. The cache has been verified, and the operation does not depend on the cache.

<a id="section_7afb366a9bba"></a>
## 2026-09-13 SCM Operation Design

R027 Continue to use the already verified VS Code 1.137.0 fixed commit. Verify `scm/history/title`, commit and reference menus, toolbar hide and restore, repository summary and working tree conditions. The numerical values, source files, and adaptive boundaries of this product are uniformly recorded in [SCM Operation Design](git_scm_actions.en.md#section_1cfa7c97d49b). No change to the original hover delay, common rounded corners, or file line tab cropping design.


2026-09-13，R029：Recheck fixed 1.136.2's `titlebarpart.css` line 244 Command Center hover rules, and Light／Dark 2026 independent colors. According to user requirements, keep the top bar search neutral background, use public interaction variables to reference the original top bar foreground; the selected color of the ordinary toolbar is not applied to the search box. The upstream still has theme-related hover feedback, sources, adoption differences and acceptance see [Top bar search design](workspace_interaction.en.md#section_c8ea084ead7e).

<a id="section_1afea8ad8eac"></a>
## 2026-09-13 Document tab menu

R030 check fixed VS Code 1.137.0 commit `645f29cc3176500b4b5762ba887cf2a7f0ffdf2c`'s `editor.contribution.ts`, `editorCommands.ts`, and `fileActions.contribution.ts`. Adopt tab target and belonging group, close group, preview/fixed independent state, adjacent splitview/move and file action available conditions; the menu reuses existing public dimensions, rounding, theme and viewport positioning. Source code link, implementation responsibility and extension provider differences see [Tab menu design](editor_tab_menu.en.md#section_f187cb52507a), no extension host is added.

<a id="section_9f6083ef669a"></a>
## 2026-09-13 File tab and editor top

R034 According to the user's new screenshot, fixed VS Code 1.137.0 commit `645f29cc3176500b4b5762ba887cf2a7f0ffdf2c`'s Modern tab: 32px hit line, 24px indented rounded bottom color, 13px title, hover cover close slot; Markdown file tabs use the latest requirements of the same day to uniformly use the existing Seti file icon, no 'preview' prefix is added for reading/editing. Cancel the 20-character file name truncation, wide files are cropped by actual group width. Source code and diff use 22px path bar, diff operations remain on the right of the belonging group tab. This area's previous flat 35px tabs and black top line are replaced by this authorization; the native menu top bar is still 35px, unaffected. Sources, status division and acceptance see [File top design](editor_header.en.md).


<a id="section_2bd3e22235f3"></a>
## 2026-09-13 SCM internal drag boundary

R035 According to the fixed VS Code 1.137.0's sash/splitview and Modern internal panel rules, adopt 4px coverage hit, 300ms hover feedback and transparent normal state, delete SCM change/commit grid placeholder of 7px. Real track boundary is determined by grid positioning, hover does not re-layout, fold and hide are preserved original state. Sources and acceptance see [Splitter design](workspace_interaction.en.md#section_d8d0a812d785).

<a id="section_3c23b7f12e07"></a>
## 2026-09-13 Title function navigation and full name of detail branch

R034 Continue to fix VS Code 1.137.0 commit `645f29cc3176500b4b5762ba887cf2a7f0ffdf2c`, check breadcrumbs configuration, Model, Picker, Control and style: adopt 22px navigation and selector line, 13px text, 16px icon, directory and symbol hierarchy, default visibility and sorting, user/workspace/language coverage strategy. Implementation reuses existing file service, native title judgment and code symbol provider; when ordinary source code has no other provider, the empty editor type action is not displayed. The selected color in light and dark is adopted from shared theme roles, the actual Night text and mouse hover contrast is separately checked. Fixed sources, adoption values and platform boundaries see [Breadcrumbs design](editor_header.en.md#section_c426996c1d1c).

R022 based on the last two VS Code screenshots, clearly defines two display contexts: the long branch name at the end of the list is truncated, while the details card shows the full name. The list of shared badges defaults to 18px single line and 100px name width limit; the details card removes this width limit, and when the name exceeds the card's width, it wraps to the next line and increases the height. Icons, colors, and rounded corners continue to be shared. The previous issue of text wrapping being cut off by a fixed 18px height is fixed using the same configurable box model. The acceptance check verifies the actual character boundary, see [Details badge design](workspace_interaction.en.md#section_6c607611909e).

2026-09-13, R020: When a row is selected, it is filled with a fixed 1.137.0 Light/Dark 2026 non-active selected background and foreground. The unified interaction layer management, actual host theme-driven, is adopted. Sources, adopted values, and avoidance of test injection hiding defects are verified in [Selected row light/dark theme](workspace_interaction.en.md#section_17aa2f38ab4d).

<a id="section_9d5a208d3b8f"></a>
## 2026-09-13 Status bar window scaling

R014 checks the fixed VS Code 1.137.0 commit 645f29cc3176500b4b5762ba887cf2a7f0ffdf2c's WindowZoomStatusEntry, statusbarItem/statusbarPart, window.css, hover.css and desktop.contribution. Non-default level entry, official direction magnifying glass, actual level and minus/plus/reset/gear order are adopted; 12px compact text, 2px 8px internal spacing and 10px right group spacing are reused in the public floating layer. The icon still comes from the fixed Codicons 1c47ab36 original SVG, plus reuses the same mapping add. The host ratio and settings remain Typora's ownership. The status bar height, 22px operation target, and 4px control corner radius follow this product's public rules; native preferences have no scaling deep chain, using a parameterless entry. Sources and regression are verified in [Window scaling](workspace_zoom.en.md#section_a3a7e58c7811).

<a id="section_db1045e83387"></a>
## 2026-09-22 Settings floating layer, tab line wrapping and opened editor

R072.2/R073 adopts the fixed VS Code 1.137.0 commit 645f29cc3176500b4b5762ba887cf2a7f0ffdf2c. `modalEditorPart.ts` takes the default upper limit 1400×900, minimum 400×300, 33px title, maximized 16px margin; does not transplant general editor migration and dragging. `multiEditorTabsControl.ts#doLayoutTabsWrapping` is used to open the line wrapping and group width and available height retreat, default `workbench.editor.wrapTabs=false`. `editorQuickAccess.ts` takes `edt active `, current group recent activation order, name/path filter and line-by-line close. Geometry retains this workbench's adopted 32px tab and 24px tool button, source file icon reuses existing go-to-file; theme and scaling actual regression is verified in [This round evidence](../enhancements/tests/evidence/preview_settings_20260922.json).


<a id="section_e3b8477467d9"></a>
## 2026-09-23 Independent preview edge and corner adjustment

R069.2 read fixed 1.137.0 commit of [sash.css](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/base/browser/ui/sash/sash.css), using 4px margin and 8px orthogonal corners, directional cursor; 170px sidebar minimum width and 220px editing area retain existing shared agreement. Initial 40%/minimum 120px height follow this project preview, independent lower-left docking defined by user's current requirement, not called upstream default layout. Close using existing official close icon and 24px common operation container. Native validation includes rectangular and elementFromPoint real hit, avoid sidebar background obstruction being missed by outer frame check.

<a id="section_27f2be05ec57"></a>
## 2026-09-27 R065.3 / R074.7 review

Fixed 6807068's menu.ts only generate keybinding with value and real submenu indicator, 24px line height, 2em tab left and right whitespace, tab right 2em fast shortcut left 2em total 4em; this tool calculate width based on maximum real line, reuse tail whitespace for right arrow, avoid permanent three-track, and supplement actual scrollbar occupation. This is existing menu adaptation, no new menu function. 2026-dark.json's editor.background/foreground respectively #121314/#BBBEBF, document content Dark use this baseline; title #CE9178 reserved for user, Night and Cpp font geometry not changed. Code block independent VS Code theme continue managed by existing service.

2026-09-27 R074.7 added: added VSCode2026_Light/Dark, official 2026-light/dark.json complete include chain and summary saved in vendor/vscode_themes; code service read theme explicitly identity, editing status and token same source. Light editor #FFFFFF/#202020, cursor #202020, selection #0069CC40; Dark editor #121314/#BBBEBF, cursor #BBBEBF, selection #276782dd. Original Cpp dual theme/Night follow original configuration, title and font exception see workspace_colors design.
