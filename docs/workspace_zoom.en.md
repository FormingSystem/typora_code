[Chinese](workspace_zoom.md)

<a id="section_916b1e89966a"></a>
# Window zoom

2026-09-27 R014.2 Latest Agreement: Ctrl+=/- restore to window zoom; document content Ctrl+scroll wheel changed to edit font size. The old key positions / document full window scroll wheel agreement for R079 and R014.1 is replaced by the R014.2 at the end.

2026-09-27 R079 Historical Agreement (zoom part has been replaced by R014.2): sidebar uses Alt+B; window zoom in/out uses Alt+=, Alt+- and corresponding Shift/numeric keypad variants. Ctrl+B, Ctrl+=, Ctrl+- are returned to Typora native bold and heading level; the old date key positions are only recorded for source, other shortcuts see [native shortcuts priority](workspace_shortcuts.en.md).

<a id="section_2a3238562968"></a>
## R014 Window Zoom Shortcuts

2026-09-12: User feedback that Ctrl+= zoom in and Ctrl+- zoom out did not fully adapt; subsequent clarification that the main keyboard uses the equals sign. The current view menu directly calls native zoom, but the workbench shortcut does not have a corresponding command, and the terminal focus will exit the general keyboard handling early. The goal is to have all workbench areas use the same window ratio, and keyboard and menu behaviors are consistent.

<a id="section_aa4746ef8775"></a>
### Interaction and boundary

- Main key positions are Ctrl+= zoom in, Ctrl+- zoom out; at the same time, it covers Ctrl+Shift+= ("+") and Ctrl+numeric keypad plus zoom in; Ctrl+-, Ctrl+Shift+- and Ctrl+numeric keypad minus zoom out. The main keyboard also accepts the plus and minus characters reported by the keyboard layout.
- Each keydown executes one step; long press zooms step by step with system repeat events, and keyup does not repeat the call. Events that have been processed do not enter the document editor, terminal input, or other host shortcuts.
- Markdown, code and diff, sidebar search, quick open, regular dialog boxes and terminal all zoom the current window; they do not separately modify the editor or terminal font size, and do not use CSS transform/zoom to zoom the entire page.
- When the chart viewer is opened, it retains the existing Ctrl+plus-minus for chart local zoom. Input method combinations, Alt/AltGraph combinations do not trigger window zoom. Ctrl+0 retains Typora's 'document' format operation; restoring window ratio continues to use 'View → Actual Size', and this does not preempt it.
- Retain host zoom prompts, setting save and load semantics; do not add a second set of ratio configurations, do not rebuild documents, edit groups or terminal processes, and do not expand to window synchronization protocols.

<a id="section_31736b2150bc"></a>
### Responsibilities and Implementation

`workspace_zoom` Uniformly defines the identity of zoom in, zoom out, and actual size commands, menu text, and native adaptation; command registration belongs to the workbench lifecycle, failure rollback, and uninstallation removes registration. Actual zoom value and persistence are managed by Typora. Menus and `workspace_shortcuts` only call shared commands.

Window zoom is a global operation; shortcut determination precedes the exit branch of ordinary dialog boxes and terminal input; chart local interaction has priority. Consume keydown and corresponding keyup to prevent native or core subsequent listeners from repeating execution. When no native zoom method is provided, the menu is disabled and the shortcut does not consume, and no fake zoom success is fabricated.

<a id="section_dfb2da094844"></a>
### Already verified according to the basis

- Fixed [VS Code 1.136.2 Window Operations](https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/electron-browser/actions/windowActions.ts): `ZoomInAction` is Ctrl/Cmd+Equal, with Shift+Equal, NumpadAdd; `ZoomOutAction` is Minus, Windows also has Shift+Minus, NumpadSubtract. Each change is one level.
- Use `src/vs/platform/window/common/window.ts` with `zoomLevelToZoomFactor` using `1.2 ** zoomLevel`. The effective configuration baseline maintains the window scaling 0 as recorded in [Interface Baseline](vscode_design_baseline.en.md). System DPI, window scaling, and CSS font size are respectively verified.
- Typora 1.14.9 and current 1.14.10 native `appsrc/window/frame.js` `ClientCommand.zoomIn/zoomOut/resetZoom/setZoomLevel` have been verified: call Electron `webFrame`, update native `zoomLevel/zoomFactor/customZoom` and scaling hint. The overlay reuses this entry, without copying its internal implementation. The menu uses the ClientCommand of this window, maintaining the existing behavior, without calling `JSBridge.zoom` full-window broadcast.

