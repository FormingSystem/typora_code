---
id: tools.typora.typora configuration modification
title: "Custom Configuration for Typora"
kind: reference
status: evolving
domains:
  - tools
---

[Chinese](typora配置修改.md)

Installation entry and reading navigation see [Typora Installation and Reading Workspace](README.md#install-on-windows). This file maintains configuration steps, enhanced capabilities, and acceptance boundaries; [Native Preferences Screenshot](typora_configuration_preview.en.md#section_b0043d896b36) retains an independent reference location.

<a id="section_dba8ba9cfb5b"></a>
# Chapter 1 _ Explicit Line Numbers

1. Typora itself does not come with the functionality to explicitly display line numbers in code blocks, but this can be achieved through a **custom CSS theme**. Below is a complete solution:

   ------


<a id="section_0a579e3314a2"></a>
## 1.1 _ Find _ Typora _ Theme Directory

In Typora:

- Open the menu **File**→**Preferences → Markdown→ Code block** →**Check: explicit line numbers** → **Restart the software**
It contains `*.css` file(s) (such as `github.css`, `night.css`, etc.).

------

<a id="section_cc5271916d70"></a>
## 1.2_Modify Theme_CSS

Do not concatenate the username and drive letter when specifying the theme directory. In Typora, use **Theme → Open Theme Folder** to locate; the automatic deployment script then parses the directory based on the current platform's user data environment variables.

Since each Typora update reverts the themes it carries (such as `github.css`), it is necessary to copy the corresponding theme file (such as `github.css`) into a copy, rename it to `cpp_github.css`, and append the following style to the end of the copy file:

```css
/* Add line numbers to code blocks. */
pre.md-fences {
  position: relative;
  counter-reset: line; /* Initialize line numbering. */
  padding-left: 3em;   /* Reserve space for line numbers. */
}

pre.md-fences code {
  counter-reset: line;
}

pre.md-fences code span {
  display: block;
  counter-increment: line;
}

pre.md-fences code span::before {
  content: counter(line);
  display: inline-block;
  width: 2em;             /* Line-number width. */
  margin-left: -3em;      /* Align to the left edge. */
  text-align: right;
  color: #888;            /* Line-number color. */
  user-select: none;      /* Exclude line numbers from selection. */
}
```

------

<a id="section_741799a09480"></a>
## 1.3 Enable line numbers effect

- Open Typora, switch to the corresponding theme (such as `Github`).
- Each line inside a code block will automatically display line numbers.

------

<a id="section_50355c5e32e0"></a>
## 1.4 Notes

1. When Typora renders a code block, each line of content will be wrapped in `<span>`, so the style selector must use `code span`.
2. If certain themes are not working, it means the code block structure of the theme is different. You can check the DOM by pressing F12 (Developer Tools).
3. You can also further customize, such as adding a background box, highlighting the current line number, etc.

------

Would you like me to give you a **complete 'code highlighting + line number theme (such as GitHub style)'** CSS file directly? You can directly place it in Typora to use it.

<a id="section_b94025fa8937"></a>
# Chapter 2 _ Title color modification

I understand 👍. You hope that when writing Markdown in **Typora**, the titles (`# Level-one heading`, `## Level-two heading` ...) are displayed in blue, instead of the default black color of the main text.

Typora itself uses CSS to render Markdown, so changing **the theme CSS** can change the title color.

------

<a id="section_4771bd724a45"></a>
## 2.1 Method steps

1. Found the theme directory

Use **Theme → Open Theme Folder** in Typora. Do not hardcode usernames, drive letters, or Linux installation paths in the notes or scripts. Each `.css` file is a theme (for example, `night.css`, `github.css`).

2. Copy a theme
For example, if you usually use `github.css`, copy it and rename it to `github-blue.css`, so you don't destroy the original theme.

3. Modify the title color
Open the copied `.css` file and add or modify the following style (you can place it at the end of the file):

   ```css
   h1, h2, h3, h4, h5, h6 {
       color: #0066cc; /* Set the heading color to blue. */
   }
   ```

   - `#0066cc` is a deep blue, you can replace it with a favorite color, such as bright blue `#3399ff`.

4. Select the new theme in Typora
Open Typora → Menu **Theme** → Select `github-blue` (the new theme you created).

------

<a id="section_94b6015b23a9"></a>
## 2.2 _Effect

- The original title is black → changed to blue.
- The main text is still black, so it won't be confused.

------

<a id="section_999659258d95"></a>
# Chapter 3 _Adding Formula Rendering Options

File → Preferences → Markdown → Formula → Enable inline formulas and code block formulas

<a id="section_0b136880a7f3"></a>
# Chapter 4 _C and C++ Code Block Syntax Highlighting

<a id="section_2ba4f5bf2c3d"></a>
## 4.1 _Why Theme CSS is not equal to syntax highlighter

Theme CSS can only color the categories that the syntax highlighter has already generated. It cannot determine functions based on `()`, nor can it create syntax categories based on a word that exactly is `int`, `rcu_read_lock`, or `old_cfg`. The original enhancement only maps the `cm-*` class of Typora's built-in CodeMirror, so code with many declarations looks colorful, but code with dense calls remains close to plain text.

Current configuration clearly separates these two layers:

| Hierarchy | Implementation | Responsibility |
| --- | --- | --- |
| C/C++ syntax highlighter | VS Code's built-in C/C++ TextMate grammar + Oniguruma | Identify functions, types, variables, parameters, macros, preprocessor, keywords, strings, numbers, comments, and punctuation scopes |
| Color configuration | VS Code Light Modern / Dark Modern | Independent built-in original `colors`, `tokenColors`, and include chains, TextMate parses default foreground and token colors based on complete scopes; does not share the user's configuration already installed VS Code |
| Font and Code Display | `cpp_github-consolas.css` and Code Theme Compatibility | Retain the CppGithubConsoles font, size, and formatting; code background and foreground follow the light/dark configuration of VS Code, while other languages use the host tokenizer fallback mapping |

These are not private rules written specifically for `int` or a few Linux APIs. In the following call, for example, the grammar automatically identifies `rcu_dereference` as `entity.name.function.c`, and the TextMate theme layer displays the function name using the corresponding VS Code light/dark rules:

```c
p = rcu_dereference(table[id]);
```

TextMate belongs to **syntax-level recognition**, not a compiler or language server. It does not read the header files, macro expansion results, and `compile_commands.json`, so it cannot impersonate the full semantic analysis of the VS Code C/C++ extension; however, it provides a much more complete C/C++ syntax scope than Typora's native flat C mode.

The vendored grammar comes from the built-in `cpp` extension in VS Code `1.135.0`, extension version `10.0.0`. License and provenance information is stored in the [VS Code C/C++ grammar notice](./enhancements/vendor/vscode_cpp/NOTICE.md).

<a id="section_996e871eef65"></a>
## 4.2 _Supported Code Fences

C and C++ code blocks still must explicitly specify the language:

````markdown
```c
static int counter;
```

```cpp
std::vector<int> values;
```
````

Currently, `c`, `clike`, and `csrc` will be mapped to the C grammar, and `c++`, `cpp`, `cc`, `cxx`, `h`, `hpp`, and `h++` will be mapped to the C++ grammar. Fences without language tags are treated as plain text, as the system cannot reliably determine whether they are C, log, configuration, or pseudo-code.

<a id="section_fa88548ded67"></a>
## 4.3\_Long code block height and full expansion

Long code that defaults to occupying multiple screens will break the reading chain of 'main text raises a question → code provides evidence → main text continues to explain'. Expansion is therefore only added for **ordinary code blocks that are indeed taller than the reading height**.

- Default display height takes `52%` percent of the current window height, and is limited between `320px` and `560px`;
- Only when the actual content of the code is at least `48px` more than this height will the control appear, and short code remains exactly as it is;
- The folded state still allows scrolling within the code block, without truncating or deleting the content;
- After clicking the `Expand All Code` at the bottom, the height restriction is canceled, and the button immediately becomes `Collapse Code`;
- The button takes effect directly regardless of whether the cursor is in the main text or in the code block; the button can also be toggled with Enter or space after it gains focus;
- When folding again, it returns to the beginning of the code, making it convenient to continue reading downward from the main text;
- Mermaid, flowcharts, sequence diagrams, and other chart fences do not apply the code height limit, and they continue to use their own independent full-screen viewer;
- When printing or exporting, all code is forcibly displayed and the interactive buttons are hidden.

This state exists only in the DOM of the current window of Typora, is not written to Markdown, and does not insert folding markers into the code. Code fences can still be limited in height even without language tags, as long as they are indeed long. Language tags only determine syntax highlighting, not whether folding is allowed.

<a id="section_725de9612dfb"></a>
# Chapter 5\_Mermaid Independent Viewer

<a id="section_69fcaa41afc3"></a>
## 5.1\_Why Can't You Just Widely Display the Main Text Diagram

Putting complex Mermaid diagrams directly into the width of the main text will shrink nodes and text overall. Putting the main text SVG in-place magnification will change the document layout, scrolling position, and editing state. Therefore, the current implementation continues to use the boundary of the repository Mermaid viewer: **Main text diagrams are responsible for reading context, and independent viewers are responsible for detailed viewing**, and the two have no overlapping dimensions or interactive states.

A normal tool area is present above each rendered Mermaid diagram, with the `View Fullscreen` button located on the right and spaced `8px` away from the diagram. The button is not fixed or sticky, does not follow the screen movement, and does not cover nodes; it naturally scrolls with the diagram. The tool area is placed inside the actual preview container and is bounded by the associated Mermaid code block for deduplication: Typora retains both the current preview and the preview being rebuilt when multiple previews are present. A visible code block can only have one button, and hiding the preview does not allow its button to leak outside.

<a id="section_2c3b0e451f55"></a>
## 5.2\_Viewer operations

After opening the viewer, the default is to keep `100%` readable size, and it no longer automatically compresses to `47%` in proportion to fit the entire wide diagram on one screen. Wide diagrams can be directly dragged to view:

| Action | Function |
| --- | --- |
| `−`、`＋` | Zoom in or out at a fixed ratio |
| `Fit Width` | Calculate the ratio only based on available width, suitable for continuing reading vertically |
| `Fit Screen` | Display the entire diagram at the same time based on width and height, which may be smaller than `100%` |
| `100%` or `Ctrl + 0` | Restore the actual readable size and return to the center |
| `Ctrl + mouse wheel` | Continuous zooming with the mouse pointer as the center |
| Hold the left mouse button and drag | Pan the current diagram |
| Double-click the canvas | Fit screen |
| `Esc` | Exit the viewer and return the focus to the original location |

When cloning SVG, the actual graphic boundaries are re-measured, the excess white space of the original `viewBox` is cropped, and the clear width and height are reconstructed. After exiting the viewer, the zoom and pan settings are not written back to the main SVG content, and the Markdown source code is not changed.

<a id="section_4ae7aedb1375"></a>
# Chapter 6\_PowerShell, UCRT64 and Linux one-click configuration

The user installation steps are now uniformly maintained in [Installation and Recovery Guide](docs/installation.en.md), including downloading the complete package, environment requirements, permissions, offline cache, updates, uninstallation, and recovery. The following entries are retained for easy jumping from existing reading links.

<a id="section_62b2ac3072ba"></a>
## 6.1\_Path discovery is not guessing the installation directory

See [Paths and Write Range](docs/installation.en.md#section_e198eb51b951).

<a id="section_1711938e2efb"></a>
## 6.2\_WindowsPowerShell entry

See [Windows Installation](docs/installation.en.md#section_416b242f0fb5), the public entry is `install_windows.cmd` / `install_windows.ps1`.

<a id="section_de3e456801e8"></a>
## 6.3\_UCRT64 and LinuxBash entry

See [Linux and UCRT64](docs/installation.en.md#section_aa40555ad895), public entry is `install.sh`.

<a id="section_eccf4e91d7ea"></a>
## 6.4\_Deployment Actions and Unified Backup

See [Path and Write Range](docs/installation.en.md#section_e198eb51b951) and [Uninstallation and Recovery](docs/installation.en.md#section_1b97e4a77bb2). The purpose of backup during the first installation and subsequent updates is different, please keep the complete directory.

<a id="section_e0c38f223a46"></a>
## 6.5\_Read-Only Status Check

See [Check and Update](docs/installation.en.md#section_8257844c2dfc), public entry is `check_windows.ps1` / `check.sh`.

<a id="section_e5ce8d0ee622"></a>
# Chapter 7\_Maintenance, Acceptance, and Boundary

<a id="section_8df3e6a8225a"></a>
## 7.1\_Developer Rebuild

Only when modifying the source code of the extension, upgrading grammar or dependencies, do you need to prepare Node.js for development on your own; the Windows installer will manage the private runtime for the integrated terminal separately:

```powershell
cd enhancements
npm ci
npm run build
npm run check
```

Automatic testing confirms function calls and the syntax role and color mapping of multi-line macros in C/C++; keywords, types, function calls, strings, and comments within the macro body should not be uniformly covered by the outer preprocessor context. Read history test coverage jumps, forward branch truncation, cancel opening and repeat key presses; installation testing uses isolated temporary directories. Interaction fixtures and real window verification entries are seen in [Typora Workbench and Enhancements](enhancements/README.en.md#section_3a010e92a2c3).

<a id="section_58ffa9c12c5e"></a>
## 7.2\_Manual Acceptance

- Open a document with `c` fence, confirm that function calls, types, variables, keywords, constants, strings, and preprocessor directives are no longer all the same color.
- Open a long code snippet, click outside the code block to select the document content first, then directly click `Expand All Code` or `Collapse Code`, confirm that the first click takes effect; at the same time, check the block scrolling, button reconstruction after the operation, and the switch between Enter / Space. Short codes and Mermaid should not have a code folding button.
- Open a document containing Mermaid, confirm that the button is above the diagram rather than covering the SVG.
- After entering the viewer, confirm that the default `100%`, adaptive width, adaptive screen, button zoom, `Ctrl + mouse wheel`, drag, and `Esc` are all normal.
- After exiting the viewer, confirm that the document image size and Markdown content have not changed.
- Confirm the window does not display an unsaved marker solely due to loading an expanded document without editing the main content.
- Open two Markdown files in the current window, confirm two file tabs are generated; `Ctrl + \` split view to the right, `Ctrl + K` press `Ctrl + \` to split view downward, drag the divider to adjust the size, click the preview split view's main content to switch to editing.
- By navigating through in-document anchors and cross-file anchors, confirm `Alt + ←` returns to the source link once, `Alt + →` returns to the target, and restores the reading position; when there are unsaved changes, cancel the host confirmation, confirm the original text is retained.
- Click a link with a Chinese title from another tab, confirm the target title appears in the viewport, the cursor and directory select the same title, the source tab still displays the original paragraph; after closing the tab and the window, reopen them, confirm that the normal open continues from the last position, and the tab with a title opens prioritized to the specified title.
- Right-click an inactive file tab or file tree item, copy the relative path and absolute path, confirm the copied object is correct and no document switch occurs; check `Ctrl + K`, `P`, and `Ctrl + K`, `Ctrl + Shift + C`, and confirm the original downward split view shortcut is normal.
- Open Git Graph, check commit links, branch filtering, merge parent commits, and Chinese file differences; then verify the operation preview, execution, and review records in the test repository; after switching back from the tab to the document content, confirm that the original non-zero reading position is maintained. The temporary repository regression passes `test_reading_native.ps1 -suite git` execution, and compare the original bytes of unstaged document and index.
- Place hidden folders, `Makefile`, `.env.local`, `types.d.ts`, archive, and regular Markdown files in the temporary directory, confirm that all are visible; when the directory is not expanded, the document content is not pre-read, the source code fills the current editing group, and Markdown continues to render natively.
- Edit the temporary source code, check the unsaved dot, display and close of Ctrl+S and right-click save, display and close of Ctrl+F; verify the draft retention when closing the tab, the disk is modified by external, and input continues while saving. Switching encoding or line breaks should write to disk only when saving, and Git history and jump side preview remain read-only.
- Switch between two source codes, confirm that language, encoding, and line endings are independent; after inputting a draft, switch tabs, drag across groups, and right-click split view, confirm that the original draft and undo records are retained. Closing the background unsaved tab should also ask for confirmation, clearly discard the draft so that it does not block operations. When closing the window, process the source code first, then the native Markdown; if either process is canceled, the next time it should still be re-protected.
- Search according to `Ctrl + Shift + F`, confirm that only a unified search box is present, check file icons, directories, Git status, and highlighting, hover to view line numbers; single-click to preview below the search results, double-click or Enter to open and verify the native Markdown or other source code's start and end selection. Verify case sensitivity, whole word, regular expression, include/exclude, ignore rules, only open files, and only source code management changed files. Replace first view the two-column preview, and after preview, if the disk file is modified or the unsaved document is retained, the execution should be rejected; removing results only affects the current search.
- After selecting text, Ctrl/Cmd + left-click, confirm that the text enters the same search panel; prepare only one and multiple hit files, both list results first without automatically opening. Single-click the file or fragment updates the reading preview below and keeps the central position; double-click the fragment to open the file and precisely select the content, double-click the file to use the current hit or the first one. Check Markdown headers, bold paragraphs, fence line second hit, Alt forward and backward navigation, and source code draft protection; preview supports collapsing, independent scrolling, upper and lower boundaries, sliders, and 50%～150% zoom with Ctrl/Cmd + scroll wheel, with the scale persistence.
- Drag the active bar function icons, check the position saving and selected color; after collapsing the side bar, there are no error highlights. When the system reduces dynamic effects, check the transition closing, and settings and bottom terminal do not participate in sorting.
- Move the main side bar document to 170 CSS px, then continue dragging to the requested width below 85px, confirm that it automatically collapses and the active bar remains; click the icon to restore the original effective width. Check the drag back to the right, window scaling, Home/End, direction keys, and Enter for collapsing and expanding. Files, search, outline, and Git share this behavior, and the preview is located inside the search.
- Reduce the window size, increase the zoom, and input multi-line commit messages, confirm that the commit graph title is still fully visible after collapsing; the file tree and search results are not covered by the bottom tool bar of the native side bar, and the document status bar is retained.
- Switch tabs and editing groups, confirm that line numbers, encoding, line breaks, and language always belong to the current active source code, only hanging on the global bottom bar; within split view, it no longer occupies another row of status bars. Git Diff follows the last focused side to display read-only line numbers, language, and line breaks; when switching to native Markdown, commit graph, or terminal, it does not leave residual background source code status.
- View the search layout with top and bottom sections, confirm that only the search title is displayed at the top, the query box is fully visible; the preview title and expand/collapse buttons are located on the left of the lower partition, the percentage slider is directly on the right, and dragging and Ctrl/Cmd + scroll synchronize updates. The narrow sidebar can still adjust the slider, and the title and controls do not overlap with the top search toolbar.
- View the sidebar commit history, confirm 22px line height, 11px track spacing, and local graph width calculated based on the current line, no additional arrow column before commit, and after expansion, directly display files with icons and status, references are shown as colored rounded tags.
- Adjust the bottom bar Markdown single-side margin from 0% → 12% → 24% → 0%, check the proportion persistence, current paragraph and draft retention, word count and thumbnail not overlapping; source code, differences and search preview width do not change. This restores only the original margin control, not the entire appearance settings page.
- Open C/C++ files and header files, check clangd symbol classification colors, precise location on click and memory modification updates; after changing the parsing configuration, only refresh the current outline, failure does not overwrite old settings. Markdown checks for in-screen new titles and micro-scrolling boundaries, the directory should not back and forth or wait for the title to scroll out of the top edge.
- Hover over Chinese paths or title links for 1 second, confirm the target is readable and selectable or copyable of the original link; when the target is missing, the original text, tags, and unsaved content remain unchanged.
- Switch between the outline and search, confirm that the outermost layer of the outline has no duplicate whitespace, title indentation is still level by level, the native filter box and close button no longer appear, title collapse and jump are normal.
- Open a long difference, check 8px scroll bars on each side and 30px red/green overview, the two columns do not display full-text thumbnails; after clicking red/green markers, both columns synchronize positioning. Open a regular single-file to confirm that thumbnails are retained. Switch between light/dark themes, existing terminals should update background, text, cursor and ANSI color schemes, Shell and output remain unchanged.
- Adjust the difference editing group up and down by 900 CSS px, confirm automatic line-in / left-right switch, reading position remains, manual selection and automatic narrow screen options are separate; icons and tags are in the same line, below only one line of version information. More menus can be opened via F7 to view the accessibility difference viewer; after splitting into a new group, the tag name, version and file icon should remain readable.
- View the commit line to see all changes, read the selected historical version through the historical file line or the diff upper-right button. Markdown should render the historical document content, links and images read from the same commit; current workspace document content, draft and Git index remain unchanged. Long file names cannot override the operations of the icon when hovering, selecting or keyboard focusing.
- Check the tag same-window sorting in normal, maximized and full-screen windows respectively, drag to the existing window tag bar to merge, and drag out of the actual window to create a new window; cancel the source retention, successfully move the last file only to close the function-created empty attached window. Check unsaved source code and the back-and-forth of auto-save Markdown, disk is not saved due to transfer; detailed restrictions see [drag and multi-window](docs/drag_and_windows.en.md).

<a id="section_6c5e816156d3"></a>
## 7.3_Typora Upgrade Boundary

Check the entry after host upgrade, reinstallation and prohibition of cross-host restoration of old startup files, unified see [Check and Update](docs/installation.en.md#section_8257844c2dfc). This project will not prevent Typora official updates.

<a id="section_09063757421c"></a>
# Chapter 8_Single-Window Multi-Document Workspace

Default use the single-window, multi-file tab layout of VS Code. When opening other Markdown or source code, the file remains in the current window's tab bar; when needing to display simultaneously, split to the right or down. Each group can independently choose the displayed documents, and adjust the width and height through the divider, without needing to open a new desktop window for each note.

`Ctrl + \` opens the current document to the right group; first press `Ctrl + K`, then press `Ctrl + \` to open to the lower group. The right-click menu of the tag can also split the view, dragging the tag can adjust the order or move it to another group. `Alt + ←` / `Alt + →` are used for reading history, the "open file" and "jump to anchor" in cross-file links are merged into one jump.

Links with titles synchronize the cursor, document content, and table of contents in the target pane, while the source pane retains the reading position. Opening a document normally continues from the last reading position, including after closing the window; installing or reinstalling an extension preserves existing records. The priority of saved positions and titles is described in [Reading Position and Title Synchronization](enhancements/README.en.md#section_6d0ba836f995).

Right-click menus for file tabs and the sidebar file tree provide copy of relative and absolute paths; relative paths are based on the root directory of the currently open folder. Operation entry points and keyboard shortcuts are described in [Copy File Path](enhancements/README.en.md#section_7ad66f204c8f).

The file tree displays all files and hidden directories, with directories loaded on demand; normal source code uses a single-column Monaco to fill the editing group, supporting editing, Ctrl+S save, and Ctrl+F search. The only global status bar at the bottom displays the line and column numbers, language, encoding, and unsaved status of the active source code, following the tab and editing group changes, with no additional status bar in split views; before closing a draft, it provides options to save, not save, or cancel. Markdown normal opening and search double-click both use native rendering. Special file names, composite suffixes, save conflicts, and encoding boundaries are described in [All Files and Language Recognition](enhancements/README.en.md#section_d88276d4d4d4). Search sidebar uses a compact toolbar, displaying file paths, Git status, and highlighting, with hover to show line and column numbers, single-click preview, and double-click to precisely select native Markdown or other source code; range and replace are described in [Workspace Search and Replace](enhancements/README.en.md#section_e7266e1e8041).

After selecting text, Ctrl/Command + left mouse click enters the same search panel; regardless of the number of hits, results are listed first, with single-click preview in the readonly reading area below, and double-click or Enter to open and select content in the editing area. Markdown displays topic titles, lists, tables, and fences with highlighting, while other languages display source code; Mermaid uses a local library in an independent iframe with Typora's accompanying local library, without changing the central chart configuration. Preview can be collapsed or expanded, defaulting to 80% of the normal text size, adjustable via a slider from 50% to 150% or Ctrl/Command + scroll wheel, and saved without changing the central document. The maximum size of the side preview is 2 MiB, and the document HTML is purified, not executing document scripts or loading media. It searches for text occurrences, not bearing the definition parsing of the language server; complete operations are described in [Jump Preview of Selected Text](enhancements/README.en.md#section_17ddcbc9e185).

The Git icon in the left activity bar is default positioned after files and outline, opening the Chinese **Source Code Management** in the original main sidebar, with the central document preserved. Clicking the same function again collapses it, while other functions directly switch, and the bottom no longer repeats the sidebar toggle. Function icons can be dragged to sort, with selected borders, backgrounds, and foregrounds following the actual panel, and animations can be turned off to reduce dynamic effects, as described in [Activity Bar and Sidebar Layout](enhancements/README.en.md#section_cfd112ecd0d5). Files are only divided into two groups: **Staged Changes/Changes**, with new files directly staged or added to `.gitignore`. Enter in message boxes to new line, `Ctrl + Enter` and the commit button both submit staged content. The top view menu controls the visibility of the repository, changes, and commit. The bottom left status bar provides branch, sync, and commit icons. After synchronization confirmation, it pulls first and then pushes; abandoning changes first shows the precise file list, and untracked files are default moved to the trash by default.

Main sidebar lower half directly displays **commit graph**, using 11px track spacing, 22px line height and line-by-line local graph width, with iconified file rows and colored rounded references remain compact; clicking commit directly expands files, without occupying an arrow column or file count row. Upper and lower partitions can be dragged to adjust, and when collapsed, the title is still visible. Complete commit graph, file timeline and Monaco left-right differences are opened in the original editing tab bar, supporting source code highlighting, line alignment, inline changes, search and change navigation; the two difference columns retain their own 8px scrollbars and synchronize vertically, 30px native red-green overview can be clicked to locate, and full-text thumbnail is closed. Regular single-file source code and Markdown reading continue to provide thumbnails. Branches, stash, merge, rebase, remote sync and review continue to operate through these entry points. Complete collection and corresponding entry points see [Git Graph Feature Comparison](enhancements/git_graph_features.en.md#section_403c9cb60b4c). Operation and query boundaries see [Git Graph Commit Relationship Diagram](enhancements/README.en.md#section_008d61f87c20).

Outline removes the outer 18px whitespace, retains hierarchical indentation, folding and title jumping, and cleans up the native filtering status; the outline no longer displays 'search' and close buttons, and the search panel will not overlay this native control.

Markdown uses a single active Typora native editor, with the rest of the split views showing preview; clicking the preview content will swap the editor's location split view. Regular source code tags use independent editable buffer and format selection, switching, cross-group dragging and right-click split view movement retain drafts, and confirm disk content before saving; background tags closing and window closing both handle unsaved changes, native Markdown closes without saving still continue to protect source code. The source code tag of this Markdown has not been saved yet, process drafts first before opening rendering; precise jumping will verify disk, current memory and final selection, and retain existing tags and reading history. Git history, differences and search side preview are read-only. C/C++ code outline uses native clangd, range see [Code Outline and Parsing Environment](docs/source_outline.en.md); this does not provide VS Code extension host or complete language service functions, switching Markdown still follows Typora's save confirmation. Complete operations and history boundaries see [Tags, Split Views and Reading History](enhancements/README.en.md#section_ee8a20499140).


<a id="section_e9cb72e234a9"></a>
# Chapter 9\_Repository Terminal and Adjustable Panel

Git Graph toolbar, file tree right-click and left terminal icons can all open the integrated terminal of the repository root directory. By default, it uses the lower editing group, which can also choose the current group tag, right or lower split view; switching tags retains the running session. Ctrl + ` focuses or opens the terminal;Ctrl + Shift + ` creates a new session, Ctrl + Shift + C / V / F copies, pastes or searches. Right-click also provides **Open Repository Terminal as Administrator (UAC)**, which raises the same directory in an independent PowerShell window. Complete operations see [Integrated Terminal, Administrator Entry and Boundary](enhancements/README.en.md#section_a2a465c0b8fd).

The boundary between the original main sidebar, commit list and details, Monaco history dual panes, and editing group supports mouse dragging; right-click header switches column display, layout button selects details position. The end of the right-click menu for various Git objects provides item check and restore entry, settings are saved per repository.

Main sidebar document content can be collapsed to 170 CSS px, continue dragging to request width below 85px automatically collapse, keep the activity bar; click the function icon again to restore the original effective width. The maximum width is always reserved for the central editing area, window scaling does not rewrite preferences; Files, search, outline and Git use this layout uniformly, preview is the internal area of search. Keyboard adjustments and full rules see [Activity bar and sidebar layout](enhancements/README.en.md#section_cfd112ecd0d5).

Currently using 35px single-line top bar: on the left are seven categories of menus: Typora Files, Edit, Paragraphs, Formats, View, Theme, Help; in the middle are Back, Forward and File Search; on the right reuse the host window buttons. The menu is organized by local renderer, only calls verified Typora API, does not use the entire `Menu.popup` or modify ASAR; capabilities and dynamic states are bounded by actual wiring, do not claim equivalence with complete native menu. The menu rolls down below the top bar according to available height, supports Shift + scroll wheel. After saving the document and normal restart, load the window mode, installation does not force close existing windows.

Files and folders in the Explorer can be modified names by F2, right-click **Rename**. Input box confirms by Enter, cancels by Esc; the path of opened tags and drafts is updated with the new name, search list and reading history also update synchronously. Name conflicts will prompt, do not treat file name input as directory move command.

Terminal background, foreground, cursor, selection and ANSI color schemes update with Typora's actual theme, switching between light and dark themes does not require restarting the session, existing output is preserved. The bottom space for files, search and source code management is used by each panel, the native file tree toolbar does not cover the results, the status bar for document content is retained.

On Windows, the first installation downloads and verifies the private Node `24.20.0` runtime, no requirement to pre-install Node, does not write system PATH, does not fix the local installation path. Ordinary graph queries continue to use Typora runtime, integrated terminal runs node-pty through an independent background process. Installation, check and rollback cover the runtime file; download cache, platform scope and native verification methods see [Terminal runtime file, installation and verification](enhancements/README.en.md#section_d61410d97cc0).

File name search displays candidates according to scan progress, content search uses bounded pre-read and Worker matching, sidebar displays results in batches; retain ignore rules, click below preview and verify replacement before, no need to configure additional searchers. Performance baseline and resource limits see [Large directory search performance and verification](docs/search_performance.en.md).

Tags and activity bar left-click drag uses unified drag threshold, follows preview and drop point; real files can be dragged out of the editing group to request a new Typora window. Cross-window first verify disk and memory snapshot, receive recovery confirmation before verifying the source; unsaved native Markdown is limited by automatic save and safe retention, does not migrate complete undo history to new process. Specific operations and cancellation boundaries see [Left-click drag and independent window](docs/drag_and_windows.en.md).

Code outline processes by file type: C/C++ and header files only use native clangd, through LSP read current memory document content and engineering compilation parameters, click symbol to locate; JavaScript, TypeScript, Python, CMake, YAML use offline Tree-sitter with package, Markdown uses native title directory. clangd path, project relative compilation database directory and line-by-line backup parameters are provided by [Parsing environment settings](docs/source_outline.en.md#section_1df7a9625a19), save failure retains original configuration, does not write user project; does not use GCC directly as language server.
