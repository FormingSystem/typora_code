[Chinese](markdown_text_color.md)

<a id="section_ca440e33679a"></a>
# Markdown Font Color

Select editable Markdown text, right-click and choose **Font Color…**, then click a common color or enter a custom color. You can also click the color block to open the system color picker. **Reset Default Color** removes the color added by this feature from the selection; cancel or press `Esc` to keep the main text unchanged. Common colors support arrow keys, and all controls support `Tab`.

Colors follow the document. Red appears darker on a white background and automatically brightens on a dark night background to maintain the original color scheme. Switching themes only changes the display, not the document content, and does not add undo records. When reopening already colored text, the panel indicates the current color; mixed selections with multiple colors do not pre-select a single color.

<a id="section_df83085b2d4c"></a>
## R026

2026-09-13, user request to add a font color option similar to Word in the native Markdown selection right-click menu, and automatically adapt to day and night themes. Use same-color brightness adjustment, not mechanically invert red to cyan.

<a id="section_31bfd705ed40"></a>
### Interaction and Boundary

Supports regular paragraphs, headings, list text, table cells, and cross-paragraph selections; retains bold, italic, link addresses, and escape semantics. Inline code must be fully selected; partial selection provides explanation but does not modify the main text. Code blocks, formulas, images, source code editors, read-only content, and no selection state do not provide this editing action.

Provides eight common colors: red, orange, yellow, green, cyan, blue, purple, and pink, as well as six-digit hexadecimal custom colors. Illegal colors keep the panel open; cancel does not generate a transaction. When opened, record the document, active tab, main text snapshot, and native selection; verify again before application. During this time, if the document changes, content changes, enter source code mode, or lock, reject the old operation, ask the user to reselect, and cannot apply the color to another document. If the selection contains mixed syntax that cannot be safely mapped, reject it and keep the original text unchanged.

<a id="section_ee9ff958ac75"></a>
### Markdown Storage

Markdown itself does not have a universal font color syntax. Typora supports the standard inline HTML for this feature, for example:

```html
<span style="color:var(--typora-code-color-b42318, #b42318)">Important text</span>
```

CSS variable names save color identity, and the fallback value saves the user's color selection. Typora filters the class, id, and data attributes of inline HTML, so it does not rely on these attributes. Repeated color changes, partial color changes, and reset default only handle the specifications of this function's tags, and do not clear other attributes or colors written by the user in their own HTML.

External readers that support inline HTML can use static fallback colors; platforms that filter HTML/styles may only display regular text. Day/night automatic adaptation is provided by Typora Code's native reading container; independent sidebars/histories read-only previews retain the original HTML filtering boundary, and export continues to be handled by Typora, without guaranteeing that other readers or exports have the same dynamic color matching.

<a id="section_6e94128c3cb7"></a>
### Modules and Native Transactions

`markdown_color_menu` only expands one item in the native menu, calls a common dialog and default interaction; retains the original menu nodes, positioning, and existing actions. Dialog size is constrained by the window, content scrolls independently, and continues to use the public 4px control corner, focus, and cleanup mechanisms. The new color grid is a dedicated interaction for this function and does not claim it to be a complete menu transplant of VS Code or Word.

`markdown_color_native` concentrates on adapting Typora 1.14.10: `selection.buildUndo()` records the selection, `UndoManager.buildReplaceUndo()` obtains a local node snapshot, `exeCommand()` applies replacement/recovery cursor, `undo.register()` registers undo/redo once and connects dirty with host document synchronization. Tables use the same transaction's `buildAttrUndo(table, "userText")` to make the native source code cache invalid, and recover the cache and cell when undoing. Rollback local nodes on failure. No clipboard buffer, temporary main text, or full document replacement.

`markdown_text_color` Responsible for color validation, contrast, and source text interval rewriting. Hidden Markdown tags in the host participate in the original text offset mapping, while visible text participates in the selection; code, escape characters, and HTML entities are treated as complete syntax units. Only delete the tag of this function, and other syntax bytes are retained. When the actual native rendering is inconsistent with the model, refuse to modify. Cannot guess the offset.

<a id="section_da3acc35cf1c"></a>
### Dark/light theme adaptation

`workspace_theme` Unified listening to theme style loading, root/body status, window refocusing, and system dark/light media queries; terminal and font colors reuse this mechanism. `markdown_color_theme` Only set variables for native reading containers and color panels. After synthesizing the ancestor background, calculate the display color; changes in unrelated terminal output or list changes do not trigger document content scanning. Uninstallation recovery is set by variables and listeners set by this module, and the inline styles of the document remain unchanged.

Using W3C's sRGB relative brightness and contrast calculation. If the selected color has already reached a contrast of 4.5:1 with the current solid background color, keep the original color; otherwise, make the smallest adjustment in the same color family towards black or white to achieve the 4.5:1 target for ordinary text. Common colors are the base colors explicitly defined in this function, not an estimate of the color in the screenshot. Custom colors use the same algorithm. Themes with image/gradients backgrounds, separate backgrounds, or forced text styles cannot claim compliance with the accessibility standard based on this.

| Color | Base color |
| --- | --- |
| Red | `#B42318` |
| Orange | `#B54708` |
| Yellow | `#946800` |
| Green | `#18794E` |
| Cyan | `#087E8B` |
| Blue | `#175CD3` |
| Purple | `#7F3FBF` |
| Pink | `#B4236C` |

<a id="section_c2f667475e10"></a>
### Source and verification

- [Official HTML support of Typora](https://support.typora.io/HTML/): Filtering boundary for inline styles and class/id/data.
- [W3C ordinary text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) and [Relative brightness definition](https://www.w3.org/TR/WCAG22/#dfn-relative-luminance): 4.5:1 target and calculation basis.
- Host baseline is Windows Typora 1.14.10, verifying `appsrc/window/frame.js` selection, UndoManager, table.userText, native right-click menu, and save implementation. Original ASAR SHA-256 is `4dbee896f9d5a7f393c69611f57bd877a6b9da895f3884028215c2da7894fb53`; unmodified ASAR. Native instances on Linux/macOS have not been verified.

Automatic regression `test_markdown_text_color.mjs` checks color validation, different backgrounds, Unicode intervals, and partial recovery; `test_markdown_color.cjs` checks actual public styles under the menu, keyboard, narrow window, document switch protection, and cleanup. Native isolated instances additionally check Chinese and emoji, inline formatting, repetition and local color changes, cross-paragraph, inline code, tables, escape entities, save, and real GitHub/Night themes; save and reopen results are uniformly recorded in [Feedback recheck record](feedback_review.en.md).
