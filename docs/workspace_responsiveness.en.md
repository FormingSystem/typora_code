[Chinese](workspace_responsiveness.md)

<a id="section_42f198551dd7"></a>
# R071 Module Refresh Isolation and Repository Lifecycle

<a id="section_729613372d53"></a>
## R071.4 Text Input Response and VS Code Scheduling Baseline

2026-09-23 User requested that text display, wheel scrolling, and editing response take priority. In the future, component pairing, refresh, and cancel schemes will be based on the verified VS Code source code. This requirement follows R071.3; the user first confirmed that there was still a delay after restarting the load.14, and then reported that the experience on a Windows 10 quad-core computer was normal, suspecting the remote access link. The decision was to test several versions again and observe. The latest screenshot is currently .13 and pending update .14, and this screenshot cannot be used as evidence that Windows 10 has loaded .14. The impact of the remote link has not been confirmed. This round will maintain the product rolling behavior and not release speculative adjustments.

Pin commit `88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f`'s `editorOptions.ts` registration `smoothScrolling=false`, `mouseWheelScrollSensitivity=1`, `fastScrollSensitivity=5`, `scrollPredominantAxis=true`, `cursorSmoothCaretAnimation=off`. Local VS Code user configuration does not overwrite these keys; existing Monaco uses the same default values. `scrollableElement.ts` distinguishes physical scroll wheel from touchpad, selects immediate update or animation according to configuration; cannot directly multiply its internal 50x rate to the browser's original pixel delta. `view.ts`'s `EditorRenderingCoordinator` merges one frame task per window, sequentially prepares viewport, renders text, measures other view components, writes to other components, and removes the task when canceled.

Text editing and browser scrolling belong to the native owner of Typora; the workbench does not rewrite input methods, undo, or complete Markdown formatter, and does not directly apply the line virtualization of the source code editor to the variable height text. The position of the workbench, outline, thumbnail, preview, and Git refresh can only subscribe to their actual changes; expensive background work is batched to give up threads, and old tasks become invalid when the window is closed, the document is switched, or a new request is made. Native page scrolling and Monaco use different input pipelines, and equivalent configuration and real-time response must be reported separately.

Subsequent acceptance testing should use the original host's trusted wheel and text input: record events as they are received into the scroll/document content change and the delay until the next frame, the delay of the scroll tail after stopping input, and the scale of 20/100/1000 sections isolated from the preview. The program scrollTop, physical mouse, private desktop, and the real desktop with GPU should be separately annotated. Do not use a fixed 60Hz timer, increase delta, or remove functionality to fake response optimization. New hotspots should be proven first, then modify the corresponding owner; failures should retain the document content and current view.

Subsequent user local trial feedback.14: When quickly switching open files, the content display is slow. Previously requested to refer back to.13, but later explicitly stated to not do performance version switching, and continue testing.15. The current version switching is paused and the repro item is retained, and no rollback or determination of resolution is executed.

This time, only deliver the source code baseline and development constraints. R071.4 on-site delay is retained in observation status, and is not marked as fixed. The experimental private desktop input tool has not yet been fully verified, and is left in the ignored research cache, and is not added to the formal test directory; existing runners and distribution assets remain as they are. There are no new product installation or uninstallation transactions. Subsequent repro should be compared according to the actual loaded version, direct local/remote access, same document and preview status.

<a id="section_493e8bf472b2"></a>
## R071.3 Reading scroll performance and cross-view refresh audit

2026-09-23 user feedback: When the document content, floating preview, and multiple Git difference tabs are present, the normal scroll wheel becomes sluggish. The scope includes the document content position recording, reflow anchor points, outline/breadcrumbs, thumbnail, theme observer, and input routing; retain the existing layout and gesture, do not use closing functions, truncating document content, or global busy lock to hide performance issues.

Collect the same document, viewport, and asset under the same scenario before implementation, separate normal scrolling, Ctrl zooming, preview scrolling, and idle; 20/100/1000 blocks are used for observing cost growth, original host validation combination scenarios. Fix based on actual hotspots, risks found during code review are not claimed as root causes on site. Scrolling only updates the associated reading viewport; position and theme are each managed by existing services, cache must become invalid with content/style changes, close the observer and suspend tasks for observation. Reordering still restores character positions, navigation history and unsaved document content remain unchanged.

Acceptance covers the end of long documents, multiple preview/backend differences, theme switching, code blocks/images and margins/scaling reordering; associate function testing with original host records actual performance, clarify automated scrolling and physical hardware input, other platform boundaries. Installation and uninstallation are verified according to the same candidate public entry. Evidence and un-fixed hotspots are recorded with delivery, no commitment to any scale of constant frame rate.

