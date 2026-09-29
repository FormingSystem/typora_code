[Chinese](icon_mapping.md)

<a id="section_70dd191b51ec"></a>
# Workbench icon slot mapping

Currently, the functionality referenced by `59412a2` is based on the flat layout, retaining the official icons and confirmed status fixes. The user's latest requirement clearly specifies that the Explorer and real file tab icons should uniformly use the VS Code Seti icons that are fixed with the package. The icon scope covers the previous generic file icon decision, without changing the Monday layout function, nor restoring Open Editors, the bottom Panel, or the custom title layout button.

Official resources come from `microsoft/vscode-codicons`, fixed commit `1c47ab36a4bb845c437866405c2fa67b8ca0fe36`. Original SVG, Git blob, SHA-256, and licenses are seen in [Resource List](../enhancements/vendor/codicons/source_manifest.json). Display maintains the original viewBox, and does not redraw approximate paths. Seti uses VS Code `1.136.2` / `88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f`'s `vscode-theme-seti 10.0.0`, see [Seti List](../enhancements/vendor/vscode_seti/source_manifest.json) and [Third-Party Licenses](../enhancements/vendor/vscode_seti/ThirdPartyNotices.txt). Runtime loads bundled fonts and associated data, and does not access the local VS Code directory.

| Current slot | Official icon / behavior | Explanation |
| --- | --- | --- |
| SSH remote activity bar | Codicons `remote-explorer`, original `src/icons/remote-explorer.svg` | Fixed upstream commit, original viewBox; files still share Seti, verify light/dark and scaling |
| Explorer, search, quick open, and real file tabs | Fixed Seti filename / extension / language association | Shared `workspace_file_icon`; 16px slot, theme font size 150%, current 13px text corresponds to 19.5px glyph font |
| Markdown / TypeScript / TXT | `_markdown` U+E060 / `_typescript` U+E099 / `_default` U+E023 | Lighter version of the first two `#498ba7`, TXT `#bfc2c1`; darker version defined according to theme |
| Explorer folder | No folder glyph, only `chevron-right` | Seti has no folder / rootFolder definition; retain expand, collapse, and alignment |
| SCM changes, historical files, and difference tabs | Fixed Seti file type icons | Use actual file paths to call the same `workspace_file_icon`, SCM slot 16px |
| Directory/SCM group collapse | `chevron-right` | Expand rotated 90 degrees; SCM empty groups also display 16px arrow |
| Independent outline | Native `fa-list` list icon and native outline tree | User explicitly requested to restore original icons, retain original nodes; not repeated in Explorer |
| Activity file / Search / SCM | `files / search / source-control` | 24px icon, 48px continuous activity items |
| Terminal/Result functionality tabs | `terminal / search` Corresponding function icons | Views without real file identities retain function icons; real file difference tabs still use shared Seti |
| Git Graph toolbar | `search / terminal / settings-gear / git-fetch / refresh` | Retain verified extension-specific dimensions |
| Git Graph reference | `git-branch / tag / archive` | Icon background matches row track color; text follows theme; HEAD follows its reference |
| Git Graph details file tree | Files shared with Seti; directories retain Font Awesome Free 6.7.2 `folder / folder-open` | Files identified by actual path; directories retain the tree semantics of Graph itself and official SVG original path |
| Graph Find | `case-sensitive / regex / arrow-up / arrow-down / diff-multiple / close` | Retain existing search capabilities, do not add new modes |
| SCM commit and more options | `check / chevron-down` | Icon inheritance for commit button white foreground |
| SCM changes title | `check / refresh / git-branch / more` | Commit, refresh, open full Graph, more; 16px icon and 22px shared slot, inherit current theme foreground; [Source and product adaptation](git_scm_actions.en.md#section_ba171a3efb55) |
| SCM abandon changes confirmation | `warning` | Fixed upstream `src/icons/warning.svg` original 16×16 canvas; warning color is controlled by confirmation dialog semantics; [Confirmation design](git_scm_actions.en.md#section_0dc8fd410d77) |
| SCM remote reference | `cloud` | VS Code fixed version Git `Icons.remoteBranch`; original SVG is taken from the established Codicons version's `src/icons/cloud.svg` |
| Diff blank character display | `whitespace` | Fixed Codicons version's `src/icons/whitespace.svg` original 16×16 canvas; status is controlled by diff blank display configuration |
| SCM history reference | Corresponds to the formal reference icon | Inherits the colored tab foreground, not covered by the general gray |
| Shared menu | `check / chevron-right` | Check and sub-menu semantics |
| Mermaid tool | `remove / add / close / screen-full` | Retain the reading enhancement entry |

The real file icon entry is [workspace_file_icons.ts](../enhancements/src/workspace_file_icons.ts) and [workspace_explorer.ts](../enhancements/src/workspace_explorer.ts)：The source code URI first restores the real path; The Graph difference tab uses its real file path to provide Seti icons. Graphs, terminals, and third-party views without real file identities do not follow the URI prefix to guess file shapes. The native Graph/diff SVG slot separately shields stale FA pseudo-elements; does not modify the native outline entry. Closing tabs immediately releases the icon original node reference, uninstalls and recovers the original node and style that are still in use. [Drag follow preview](drag_and_windows.en.md) uses the existing icon and name from the source, does not maintain a second set of file type mappings; [Progressive search results](search_performance.en.md) does the same and continues to use the shared Seti entry.

Other implementation entries include [git_icons.ts](../enhancements/src/git_icons.ts), [git_source_control.ts](../enhancements/src/git_source_control.ts), [git_scm_history.ts](../enhancements/src/git_scm_history.ts), and [git_graph_panel.ts](../enhancements/src/git_graph_panel.ts). The fixed source of detailed icons and permissions are [Font Awesome list](../enhancements/vendor/fontawesome/SOURCE.json). The 35px single-line top bar uses the left native seven menu and the newly added terminal menu, middle navigation search, and right host window buttons; the window buttons are only replaced with the officially verified Codicons appearance, retain the original actions, and do not draw approximate icons. The menu only reuses the verified Typora API, and does not claim that the complete native menu tree is equivalent.

Verification entries include `test_workspace_file_icons.cjs`, `test_scm_file_icons.cjs`, Explorer, search, and file selector targets, checking shared identification results, real fonts, light and dark colors, virtual URI isolation, click open and icon resource release. The reference color is checked separately according to branch, remote, HEAD, tag, stash, and custom color palette. The classification icon and color of the code outline are seen in [Code outline and parsing environment](source_outline.en.md).

The run results and history count are unified in [Feedback review records](feedback_review.en.md). The specific scenarios that have been passed do not represent that all icon slots have the same DPI paired screenshots, and the number of resources does not constitute a full visual acceptance proof.

<a id="section_a454ad579b84"></a>
## Status bar window zoom

R014 adds an official zoom-in/zoom-out magnifying glass to indicate the current window's positive/negative zoom. The control overlay uses existing remove, add (fixed upstream plus same graphic mapping) and settings-gear; retains the original SVG and viewBox, displays 16px, and follows the public light/dark foreground switch. The source and adopted values are seen in [Window Zoom](workspace_zoom.en.md#section_6fc65ce9a78b) and vendor/codicons/source_manifest.json, and does not draw approximate graphics.

2026-09-19 R048: Check out the single-select reuse of `git-branch/cloud/tag/add` and complete the fixed Codicons same as the commit's `debug-disconnect` original SVG, blob, and SHA256. Regular actions 22px, reference details 44px, glyphs 16px; details do not occupy icon slots, complete behavior and evidence seen in [Branch Checkout](git_branch_checkout.en.md).

2026-09-20 R060: Extend the activity bar to use fixed Codicons' `extensions` original SVG, blob, and SHA256, reuse 48px slot/24px glyphs and public selection, focus, and sorting; 2026-09-22 R072.1 changes the lower-left settings to the same-origin official `settings-gear`, retains 48px slot/24px glyphs. The entry conventions for configuration and management are seen in [Community Plugin Design](community_plugins.en.md#section_fc4c560d1383).

R068.1 (2026-09-22): Fence copy uses existing official Codicons `copy`, successful `check`, failed `warning`; 16px glyphs, 24px compact actions, rounded/capsule focus walks shared interactions. The content outside the covering layer does not participate in the code block line box. Current feedback single line, light/dark/shrinkage and image/chart entry regression seen in [Code Block Evidence](../enhancements/tests/evidence/code_copy_20260922.json).
