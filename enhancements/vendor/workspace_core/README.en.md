[Chinese](README.md)

<a id="section_1184e7a8c14a"></a>
# Typora Code persistent workbench core

Derives from the MIT-licensed Typora Community Plugin 2.10.15. Source identity is seen in SOURCE.json, permissions are in LICENSE.md; src retains independent buildable closure and type dependency closure. Original upstream identifier is retained for traceability.

This derived version removes plugin management, plugin market, plugin settings menu, internal workspace enable switch, directory-level configuration toggle and reload. The workbench service is established once when the window starts, and switching between ordinary folders only sends mount events. Configuration is fixed and saved in the user data directory typora_code/settings/workspace.json, formatted as {version:1, settings: { ... }}.

Build: node enhancements/scripts/build_workspace_core.mjs. It can be imported as build_workspace_core({outdir}), and importing itself does not run. The output includes workspace_core.js, workspace_core.css, locales/lang.en.json, locales/lang.zh-cn.json, locales/lang.de.json. Static core CSS is loaded first, then product CSS; both link tags use data-typora-code-style. Scripts synchronously provide Symbol.for('typora-code:workspace') under the ready Promise, and the host and style preparation are completed to establish the app, and the ready is completed when the root layout and sidebar are available.

Actual exports: app, WorkspaceView, SidebarPanel, Notice, Component, Events; app.runtime_version is 2.10.15-typora-code.1. app.load is only sent once. Statistics, commands, Markdown, layout, sidebar and folder events maintain the implementation from the fixed upstream. Production uses host jQuery/reqnode; testing uses independent Electron and jQuery to reproduce the host contract, and the test mock is not used for production.

Verification: check_workspace_core.mjs checks the output and the path of the retired plugin; test_workspace_core_smoke.cjs executes the real generation bundle, checks the start, global configuration writing, the app/root instance remains when the directory is switched, does not create directory-level configuration and does not send load again when start is repeated. It does not replace the real Typora document editing and full function regression.

Audit boundary: The entry point has removed the plugin manager and directory switch reload, but some upstream components abstract and old interfaces are still retained, for example, component registration / load / unload of Sidebar, ViewLegacy branch and old methods of Notice. They do not represent the product providing plugin start and stop; subsequent deletion must be verified with component tree retrieval and release relationship, and it is not claimed that all historical types and interfaces have been removed. Pure type dependency `utils/types.d.ts` and `markdown-view/mode-controller.ts` are fixed to the upstream, and no running code is generated.
