# Typora Code

English | [Simplified Chinese](README.zh-CN.md)

Typora Code adds a project workbench to Typora: document tabs, split views, source editing, workspace search, Git review, and integrated terminals in the same window as the native Markdown editor.

This is an independently maintained community project. It is not an official Typora or Visual Studio Code product. Install and license Typora separately. The workbench takes design inspiration from Visual Studio Code; it does not provide a VS Code extension host.

## Features

| Area | Available behavior |
| --- | --- |
| Documents | Tabs, split views, reading positions, shared back/forward navigation, and per-workspace session restoration |
| Explorer | Files, open editors, and a timeline; single-click previews a file, Alt+click keeps it open, and editing promotes a preview to a persistent tab |
| Source editing | Monaco editing, encoding and line endings, language services, symbol outlines, and source navigation; external language servers are configured separately |
| Search | Filename/path search and workspace content search; click a result to preview it, double-click or press Enter to open it |
| Markdown | Native Typora editing, heading outlines, a minimap, code copying and folding, and image/Mermaid viewers |
| Link previews | Independent reading history, pinning, resizing, zoom, and read-only split previews; local content follows the active theme |
| Git | Changes, staging, commits, branch history, a commit graph, file history, and source/rendered Markdown comparisons |
| Terminals | Windows shells, multiple sessions, split terminals, search, and terminal settings |
| SSH | One local workspace or one SSH connection per window, shared by files, search, Git, and the default terminal |
| Settings and extensions | Searchable settings, native preferences, and supported community plugins with their original settings owners |
| Updates | ZIP updates with installation checks and backups; install immediately, then restart manually |

Markdown splits share one active native Typora editor; the other splits provide previews. Source tabs can be edited and saved independently. C/C++ analysis requires a local clangd installation. Third-party plugins, external commands, and language servers retain their own capabilities and limitations.

## Install on Windows

1. Install [Typora](https://typora.io/) and check that it opens documents normally.
2. Download the complete repository using **Code → Download ZIP**, then extract it. Keep the included `enhancements/dist/` directory. Normal installation does not require a source build or a system Node.js installation.
3. Save your documents and run `install_windows.cmd`. The first installation downloads and verifies a pinned private Node runtime. Keep the reported backup location.
4. Run the read-only check below. After `status: OK`, restart Typora normally to load the installed files.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\check_windows.ps1
```

The installer requests Windows elevation only when the actual target requires it. Cancelling elevation keeps the previous installation. Installation does not close your windows or hot-replace an already running workbench.

To uninstall on Windows, save your documents, exit Typora, and run `uninstall_windows.cmd`. The public uninstaller restores a compatible pre-installation backup, or removes the loading entry when no compatible backup exists. It preserves documents, settings, themes, and plugin caches. Use `uninstall_windows.ps1 -check_only` for a read-only preview. Use `restore_windows.ps1` for a version rollback.

See the [installation guide](docs/installation.en.md) for offline preparation, write locations, updates, recovery, and other platforms. Windows x64 is the primary validated environment. Windows ARM64, MSYS2 UCRT64, and Linux have outstanding native acceptance work; Linux currently has no bundled integrated terminal runtime. macOS and Windows 32-bit are outside the current installer scope.

## Using the workbench

Start with the [user guide and shortcuts](docs/user_guide.en.md). The Help menu also provides the installed offline guide and the onboarding tutorial. The installed guide's language and full workbench localization are being prepared; this documentation entry does not claim that all current UI text is already translated.

Use **File → Open Folder** to select a project. Use the lower-left gear or `Ctrl+,` for settings. `Ctrl+P` finds files, `Ctrl+Shift+F` searches content, `Alt+B` toggles the sidebar, and `Alt+Left/Right` navigates editor history. Typora's Markdown shortcuts remain available, including `Ctrl+B` for bold.

The authoritative version and release notes are in [release.json](enhancements/release.json). An installed version takes effect after all Typora windows are restarted. Unpublished local candidates are not available from GitHub.

## Development

```powershell
cd enhancements
npm ci
npm run build
npm run check
npm run check:ui
```

Use this repository as the project root. Implementation lives in `enhancements/src/`; matching prebuilt assets live in `enhancements/dist/`. Build outputs include source and license provenance. Targeted UI tests use the existing runner, for example `npm run check:ui -- test_workspace_titlebar.cjs`.

Read the [contributor guide](docs/contributing.en.md) before changing behavior. Design records and historical acceptance evidence currently remain in Chinese; their English migration is tracked separately. A passing hidden-window test is not a substitute for native Typora acceptance or another platform's validation.

## License and attribution

Original project code, UI, documentation, themes, and installation scripts are released under **GPL-2.0-only**, except where otherwise noted; see [LICENSE](LICENSE). Third-party components retain their respective licenses and notices in `enhancements/vendor/` and `enhancements/dist/licenses/`.

Maintainer: **FormingSystem** · Contact: `lizhaojun97@qq.com` · [Project repository](https://github.com/FormingSystem/typora_code).

See the [copyright and contribution statement](COPYRIGHT.en.md). Your documents and other user files retain their own ownership and licenses.
