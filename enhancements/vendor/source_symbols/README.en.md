[Chinese](README.md)

<a id="section_b7936e7ba468"></a>
# Offline grammar outline assets

Runtime fixed `web-tree-sitter@0.25.10`; five binary grammars from `tree-sitter-wasm@1.1.8` npm release archives, only JavaScript, TypeScript, Python, CMake, YAML are distributed with the product. The C/C++ outline has been switched to native clangd, and neither of these grammars is distributed or called. `source_manifest.json` fixed archives and per-file SHA256 are recorded, and the original grammar repository and license text sources are documented. The pre-built contains semver source dependencies, so the license tags are not misrepresented as exact grammar Git commits. Each original author's MIT license and runtime license are distributed with the assets.

`scripts/build_source_symbol_assets.mjs` checks the grammar SHA256, generates an independent Worker, and copies it to `dist/assets/source_symbols/`. Deployment follows the existing recursive assets and SHA256SUMS paths; during parsing, it reads from the user's data directory's product assets, loading the corresponding grammar only on first use. No CDN, network retrieval, compiler calls, or source code execution, and no embedded WASM startup script is used.

These five languages provide syntax tree symbol navigation: Python assignment targets do not pretend to be declarations; CMake shows functions, macros, set/option variables, and explicit build targets; YAML shows mapping keys and list hierarchies. TSX, other languages, and semantic reference analysis are not yet provided. Documents over 2 Mi UTF-16 characters display boundary explanations; a single parsing uses a 750 ms cancellation budget, extracting up to about 5000 symbols. Edits of incomplete syntax retain the grammar's recognizable parts.