<a id="section_bf2a51af8063"></a>
### Acceptance

Target regression covers main keyboard and numeric keyboard, long press, keyup deduplication, input method and Alt combination, modal priority, menu and command consistency, uninstall and reinstall. Isolate Electron's use of real keyboard input and real window scaling, checking for changes in scaling ratio, ensuring that the main content and terminal input are not contaminated.

Native Typora configuration verification for Markdown, code/diff, and terminal focus scaling and recovery. Check scaling hints, status bar geometry, editor model/draft and terminal session. After building, related startup regression and installation checks are passed, and delivery evidence is recorded. It is not allowed to equate test environment installation with user's existing window already loaded.

<a id="section_a3a7e58c7811"></a>
## R014 status bar scaling entry

On 2026-09-13, add the status bar window scaling entry according to user screenshots. The entry uses a fixed official Codicons magnifying glass. The control uses remove, add and settings-gear; the icon is only for display, still calls the existing R014 window scaling command. The ratio and persistence belong only to the native Typora layer. Read the actual Electron webFrame level / ratio; do not use devicePixelRatio to calculate based on system DPI. Do not save another ratio for the status bar.

The status bar control reuses shared group, control and text roles. The small panel is displayed above the entry, does not occupy a new line of main content and status bar. Click to open and support keyboard entry. Hover delay and leave close use a unified mechanism. Esc cancels and restores the focus / selection before opening. After external click close, continue the operation target without taking focus. After scaling, re-read the actual value, continuously synchronize changes from keyboard shortcuts or native menu. When host capability is missing, disable the corresponding action. If reading fails, do not display fabricated ratio. Uninstall and delete the entry, floating layer, listener and style.

This round compares with the fixed commit 645f29cc3176500b4b5762ba887cf2a7f0ffdf2c of VS Code 1.137.0's WindowZoomStatusEntry, using the following verified rules and host adaptation. Regression actual webFrame, same command ownership, light/dark, status bar height, zoomed popup positioning, regular editor and terminal focus, native isolated instance, and installation assets; do not treat UI testing as other pending acceptance features completed.

<a id="section_6fc65ce9a78b"></a>
### Fixed source and adoption strategy

| Fixed VS Code source code | Verification results and this product adoption method |
| --- | --- |
| `src/vs/workbench/electron-browser/window.ts:1132–1256` | Display when deviating from the default configuration value, with zoom-in/zoom-out for positive/negative directions; the popup order is remove, actual level, plus, Reset, settings-gear. Typora is reset to native level 0, and on 2026-09-13, it was previously shown at non-zero levels and hidden after restoring 100%, but now it is covered by R014.1 as persistent; both level and percentage read the current window, not from user configuration or DPI inference. |
| `src/vs/workbench/browser/parts/statusbar/statusbarPart.ts:186–211` | HTML hover 500ms, compact mode, click focus allows continuous operation; this product reuses bind_workspace_hover, adds explicit opening, focus retention, and priority positioning above, without reusing the timer/boundary algorithm. |
| `src/vs/platform/hover/browser/hover.css:37–48`、`src/vs/workbench/electron-browser/media/window.css:6–35` | Compact document content 12px, internal margin 2px 8px, graphics 16px, right group spacing 10px. Keep the common floating layer theme, border, and common control 4px radius; this product keeps the button 22px operation target, and the status bar height is completely determined by the existing common layout. |
| `src/vs/workbench/browser/parts/statusbar/statusbarItem.ts:153–164,230–231` | Mouse/Enter/Space open and focus. This product floating layer buttons move by Tab or left/right direction, Esc and external points reuse the unified exit stack; do not use the minus or plus characters in the screenshot to replace icons. |
| `src/vs/workbench/electron-browser/desktop.contribution.ts:203–215` | zoomLevel defaults to 0, supports decimals; zoomPerWindow defaults to true, no specific entry for visibility settings. This product does not copy these two configurations, keeps the host's window commands and native persistence. |

