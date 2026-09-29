[Chinese](git_graph_configuration.md)

<a id="section_843a644f9fdb"></a>
# Git Graph configuration and VS Code verification

<a id="section_36f16abdbfa5"></a>
## R024

2026-09-12, user requested to obtain the Graph configuration from VS Code and fix Typora, and confirm the alignment of screenshot-related buttons, hover, and layout for this round. The screenshot is the built-in Graph for VS Code source code management; the Marketplace Git Graph extension is not the source of configuration for this round. The user ultimately revoked the judgment that 'details should wait 1 second', and implemented according to the verified default and actual behavior. The search preview still remains responsible by [R023](search_performance.en.md#section_7222856082bd).

Native release file this time reads to **VS Code 1.137.0, commit `645f29cc3176500b4b5762ba887cf2a7f0ffdf2c`**, different from the previous baseline of 1.136.2. User settings use Light 2026, without explicitly overriding `scm.*`, `git-graph.*`, or `workbench.hover.*`; there is no `.vscode/settings.json` in the current project, and no user Profile directory. The following is the default verification for the native local folder scenario, which does not represent unknown remote workspaces or extension runtime settings. Read-only verification, no modification of VS Code configuration; other workbench design baselines are not migrated with this version upgrade.

<a id="section_25ffe6400acd"></a>
## All Graph-specific configuration differences

Fixed version [SCM configuration registration](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/workbench/contrib/scm/browser/scm.contribution.ts) only registers the following 5 `scm.graph.*` keys. Typora originally had a complete Graph and sidebar sharing a repository controller, but not all settings were simultaneously applied to both views; the table clearly distinguishes, and it cannot be claimed that the sidebar supports it based on the presence of an item in the settings page.

| VS Code configuration | Default, scope | Typora status and this round's handling |
| --- | --- | --- |
| `scm.graph.pageOnScroll` | true, boolean | `auto_load=true` only connects the central complete Graph automatic pagination; the sidebar uses 'load more'. This round records differences |
| `scm.graph.pageSize` | 50, integer 1–1000 | `initial_count=300`, `page_count=100`, 1–2000; controller and sidebar reuse already read commits. This round retains existing configurations |
| `scm.graph.badges` | filter；all/filter | The sidebar displays all references through the show_tags/show_remotes/show_remote_heads switch, without providing a filter by reference for badges and merging of similar reference counts; the central combine_refs is not equivalent. This round records differences |
| `scm.graph.showIncomingChanges` | true, boolean | No Graph-specific input tag switch; the existing synchronization status is not the same function. This round records differences |
| `scm.graph.showOutgoingChanges` | true, boolean | No Graph-specific output tag switch; the existing push operation is not the same function. This round records differences |

<a id="section_0bd71ca147f4"></a>
## Buttons, hover and layout

| VS Code configuration or implementation rules | Verified value | Typora adoption and boundary |
| --- | --- | --- |
| `scm.alwaysShowActions` | false; hover or focused lines immediately display actions, true always visible | `history_always_show_actions=false`, only manages the sidebar Graph commit/file line; retains other existing SCM action strategies. Expansion does not equal focus |
| `workbench.hover.delay` | Windows/Linux 500ms; macOS 1500ms, minimum 0 | Public default 500ms, modules can override through delay_ms; this round verifies Windows, does not claim macOS default is aligned |
| `workbench.hover.reducedDelay` | 500ms, minimum 0 | Graph has not enabled reducedDelay; no new settings for unused branches |
| Hover group | `scm-history-item`, when displayed, the group switch updates in real time | Implemented by shared hover group local policies; restores initial wait after exit/click/scroll/cancel |
| Location | RIGHT, target is complete history-item with indicator corner; vertically centered | Git provides a complete list of avoidance areas; additionally includes a scrollbar; trigger with focus still returns to the commit line. Right, left, down, up candidates and space constraints are handled by the common layer, and never cover the operation area |
| Appearance | compact=true, 12px font size, 19px line height, 2px 8px internal margin; with-pointer rounded corner 3px | Shared compact role and indicator corner, Git only organizes content; long messages wrap, maximum content boundary follows the common 500px, internal scrolling when space is insufficient |
| Graph/field | Line 22px, track 11px, citation 18px, field/action gap 4px | Retain existing line height, track and citation; commit action displays slot 22px, occupies space only when mouse or focus appears; expanded file line allocates 22px action slot when hovered/focused or in constant display setting, status column is fixed; name/directory share end trimming |
| Close and asynchronous | Click/leave/Escape, cancel target; old details cannot replace new objects | Shared cancellation signal and 250ms entry tolerance; scroll/window zoom close, repository+commit cache remains unchanged. No Git write operations are executed |

Position and appearance based on [Graph renderer](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/workbench/contrib/scm/browser/scmHistoryViewPane.ts), [SCM style](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/workbench/contrib/scm/browser/media/scm.css), [HoverWidget](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/platform/hover/browser/hoverWidget.ts), and [hover.css](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/platform/hover/browser/hover.css); timing based on [configuration registration](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/workbench/browser/workbench.contribution.ts) and [HoverService](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/platform/hover/browser/hoverService.ts). Not copied from upstream implementation.

<a id="section_22c75af4f7ef"></a>
## Peripheral setting boundaries

`scm.defaultViewMode`、`scm.compactFolders` is responsible for the SCM file tree, `scm.defaultViewSortKey` is responsible for file sorting, `scm.showActionButton` is the commit button, `scm.countBadge` is the number of active tabs; neither is a Graph-specific key. The tree/history_tree/sort_order in Typora's sidebar and the partition height and switch saving are stored in the existing SCM layout state, while the central file_view/compact_folders is in the Graph settings; their purposes are independent, and it is not claimed that the configurations are mutually connected. The default right-side details in Graph are not the inline/docked setting of the central `details_location`.

Typora also has independent settings for sorting/parent, stash/reflog, line styles/color, central column width and column visibility, citations, avatars, signatures, reviews, PRs and Git commands; this round does not delete or forcibly change to VS Code's default, nor does it introduce new pagination or input/output implementations. The saving, validation, cancellation, and repository isolation and import/export of existing configurations continue to be managed by `git_graph_settings` and the controller.

<a id="section_ab61f90965e2"></a>
## Acceptance

Baseline reproduction of the same result does not include preview and card covering actions; real Chromium pointer verification actions appear immediately, the card and the entire list/scroll bar do not overlap, and the mouse-in copy and end-of-line operations can be clickable. Covering brightness, different zoom levels, narrow/wide sidebar, expansion/focus, long messages, edge rollback, asynchronous growth, refresh/destroy, and setting saving reload. Native Typora isolation verification and building, script checking separately record evidence; incomplete testing cannot use old passed tests as substitutes. The delivery status is concentrated on [Feedback Records](feedback_review.en.md), and the local logbook manages the progress of this round.

2026-09-13 Rounded corner supplement: R020/R022 use the same fixed 1.137.0 source code of `cornerRadius.small=4px`, share the coverage of the status bar, Graph commit/file line and normal operations; the split seam retains independent shapes. This reference comes from the Modern UI control rules, and it cannot be generally referred to as all VS Code configurations have the same rounded corners; this project only adopts the default of the controls as required by the user, and the complete source and responsibilities are seen in [Rounded Design](workspace_interaction.en.md#section_ab9c036c1658).

File line append verification: adopts the VS Code resource tag rule of 'inline name and directory share cutting area, operation display according to hover/focus', corrects the problem of separately compressing name/directory and the constant operation column of history file line; does not consider the user's already revoked coverage layer or click-selected as the basis for implementation. See [File Name and Line-end Operation](workspace_interaction.en.md#section_57bf0678e5b9).

<a id="section_d2f98d314147"></a>
## R027 Operation entry supplement

2026-09-13 User authorization supplement screenshots of actual functions, toolbar range tags/visibility/shortcut keys, repository partition and Git right-click operations are implemented independently according to the same fixed version, and the usage and status conditions are seen in [Source Code Management and Graph Operations](git_scm_actions.en.md). New repository settings `history_toolbar_hidden=[]`、`history_shortcuts={}`, respectively save the hidden action of the toolbar and binding; the list/tree still belongs to the existing SCM layout records. The previous five `scm.graph.*` dedicated configuration differences are maintained, and the toolbar functions are not confused with it.

<a id="section_8276fd19c5cd"></a>
## R022 Commit text layout supplement

2026-09-13, commit title and author use the same regional inline layout with trailing ellipsis; citations no longer replace authors, branch description is truncated to a 100px limit based on a fixed upstream. The 0.9em and 0.5em spacing comes from IconLabel, current commit weight is 600; no new user settings are added. A large number of citations still use this product's per-tag approach and are truncated within the container, unimplemented upstream filtering / aggregation differences are kept as original records. Specific responsibilities and acceptance see [commit title and author arranged in sequence](workspace_interaction.en.md#section_5cbda56e9d4f).
