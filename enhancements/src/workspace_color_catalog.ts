import {workspace_text} from "./workspace_i18n";
/** Stable role directory for custom colors. The default value continues to be owned by the themeCSS；do not copy color values here. */
export type workspace_color_role={key:string;title:string;variable?:string;selector?:string;property?:string};
export const WORKSPACE_COLOR_ROLES:workspace_color_role[]=[
  {key:"vscode_quick_input_background",title:workspace_text("color_catalog_quick_input_floating_background"),variable:"--vscode-quickInput-background"},
  {key:"vscode_quick_input_foreground",title:workspace_text("color_catalog_quick_input_floating_text"),variable:"--vscode-quickInput-foreground"},
  {key:"vscode_widget_border",title:workspace_text("color_catalog_quick_input_floating_border"),variable:"--vscode-widget-border"},
  {
    "key": "vscode_title_bar_active_foreground",
    "title": workspace_text("color_catalog_title_bar_active_text"),
    "variable": "--vscode-titleBar-activeForeground"
  },
  {
    "key": "vscode_status_bar_foreground",
    "title": workspace_text("color_catalog_status_bar_text"),
    "variable": "--vscode-statusBar-foreground"
  },
  {
    "key": "vscode_status_bar_item_hover_background",
    "title": workspace_text("color_catalog_status_bar_item_hover_background"),
    "variable": "--vscode-statusBarItem-hoverBackground"
  },
  {
    "key": "vscode_menu_background",
    "title": workspace_text("color_catalog_menu_background"),
    "variable": "--vscode-menu-background"
  },
  {
    "key": "vscode_menu_foreground",
    "title": workspace_text("color_catalog_menu_text"),
    "variable": "--vscode-menu-foreground"
  },
  {
    "key": "vscode_menu_border",
    "title": workspace_text("color_catalog_menu_border"),
    "variable": "--vscode-menu-border"
  },
  {
    "key": "vscode_menu_separator_background",
    "title": workspace_text("color_catalog_menu_separator_background"),
    "variable": "--vscode-menu-separatorBackground"
  },
  {
    "key": "vscode_input_placeholder_foreground",
    "title": workspace_text("color_catalog_input_placeholder_text"),
    "variable": "--vscode-input-placeholderForeground"
  },
  {
    "key": "vscode_text_block_quote_background",
    "title": workspace_text("color_catalog_block_quote_background"),
    "variable": "--vscode-textBlockQuote-background"
  },
  {
    "key": "vscode_text_block_quote_border",
    "title": workspace_text("color_catalog_block_quote_border"),
    "variable": "--vscode-textBlockQuote-border"
  },
  {
    "key": "vscode_text_code_block_background",
    "title": workspace_text("color_catalog_code_block_background"),
    "variable": "--vscode-textCodeBlock-background"
  },
  {
    "key": "vscode_text_preformat_background",
    "title": workspace_text("color_catalog_inline_code_background"),
    "variable": "--vscode-textPreformat-background"
  },
  {
    "key": "vscode_text_preformat_foreground",
    "title": workspace_text("color_catalog_inline_code_text"),
    "variable": "--vscode-textPreformat-foreground"
  },
  {
    "key": "vscode_terminal_selection_background",
    "title": workspace_text("color_catalog_terminal_selection_background"),
    "variable": "--vscode-terminal-selectionBackground"
  },
  {
    "key": "vscode_terminal_cursor_foreground",
    "title": workspace_text("color_catalog_terminal_cursor_text"),
    "variable": "--vscode-terminalCursor-foreground"
  },
  {
    "key": "vscode_terminal_cursor_background",
    "title": workspace_text("color_catalog_terminal_cursor_background"),
    "variable": "--vscode-terminalCursor-background"
  },
  {
    "key": "markdown_heading",
    "title": workspace_text("color_catalog_main_title"),
    "variable": "--workspace-markdown-heading"
  },
  {
    "key": "vscode_foreground",
    "title": workspace_text("color_catalog_text"),
    "variable": "--vscode-foreground"
  },
  {
    "key": "vscode_description_foreground",
    "title": workspace_text("color_catalog_explanation_text"),
    "variable": "--vscode-descriptionForeground"
  },
  {
    "key": "vscode_focus_border",
    "title": workspace_text("color_catalog_focus_border"),
    "variable": "--vscode-focusBorder"
  },
  {
    "key": "vscode_button_background",
    "title": workspace_text("color_catalog_button_background"),
    "variable": "--vscode-button-background"
  },
  {
    "key": "vscode_button_foreground",
    "title": workspace_text("color_catalog_button_text"),
    "variable": "--vscode-button-foreground"
  },
  {
    "key": "vscode_button_hover_background",
    "title": workspace_text("color_catalog_button_hover_background"),
    "variable": "--vscode-button-hoverBackground"
  },
  {
    "key": "vscode_input_background",
    "title": workspace_text("color_catalog_input_box_background"),
    "variable": "--vscode-input-background"
  },
  {
    "key": "vscode_input_border",
    "title": workspace_text("color_catalog_input_box_border"),
    "variable": "--vscode-input-border"
  },
  {
    "key": "vscode_input_foreground",
    "title": workspace_text("color_catalog_input_box_text"),
    "variable": "--vscode-input-foreground"
  },
  {
    "key": "vscode_side_bar_background",
    "title": workspace_text("color_catalog_sidebar_background"),
    "variable": "--vscode-sideBar-background"
  },
  {
    "key": "vscode_side_bar_border",
    "title": workspace_text("color_catalog_sidebar_border"),
    "variable": "--vscode-sideBar-border"
  },
  {
    "key": "vscode_panel_background",
    "title": workspace_text("color_catalog_panel_background"),
    "variable": "--vscode-panel-background"
  },
  {
    "key": "vscode_panel_border",
    "title": workspace_text("color_catalog_panel_border"),
    "variable": "--vscode-panel-border"
  },
  {
    "key": "vscode_status_bar_background",
    "title": workspace_text("color_catalog_status_bar_background"),
    "variable": "--vscode-statusBar-background"
  },
  {
    "key": "vscode_editor_background",
    "title": workspace_text("color_catalog_editor_background"),
    "variable": "--vscode-editor-background"
  },
  {
    "key": "vscode_editor_foreground",
    "title": workspace_text("color_catalog_editor_text"),
    "variable": "--vscode-editor-foreground"
  },
  {
    "key": "vscode_editor_group_header_tabs_background",
    "title": workspace_text("color_catalog_editor_group_tab_background"),
    "variable": "--vscode-editorGroupHeader-tabsBackground"
  },
  {
    "key": "vscode_activity_bar_inactive_foreground",
    "title": workspace_text("color_catalog_inactive_text_in_activity_bar"),
    "variable": "--vscode-activityBar-inactiveForeground"
  },
  {
    "key": "vscode_activity_bar_foreground",
    "title": workspace_text("color_catalog_activity_bar_text"),
    "variable": "--vscode-activityBar-foreground"
  },
  {
    "key": "vscode_activity_bar_active_border",
    "title": workspace_text("color_catalog_activity_bar_active_border"),
    "variable": "--vscode-activityBar-activeBorder"
  },
  {
    "key": "vscode_modern_activity_bar_item_active_background",
    "title": workspace_text("color_catalog_activity_bar_item_active_background"),
    "variable": "--vscode-modernActivityBarItem-activeBackground"
  },
  {
    "key": "vscode_modern_activity_bar_item_hover_background",
    "title": workspace_text("color_catalog_activity_bar_item_hover_background"),
    "variable": "--vscode-modernActivityBarItem-hoverBackground"
  },
  {
    "key": "vscode_modern_activity_bar_item_active_foreground",
    "title": workspace_text("color_catalog_activity_bar_item_active_text"),
    "variable": "--vscode-modernActivityBarItem-activeForeground"
  },
  {
    "key": "vscode_text_link_foreground",
    "title": workspace_text("color_catalog_text_link_text"),
    "variable": "--vscode-textLink-foreground"
  },
  {
    "key": "ui_background",
    "title": workspace_text("color_catalog_general_background"),
    "variable": "--workspace-ui-background"
  },
  {
    "key": "ui_chrome",
    "title": workspace_text("color_catalog_general_framework"),
    "variable": "--workspace-ui-chrome"
  },
  {
    "key": "ui_foreground",
    "title": workspace_text("color_catalog_general_text"),
    "variable": "--workspace-ui-foreground"
  },
  {
    "key": "ui_muted",
    "title": workspace_text("color_catalog_general_secondary_text"),
    "variable": "--workspace-ui-muted"
  },
  {
    "key": "ui_border",
    "title": workspace_text("color_catalog_general_border"),
    "variable": "--workspace-ui-border"
  },
  {
    "key": "ui_control_border",
    "title": workspace_text("color_catalog_general_control_border"),
    "variable": "--workspace-ui-control-border"
  },
  {
    "key": "ui_input",
    "title": workspace_text("color_catalog_general_input_box"),
    "variable": "--workspace-ui-input"
  },
  {
    "key": "ui_elevated",
    "title": workspace_text("color_catalog_general_overlay"),
    "variable": "--workspace-ui-elevated"
  },
  {
    "key": "ui_focus",
    "title": workspace_text("color_catalog_general_focus"),
    "variable": "--workspace-ui-focus"
  },
  {
    "key": "ui_selection",
    "title": workspace_text("color_catalog_general_selection"),
    "variable": "--workspace-ui-selection"
  },
  {
    "key": "vscode_list_active_selection_background",
    "title": workspace_text("color_catalog_list_item_selection_background"),
    "variable": "--vscode-list-activeSelectionBackground"
  },
  {
    "key": "vscode_list_active_selection_foreground",
    "title": workspace_text("color_catalog_list_item_selection_text"),
    "variable": "--vscode-list-activeSelectionForeground"
  },
  {
    "key": "ui_hover",
    "title": workspace_text("color_catalog_general_hover"),
    "variable": "--workspace-ui-hover"
  },
  {
    "key": "vscode_list_hover_background",
    "title": workspace_text("color_catalog_list_hover_background"),
    "variable": "--vscode-list-hoverBackground"
  },
  {
    "key": "vscode_list_active_selection_icon_foreground",
    "title": workspace_text("color_catalog_list_item_selection_icon_text"),
    "variable": "--vscode-list-activeSelectionIconForeground"
  },
  {
    "key": "vscode_list_focus_and_selection_outline",
    "title": workspace_text("color_catalog_list_focus_and_selection_outline"),
    "variable": "--vscode-list-focusAndSelectionOutline"
  },
  {
    "key": "vscode_menu_selection_background",
    "title": workspace_text("color_catalog_menu_selection_background"),
    "variable": "--vscode-menu-selectionBackground"
  },
  {
    "key": "vscode_list_inactive_selection_background",
    "title": workspace_text("color_catalog_list_non_selected_background"),
    "variable": "--vscode-list-inactiveSelectionBackground"
  },
  {
    "key": "vscode_list_inactive_selection_foreground",
    "title": workspace_text("color_catalog_list_non_selected_text"),
    "variable": "--vscode-list-inactiveSelectionForeground"
  },
  {
    "key": "vscode_list_hover_foreground",
    "title": workspace_text("color_catalog_list_hover_text"),
    "variable": "--vscode-list-hoverForeground"
  },
  {
    "key": "vscode_list_drop_background",
    "title": workspace_text("color_catalog_list_drag_and_drop_background"),
    "variable": "--vscode-list-dropBackground"
  },
  {
    "key": "vscode_list_focus_background",
    "title": workspace_text("color_catalog_list_focus_background"),
    "variable": "--vscode-list-focusBackground"
  },
  {
    "key": "vscode_list_focus_foreground",
    "title": workspace_text("color_catalog_list_focus_text"),
    "variable": "--vscode-list-focusForeground"
  },
  {
    "key": "vscode_list_focus_outline",
    "title": workspace_text("color_catalog_list_focus_outline"),
    "variable": "--vscode-list-focusOutline"
  },
  {
    "key": "vscode_list_highlight_foreground",
    "title": workspace_text("color_catalog_list_matching_text"),
    "variable": "--vscode-list-highlightForeground"
  },
  {
    "key": "vscode_list_invalid_item_foreground",
    "title": workspace_text("color_catalog_list_invalid_item_text"),
    "variable": "--vscode-list-invalidItemForeground"
  },
  {
    "key": "vscode_list_error_foreground",
    "title": workspace_text("color_catalog_list_error_text"),
    "variable": "--vscode-list-errorForeground"
  },
  {
    "key": "vscode_list_warning_foreground",
    "title": workspace_text("color_catalog_list_warning_text"),
    "variable": "--vscode-list-warningForeground"
  },
  {
    "key": "vscode_menubar_selection_background",
    "title": workspace_text("color_catalog_menu_bar_selection_background"),
    "variable": "--vscode-menubar-selectionBackground"
  },
  {
    "key": "vscode_diff_editor_inserted_text_background",
    "title": workspace_text("color_catalog_diff_editor_added_text_background"),
    "variable": "--vscode-diffEditor-insertedTextBackground"
  },
  {
    "key": "vscode_diff_editor_removed_text_background",
    "title": workspace_text("color_catalog_diff_editor_deleted_text_background"),
    "variable": "--vscode-diffEditor-removedTextBackground"
  },
  {
    "key": "vscode_toolbar_hover_background",
    "title": workspace_text("color_catalog_toolbar_hover_background"),
    "variable": "--vscode-toolbar-hoverBackground"
  },
  {
    "key": "vscode_quick_input_list_focus_background",
    "title": workspace_text("color_catalog_quick_input_box_list_focus_background"),
    "variable": "--vscode-quickInputList-focusBackground"
  },
  {
    "key": "vscode_quick_input_list_focus_foreground",
    "title": workspace_text("color_catalog_quick_input_box_list_focus_text"),
    "variable": "--vscode-quickInputList-focusForeground"
  },
  {
    "key": "vscode_quick_input_list_focus_icon_foreground",
    "title": workspace_text("color_catalog_quick_input_box_list_focus_icon_text"),
    "variable": "--vscode-quickInputList-focusIconForeground"
  },
  {
    "key": "vscode_quick_input_list_focus_highlight_foreground",
    "title": workspace_text("color_catalog_quick_input_box_list_focus_match_text"),
    "variable": "--vscode-quickInputList-focusHighlightForeground"
  },
  {
    "key": "vscode_charts_blue",
    "title": workspace_text("color_catalog_chart_blue"),
    "variable": "--vscode-charts-blue"
  },
  {
    "key": "vscode_charts_purple",
    "title": workspace_text("color_catalog_chart_purple"),
    "variable": "--vscode-charts-purple"
  },
  {
    "key": "vscode_editor_gutter_modified_background",
    "title": workspace_text("color_catalog_editor_sidebar_modified_background"),
    "variable": "--vscode-editorGutter-modifiedBackground"
  },
  {
    "key": "list_background",
    "title": workspace_text("color_catalog_list_background"),
    "variable": "--workspace-list-background"
  },
  {
    "key": "markdown_link",
    "title": workspace_text("color_catalog_document_link"),
    "variable": "--workspace-markdown-link"
  }
];