<a id="section_57168f1fe3ff"></a>
### Confirmed paths and implementations

- Original host same scenario confirmation: position records scan all document blocks, character anchor points scan off-screen subnodes from the start, outline reads each title geometry; the longer the document, the later the position, the higher the scrolling cost. Document content and preview share the block geometry index held by the root node, scrolling searches in document coordinates, does not re-test off-screen content. DOM, width/height, ancestor theme, style sheets and fonts changes make the index invalid; changes within the same task are immediately identified through the observer pending record, non-monotonic layout rollbacks cache coordinates scanning.
- Breadcrumbs and outline previously accepted all pages scroll. Now only accept associated document scrolling; breadcrumbs title tree reuses content/layout generation, chapter chain directly looks up. Preview, terminal, menu scrolling do not re-calculate the main document navigation. Reading recovery only checks real input when there is a recovery transaction; position persistence continues to be owned by the original service.
- Multiple read-only views separately extract all CSS rules when body state class changes, real combination scenarios can accumulate to dozens of milliseconds each time. Theme style extraction shares invalid cache, notification integrates with existing theme service merging into one frame; same value ratio, theme attributes do not repeat writing, unchanged difference themes do not redraw overview. It is not closing theme support; switching themes and font sizes still update.
- Audit related regression re-occurrence of original navigation race: before asynchronous remote pre-check, no transaction was held, continuous requests enter the host at the same time. Navigation lock now covers the entire pre-check/switch transaction, failure/cancel both release; the lock belongs only to navigation, not other functions. Original dark breadcrumbs fixture only changes CSS variables, not actual background, has been completed with real theme status, has not modified product colors.

Thumbnail still draws in content version slices, scrolling only updates viewport; code block geometry is still managed by visible instances. Current measurement has not found idle busy waiting or ordinary wheel mis-entering Ctrl zooming branch, cannot guarantee that all plugins/hardware/large documents have no pauses. Private desktop frame ticks about 31ms, do not treat it as physical screen frame rate; report layout times, callback costs and independent function assertions.

<a id="section_3e6befff876d"></a>
### This measurement and delivery

2026.09.23.14 on the same original Typora, same combination fixture serial retest; the table is the number of Element boundary reads for each group of 100 normal scrolls, not frame rate:

| Document section count | Document old version → candidate | Independent preview old version → candidate |
| --- | --- | --- |
| 20 | 5265 → 935 | 1956 → 394 |
| 100 | 35506 → 934 | 6392 → 393 |
| 1000 | 403534 → 952 | 56909 → 408 |

