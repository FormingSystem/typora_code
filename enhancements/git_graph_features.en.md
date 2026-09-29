---
id: tools.typora.git_graph_features
title: "Typora Git Graph function comparison and operation instructions"
kind: reference
status: evolving
domains:
  - tools
---

[Chinese](git_graph_features.md)

<a id="section_403c9cb60b4c"></a>
# Chapter 1_Git Graph Function Comparison and Operation Instructions

The workbench follows the user-approved flat layout and simpler settings direction of `59412a2`, retaining the verified central history layout, related Find/PR capabilities, and correctness fixes. This is a finalized scope, not a byte-for-byte restoration of that commit or authorization for a complete one-to-one port. Earlier comparisons, verified on 2026-09-09, used the [official feature list](https://github.com/mhutchie/vscode-git-graph/blob/v1.30.0/README.md) and [settings and command definitions](https://github.com/mhutchie/vscode-git-graph/blob/v1.30.0/package.json) of the Visual Studio Code extension Git Graph `1.30.0` (`mhutchie/vscode-git-graph`). The source-control layout also references [VS Code source control](https://code.visualstudio.com/docs/sourcecontrol/overview) and [file history](https://code.visualstudio.com/docs/sourcecontrol/history). This document records the corresponding Typora entry points, operational boundaries, and verification status.

Typora implements independent writing, using the system Git and a lightweight workbench host that persists during startup; static styles are preloaded in the document head, and are not registered with community plugins or reloaded when the file is switched. The [license](https://github.com/mhutchie/vscode-git-graph/blob/v1.30.0/LICENSE) of the upstream Git Graph limits derivative works from being released, and this directory does not copy or package its implementation code. Gemoji data uses its own MIT license, with sources and summaries see [data description](vendor/gemoji/README.en.md#section_bd75183b364d).

The shared workbench icon uses the official Codicons SVG, which is licensed under CC BY 4.0 / code MIT, retaining fixed sources, summaries, and deployment licenses. Source code management changes, sidebar history, the real file lines and difference tags of the central Graph, and the Explorer share fixed Seti file recognition; Git operations, references, and Graph directory icons maintain their own semantics. Buttons, status bar, and foldable groups use SVG, arrows rotate according to open/close state; it does not depend on native VS Code, fonts, or extensions. Sources and original canvas see [Codicons description](vendor/codicons/README.en.md#section_1a13250f199a).

[SCM icon regression](./scripts/test_scm_file_icons.cjs) checks shared Seti file recognition, 22px line height, click open / compare, empty group arrows, and white button foreground. Resource sources and responsibilities of each slot are unified see [icon mapping](../docs/icon_mapping.en.md).

Current topology repair: branches continue to parent nodes according to their own colors before merging; independent stash nodes only display the first parent edge, stash private index/untracked auxiliary commits do not occupy history lines, and regular references that are still reachable retain auxiliary objects. Real temporary Git regression covers two three-parent stashes, normal references are retained and paginated. SCM top-level title only retains the view ellipsis, refresh and open full history remain in the Graph title area. Model and collector fixes do not modify Git objects; corresponding run records and native scenarios are unified to see [feedback review records](../docs/feedback_review.en.md).

<a id="section_3d8c0b5f653c"></a>
## 1.1\_Function and Entry

Click the Git icon in the activity bar, open the localized **Source Code Management** in the original main sidebar; share the activity bar with file, search, etc. host entries, and can be dragged and sorted. Clicking the same icon again will collapse, and clicking other functions will switch the sidebar; the background and foreground of the active state follow the actual panel, and the system closes the transition when reducing dynamic effects. The lower area **Commit Graph** directly displays the history and selected commit files, with upper and lower partitions supporting drag adjustment, and the title remains fully visible after collapsing. The native file tree bottom toolbar does not cover the commit graph, and the main content status bar is retained. The "Changes" title is arranged as commit, refresh, open Git Graph, and more; commit and main buttons share transactions, and refresh retains the current pagination. The "Changes" title's Graph button, status bar **Git Graph**, or commit graph command opens the full history in the original editing tab bar. File differences and timelines also use this tab bar. Layout and menu see [Main Sidebar and Chinese Menu](README.en.md#section_dbc1680cdbda).

Host recovers the `59412a2` flat layout skeleton according to user specifications, retains the already verified theme colors and official icons, and the source and adaptation boundaries see [Interface Baseline](../docs/vscode_design_baseline.en.md). The Source Code Management title area and editing tab bar are 35px high, the activity bar target is 48×48px, icon is 24×24px; remove the card outer white space and capsule shape. The commit message box is 30px high, the commit button is 26px high, and the button directly arranges the staged and changes groups, without adding the persistent file filter box. Upper and lower view titles and file line height are 22px; two resource groups are both 22px tree lines, text 13px, regular weight, each retains 16px official fold arrow, and empty groups can also be independently expanded and collapsed. Overall changes and the title arrow of the lower commit graph are in the same column, and the commit button icon inherits the white foreground.

File lines are arranged as "16px shared Seti icon and name / independent operation column / 16px status column". Operations use 16px SVG, 22px hit box, and display when hovering or focusing; the name is abbreviated within its own column and is not covered by the button, and the status position does not move with hovering. The sidebar history uses 11px track spacing and 22px line height, and each line calculates the graphic width according to the track still existing in the line. No additional arrow column is occupied before the commit, and after expansion, the file is directly displayed with icon and status, without adding the total file count line; references use colored tags, and their icons inherit the tag foreground. The rightmost of the commit line retains "Open all changes for this commit", and the expanded file line retains "Open this version file" before the status column, with two entries independent of the commit expansion and file comparison. Outline and search remove extra native filter boxes, the outline retains the hierarchical indentation and removes the outer repeated white space, see [Activity Bar and Sidebar Layout](README.en.md#section_cfd112ecd0d5).

Central tab uses Git Graph `1.30.0` own geometry: single-line toolbar has 41px border, 31px header, 24px for commit line and graph track; dropdown 26px, toolbar action 20px, regular SVG 18px, refresh SVG 16px. Narrow group allows toolbar to wrap, so total height increases with actual line count. Toolbar places branch filter, remote branch switch, and right icon operations; default column order is Graph, Description, Date, Author, Commit, column headers menu can independently hide the last three columns, reference tab is displayed before commit description. After selecting a commit, details are directly inserted after the row, displayed as 50% / 50% showing commit summary and changed files, with 32px operation bar on the right, button 24px, SVG 20px; can be changed to bottom docking in settings. Details summary and files are vertically arranged when width is less than 520px, and the file area scrolls independently.

Panel text provides Chinese and English through type-constrained keys in pairs, and switches between the source code management, Git Graph, hints, menus, settings, confirmation dialogs, and error messages based on the explicit language setting of the workbench or Typora's `appLocale`; the Chinese language of the host is not fixed to override the English DOM tags. Branches, commits, paths, Git parameters, and user input are kept as original data, not translated or altered in actual operation identifiers.

Windows / Linux new window will place icon, Chinese main menu, title, and native window buttons in the same top bar; native commands and close process are retained. Global status bar updates based on the current active editing area, and does not add extra status lines between each split view. Tabs use native HTML Drag and Drop sorting, cross-group moving, and regular files can be merged or separated through confirmed cross-window transfer protocol; active bar uses pointer drag sorting, see [Drag and Window](../docs/drag_and_windows.en.md). Graph, Git differences, and historical versions belong to virtual views, not as regular files transferred to new windows.

| Function group | Typora has already implemented operations | Entry |
| --- | --- | --- |
| History and topology | HEAD, local branch, remote tracking branch, tag, stash, uncommitted changes; dot and parent commit connection lines | Commit graph |
| Branch range | Single select, multi-select, current HEAD, custom glob, add or remove filter from reference menu | Branch box, multi-select branch |
| History loading | First load, continue loading, auto-load on scroll; topology, commit date, author date sorting; first parent commit and reflog | Settings, load more |
| Commit details | Full number, author and committer name, email and time, description, signature result; select parent version for merge commit | Click commit |
| Reference inclusion relationship | Whether HEAD, branch, tag and stash include this commit | Hover graph node |
| File differences | Monaco left-right / inline comparison, align empty lines, inline differences, source code highlighting, change navigation, 8px scroll bars on each side with synchronized vertical scrolling, 30px native red-green difference overview, renamed before and after paths; close dual-pane full-text thumbnails | Changed files and their right-click menu |
| File history | Display commits by file and follow renames, click to compare the source code before and after this commit | File tree, changed files right-click → Timeline |
| Review the entire commit | Expand the complete file list for this commit and open the first difference, 'Previous file/Next file' always navigates within the scope of this commit | Sidebar commit row right side 'Open all changes for this commit' |
| Read the document content history | Render Markdown as read-only document content, other text opens single-side read-only source code; delete using the parent version exists side, rename using the path after the commit | Sidebar historical file row, historical difference upper right 'Open this version file' |
| Compare any version | Between two commits, any commit and workspace; first commit and empty tree | First select one, then Ctrl / Cmd click another or uncommitted line |
| Workspace and Staging Area | Only 'Staged Changes / Changes' two groups; stage new files, add precise ignore rules, unstage, button or Ctrl+Enter commit, amend | Uncommitted changes, file right-click |
| Branch Management | Create, switch, rename, delete, local branch Fetch, remote branch checkout and delete | Right-click on branch or remote reference |
| History Integration | Merge, Rebase, Reset, checkout commit, Cherry-pick, Revert, Drop; continue after conflict, abort, skip | Right-click on commit, operation |
| Interactive Rebase | Generate the list of pending changes, adjust order, pick, reword, edit, squash, fixup, drop | Rebase Dialog |
| Operation Options | Fast-forward strategy, squash, do not commit, Cherry-pick source records and parent number, reset method, Force-with-lease, Fetch forced update and prune | Corresponding operation dialog |
| Tab | Lightweight and annotated tab, sign, delete, push; view tabber, email, time, and message | Right-click on commit or tab |
| Stash | Create, include untracked files, retain staged content, apply, pop, drop, create branch, restore staged status | Right-click on unstaged lines, stash node |
| Clean | Clean directory and ignore file options, delete list preview, Reset's mixed / soft / hard | Right-click on unstaged lines |
| Network synchronization | Fetch, pull, push; synchronize after confirmation by pulling first then pushing; release branch when no upstream; push remote branch and tab | Status bar synchronization, fetch button, operation and reference right-click |
| Repository management | Clone to specified target folder, current document's repository, manual addition, specify depth to discover sub-repository, remove record, sort, independent worktree | Repository button and repository selection box |
| Remote management | View Fetch / Push URL, add, separately modify URL, delete, Fetch, Prune | Operation → Remote configuration |
| Review | Unread mark for single commit or version interval, mark as read after opening differences, continue across sessions, end specified or all reviews; expire after 90 days of inactivity | Details, operation, command panel |
| Find | Explanation, date, author, number, branch and tab; forward or backward to locate matching results | Search box, Enter / Shift + Enter |
| Path and Copy | Name, full number, commit title, relative path and absolute path of the file; Open current file | Node, reference, right-click on file |
| Workspace rename | Rename file and folder, synchronize opened tab, draft save path and reading history; Refresh search results | Right-click or press F2 after selecting a file in Explorer to rename |
| External link | Link to HTTP / HTTPS, issue number in commit and tag descriptions; GitHub, GitLab, Bitbucket, custom PR form | Link description, right-click on branch |
| Share repository configuration | Local settings, import, export; When a new environment is opened for the first time, it automatically reads the `.typora_git_graph.json` in the root of the repository | Settings |
| Right-click configuration and layout | Check menu items by object, drag adjacent text list headers, reset column width; The line column follows the track layout, the history dual-column and sidebar can be independently adjusted | Configuration at the bottom of the menu, right-click on the header, corresponding partition line |
| Integrated terminal | Repository root directory, Shell configuration, tab / split view, real interaction, copy and find, session retention, follow Typora theme, administrator UAC entry | Toolbar, right-click on blank areas and file tree, Ctrl + ` |
| Graphics and reading appearance | Lines and colors, uncommitted nodes connection, merge same-name references, fix five columns, directory tree and list, compact directory, fade strategy | Settings, drag table header edge |
| Text and avatar | Common emojis and gitmoji, custom short codes, inline bold / italic / code, optional Gravatar and cache cleaning, file encoding | Settings, operations |
| Workspace integration | Browse all files and hidden directories on demand, edit and save single files with thumbnails, global active editor status bar, search by file, only search Git changed files, enter search with selected text and preview below, tabs and split views, file menu, active bar sorting and sidebar collapse/expand, repository terminal | Workspace entry, settings |
| Version archive | Export specified commit, branch or tag as ZIP, reject overwrite existing target | Right-click on node or reference |

The additional staging, commit and archive provided within the diagram also use the same target and error display method. The remote references displayed in the diagram come from local Git data; **Refresh only reads, Fetch only connects to remote**.

<a id="section_603ac029cc04"></a>
## 1.2\_Operation preview and conflict resolution

Main sidebar staging/cancel staging directly execute user selection; regular commit uses button or `Ctrl + Enter`, only commit staged content, message box ordinary Enter retains line breaks. New files and other changes are staged, or right-click to add precise ignore rules. Operations that require parameter input, change disk content or rewrite history, fill parameters from right-click dialog box, click **Preview operation**, dialog box displays repository, target and Git parameters; click **Execute this operation** to perform writing. Parameter changes will make old preview invalid. Clean first lists deleted targets, Prune first performs dry-run. Preview is required to re-preview if HEAD, reference, staged content, tracked files, or remote address changes. The same repository is executed sequentially in this window; other Git processes' competition is still constrained by Git's own locks and error handling.

Status bar synchronization automatically prepares target and operation order, click **Confirm synchronization** to connect to remote; first pull successfully, then push un-released commits, conflicts do not continue pushing. The **Discard all changes** in source code management precisely lists the files in this group, recovery source is staging area, untracked files default to move to trash; uncheck to handle only tracked files. The discard operation on file right-click is limited to single files. Trash is unavailable or failed, report actual results, do not automatically change to permanent deletion.

Operations that change the disk workspace first read Typora's actual unsaved state. If the native editor still has unsaved content, the interface requires saving first, then executing. Diagram queries do not write the main content or index; hidden diagram tabs only switch visibility, retain the same diagram and details DOM; in-transit reads continue to complete, true destruction only cancels the query. Write operations in progress are retained until results return.

When merge or rebase occurs with conflicts, the result area displays Git errors, the status bar displays ongoing operations. Open conflicting files, complete modifications and save, stage the resolution result, then select **Continue current Git operation**; alternatively, **abort**, or in Rebase / Cherry-pick / Revert choose **skip**. Errors are not displayed as successful.

Interactive Rebase, after checking the interactive option, the first preview generates a complete numbered list, adjust again and preview. `reword` line numbers after the text become new commit titles; `edit` will stop Git at the corresponding commit, modify and amend, then continue. The list only allows the above six actions, each original commit must appear once; deletion should explicitly use `drop`. Interactive list handles linear commits, preserve merge structure using the independent option of regular Rebase. Drop node operations require one parent commit and belong to current HEAD history, root commit and merge commit will give clear explanations.

<a id="section_13b8125a846a"></a>
## 1.3\_Keyboard shortcuts and settings

| Key positions within the diagram | Actions |
| --- | --- |
| Ctrl / Cmd + F | Search box for positioning |
| Ctrl / Cmd + H | Position HEAD |
| Ctrl / Cmd + R | Refresh |
| Ctrl / Cmd + S, add Shift | Next, previous stash |
| ↑ / ↓ | Previous, next commit details |
| Ctrl / Cmd + ↑ / ↓, add Shift | Child commit / parent commit; Shift selects another branch |
| Enter | Operation dialog box preview or execution; preserve line breaks in multi-line explanations |
| Ctrl + Enter (commit message box) | Stash committed content, consistent with the commit button |
| Esc | Close menu, dialog, or details |

Except for the `Ctrl + Enter` in the commit message box, the keys in the table are only processed in the active Git tag. The main document editing area continues to use the original save, find, and read history key bindings. `shortcuts` can adjust the key bindings for find, HEAD, refresh, and previous stash, for example, `Mod+f`; an empty string indicates no binding.

Set to use Chinese tags, with enumeration items using dropdowns, and complex mappings using JSON. The following is a portion of the importable configuration, with unentered settings using default values:

```json
{
  "graph_style": "curved",
  "column_widths": { "subject": 300, "author": 110, "date": 145, "hash": 80 },
  "branch_globs": [{ "name": "Feature branches", "glob": "heads/feature/*" }],
  "dialog_defaults": { "merge": { "mode": "no-ff", "no_commit": false } },
  "emoji": { ":review:": "🔎" },
  "issue_pattern": "#([0-9]+)",
  "issue_url": "https://github.com/owner/repository/issues/{id}",
  "pr_base": "main",
  "hidden_actions": ["drop", "archive"]
}
```

In the configuration, `{id}` is the issue capture group, PR templates support `{base}`, `{branch}`, and `{remote}`. The Git executable and terminal programs can be specified locally in the settings; shared configurations do not override the native executable settings, and they do not automatically open online avatars. Exported files do not record the absolute location of the repository, and the Git and terminal settings are restored to portable default values.

<a id="section_391a75579953"></a>
## 1.4\_Host Differences and Verification Boundary

Differences use MIT-licensed **Monaco 0.56.0**, displaying full dual-pane source code, line alignment, inline highlighting, syntax highlighting, Chinese search, and change navigation in the central edit tag. Each side retains 8px scrollbars, 30px native overview displaying deleted and added content, with synchronization upon clicking. The full-text thumbnail is disabled in the dual-pane view, while the regular single-file and single-version view continues to provide thumbnails. Functional descriptions see [Central Difference Editor and File Timeline](README.en.md#section_5d4cecdbee32). The main sidebar reuses the community core `SidebarPanel`, with activity bar function icons that can be sorted; the commit diagram no longer copies the sidebar and tag system. The terminal continues to use the existing xterm.js and node-pty, with colors following the actual theme of Typora. The administrator entry opens an independent PowerShell through UAC, see [Integrated Terminal Description](README.en.md#section_a2a465c0b8fd).

History and two difference versions are read-only. The history file lines and the history difference upper-right corner's **Open this version file** use the selected commit: ordinary modifications and additions read the right version, deletions read the existing side from the parent commit, and renames read the right new path. Markdown is rendered in an independent reading container for titles, tables, code highlighting, and Mermaid; relative links, fragments, and PNG/JPEG/GIF/WebP/AVIF/BMP images are read from the same commit. Directories are based on the current history file's directory, with the leading `/` based on the repository root. External HTTP/HTTPS links are only opened upon explicit clicks; external images, unsupported historical image formats, and missing resources display alternative text and reasons. Opening history content does not call the loading, clearing, saving, or checking out operations of the current Typora document, nor does it write temporary content files.

In the comparison between the workspace and the staging area, the **Open File** opens the current workspace file: Markdown uses native rendering and editing of Typora, while other text uses a single-column Monaco that fills the editing group, supporting editing, Ctrl+S save, Ctrl+F find, and independently preserving language, encoding, and line settings per document. Before saving, check disk changes, retain drafts when switching or moving tags, and handle unsaved content when closing background tags and windows, see [All Files and Language Recognition](README.en.md#section_d88276d4d4d4). There is no selected line for staging, third-party merge editor, or VS Code host extension. Binary files, directories, and submodules do not impersonate text differences, with interface explanations on the opening method; symbolic links compare link values. File encoding is decoded by `TextDecoder`.

Difference tab shows "filename (old version ↔ new version)." The "Previous change," "Next change," "Find," "More actions," and "Open file" icons are located to the right of this edit group tab row, switching tabs synchronously unhighlights or highlights them; they do not occupy a second text toolbar row. "Previous file," "Next file," "Refresh differences," and "Switch sidebar" remain in the "More actions" menu, still calling the actual file range and repository identity check for the current comparison.

Full file browsing does not hide files based on known languages, and directories are expanded on demand; special names, longest composite suffix, and interpreter mapping are seen in [All Files and Language Recognition](README.en.md#section_d88276d4d4d4). Workspace text search and graph-inclusive commit search are independent entries: the former uses a compact toolbar and one search box, providing file grouping, path, Git status, highlighting, and hover line number locations, supporting single-click preview, double-click precise selection of Markdown native document content or other text source code, as well as case sensitivity, whole word, regular expression, include/exclude, ignore, and only open files with preview. **Only search source code changes** includes staged, workspace changes, and untracked files, searches current disk text, and is mutually exclusive with "only open." Range filtering remains effective. Before replacement, it checks disk snapshot and unsaved content, boundaries seen in [Workspace Search and Replace](README.en.md#section_e7266e1e8041). Workspace search now reports results in batches and uses bounded concurrency and Worker matching, performance and resource boundaries seen in [Large Directory Search](../docs/search_performance.en.md). These capabilities do not mean that the entire VS Code has been ported.

After selecting text, Ctrl/Cmd + left mouse click enters the same **search** panel and lists hit files; default single-click updates the below-only read Markdown/source code preview and retains the central position; double-click or Enter opens the target in the editing area, Markdown uses native view and retains reading history and existing tags. Preview supports collapsing, default 80% and range 50%–150% local persistent content zoom, Ctrl/Cmd + scroll wheel and split view adjustment. Side preview only reads text within 2 MiB, code fence is highlighted by language; Mermaid uses an independent iframe to load the local chart library attached by Typora, without changing the central instance configuration. Document HTML has been purified, does not execute document scripts or load media; it finds text occurrence locations, does not parse symbol definitions or Git commit relationships, seen in [Search Below Preview Operations](README.en.md#section_17ddcbc9e185).

Line numbers, encoding, line breaks, and language settings for source code are all located in the window global status bar, updating with active tabs and edit groups, and each split view no longer occupies a separate status bar. Formatting remains saved by each file's own editing model; Git Diff displays only read line numbers, language, and line breaks based on the last focused left or right side. Switching to native Markdown, commit graph, or terminal will remove the old source code status.

Git shares 170 CSS px minimum text width with other main sidebars; continue dragging to request width less than 85px to collapse, active bar still can be used to restore, complete mouse/keyboard rules seen in [Active Bar and Sidebar Layout](README.en.md#section_cfd112ecd0d5). This width, internal split view of source code management, and central dual-column width of Git Graph are separately adjustable; the details of central Git Graph default follow the selected commit line, and can be docked at the bottom.

Default read 300 entries, load another 100 entries each time, automatically load when scroll to bottom, can be set to 1～2000 entries; file history can also continue to load. Git read timeout 30 seconds, write operation 5 minutes, command output and history file limit 16 MiB. Monaco uses browser Worker to calculate differences, default calculation time limit 10 seconds; if exceeds the limit, reduce the file or commit range. Ordinary installation directly uses the offline bundle containing code, Chinese interface, icons, and Worker.

Existing verified baseline includes: branches, tags, renaming, arbitrary version differences, empty repository, pagination, independent worktree, stash, staging, commit, local bare remote push and pull, interactive Rebase, conflict continue/abort/skip, preview expiration and unsaved protection in real Git temporary repository; Windows Typora `1.14.9` real window's tags, split view, reading position, menu, preview and execution, review and Ctrl comparison; hide Chromium's real mouse/keyboard input and dual-column differences. Corresponding scripts are `test_git_graph.mjs`, `test_git_graph_full.mjs`, `test_reading_native.ps1 -suite git` and `test_git_graph_interaction.cjs`.

Network operations reuse system Git's credential helper and SSH configuration; installer does not write credentials. Signature reuses Git's existing signature tools and key configuration, regression uses temporary SSH key to complete commit and tag signing and verification. Remote GitHub/GitLab account authentication, user signature key and avatar service availability depends on actual environment, this round did not use user credentials to execute these verifications. Native Linux / UCRT64 Typora still needs corresponding device real machine revalidation.

Installation and recovery regression additional checks: old one can't pass full function mark verification only view the bundle, repeated installation keeps one entry, upgrade and recovery do not delete reading position, review, settings or avatar cache. Ordinary installation uses the bundle, plugin core and terminal module submitted with the repository, no requirement for pre-installed Node.js, Ruby, and does not include native fixed path. Windows first configuration downloads and verifies fixed version Node private runtime; offline installation uses official ZIP cache. See [Installation Instructions](README.en.md#section_4024157827a1).

Extended geometric regression checks fixed upstream with border 41px toolbar, 31px header, 24px commit line/SVG track, 20px toolbar action, 32px detail panel and 24px detail button, and covers reference order, inline dual-panel detail, optional bottom docking and 360px narrow group. Dual-language keys are dynamically checked by testing, not frozen key numbers. Target scripts are `test_git_graph_interaction.cjs` and `test_git_graph_actions_settings_i18n.mjs`; single target cannot replace complete build, complete UI suite or real Typora real window acceptance.

Git regression covers main sidebar reuse, activity bar order, central independent difference tag, multiple difference blocks row alignment, C highlight, click stage/unstage, Chinese submenu keyboard navigation, renaming timeline, specified file abandon changes and clone.

Sidebar interaction regression continues to cover two groups of file status, new file staging, precise ignoring while preserving disk files, Enter line and Ctrl+Enter commit, commit failure message retention, commit node expansion/collapse and file differences, area adjustment, 8px scrollbars on both sides and synchronized scrolling. The thumbnail of ordinary documents is also checked by `test_reading_minimap.cjs` for real mouse positioning, multiple views and source code mode, document content integrity and cross-frame drawing; `test_reading_native.ps1 -suite reading` is verified in real Typora, source code and split view integration.

Sidebar regression also checks three-view visibility persistence, commit input area folding, commit dropdown, history file tree, keyboard operations of inline buttons, native right-click of edit box, and in the 220px narrow sidebar, the name, operation and status each occupy independent columns and maintain alignment before and after hovering. `test_scm_history_layout.cjs` verifies two-layer history buttons in 220/300/480px sidebars, 16px SVG, 22px hit box, non-overlapping buttons for references, history file status alignment and stale repository actions rejection. `test_git_revision_reader.cjs` uses actual temporary Git commits to verify the selected Markdown and code versions, history PNG bytes, relative links and fragments, deletion and renaming, missing links, asynchronous repository rejection, and to verify that unsaved Markdown, HEAD, index and workspace files retain their original bytes. `test_git_sync.mjs` covers real local remote divergence, pull conflict, push rejection and upstream changes; `test_git_discard_changes.mjs` covers precise file list, staging area byte retention, preview failure and recycle failure. Windows Typora real window set also checks the system recycle bin and status bar synchronization confirmation, without using user remote or deleted user files.

Verification entry see [Developer Build and Verification](README.en.md#section_3a010e92a2c3), current results, historical baseline and native evidence are uniformly maintained in [Feedback Recheck Records](../docs/feedback_review.en.md). Fixed upstream configuration Meta checks, hidden Electron behavior and real Typora scenarios each have their own boundaries, and cannot extrapolate the passing of one layer to all configurations or one-to-one visual acceptance.

<a id="section_eebce7f0bf1d"></a>
## 1.5\_Fixed upstream configuration item matrix

Source: official `v1.30.0`, commit `881a9e613045bacbbadf8940f6b6c5b8bd699335` of `package.json`. Cache working tree HEAD is the newer beta, cannot replace this fixed tag; this table is extracted item by item from the fixed tag. Setting columns record the current default value, and the presence of fields is not considered as running verification.

Verification entry: **UI** = `scripts/test_git_graph_interaction.cjs` (real Electron input, geometry and details); **Git** = `scripts/test_git_graph_full.mjs` (real temporary Git repository and local bare remote); **Data** = `scripts/test_git_graph.mjs` (topology, filtering, pagination); **Meta** = `scripts/test_git_graph_actions_settings_i18n.mjs` (configuration type and bilingual metadata, only proves configuration contract). Rows marked as adaptation do not claim pixel-by-pixel consistency with VS Code host.

| Upstream settings (omitted git-graph.) | Upstream default | Typora configuration / default | Actual entry and evidence | Boundary |
| --- | --- | --- | --- | --- |
| `commitDetailsView.autoCenter` | `true` | `auto_center` = `true` | Setting / column header menu / diagram; UI + Meta | Mapped; differentiated validation layer by evidence column |
| `commitDetailsView.fileView.fileTree.compactFolders` | `true` | `compact_folders` = `true` | Setting / column header menu / diagram; UI + Meta | Mapped; differentiated validation layer by evidence column |
| `commitDetailsView.fileView.type` | `"File Tree"` | `file_view` = `"tree"` | Setting / column header menu / diagram; UI + Meta | Mapped; differentiated validation layer by evidence column |
| `commitDetailsView.location` | `"Inline"` | `details_location` = `"inline"` | Setting / column header menu / diagram; UI + Meta | Mapped; differentiated validation layer by evidence column |
| `contextMenuActionsVisibility` | `{}` | `hidden_actions` = `[]` | Settings / Repository menu; Meta, Host scenario see function matrix | Mapped; differentiated validation layer by evidence column |
| `customBranchGlobPatterns` | `[]` | `branch_globs` = `[]` | Settings / Repository menu; Meta, Host scenario see function matrix | Mapped; differentiated validation layer by evidence column |
| `customEmojiShortcodeMappings` | `[]` | `emoji` = `{}` | Settings / Repository menu; Meta, Host scenario see function matrix | Mapped; differentiated validation layer by evidence column |
| `customPullRequestProviders` | `[]` | `pr_providers` = `[]` | Settings / Repository menu; Meta, Host scenario see function matrix | Custom provider list with named entries; `test_git_graph_pull_request.cjs` Real dialog box and `test_git_graph.mjs` URL / Configuration regression passed |
| `date.format` | `"Date & Time"` | `date_format` = `"local"` | Setting / column header menu / diagram; UI + Meta | Mapped; differentiated validation layer by evidence column |
| `date.type` | `"Author Date"` | `date_type` = `"author"` | Setting / column header menu / diagram; UI + Meta | Mapped; differentiated validation layer by evidence column |
| `defaultColumnVisibility` | `{"Date":true,"Author":true,"Commit":true}` | `show_date,show_author,show_hash` = `{"show_date":true,"show_author":true,"show_hash":true}` | Setting / column header menu / diagram; UI + Meta | Mapped; differentiated validation layer by evidence column |
| `dialog.addTag.pushToRemote` | `false` | `tag_add.push` = `false` | Dialog box for right-click actions; Git + Meta | Mapped; differentiated validation layer by evidence column |
| `dialog.addTag.type` | `"Annotated"` | `tag_add.tag_type` = `"annotated"` | Dialog box for right-click actions; Git + Meta | Mapped; differentiated validation layer by evidence column |
| `dialog.applyStash.reinstateIndex` | `false` | `stash_apply.index` = `false` | Dialog box for right-click actions; Git + Meta | Mapped; differentiated validation layer by evidence column |
| `dialog.cherryPick.noCommit` | `false` | `cherry_pick.no_commit` = `false` | Dialog box for right-click actions; Git + Meta | Mapped; differentiated validation layer by evidence column |
| `dialog.cherryPick.recordOrigin` | `false` | `cherry_pick.record_origin` = `false` | Dialog box for right-click actions; Git + Meta | Mapped; differentiated validation layer by evidence column |
| `dialog.createBranch.checkOut` | `false` | `branch_create.checkout` = `false` | Dialog box for right-click actions; Git + Meta | Mapped; differentiated validation layer by evidence column |
| `dialog.deleteBranch.forceDelete` | `false` | `branch_delete.force` = `false` | Dialog box for right-click actions; Git + Meta | Mapped; differentiated validation layer by evidence column |
| `dialog.fetchIntoLocalBranch.forceFetch` | `false` | `branch_fetch.force` = `false` | Dialog box for right-click actions; Git + Meta | Mapped; differentiated validation layer by evidence column |
| `dialog.fetchRemote.prune` | `false` | `fetch.prune` = `false` | Dialog box for right-click actions; Git + Meta | Mapped; differentiated validation layer by evidence column |
| `dialog.fetchRemote.pruneTags` | `false` | `fetch.prune_tags` = `false` | Dialog box for right-click actions; Git + Meta | Mapped; differentiated validation layer by evidence column |
| `dialog.general.referenceInputSpaceSubstitution` | `"None"` | `reference_space` = `"none"` | Settings / Repository menu; Meta, Host scenario see function matrix | Mapped; differentiated validation layer by evidence column |
| `dialog.merge.noCommit` | `false` | `merge.no_commit` = `false` | Dialog box for right-click actions; Git + Meta | Mapped; differentiated validation layer by evidence column |
| `dialog.merge.noFastForward` | `true` | `merge.mode` = `"no-ff"` | Dialog box for right-click actions; Git + Meta | Mapped; differentiated validation layer by evidence column |
| `dialog.merge.squashCommits` | `false` | `merge.mode` = `"no-ff"` | Dialog box for right-click actions; Git + Meta | Mapped; differentiated validation layer by evidence column |
| `dialog.merge.squashMessageFormat` | `"Default"` | `merge.squash_message` = `"default"` | Dialog box for right-click actions; Git + Meta | Mapped; differentiated validation layer by evidence column |
| `dialog.popStash.reinstateIndex` | `false` | `stash_pop.index` = `false` | Dialog box for right-click actions; Git + Meta | Mapped; differentiated validation layer by evidence column |
| `dialog.pullBranch.noFastForward` | `false` | `pull.mode` = `"merge"` | Dialog box for right-click actions; Git + Meta | Mapped; differentiated validation layer by evidence column |
| `dialog.pullBranch.squashCommits` | `false` | `pull.mode` = `"merge"` | Dialog box for right-click actions; Git + Meta | Mapped; differentiated validation layer by evidence column |
| `dialog.pullBranch.squashMessageFormat` | `"Default"` | `pull.squash_message` = `"default"` | Dialog box for right-click actions; Git + Meta | Mapped; differentiated validation layer by evidence column |
| `dialog.rebase.ignoreDate` | `true` | `rebase.ignore_date` = `true` | Dialog box for right-click actions; Git + Meta | Mapped; differentiated validation layer by evidence column |
| `dialog.rebase.launchInteractiveRebase` | `false` | `rebase.interactive` = `false` | Dialog box for right-click actions; Git + Meta | Mapped; differentiated validation layer by evidence column |
| `dialog.resetCurrentBranchToCommit.mode` | `"Mixed"` | `reset.mode` = `"mixed"` | Dialog box for right-click actions; Git + Meta | Mapped; differentiated validation layer by evidence column |
| `dialog.resetUncommittedChanges.mode` | `"Mixed"` | `dialog_defaults.reset_changes.mode` (default mixed) | Dialog box for right-click actions; Git + Meta | Mapped; differentiated validation layer by evidence column |
| `dialog.stashUncommittedChanges.includeUntracked` | `true` | `stash_create.untracked` = `true` | Dialog box for right-click actions; Git + Meta | Mapped; differentiated validation layer by evidence column |
| `enhancedAccessibility` | `false` | No independent settings; status letters fixed display | Settings / Repository menu; Meta, Host scenario see function matrix | Adaptation: always display text status, no need to enable |
| `fileEncoding` | `"utf8"` | `encoding` = `"utf-8"` | Settings / Repository menu; Meta, Host scenario see function matrix | Adaptation: set of encoding collections supported by TextDecoder |
| `graph.colours` | `["#0085d9","#d9008f","#00d90a","#d98500","#a300d9","#ff0000","#00d9cc","#e138e8","#85d900","#dc5b23","#6f24d6","#ffcc00"]` | `colors` = `["#0085d9","#d9008f","#00d90a","#d98500","#a300d9","#ff0000","#00d9cc","#e138e8","#85d900","#dc5b23","#6f24d6","#ffcc00"]` | Setting / column header menu / diagram; UI + Meta | Mapped; differentiated validation layer by evidence column |
| `graph.style` | `"rounded"` | `graph_style` = `"curved"` | Setting / column header menu / diagram; UI + Meta | Mapped; differentiated validation layer by evidence column |
| `graph.uncommittedChanges` | `"Open Circle at the Uncommitted Changes"` | `uncommitted_style` = `"connected"` | Setting / column header menu / diagram; UI + Meta | Mapped; differentiated validation layer by evidence column |
| `integratedTerminalShell` | `""` | `terminal_shell` = `""` | Settings / Repository menu; Meta, Host scenario see function matrix | Mapped; differentiated validation layer by evidence column |
| `keyboardShortcut.find` | `"CTRL/CMD + F"` | `shortcuts.find` = `"Mod+f"` | Setting / column header menu / diagram; UI + Meta | Mapped; differentiated validation layer by evidence column |
| `keyboardShortcut.refresh` | `"CTRL/CMD + R"` | `shortcuts.refresh` = `"Mod+r"` | Setting / column header menu / diagram; UI + Meta | Mapped; differentiated validation layer by evidence column |
| `keyboardShortcut.scrollToHead` | `"CTRL/CMD + H"` | `shortcuts.head` = `"Mod+h"` | Setting / column header menu / diagram; UI + Meta | Mapped; differentiated validation layer by evidence column |
| `keyboardShortcut.scrollToStash` | `"CTRL/CMD + S"` | `shortcuts.stash_next` = `"Mod+s"` | Setting / column header menu / diagram; UI + Meta | Mapped; differentiated validation layer by evidence column |
| `markdown` | `true` | `inline_markdown` = `true` | Settings / Repository menu; Meta, Host scenario see function matrix | Mapped; differentiated validation layer by evidence column |
| `maxDepthOfRepoSearch` | `0` | `search_depth` = `0` | Settings / Repository menu; Meta, Host scenario see function matrix | Mapped; differentiated validation layer by evidence column |
| `openNewTabEditorGroup` | `"Active"` | `new_tab_group` = `"active"` | Settings / Repository menu; Meta, Host scenario see function matrix | Mapped; differentiated validation layer by evidence column |
| `openToTheRepoOfTheActiveTextEditorDocument` | `false` | `open_active_repo` = `true` | Settings / Repository menu; Meta, Host scenario see function matrix | Adaptation: default active file repository, reduce manual selection of repository |
| `referenceLabels.alignment` | `"Normal"` | `label_alignment` = `"normal"` | Setting / column header menu / diagram; UI + Meta | Mapped; differentiated validation layer by evidence column |
| `referenceLabels.combineLocalAndRemoteBranchLabels` | `true` | `combine_refs` = `true` | Setting / column header menu / diagram; UI + Meta | Mapped; differentiated validation layer by evidence column |
| `repository.commits.fetchAvatars` | `false` | `fetch_avatars` = `false` | Settings / Diagram; Meta; running coverage needs to be checked against 1.6 and specific test scenarios | Mapped; differentiated validation layer by evidence column |
| `repository.commits.initialLoad` | `300` | `initial_count` = `300` | Settings / Diagram; Meta; running coverage needs to be checked against 1.6 and specific test scenarios | Mapped; differentiated validation layer by evidence column |
| `repository.commits.loadMore` | `100` | `page_count` = `100` | Settings / Diagram; Meta; running coverage needs to be checked against 1.6 and specific test scenarios | Mapped; differentiated validation layer by evidence column |
| `repository.commits.loadMoreAutomatically` | `true` | `auto_load` = `true` | Settings / Diagram; Meta; running coverage needs to be checked against 1.6 and specific test scenarios | Mapped; differentiated validation layer by evidence column |
| `repository.commits.mute.commitsThatAreNotAncestorsOfHead` | `false` | `mute_unreachable` = `false` | Settings / Diagram; Meta; running coverage needs to be checked against 1.6 and specific test scenarios | Mapped; differentiated validation layer by evidence column |
| `repository.commits.mute.mergeCommits` | `true` | `mute_merges` = `true` | Settings / Diagram; Meta; running coverage needs to be checked against 1.6 and specific test scenarios | Mapped; differentiated validation layer by evidence column |
| `repository.commits.order` | `"date"` | `order` = `"date"` | Settings / Diagram; Meta; running coverage needs to be checked against 1.6 and specific test scenarios | Mapped; differentiated validation layer by evidence column |
| `repository.commits.showSignatureStatus` | `false` | `show_signature` = `false` | Settings / Diagram; Meta; running coverage needs to be checked against 1.6 and specific test scenarios | Mapped; differentiated validation layer by evidence column |
| `repository.fetchAndPrune` | `false` | `fetch_prune` = `false` | Settings / Diagram; Meta; running coverage needs to be checked against 1.6 and specific test scenarios | Mapped; differentiated validation layer by evidence column |
| `repository.fetchAndPruneTags` | `false` | `fetch_prune_tags` = `false` | Settings / Diagram; Meta; running coverage needs to be checked against 1.6 and specific test scenarios | Mapped; differentiated validation layer by evidence column |
| `repository.includeCommitsMentionedByReflogs` | `false` | `include_reflogs` = `false` | Settings / Diagram; Meta; running coverage needs to be checked against 1.6 and specific test scenarios | Mapped; differentiated validation layer by evidence column |
| `repository.onLoad.scrollToHead` | `false` | `on_load_head` = `false` | Settings / Diagram; Meta; running coverage needs to be checked against 1.6 and specific test scenarios | Mapped; differentiated validation layer by evidence column |
| `repository.onLoad.showCheckedOutBranch` | `false` | `on_load_branch` = `false` | Settings / Diagram; Meta; running coverage needs to be checked against 1.6 and specific test scenarios | Mapped; differentiated validation layer by evidence column |
| `repository.onLoad.showSpecificBranches` | `[]` | `on_load_branches` = `[]` | Settings / Diagram; Meta; running coverage needs to be checked against 1.6 and specific test scenarios | Mapped; differentiated validation layer by evidence column |
| `repository.onlyFollowFirstParent` | `false` | `first_parent` = `false` | Settings / Diagram; Meta; running coverage needs to be checked against 1.6 and specific test scenarios | Mapped; differentiated validation layer by evidence column |
| `repository.showCommitsOnlyReferencedByTags` | `true` | `tag_only_commits` = `true` | Settings / Diagram; Meta; running coverage needs to be checked against 1.6 and specific test scenarios | Mapped; differentiated validation layer by evidence column |
| `repository.showRemoteBranches` | `true` | `show_remotes` = `true` | Settings / Diagram; Meta; running coverage needs to be checked against 1.6 and specific test scenarios | Mapped; differentiated validation layer by evidence column |
| `repository.showRemoteHeads` | `true` | `show_remote_heads` = `true` | Settings / Diagram; Meta; running coverage needs to be checked against 1.6 and specific test scenarios | Mapped; differentiated validation layer by evidence column |
| `repository.showStashes` | `true` | `show_stashes` = `true` | Settings / Diagram; Meta; running coverage needs to be checked against 1.6 and specific test scenarios | Mapped; differentiated validation layer by evidence column |
| `repository.showTags` | `true` | `show_tags` = `true` | Settings / Diagram; Meta; running coverage needs to be checked against 1.6 and specific test scenarios | Mapped; differentiated validation layer by evidence column |
| `repository.showUncommittedChanges` | `true` | `show_changes` = `true` | Settings / Diagram; Meta; running coverage needs to be checked against 1.6 and specific test scenarios | Mapped; differentiated validation layer by evidence column |
| `repository.showUntrackedFiles` | `true` | `show_untracked` = `true` | Settings / Diagram; Meta; running coverage needs to be checked against 1.6 and specific test scenarios | Mapped; differentiated validation layer by evidence column |
| `repository.sign.commits` | `false` | `sign_commits` = `false` | Settings / Diagram; Meta; running coverage needs to be checked against 1.6 and specific test scenarios | Mapped; differentiated validation layer by evidence column |
| `repository.sign.tags` | `false` | `sign_tags` = `false` | Settings / Diagram; Meta; running coverage needs to be checked against 1.6 and specific test scenarios | Mapped; differentiated validation layer by evidence column |
| `repository.useMailmap` | `false` | `use_mailmap` = `false` | Settings / Diagram; Meta; running coverage needs to be checked against 1.6 and specific test scenarios | Mapped; differentiated validation layer by evidence column |
| `repositoryDropdownOrder` | `"Workspace Full Path"` | `repository_order` = `"path"` | Settings / Repository menu; Meta, Host scenario see function matrix | Mapped; differentiated validation layer by evidence column |
| `retainContextWhenHidden` | `true` | `retain_context` = `true` | Settings / Repository menu; Meta, Host scenario see function matrix | Mapped; differentiated validation layer by evidence column |
| `showStatusBarItem` | `true` | `show_status_button` = `true` | Settings / Repository menu; Meta, Host scenario see function matrix | Mapped; differentiated validation layer by evidence column |
| `sourceCodeProviderIntegrationLocation` | `"Inline"` | Configuration rolled back (cleared when loading old local values) | Settings / Repository menu; Meta, Host scenario see function matrix | Top duplicate diagram button removed as per user request; Diagram area retains entry, no longer claims top position switch |
| `tabIconColourTheme` | `"colour"` | `tab_icon_theme` = `"colour"` | Settings / Repository menu; Meta, Host scenario see function matrix | Tab-specific colour/grey, do not modify the color scheme of the active bar |

<a id="section_9e9a47957117"></a>
### 1.5.1\_ upstream name deprecated

The following are old names of the same setting, not new capabilities; Typora uses the unique configuration in the table above, does not introduce old name forwarding.

| Upstream old name | Upstream replacement explanation |
| --- | --- |
| `git-graph.autoCenterCommitDetailsView` | Depreciated: This setting has been renamed to git-graph.commitDetailsView.autoCenter |
| `git-graph.combineLocalAndRemoteBranchLabels` | Depreciated: This setting has been renamed to git-graph.referenceLabels.combineLocalAndRemoteBranchLabels |
| `git-graph.commitDetailsViewFileTreeCompactFolders` | Depreciated: This setting has been renamed to git-graph.commitDetailsView.fileView.fileTree.compactFolders |
| `git-graph.commitDetailsViewLocation` | Depreciated: This setting has been renamed to git-graph.commitDetailsView.location |
| `git-graph.commitOrdering` | Depreciated: This setting has been renamed to git-graph.repository.commits.order |
| `git-graph.dateFormat` | Depreciated: This setting has been renamed to git-graph.date.format |
| `git-graph.dateType` | Depreciated: This setting has been renamed to git-graph.date.type |
| `git-graph.defaultFileViewType` | Depreciated: This setting has been renamed to git-graph.commitDetailsView.fileView.type |
| `git-graph.fetchAndPrune` | Depreciated: This setting has been renamed to git-graph.repository.fetchAndPrune |
| `git-graph.fetchAvatars` | Depreciated: This setting has been renamed to git-graph.repository.commits.fetchAvatars |
| `git-graph.graphColours` | Depreciated: This setting has been renamed to git-graph.graph.colours |
| `git-graph.graphStyle` | Depreciated: This setting has been renamed to git-graph.graph.style |
| `git-graph.includeCommitsMentionedByReflogs` | Depreciated: This setting has been renamed to git-graph.repository.includeCommitsMentionedByReflogs |
| `git-graph.initialLoadCommits` | Depreciated: This setting has been renamed to git-graph.repository.commits.initialLoad |
| `git-graph.loadMoreCommits` | Depreciated: This setting has been renamed to git-graph.repository.commits.loadMore |
| `git-graph.loadMoreCommitsAutomatically` | Depreciated: This setting has been renamed to git-graph.repository.commits.loadMoreAutomatically |
| `git-graph.muteCommitsThatAreNotAncestorsOfHead` | Depreciated: This setting has been renamed to git-graph.repository.commits.mute.commitsThatAreNotAncestorsOfHead |
| `git-graph.muteMergeCommits` | Depreciated: This setting has been renamed to git-graph.repository.commits.mute.mergeCommits |
| `git-graph.onlyFollowFirstParent` | Depreciated: This setting has been renamed to git-graph.repository.onlyFollowFirstParent |
| `git-graph.openDiffTabLocation` | Depreciated: This setting has been renamed to git-graph.openNewTabEditorGroup |
| `git-graph.openRepoToHead` | Depreciated: This setting has been renamed to git-graph.repository.onLoad.scrollToHead |
| `git-graph.referenceLabelAlignment` | Depreciated: This setting has been renamed to git-graph.referenceLabels.alignment |
| `git-graph.showCommitsOnlyReferencedByTags` | Depreciated: This setting has been renamed to git-graph.repository.showCommitsOnlyReferencedByTags |
| `git-graph.showCurrentBranchByDefault` | Depreciated: This setting has been renamed to git-graph.repository.onLoad.showCheckedOutBranch |
| `git-graph.showSignatureStatus` | Depreciated: This setting has been renamed to git-graph.repository.commits.showSignatureStatus |
| `git-graph.showTags` | Depreciated: This setting has been renamed to git-graph.repository.showTags |
| `git-graph.showUncommittedChanges` | Depreciated: This setting has been renamed to git-graph.repository.showUncommittedChanges |
| `git-graph.showUntrackedFiles` | Depreciated: This setting has been renamed to git-graph.repository.showUntrackedFiles |
| `git-graph.useMailmap` | Depreciated: This setting has been renamed to git-graph.repository.useMailmap |

<a id="section_812024c6a8aa"></a>
## 1.6\_ command and function layout matrix

| Upstream command | Typora entry | Implementation and verification boundary |
| --- | --- | --- |
| `git-graph.view` | Status bar, SCM commit diagram title, command panel; UI opens central history | View Git Graph (git log) |
| `git-graph.addGitRepository` | Repository management → Add; UI validates single repository hidden / multiple repository selection | Add Git Repository... |
| `git-graph.clearAvatarCache` | Operation / command panel → Clear avatar cache; Host lifecycle regression | Clear Avatar Cache |
| `git-graph.endAllWorkspaceCodeReviews` | Review Management → All Completed; Git Review Storage and 90-Day Expiry | End All Code Reviews in Workspace |
| `git-graph.endSpecificWorkspaceCodeReview` | Review Management → Specify Review End; Git Storage | End a specific Code Review in Workspace... |
| `git-graph.fetch` | Top Fetch, Operation Menu; Git Local Bare Remote | Fetch from Remote(s) |
| `git-graph.removeGitRepository` | Repository Management → Remove Record; UI Multi-Repository Entry | Remove Git Repository... |
| `git-graph.resumeWorkspaceCodeReview` | Review Management → Continue; Git Storage, UI Open Details | Resume a specific Code Review in Workspace... |
| `git-graph.version` | Operation / Command Panel → Version Information; System Git Output | Get Version Information |
| `git-graph.openFile` | Workspace / Staging area comparison opens the current file; history comparison opens the specified commit's read-only document content; UI + real Git version byte verification | Open File |

<a id="section_c564595f7726"></a>
### 1.6.1\_ Visible Layout and Interaction Item-by-Item Verification

Central Git Graph uses its own geometry, SCM sidebar uses VS Code host geometry. The previous round compressed the central Graph into 35/22px belongs to the project's deviation, and has been corrected according to the fixed upstream; it cannot be replaced by the unified workbench density to one-to-one verification. The following table numbers distinguish content size and final box size including the border.

Dimension Evidence Comes from Fixed Commit's [main.css](https://github.com/mhutchie/vscode-git-graph/blob/881a9e613045bacbbadf8940f6b6c5b8bd699335/web/styles/main.css), [dropdown.css](https://github.com/mhutchie/vscode-git-graph/blob/881a9e613045bacbbadf8940f6b6c5b8bd699335/web/styles/dropdown.css), and [findWidget.css](https://github.com/mhutchie/vscode-git-graph/blob/881a9e613045bacbbadf8940f6b6c5b8bd699335/web/styles/findWidget.css). Only Extract Dimensions and Behavior Facts; This Project Still Uses Independent Implementation.

| Object | Upstream Definition | This Project Geometry Check |
| --- | --- | --- |
| Single-Row Toolbar | 32px Content Line + 4px Above and Below + 1px Border | Total Height 41px; Narrow Window Line Breaks Are Counted Separately |
| Dropdown / Toolbar Action | Dropdown 26px; action 20px; common SVG 18px, refresh 16px | Measure Separately, Do Not Use Unified Icon Hit Value to Replace |
| Table Header / Commit Line | Table header 18px line height + 6px above and below + border; commit line 24px | Table header 31px; SVG height 24px, node center 12px, adjacent line spacing 24px |
| Detail Operation Bar | Bar 32px; Button 24px; SVG 20px | Two Detail Drop Points and Narrow Group Check |
| Find | Height 34px, right margin 28px, expand top 0; button 20px; minimum count 75px | Measure after the expand animation is complete, do not take intermediate frames |

| Area / Function | Upstream behavior and layout | Current behavior of Typora | Actual regression |
| --- | --- | --- | --- |
| Top repository | Multi-repository selector, single repository omitted | Hidden on first load; multi-repository refresh displays; branch, remote switch, right-side actions | UI single-repository / multi-repository state and width |
| Top actions | Find, repository settings, Fetch, Refresh | Same area, add integrated terminal entry; 20px hit box / ordinary 18px SVG, refresh 16px | UI geometry and accessible name |
| History five columns | Graph, Description, Date, Author, Commit; the last three columns can be hidden | Default same order; column header menu restores visibility and retains scaling | UI real mouse menu switching and display calculation |
| Reference tag | Normal; branch left tag right; branch tight to graph tag right | Three settings separately move real tag DOM; reference icon background and current branch border follow corresponding track color, text follows theme, merged remote segmented retains independent entry | UI column drop point; branch / tag data is validated by Data |
| Uncommitted node | Work tree hollow circle / HEAD hollow circle, latter dashed line connected | Two modes; keep topology connected to HEAD, default empty circle for working tree | Data topology; UI working tree selection and SVG |
| Commit details | Click to open, click again to close; Ctrl comparison; inline or bottom | Mouse and Enter/Space share conversion; close and clean version and file status; two drop points | UI repeated activation, asynchronous delay, docking with 360px layout |
| Changed Files | Tree/list, compact directory, status indicators, open differences and files | File/directory 18px content height, 4px top spacing, 13px icon; local scrolling | UI real file navigation and nested directories |
| Any comparison | Two commits, commit and working tree, root commit and empty tree | Ctrl/Meta mouse and keyboard comparison; first commit EMPTY | UI + Git |
| Review | Single commit/interval, cross session, 90-day expiration | localStorage saves by repository and version; mark file as read when opened | Git storage expiration; UI detail operations |
| Find | Field search, case-sensitive/regular expression, input update, highlight, optional auto-open details | Three switches default false and consistent with upstream; input synchronization matching, Enter/Shift+Enter switch results; matching position is independent of details | UI real input, case-sensitive, valid/invalid and zero-length regular expression, highlight, loop, details switch and delayed Git response invalidation |
| Date | Local date time, only date, ISO date time, ISO date, relative time | Five types; relative time expressed in seconds/minutes/hours/days | UI real format output; Meta enumeration |
| Git operation dialog | Right-click on object, configurable initial value, Enter action | Chinese fields; preview specific command first then execute; multi-line message Enter line break | UI no change preview, Git execution / expiration rejection |
| branch | create / switch / delete / Fetch / Merge / Pull / Push / Rebase / rename / Reset | Branch menu adds Fetch and Pull; various commands fill based on target | Git real ref, bare remote, rebase; UI entry |
| Tab | Annotated default; Lightweight; can be pushed after creation | Explicit type and push; composite preview shows two commands, second step failure explains first step completed | Git object type and bare remote ref |
| Fast-forward merge | Merge/Pull squash, Default / Git SQUASH_MSG, can delay commit | Commit only if there are staged differences; commit before review draft and index; partial success report after first step and retain staged results | Git single-parent commit, --no-commit, subsequent checks failure and external stage retention |
| Reference input | Do not replace / use hyphen / underscore to replace space | Explicit setting, replacement still executes check-ref-format | Git actual creation of feature-space |
| Stash | Creation includes untracked, apply/pop recovery index, drop, branch | Object right-click; default include-untracked aligns with upstream | Git real stash lifecycle |
| Remote repository | View, add, edit, delete, fetch/prune, configure export | Operation menu and shared configuration; Git/terminal path does not override shared files | Git local remote; UI repository management |
| Language and icon | VS Code host language and theme | Typora language; bilingual key; official Codicons data, source code not copied from upstream | Meta bilingual; UI real SVG |
| SCM entry | Title row inline / More Actions | Top only retains view ellipsis, Graph area retains open history | UI validation top has no duplicate buttons and Graph entry is reachable |
| Lifecycle | Host responsible for hiding / closing / uninstalling | Hide cancel read query; permanently dispose clear listener/observer/node; reject uninstall during writing | UI blocks writing during destruction, idempotent destruction, and prohibits reopening |

<a id="section_d0ddc5a6d26b"></a>
### 1.6.2\_default adaptation and proof boundary

Initial count 300, incremental 100, auto-load, date sorting, dim merge, merge same-named references, display remote HEAD, mailmap default off, search depth 0, repository sorted by path aligned fixed upstream. `open_active_repo=true` Keep this product default: open the repository of the active document, avoid users to re-select repository every time after switching files. The letters for accessibility status always display. TextDecoder encoding set, Typora document and sidebar host belong to explicit adaptation; the central Graph no longer uses host 35/22px density.

The abandoned upstream configuration name is only listed as index, not establishing second status or old parameter forwarding for them. Custom PR provider list and tag chart standard color have been integrated, `test_git_graph_pull_request.cjs` and `test_git_graph.mjs` have been verified for provider switching, self-built service, encoding and storage; `pr_providers` maintains the naming provider, `pr_config` saves the repository selection. GitHub/GitLab/Bitbucket URL generation can use local pure function verification, user account authentication and network push cannot use local bare regression as alternative.

This table is the complete configuration and command count for this fixed version, not using the number of items as proof of full functionality. After each change, relevant actual behavior regression should be re-run, and then update the evidence; keep the above host differences, cannot claim that Typora has already fully adapted to VS Code host.

<a id="section_f1ec8a9c8ce8"></a>
### 1.6.3\_ Workbench menu and quick entry

The following belongs to the frozen workbench entry for Git Graph, not Git Graph extension configuration. Layout is maintained according to confirmed scope; the reorganized menu, additional title bar layout button and bottom Panel are no longer listed as existing capabilities.

| Function / Layout | Current entry and boundary | Evidence status |
| --- | --- | --- |
| Seven main menus | File, Edit, Paragraph, Format, View, Theme, Help; renderer calls the already verified Typora API, long menu scrolls below the top bar | Do not modify ASAR or bridge main process; ordinary / Shift wheel and native scenario records see [feedback review record](../docs/feedback_review.en.md) |
| File name search | Ctrl+P and central search in the top bar open the same file picker, preserving `440ec3f` style; back and forward for Markdown reading history | Structured file identity, input method confirmation, and current directory scope are determined by the corresponding target check; physical accelerator conflicts are not yet verified |
| Editing and positioning | Preserve native Markdown operations, Monaco's existing keyboard operations, and accurate search hit positioning; do not add a 'select / go to top' menu | file editing / selection search preserves the selected area, draft, conflicts, and save protection |
| Command entry | Continue using existing core command entries and registered actions; do not wrap them through a new Command Center in the title bar | Single startup and real command routing target; do not claim that the interface still exists |
| Terminal | Existing default terminal, administrator terminal, and settings actions; default to entering the lower editing group | No independent bottom Panel or entry for Panel transfer; terminal session target is preserved |
| Layout and icons | Continuous activity bar, outline switching by file type, shared Seti file tags; host window control buttons 46×35px | Actual size and boundaries see [workbench issue matrix](../docs/workbench_parity.en.md), verification count is not repeated in this table |

<a id="section_a21a57e88ce7"></a>
### 1.6.4\_Tailoring review's incomplete items and evidence gaps

The following items clearly limit the 'one-to-one' completion scope; configuration names are fully counted, but not equal to all their values, entries, and behaviors are fully aligned.

| Priority | Incomplete items / differences | Confirmed implementation boundaries | Should-be behavior proof |
| --- | --- | --- | --- |
| Completed | Graph Find control and behavior | Fix upstream `web/findWidget.ts` and `src/extensionState.ts` as the basis; `git_graph_find.ts` implements case sensitivity, regular expressions, error prompts, real-time matching, highlighting, and detail switch; three switches default to false. Synchronous matching replaces upstream 200ms delay, details still use epoch isolation | `test_git_graph_interaction.cjs` has executed real input, zero-length / illegal patterns, loops, switches, and real Git diff responses; screenshot `graph_find_regex.png` |
| Part | Layout of the settings page | Retain a simple form and explicit save for the current repository based on the frozen baseline, without providing additional classification search and structured object editor | `test_git_graph_settings_view.cjs` Check simple forms, real input, unsaved changes, write operations, and storage failure boundaries |
| P2 | Insufficient regression for partially configured runs | In the configuration matrix, Meta only validates types, default values, and bilingual labels; it does not prove item by item automatic loading, loading filters for each, full keyboard shortcut coverage and replacement, and display of avatars and signatures | Real loading / reopening / keyboard behavior for each item; signature display cannot be replaced by a Git test tag, and online avatars cannot be replaced by default false |
| P2 | Upstream visual differences in advanced details / navigation | Upstream role sizes have been restored; still need visual verification for each state. Two details landing points have been verified locally with Electron; this round's Typora real window has been verified with embedded details and narrow split view, while docked real windows and paired screenshots are still pending | Fix paired screenshots for the same state between upstream and local, as well as interaction evidence for this round's real window |
| P2 | Details drag and share menu | Details still use fixed dual-column or narrow window vertical layout; there is no upstream 6px internal width divider bar yet; the right-click menu still reuses the workbench renderer, and has not been formatted according to Graph-specific padding and selected marker layout | Extract interaction and size from fixed upstream; the menu needs to retain its source, avoiding changes to Graph when adjusting Explorer / SCM |
| P3 | Declaration and test granularity | `Git + Meta` or `UI + Meta` are entry points for related kits, and do not guarantee that all enumeration combinations and all host paths in this line are individually executed | Continue to establish precise assertions for new or modified real behaviors; avoid using field / source code string existence as a substitute for testing |


<a id="section_f8d62e314009"></a>
### 1.6.5\_ Settings page frozen boundary

The settings entry recovers a concise form using `59412a2`: Boolean values, numbers, enumerations, and text use corresponding controls, objects and arrays use JSON text boxes. Keep save, restore default, import and export, and do not provide this round's additional classification, search, modified filter, single reset, and structured complex object editor.

Settings apply to the current repository. Ordinary editing explicitly saves and applies after explicit saving; import validation succeeds and directly applies, but retains local Git path, terminal, and avatar switch, and exports block these local overrides. Retain unsaved changes, storage failure rollback, and correctness checks for repository changes / write operations blocking save. Verification see `test_git_graph_settings_view.cjs` and native Git fixture. Currently, no complete one-to-one function migration is performed; new capabilities must have independent user authorization, implementation scope, and verification evidence.

2026-09-12, the sidebar for source code management retains 22px line height, and hidden operations no longer frequently occupy space; summary, citation, author, and expand actions are allocated according to available width. Hovering on a commit displays author, full information, time, citation, change statistics, and copyable commit number, replacing multi-line system title; asynchronous switching and edge positioning see [Interaction Design R022](../docs/workspace_interaction.en.md#section_ce0e7826087e).

2026-09-13, R022/R024: Line operations are immediately displayed by hovering or keyboard focus, and expanding itself does not retain action slots; 'Commit line operations always display' uses existing repository settings to save, defaulting to closed. Details cards are centered aligned to trigger when outside the complete list, including scroll bar avoidance, compact appearance, and indicator corner; ordinary controls still use unified default interaction, and the domain only provides content and boundaries. This round's five VS Code built-in Graph-specific configurations and related interaction differences are unified in [Configuration Check](../docs/git_graph_configuration.en.md), and unimplemented items are not falsely supported.

<a id="section_9e5694afa17f"></a>
## Operations of the source code management sidebar

Sidebar repository partition, commit graph reference filtering, toolbar visibility / keyboard shortcuts, file and commit right-click, and worktree management, see [Source Code Management and Graph Operations](../docs/git_scm_actions.en.md). The sidebar and the central complete graph share the same repository and write operation services; interface settings take effect separately according to their respective views.


<a id="section_64171f5802bc"></a>
## R050 Commit graph column divider line

2026-09-19, user feedback that the three boundary directions of the central commit table are reversed, and the commit number cannot be adjusted. The root cause is that the existing table fills the remaining width with the description column, while each right drag handle only increases its own column; adding a date or author column would compress the left description column, actually moving the actual boundary to the left. The drag handle of the commit number column is on the far right of the table, not within the user's operation boundary of the author / commit number boundary. Previously, 'Reset Five Columns' was also inaccurate: the actual setting only had four text columns, and the graph line width is determined by the number of tracks.

Fixes Git Graph v1.30.0, 881a9e6: adjust column alignment in web/main.ts to target adjacent visible columns, skip hidden columns, keep explanation columns automatically filled, and adjust commit numbers to the left boundary; in web/styles/main.css, the resizeCol provides a 6px hit area around the boundary. Only extract factual independent implementations, do not copy restricted upstream code. This round continues to use the current 7px inclusive hit area and text column configuration boundaries of 40-1500px; these are the existing product compatibility values, not claiming upstream original values. Do not add line width configuration, sorting, additional columns, or change Git reading and operation.

`git_graph_columns` centrally manages the geometry and input of all text column boundaries. Each boundary is bound to the left and right two actual visible columns; right drag adds a column to the left and removes one from the right, while left drag does the opposite; other columns and the table's total width remain unchanged. Explanation columns continue to elastically fill, and when adjusting the right boundary, the right column is modified. Only when it is definitely necessary to reduce the minimum width of the explanation column below its original minimum value is the minimum width of the explanation column reduced. The rightmost boundary does not place a handle that cannot be allocated adjacent space; the hash is adjusted from the left boundary; after hiding date/author, it automatically pairs with the next visible column. The boundary restrictions simultaneously satisfy both the minimum values of the two columns and the maximum value of the fixed column. When encountering a limit, it stops without reversing. The header and all rows share the same group of grid variables. In narrow windows, the existing horizontal scrolling is maintained.

The panel.settings.column_widths remains the only persistent state; The module records the actual pixel values of two columns and takes a snapshot when pressed, with movement only for draft display, and saves once when normally released and changes occur. Do not start with a non-left click; Esc, pointercancel, unexpected loss of capture, refresh redraw, switch database, tab close or destruction revoke unsaved drag, release pointer and processor, do not write new repository. On save failure, restore original value and feedback using the existing state area, do not swallow errors. Arrow keys move the same boundary by 10px, Shift+arrow keys move by 50px, and the aria value reflects the actual width of the left column and the constraint; This step size is the keyboard adaptation value for this project. Right-click to reset the four text columns to their original default, and the column settings remain unchanged. Bind geometry after the header is mounted; a single ResizeObserver follows the header width and updates the value seamlessly when columns are hidden or restored. Cancel in-progress dragging when the layout changes, disconnect the observer when destroyed, and do not publish zero column width when hidden.

Validate real hidden Electron mouse drag/arrow key behavior, assert boundary displacement in the same direction as the pointer, equal adjacent column widths, alignment of other columns and headers/content, hash width change and narrowing, refresh/reopen persistence; cover light/dark, 100%/125%, narrow window horizontal scrolling, hidden combinations, upper/lower limits, cancel/save failed/stale events. 20/100/1000 load validations for repeated redraws and round-trip adjustments without drift, DOM growth or observer leakage; native isolation of Typora validate final CSS three actual boundaries and hash width, retain window load and installation boundaries. Related regressions include Graph interaction, settings/bilingual, detail separators and SCM/shared separators; do not perform Git write operations on user's real repository.

This delivery round: final candidate units, functions, three-level pressure, and original Typora 78 items have passed, dark and light screenshots have been visually inspected; The hash list is adjusted from 80px to 130px and restored. Full check with Graph interaction/setttings, sidebar separator, SCM history 4 UI regressions passed before the last accessibility sync adjustment. After the last adjustment, it is rebuilt and passed the target test, native and build/deployment checks. 2026.09.19.5 installed, 27 assets and candidates consistent, 5 host/configuration protection summaries unchanged, installation check OK; Current user window needs to be saved before manual restart, not pushed. Test case TC-git-columns, TC-git-columns-math, TC-git-columns-stress and TC-system-native-stability associated with R050, [Evidence record](tests/evidence/git_columns_20260919.json) retains failure, re-run and stub/platform boundary.
