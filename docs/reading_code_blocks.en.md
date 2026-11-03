[Chinese](reading_code_blocks.md)

<a id="section_e5f19fd54629"></a>
# R068 Code Block Expansion and Height Isolation

<a id="section_d07d8ed0d4d4"></a>
## R068.9 Wheel Ownership for Collapsing Code

2026-09-27：User feedback indicates that the code has not been fully displayed on the screen when the code is collapsed, and the "Expand all code" button at the bottom is not visible. The wheel is already intercepted by internal code. The goal is to first allow the reader to see the entire collapsed area and the expand entry point, then allow reading within the block; it is not required for the user to move the mouse away to continue reading the main text.

Only native Markdown document content code fences that are collapsed. Each time the vertical scroll wheel is used, it first reads the common reading_viewport_bounds of the associated content and the boundaries of the fence/button. Only if the entire fence/button is within the available reading area is it passed to native CodeMirror. Top tags/breadcrumbs and bottom bar are cut along the common boundary, while the terminal and split view are along the actual dimensions of their respective content. When the small viewport cannot accommodate the entire collapsed area, continue the document content. Readers can still reach the expand button. Resume document content scrolling immediately once it is partially outside the viewport, without caching 'fully visible' previously.

When the content is not fully visible or the code has reached the current direction boundary, the capture event prevents native code scrolling, passing the original vertical increment to the document content. Pixel increments do not accelerate, and line/page units are converted based on the document content line height and available height. No smooth animations or another set of history is created. When the content is fully visible and the direction is scrollable, the native editor is not taken over. No changes are made to the document, focus, cursor, horizontal scrolling, or scrollbar dragging; Ctrl/Meta font size scaling, Shift horizontal gestures, expand block, short block, charts, Monaco, terminal, and independent preview retain their owners. When the workbench is destroyed, the unique delegate listener is removed, and dynamic fences do not require re-registration.

Fix VS Code 6807068's scrollableElement.ts:_onMouseWheel to determine didScroll based on the actual scrollable direction, and then decide consumption based on alwaysConsumeMouseWheel/consumeMouseWheelIfScrollbarIsNeeded. The editor's editorOptions.ts defaults alwaysConsumeMouseWheel to true. Here, the reading nested scroll boundary as explicitly requested by the user is adopted. It does not claim that full visibility is the default for VS Code, and does not copy its editor acceleration or animation. Native CodeMirror continues to be responsible for the actual code scrolling.

Acceptance first replicates the bottom not seen yet scrolling code in the old version, then verifies entering from top and bottom, full visibility, two boundaries, terminal open/close/zoom/small viewport, Ctrl and horizontal exemption, dynamic replacement/destroy. UI uses Chromium real wheel scrolling, records events to the first frame and the document content/internal scroll amount; original host separately verifies the final candidate, code content and editor status unchanged. Old verification cannot replace the current result, other platforms and physical devices retain the boundary separately.

<a id="section_1376feacbb73"></a>
## R068.10 Unfolded first line cut

2026-09-27: The user explicitly pointed out that the first line's upper half is cut off after unfolding, and provided the Lockdep chapter as the reproduction material. The goal is to retain the complete character and line number baseline of the first line; read-only original, using a copy in an isolated host, do not modify notes, themes, or document fonts to mask the cut.

The investigation scope is the internal scrolling after unfolding the block, native CodeMirror focus/selection, window zoom and independent content font size, light/dark themes, and the geometry from the first frame to the stable frame. The unfolded state is responsible by the fence controller, the native measurement cache still refreshes by common reading_code_geometry per instance, scrolling and text layout belongs to the host; do not add fixed padding, global refresh or second set of editor before the cause is clarified. If the reproduction fails, retain the original sample, environment and actual boundary data, keep this item pending reproduction, cannot pass the normal sample to claim that the user's problem has been fixed.

Acceptance includes testing the range of the first line of text, the actual clipping ancestor, line number/text baseline, internal scroll amount, and the real visible area, covering the immediately following/next frame/stable state as well as the light/dark and zooming back-and-forth; verify that Markdown, edit position, and undo chain are not modified. The final fix solution and this evidence are supplemented with the confirmed root cause, R068.9 wheel delivery cannot replace this acceptance.

