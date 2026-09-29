[Chinese](workspace_shortcuts.md)

<a id="section_8ce46fdb372f"></a>
# R079 Native Markdown Shortcut Priority

2026-09-27 User explicitly: Retain Typora editing habits; Change the Ctrl key for the workbench to Alt when there is a conflict with native Markdown editing. The same day, R014.2 explicitly clarifies exceptions: Ctrl+=/- restores window zoom, and the editing area's Ctrl+wheel only adjusts content font size; this latest agreement replaces the previous Alt zoom key, and other keys remain unchanged.

<a id="section_79362472d87d"></a>
## Verification and Adoption

Based on Typora's official [shortcut table](https://support.typora.io/Shortcut-Keys/) (updated on 2026-09-06) and the KeyMaster / style commands in 1.14.10 original appsrc/window/frame.js. VS Code fixed 6807068's workbench/browser/actions/layoutActions.ts, workbench/electron-browser/actions/windowActions.ts only serve as reference for workbench commands; when conflicts occur, migrate according to user rules, without modifying the host shortcut configuration.

| Native Retention | Workbench Original Actions | Workbench New Key Positions |
| --- | --- | --- |
| Ctrl+B Bold | Sidebar Visibility | Alt+B |
| Ctrl+K Insert Link | Workbench Combination Key Prefix | Alt+K, subsequent Ctrl also changes to Alt, such as Alt+K Alt+O to open the project directory |
| Ctrl+\ Clear Formatting | Right Split Edit Group | Alt+\ |
| Ctrl+= / Ctrl+- According to R014.2, this is assigned to window zooming | Window Zoom In/Out | Ctrl+= / Ctrl+-, including Shift and small keyboard variants; title elevation can still be executed from the native menu |
| Ctrl+Shift+` Inline Code | New terminal | Alt+Shift+` |

