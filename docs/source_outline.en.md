[Chinese](source_outline.md)

<a id="section_b849ea68708c"></a>
# Code Outline and Parsing Environment

The outline and parsing environment for C, C++, and header files are provided by the native **clangd**. The workbench sends the current editor's document content via standard LSP, receiving symbol names, categories, parent-child relationships, and selection ranges. Clicking on them locates them in the current Monaco editor. Here, clangd's Clang compiler frontend is used; GCC is a compiler toolchain and cannot be directly used as an LSP server. Markdown continues to display the native title directory.

<a id="section_1df7a9625a19"></a>
## Configuration Entry

Open a code file and switch to the outline. Click the **Parsing Environment Settings** to the right of the title row, or run "Code Outline: Parsing Environment Settings" in the command palette.

| Settings | behavior |
| --- | --- |
| clangd Executable | Leave blank to check PATH, LLVM environment variables, and standard installation directory; you can also specify the native clangd. It is global and shared, and do not write personal drive letters into the product default value. |
| Compilation Database Folder | Save according to the current project. Start from the project root directory, for example `build/bringup`. Leave blank to check the root directory, `build`, and its first-level build directory. The directory should contain `compile_commands.json` or `compile_flags.txt`. |
| Fallback Compilation Parameters | Use only when there is no compilation command. Each line is one item; parameters with spaces are kept as one item and are not concatenated through shell. |

The "Detection Path" shows the actual results found. When there are multiple build directories, you can clearly select them. The configuration is saved in the workbench user data directory's `settings/workspace.json`, and is not written to the opened project. Save first atomically to disk, then refresh the outline upon success; if writing fails, retain the original settings and the content entered in the window.

<a id="section_7742f90faffd"></a>
## By Language Settings

Open the unified settings according to `Ctrl+,`, select **Language Service**. The user JSON is the default value, and the workspace JSON overrides it according to the language as a whole; deleting the language key in the workspace recovers inheritance. When C/C++ is not overridden, it continues to use the clangd-specific settings below. The configuration format, Python/Java examples, and capability boundaries are seen in [Language Service Operation Instructions](code_analysis_colors.en.md#section_2063601e9dbe). Do not modify the configuration of VS Code itself.

<a id="section_d27fb524e1b3"></a>
## Analysis and Localization Boundaries

- C/C++ defaults to using clangd; users can explicitly select other standard LSP services in the unified settings. The corresponding Tree-sitter extraction of code and grammar assets have been deleted. When there is no clangd, it clearly prompts the configuration, and does not change to hand-written rules to guess symbols.
- clangd uses the language, macros, and header files configuration in the project's compilation database. It does not perform firmware building. Unsaved edits are synchronized through `didChange`, and are only used for analysis; localization and parsing do not write source files. Request cancellation, edit version, and active file checks prevent outdated results from overwriting the current outline.
- The outline faithfully displays the `documentSymbol` results of clangd. Whether functions, variables, types, and members appear depends on the compilation configuration and language service; clangd does not create rules for macros or local variables that it has not returned. When GCC-specific parameters and Clang are incompatible, clangd diagnostics are displayed, and it cannot describe compilation parameter diagnostics as "the syntax is not yet complete" in the document.
- Diagnostics and Symbol Responses arrive asynchronously. At present, only the diagnostics consistent with the current edit version are sampled. The absence of displayed diagnostics does not mean that all syntax checks have been completed, nor does it prove that the project can be compiled.
- R068.6 Enable the ability to disable clangd's background indexing per project, supporting cross-file definitions, declarations, and references; see [Project Navigation and Caching](code_analysis_colors.en.md#section_23b43513f4e3). Continue to disable clang-tidy, disk PCH, and automatic `.clangd` loading, do not enable query-driver, do not call the project compiler/script; do not provide completion or refactoring. The official TextMate base coloring is retained independently, and the indexing and caching for explicit LSP are controlled by its own parameters.
- JavaScript, TypeScript, Python, CMake, YAML default to using the offline Tree-sitter bundled with the package; they can be switched to LSP by language. For languages without built-in outline, such as Java, configure LSP to provide corresponding capabilities. Markdown retains the native title directory.

[Workspace Content Search](search_performance.en.md) matches disk text, and is separated from the current memory symbol analysis; [Source Code Cross-Window Transfer](drag_and_windows.en.md) restores the document and language after, and the new window re-requests symbols according to its own parsing environment, without migrating the clangd process or diagnostic cache from the old window.

Symbol icons use fixed VS Code Codicons, and colors come from `symbolIcon.*`: functions/methods are purple, classes/enumerations are orange, variables/fields/interfaces are blue; other categories follow the original foreground color. Light and dark themes respectively use the corresponding colors from upstream, and symbol names maintain normal text color.

Protocol and behavior based on: [clangd Work Mode](https://clangd.llvm.org/design/compile-commands), [clangd Installation and Editor Integration](https://clangd.llvm.org/installation), [VS Code Document Symbol Provider](https://code.visualstudio.com/api/language-extensions/programmatic-language-features#show-all-symbol-definitions-within-a-document), [Fixed Version Symbol Coloring](https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/editor/contrib/symbolIcons/browser/symbolIcons.ts).

<a id="section_8c1d95fe8f3d"></a>
## Validate entry point

`npm run check:ui` includes offline syntax, Markdown outline, configuration saving, and layout regression. Development environments that have installed clangd also execute `npm run check:clangd` and `npm run check:clangd-ui`: the former verifies real LSP and process lifecycle, the latter uses hidden Electron and real Monaco to verify compilation configuration, classification color, click localization, unsaved document content, file switching, and entry settings. Test projects and user data use temporary directories, and user windows are not controlled.

<a id="section_db458d4f70d5"></a>
## Simultaneous interaction fixes and verification

Markdown outline retains the native directory tree. Automatic highlighting prioritizes fully entering the readable viewport for titles, and if there are no readable titles, it falls back to the section of the document content; adjacent titles use 12px entering/exit buffer when they are at the edge of the viewport, without waiting for the new title to roll out from the top. The native delayed callback and workbench automatic selection share one synchronization to avoid adjacent titles competing for highlighting. Explicitly clicking the directory continues to use the native localization; automatically displaying the current directory line only scrolls the outline itself, without moving the document content or the cursor.

Readable viewport excludes the area covered by the status bar, with the outline and document thumbnail sharing this boundary. This avoids misinterpreting the title after the word count as visible content. Adjusting the Markdown margin on one side of the status bar by 0% to 24% retains the current reading paragraph; it only restores the original width control and does not re-introduce the entire set of appearance settings.

The installer only backs up and removes the retired C/C++ Tree-sitter grammar and license, rolling back to the original byte count upon recovery or failure, without scanning or deleting user files. The current release assets and schema 4 deployment method are see[Installation and Backup](../enhancements/README.en.md#section_13bbf790a6db).

Verification counts for the current result, historical baseline, and subsequent fixes are uniformly recorded in[Feedback Review Records](feedback_review.en.md). Real clangd, hidden Electron, native Typora, and physical keyboard are different evidence layers; synthetic key presses do not prove that native accelerator conflicts have been excluded. Testing Python deployment on Windows does not represent acceptance on native Linux.

2026-09-25 Capacity agreement is covered by [R075](resource_capacity.en.md), overriding the previous fixed size / result number threshold: complete processing content, retain user-initiated cancellation and actual failure, historical retained quantity and search scope still configured by user.
