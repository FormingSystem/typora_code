[Chinese](stability_testing.md)

<a id="section_3af159a02445"></a>
# Stability, Problem Classification and Test Tracing

<a id="section_1d362a077051"></a>
## R039 Requirement and Evidence Loop

2026-09-19: Users require that requirements, design, implementation, testing and process issues be recorded as retrievable engineering documents, covering the stability of existing functions and associated modules. R004/R011 continues to manage the requirement entry, this chapter manages the methods for testing and issue handling; no reliance on session memory recovery requirements.

Formal requirement numbers continue to use the requirement design index; test cases use stable `TC-domain-number`, problems use `BUG-domain-number`. For the same root cause, updates to the original problem's reproduction environment and evidence are maintained, and the problem is not replicated based on each run. The domain is files, reading, workspace, git, terminal, delivery, quality, update; the type is function, compatibility, concurrency, performance, geometry, theme, test facilities. Problem recording triggers steps, expected/actual, affected modules, severity, root cause status, solution, associated test cases, verification and delivery boundaries. When symptoms are the same but the root cause is unknown, associate investigation is required, and it is not allowed to assert that account permissions are the root cause.

Test definitions and requirements enter version control; logs, screenshots and large volume of execution products are placed in `.cache/issue_tracking/runs/`. Current problems are maintained in [Problem Index](stability_issues.en.md) by domain; runs are saved with unique run_id and are not overwriteable. Failed re-runs produce new results and reference the original failure, without erasing the first failure. Delivery history retains only the conclusion and evidence entry; local logs are responsible for current progress, and no longer repeat complete process descriptions.

<a id="section_fc5360ea7096"></a>
## Test Architecture

Testing has two independent dimensions: level `unit` (unit rules), `functional` (actual service/interface function), `system` (integration, deployment or native host); purpose `implementation` (behavior and failure paths), `stress` (stability and cross-module impact). Stubs, hidden Electron, native Typora, physical input, platform should be separately noted, and cannot be used to replace other levels with a single level.

Test directories uniformly record test case numbers, requirements, design, implementation, associated modules, execution entry, preconditions, steps and observable assertions. Retain existing scripts and classify them into access, without rewriting a set of identical tests. A unified runner is responsible for selecting, timeout, step-by-step exit status, source version/difference/assets summary, environment, duration and log association; not executed, conditions not met, failed cannot be displayed as passed. Directory checks reject unassigned test files and invalid links.

Pressure levels are 20 (localized rapid recheck), 100 (affected service integration), 1000 (lightweight state machine/event long loop); the number is the workload, not the number of passed assertions, and not to repeat the entire UI suite without difference 1000 times. Test cases clearly specify actual iteration numbers, random seed, concurrency limit, time budget and stop conditions; check the final state, single execution, stale results, listener/DOM/queue cleaning and irrelevant documents. Real files, recycling and Git operations only use dedicated temporary objects. Platform or resource shortages record unexecuted, cannot silently reduce load and still report high-level passes.

Three levels provide representative pressure entry points: deterministic attribute checks for pure state parsing and branch marking; real temporary files and host port stubs for loops, stale, and failures; native host function menus repeatedly opened and closed, and DOM count, content retention. The latter does not repeat recycling 1000 system files, and does not claim to cover all modules' long-term runs. Search original performance test cases retain their fixed load, report iterations as empty and specify the load, not to impersonate the level of the number of times.

<a id="section_52775beeee3e"></a>
## Impact analysis before implementation

Each time, first register the requirements and issues, then list along the real call chain: entry → command/service → state owner → platform adaptation → refresh subscriber; specify a test case or clear gap for each affected module. After supplementing domain design and implementation plan, change the product. If problems are found during implementation, first archive and update the design; independent issues retain independent status. Finalize by checking each requirement → design → implementation → test case → this run → installation/loading, phase submission allows for clear platform gaps.

<a id="section_845ee8738b47"></a>
## Current scope and acceptance

