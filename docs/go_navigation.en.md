[Chinese](go_navigation.md)

# R086 Go menu and line/column navigation

2026-10-05: add the authorized Go menu using existing navigation, and Ctrl+G line/column quick input. Preserve existing native menus and themes. Do not add unimplemented workspace symbols, problems or edit-history services merely because they appear in the screenshot.

## Reference and interaction

Pinned VS Code 6807068: editor/contrib/quickAccess/browser/gotoLineQuickAccess.ts and workbench/contrib/codeEditor/browser/quickaccess/gotoLineQuickAccess.ts. Ctrl+G starts with a colon and displays the line count. Accept line and optional visible column separated by colon/comma/#, negative positions, bounds clipping and tab conversion. Reuse the existing 600px centered quick-open styling, themes, focus and dismissal. Character offsets and modifier-based splitting are outside this change.

Enter or the result row confirms; invalid input does not navigate. Code/source typing previews scroll only, preserving cursor and history; Escape restores scroll/focus. Rendered native Markdown maps source lines only on confirmation, avoiding selection churn during input; blank/hidden syntax resolves according to native mapping, not screen lines. Model changes, closure, editor/workspace switches cancel stale sessions. Terminal, floating previews, unrelated inputs/modals and IME retain their keys. The explicit Ctrl+G request supersedes older use of that key within the editor without changing user configuration.

## Ownership and menu

Editor navigation ports supply local line sessions for source files, native source and Git code comparisons. Each owns the model/version, scroll snapshot and active identity. Shared UI parses input and invokes preview/restore/accept. Accepted jumps notify existing navigation history. Rendered Markdown uses the existing native mapping without reading disk or replacing drafts. Disable exact line navigation for rendered read-only comparisons without a column model; their existing back/forward history remains available.

Go uses existing history, file quick open, editor switching and source language navigation. Menu and keyboard share commands; availability follows the active instance and stale menu targets are rejected. Insert Go after View using the existing menu columns and overflow, retaining all other menus.

## Verification

Unit checks cover lines, columns, tabs, negatives, clipping, invalid input and large text. Real Chromium covers preview/accept/cancel, blur, editor/model changes, groups, read-only views, IME, terminal and menu state. Original Typora verifies trusted Ctrl+G, current in-memory source/native Markdown, back navigation and retained unsaved content. Cover four themes, narrow windows and zoom through existing geometry tests. Track final build, tests, isolated install/uninstall and local delivery separately.

## Implementation and boundaries

Candidate 2026.10.05.3 on 2026-10-05 connects source files, native Markdown source/rendered views and Git source navigation ports. Model changes/disposal cancel through the owning port; rendered Markdown rechecks memory and active document before acceptance. All four themes inherit existing quick-input roles; headings and Mermaid remain unchanged. Non-integers, extra components and unsafe integers are rejected; valid out-of-range numbers are clamped.

The original Typora 1.14.10 private desktop passed 30 checks covering OS-delivered Ctrl+G, unsaved text, split ownership, back history, four themes and native line/column mapping. Hidden Electron passed 36 checks including both locales, 420/1000px, 1/1.25 zoom, 20/100/1000-line parsing workloads and invalidation cleanup. Precise columns in rendered Git comparisons, full VS Code menu parity and other native platforms remain outside verified coverage. See the [delivery evidence](../enhancements/tests/evidence/go_navigation_20261005.json).
