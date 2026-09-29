[Chinese](git_branch_checkout.md)

<a id="section_035cbb3b355e"></a>
# Quick Picker for Branch Checkout

<a id="section_f92d1142f91c"></a>
## R048 Issues and Goals

2026-09-19 User Screenshot Reproduction: Status bar branch uses regular right-click menu, list cannot search, remote long name line wrap, missing tab, create source, and commit details; remote checkout still requires re-entering known target. Independent checkout selector replaces left-click menu, SCM repository row and general checkout menu reuse; right-click object operations, history references multi-select, and Graph object menu retain their own semantics.

<a id="section_03bec091ce44"></a>
## Upstream Basis and Scope

Continue using the Git module for VS Code 1.137.0, commit `645f29cc3176500b4b5762ba887cf2a7f0ffdf2c`. `extensions/git/src/commands.ts`'s `_checkout`, `createCheckoutItems`, `CheckoutRemoteHeadItem`, `_branch`: top input, create / create from reference / checkout separately command, local / remote / tag grouping; non-empty queries will match references first, actions are still available; details are author, short commit number, and topic, remote takes precedence in tracking branches. `repository.ts` remains actual write transaction and refresh. QuickInput source code's 600px width, 6px margin, 22px normal line and 44px detail line, official Codicons branch / cloud / tag / add (plus semantics) / debug-disconnect. Fixed source code summary follows this round of evidence recording. Screenshots are not sources of pixel constants.

The scope is the existing checkout capabilities and the basic processes visible in the screenshot. No need for GitHub / network; no new host, remote pull, forced checkout, automatic stash or worktree window. When encountering a local branch with the same name but not tracking the selected remote, clearly report an error to avoid switching the wrong object. Separate checkout does not list tags (ordinary list already allows tag selection); empty repository can create unborn branches. Create and checkout at the same time, distinguish from Graph's

<a id="section_9679183bf1db"></a>
## Responsibilities and Implementation

The same selector is held by the status bar, SCM repository row, and more menu call panel; the UI is responsible for input/focus/stage/results display, while the service reads the complete reference, author/date/topic, and parses the target. The panel continues to hold the write lock, draft protection, execution progress, and refresh. Details are read once per for-each-ref, without relying on Graph pagination or filtering, and without starting Git line by line. The complete refs identity is retained, annotations are stripped to commit, and remote HEAD symbolic references are skipped.

Opening capture root/runner/writer/repository_epoch; reading stale, switching databases, refresh, and destroy close and clean up. Before acceptance, verify identity; the service re-reads the target hash and tracking mapping within the write lock; if there is inconsistency between the display reference and the target, reject. Use existing plan/execute fingerprint and can_change_files protection, without automatically overwriting working files. If the remote has an existing tracking branch, check out the local branch; otherwise, derive the local complete branch name based on the real remote prefix and create the tracking.

<a id="section_044c7eac20d5"></a>
## Interaction and Failure

Open focus on the search box, move with the arrow keys, accept once with Enter, and cancel with Esc/external click, restoring according to the common focus rules. Do not accept Chinese input combinations. Creation input only collects names; when creating from references, first select the source; if there are no results, provide a prompt. Long names and details are displayed in a single line with omission, and the complete title is provided. The list is limited to the viewport. Read failures are displayed within the selector; execution failures are reported by the existing panel. Cancel zero writes.

<a id="section_c343c6392d3b"></a>
## Acceptance and Associated Impact

Features: status bar, SCM line, more menu; filter/group/detail, create source, separate/tab, remote tracking reuse, single execution and refresh; do not mix with multi-select history. Temporary real Git: slash branch/remote, same-named branch/tag, tag stripping, name conflict rejection, old reference rejection, dirty work tree and unsaved document content protection, HEAD/index/file byte invariance. UI: keyboard/IME/focus recovery, expired close, narrow window/dark, 20/100/1000 lightweight status cycle. Native independent Typora verifies real status bar entry/theme; environment lacks clear record. Formal evidence links test directory, report, and installation assets, deliverable after results.

<a id="section_418fdbfce4b5"></a>
## This round of verification and delivery

2026-09-19: R048 has been implemented. Real temporary Git test cases verify 10 scenarios; hidden Electron verifies real mouse/keyboard, write port replaces side view separately records; 20/100/1000 tier only pressure verifies lifecycle, not claim thousand Git writes. Original Typora 1.14.10 independent directory/private desktop 56 checks passed, ten of which are this round branch entry, theme, search, line height and detail text starting point. Dark/native screenshots have been inspected; zero write, old layer can't be executed.

Three types of issues were discovered during development: missing official icon resources cause first render failure; static style loading order causes detail inheritance centering; old acceptance still waits menu, native fixture name conflict variables and Esc missing release event cause failure. Have separately supplemented resources/summary, improved the explicit scope of check line rules, and updated real entry and syntax pre-check. First failure and repair report are both retained. Codicons and reference name fixture metadata line break/ambiguity handling is not hidden as passing on the first round.

Selected background fixed Light/Dark 2026's quickInputList.focusBackground as #0069CC/#297AA0, foreground #FFFFFF; input box reuses common focus color. Evidence entry is [This round record](../enhancements/tests/evidence/branch_checkout_20260919.json). 2026.09.19.3 has been installed, 27 asset matches, 5 protection summaries unchanged, installation check OK; user window no restart. Submit status see local ledger, no push. Remote auto-pull, conflict auto-stash, arbitrary commit number input or VS Code configuration ecosystem not implemented; failed files are clearly retained, not claiming complete Git extension equivalence. Existing cross-platform, physical input and another computer permission acceptance gaps are maintained.

<a id="section_b9abc4d7df84"></a>
### Fixed source summary

- [extensions/git/src/commands.ts](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/extensions/git/src/commands.ts)：SHA256 `5334bae578a8ddeaf770a695944220a6a66bb50b8588d8aed29bacb5d52b02b4`。
- [extensions/git/src/repository.ts](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/extensions/git/src/repository.ts)：SHA256 `aefaabe5c07ae8669b20e1e1bd3bb36041d8219cd9ae5bb0ce644acdad49a8ff`。
- [src/vs/platform/quickinput/browser/quickInputList.ts](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/platform/quickinput/browser/quickInputList.ts)：SHA256 `b72a7e594568c38072f4e845b84ec09e7244e1e6357b1c3606202f8a2aaabf38`。
- [src/vs/platform/quickinput/browser/media/quickInput.css](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/platform/quickinput/browser/media/quickInput.css)：SHA256 `48679724b7570cb040bd2a0d9a55c0a2602ae1714c322f756f3527ac91fdb9d8`。