// Read-only roles only override colors; when not configured, they fully inherit the formatting and table borders from the original theme.
const body_roles:[string,string,string,string?][]=[
 ['markdown_background',workspace_text("color_catalog_document_background"),'#write','background-color'],
 ['markdown_foreground',workspace_text("color_catalog_document_text"),'#write'],
 ['markdown_heading',workspace_text("color_catalog_document_title_all_levels"),'#write h1,#write h2,#write h3,#write h4,#write h5,#write h6'],
 ['markdown_link',workspace_text("color_catalog_document_link"),'#write a[href],#write a[href]:is(:hover,:focus,:active,:visited)'],
 ['markdown_link_visited',workspace_text("color_catalog_document_link_visited"),'#write a[href]:visited'],
 ['markdown_link_hover',workspace_text("color_catalog_document_link_hover_focus"),'#write a[href]:hover,#write a[href]:focus,#write a[href]:active'],
 ['markdown_strong',workspace_text("color_catalog_document_bold"),'#write strong'],['markdown_emphasis',workspace_text("color_catalog_document_italic"),'#write em'],
 ['markdown_quote_foreground',workspace_text("color_catalog_quote_text"),'#write blockquote'],
 ['markdown_quote_background',workspace_text("color_catalog_quote_background"),'#write blockquote','background-color'],
 ['markdown_quote_border',workspace_text("color_catalog_quote_border"),'#write blockquote','border-color'],
 ['markdown_table_foreground',workspace_text("color_catalog_table_text"),'#write table'],
 ['markdown_table_background',workspace_text("color_catalog_table_background"),'#write table,#write tr,#write td','background-color'],
 ['markdown_table_border',workspace_text("color_catalog_table_border"),'#write table,#write th,#write td','border-color'],
 ['markdown_table_header_foreground',workspace_text("color_catalog_table_header_text"),'#write th'],
 ['markdown_table_header_background',workspace_text("color_catalog_table_header_background"),'#write th','background-color'],
 ['markdown_table_alternate_background',workspace_text("color_catalog_table_alternating_row_background"),'#write tbody tr:nth-child(even),#write tbody tr:nth-child(even) td','background-color'],
 ['markdown_code_foreground',workspace_text("color_catalog_inline_code_text_a3fc60ae"),'#write code'],
 ['markdown_code_background',workspace_text("color_catalog_inline_code_background_98221086"),'#write code','background-color'],
 ['markdown_fence_foreground',workspace_text("color_catalog_code_fence_text"),'#write pre,#write pre code,#write .md-fences,#write .CodeMirror'],
 ['markdown_fence_background',workspace_text("color_catalog_code_fence_background"),'#write pre,#write pre code,#write .md-fences,#write .CodeMirror','background-color'],
 ['markdown_rule',workspace_text("color_catalog_horizontal_separator"),'#write hr','border-color'],
 ['markdown_mark_foreground',workspace_text("color_catalog_highlighted_text"),'#write mark'],
 ['markdown_mark_background',workspace_text("color_catalog_highlighted_background"),'#write mark','background-color'],
];
for(let level=1;level<=6;level++)body_roles.push(['markdown_heading_'+level,workspace_text("color_catalog_document_contenth")+level+workspace_text("color_catalog_title"),'#write h'+level]);
for(const [key,title,selector,property] of body_roles){
 const existing=WORKSPACE_COLOR_ROLES.find(role=>role.key===key);
 if(existing)Object.assign(existing,{selector,property});else WORKSPACE_COLOR_ROLES.push({key,title,selector,property});
}
for(const [key,title,selector] of [
 ['comment',workspace_text("color_catalog_comment"),'.cm-tm-comment,.cm-comment,.hljs-comment'],['keyword',workspace_text("color_catalog_keyword"),'.cm-tm-keyword,.cm-tm-control,.cm-keyword,.hljs-keyword'],
 ['string',workspace_text("color_catalog_string"),'.cm-tm-string,.cm-string,.cm-string-2,.hljs-string'],['number',workspace_text("color_catalog_number"),'.cm-tm-number,.cm-number,.hljs-number'],
 ['type',workspace_text("breadcrumbs_settings_type"),'.cm-tm-type,.cm-tm-namespace,.cm-tm-attribute,.cm-type,.hljs-type'],['variable',workspace_text("color_catalog_variable"),'.cm-tm-variable,.cm-tm-parameter,.cm-variable,.cm-variable-2,.hljs-variable'],
 ['property',workspace_text("source_symbols_property"),'.cm-tm-property,.cm-property,.hljs-attr'],['operator',workspace_text("color_catalog_operator"),'.cm-tm-operator,.cm-tm-punctuation,.cm-operator,.hljs-operator'],
 ['function',workspace_text("color_catalog_function"),'.cm-def,.cm-tm-function,.hljs-title'],['constant',workspace_text("color_catalog_constant"),'.cm-atom,.cm-tm-constant,.hljs-literal'],['preprocessor',workspace_text("color_catalog_preprocessor"),'.cm-meta,.cm-tm-preprocessor,.hljs-meta'],
 ['builtin',workspace_text("color_catalog_built_in_symbol"),'.cm-builtin,.hljs-built_in'],['tag',workspace_text("color_catalog_marker"),'.cm-tag,.hljs-tag'],
] as const)WORKSPACE_COLOR_ROLES.push({key:'markdown_syntax_'+key,title:workspace_text("color_catalog_fence_syntax")+title,selector:selector.split(',').map(part=>'#write '+part).join(',')});
// selection pseudo-element cannot be placed in:is，it is generated separately by color adaptation.
WORKSPACE_COLOR_ROLES.push({key:'markdown_selection_background',title:workspace_text("color_catalog_selected_text_background_in_document"),variable:'--workspace-markdown-selection-background'},
 {key:'markdown_selection_foreground',title:workspace_text("color_catalog_selected_text_foreground_in_document"),variable:'--workspace-markdown-selection-foreground'});
for(const key of ['background','foreground','selection_inactive_background','black','red','green','yellow','blue','magenta','cyan','white','bright_black','bright_red','bright_green','bright_yellow','bright_blue','bright_magenta','bright_cyan','bright_white'])
 WORKSPACE_COLOR_ROLES.push({key:'terminal_'+key,title:workspace_text("color_catalog_terminal")+key,variable:'--workspace-terminal-'+key.replaceAll('_','-')});
for(const [key,title] of [['base',workspace_text("color_catalog_common_baseline")],['other_1',workspace_text("color_catalog_other_branches1")],['other_2',workspace_text("color_catalog_other_branches2")],['other_3',workspace_text("color_catalog_other_branches3")],['other_4',workspace_text("color_catalog_other_branches4")],['other_5',workspace_text("color_catalog_other_branches5")]])
 WORKSPACE_COLOR_ROLES.push({key:'graph_'+key,title:workspace_text("color_catalog_git_branch")+title,variable:'--workspace-graph-'+key.replaceAll('_','-')});
