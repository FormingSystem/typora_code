[Chinese](language_environment_plugins.md)

# R085 Language environment plugins (2026-10-04)

## Scope and operation

Nine TyporaCode-owned language supports cover C/C++, C#, CMake, Makefile, Bash, Java, HTML, CSS and JavaScript/TypeScript. An independent service owns registration, settings and downloads. R085.2 supersedes the original community Plugin/SettingTab implementation; third-party community plugins keep a separate entry.

1. Open Extensions and select Install in Available. This enables the language and automatically prepares missing private tools; no separate download click or LSP path is required. Existing tools are reused.
2. Analysis and the first F12 wait for readiness. Progress and retryable failures appear in the list and settings.
3. The gear menu provides settings, enable/disable, retry and uninstall. Choose a private tools directory or optionally configure external commands and arguments; explicit profiles take priority.
4. Clear or cancel preserves an opt-out until automatic use is selected again. Clear an existing environment before changing its location. Uninstall removes only owned files and registration, preserving external tools and user configuration.
5. Existing legacy language entries migrate installation state, location and use choice on first startup. No community trust/enable step is required for first-party language support.

Managed Windows x64 recipes supply private Node, Python, JDK or .NET without global runtimes. Full project SDKs/build/debug workflows remain separate; semantic results depend on server capabilities and project context. Archives are verified and failed/cancelled staging is removed; no system PATH changes occur.

## Recipes and verified capabilities

| Plugin | Pinned service | Private runtime | Verified sample |
| --- | --- | --- | --- |
| C/C++ | clangd 23.1.0 | Native | Symbols, semantic tokens, unsaved updates |
| CMake | neocmakelsp 0.11.2 | Native | Symbols, unsaved updates, dynamic watch registration |
| Makefile | autotools-language-server 0.0.23 + lsp-tree-sitter 0.1.0 | Python 3.13.7 embedded, pip 26.2.1 | Variable definitions and unsaved location shifts; no document symbols |
| Bash | bash-language-server 5.8.1 | Node 24.20.0 | Function symbols and unsaved updates |
| JavaScript/TypeScript | typescript-language-server 6.0.1, TypeScript 6.0.3 | Node 24.20.0 | JavaScript symbols, semantic tokens, unsaved updates |
| HTML | vscode-langservers-extracted 4.10.0 | Node 24.20.0 | Element symbols and in-memory analysis |
| CSS/SCSS/Less | vscode-langservers-extracted 4.10.0 | Node 24.20.0 | CSS symbols and unsaved updates |
| C# | csharp-ls 0.28.0 | .NET SDK 10.0.401 | Symbols, semantic tokens, unsaved updates |
| Java | Eclipse JDT LS 1.55.0 | Temurin JDK 21.0.12.1+1 | Symbols, semantic tokens, unsaved updates |

Project dependencies remain separate. Complete C/C++ analysis requires appropriate headers/SDKs and compilation flags. Existing outline settings retain the compilation database, fallback flags and explicit clangd path. ShellCheck, CMake project configuration tools and dependency restoration depend on upstream capabilities; this delivery does not install every build tool or claim all VS Code language features. TypeScript and SCSS/Less are registered, but the real-service samples used the specific languages listed above.

Examples: C/C++ can use project-relative `build` for the compilation database and `-std=c++20` fallback flags; C# can append `--solution` and a solution path after the service DLL; Java can adjust `-Xmx1G`. Initialization options and workspace settings are separate JSON objects with upstream-defined fields. Java `-data` arguments expand `${workspace_hash}` and `${session_id}` to isolate project/window databases.

## Ownership and failure handling

`language_environment_catalog.json` owns versions, official sources, hashes and recipes. `language_environment_service.cjs` owns `installed.json`, the cross-window environment lock, download/extraction, private package management and removal. Random installation directories contain ownership markers. State is published only after archive integrity and executable entry validation. Archives reject traversal, duplicate names and links. Removal rejects unowned or linked directories. Failed/cancelled installations clean their own staging directory; interrupted removals retain retryable state.

Node uses the full portable distribution and its npm. Python uses embedded path isolation and a private package directory; .NET uses a private tool path, CLI home and NuGet cache. Direct archives verify SHA-256 or SHA-512. npm/pip/NuGet resolve dependencies from pinned top-level versions; complete transitive lockfiles and an offline environment cache are not supplied yet.

`language_service_settings` remains the sole user/workspace configuration owner. Explicit LSP/disabled profiles and existing clangd paths take precedence. Plugins contribute defaults without rewriting manual profiles. The shared analysis service owns document versions, processes and Java session identities. LSP watchers subscribe to the shared directory service. Environment-state changes notify other windows. Manual profiles copied from managed paths become invalid after those files are cleared; restore inheritance or reconfigure them.

Downloads reuse shared HTTPS proxy/CA settings. npm/pip receive local proxy and CA configuration; .NET package management uses Windows certificate trust. Leaving a settings page does not stop its task; disabling/uninstalling the plugin or disposing its owner cancels the task.

## Sources and acceptance

