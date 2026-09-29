[Chinese](workbench_parity.md)

<a id="section_391ed6af00cd"></a>
# Typora Code workbench scope and regression matrix

2026-09-23 R074: Unified functional area light and dark background, separation and operation status, main theme of the document content is independent, the layout size is kept; the current scope and verification see [Color and visual hierarchy](workspace_colors.en.md).

Record date: 2026-09-10. The workbench is referenced by the user confirmed Monday screenshot and `59412a2` (2026-09-06) flat layout, and retains the subsequent explicitly authorized fixes. This is not a full library rollback, nor is it to complete all VS Code functions. The reading of the fix baseline is `5622258`; subsequent search performance and drag/drag across window implementation are maintained as independent documents, the current delivery and verification status is unified see [Feedback recheck record](feedback_review.en.md), and it is not extrapolated from the old pass count.

<a id="section_30289cd58765"></a>
## Current scope

2026-09-20 synchronization: File operations and terminal are authorized on September 12; opened editors / timeline are authorized on September 19 R037; start and switch are authorized on R054; other areas remain unchanged layout.

| Area | Retained behavior | Removed extensions |
| --- | --- | --- |
| Title bar | 35px single-line top bar: Left Typora seven menu and terminal menu, middle and backward forward search, right host window control | Menu reorganization and additional layout buttons |
| Explorer | Opened editor, directory tree and timeline; toolbar, native selection window, file management menu, 8px level indentation; click on the file to keep it open; share Seti, see [File operations](file_operations.en.md) and [Partition design](explorer_history.en.md) | Default preview tab replacement, compact directory chain |
| Active bar and outline | Continuous active bar, original order adjustment; independent outline entry, Markdown title and code symbol switch according to file type | Modern UI card and spacing; embedded outline at the bottom of Explorer |
| Search | Query, filtering, result grouping; click below reading preview, double-click open accurate hit; preview zoom and positioning | Default central editor preview tab |
| Editing and terminal | Native Markdown, source code and difference view; terminal default bottom panel, supports moving into editor in the same session, see [Operations and configuration](terminal_operations.en.md) | Unconnected tasks, debugging, extensions and remote capabilities do not set empty menus |
| Code analysis and navigation | Programming source code is analyzed according to language LSP, Ctrl+Left click/F12 definition → declaration, right click declaration / implementation / reference and current version diagnosis; C/C++ can be configured engineering background index, see [R068.6](code_analysis_colors.en.md#section_23b43513f4e3) | Call graph, refactoring, completion, project problem panel and full project unsaved buffer synchronization not connected |
| SCM and Graph | Existing operations and independent function matrix, retain topology, icons, folding and file state repair; submit web page according to remote platform identification | Do not add irrelevant functions on the basis of layout freezing |
| Reading and status bar | Visible title synchronization, link hints, document content thumbnail and original margin percentage; Alt + left and right keys share cross-editor navigation history, retain link start and end points, source code line and column, and editing group, see [Navigation History](navigation_history.en.md) | Complete appearance settings page |
| Community plugin | Extended activity bar, Ctrl+Shift+X, gear plugin settings, real community market, independent start and stop and plugin self-settings; v2 compatibility layer reuses existing UI, see [Plugin Design](community_plugins.en.md) | VS Code extension host and second community workbench |
| SSH Remote | Main resource tree / file menu / search / SCM and Graph operations remote; Native Markdown editing and link navigation, default remote terminal, Windows optional encryption password memory, see [Current Design](remote_ssh.en.md#section_7c965c9abf6c) | Native document external changes auto-load, complete remote session recovery, Windows remote and VS Code Server / extension host etc. are not yet completed |
| Update | Remote SHA corresponds to ZIP, user data temp, successful commit confirmation, check / verify / install activity bar and real download volume, immediate installation manual restart, see [Update Design](workspace_update.en.md) | Require users to clone or download Git history |
| Uninstall | Effective installation before backup recovery; if no compatible backup, only revert current entry, pre-check / backup / log / rollback, see [Installation Guide](installation.en.md) | Reinfection of old host, clear personal data |
| Start and cleanup | Static styles and persistent scripts, readiness after first display and failure recovery, single-time initialization, sidebar content transfer, resource release, unsaved document protection | Second community core or cover workbench layout |

[VS Code Source Record](vscode_design_baseline.en.md) saves the basis for already adopted icons, size and color; the research numbers of the old Modern UI are not covered in this table. The scope of Graph is see [Independent Matrix](../enhancements/git_graph_features.en.md), does not declare the equivalent of complete VS Code.

<a id="section_a848a3f5917e"></a>
## Layout numbers and source boundary

| Object | Current agreement | Source and boundary |
| --- | --- | --- |
| Single-line top bar / window control | Height 35px; window control button width 46px | Fix VS Code source code values, retain host window actions, do not change ASAR |
| Top bar menu / search | Menu row 24px, search box 22px; long menu scrolls below the top bar | Support regular and Shift+scroll, main menu remains visible |
| File tab bar | Height 35px, 13px Segoe UI; active background and top edge distinguish current page | Light 2026 / Dark 2026 status colors |
| Difference editor | Actions are located to the right of the associated edit group's tab row; 16px icon, 24px button; version path row height 26px, font 13px | Two-column view separately displays old / new versions, integrated display of both versions and mode entry; switching tab clears this group of actions |
| File selector | Width `min(62vw, 600px, calc(100vw - 12px))`, maximum height `min(70vh, 560px)`, result row 22px, input box 23px | Preserve `440ec3f` selector style; commit identifier does not indicate size |
| Active item | 48×48px, 24px icon, continuous arrangement | First slot starts from the bottom boundary of the top bar, without card and item spacing |
| Explorer | Row height 26px, toolbar minimum 38px, action 25px, root title minimum 27px | Virtual list step size matches row height |
| outline | Native Markdown tree layout and `fa-list` entry; code uses symbol tree | Do not enforce Explorer row height |
| status bar | Native area and existing operations, margin single side 0%～24% | Readable document content and thumbnail exclude the status bar coverage area |

Status prompt is empty when not present; when errors and cancel renaming occur, the current operation row must still be visible. Margins retain original storage fields, only restore document content width controls, without reapplying historical fonts or other appearance parameters.

Diff editor defaults to enabling "use inline view when space is insufficient", switching based on actual diff editor width: inline when width is no more than 900 CSS px, side-by-side when width exceeds 900 CSS px. Manual inline and automatic switching are independent options; manual inline remains inline in wide groups. Default side-by-side ratio 0.5 only controls how much space each version occupies, not the automatic switching threshold. More menu items hide unmodified areas, display moved code blocks and accessible diff viewer; `F7`／`Shift + F7` enter and navigate backward／forward in accessible diffs, regular forward／backward changes use tag line arrows.

<a id="section_c4fffa86d335"></a>
## Known Issues and Verification Matrix as of 2026-09-10

This table records the current behavior and the scenarios that need to be retained. Each build, test count, native evidence, and historical defects are maintained in [Feedback Review Record](feedback_review.en.md), and this does not copy old logs or convert historical issues into current version acceptance.

| Issue | Current Handling and Boundaries | Regression Scenarios |
| --- | --- | --- |
| Missing First Slot Icon in Activity Bar | Place the first slot below the top bar based on the real host header hierarchy | First slot position, scaling, light/dark theme, real click and recovery |
| Outline Entry / Leaf Arrow | Retain native `fa-list`; nodes with only subheadings display a collapse arrow | Dynamic addition/removal, parent-child collapse, navigation, and unloading |
| Adjacent directory contention and switching too late | Prioritize fully visible titles with 12px buffer on the edges; if there is no visible title, revert to the parent chapter; unify delayed callback | Mid-screen new title, boundary micro-scrolling, explicit navigation, and stale callback |
| SCM Level and Duplicate Entry | Changes include the commit area and two types of changes, Graph is independent; only retain the view menu at the top level | Collapse, narrow window, Graph title actions and count blue background white text |
| Graph Color / Stash / Details | Branches merge into parent nodes with their own colors; filter private stash auxiliary objects; details follow the commit line | Multiple parent stashes, normal references, pagination, details expansion/collapse, and file operations |
| Too high tool bar for difference tools and narrow group layout | Icon actions are moved into this group's tab row; 26px version line follows actual inline / side-by-side mode | 900px boundary, manual and automatic options are independent, multi-group isolation, selection / scrolling retention, and F7 real viewer |
| Multiple buttons in the status bar are highlighted together | Branches, synchronization, and Graph are handled separately for hover/focus | Native collision style, single hit, and switch |
| Empty New tab | Only hide `typ://core.empty/`, keep unnamed draft tab | Empty page, open/close, split view, and unsaved draft |
| Native seven-menu and new terminal menu / search / shortcut | Renderer calls verified Typora API; central navigation and Ctrl+P share [R058 file selector](quick_open.en.md), fixed score/sort/highlight | Long menu, Shift wheel, switch tab by current group and input method confirmation isolation; physical accelerator not verified |
| Inconsistent icons for files and folders | All real file sharing Seti; Explorer directory only retains arrow, Graph directory retains its own icon | Same file at different entry points, same color, real path, and release on close |
| YAML / new file / broken link | YAML normal text opens; new workspace file opens directly; relative source document parsing and pre-checking for links | Draft, missing target, Chinese special path, cancel, and disk byte unchanged |
| Folder context fork | Native mount as the only root, menu and shortcut reuse the same open action | Relative path, search tab after switching root, cancel and failure do not change root |
| Link hover is hard to read or cannot be copied | Delay 1 second; Chinese target is readable; tooltip supports selecting and copying the original link | 250ms move-in tolerance, original link unchanged, cleaning, and no target reading |
| Setting entry missing | Bottom gear menu retains Typora preferences and provides plugin settings / extension; code outline has another parsing environment entry | Native command wiring, save success refresh, and failure retention |
| Margin control and word count are obscured | Status bar recovers to single side 0%～24%, shares readable viewport boundary with minimap | Native nested footer node, narrow window, document content anchor, and actual hit obstruction |

<a id="section_a68c19869a43"></a>
## Must retain security regression

Search single-click does not cut central file, double-click locates by structured path and scope; source code and Markdown retain draft, undo, reading position, encoding line end, and external conflict protection. Native asynchronous switching cannot save wrong file. Git operations only validate in isolated temporary directory, and check file against index; regular queries do not write Git objects. Start checking static style, single initialization, and resource cleanup.

Current release is 29 assets managed by the checklist. Head loads two CSS files first, then defer start core and workbench. Schema 4 installation and recovery pre-check, backup, verification, and rollback; `native_profile` only manages `framelessWindow=true` and retains other settings, and rejects writing if unknown encoding or concurrent summary changes. Installation does not modify `app.asar`, and does not write configuration to open projects; retired assets are backed up and restored according to precise checklist. Commands see [Installation and Backup](../enhancements/README.en.md#section_13bbf790a6db).

Physical keyboard conflicts with native accelerator have not been proven; synthetic key cannot replace this layer. Deployment check in Windows / compatible shell does not represent native Linux, UCRT64, or ARM64 device acceptance.

<a id="section_803ab13a7928"></a>
## This round adds new authorization and verification boundaries

C/C++ outline only uses native clangd; JavaScript, TypeScript, Python, CMake, YAML use offline Tree-sitter with package; Markdown uses title directory. clangd configuration is only saved in workbench user data, can set executable file, project relative compile database directory, and backup parameters; details see [Code Outline and Parsing Environment](source_outline.en.md).

Restored margin percentage, synchronized visible title, and Chinese link prompts are already implemented reading fixes. [Large Directory Search](search_performance.en.md) now uses batch file name results, bounded pre-read, Worker matching, and batch result rendering, retaining ignore rules and replacement safety boundaries. [Left-Click Drag and Independent Window](drag_and_windows.en.md) tab uses native drag and drop, same window sorting, cross-window merging, and window outside window creation; active bar retains existing sorting. Actual handover is confirmed by target and source identity verification. Unsaved native Markdown and auto-save have clear limitations, complete undo history does not cross-process migration; hidden fixtures through non-replacement native dual-window verification.


2026-09-20 R005.1: Split view removal / nesting replacement correctly retains share, split line only adjusts adjacent two splits; stop scrolling releases animation, active tab reordering does not reload editor. 20/100/1000 layout rounds and real channel pressure, 2000 cancellations, original Typora independent copy 20 times window merging have all evidence. Physical mouse cross-screen, document edge auto-grouping, and complete VS Code editor group configuration are still not within accepted scope; cannot equate protocol pressure with 1000 real host windows, see [Current Evidence](../enhancements/tests/evidence/drag_stress_20260920.json).

2026-09-22 R070 Second Phase: SSH remote directory can open project terminal and read-only Git status. Terminal reuses existing panel / editor group, start progress, split and restart, independent authentication; Git write operations are executed by remote Shell. Currently, no remote extension host / debug / port forwarding is provided, and these are not marked as equivalent to VS Code. Details see [Remote Design](remote_ssh.en.md).