In the 1000-section scenario, the document has accumulated 464.9→119.3ms of callback cumulative in the 1000-section scenario, preview 261.1→77.7ms; 100 host state changes 3308.8→190.2ms. Cumulative values may include nested callbacks, not exclusive CPU time. Both idle versions have 16 element reads, no continuous busy waiting observed. First render and invalid reconstruction are still linear costs; full regression, exception records, native platforms and installation/uninstallation boundaries see [this time's evidence](../enhancements/tests/evidence/reading_performance_20260923.json).

<a id="section_97d95cb231d7"></a>
## Issues and Goals

2026-09-22 user feedback Git operation locks full window, various modules refresh busy waiting affects reading; existing tests only cover prepared repositories, missing empty directories, initialization, nested repositories. Already discovered that after Git form execution, it still occupies full screen modal, working tree does not track merge secondary complexity, full file DOM rendering and parent repository reuse obscures child repository.

The goal is to let data waiting and operation lock only belong to the respective controller, rendering cost depends on visible content, asynchronous stale cannot write to new directory. Confirm/fill form needs focus still uses public popup, submit execution releases mask; results and progress return to Git area. Do not cancel already started write transactions, do not allow multiple writes to overlap.

<a id="section_7132d04bfbf3"></a>
## Owner and Implementation

- Git subprocess continues to run asynchronously; write lock only protects this repository. Parameter parsing before commit can be canceled, and after actual execution, the form is closed and the result is reported in the original area, other modules can operate.
- Untracked files merge uses path set; SCM change lines integrate into shared visual list, list service owns visible lines, scroll/size listening and destruction, domain owns file/directory data, actions and folding. All results are preserved and accessible, not to reduce pressure by silent truncation.
- Empty directories provide clear un-initialized status and initialization entry, check the repository again before execution, reload after initialization; permissions or Git missing cannot disguise as empty directories. Git determines the real root, parent/child controllers shall not mix directly by path inclusion. Discover child repository verifies .git files/directories pointing to real repository and reports scanning boundary.
- Audit refresh subscription and synchronize IO, handle according to actual hotspots. Search/reading/terminal do not share Git busy flag; do not establish unified full window waiting lock, do not put all domains into the same scheduler.

<a id="section_f9c4dfc8ad7b"></a>
## Acceptance

Unit: big data merge complexity, virtual visual window, cancel intergenerational. Function: real temporary empty directory, init, first commit, delete .git, parent/child repository, working tree .git files, invalid marking and permission errors; original implementation must be identified by new assertions. System: original Typora large change directory loading and refresh continues to operate non-Git controls, record heartbeat/long tasks and DOM count; 20 operations/switches, input and unsaved document content keep. Record data scale and iteration times separately, do not use proxy to delay real performance. Installation and actual isolation unloading continue acceptance.

<a id="section_c92eb781139a"></a>
## Delivery boundary

This time's results, performance measurement and uncovered platforms are recorded in evidence; do not claim that all modules of any scale have been accepted by Git single change.

<a id="section_6d5a6835d2c9"></a>
## Fixed source and performance range

SCM line height according to VS Code `88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f`'s `src/vs/workbench/contrib/scm/browser/scmViewPane.ts`: `ListDelegate.getHeight` for resource lines returns 22, list uses `WorkbenchCompressibleAsyncDataTree`. This time continues to use 22px and existing colors/icons, does not copy upstream implementation; 200 lines is the threshold for this product to enter windowed drawing, 8 lines is the pre-drawing buffer, not called VS Code configuration. Graph file lines retain existing 18px content plus 4px interval of 22px step.

Shared visual list is used by SCM changes, Graph details and historical files; path tree projection first organizes hierarchy, then generates lines according to folding status, sorting will not split the same directory. Scroll/size/folding events are merged into one frame, destruction cleans up observers and suspended frames. Business collections are always complete, group operations are not only for screen files.

Multiple Git views pointing to the same real root directory in the same host share write operation mutual exclusion; different repositories can independently execute. Waiting entry for reading share refresh task completion notification, replacing their own 25/50ms polling. First project configuration is changed to asynchronous file reading. Direct Git process, directory discovery are both asynchronous; discovery closure can be canceled, limit/error has clear explanation.

Regression threshold is used to detect second-level blocking, and it cannot be understood that anything below the threshold is all operations below 50ms. Real host records greater than 50ms sampling and the stage it is in; the current range is local, 10,000 real changes/50,000 model lines and 20 rounds of refresh, and it has not been proven that any scale, network disk, and other platforms have no blocking.

<a id="section_17c442797393"></a>
## R071.1 VS Code interaction and empty workspace display review (2026-09-22)

Users further clarify operations and interfaces with VS Code as the standard. Review found that the empty workspace reused the text with no changes at 0.6 transparency, initialization progress and failure information are in the hidden commit area, and switching partition settings can still reveal empty workspace commit controls. Status fixes are uniformly owned by SCM view: four presentations of initial read, uninitialization, read failure, and normal repository; when the background refreshes existing repositories, the original list is retained. The empty workspace only provides entry points for initialization and existing sub-repositories, failure displays original errors and retry, and it cannot consider permission/Git missing as initializable. Initialization failure can still be retried; in progress disables repeated operations, and canceling necessary choices does not write.

Fixed source: VS Code `645f29cc3176500b4b5762ba887cf2a7f0ffdf2c`'s `extensions/git/package.json` presents `viewsWelcome` according to scan/empty workspace/Git missing conditions; `commands.ts`'s `git.init(skipFolderPrompt)` directly initializes when a single directory is confirmed; `repository.ts`'s progress uses `ProgressLocation.SourceControl`, without full-screen execution mask. The current product continues to follow the initial branch configuration of local Git, and does not claim to have transplanted the non-existent VS Code `git.defaultBranchName` settings.

Welcome page geometry takes `88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f`'s `views.css`: horizontal 20px, bottom 1em, sub-items upper 1em, button container full width and maximum 300px; `viewPane.ts`'s buttons use theme default styles. Initialization uses common primary role, discovery and retry use common buttons; text can be wrapped, not overall dim, not self-drawn a set of hover. Button font size 12px, line height 16px, padding 4px 8px takes the same version `button.css`; `primary`'s original semantic role complements common theme colors, initialization and commit share, disabled does not trigger hover. Progress is fixed within the visible SCM title range; status prompt nodes are handed over to the current display area, not maintaining two error copies.

Verification covers slow initialization when other controls are real mouse/keyboard available, failure original text visible and button recovery, retry and actual Git initialization, read error does not provide initialization, partition menu status change, narrow sidebar and light/dark/zoom. Use this round build and installation/uninstallation results, old versions pass records do not replace this verification.

<a id="section_0cbebf4dc5d6"></a>
## R071.2 Large repository Git execution and presentation isolation

2026-09-23 feedback: blocking or crash when a large number of files. It has been confirmed that the existing execFile caches 16MiB in whole, and hard timeout 30 seconds only; refresh while reading two status, SCM again executes two diffs, then multiple whole JSON comparisons and sorting. These are real pressure points, and it is not to attribute all platform crashes to the same cause.

The goal is to have Git handle repository operations, with the workbench only organizing commands and status. A shared runner is responsible for parameters, processes, flow, and cancellation; the repository service is responsible for single-state snapshots; SCM is responsible for visible lines. Use spawn for streaming reading, NUL protocol incremental consumption with backpressure, and batch processing after returning the event loop; regular document content/patches still have clear memory protection, and rejection of overflow does not display truncated document content. Status, group comparison, and sorting cannot be achieved through large JSON copies. Staged/Unstaged comes from the same porcelain status projection, avoiding repeated scanning and renaming detection.

Reading is given a 5-minute budget, writing/online is given a 30-minute budget, and real waiting is displayed truthfully without fabricating percentages; canceling reading retains the last snapshot and marks it as not updated; real reading failures display errors and disable corresponding repository operations, not displaying failures as a clean workspace. Canceling writing does not guarantee rollback, but Git still reports the results. A large number of file parameters for add/reset/restore are passed through NUL stdin, not through shell, and not started one file at a time. Git first verifies configuration/PATH/system installation location; if not found, it provides the system installation entry, and re-verification after installation is done, failure can be retried, and not treating missing Git as an empty repository.

Upstream basis: fixed VS Code commit 88e44fa0 in extensions/git/src/git.ts, findGit/exec uses real executable programs and spawn, parameter passing and cancellation are handled by the execution layer; the product's time budget and security capacity are host adaptation values, not claiming VS Code's full equivalence. The official Windows installation source git-scm.com/install/windows recommends winget precise package Git.Git; do not modify existing Git configuration.

Acceptance covers real temporary repositories, NUL cross-block/Chinese/renaming, exceeding 16MiB, non-zero exit/ no output/timeout/cancellation, repeated refresh, end-line access, and regular editing heartbeats; missing installation tools and existing Git do not repeat installation. Remote Git retains clear capacity boundaries for independent services, cannot call local streaming test as SSH infinite output acceptance.

Implementation details and protection boundaries: state and name-status list use incremental NUL parsing; UTF-8 decoding must retain BOM, avoid changing original text when recalculating object digest for selected staging area. Maximum of 4 Git execution tasks per window, queued cancellation does not start process. Protection limit of 500,000 items per list triggers explicit error, no silent truncation; single document/patch 16MiB limit only constrains viewing, does not restrict Git index or committing large files. Large diagnostic output for write commands continues to drain and waits for real exit, does not actively interrupt writing due to UI capacity. Sorting, grouping, and item-by-item comparison use cooperative scheduling; MessageChannel avoids background timer accumulated waiting.

Windows discovery uses configuration path, absolute PATH directory, standard installation directory, and GitForWindows registry, successful results are shared; do not search for git.exe in the repository. After secondary check of the installation entry, it is handed over to winget precise Git.Git package, and after successful installation, the program is re-verified and the current Git path is updated. If winget is not installed, system installation is canceled/failure/other systems, actual reasons and system installation explanations are given, not falsely claiming installation is complete; existing Git on the host will not be reinstalled. SSH reading budget is synchronized to 5 minutes, writing to 30 minutes, existing remote 16MiB transmission protection remains; remote streaming protocol belongs to subsequent independent work, not considering the current local results as remote infinite scale.

2026-09-23 Verification and Delivery: Final Candidate 2026.09.23.10. Real 100002 items / 20100054 bytes status read in about 459ms, main thread maximum interval 15.85ms; Original Typora ten thousand files 20 rounds of actual change refresh 73 items passed, single round 342–398ms, heartbeats P95 about 10.7ms. First load still has a maximum interval of 346.7ms, zooming about 65–69ms; these are not counted as stall. Installation and two types of isolation uninstallation and reinstallation passed, Win10/real SSH scale/new computer system installation retained the site acceptance boundary; see [Run Evidence](../enhancements/tests/evidence/git_scale_20260923.json).