| Requirement | Problem and solution entry | Associated modules and acceptance |
| --- | --- | --- |
| R040 | Recent directory does not follow the update; check the entry and menu reading timing after the host successfully opens | File selection, recent directory, top bar, switch workspace; successfully update sorting/deduplication, cancel failed ones without recording, persistent across windows or restarts |
| R041 | All shortcut/right-click actions and cross-machine file deletion | Explorer, file commands, Git, terminal, shared dialog boxes, native capabilities; classify all existing entry points, ordinary actions do not require execution confirmation, destructive actions are confirmed based on already verified semantics, execute once, failure visible, cancel zero write |
| R042 | Renaming without suffix to Markdown still stays in source code | File transactions, editing model, tabs, icons, outline, breadcrumbs, search, auto-save; language and default editing type updates, retain memory document content/dirty, background copies consistent |
| R043 | Breadcrumbs cover the target of title jump | Common reading viewport, native outline, in-document links, reading history, thumbnail; deduct real top obstruction, each entry's positioning after title is fully visible, split view/hide/shrink/regression |
| R044 | Activity area menu icons are not aligned | Core menu, activity bar, shared icons, themes; fix upstream menu slots and activity bar size separately, icon/text box and default/focus/dark verification |
| R045 | System audit of existing functions differing from VS Code | Check each existing file/search/editor/Git/terminal/theme domain by domain; prioritize bottom bar Git branch, menu, theme; record fixed sources, adopted values, product adaptation and non-coverage, do not add unauthorized panels |