All the above paths are fixed to the commit `645f29cc3176500b4b5762ba887cf2a7f0ffdf2c`. Graphics come from the fixed commit `1c47ab36a4bb845c437866405c2fa67b8ca0fe36` of this project, adding original SVG for zoom-in and zoom-out; plus and existing add are the same graphic mapping from upstream, reuse add, remove and settings-gear also reuse existing resources, license and summary are maintained with vendor list.

In Typora 1.14.10's `appsrc/window/frame.js`, zoomIn/zoomOut reads webFrame level ±1, then calls setZoomLevel; the latter updates native persistence, File.option.zoomFactor and `#zoom-hint-current`. Therefore, the entry reads the actual state through this node as read-only observation, window resize and focus merge read, no polling, function replacement or window broadcast. When the self-controlled panel is opened, it only uses limited styles to hide the top native `#zoom-hint`, keeps the node, text update and 3-second lifecycle; restore on close or uninstall.

Gear calls the already verified parameterless `ClientCommand.showPreferencePanel()`, users set the ratio in the native 'Appearance → Zoom' settings and Ctrl+wheel option. Native makeHighlight does not support zoom deep chain, so it does not pass in guessed positioning parameters; the entry notes the setting location, does not introduce another set of ratio forms or persistence fields.

Entry uses the same commit 2026-light.json's statusBarItem.prominentBackground `#0069CCDD`, foreground `#FFFFFF`, and hover background `#0069CC`; Night references 2026-dark.json's `#3994BC` background/hover and white foreground. Configuration variables can override, public interaction layer applies hover, and do not spread significant status color to floating layer normal buttons.

<a id="section_44876a3ad79b"></a>
### Status bar entry acceptance result

