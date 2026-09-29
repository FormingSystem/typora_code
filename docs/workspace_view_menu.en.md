[Chinese](workspace_view_menu.md)

<a id="section_d6f1db8acbcc"></a>
# View menu state and native switch design

2026-09-27 R079 covers old key positions: sidebar uses Alt+B; window zoom in/out uses Alt+=, Alt+- and corresponding Shift/numeric keypad variants. Ctrl+B, Ctrl+=, Ctrl+- return to Typora native bold and heading level changes; the old date key positions are only recorded for source, current rules see [native keyboard shortcuts priority](workspace_shortcuts.en.md).

R018, 2026-09-12: User feedback that the view menu did not have the checkbox selected, the status bar/tool bar settings had the same visual appearance before and after. The goal is for the menu state to reflect the actual displayed interface, actions are changed by the current owner; the menu does not save a boolean state separately.

<a id="section_3450ea22ff1a"></a>
## Status sources and responsibilities

Each time the menu is opened, it reads the native Markdown source code/readonly/focused/typing machine status, the sidebar of the workspace, the current panel, the native status bar and tool bar, and the current panel status of the terminal coordinator. The menu component reuses `menuitemcheckbox`, `aria-checked` and the official checkbox icon; selected, not selected, disabled are expressed differently. Shared status and data do not belong to the menu UI.

Status bar and tool bar use the verified `ClientCommand.toggleStatusBar` and `toggleToolbar` from Typora 1.14.10, retain the host's persistence and cross-window notifications. Clarify the native DOM, parent container and workbench CSS constraints; if the outer fixed layout makes the native switch ineffective, correct the common layout adaptation, do not add a bypass that only changes the menu checkbox. The tool bar belongs to the native Markdown document, when it is not this view, it is disabled according to actual capabilities, and does not allow backend Markdown formatting operations to be applied to other tabs.

<a id="section_57a5af637812"></a>
## Interactions and acceptance

After the switch is executed, the menu is closed, and when reopened, it should display the actual new state; changes in the active bar, keyboard shortcuts, or native settings also synchronize the state. When the status bar is closed, the reading area/terminal releases bottom space; the tool bar maintains the original floating interaction of Typora, and when displayed, it is located in the active document area, not entering the terminal or status bar; when the reading area is insufficient, it is temporarily hidden, and when the area is restored, it continues to display; the native document content and unsaved draft remain unchanged. Failure/cancellation retains the owner's state, and does not optimistically write false checkboxes.

Test the open/close/disabled states of the menu, actual command routing, window zooming, terminal switch, different tabs, and recovery after destruction. Verify the native state and DOM against each other, and separately record the hiding of Electron and native isolation verification, cannot prove the action completion with static screenshots.


2026-09-12 This round of menu and geometric implementation and verification see [feedback record](feedback_review.en.md#section_677451aa798a). The status of the native status bar and tool bar is maintained by the host, the menu and active bar do not save copies.