User final clarification order: collapse code internal scroll to bottom → click once "Expand all code" → scroll wheel back to top, click the document content to restore. Isolate the host using a copy of the original text, native line numbers, and Windows scroll wheel delivery; prohibit calling refresh or focus before reproduction. After zooming in on the document content, the expansion moment has been captured: DOM internal scrollTop from 568 was compressed by the browser to 34.857px, CodeMirror still records 568, the top of the first line of text is 30.286px higher than the clipping boundary; this isolated sample recovers after 250ms, and it cannot be equivalent to the user's on-site continuous condition that restores only after clicking.

The fence controller resets the internal view and model records to zero, preserving the horizontal position, cursor, and selection, while calling the verified host CodeMirror.scrollTo(null,0) before changing the expanded class. When collapsing, it uses the same port and no longer only writes to the DOM's scrollTop. When native instances are missing, it only resets the existing scroll node without touching the document content. Afterwards, it is still handled by the common geometry adapter to merge and refresh. This fix eliminates the confirmed residual offset during expansion without changing the theme line height or adding padding. Verification must cover changes in font size, scrolling to the bottom, single expansion, immediate/next frame, and scrolling back to the top. The on-site persistent cropping is separately pending user loading of candidate verification.

<a id="section_470969681669"></a>
### R068.9 / R068.10 This delivery

2026-09-27 Delivery 2026.09.27.23 (R068.9/R068.10): The code and expand/collapse entry must be fully entered into the readable area before internal scrolling is allowed; continue with the document content when partially visible or at the internal boundary. Synchronize the native model and DOM scroll position before expanding/collapsing, eliminating the reproduced residual offset upon expansion, without adding top whitespace or changing the theme font. Final build, full check, code scroll 38 items / geometry 9 items and 20 rounds passed; original text copies and generated samples each had 46 native items, 48/56 credible scrolls, and 20 rounds passed respectively. Light and dark themes and 100%/125% window ratios, first line immediately / first frame / scroll back to top have been verified. Terminal smooth scrolling test cases timed out twice, remaining independent unresolved, and full UI pass not claimed. Same candidate two categories isolated uninstall and reinstall and 65 uninstall assertions passed; local machine 49+24 assets consistent, 8 protection items unchanged, check OK; actual environment only uninstall read-only pre-check, managed payload recovery. User window not restarted, normal restart load after saving. Native old samples self-healed after 250ms, user site conditions still pending load candidate verification until click; R068.6 and other historical unresolved items remain. See [this evidence](../enhancements/tests/evidence/code_wheel_20260927.json).

<a id="section_97650660bfde"></a>
## R068.2 VS Code Code Coloring and Default Foreground

2026-09-25: In Dark mode, the actual C fence still appears with a light theme's dark default text. The old TextMate path compresses the scope into a custom category, then applies a fixed GitHub Light color palette; testing only JS or CSS inheritance cannot prove the actual token correctness of C/C++. Code coloring is now managed by a fixed VS Code 68070681e87284e2f22728f15fe3f3651fbf932b Light Modern/Dark Modern original theme configuration, including include chains, colors, and tokenColors, constructed according to the default editor.foreground/background rules in the upstream colorThemeData.ts. Two configurations are built into this tool, do not access the settings of already installed VS Code, and do not establish cross-application synchronization.

Native C/C++ and read-only C/C++ preview share the actual theme matching and tokenizeLine2 metadata of vscode-textmate. Custom scope classification no longer decides the color. The token styles of light and dark themes are both registered. When switching, only the corresponding CSS is projected, avoiding stale tokens using old color codes. Pure text and unmatched tokens clearly use editor.foreground, with background and line numbers coming from the same theme; the cursor and selection interaction still managed by the native editor. Other languages still parsed by existing CodeMirror/Monaco, lexical categories adapted to official theme scope, cannot be called complete VS Code syntax/semantics analysis; no semantic token input is fabricated when no clangd semantic token input.

The color ownership of this coloring takes precedence over the old custom code color; the main title, links, and non-code color still follow user settings, while code font size, line spacing, wrapping, copy, and fold follow the existing owner. This round does not replace the native editor, does not import VS Code host, and does not take over external configuration files. Syntax loading failure retains the host backup and reports initialization errors; cancel/destroy cleans up style subscriptions and existing editor adaptation.

