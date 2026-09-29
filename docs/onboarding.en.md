[Chinese](onboarding.md)

<a id="section_c74b2ecd1c87"></a>
# Operation Guidance Design

<a id="section_664255b62ea1"></a>
## R081 Post-Installation Guidance (2026-09-27)

Users need to understand the location of new features, the preview tab, and changes in keyboard shortcuts. After each successful installation (including reinstallation of the same version), the next time Typora starts, a guidance window that is ready and visible in the foreground automatically displays the guidance; regular restarts do not repeat. The Help menu retains all native items, adding "Operation Guidance..." and "Operation Instructions and Keyboard Shortcuts...".

The guidance uses a previous step, next step, skip, and complete function bar to teach: top bar, activity bar/Explorer, tab, document content, search, Git, terminal, settings, and help. The target is visually positioned; closed panels point to their entry, without starting the terminal, switching files, executing Git, or modifying the user's workspace. When the target is not visible, provide clear explanations and use a centered card. Esc, close, and skip can exit and restore the original focus. The document opens in a new window, not replacing unsaved document content.

The preview tab and zoom feature provide a "Operation Illustration" lightweight animation, which supports pause, respects prefers-reduced-motion; does not download videos or generate large temporary images. Other operations are explained in the user_guide.md provided with the installation package.

<a id="section_561f83e9bff2"></a>
## Owner and Installation Transactions

Standard Windows/Portable Installer writes to typora_code/installation.json (schema, install_id, sequence) after verification is successful, and is included in the same backup rollback transaction. Failure recovery restores the original identifier; each successful reinstallation generates a new identifier. The identifier is not part of the release resource summary. Uninstallation recovery/rollback uses the public entry, without adding a second deployment.

Workbench Guidance Service has commands and automatic triggers; the status service saves only the last installation identifier in the user data settings/onboarding_state.json. Fixed short lock files prevent multiple windows from consuming simultaneously; after process exit, the lock can be recycled. It does not stack records by version. Only starts by reading the matching installation identifier of the loaded release sequence. Running old windows do not consume the new version just installed. The guidance is displayed only when the workbench is ready, native files are loaded, and there are no other modal windows. When closed, it releases the listener/observer/animation/popover. Status write failure only prompts, not blocking the workbench. Missing/invalid installation identifiers do not automatically pop up, but the manual help is still available.

UI Reuse of workspace_dialog, common buttons, focus/exit stack and static styles. Independent guidance view only has steps and target rectangles. Merge one frame positioning according to resize/scroll/target size changes, without continuous global redrawing. The target is non-interactive, and the tutorial does not convert underlying clicks into business operations.

<a id="section_205275f88cc7"></a>
## Source Code Reference and Selection

Fixed VS Code 6807068's src/vs/workbench/contrib/onboarding/browser/media/spotlight.css and spotlight/spotlightOverlay.ts: adopt spotlight outline, 320px card, 16px content spacing, 8px operation spacing, 1.4 line height, viewport internal positioning, and reduce animation conventions. Since Typora is an editable document host, it reuses existing modal focus and exit mechanisms, covering the current window rather than the upstream command-driven steps. The target positioning also retains a safety margin, narrow-screen cards can scroll; do not change the document, icons, or native menu styles.

<a id="section_0480f2cadf49"></a>
## Acceptance and Boundaries

Status testing covers new installation, same version reinstallation, read, multi-window competition, expired lock, failed rollback, and different loading sequence numbers. UI validation checks actual help entry, forward/backward/skip/complete, Esc/Tab/focus recovery, all visible areas of steps, target missing, zoom, light/dark, narrow window, and reduced animation, and no residual after destruction. Native host validation checks automatic display upon readiness and manual recheck. Installation candidates must pass installation→check→two types of uninstallation→reinstallation and uninstallation failure cases, and local read-only uninstallation pre-check before installation; do not close user windows. Keep boundaries when cross-platform has not been tested, do not claim native coverage with Electron stand-in.

<a id="section_5ecd9b90e317"></a>
## Current Delivery Verification

2026-09-27 candidate 2026.09.27.7: See [current evidence](../enhancements/tests/evidence/onboarding_20260927.json). The initial whitelist omission has been fixed and reverified; complete transactions, states, and functional interfaces have passed with the original host. The machine has been installed, but the user window has not yet been restarted. Native support for Linux/macOS, physical input, and assistive technologies is retained for real machine acceptance.