The pinned VS Code `68070681` sources `src/vscode-dts/vscode.d.ts` (`ExtensionContext.globalStorageUri`) and the TypeScript extension `package.json` (`js/ts.tsdk.path`) establish the reference for extension-owned storage and selectable SDKs. TyporaCode implements those responsibilities through its existing independent language settings and services.

Installation and argument references: [clangd](https://clangd.llvm.org/installation), [neocmakelsp](https://neocmakelsp.github.io/docs/installation.html), [Makefile service](https://github.com/Freed-Wu/autotools-language-server), [Bash](https://github.com/bash-lsp/bash-language-server), [TypeScript](https://github.com/typescript-language-server/typescript-language-server), [HTML/CSS](https://github.com/hrsh7th/vscode-langservers-extracted), [C#](https://github.com/razzmatazz/csharp-language-server), [Java](https://github.com/eclipse-jdtls/eclipse.jdt.ls). Makefile pins an older release because 0.1.3 no longer contains the `make_language_server` entry point.

Initial 2026.10.04.1 verification: the test catalog links transaction, real-download and original-host checks. Real-service tests restrict PATH to Windows System32 and remove external runtime variables, then install, analyze unsaved code and uninstall all nine recipes. One CMake connection reset was recorded and its targeted retry passed. Original Typora 1.14.10 checks cover all nine plugin lifecycles/SettingTabs, actual CMake installation, configuration drafts/cancellation/removal, light/dark themes and focus. Complete projects and other platforms remain outside those results. Current evidence and delivery status are recorded in the feedback review.

## R085.1 Automatic preparation and navigation waiting (2026-10-04)

The reported CMake plugin was enabled with default analysis, but no managed tools existed. Registration previously only read existing installation records and still required a separate download click. This correction supersedes that required manual step: enabling a plugin with its environment selected automatically prepares tools in the configured directory and reuses an existing environment. Cancel, clear or deselect persists the choice not to use it automatically; selecting it again or retrying resumes preparation. Disabling the plugin cancels its task.

The plugin owns downloads and errors. The configuration owner exposes an awaitable preparation entry point shared by outlines and definition navigation, without repeated downloads on edits. Readiness notifications do not cancel the first pending navigation; document changes, switching and disposal still cancel stale requests. Failure retains a useful retryable error rather than requesting a manual LSP path. Explicit external or disabled profiles take priority. The environment lock serializes plugins/windows, with cancellable waiting and reuse checked inside the lock.

No user CMake project is executed to guess variables. Lexical highlighting is separate from semantic analysis. The neocmakelsp VS Code adapter downloads its default server and also accepts a local target. Results depend on that server and project context; other VS Code CMake extensions can use different providers, so arbitrary dynamic Zephyr variables are not claimed equivalent.

Validation adds enable → automatic download → current-document analysis → variable/cross-file definitions, plus configuration precedence, cancellation, failure/retry, concurrency and cleanup. Native isolated Typora and real CMake service checks must start without tools rather than reuse a preinstalled fixture as evidence of automatic preparation.

## R085.2 Independent language support and extension list (2026-10-04)

The latest user direction makes language support a TyporaCode-owned feature, independent of community plugins. This section supersedes the original Plugin/SettingTab architecture and required manual setup steps. An independent service owns language registrations, settings and downloads; shared language configuration and analysis remain the only analysis owners. The existing Extensions activity entry defaults to language support, with a separate entry for the unchanged community domain.

Before community startup, migrate only the nine known legacy IDs, preserving installed/enabled state, directory and use preference. Persist independent records before removing exact old registry entries; retries preserve existing tools and configuration. No legacy entries means no community writes. Migration failure is explicit and never starts duplicate language providers.

The view offers search, collapsible installed/available groups, three-line entries, install actions and a gear menu. Install enables automatic preparation; failure retains a retryable entry. Disable cancels preparation and releases the provider; uninstall removes only owned tools and registration. Independent settings offer directory, automatic use, progress/retry/cancel and the existing advanced profile form.

Geometry comes from fixed VS Code 68070681: extensionsViewlet.css has a 41px search region and 28px input with 12/20px margins; extension.css supplies three-line details and 20px title/description lines; extensionsList.ts uses 72px rows. Narrow/normal icons follow 24/36px geometry, rendered with the existing official Seti file glyphs and Codicons actions. Shared interaction, selection, menus and scrollbars own state colors and focus. Arrow keys, Enter/Space, filtering and background progress preserve selection and focus.

Validate migration, independent enable/disable/uninstall, automatic first F12, configuration precedence, light/dark narrow/wide geometry, long labels and the community entry. This does not implement a VS Code extension host or change unrelated panel layouts.

[Upstream CMake client](https://github.com/neocmakelsp/neocmakelsp-vscode/blob/master/src/extension.ts): `NeocmakeContext.create` downloads the server before startup and enables `semantic_token: true`; both are adopted. Geometry source hashes are in `vscode_design_sources.json`, `language_support_20261004`.

Clear and uninstall own an exclusive per-language task. Conflicting actions are disabled, and the service rejects retry or configuration changes until removal finishes. Registration uses a separate lock so cancellation does not wait for the download lock. See the [current independent-service evidence](../enhancements/tests/evidence/language_support_20261004.json); the initial community-plugin checks do not substitute for this architecture.