Acceptance includes screenshots of the original sentence p = rcu_dereference(table[id]);, macros / strings / comments / operators / scope-less text, C/C++, common languages, and plain text; verify the real metadata of fixed upstream topics, 20 rounds of light and dark, consistency between the document content and preview/diff, and unchanged font and editing state. The original Typora runs in actual C mode, check the calculated color and contrast, and cannot replace them with synthetic cm class. Build, target regression, same candidate installation/uninstallation/reinstallation, and native delivery are separately recorded.

2026-09-21: User feedback indicates that after expanding long code, other short code boxes abnormally increase in height, and only recover after clicking on the short box. The goal is that each fence is independently expanded, and short code always displays according to its own content; retain the current threshold, button, print, syntax, and native editing capabilities.

<a id="section_9393c63d7467"></a>
## Status and responsibilities

Expand class and button belong to a single fence; content, line height cache, and editing state belong to the native CodeMirror of the fence. Expanding/contracting causes changes in the document layout, and it is not allowed to use the cached height of another block as the real content length. It is also not allowed to globally reuse height or depend on user clicks to refresh. The old implementation only refreshes the operated fence, and other instances' width and visibility changes are not included in the measurement lifecycle; the native mixed arrangement sample has already confirmed the existence of old line height cache.

<a id="section_a6a7d735a2f8"></a>
## Interaction and implementation boundary

Only adjust height measurement/invalidation and lifecycle, do not add another set of editors, do not modify Markdown, focus, or selection. Long code expansion and contraction are kept separately, and charts continue to use independent viewers. When needing to refresh, limit it to the actually affected instances and merge layout batches. When closing the document/destroying, do not execute the old callback; it is not allowed to use full refresh per frame to correct occasional display issues.

<a id="section_a504d2937398"></a>
## Acceptance

Original Typora mixed arrangement of multiple short and long fences: first record the height of the short block, expand/contract other long blocks and scroll to recheck, without clicking on the short block, keep the correct height. Cover different zoom levels, unsaved edits, and 20 rounds of operations, verify the document content/cursor/expand state, and asynchronous cleanup. Existing interactions and thumbnails regression, build, classification test, same candidate installation/uninstallation/reinstallation, and native installation are all recorded. Physical input and other platform boundaries are separately explained.

<a id="section_7545f96699b4"></a>
## Native replication and solution

Document copy is replicated in 1.8 scale down: the single-line fence doc.height cache is 115.21px, and the subsequent retest is 23.04px; the fence has no other block's expand class. The expansion/contraction caused by layout and scrolling exposes the native CodeMirror line break/height cache invalidation. The short line count itself cannot determine the display height (long lines may normally break lines). Use the generated mixed arrangement long text to repeat this path, do not write the user's document content into the test database.

Common geometry adapter registers native instances according to the fence: ResizeObserver only responds to width changes; IntersectionObserver refreshes this instance when entering the visible area; expansion/contraction explicitly requests the current fence to refresh. Offscreen instances retain the pending measurement state, and merge requests within the frame; height changes from refresh do not trigger infinite refresh again. Scanning is only responsible for registering/removing actual nodes; window resize and font loading make measurement invalid. Instance replacement/document removal and workbench destruction release observers and pending frames. Do not change existing CSS size, color, or threshold, use the already verified host CodeMirror.refresh interface, and do not forcibly set height according to line count.

Native acceptance first waits for the private desktop runner to complete window size setup, then scrolls to create the host's delayed initialized editor. Sampling must be located in the visible area; it is not allowed to treat the height of offscreen instances during size switching as a visible state failure. The original document copy can be appended with generated long code as a control sample, without modifying the original, and without writing the document content into evidence.

Fixed layout of the old version of the original document mixed arrangement case can be passed; after adding fence width 520/640px alternation, the old version reproduces 107.78px→61.86px on the visible short block. The width is only set by the isolated fixture, used to simulate layout changes, not a new product size. Fix according to actual width invalidation, keep the normal line break required height.

<a id="section_5264771bea8a"></a>
## This verification and delivery

2026.09.21.4 build, complete check, 3 UI groups, native 20 rounds of generation mixed arrangement and 10 rounds of original text copy mixed arrangement (total 230 high-level comparisons) passed; off-screen, width change, same node editor replacement and destruction regression passed. Same candidate installation / two uninstallations / reinstallation, 65 uninstallation assertions passed; local 29 asset matches, check OK, uninstall pre-check detach, user window not restarted. Evidence see [code block geometry verification](../enhancements/tests/evidence/code_blocks_geometry_20260921.json). Native uses renderer events, other platforms and physical input not tested; do not equate installation with current window already loaded.