67 project goals regression, shared hover 3 goals, start / status bar 2 goals, complete check and isolate native acceptance passed. Add test for 650ms stable state after Esc, cover keyboard recovery to entry and focus / mouse wait display, all kept closed; common hover during focus recovery suppresses re-entry. Real theme, geometry, installed assets boundary and native input method are uniformly recorded in [feedback](feedback_review.en.md#section_c63d09f40613).

<a id="section_03a2b2875779"></a>
## R014.1 Pointer area wheel zoom and persistent entry

2026-09-23 user request to cover old 100% hidden convention. The right lower window zoom entry is persistent when readable host ratio, reset still can continue operation; keep original icon, size, common status bar and overlay rules, read failure does not forge status.

Terminal content area's Ctrl + wheel changes 1px font size per step, range 6-100px. Adopt fixed VS Code `645f29cc3176500b4b5762ba887cf2a7f0ffdf2c`'s `src/vs/workbench/contrib/terminalContrib/zoom/browser/terminal.zoom.contribution.ts`: capture phase, block default/bubble, modify shared fontSize configuration and 6-100 range; this product is enabled by default with explicit authorization, does not copy upstream optional switch or trackpad classifier. Wheel write merges frame by frame, uses existing terminal configuration owner to persist and notify all surfaces; does not change window ratio or send Shell input. Before modifying font size, use xterm public marker to fix logical line start and character grid offset, FitAddon reorders and completes pixel synchronization before restoring the line; if at the bottom, continue to follow the bottom. Hidden surfaces recover when re-mounted, exit releases marker/frame task. Buffer is cleared by Shell or capacity eviction does not forge history; full screen backup buffer is responsible by application and PTY to redraw owner.

In the main text / title / list / table, Ctrl + wheel calls original R014 host window zoom command, per frame at most one step, keeps original character anchor point. Only handle when hitting `#write` or regular Markdown split view content; code block, inline code, CodeMirror/Monaco, images / videos / audio / charts / math, links, input controls, independent preview and modal interface return to owner. Ctrl + Alt/Shift/Meta combination does not take over; does not use keyboard focus to replace mouse hit, does not modify host zoom preference. Main text uses window ratio is adaptation to existing R014, does not add another font size configuration. Layout reordering retains read characters, when end / buffer boundary cannot be precisely aligned, abide by legal scroll range.

Acceptance covers real Electron wheel, original Typora candidate, terminal normal history / long line reordering / bottom / backup buffer, panel and split view, font settings synchronization and session not reconstruction, main text long text and excluded area, 100% persistent / reset / keyboard / light / narrow window, and continuous operation resource release. Test proxy and native platform separately record; do not consider Windows 11 evidence as Win10 scene acceptance.

R069.8 (2026-09-23) Correct the actual event boundary of the above exclusion rules: along complete composedPath exclude independent preview, do not misjudge main main text from shadow tree inner #write. Original window zoom, menu and shortcut of main text keep their original meanings; preview wheel only changes current reader ratio, does not execute these window commands. Acceptance must dispatch and bind main listener from real shadow node, see [link preview design](link_preview.en.md#section_030adb8bec54).

<a id="section_8c073bfde139"></a>
## R014.2 Content font size and interface zoom separation (2026-009-27)

The goal is to maintain readability of the document content and terminal when controls are minimized on small screens. Ctrl+=/- zooms the window through a unique host command; Ctrl+ wheel adjusts the font size of this window's editing area, and the terminal's font size is adjusted within this window. The editor and terminal each have their own session states, and new windows or split views inherit the same domain state. Changes to the document content, undo, PTY, or save do not affect the base font configuration. After exiting the window, the session zoom adjustments are cleared, and when reopened, the baseline is re-established using the persistent font settings and host window ratio. Explicit font settings are still managed by the original configuration owner.

Window zooming is still handled by Electron/Typora; shared session services calculate font size compensation based on the actual webFrame ratio and current ratio at startup, without using devicePixelRatio that includes system DPI. The editing view only applies font size and line spacing, and its own port, without zooming the toolbar, icons, or entire page. The main Markdown (including the editing area's padding) / code fence, native Markdown source code CodeMirror, Monaco source code / version / diff belong to the editing content; floating preview and media viewer continue to use their independent browsing ratio, and modal / input controls do not accidentally touch the main editing area. Terminal history uses existing markers / character grid offsets for positioning, and the bottom continues to follow; the backup buffer is handled by PTY for redrawing. The document content uses character anchors, native source code CodeMirror and Monaco use logical lines / character positions, and user subsequent input cancels stale recovery.

Fix VS Code 6807068's editor/contrib/fontZoom/browser/fontZoom.ts and common/config/editorZoom.ts to share EditorZoom for saving session font increments; terminalContrib/zoom/browser/terminal.zoom.contribution.ts is handled by the terminal font owner for wheel adjustments; windowActions.ts remains independent in changing the Electron ratio. This product adds font compensation for window ratio as per this explicit requirement, and changes the terminal wheel to session state, and cannot claim that the upstream original behavior has this behavior. Keep the wheel frame merging and visible layout recovery, without rebuilding the document content / model or terminal process.

Verify and compare the actual webFrame with the content font size product, toolbar geometry, current / new / split / hidden views, 20 operations, and destruction re-binding, dark / small screen / code fence / long text position; check that Ctrl combination events are executed only once, native format does not trigger repeatedly, and non-target areas do not accidentally consume. Original Typora and Electron input are separately recorded, and installation and two types of isolation uninstallation and reinstallation use the same candidate; un-covered platform / physical input is retained as is.

This acceptance and delivery see [78 native checks and installation evidence](../enhancements/tests/evidence/content_zoom_20260927.json). Native source code uses the host CodeMirror public scroll / coords / refresh port to recover logical characters; session state does not write configuration. Window lifecycle reset is tested through destruction re-binding, and the user's running window is not restarted; complete native restart loading is still done by the user after normal exit.
