[Chinese](startup_stability.md)

<a id="section_28842608b2df"></a>
# R054 Startup and Function Zone Switching Stability

2026-09-20: Users reported that during startup, Typora's original style was displayed first before switching to the workbench, and there were issues with the function zone switching, including flickering, overlapping, and lagging. The goal is to verify the entire process and fix any confirmed call errors. It is not acceptable to use final screenshots as evidence of the process.

On the same day, subsequent requirements were to directly load the workbench, and after the official update host, re-engage the enhancement. This will be separately handled by [R056 Architecture Design](native_startup_design.en.md). The initial demonstration control in this article is still the current implementation, which does not mean that the native startup template and layout node takeover has been completed; existing verification cannot be used to claim that R056 has been delivered.

<a id="section_a823e4d485e6"></a>
## Scope, Determination, and Responsibilities

- The scope for this round includes startup, switching of the resource manager / outline / search / source code management, and the closing and reopening of the sidebar; existing file protection, workspace recovery, and theme functions must be restored, and the layout should not be expanded.
- Normal: When the host is not yet available, retain window control and clearly define the startup status; asynchronously load data within the same panel, and update the content after completion. The time taken for file recovery and Git scanning should be separately counted.
- Defect: During startup, the old layout is displayed first before being replaced as a whole; when the visible sidebar switches panels, it is first collapsed and then expanded; both old and new panels are displayed at the same time; late callback restores the old state; repeated listening, node growth, and long tasks in the main thread. Single-time duration cannot directly lead to algorithm errors; it must record the stage, input scale, and call reason.
- Entry and static head are responsible for the initial demonstration timing; the core Sidebar is responsible for the visibility of the panel and the host sidebar; business modules are only responsible for their own data and cancellation; syntax initialization should not become an irrelevant prerequisite for the file management interface.

<a id="section_4055862901d1"></a>
## Implementation Plan and Failed Behavior

First collect rAF, layout state, and Long Tasks using the original host isolate copy in the head phase, then decide the first display boundary. Do not modify ASAR, do not hide the document content to fake loading speed, and do not add fixed wait or transition animation. If it is necessary to delay the display of the workspace, clearly annotate the startup status, retain the ability to close the window, and restore native operations upon initialization failure or timeout, avoiding permanent blankness.

Before switching, parse the valid target; different panels only transfer content ownership, already open host sidebars are not closed. Repeated show does not repeat mounting and execution of onshow, the same activity button retains the collapse semantics; invalid targets remain in the original panel. Real internal outline nodes maintain connections. Independent highlighting initialization continues after interface mounting, and cancellation and errors are uniformly handled by the persistent entry.

<a id="section_f1fab486cc5f"></a>
## Layered testing and evidence

Original host baseline has been reproduced: when head sampling is 253.7ms, the original document content is visible, and the workbench title appears at 681.9ms; 20 switches trigger 20 host hideSidebar. The first display uses an independent readiness flag inside the head: content area is released only when the browser orchestration is ready; window buttons are always retained, clearly displaying 'Loading workbench...'. The upper limit continues to use the 15-second core initialization, and recovery is restored upon failure. This upper limit is for fault recovery, not for normal startup waiting. It resolves layout replacement exposure, but does not indicate that the startup calculation itself has been eliminated.

Loading prompts continue to use the 13px/1.4 font of existing startup error prompts, 16px padding for file notifications, and the finalized 35px top bar boundary; colors are read from the current theme variables. There is no new VS Code layout value here, and neither the document content nor the window scaling is changed. The bright and dark fixtures separately verify the readiness, failure, and timeout states.

Phase measurement further confirms a 73ms long task series connecting Git registration (33.1ms) and browser registration (33.8ms). The event loop is returned once between these two independent registration phases and the cancellation generation is checked to avoid continuous execution of divisible tasks; no fixed waiting time or animation is added. Asynchronous syntax consumption time is not the main thread blocking duration, and is recorded separately. The Performance marker only retains the three stages of the latest initialization, avoiding cumulative overload.

| Level | Implementation testing | Pressure / performance |
| --- | --- | --- |
| Unit | Core real Sidebar, target verification, visibility call order, repeated show, close and reopen | 20/100/1000 times switching, call numbers are linear and content is single |
| Function | Electron real orchestration, delayed syntax initialization, cancellation, and restart; static style first frame and failure recovery | Frame-by-frame checking rather than fixed sleep after screenshot, record phase duration |
| system | Original Typora 1.14.10 isolated installation, head sampled in advance, real commands and native sidebar | Default 20 rounds of cross-panel switching, record long tasks, percentile duration, document content hash and panel count; 100/1000 left for low-cost layer |

Timeline samples saved to ignored runtime directory, formal report retains candidate summary, environment, test case and result. Invisible private desktop's PrintWindow may return old image, do not consider it as evidence of the first synthesized frame; rAF/DOM state is not equivalent to display video. Tasks taking more than 50ms are recorded for attribution, do not use a lenient global timeout to pass performance. Scenarios that cannot be reproduced in the current environment retain unresolved items.

Revalidation in `enhancements/`:

```sh
npm run test:quality -- --id TC-sidebar-transitions
npm run test:quality -- --id TC-sidebar-stress --tier 1000
npm run test:quality -- --id TC-startup-presentation
npm run check:ui -- test_workspace_startup.cjs
npm run test:quality -- --id TC-startup-native
```

Native test cases first set `TYPORA_NATIVE_TEST_ROOT` as the verified host installation directory. The 20 and 100 tiers can replace the tier in pressure commands; separate execution of native tests for measurement, not competing with the full check for resources. Native fixtures start new processes from copied host, end only close the test copy; production window is manually restarted by the user after saving.

<a id="section_83c9255731e5"></a>
## R056 complete first frame replaces loading prompt

2026-09-20, final solution see [Direct startup design](native_startup_design.en.md). Remove body loading prompt; first frame control range completes the already pre-created workbench root and own top bar menu, until the basic UI is ready, the first display is shown. Continue to use original DOM factory and settings service, do not build a static skeleton separately; failure rollback and window buttons are retained, subsequent library switch does not re-shade. The loading prompt on this page belongs to the R054 historical scheme, already replaced by this section; residual performance issues are still tracked independently.
