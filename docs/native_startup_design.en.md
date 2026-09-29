[Chinese](native_startup_design.md)

<a id="section_015554e7146d"></a>
# R056 Directly launch the workbench and host upgrade integration

On September 20, 2026, users require the workbench to be directly displayed after configuration, retaining the native Typora icon and existing UI layout; community plugins are integrated after the workbench is displayed. Typora continues to provide the editing kernel, document saving, window, and official updates. The current implementation combines the head entry, explicit single-time mounting, and complete initial frame display into a single launch chain. The normal path no longer shows the native intermediate layout or the 'loading workbench...' prompt.

<a id="section_35f2043cdace"></a>
## Goals, Scope, and Trade-offs

"Direct launch" refers to the workbench having an interface presentation, with the original editing node and host kernel continuing to load; no separate Markdown editor is created, and the existing layout, settings, and default operations are not changed. Workspace switching only replaces the business context and cannot rebuild the window workbench; third-party plugins are not considered as a base UI dependency.

The previous version's static template takeover was a research plan, and this version replaces it with the user's subsequent "UI priority, layout unchanged" constraint: the head stage only has require, there is no reqnode, _options, and already connected native editing node. Continuing to copy the static template would maintain a second layout and configuration handover, so the original DOM factory and unique Settings service are continued, with only one explicit mounting. There is no implementation or claim of a second static template; the preparation stage is still time-consuming, and no zero-delay first frame is promised.

<a id="section_3241ce49dc4b"></a>
## Launch Order and Status Owner

1. The standard installer connects the static CSS and two persistent scripts to the current host window.html's head, directly uses the original Typora.exe icon for the entry, without community loader or independent launcher.
2. Core Waiting Has Already Verified File, reqnode, _options, editor, Native writingArea/sidebar and style readiness, created by App services. Settings are only owned by the existing Settings/ConfigRepository, not copied to the second set of localStorage or JSON.
3. Workspace.mount synchronously mounts the root layout, sidebar, and original components in order, then publishes core.ready. Removes three dispersed construction timer tasks, enhances the layer waiting for the same ready, cancels the repeated settings/root polling. The native editing node is not deleted or replaced; repeated mount/start idempotency.
4. Basic Enhancement Registration Git, browser, top bar, and current workspace, publishes browser ready. Git results, search data, and syntax loading do not block the basic layout presentation; plugin management loads enabled plugins after two animation frames, without running the second core.
5. First Display Control Only takes effect before the above ready: old document content/sidebar, workbench root, own top bar menu and bottom bar are not visible, to avoid the core tab appearing first and then being enhanced. There is no loading prompt overlay, the native window controls remain available. After ready is released, the observer immediately ends; switching libraries, switching panels, and plugin loading cannot block again.

15-second timeout or initialization error will release the display control, revert to operable native interface and report errors, not lock the user in a blank window. Resource in enhancement initialization is rolled back by existing lifetime; file drafts and ongoing writing operations continue to follow the close protection. Only errors are displayed with the native interface, and normal launch path is separately verified.

<a id="section_8c9d4ca45b5e"></a>
## Module Mapping and Impact

| Responsibility | Authoritative Implementation | Impact and Regression |
| --- | --- | --- |
| Host Entry and One-time Display | enhancements/runtime_head.html、src/workspace_entry.css | Original Window Controls, Error/Timeout, Subsequent Switching, Light/Dark Theme |
| Unique Mounting and Ready | vendor/workspace_core/src/runtime.ts、ui/workspace.ts、ui/layout/workspace-root.ts、ui/sidebar/sidebar.ts | Same root/edit node, 20/100/1000 repeated initialization does not increase nodes |
| Basic UI and Plugin Order | src/typora_enhancements.ts、src/workspace_bootstrap.ts、src/community_plugins.ts | Native File Session Recovery, Git/Search/Terminal, Real Community Plugins |
| Upgrade After Integration | scripts/lib/typora_workspace.ps1 and Python Equivalent Tasks | Based on the new host backup and installation, no write-back of the old kernel; retain plugin personal data |

<a id="section_f0e6be57ec2a"></a>
## Typora update and enhancement reintegration

The user has explicitly adopted the same approach as the community: After Typora is updated through official channels, this project's standard installation and checks are rerun, and the document is saved manually and restarted normally; the native icon remains unchanged. Automatic repair, background services, and independent launcher are not part of the requirements. R047 still manages the ZIP update and announcement of its own enhancements; community plugin updates do not override the core of this project.