<a id="section_400917167991"></a>
## R068.1 One-click copy of code block fence

2026-09-22 User request for code and pure text fence to be able to be copied with one click. Short blocks, no language blocks and folded long blocks use the same entry. When the mouse hovers or keyboard enters, a copy icon is displayed in the upper right of the block; clicking immediately copies, successfully displays a checkmark feedback, and fails to display a retry information. Read-only Markdown preview uses the same behavior; ordinary inline code and web content do not add controls.

Copy controller only has entry, feedback timer, and current block's read callback. Native document content clicks to read from the current CodeMirror instance of the block (includes unsaved and folded content), read-only preview reads from the rendered pre/code; does not read line numbers, fences, or toolbars, does not modify the selection, does not trigger save. Reuse the file service's copy clipboard port and file clipboard invalidation management; failure retains content and does not downgrade to full text copy. Preview copy presents text, continuing to use the existing line breaks and tab normalization in the preview.

Reuse the positioning, cropping, keyboard capture, and destruction mechanisms of the external media entry, carrying the copy through the compact action option. Do not insert buttons into the host editable DOM, do not occupy the height of the main text flow. When the block is deleted or rebuilt, remove the old entry and timer, destroy and release the observer and listeners. Chart rendering continues to be managed by chart operations, do not mistakenly treat chart SVG as code text.

Styles based on fixed VS Code commit 645f29cc3176500b4b5762ba887cf2a7f0ffdf2c's src/vs/base/browser/ui/actionbar/actionbar.css (Codicon 16px), reuse this project's 24px compact buttons and shared 4px interactive corner radius; copy/check/warning use existing official Codicons. Top-right overlay position is this project's reading adaptation value, not claiming VS Code document fully isomorphic.

Verification covers current memory document, empty block, Unicode, tab, full copy of long block, multiple blocks not affecting each other, failure retry, keyboard/mouse, dynamic replacement/destory, light/dark and scaling, native document/dirty/selection/height preservation and preview. Functional pressure uses 100 copies, native 20; shared media entry regression for images/charts, do not use placeholder to replace native read value. Delivery records actual build, installation, isolation uninstallation reinstallation and still not covered platforms.

<a id="section_873e6b548e55"></a>
## This round code and color scheme verification

2026-09-25 Delivery 2026.09.25.8 (R068.2/R074.6): Code fence independently built-in fixed VS Code Light/Dark Modern theme configuration, fixed dark mode ordinary text, operators, and punctuation unreadability; C/C++ document content and preview use the same TextMate theme matching, other languages retain original lexical analyzers and adapt to official colors. The color palette displays actual color values, supports copy/paste, named scheme save, top theme switching, JSON round-trip, dual scheme comparison, and bidirectional preview positioning; effective modifications are automatically saved. Build, full check, 6 sets of related UI, and original Typora 16 items passed, native template screenshots have been verified; 219 directories only indicate categories, not full UI execution, 8 old UIs failed and continue independent tracking. Same candidate two categories isolated uninstall and reinstall, 65 uninstall assertions and ZIP update passed, local 46+24 assets matched, 5 protection items unchanged, check OK; actual environment only uninstall read-only pre-check. User window not restarted, after saving, normal restart load. Win10/Linux native, physical input, and pending items from previous R047.6/R071.4 remain. See [this evidence](../enhancements/tests/evidence/code_colors_profiles_20260925.json).

<a id="section_8cf7a4230228"></a>
## R068.3 Code editing state light/dark adaptation

2026-09-27: Original adaptation only for text, fence background and TextMate token classification, missed editor interaction state; Dark did not import Night's codeblock.dark.css, cursor inherits light color. Another related issue is that each CodeMirror line and default token is painted with an opaque background, which will obscure the selection/ current line behind. The goal is to fully adapt the existing editor state along the same theme source, without replacing the native CodeMirror, without adding new search or cursor behavior, and also without modifying the theme owners of Markdown ordinary text, Mermaid, Monaco and terminal.

The unified code theme service is responsible for static appearance mapping, CodeMirror continues to handle focus, selection, insertion/caret, bracket matching, and find marker generation. Theme switching only changes existing root properties; dynamic instances automatically inherit, destruction removes styles and restores original properties. It does not modify the text DOM, cursor position, scrolling, undo, or user font; read-only preview only changes colors, not generating an editing cursor.

