[Chinese](stability_validation_20260919.md)

<a id="section_2b9e53472aa1"></a>
# 2026-09-19 Stability Fix and Acceptance

This round starts from a clean `9164530f11f7a779ff11643618f7e94c969c231e` work tree, first register R039—R045, impact analysis and domain design, then modify the product. Requirements and test definitions are stored in the repository, original runtime logs and screenshots are kept in the ignored evidence directory; the development skill is synchronized to join the current process and pass the verification. Machine-readable conclusions and per-component association are seen in [This round evidence index](../enhancements/tests/evidence/stability_20260919.json), and subsequent maintenance entry points are seen in [Test architecture](stability_testing.en.md).

<a id="section_51689b94d1b0"></a>
## Fixes and behavior boundaries

| Requirement | This round results | Retained boundaries |
| --- | --- | --- |
| R039 | 114 existing/new components are unified numbered, classified, and associated with requirements/design/implementations; unified reports retain version/asset/source/log summaries, failures, and unexecuted items; issues are aggregated by domain and root cause; skill has been updated | Number of components is not equal to internal assertions; you cannot pass one layer by replacing all environments |
| R040 | After successfully opening the folder, write the host's latest directory; each time a menu is opened, read the latest history; failure/cancellation/stale handling has tests | Native history is read back through; no local history copy is created separately |
| R041 | File/Git unified call to the main process to recycle, reject/exception/fake success are all visible; ordinary known target actions are directly executed, parameter forms are submitted once; deletion respects native warning configuration | Local real temporary files and directories are recycled through; another computer's permissions/occupancy/version factors still need to be re-verified on this machine, and no bypassing of permissions or permanent deletion is a fallback |
| R042 | `111`→`1111.md` language and default view automatically update; same dirty model and undo state is retained | Continue editing and immediately get Markdown language mode for unsaved draft; after successful save, enter native Markdown; rename without silent save |
| R043 | Common reading viewport handles real top obstruction, native explicit chapter navigation adapts to offset; scrolling is kept implicit during editing | Native GitHub/Night title is fully visible, associated outline/breadcrumbs/thumbnail/terminal layout regresses |
| R044 | Core menu icon shell and actual glyphs share 16px slot and independent text column; Git activity icon is 24px rule limited to activity button | Native two theme screenshots have been visually inspected, hidden Electron supplementary menu/focus/lifecycle; do not treat outer frame alignment as glyph alignment |
| R045 | Existing entry domain-by-domain verification and regression; status bar branch differentiation `*`/`+`/`!`, separate HEAD, synchronize quantity; similar menu/theme scope corrections together | Upstream protection branch etc. composite icons and unauthenticated complete extension ecosystem are not disguised as already implemented; existing incomplete terminal/platform items still remain |

<a id="section_f5d3164daa50"></a>
## This verification

The final candidate `dist/SHA256SUMS` SHA-256 is `d626e958950b797f5fa0584d1d1a6a2fe855bf7e07630378678fd1353034f93f`. Build and `npm run check` pass, directory check 114 items, `git diff --check` pass. All conclusions are based on this round of execution, no carry-over of previous passed numbers.

| Level | Implementation verification | Stress verification |
| --- | --- | --- |
| Unit | 14 test suites passed | 1 test suite passed |
| Function | 85 test suites passed | 3 test suites passed |
| system | 6 test suites passed, 4 test suites not executed | 1 test suite passed |

Total of 110 different directory entries passed, 4 not executed. The full functionality cycle was 86 passed/1 failed; the failure was a new core menu geometry assertion that did not load CSS, which was fixed and the test suite ran independently and passed after correction. General transaction waits, framework configuration supplements, and metadata categorization also ran separately; do not rewrite the original report with failures into all green. Use the individual run results as evidence indexes.

Three levels of 20, 100, 1000 run 5 pressure kits each: pure state random attributes (fixed seed 20260919), temporary files/directories port loop, native menu lifecycle, and two existing fixed load searches/quick open tests. The latter two report iterations as empty, retain actual workloads, and do not claim to have executed the specified thousand rounds. Native pressure completes in dedicated host and user directory, menu node count does not increase, end state and original document bytes are preserved; it is not equal to all modules having been subjected to long-term immersion tests.

In the original Typora 1.14.10 standalone host replica, 21 assertions were implemented successfully, including real recent history, clean/dirty suffix changes, default view after saving, actual file/directory recycling, and two theme titles/menu geometries; the fixed original ASAR summary remained unchanged. The input method is renderer events and real host API, the standalone desktop did not switch to the user desktop, and cannot be described as physical mouse or cross-account verification. Sampling DPR=1.25, window zoom=1; the driver then adjusted the independent window capture, and screenshots and each geometry value are saved in native evidence.

Four clearly unexecuted items: real Windows file clipboard interoperability, old native injection-type reading tests, need for independent Shell environment terminal interaction, Bash installation wrapper. The first two cannot be borrowed by default run to cover user clipboard/installation; this round's native acceptance uses a new isolation entry. Another Python installation task passed in temporary directory, but does not claim Linux native desktop pass. Clangd service and hidden interface have already used native clangd actual running.

<a id="section_0acece948c48"></a>
## Process failure and rerun

[Issue Index](stability_issues.en.md) Retain host style overrides, native multiple confirmations, PS7→Node→PS5.1 module path pollution, commit preparation phase mistakenly judged as complete, native copy omission of appsrc, core fixtures missing CSS, etc. The original footer/interaction fixture lacked existing service fields, which are also addressed in this round. After the initial core source summary mismatch, the source list is rechecked. The initial native title validation incorrectly limited "visible" to 10px from the top, but based on actual host behavior, it was changed to check that the title is fully visible within the visible area, retaining the original failure.

Build/check logs are located at `.cache/issue_tracking/build_verified_20260919.log`, `check_verified_20260919.log`; independent runs and historical failures are at `.cache/issue_tracking/runs/`; the summary index saves the report summary. During testing, early reports of candidate changes are explicitly incomplete, and no use is made of them for standalone acceptance of the final candidate. Source and evidence definitions can be reproduced from the current commit, and the original large log did not mix with product runtime packages.

<a id="section_16d201d520e9"></a>
## Installation and Loading

Install through existing Windows transaction entry, installation check returns `OK`; 23 assets are all consistent with the above candidate. The summary of five protected items: Host ASAR, Host Icon, User Preferences, Workbench Settings, and Project Theme; no user window is forcibly closed or restarted. Evidence is `.cache/issue_tracking/install_verification_20260919.json` and the installation/check log in the same directory, backup number `20260919-182851-690-58161368bd78471a807910beb1e51839`.

After the user saves the document, a normal restart of Typora is required to load the current version. Successful installation of the asset does not mean that the old window has been loaded, nor does it replace the actual acceptance on another computer. Code, testing, design, and corresponding builds are submitted together; this round does not include a remote push.