R039 covers this round's items 1/2/3/4/8/10/11; R041 covers item 5; other requirements correspond to directory, items 6/7/9 and item 8's existing function comparison. Design scope and current delivery are separate, results see [this round's acceptance](stability_validation_20260919.en.md). Cross-machine environments still require corresponding real machine evidence.

<a id="section_fd9ded032ed1"></a>
## Run and verification

The authoritative use case directory is [test_catalog.json](../enhancements/tests/test_catalog.json). One line represents one independent test scenario set, do not count internal assertions as separate tests. Precise steps and assertions are specified in the same entry's script; new scripts must be registered, `npm run check` checks the directory first. When adding scenarios to existing tests, maintain original numbering, reclassification does not change numbering, do not establish a second separate list.

Execute in `enhancements/`:

```sh
npm run check:catalog
npm run test:quality -- --list
npm run test:quality -- --level unit
npm run test:quality -- --domain files --level functional
npm run test:quality -- --purpose stress --tier 20
npm run test:quality -- --purpose stress --tier 100
npm run test:quality -- --purpose stress --tier 1000
```

Use `--id` precisely to select a set, or combine `--domain/--level/--purpose`. Each round outputs independent directory's `report.json` and per-set logs, including version, source file summary, candidate list summary, platform/runtime, actual iteration count, exit code, time, and log summary. Failed cases are retained, rerun creates a new directory. When a use case cannot execute due to missing platform or essential environment, it is `not_run`, total status is `incomplete` and process is non-zero; changes in candidate assets during testing also make total status incomplete, prohibit using this report alone for final acceptance. Without `--tier`, it is 20, do not automatically execute thousand-round UI.

Installation is an independent delivery phase, continue using existing transactions for installation and read-only checks; the same candidate needs to be clearly distinguished as 'source modification, test passed, asset installation, run window loading, real machine verification'. Rules updates, optional tools, or platform incompatibility cannot be written as product passed.

<a id="section_77ca84da75d7"></a>
## Native acceptance

Set `TYPORA_NATIVE_TEST_ROOT` as the directory of the locally installed original Typora 1.14.10, then run:

```sh
npm run test:quality -- --id TC-system-native-stability
npm run test:quality -- --id TC-system-native-stress --tier 1000
```

`prepare_stability_native.py` validate fixed native ASAR digest, copy full host to unique `.cache/issue_tracking/native/<id>/host`, copy and validate candidate list, generate independent configuration and temporary Git repository. Must retain window.html reference to native `appsrc`, do not treat it as cache filter. `run_private_desktop.ps1` only start/terminate this copy, execute in Windows private desktop without switching; will not restart user window. Fixture results are `checks.json`, also include setup, window state and light/dark screenshots, retain generated directory, do not automatically delete evidence. Target menu uses renderer events to call real host capabilities; do not claim physical mouse input or other account acceptance.

Default total entry will not run legacy scripts that require user clipboard, old native injection, or external Shell environment; directory explicitly explains the reason. New isolated native entry can reproduce this round of test cases, does not depend on personal path, previous `.cache` preparation scripts or existing test copies. When there is no target host or ASAR version mismatch, do not modify the original installation, record the lack of capability/failure and stop the suite.

<a id="section_ca88777340a4"></a>
## Existing entry audit and impact scope

| Domain and entry | Common call/status owner | This round of check and processing | Recheckable suite |
| --- | --- | --- | --- |
| File menu, shortcuts, quick open, recent directory | workspace_open_dialog / workspace_files; host has recent history | After successful mounting, await writing native history; on failure, visible, cancel/expire do not update; when menu is opened, read new state | workspace_titlebar_entries、workspace_shortcuts、stability_contracts、native stability |
| File tree title button, right-click, F2/Delete, cut/copy/paste, drag and drop | workspace_explorer → file commands/transactions; file_clipboard has snapshot | Create/copy/move/rename/path/refresh/close share original entry; delete respects native confirmation settings, lock single operation, share main process adapter | workspace_explorer、workspace_file_operations、workspace_rename、workspace_file_clipboard、native stability |
| File tabs, edit group menu, save as, all save, history recovery | workspace_files、workspace_editor_actions、text_document/local_history | Suffix change notification model; clean reselect default view, dirty do not lose document content; background tabs and manual language rules remain | workspace_file_editing、workspace_editor_actions、workspace_document_transfer、workspace_auto_save、workspace_local_history |
| Git sidebar, Graph, status bar, shortcuts, more/objects menu | git_graph_panel shares writing transactions and refresh; repository_state is snapshot | Known action without parameters directly execute; form submit once; dangerous operations first show scope/warning; auto remote target continue service parsing; no second state | git_quick_actions、git_scm_actions、git_graph_interaction、git_discard_confirmation、git_sync |
| Terminal menu, title/tab button, right-click, editor/bottom move | terminal_commands/controller/session | Recheck existing create/split/close/clear/search/config/move entry; no new general execution confirmation; Shell capability still follows discovery results | terminal_panel、terminal_capture、terminal_composition、terminal_settings、terminal_profiles |
| Search, outline, history, breadcrumbs, thumbnail | search controller / symbol provider / reading viewport | Jump share visible viewport; native explicitly scrollAdjust adapts top obstruction; edit implicitly scroll without changing | workspace_stability、breadcrumbs、outline、reading_lifecycle、reading_minimap |
| theme, activity bar, shared menu, status bar | workspace_interaction/theme, core Menu, Git snapshot | Font/SVG slot unification, 24px belongs only to active button; dark/light non-hover and text line box validation; branch *、+、! and separated HEAD fixed source code | core_smoke、activity、workspace_interaction、workspace_footer、SCM geometry and native two themes |

This is the call classification of currently implemented entry and regression ownership, not equal to each system dialog box being verified on every computer. System locate file, external program open, system select, clipboard, Shell and clangd belong to host capability boundary; cross-account/other Windows machine, ARM64/Linux and physical input method continue to register gap. VS Code protect branch composite icon, extension host and complete setting ecosystem are not within this round of repair scope; existing clear differences are recorded in the issue index, not replacing acceptance with 'one-to-one completion'.

<a id="section_be107730bdb4"></a>
## Timeline evidence of startup and switching

Judgment and impact range of R054 see [startup stability](startup_stability.en.md). `TC-sidebar-transitions` check the visibility ownership of production core; `TC-sidebar-stress --tier 20/100/1000` check repeated switching; `TC-startup-presentation` check static head readiness / error / timeout recovery; existing `test_workspace_startup.cjs` add interface mounting assertion when syntax loading is blocked. `TC-startup-native` sample before real host head, retain intermediate state, host visibility call, stage time and long task.

First-time display cannot just take screenshot after ready; testing must make old implementation fail. Ordinary asynchronous data update and initialization failure recovery are separately determined, cannot call everything loading as flicker, nor mark each long task as confirmed algorithm error. Pressure level is only applicable to truly changing operation number cases, system level defaults to 20 times instead of 1000 hosts at startup. All results continue to enter the existing directory and run report, no separate test list without association.

<a id="section_f16f4be03e24"></a>
## Evidence entry of update module

R047 corresponds to `update` domain: `TC-update-protocol` (unit / implementation), `TC-update-ui` (function / implementation), `TC-update-concurrency` (function / pressure), `TC-update-install` (system / implementation). Run `npm run test:quality -- --domain update`; pressure is separately executed as `--id TC-update-concurrency --tier 100` or 1000. Cross-process contention total times according to level, maximum 20 concurrent processes, do not interpret 1000 as starting 1000 windows at the same time.

Reuse native stability fixture with real host process identity and standard dialog box, only replace network announcement, choose later; installation system test case uses real ZIP, PowerShell 5.1 and installer, download bytes from local stand-in, target is temporary Chinese user directory. Keep these two boundaries, cannot claim that real online new version push has been accepted.

<a id="section_5f222a3416ac"></a>
## Directory check on 2026-09-20

Current machine readable directory contains 162 sets: unit implementation 22, unit pressure 10; function implementation 95, function pressure 11; system implementation 22, system pressure 2. They are the number of use case ownership, not the number of all executed through in this round. New or adjusted after running `npm run check:catalog`, actual execution results still take the report bound by candidate summary as the standard.

History of candidate features for 2026.09.20.2 includes complete base checks, 74 hidden UI elements, native and pressure recording retained in [Startup Delivery Evidence](../enhancements/tests/evidence/startup_stability_20260920.json). Current 2026.09.20.19 includes complete check, 78 UI groups, 290 native assertions and screen split pressure associated with [Screen Split Verification Evidence](../enhancements/tests/evidence/drag_stress_20260920.json). This R055 only synchronizes documentation, checks directories and release identity, does not impersonate to re-run all system/platform tests; legacy issues continue to be managed by [Issue Index](stability_issues.en.md).


<a id="section_b125499a2688"></a>
## Screen split and cross-window pressure entry

R005.1 is associated with TC-workspace-007 (real core layout/DOM), TC-workspace-005 (two renderer real channels) and TC-system-native-drag-windows (original Typora independent copy 20 times actual window merging). The first two are each executed in sequence at 20/100/1000 levels; the channel is also validated 2000 times. Native split view, draft and Monaco undo checks reuse shared stability_native fixture.

Record idle rAF, editor open/close counts, live nodes/channels/timers and round/total duration; observe total duration must exclude test concurrency contention, do not equate asynchronous waiting with main thread blocking. Native suite uses renderer event-driven real entry; physical mouse cross-screen is not accepted through this. Operation boundaries, failure corrections and real test values are maintained by [Authoritative Design](drag_and_windows.en.md#section_5eefb7c166f0) and candidate evidence.

<a id="section_b5b504413be8"></a>
## R071 Lifecycle and cross-module responsiveness must be tested

Git testing must start from an empty directory without .git, covering initialization, first commit, subdirectory/parent-child nested repositories, .git file working tree, repository deletion or inaccessible, and identity switching. It cannot simply use a pre-committed single repository fixture. All refresh/batch operation tests also check independent module inputs and clicks whether they can be executed when tasks are not completed, visible DOM scale, event loop interval, cancellation and stale cleanup; the existence of async functions or the final result being correct does not mean it is not blocking. Pressure must include representative large input and real host, record maximum/P95 response delay, hardware/scaling and observation window; first reproduce old version failures before judging fixes. Stubs are used for controlled contention, real repositories for functionality/scale, and both are recorded separately.

2026-09-22 R006.10 Supplement: Terminal regression covers normal line breaks and ConPTY's CSI S prompt scrolling, cannot use 200 line outputs to pass alternative continuous empty carriage returns. Retain upstream failure comparison, capacity boundary/saving cursor/alternative screen/local area validated at 20/100/1000 levels, native screenshot window needs to adapt to actual screen. Win10 classification evidence is seen in [This Round Record](../enhancements/tests/evidence/terminal_scrollbar_win10_20260922.json).

Same round check environment experience: TEMP uses full path, avoid Git returning normalized long path and 8.3 short path comparison false positives; CMD long path may fold input echo line breaks, transmission test checks independent actual output lines, not relying on complete command repetition.

<a id="section_2ef91d0f1e8b"></a>
## R070.4 Remote main workbench and candidate identity

Remote acceptance must start from the main 'Open Folder' to access the Explorer, then operate the remote directory through the main file service, search, SCM/Graph and terminal operations; independent SSH read/write or bypassing the source code tab cannot substitute. Original host covers Markdown real-time rendering and remote byte readback, images, Chinese links/anchors/navigation, renaming and save as, external conflicts and disconnection drafts. Terminal uses an independent channel for real readback, resource providers use 20/100/1000 tiers to verify name identity, use controllable stale requests for verification, and store real passwords using system DPAPI rather than a substitute. Only browse save warnings should be postponed as per user request, format matrix can only explain non-reproduction.

Build, prepare private host, execute, read checks each phase must be confirmed separately. PowerShell startup build non-zero exit code must abort, not continue using old dist because subsequent commands are successful; native copy's tested script summary must equal the candidate just built. File occupation causing build failure must retain records, results from old assets cannot be used for new source code acceptance. Native runner exit code only indicates completion, and must also check checks.json's PASS and assertion count. Old independent remote tab use cases are replaced by TC-remote-workspace-native, historical evidence is still retained.

<a id="section_866ec7356228"></a>
## R071.2 Git streaming and multi-file acceptance

Git transmission changes must verify byte contract (UTF-8 BOM, cross-block Chinese, NUL, rename double path), and regression real selected staging; cannot only be ASCII state simulation. Scale separately measure real Git index/file system output and model projection: exceeding old output limit, batch path stdin, read-only cancel/timeout/non-zero exit and write command output limit. Git disk time unrelated to UI should not be considered as main thread bottleneck; simultaneously record heartbeat and interface input, list last item, DOM and repeated refresh. Performance measurement should avoid parallel with other high load tests.

Program discovery test distinguishes missing, existing but non-executable and installed available; only missing requires installation, real existing Git cannot be uninstalled for acceptance. Installation process can use port substitute to verify routing, but must explicitly state no real system installation. Final host and installation candidate are associated with list summary, do not use previous candidate as final asset.

<a id="section_1e5ea3eac22b"></a>
## R071.3 Reading performance acceptance

Normal scroll regression covers document content, floating/search preview, background rendering/source code comparison and idle. Fixed document 20/100/1000 sections, distinguish first screen indexing, scroll reuse and layout failure; use old release assets in the same scenario for comparison. Callback statistics are aggregated by source, layout read count and time are separately recorded, cannot treat hardware/private desktop frame rate as product frame rate. High load tests should not be parallel with final performance sampling. True theme updates, total high internal reflow, character anchor point scaling, and cleanup after closing must pass, cannot exchange speed for wrong cache. Failed samples are retained; projects that failed in old versions must be re-examined for root cause, not directly ignored or claimed as new regression passed.

<a id="section_901c011946dc"></a>
## Test temporary payload recovery (R077, 2026-09-25)

2026-09-27 code fence native wheel acceptance: private desktop runner can receive `native_input_request.json` wheel request, according to current process, window title and private desktop location host, convert viewport coordinates and send Windows mouse wheel message, and write same ID confirmation; do not move user mouse, do not activate real desktop window. Fixture must confirm separately that Chromium receives `isTrusted` event and actual content change, successful delivery is not functional pass. This method verifies the routing of system messages to host events, does not represent physical device, cross-device or screen frame rate guarantee. First line trimming case prohibits manual call of CodeMirror.refresh/focus before assertion to avoid hiding after click self-healing; 20 times geometric repetition and trusted wheel sequence are separately counted, sampling only after window size confirmation.

Native host, isolated installation, and unified check runner usage [test product lifecycle](test_artifacts.en.md) ownership marking and final cleanup; success, failure, and timeout all recycle large payloads, logs, results, and screenshots are retained. Cross-restart phases are held by the outer layer, finally ending; abnormal exit only recovers expired and registered process test directories. Do not include user real backup or unmarked directories into automatic cleanup. New test reuse existing runners, do not directly accumulate host copies in the system TEMP long-term.
