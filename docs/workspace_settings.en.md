[Chinese](workspace_settings.md)

<a id="section_5d98c64e217c"></a>
# R072 Three-level Settings and Unified Custom Configuration

2026-09-29 R014.3: Appearance → Restore appearance defaults follows the [appearance restoration contract](workspace_zoom.en.md#appearance-persistence). Other settings retain their per-field reset controls.

2026-09-22 User Request: Typora Native, Community Plugins, and TyporaCode Custom Features are divided into three layers; Custom Features are managed in one layer uniformly, and cannot be maintained in multiple configuration entry points with inconsistent copies.

<a id="section_e55b79a57ee9"></a>
## Interaction and Ownership

Compare with the VS Code Settings Editor's search, classification, configuration values, and reset default interaction, open the settings in a unique floating window according to R072.2; the background Resource Manager does not occupy the width of the settings content, and after closing, it returns to the original workbench. The settings page only displays the custom classification, and the native preferences and community settings are directly opened from the classification area. The Typora Native layer calls the already verified host preference interface; the Community Plugin layer retains the original plugin SettingTab and persistence, without converting plugin fields or injecting default values from this project. The TyporaCode layer centrally displays the existing function configurations, including the editor, Resource Manager/Save, breadcrumbs, top bar, diff editor, terminal, Git, and SSH.

Custom configurations use a unified registry to describe classification, default values, scope, fields, and read/write interfaces. The registry does not store a second set of configurations; each domain service still has validation, persistence, and subscription for activation. Switching settings classification does not create a second set of services; old shortcut entry points and unified page call the same save interface. Git is by repository, language service is by workspace, and general display is by user scope, with the interface displaying the actual target; when the target is switched, the old form cannot be applied to the new directory.

Search simultaneously matches Chinese titles and configuration keys; after modification, the configuration is effective only if it passes existing validation, and if it fails, the input is retained and the reason is displayed. Individual reset only affects the item and does not override other configurations. Complex objects use explicit JSON input and validation; password and private key content are not stored as editable JSON; SSH port, key, proxy, and host trust continue to be managed by OpenSSH configuration.

<a id="section_9013f9823403"></a>
## Acceptance

Validate three types of entry points, search, modification/reset, consistency of old entry points, bad values and persistence failure, protection of old targets when switching directories, registration/unregistration and cleanup when closing and reopening; default/moonlight/narrow editing group/keyboard. The actual native preferences and plugin SettingTab are independently validated and cannot be taken as native settings page acceptance by simulating API calls. Construction and installation/uninstallation are executed according to unified delivery requirements.

Historical status: 2026.09.22.10 build, UI/native and installation/uninstallation verification passed, already installed locally; user window has not restarted. Complete SSH workspace behavior is still tracked by R070; the unified settings page does not represent all remote capabilities have been realized.

<a id="section_996b43350dde"></a>
## Upstream Basis and Adaptation Dimensions

- Official [Settings Documentation](https://code.visualstudio.com/docs/configure/settings): Classification, search, immediate save, individual reset, and user/workspace boundary.
- Fixed Commit `645f29cc3176500b4b5762ba887cf2a7f0ffdf2c`'s `src/vs/workbench/contrib/preferences/browser/media/settingsEditor2.css`: Maximum content width 1400px, content horizontal 24px, first-level group title 26px, tag 13px with 7px/6.5px vertical and 8px horizontal padding, dropdown 26px with 2px/6px padding. This page uses these base values, narrow group and three types of all owner entry use existing editing group layout, and do not claim that all dimensions/functionality have pixel equivalence.
- Current custom layer has already integrated the editor, Resource Manager/Save, top bar, breadcrumbs, differences, language service, terminal, Git, and SSH configurations. Complex JSON continues to use original validation; no false switches have been added for functions that have not been implemented. Old shortcut configuration entry points are retained and shared by all owners, and no destructive storage migration is executed.

Evidence of delivery see [this verification](../enhancements/tests/evidence/settings_ssh_20260922.json). This round does not rewrite native preferences/plugin fields; the settings page provides an actual owner entry, and existing individual configurations still share the business storage.

<a id="section_8f5f08a42187"></a>
## R072.1 User correction: isolate the owner, do not copy navigation (2026-09-22)

This section replaces the previous "three types of top tabs" design. The gear menu only provides one settings entry and extension management, no longer repeating the native/community/self three menus; the self-owned settings page organizes according to VS Code search and classification, and native preferences and community settings are directly opened from explicit entries in the classification, without providing only a button to jump to an empty page. The self-owned UI cannot inherit Markdown title styles; the plugin SettingTab must not be placed in a workbench dialog content area that would rewrite input, title, and button. Download the official community release package in an independent host to compare its real settings structure, style, and storage, and maintain the adaptation boundary; native and third-party configurations are still saved by their respective owners.

The settings gear uses the fixed VS Code Codicons `settings-gear` for this round, covering the previous agreement to retain the fa-cog shape; the activity bar slot remains unchanged. Ctrl+, uniformly enters the self-owned settings, and the File menu's Typora preferences entry retains the original command.

Community configuration container corresponds to the official 2.10.23's `settings-modal.scss`, `_sidebar-nav.scss`, and `modal.scss`: 90vw×85vh, .875rem font size, 1rem outer and inner padding, 10rem classification, and .75rem classification font size. Only adapt the mount/share exit stack and the close button in the upper right; the original SettingTab node does not regenerate, and the field style does not inherit the workbench `.git-graph-dialog` or unified interaction layer.

R072.1 Delivery evidence: [Isolation and dual machine merge verification](../enhancements/tests/evidence/settings_isolation_merge_20260922.json).

<a id="section_4937cef31460"></a>
## R072.2 Floating settings window (2026-09-22)

User's latest screenshot specifies VS Code Modal Editor, replacing the previous native settings as a regular editor tab. Configuration still undergoes reading and writing through the same registry and domain services; the gear and Ctrl+, reuse the unique floating window, and the resource manager remains in its original state without participating in the settings width. The top right provides maximize/reduce and close, with Esc closing and restoring focus before entering; native preferences and community SettingTab continue to be independent. It is not allowed to achieve this through hiding the file tree, rebuilding the editor group, or rewriting the main content.

Baseline: Fixed VS Code 1.137.0(645f29cc) modalEditorPart.ts: default maximum 1400×900, minimum 400×300, maximize margin 16px, header 33px. Continue to use the common dialog exit stack/focus protection, and the native settings have their own layout without covering third-party popups. Acceptance includes short windows, narrow windows, scaling, default/maximized, repeated entries, focus loss and configuration failure; it does not claim to transplant all VS Code Modal Editor drag and window migration capabilities.

<a id="section_1f6d46779299"></a>
## R072.3 Host original settings page on the right

2026-09-23 User explicitly: After clicking the community settings in the classification area, the page is blocked behind the unified settings; Typora preferences and community configurations should both be displayed in the right content area. This section replaces the 'directly open a new page' presentation convention in R072.1/R072.2, while still maintaining the independence of the three types of configurations' owners.

Keep the unified window with search, left-side categories, maximize, and close. When the native or community category is selected, the right side displays the real page of the owner. When the self category is selected, it returns to the original form. The community uses the real SettingTab node, show/hide/load/unload and persistence still belong to the community adapter; no mapping form is generated. Typora uses verified `ClientCommand.showPreferencePanel`, `File.megaMenu.closePreferencePanel` and existing `#uni-preference-panel` native webview, does not clone, destroy or rebuild the native configuration page.

External pages are confined to a shared geometry host on the right rectangle and remain as independent nodes outside the workbench form CSS; The area is registered to the unified popup's internal hit and focus range to avoid being judged as a point to the mask. When switching, closing, or window destruction occurs, the geometry observer and temporary properties are released, and the native node restores its original position rules; Community display is removed without unloading plugins. Native page's own closing returns to its own settings. When plugins are disabled or uninstalled, their active SettingTab is cleared but the available list is retained, without leaving behind any popups. When the plugin market is opened, exit the settings window first before displaying the real management page.

The native interface follows the preferences implementation in the original Typora 1.14.10 `resources/appsrc/window/frame.js`: create a webview on first use, then call reloadData on subsequent uses; closing restores the temporary sidebar state and removes show-preference-panel. Geometry follows the window and right-hand layout of the VS Code Modal Editor pinned for R072.2. Community settings retain the verified official 2.10.23 styling. This change affects only the hosting area: it neither applies our form styles to plugin controls nor changes native preference fields.

Load unavailable display with explicit reason, but still allow switching back to other categories; quick switching cannot make stale pages reappear. Acceptance includes real click hits, Tab/Esc and close, default/maximized/narrow width/zoom, 20 switch cleanups, actual community settings edit save reopen, native webview rendering and independent entry recovery, and verify document content and configuration are not affected by unrelated changes.

Native exit will asynchronously restore document focus; unified settings retain modal windows, and do not consider the host losing focus as user closing. Still use the top-right close, Esc, and mask operations to exit. 2026-09-23 current build, 271 assertion, 210 native check and same candidate installation/uninstallation passed, details see [Delivery Evidence](../enhancements/tests/evidence/settings_owner_20260923.json).

<a id="section_63f448cd84e2"></a>
## Network configuration (R047.7)

Ordinary users do not need to configure, default use runtime trust chain; when there is no environment proxy, directly connect to the network. Enterprise users select `.pem/.crt/.cer` CA file in the 'Network' category of unified settings; keep default proxy mode if only CA is needed. When specifying a proxy, separately fill in 'HTTP request proxy' and 'HTTPS request proxy', and set proxy mode to `manual` (at least one is non-empty); `direct` force direct connection, `environment` use environment proxy. In manual mode, if an item is left blank, the protocol will directly connect, not borrow from the other. Both addresses support `http://` or `https://` proxy endpoints. Old single proxy automatically fills in both, and then can be modified independently. After configuration changes, new requests take effect, clear CA to restore default trust, without deleting certificate files.

Applies to update checks, update ZIPs, and community plugin downloads. System proxy/PAC will not be automatically imported; Git/SSH are managed by their respective configurations; certificate validation is always enabled. Proxy address does not accept embedded passwords. Complete responsibilities, cancellation, and failure rules are see [Configure by target protocol](workspace_update.en.md#section_c86c7b066eb3).


<a id="settings-button-boundary"></a>
## R072.4 Settings button boundaries and scope correction (2026-09-30)

The user requested clearer dark-theme buttons in settings content and identified unwanted borders in Explorer and the settings category navigation. This section supersedes the workbench-wide scope of R020.2. Idle outlines belong only to action buttons in the owned right-hand settings content. Categories, window controls, Explorer and other panels retain their previous presentation. Native preferences and community pages retain their original owners. No configuration or functionality is added.

Remove the global idle outline from workspace_interaction.css and scope the same 1px inset outline and #707070 color in workspace_settings_view.css to workspace-settings-body beneath a registered settings root. Sources remain pinned VS Code68070681e87284e2f22728f15fe3f3651fbf932b button.css (1px and 4px) and 2026-dark.json checkbox.border (#707070). The stronger color is a settings adaptation, not the upstream ordinary-button default. Zero-specificity scope and exclusion of focus-visible retain shared focus priority. Existing owners retain radius, hover, disabled/selected state and commands. No duplicate hover rules or geometry changes. Dynamic controls inherit the scope; light mode and disposal restore the prior style, while third-party none boundaries remain excluded.

Field reads, save failures, picker cancellation and close/focus behavior remain unchanged. Validation must reproduce leakage with the old global rule and cover settings actions, categories, actual Explorer controls, window controls, primary and dynamic buttons. Check three dark themes, light switching, zoom, narrow layouts, idle painting, keyboard focus, disabled state and disposal. Native production assets, isolated install/uninstall and local delivery require separate current evidence. Earlier R020.2 results do not validate this corrected scope.

Current delivery and limits: [validation evidence](../enhancements/tests/evidence/settings_button_scope_20260930.json).


<a id="native-preferences-theme"></a>
## R072.5 Native preferences follow the theme (2026-10-01)

The screenshot shows a dark workbench but a white native preferences content surface with light text. Original Typora1.14.10 source and an isolated host confirm that megaMenu.applyTheme already invokes setThemeForNode and setIsDarkMode in the preferences page. Initial loading uses current-theme.css; later changes select the actual theme file. No new adapter, persisted preference, replacement skin or ASAR change is needed.

The shared cpp_github-consolas.css still forces #fafafa onto .ty-preferences .window-content and white text/#999 onto its selected navigation item. Both dark themes import this shared file, overriding the correctly loaded dark theme. Remove these two preferences-specific overrides. Native Preferences CSS already uses transparent pane/window/sidebar surfaces and --bg-color on html; electron.css owns navigation selection through the active-file theme variables. These native rules are not copied into the workbench.

Native fields, saving, cancellation, geometry, focus and community pages retain their owners. Standalone and hosted preferences use the same real webview and existing native theme updates. This does not propagate every custom workbench color into preferences. If a future host removes these capabilities, preserve its presentation and reverify instead of injecting a replacement skin.

Sources: Typora1.14.10 appsrc/window/frame.js megaMenu.applyTheme/showPreferencePanel; page-dist/setting.html setThemeForNode/setIsDarkMode; Preferences.962926a4.e68254cc.css pane/window/sidebar and html backgrounds; page-dist/electron.css selected navigation variables. Root-only color checks miss descendant overrides, so validation must inspect actual window-content, panes, navigation and text painting.

Reproduce #fafafa content under the old dark theme, then verify VSCode2026_Dark, CppGithubConsoles_Dark, Night and light themes, standalone/hosted entry points, initial open, switching, reopening, zoom and screenshots. Confirm no injected style, retained fields/documents and working native APIs. Record isolated restore/detach uninstall cycles, read-only local preflight and installation separately; preserve untested-platform and running-window limits.

Current five-theme, standalone/hosted, actual-surface, Image-category and zoom validation passed. Installation and remaining limits are recorded in [validation evidence](../enhancements/tests/evidence/native_preferences_theme_20261001.json).