Prioritize the Light/Dark Modern configuration of fixed VS Code 6807068. Its undefined values come from src/vs/editor/common/core/editorColorRegistry.ts and src/vs/platform/theme/common/colors/editorColors.ts. The cursor is light #000000/dark #AEAFAD; focused selection #ADD6FF/#264F78, unfocused selection comes from the built-in theme #E5EBF1/#3A3D41; line numbers follow editorLineNumber, current line has no padding, line border #EEEEEE/#282828; matching bracket background #0064001A, line border #B9B9B9/#888888; find match highlight background follows editor.findMatchHighlightBackground #EA5C0055, bracket line border #000000/#FFFFFF. Mapping is seen in reading_code_editor_colors.ts; this is CodeMirror adaptation rather than shared external VS Code configuration. Preserve the host's actual state enable conditions, do not enable full line highlighting or additional bracket matching just because of color settings.

CodeMirror line and default token background is transparent, allowing the original selection layer to be normally visible; non-default token background remains. The cursor only changes color, not the blink, position, thickness, or rule for hiding when out of focus. Use the real host to verify C/C++ Bash and no language block, as well as light/dark switching, dynamic instance, focus/defocus, selection and editing content unchanged; Electron isolation testing verifies color values, transparent layers, and destruction, not using synthetic DOM to replace the host acceptance. Cross-platform and physical input delay are still recorded separately.


<a id="section_c0e4365a670f"></a>
## R068.2 / R074.7 2026 code configuration identity (2026-09-27)

New VSCode2026_Light/Dark, retain original CppGithubConsoles_Light/Dark and Night. New theme declares light_2026/dark_2026 via `--workspace-code-theme`; shared code service selects complete official include chain based on explicit identity, original theme continues with existing Modern light/dark mapping. This convention fills in the previous gap where only light/dark was judged, leading to different differences between document content and code configuration. It does not change the original lexer, font, or geometry.

TextMate's four registration tables and code editing state use the same configuration; switching between light/dark themes also invalidates updates. Setting templates take identity from actual loaded CSS, Shadow reading reuses shared styles. Cursor, selection, regular text and syntax colors are synchronized, switching does not change content, editing position and host status. Sources and decisions are seen in [2026 color design](workspace_colors.en.md#section_7c375b72f9b8), this native 86 items, three UI sets and installation/uninstallation evidence are seen in [delivery record](../enhancements/tests/evidence/code_palette_20260927.json).

## R068.11 Last-line clipping after shrinking content

On 2026-10-02 the user reported a partially clipped final line after shortening a foldable fence. Restore complete native height when the block no longer needs folding, preserving input, selection, undo and other fences. Scope is height-limit removal and native measurement handoff, without changing fold thresholds or adding fixed bottom padding.

First record an isolated original-host sequence with collapsed/expanded long blocks, internal bottom scroll, deletion to nine/one/near-threshold lines, text ranges, clipping ancestors, model and DOM positions. The controller owns collapse state; the per-instance geometry service owns coalesced measurement invalidation; CodeMirror owns content. Root cause and implementation await reproduction. Do not refresh all blocks on every frame. Replacement/disposal drops stale work; failures preserve content.

Verify both themes, zoom, wrapping, immediate/next-frame/settled last-line geometry, undo/redo, 20 grow/shrink cycles, and existing first-line, wheel and copy behavior. Use standard isolated install/uninstall and local checks; black screens remain separately unresolved.

Implementation evidence (2026-10-02): the nine-line trusted-keyboard sample left folding with zero measurement invalidations (9efdffac87ba4b9090c7a2aff826732d). Its last line remained complete, so this establishes a handoff gap rather than the full cause of the reported clipping. Only an actual removal of collapsible state calls the existing code_geometry.refresh(fence), coalesced behind visibility gating; repeated scans do not refresh and disposal already releases the geometry owner. Pinned 6807068 common/viewLayout/viewLayout.ts updates scroll dimensions after contentHeight changes. Adopt change-driven invalidation while retaining the verified Typora1.14.10 refresh port, not Monaco layout algorithms.

## R068.12 Shared editor and preview code colors (2026-10-02)

