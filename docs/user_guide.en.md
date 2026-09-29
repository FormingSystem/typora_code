[Chinese](user_guide.md)

<a id="section_1a61be8eab61"></a>
# Typora Code Operation Guide and Shortcuts


This document comes with Typora Code installation and can be read offline. To review the step-by-step tutorial, go to **Help → Operation Guide**; to open this document, go to **Help → Operation Guide and Shortcuts**. After installation, please save the document first, then normally restart Typora to load the new features.

Open Settings from the lower-left gear or Ctrl+, then choose Follow Typora, Simplified Chinese, or English under Display Language. After saving the preference, save your documents and close and restart all Typora windows normally. The current window will not forcibly refresh, close documents, or terminate terminals. Native preferences and third-party plugins retain their own language settings. Offline help opens in the loaded workbench language.

<a id="section_515440f601d8"></a>
## 1. Open the project first, then read the files

Select the project from **File → Open Folder**. The files are listed on the left in the Explorer; the activity bar switches between files, search, outline, Git, extensions, and remote entry. Alt+B shows or hides the sidebar to make space for the document content; Ctrl+B is still used for Markdown bold formatting.

Right-clicking on a file or directory allows you to create new items, rename, copy the path, locate the system Explorer, etc. **Open project with VSCode** uses the system-detected VS Code: directories are located within the complete project, and files are opened within the project, without changing the selected subdirectory into a new project root directory. If VS Code is not found, install it as prompted and retry.

SSH remote connects from the remote entry. The workspace files, search, and terminal use the corresponding connection identity; verify the current host and project before operating. When failure occurs, check the original prompt and do not treat remote paths as local files.

<a id="section_1e86e179792a"></a>
## 2. Preview and multi-document comparison

Clicking a file in the Explorer displays its content immediately using a replaceable preview tab. Clicking another file will replace the unedited preview, avoiding continuous accumulation of tabs. **Alt+Left Click** pins the target file; the preview that starts editing will automatically remain open. After closing the preview function, follow the corresponding settings.

To repeatedly compare several documents, first pin them, then select split view from the tab's right-click menu. Alt+Backslash splits to the right; first press Alt+K, then press Alt+Backslash to split downward. Right-clicking the tab allows you to keep it open, pin it, close it, and manage the editing group. Pinning and pinning are different: pinning means it will not be replaced by the next preview, and pinning also has independent tab management behavior.

File switching retains individual reading positions. The top back/forward and Alt+left/right arrow keys return to the editor navigation history; the sidebar link preview has an independent browsing history.

<a id="section_fb29da7fc01e"></a>
## 3. Markdown, code, and charts

The document content is still the native Markdown editor of Typora. Paragraphs, formatting, importing, exporting, printing, etc., are used from the corresponding native menus; do not treat the workbench as another set of document formats. Use the ordinary left click to edit link text, avoiding accidental jumps when editing links; link reading and preview are used from the corresponding preview entry.

The copy button above the code block copies the code. Long code can be expanded/collapsed; folding only changes the display height, not the content. The language tag determines the highlighting, and the logical line numbers in the source code do not increase due to display line breaks. Mermaid is still rendered by Typora, and the independent viewing entry for charts can be used to zoom in and drag for viewing.

<a id="section_78a56b60b46d"></a>
### Content font size and interface size

| Action | Function |
| --- | --- |
| Ctrl+scroll wheel with mouse in the editing area | Only changes the content font size, keeping the control size unchanged; tries to retain the current reading position |
| Ctrl+= / Ctrl+- | Zoom in/out the workbench interface; the current document and already opened terminal maintain visual font size |
| New document/terminal in this window | Inherits the font size of the corresponding content area in this window |
| Restart Typora | Restores editor/terminal fonts, interface zoom and terminal panel visibility, maximization and dimensions |
| Settings → Appearance → Restore appearance defaults | Restores 100% interface zoom, base content fonts and default terminal fonts/geometry, then hides the panel without terminating running Shells |

Closing the application ends the old Shell process. Reopening a previously visible panel starts a fresh default Shell without replaying commands.

The terminal has its own font and scroll handling; do not mix workbench scaling, system DPI, and text font size into the same setting. For narrow screen reading, hide the sidebar or terminal, then enlarge the document content separately.

<a id="section_48d9c10d6d19"></a>
## 4. Search and link preview

Clicking the search box in the top bar first displays entries to go to files, commands, text search, outline, and recently opened files, as well as the most recent files in the current project. Simply typing a file name will search; clearing returns to the home page. Press Ctrl+P to directly search for project files. By default, it uses fuzzy matching for VS Code file names/path, with both mode buttons closed; manually clicking `.*` enables regular expressions (e.g., `\.c$`), and clicking the funnel 'Use wildcards' allows filtering by file type, such as `*.c`, `**/*.h`, `file?.md`, `*.{c,h}`. Regular expressions and wildcards are mutually exclusive; when both are closed, fuzzy matching is used. The mode is retained within the current window. Press Ctrl+Shift+F to search the workspace content, and set include/exclude ranges. Opened files participate in the search and prioritize using the current content, even if located in a Git ignored directory; unopened ignored files are only included if the ignore switch on the right of the exclude box is turned off. **Clicking a search result first previews it in the sidebar, and double-clicking opens the file.** Link previews can be independently navigated back, forward, pinned, or closed; whether a webpage is embedded depends on the site policy and network, and use the default browser if necessary.