Installation first parses the current host and user directory to obtain standard mutual exclusion, verifies the entry anchor point and candidate assets; backs up the upgraded page, then generates the enhanced entry. Retain the new script, resources, and kernel, do not overwrite the old backup window.html or ASAR back to it. On failure, roll back to the new host before this reinstallation, retain the log for permission errors, do not silently elevate privileges or repeatedly overwrite. Community packages, enabled configurations, personal settings and documents are retained.

The standard Windows transaction has been simulated to re-install and recover after the official coverage entry is reinstalled. It proves that the new page, kernel, and community data are retained. Actual official online updates and other host versions have not been tested, so it cannot be claimed that any version is compatible just because the head is found. The old backup recovery still refuses to overwrite the already changed host page.

<a id="section_5b2bbde18c5f"></a>
### Community plugin verification results

On September 20, 2026, the source commit of 2.10.15 from this project is verified `d3fccbd3b8e134dd4268f5486fd17e49fc0ed615`, and the upstream main commit at that time is obtained through the GitHub submit API `601a1dcbaf905b7b7a40229f7109f0411d71671c`. The latest installation, loading, and framework update paths are as follows:

| Source | The actual behavior verified | Conclusion on this requirement |
| --- | --- | --- |
| [Windows Installer](https://github.com/typora-community-plugin/typora-community-plugin/blob/601a1dcbaf905b7b7a40229f7109f0411d71671c/packages/installer/templates/windows/install.ps1) | Modify window.html, insert a module script pointing to the user directory loader.js | The original icon can start plugins; the installation integration still depends on the modified host page |
| [Community Loader](https://github.com/typora-community-plugin/typora-community-plugin/blob/601a1dcbaf905b7b7a40229f7109f0411d71671c/packages/loader/index.ts) | Read loader.json and plugin environment, dynamically import the specified version core.js | After the entry is deleted, the loader will not execute; this path has no official update completed re-injection |
| [About Page Update Implementation](https://github.com/typora-community-plugin/typora-community-plugin/blob/601a1dcbaf905b7b7a40229f7109f0411d71671c/packages/core/src/ui/settings/tabs/about-tab.ts) | updateCore queries the community repository release; installCore unpacks and moves the files to the parent directory of the community core | "Core update" refers to the community framework update, not the Typora official kernel update or reinstallation of the host entry |
| [obgnail project maintainer's upgrade response](https://github.com/obgnail/typora_plugin/issues/1039) | On 2025-07-23, it is explicitly required that Typora be upgraded and then its installer be rerun | Another commonly used framework cannot be assumed to continue based on the 'plugin' identity after an official upgrade |

The conclusion is limited to the above version and path checks: no official update injection mechanism has been found that can be directly reused. The user has confirmed the same approach: after an official update, rerun the existing standard enhancement installer, continue using the native icon. Automatic fixes and standalone launchers are not part of the requirements or unfinished sub-items; plugin updates and host updates remain separate.

The original Typora 1.14.10 isolated copy also checked the head timeline: at this time, `window.require` already exists, `reqnode` and `_options` have not been defined, so it is not possible to directly move community loaders that depend on them to head and claim they can run ahead of time. The current 45 startup items / 20 panel switches have passed, which is the current baseline check, not a new startup architecture acceptance.

<a id="section_5e82dcdbde73"></a>
## Acceptance criteria and boundaries

TC-startup-presentation verifies that no prompts appear during loading for both light and dark themes, the root does not appear prematurely, window controls are available, and nodes are not replaced after ready/error/time-out, and subsequent library switches do not obscure. New assertions are first reproduced failed in old versions, then pass the candidates.

TC-startup-native starts recording rAF status from the original Typora isolated copy head, checks that the first visible root and document content are used until now, without old document content or half-finished workbench; 20/100/1000 repeated mounts maintain identity/quantity, 20 panel switches do not first collapse. TC-workspace-sessions-native verifies real normal exit/second process restart; TC-community-plugins-native verifies real community distribution package start/stop without rebuilding UI. TC-delivery-002 verifies standard reinstallation simulation after official coverage; test classification and requirement association are uniformly maintained in the test directory.

Record the stage duration and long tasks, do not consider reducing intermediate views as all startup performance issues have disappeared. PERF-startup-002's residual long tasks continue to be independently recorded; isolated desktop DOM/rAF sampling and static screenshots are not physical screen startup recordings. Current delivery evidence is seen in [feedback review](feedback_review.en.md), historical stage records do not replace this acceptance.