Native fences use host CodeMirror modes for ordinary languages, while readers used Monaco categories and lost roles such as functions and variables. Lookup readers also carried a separate hard-coded palette. Editing and reading must share lexical roles and theme colors.

Search, link, split and Git Markdown readers retain static rendering. VSCode2026 keeps the pinned official 2026 Light/Dark profiles; Cpp keeps Light/Dark Modern from baseline 6807068. This change does not update upstream versions, document themes, language services or semantic settings.

C/C++ continue using the shared TextMate grammar. A host adapter resolves getCodeMirrorMode and the registered CodeMirror mode, retaining multiline state and every token role without creating an editor. Missing host capabilities retain the existing static fallback; unknown modes retain readable source. Do not refresh native fences or modify preferences. Existing view owners still control asynchronous lifetime. Remove the lookup palette and verify shared theme extraction for both Shadow DOM and scoped split readers.

Validate actual host bash, tex, JavaScript and C/C++ token text, classes, computed foreground/background under all four profiles, including same-brightness family switches, multiline/blank input, unknown languages and disposal. Record isolated and native coverage separately. Color tests do not resolve the outstanding R071.7 black-screen report.

R068.12 implementation verification: Typora 1.14.10 window/frame.js resolves fence languages with getCodeMirrorMode, uses File.option.codeIndentSize for both tabSize and indentUnit, and loads lib.asar/codemirror/mode.min.js from fences.lazyload before refreshing fences. The adapter loads only that registry, using the same indentation value without invoking native refresh. Check registered shell/stex/javascript modes instead of a mode count inflated by custom C/C++ registrations. The original-host test starts with three modes and opens search before editing any fence. Both theme families retain their existing shared profiles, with no new color setting.

## R068.13 Preserve code expansion across navigation

2026-10-03: A rebuilt native fence loses its DOM-only expansion class and defaults to collapsed after file navigation. Preserve each explicit fence choice within the current window workspace, including revisiting a replaced preview tab. Keep existing defaults, controls, geometry, document content and native selection; restart persistence is outside this fix.

The reading state service owns explicit choices; native CodeMirror owns content and measurements. Match normalized document resources and content fingerprints with duplicate occurrence order. Update identities for edits to existing nodes, distinguish empty-path drafts by view identity, and skip transitional native loads/workspace changes. Existing scans restore new nodes; removed nodes release references and successful workspace changes/disposal clear records. No polling, global refresh or native parameter changes. Unmatched changed blocks retain the existing default rather than guessing by similar text.

Pinned VS Code 6807068 `src/vs/editor/contrib/folding/browser/folding.ts` saves and restores folding through `saveViewState`/`restoreViewState`. Adopt state independence from DOM while retaining Typora height folding. Restore through the existing folding/geometry entry only for new nodes; ordinary in-document navigation must not reset folding or internal scroll.

