[Chinese](language_environment_plugins.md)

# R085 Language environment plugins (2026-10-04)

## Scope and operation

Nine actual community plugins cover C/C++, C#, CMake, Makefile, Bash, Java, HTML, CSS and JavaScript/TypeScript. Each has its own manifest, entry point and original SettingTab, using the existing install/enable/disable/uninstall lifecycle. They ship in the **Language environment plugins** catalog; this change does not publish them to an external marketplace.

The user's clarification requires operation without globally installed tools. Recipes therefore download portable Node, Python, JDK or .NET automatically when users install an environment. Managed downloads currently support Windows x64. Other platforms retain external service configuration. This does not provide a VS Code extension host, project builder or debugger.

1. Open Extensions → Language environment plugins. Install the desired plugin, then trust and enable it.
2. In its settings, leave the installation directory empty for `typora_code/language_environments/tools` inside Typora user data, or browse for another base. Select **Download and install environment**. The recipe supplies the required runtime and server without requiring download URLs.
3. **Use managed environment** controls the fallback provider. Disabling the plugin keeps downloaded files for later reuse.
4. **Configure external tools and language arguments** opens the shared user/workspace form for executable, argument array, process environment, initialization options and server settings. **Copy installed toolchain into this draft** supplies a starting point. Changes only apply on save; cancellation preserves previous settings.
5. **Clear managed environment** disables its provider and removes only files with matching ownership. To move an environment, clear it, choose a new base, reinstall and enable its use. Uninstalling the plugin also clears its own tools, while retaining user configuration and referenced external programs.

Progress includes upstream command output. Cancellation stops the download and owned install processes and clears staging files. Failure never registers a ready environment; retry transient network errors. If Windows path limits prevent installation or loading, select a shorter base. Tools are not added to system PATH.

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

The pinned VS Code `68070681` sources `src/vscode-dts/vscode.d.ts` (`ExtensionContext.globalStorageUri`) and the TypeScript extension `package.json` (`js/ts.tsdk.path`) establish the reference for extension-owned storage and selectable SDKs. TyporaCode implements those responsibilities through its existing community SettingTab and services.

Installation and argument references: [clangd](https://clangd.llvm.org/installation), [neocmakelsp](https://neocmakelsp.github.io/docs/installation.html), [Makefile service](https://github.com/Freed-Wu/autotools-language-server), [Bash](https://github.com/bash-lsp/bash-language-server), [TypeScript](https://github.com/typescript-language-server/typescript-language-server), [HTML/CSS](https://github.com/hrsh7th/vscode-langservers-extracted), [C#](https://github.com/razzmatazz/csharp-language-server), [Java](https://github.com/eclipse-jdtls/eclipse.jdt.ls). Makefile pins an older release because 0.1.3 no longer contains the `make_language_server` entry point.

The test catalog links transaction, real-download and original-host checks. Real-service tests restrict PATH to Windows System32 and remove external runtime variables, then install, analyze unsaved code and uninstall all nine recipes. One CMake connection reset was recorded and its targeted retry passed. Original Typora 1.14.10 checks cover all nine plugin lifecycles/SettingTabs, actual CMake installation, configuration drafts/cancellation/removal, light/dark themes and focus. Complete projects and other platforms remain outside those results. Current evidence and delivery status are recorded in the feedback review.
