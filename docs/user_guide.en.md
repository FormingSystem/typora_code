# Typora Code user guide and shortcuts

English | [Simplified Chinese](user_guide.md)

This guide is designed for offline reading. Use **Help → Onboarding** to replay the tutorial and **Help → User Guide and Shortcuts** to open the installed guide. Save your documents and restart Typora normally after installation. The English menu names in this guide describe their intended localized labels; the current interface migration is not yet complete.

## 1. Open a project, then read files

Choose **File → Open Folder**. The Explorer lists project files; the activity bar switches between files, search, outline, Git, extensions, and remote tools. `Alt+B` shows or hides the sidebar. `Ctrl+B` remains Typora's Markdown bold command.

File and folder context menus provide creation, renaming, path copying, and reveal-in-file-manager actions. **Open Project in VS Code** uses the detected VS Code installation: folders are revealed inside the full project and files open in that project. Selecting a subfolder does not make it a new project root. If VS Code cannot be found, install it and retry.

Connect to SSH through the remote entry. Files, search, and terminals use the workspace's connection identity. Check the host and project before operating. Read the actual error on failure; a remote path is not a local file path.

## 2. Preview and compare documents

Click an Explorer file to show it in a replaceable preview tab. Clicking another file replaces the unedited preview. **Alt+click** keeps the target open, and editing a preview also makes it persistent. Disabling preview editors changes this behavior according to the saved setting.

Keep documents open before splitting them for repeated comparison. `Alt+Backslash` splits right; `Alt+K`, then `Alt+Backslash`, splits down. Tab context menus offer keep-open, pin, close, and editor-group actions. A persistent tab cannot be replaced by the next preview; pinning additionally changes its tab-management behavior.

File switching preserves reading positions. Top-bar Back/Forward and `Alt+Left/Right` navigate editor history. The independent link preview has its own browsing history.

## 3. Markdown, code, and diagrams

The document body remains Typora's native Markdown editor. Use its paragraph, format, import, export, and print commands. The workbench does not introduce another document format. Ordinary left-click edits link text; use the corresponding preview/navigation entry to follow links without confusing editing with navigation.

The copy button above a code block copies its code. Long blocks can be expanded or collapsed; folding changes display height without deleting content. Language tags control highlighting, and visual wrapping does not add logical source lines. Typora still renders Mermaid; its dedicated viewer allows enlargement and panning.

### Content font size and interface scale

| Action | Effect |
| --- | --- |
| Ctrl+wheel over an editor | Adjusts content font size while keeping controls unchanged and preserving the reading position where possible |
| Ctrl+= / Ctrl+- | Scales the workbench interface while compensating the visual font size of current documents and open terminals |
| Open a document or terminal in the same window | Inherits that window's corresponding content font size |
| Restart Typora | Restores the saved base configuration and initializes a new window font-size session |

Terminals own their font and wheel handling. Workbench zoom, system DPI, and content font size are distinct settings. On a narrow screen, hide the sidebar or terminal before increasing the document font size.

## 4. Search and link previews

Click the top search box to see file, command, text-search, outline, and recent-item entries together with recent project files. Type a filename to search; clear the input to return to that landing view. `Ctrl+P` directly searches project files.

Filename/path fuzzy matching is the default, with both mode buttons off. Enable `.*` for a regular expression such as `\.c$`, or the wildcard filter for patterns such as `*.c`, `**/*.h`, `file?.md`, and `*.{c,h}`. Regular expressions and wildcards are mutually exclusive; disabling both restores fuzzy matching. The mode is retained within the current window.

`Ctrl+Shift+F` searches workspace content with include/exclude controls. Open files participate using their current contents, including files inside Git-ignored directories. To include unopened ignored files, disable the ignore toggle beside the exclude input. **Click a result to preview it in the sidebar; double-click to open the file.**

Link previews provide independent back/forward navigation, pinning, and closing. Website embedding depends on site policy and connectivity; use the default browser when needed.

