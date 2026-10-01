[Chinese](editor_presentation.md)

# R083 Editor presentation and shared workbench boundaries

The October 1, 2026 report identifies disappearing sidebars and outline, a clipped source-mode status icon, and a mode switch that does not follow the reading viewport. Shared layout must have one owner while editor content remains independently owned.

## Ownership and scope

R071.6 keeps the frame rectangle in its owned CSS rule, replacing inherited body variables. Unchanged fields are not written and exiting removes the rule. Sidebar, split and terminal layout share the same container observer. Source CodeMirror observes its own dimensions and retains the logical reading line without synthetic window resize events.

The editor group owns its header and content rectangle. Native Markdown uses `content.typ-workspace-binding` as the single host boundary. Rendered content and the native source surface share that rectangle; the source surface fills its parent instead of positioning itself against the entire window. Native editors retain text, undo, cursor, scrolling and syntax ownership.

The workbench owns activity-bar visibility, the active sidebar panel and its open state. Switching presentation does not toggle that state. Explicit sidebar commands still work, and preferences retain their independent temporary-hiding behavior. Shared status-bar icon roles own alignment and padding in every state, retaining the existing 22px action target and 16px official icon.

## Verified adaptation

Typora 1.14.10 routes `File.toggleSourceMode` through sidebar hiding/restoration, native `sourceView.show/hide`, and menu refresh. A single host adapter changes only the presentation boundary at the verified `File.toggleSourceMode` entry shared by the native footer, keyboard and workbench View menu. Disposal restores the original methods. Native source-mode padding and fixed positioning must not override the shared frame.

Pinned VS Code `68070681e87284e2f22728f15fe3f3651fbf932b` separates group layout from editor-pane content in `editorGroupView.ts#layout` and `editorPanes.ts#layout`; `statusbarpart.css` centers action content independently of state. This project adopts those ownership boundaries while retaining its existing dimensions and feature scope.

## Position, failure and validation

Reading viewport and editing cursor are separate states. Switching presentation should map visible content; explicit editing and navigation may reveal the cursor. R071.5 tracks the corresponding cancellation investigation. Unsupported host behavior must not be invented, and failures must not reload the document to hide an error. Adapters and observers are released with their owner.

Validate real native mode switches through all entry points, sidebar panels and explicit collapse, outline navigation, source editing/undo/save, split groups and terminal layout. Inspect actual SVG bounds in light/dark themes and 100%/125% zoom. Record native evidence, lifecycle cleanup and installation/uninstallation independently. Current implementation passed 53 native checks each on generated and reported document copies, and was installed locally. See [delivery evidence](../enhancements/tests/evidence/reading_source_viewport_20261001.json) for physical-input, host/platform and full-suite limits.

## Position and source services

`native_markdown_position` matches native serialized blocks sequentially against the same in-memory Markdown. CodeMirror maps visible code lines; other blocks retain a proportional position. The presentation adapter captures the viewport center before native show/hide and restores the matching line immediately and on the next frame, without moving the cursor. Trusted input, file changes and disposal cancel pending work. Unmatched blocks are omitted rather than guessed.

`native_markdown_editor` adapts the existing CodeMirror content, version, selection and position. The shared outline tree uses the existing Markdown heading parser and updates from memory after edits. Rendered Markdown keeps its native heading tree. The shared navigation port records native_markdown identity and editor group; no second history or shortcut routing is introduced. Hidden rendered content cannot overwrite reading-position snapshots. Native text, undo and line numbers retain their original owner.