Validate an old-candidate native red case, then 20 native round trips, same-file locations, independent and duplicate fences, explicit collapse, edits and node reconstruction with unchanged disk content. UI covers transitional loads, cleanup, edits and disposal; regress geometry, wheel, copy and navigation. Build, checks, isolated install/uninstall/reinstall and local installation use the final candidate; untested platforms remain explicit.
[Chinese](reading_code_blocks.md#visual-code-blocks)

<a id="visual-code-blocks"></a>
## R087 Local visual code blocks: implementation and historical inventory

The current reading-state fix is 2026.11.03.1, installed; see [R087.2](#r087-reading-state) and [current evidence](../enhancements/tests/evidence/visual_reading_20261103.json). The initial engine delivery 2026.11.02.1 was pushed in `e206efe`. Listed formats use existing local engines; [the usage guide](visual_code_blocks.en.md) owns language tags, click-to-run behavior, per-diagram export, and host-version limits. Existing core/UI/native evidence is recorded in [delivery evidence](../enhancements/tests/evidence/visual_code_20261102.json); it does not establish whole-document HTML/PDF export or acceptance of every diagram family/platform.

2026-11-02: The user requests an inventory before implementing richer AI-authored architecture, composition, and SVG diagrams one format at a time. The inventory below records the pre-implementation state; subsequent all-format authorization and current integration follow. It is not a complete list of OpenAI built-in renderers.

### Pre-implementation evidence and candidates

`create_preview_diagrams` in `workspace_markdown_preview_render.ts` loads the host Mermaid library. The lookup, split Markdown, and Git Markdown diff consumers dispatch only `language-mermaid` to diagram rendering; other fences receive syntax highlighting. SVG image MIME handling in `workspace_preview_image.ts` does not render SVG fences. The PlantUML entry in `typora_enhancements.ts` only exempts diagrams from code folding. Git Markdown sanitation explicitly excludes raw SVG/Math elements. This inspection did not run native samples or inspect the user's active window or third-party plugin state.

| Format | Purpose | Pre-implementation finding | Original suggested phase |
| --- | --- | --- | --- |
| SVG fences | Custom architecture, composition, memory, and protocol illustrations | No dedicated fence renderer; image support exists | First |
| Mermaid | Flow, sequence, state, class, ER, mindmap, and block diagrams | Native/preview integration exists; newer families require host-library verification | First, extend coverage |
| Static HTML/CSS | Layered cards, layout explanations, combined text/graphics | HTML fences remain source; native HTML blocks are a separate path | Second |
| Graphviz `dot` / `graphviz` | Dependencies, calls, topology with automatic layout | No dedicated integration found | Second |
| WaveDrom | Digital signals and bus timing | No dedicated integration found | Second |
| Vega-Lite / Vega | Proportions, trends, distributions, interactive statistics | No dedicated integration found; prefer evaluating Vega-Lite first | Third |
| ECharts | Gauges, relationships, interactive data charts | No dedicated integration found; choose based on needs alongside Vega-Lite | Third candidate |
| PlantUML | UML, components, deployment, complex sequences | No actual owned rendering pipeline found; plugins unverified | On demand |
| HTML/JavaScript and React JSX/TSX | Interactive controls, animation, simulation | Requires isolated execution and dependencies | Separate later design |
| Math, `flow`, `sequence` | Equations and legacy diagrams | Native Typora capabilities exist; shared previews lack equivalent complete integration | Compatibility work |

Prioritize Mermaid flowchart/subgraph, sequenceDiagram, classDiagram, stateDiagram, erDiagram, mindmap, block, architecture, C4, packet, and pie samples. Check exact syntax, stability, and availability against the selected library version; this is not a host support claim. Native math syntax does not imply arbitrary `latex` fences or TikZ execution.

### Ownership and behavior

2026-11-02 authorization supersedes waiting between phases: implement every listed format using browser SVG/HTML and bundled local open-source engines, not custom drawing/layout engines. A shared adapter runs prebuilt libraries in an opaque-origin iframe without Node, host DOM access, or automatic network access. Ordinary JavaScript examples remain source; only explicit interactive fences or JSX/TSX execute after clicking Run. Pin dependencies and ship licenses without runtime CDN downloads. Native fences retain their model/change ownership, with separate output and visible-region lifetime. Preserve existing native Mermaid behavior while sharing the new adapters across readers. Validate real-library rendering, errors/cancellation, offline operation, and isolation for each format; registration alone does not establish support.

Keep Markdown source, editing, and undo under their existing owners. A proposed shared renderer owns dispatch, dependency loading, sanitation, revision checks, and cancellation. Native content, search/link previews, read-only splits, and Git history/diffs own layout and resource identity. Reuse theme notifications, visible-region scheduling, and media viewing instead of global redraws. Verify the actual host fence integration port before implementing the first format.

Start SVG with a static subset, preserve required local references and graphic styling, and isolate duplicate IDs. Do not execute author scripts or inject author HTML directly into the workbench. Interactive HTML/React needs a separate design for host isolation, dependencies, networking, and resource budgets. Failure retains copyable source and explains the error; editing, switching, or closing cancels old work and rejects late results. Source/graphic switching, enlargement, copying, and export are shared interaction candidates; verify existing UI conventions before selecting entry points.

### Acceptance and delivery

Each format needs samples across native content, search/link previews, read-only splits, and Git history/diffs. Cover themes, long multilingual labels, narrow layouts, zoom, repeated diagrams, editing/undo/save, fallback, offline use, cancellation, and disposal. Measure real wheel/input response with long documents and background work. Verify HTML/PDF export independently from on-screen rendering.

The inventory stage only committed the proposal. Subsequent authorization covers all listed formats; local engines and a release increment are now implemented, with per-format validation and standard installation/uninstallation evidence recorded separately. Existing unresolved requirements remain open.

References: [Typora diagrams](https://support.typora.io/Draw-Diagrams-With-Markdown/), [Mermaid](https://mermaid.js.org/intro/), [SVG](https://developer.mozilla.org/en-US/docs/Web/SVG), [Graphviz](https://graphviz.org/), [WaveDrom](https://wavedrom.com/), [Vega-Lite](https://vega.github.io/vega-lite/), [ECharts](https://echarts.apache.org/en/index.html), [PlantUML](https://plantuml.com/). The [OpenAI changelog](https://learn.chatgpt.com/docs/changelog) confirms Mermaid/math capabilities in some clients, not a universal cross-client format inventory.

### R087 implementation and usage

[Usage and executable examples](visual_code_blocks.en.md). The authorized implementation uses bundled engines and shared opaque-origin views. Native verified diagram families retain their owner. Button padding uses the fixed VS Code button.css 4px/8px values; control rounding/colors inherit shared interaction rules, including Shadow DOM. Native edit updates use the preview.ts 300ms coalescing interval, with immediate first rendering and offscreen disposal. Current evidence and installation status are recorded separately; whole-document export and arbitrary npm imports are outside this implementation.

Historical R087 controls (superseded by outside-document hover actions in R087.2): visual toolbars explicitly register `data-workspace-reader-controls`. Shared interaction rules adapt only this owned control boundary within readers and Shadow roots; ordinary document content, CodeMirror, and third-party content remain excluded. Rounding, hover, and keyboard focus stay shared; disabled controls reuse the existing half-opacity convention. Native/Shadow states and existing interaction tests are validated separately.

<a id="r087-document-sync"></a>
## R087.1 Documentation synchronization (2026-11-03)

Problem and goal: the feature and offline examples are delivered, but the repository entry pages and feature matrix omit visual code blocks, while handoff introductions retain the earlier unpushed status. Every current capability entry should lead to the same usage guide and describe the formats, execution model, and limits consistently.

Scope and ownership: [Visual code blocks](visual_code_blocks.en.md) owns syntax and examples. Repository/module introductions summarize and link, the matrix records scope and remaining limits, design retains the explicitly historical inventory, and delivery records append the push receipt. Keep Chinese/English counterparts aligned without another independent capability checklist. Compare the four bundled help files with their sources and installed copies; leave matching files unchanged. This pass changes no runtime behavior, release sequence, installed assets, or historical test results.

Implementation and failure behavior: synchronize verified formats, explicit execution, export, and offline limits. Correct stale preview-tab and unified-settings descriptions in the same matrix against existing authorizations. Preserve unresolved work and untested platforms; do not label uncertain capabilities complete. Repair validation failures before publication rather than shipping broken links.

Acceptance and delivery: check same-language routes from home to help/examples and development entry to design/evidence, plus reciprocal language navigation. Run the existing bilingual, diff, and commit-message checks. Compare installed offline help bytes; documentation validation does not represent a new runtime test run. Commit reviewable documentation results, push normally, and verify the remote SHA.

---

English · [Simplified Chinese](reading_code_blocks.md)

<a id="r087-reading-state"></a>
## R087.2 Reading state and hover actions (2026-11-03)

Problem: new visual fences leave CodeMirror and a permanent text toolbar visible, unlike existing Mermaid/images. Reading should show the diagram; editing restores its current source and actions use the existing hover entry.

The native adapter follows Typora 1.14.15 `resources/style/base.css` and `.md-fences-advanced:not(.md-focus) .CodeMirror` as evidence for host editing state. It adapts only the new formats without impersonating a native advanced-diagram language or replacing models. Outside-document controls reuse `reading_media_entry` More/enlarge, shared interaction, bounds/dismissal and disposal. The domain supplies source/run/copy/export actions. Geometry/colors retain R031.4 and fixed VSCode6807068 sources; no permanent toolbar height. Static diagrams enter native editing on click; interactive content still requires explicit Run and retains internal input.

Native selection/CodeMirror own editing state; read-only source visibility belongs to its view and search-hit source remains available. Errors retain recoverable source. Offscreen disposal retains a placeholder at the measured height until rendering resumes, avoiding source reappearance and layout collapse. Outside-document menus observe scrolling in their owning Document or ShadowRoot; replacement and shutdown release menus/listeners/iframes. Validate native select/leave/edit/undo/save, light/dark, previews, multiple instances and 20 transitions using real engines, then validate candidate install/uninstall and installed hashes; previous results do not establish acceptance.