Most users do not need an enterprise certificate. For corporate networks, configure the HTTP/HTTPS proxies and enterprise CA under **Settings → Network**. A client private key is not an enterprise CA certificate. Diagnose failures from their actual connection errors.

## 5. Git changes and commit history

Source Control distinguishes unstaged and staged changes. Select a changed file to inspect its diff; expand a historical commit to compare its files. Markdown comparisons can switch between source and rendered views. The source-location action on the editor's right returns to the corresponding commit and file.

The active selected row and a commit's expanded state are separate. Graph edges and local/remote differences help identify history. Check the project, branch, remote, and prompt before committing, fetching, pulling, or pushing. The tutorial does not perform these actions. Pay attention to the exact scope of destructive confirmations such as discarding file changes.

## 6. Terminals

Use **Terminal → New Terminal** or `Alt+Shift+Backtick`. You can choose a shell, create sessions, split, and manage terminals. Commands execute in that session's current directory and shell. PowerShell and Bash have different syntax; a Bash `test` command is not automatically a PowerShell command.

Running tasks belong to the terminal session. Check for unfinished commands before closing it. Terminal and editor fonts are configured separately; new sessions inherit the corresponding window font size.

## 7. Settings, themes, and colors

The lower-left gear or `Ctrl+,` opens the single settings window. Search or browse editor, terminal, Git, network, and other categories. Native preferences and community plugin settings keep their original storage and owners.

`VSCode2026_Light` and `VSCode2026_Dark` use the corresponding VS Code 2026 colors while retaining Consolas and the existing typography; the dark theme retains earthy heading colors. `CppGithubConsoles_Light`, `CppGithubConsoles_Dark`, and `Night` remain available for comparison.

Custom Colors supports viewing, entering, copying, previewing, and resetting colors, plus JSON import/export. Save a combination as a theme to compare it through the theme menu. The preview template demonstrates the regions each color affects.

## 8. Default shortcuts

Native preferences and other extensions may affect actual bindings. A chord such as `Alt+K`, then `Alt+O`, means press and release the first combination before pressing the second.

| Shortcut or gesture | Action |
| --- | --- |
| Ctrl+B / Ctrl+I | Native Typora bold / italic |
| Ctrl+K | Native Typora hyperlink editing |
| Alt+B | Toggle the workbench sidebar |
| Ctrl+P | Quick-open a project file |
| Ctrl+Shift+P | Command palette |
| Ctrl+Shift+E | Focus Explorer |
| Ctrl+Shift+F | Workspace search |
| Ctrl+Shift+X | Extensions |
| Ctrl+, | Settings |
| Alt+Left / Alt+Right | Editor Back / Forward |
| Alt+click an Explorer file | Open persistently |
| Alt+Backslash | Split right |
| Alt+K, then Alt+Backslash | Split down |
| Alt+K, then Enter | Keep the current tab open |
| Alt+K, then Alt+O | Open a folder |
| Alt+K, then Alt+S | Save all |
| Alt+Shift+Backtick | New terminal |
| Ctrl+wheel over an editor | Adjust content font size |
| Ctrl+= / Ctrl+- | Scale the workbench interface |
| Esc during onboarding | Exit and restore focus |

Only conflicting workbench bindings moved from Ctrl to Alt. `Ctrl+B` still means bold, and interface scaling still uses `Ctrl+= / -`.

## 9. After installation and when reporting problems

The next launch after each successful installation offers onboarding once. Skipping it prevents repetition on ordinary restarts; Help always allows replay. Multiple windows share the automatic prompt. Installation does not close edited documents. Files installed on disk are loaded only after a normal restart.

Use Help to check for Typora Code updates or open its repository. Typora's native Quick Start, Markdown Reference, licensing, and update entries remain available. Report reproduction steps, the running version, theme, and error message. Do not include passwords or tokens.