Ctrl+P is native for quick open, Ctrl+O/S/Shift+S is equivalent file operation; Ctrl+R is recent, Ctrl+Shift+P command, Ctrl+Shift+X extension, Ctrl+Shift+F workspace search and Ctrl+` terminal visibility have no conflict with native editing in this context, retain. Ctrl+Shift+=/- shares the same unique window command with Ctrl+=/-.

<a id="section_404c78b9939d"></a>
## Responsibilities, Failures, and Cancellations

workspace_shortcuts uniquely owns the workbench sidebar and combination keys, remove Git local duplicate Ctrl+B; workspace_keyboard provides strict Alt determination, rejects Ctrl/Meta/AltGraph and input method. workspace_zoom and terminal_workspace still own their commands and lifecycles. After Alt+K, the second key has priority over single key actions, unknown/timeout/des focus cancel, do not retain the old Ctrl+K as an alias; modal and terminal retain existing input boundaries. Menu, tab, tree, and tool bar prompts synchronize new key positions, native format menu displays native shortcuts. Do not simulate new Markdown editing, do not change conf.user.json or user hot keys; third-party key positions conflicting with user customizations are handled according to actual configuration.

<a id="section_ac387a5cb7c3"></a>
## Acceptance

Hide Electron verification of new key positions, old keys are not consumed, combination key second key priority, repeated key, IME/AltGraph, terminal/modal and uninstall. Original Typora isolated window checks real document bold/link/clear formatting/title elevation/inline code entry and sidebar status, separate synthesis events and physical input evidence. Full check, menu/zoom/terminal regression, two types of uninstall/reinstall and post-local installation delivery; do not close user windows.

The results of the 2026.09.27.3 verification and installation are seen in [Evidence](../enhancements/tests/evidence/native_shortcuts_20260927.json). The real host has been verified to generate bold text with Ctrl+B; other editing keyboard shortcuts have only been confirmed to pass through the workbench, and the physical keyboard and OS accelerator still need to be verified on a real machine.

<a id="section_31578be856f3"></a>
## R079.1 Source code clipboard command wiring (2026-09-29)

Issue and Goal: In the original Typora, the source code Ctrl+V was blocked by Monaco to prevent the default action, and the model was not modified, while the paste function at the same location could insert. Fix VS Code `6807068`'s `src/vs/editor/contrib/clipboard/browser/clipboard.ts` to pass the desktop paste to `IClipboardService.triggerPaste`; `src/vs/workbench/services/clipboard/electron-browser/clipboardService.ts` Recalling native host. The embedded Monaco continues to use desktop shortcut keys, but only returns undefined from the BrowserClipboardService, and the desktop branch does not enter the Web readText fallback, resulting in a silent no-operation.

Scope and Responsibilities: The Monaco clipboard commands for source code, source code comparison, and read-only versions are unified under the existing `monaco_source_command` host adapter. Continue using the upstream command registration and key mappings, but provide high priority implementation only for the currently focused document content editor that has been registered; each editor is unregistered when it is destroyed. The find/replace input box continues to use its own text adaptation. Ordinary search, Markdown, terminal, and file tree retain their original owners, and do not add global Ctrl+V interception or copy another set of keyboard shortcuts.

Implementation and failure: Copy, cut, and paste share commands with the menu, preserving line/ multi-cursor metadata and undo; read-only allows copy, rejects cut/paste. When there is no Electron clipboard port, it does not take over the original command, and host failure does not rewrite the model or repeat the backup execution. Synchronous clipboard reading does not write content into another document after asynchronous waiting. The clipboard service still does not modify system configurations.

Acceptance: Record the evidence of the original host with Ctrl+V default blocked but the model unchanged before the fix; after the fix, verify the actual model, single insertion, Chinese multi-line, line/multi-cursor, undo/redo, read-only, search input and Markdown boundaries. Electron trusted keyboard and original host renderer events are separately recorded, and the menu cannot be considered as physical keyboard through calculation. Pressure test with 20 real inputs, 100/1000 rounds of low-cost command/lifecycle coverage. Complete check and isolation of uninstall/reinstall, native installation, each with their own evidence.


Same round expansion terminal: Trusted Ctrl+V actually sends control characters `0x16` to xterm, without executing paste. Fix upstream `terminalContrib/clipboard/browser/terminal.clipboard.contribution.ts` Paste command: On Windows, it is Ctrl+V / Ctrl+Shift+V, and on Linux, it retains Ctrl+V for Shell. Local terminal follows the same platform boundary, and its own key handler receives the existing paste entry; Electron reads and original menu share this entry, browser environment retains navigator back, still follows original multi-line confirmation and destruction protection. Ctrl+C without selection still interrupts the process, AltGr and input method do not trigger paste; do not pass terminal commands to the document service.

<a id="section_ea58d88bfd2d"></a>
## R079.2 Terminal focus under the workbench entry (2026-09-29)

Issue: Common shortcuts exclude all terminal input before Ctrl+P, making quick open unreachable. Fixing VS Code `6807068`'s `terminal/common/terminal.ts` adds `workbench.action.quickOpen` and `workbench.action.showCommands` to the default list of commands to skip Shell; `terminal/browser/terminalInstance.ts` determines routing before handling xterm, based on the actual command, rather than disabling the entire workbench.

Scope: Common window routing first processes Ctrl+P/Ctrl+Shift+P as global entry points, then passes other terminal input back to the owner. The main content, sidebar, bottom terminal, and editing group terminals share the same branch and selector, and do not copy shortcuts to terminal_surface. Retain existing window scaling priority, input method/229, AltGr, and modal protection. Do not alter other terminal key mappings or add new settings pages. Replace the original part where "all terminal input is not part of workbench entry".

Quick open itself holds query, cancel, and original focus snapshot: Repeating Ctrl+P uses the original instance; Esc restores terminal focus, opens the file to the file service, and on failure, follows existing feedback while preserving current content. Processed keys are blocked from re-use by the common consumed set, and are destroyed and cleared. The selector is not yet initialized, so it does not consume keys; the command panel still uses command:open.

Acceptance covers terminal visibility but main content gains focus, real xterm gains focus, bottom/editing group movement, single-time calls of Ctrl+P and Ctrl+Shift+P, no leakage of PTY for repeat/keyup, continued input after Esc, file selection, and input method/modal protection. Trusted Electron input and original Typora synthesized events are separately recorded, 20 rounds of switch and existing clipboard/IME regression; build, isolate installation/uninstallation, and native installation each leave evidence.