Ordinary internet users do not need to configure enterprise certificates. In company proxy scenarios, fill in HTTP, HTTPS proxy, and enterprise CA in 'Settings → Network' as needed. Do not treat the client private key file as an enterprise CA; error messages should be handled based on the actual connection reason.

<a id="section_3e8c5d08c69a"></a>
## 5. Git changes and commit graph

Source code management distinguishes between unstaged and staged changes. Select a changed file to view the differences; select a historical commit to expand the file list and compare versions. Markdown differences can be switched between source code and rendered views. The source location icon on the right side of the editor returns to the corresponding commit and file of the comparison.

When a file is selected, use a single active selected line. Submit expansion and selection represent different states. The branch lines and local/remote differences in the commit graph help identify the source. Before executing commits, fetch, pull, or push, verify the project, branch, remote, and actual prompts; tutorials do not automatically execute these actions. Destructive operations such as discarding file changes require special attention to the confirmation scope.

<a id="section_d77bdf592bce"></a>
## 6. Terminal

'Terminal → New Terminal' or Alt+Shift+` opens the terminal; you can switch Shell, create a new session, split, and manage terminals. Commands are executed in the current directory and Shell of the terminal. PowerShell and Bash have different syntax, for example, `test` in Bash cannot be directly used as a PowerShell command.

Running tasks belong to the terminal session. Before closing, check if there are still unfinished commands. Terminal font and editor area are set separately; new sessions in the same window inherit the corresponding font size.

<a id="section_49de2e361c5a"></a>
## 7. Settings, themes, and color schemes

Open the only settings window with the gear in the lower left or Ctrl+,. You can search for configurations, adjust by category such as editor, terminal, Git, network, etc.; native preferences and community plugin settings retain their respective configuration owners.

The theme menu adds VSCode2026_Light / VSCode2026_Dark, which use the VS Code 2026 Light / Dark colors, retain the Consolas font and original layout, and the Dark title retains the earthy color. The original CppGithubConsoles_Light / CppGithubConsoles_Dark and Night are still available for selection and comparison. Custom color support allows viewing color values, inputting/copying values, instant preview, restoring defaults, and importing/exporting JSON. You can save the combination as a theme and switch and compare it in the theme menu. Preview templates are used to understand the color correspondence areas.

<a id="section_9f4a16ecbd0c"></a>
## 8. Common shortcuts (default configuration)

The following are the current default entries for this tool; native preferences or other extensions' custom bindings may affect the actual response. Combinations such as Alt+K, Alt+O mean pressing the first group first, then releasing and pressing the second group.

| Shortcuts/gestures | Function |
| --- | --- |
| Ctrl+B / Ctrl+I | Typora native bold / italic |
| Ctrl+K | Typora native hyperlink editing |
| Alt+B | Workbench sidebar show/hide (no longer using Ctrl+B) |
| Ctrl+P | Quickly open project file |
| Ctrl+Shift+P | Command palette |
| Ctrl+Shift+E | Focus Explorer |
| Ctrl+Shift+F | Workspace search |
| Ctrl+Shift+X | Extensions |
| Ctrl+, | Unified settings |
| Alt+← / Alt+→ | Editor read back / forward |
| Alt+left-click resource file | Persistent open file |
| Alt+backslash | Split right |
| Alt+K, then Alt+backslash | Split down |
| Alt+K, then Enter | Keep current tab open |
| Alt+K, then Alt+O | Open folder |
| Alt+K, then Alt+S | Save all |
| Alt+Shift+backtick | New terminal |
| Ctrl+scroll wheel (editor area) | Content font size |
| Ctrl+= / Ctrl+- | Workbench interface zoom |
| Esc (operation guide) | Exit tutorial, restore original focus |

Some bindings that conflict with the native Typora editor have been moved to Alt, **not all Ctrl keys are changed to Alt**. For example, Ctrl+B remains for bold, and interface zoom still uses Ctrl+= / - as agreed.

<a id="section_320875142763"></a>
## 9. After installation and when encountering issues

After each successful installation, the operation guide will be prompted once on the next startup; skipping it will prevent it from popping up again on regular restarts. The help menu can always be accessed again. Multiple windows will only show the prompt once. Installation does not forcibly close documents currently being edited; having the disk installed does not mean the current window has been loaded. A normal restart after saving will suffice.

Check for updates and view this tool's repository through the help menu. The native help's Quick Start, Markdown Reference, license, and check for updates are still retained. When reporting issues, provide reproduction steps, current version, theme used, and error messages; do not include passwords or tokens.
