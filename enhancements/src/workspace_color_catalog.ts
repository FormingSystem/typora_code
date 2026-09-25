/** 自定义颜色的稳定角色目录。默认值继续由主题CSS拥有；不得在此复制色值。 */
export type workspace_color_role={key:string;title:string;variable?:string;selector?:string;property?:string};
export const WORKSPACE_COLOR_ROLES:workspace_color_role[]=[
  {
    "key": "vscode_title_bar_active_foreground",
    "title": "标题栏活动文字",
    "variable": "--vscode-titleBar-activeForeground"
  },
  {
    "key": "vscode_status_bar_foreground",
    "title": "状态栏文字",
    "variable": "--vscode-statusBar-foreground"
  },
  {
    "key": "vscode_status_bar_item_hover_background",
    "title": "状态栏项悬停背景",
    "variable": "--vscode-statusBarItem-hoverBackground"
  },
  {
    "key": "vscode_menu_background",
    "title": "菜单背景",
    "variable": "--vscode-menu-background"
  },
  {
    "key": "vscode_menu_foreground",
    "title": "菜单文字",
    "variable": "--vscode-menu-foreground"
  },
  {
    "key": "vscode_menu_border",
    "title": "菜单边框",
    "variable": "--vscode-menu-border"
  },
  {
    "key": "vscode_menu_separator_background",
    "title": "菜单分隔线背景",
    "variable": "--vscode-menu-separatorBackground"
  },
  {
    "key": "vscode_input_placeholder_foreground",
    "title": "输入框占位文字",
    "variable": "--vscode-input-placeholderForeground"
  },
  {
    "key": "vscode_text_block_quote_background",
    "title": "文本块引用背景",
    "variable": "--vscode-textBlockQuote-background"
  },
  {
    "key": "vscode_text_block_quote_border",
    "title": "文本块引用边框",
    "variable": "--vscode-textBlockQuote-border"
  },
  {
    "key": "vscode_text_code_block_background",
    "title": "文本代码块背景",
    "variable": "--vscode-textCodeBlock-background"
  },
  {
    "key": "vscode_text_preformat_background",
    "title": "文本行内代码背景",
    "variable": "--vscode-textPreformat-background"
  },
  {
    "key": "vscode_text_preformat_foreground",
    "title": "文本行内代码文字",
    "variable": "--vscode-textPreformat-foreground"
  },
  {
    "key": "vscode_terminal_selection_background",
    "title": "终端选择背景",
    "variable": "--vscode-terminal-selectionBackground"
  },
  {
    "key": "vscode_terminal_cursor_foreground",
    "title": "终端光标文字",
    "variable": "--vscode-terminalCursor-foreground"
  },
  {
    "key": "vscode_terminal_cursor_background",
    "title": "终端光标背景",
    "variable": "--vscode-terminalCursor-background"
  },
  {
    "key": "markdown_heading",
    "title": "正文标题",
    "variable": "--workspace-markdown-heading"
  },
  {
    "key": "vscode_foreground",
    "title": "文字",
    "variable": "--vscode-foreground"
  },
  {
    "key": "vscode_description_foreground",
    "title": "说明文字",
    "variable": "--vscode-descriptionForeground"
  },
  {
    "key": "vscode_focus_border",
    "title": "焦点边框",
    "variable": "--vscode-focusBorder"
  },
  {
    "key": "vscode_button_background",
    "title": "按钮背景",
    "variable": "--vscode-button-background"
  },
  {
    "key": "vscode_button_foreground",
    "title": "按钮文字",
    "variable": "--vscode-button-foreground"
  },
  {
    "key": "vscode_button_hover_background",
    "title": "按钮悬停背景",
    "variable": "--vscode-button-hoverBackground"
  },
  {
    "key": "vscode_input_background",
    "title": "输入框背景",
    "variable": "--vscode-input-background"
  },
  {
    "key": "vscode_input_border",
    "title": "输入框边框",
    "variable": "--vscode-input-border"
  },
  {
    "key": "vscode_input_foreground",
    "title": "输入框文字",
    "variable": "--vscode-input-foreground"
  },
  {
    "key": "vscode_side_bar_background",
    "title": "侧栏背景",
    "variable": "--vscode-sideBar-background"
  },
  {
    "key": "vscode_side_bar_border",
    "title": "侧栏边框",
    "variable": "--vscode-sideBar-border"
  },
  {
    "key": "vscode_panel_background",
    "title": "面板背景",
    "variable": "--vscode-panel-background"
  },
  {
    "key": "vscode_panel_border",
    "title": "面板边框",
    "variable": "--vscode-panel-border"
  },
  {
    "key": "vscode_status_bar_background",
    "title": "状态栏背景",
    "variable": "--vscode-statusBar-background"
  },
  {
    "key": "vscode_editor_background",
    "title": "编辑器背景",
    "variable": "--vscode-editor-background"
  },
  {
    "key": "vscode_editor_foreground",
    "title": "编辑器文字",
    "variable": "--vscode-editor-foreground"
  },
  {
    "key": "vscode_editor_group_header_tabs_background",
    "title": "编辑器组表头标签背景",
    "variable": "--vscode-editorGroupHeader-tabsBackground"
  },
  {
    "key": "vscode_activity_bar_inactive_foreground",
    "title": "活动栏非活动文字",
    "variable": "--vscode-activityBar-inactiveForeground"
  },
  {
    "key": "vscode_activity_bar_foreground",
    "title": "活动栏文字",
    "variable": "--vscode-activityBar-foreground"
  },
  {
    "key": "vscode_activity_bar_active_border",
    "title": "活动栏活动边框",
    "variable": "--vscode-activityBar-activeBorder"
  },
  {
    "key": "vscode_modern_activity_bar_item_active_background",
    "title": "活动栏项活动背景",
    "variable": "--vscode-modernActivityBarItem-activeBackground"
  },
  {
    "key": "vscode_modern_activity_bar_item_hover_background",
    "title": "活动栏项悬停背景",
    "variable": "--vscode-modernActivityBarItem-hoverBackground"
  },
  {
    "key": "vscode_modern_activity_bar_item_active_foreground",
    "title": "活动栏项活动文字",
    "variable": "--vscode-modernActivityBarItem-activeForeground"
  },
  {
    "key": "vscode_text_link_foreground",
    "title": "文本链接文字",
    "variable": "--vscode-textLink-foreground"
  },
  {
    "key": "ui_background",
    "title": "通用背景",
    "variable": "--workspace-ui-background"
  },
  {
    "key": "ui_chrome",
    "title": "通用框架",
    "variable": "--workspace-ui-chrome"
  },
  {
    "key": "ui_foreground",
    "title": "通用文字",
    "variable": "--workspace-ui-foreground"
  },
  {
    "key": "ui_muted",
    "title": "通用次要文字",
    "variable": "--workspace-ui-muted"
  },
  {
    "key": "ui_border",
    "title": "通用边框",
    "variable": "--workspace-ui-border"
  },
  {
    "key": "ui_control_border",
    "title": "通用控件边框",
    "variable": "--workspace-ui-control-border"
  },
  {
    "key": "ui_input",
    "title": "通用输入框",
    "variable": "--workspace-ui-input"
  },
  {
    "key": "ui_elevated",
    "title": "通用浮层",
    "variable": "--workspace-ui-elevated"
  },
  {
    "key": "ui_focus",
    "title": "通用焦点",
    "variable": "--workspace-ui-focus"
  },
  {
    "key": "ui_selection",
    "title": "通用选择",
    "variable": "--workspace-ui-selection"
  },
  {
    "key": "vscode_list_active_selection_background",
    "title": "列表活动选择背景",
    "variable": "--vscode-list-activeSelectionBackground"
  },
  {
    "key": "vscode_list_active_selection_foreground",
    "title": "列表活动选择文字",
    "variable": "--vscode-list-activeSelectionForeground"
  },
  {
    "key": "ui_hover",
    "title": "通用悬停",
    "variable": "--workspace-ui-hover"
  },
  {
    "key": "vscode_list_hover_background",
    "title": "列表悬停背景",
    "variable": "--vscode-list-hoverBackground"
  },
  {
    "key": "vscode_list_active_selection_icon_foreground",
    "title": "列表活动选择图标文字",
    "variable": "--vscode-list-activeSelectionIconForeground"
  },
  {
    "key": "vscode_list_focus_and_selection_outline",
    "title": "列表焦点与选择轮廓",
    "variable": "--vscode-list-focusAndSelectionOutline"
  },
  {
    "key": "vscode_menu_selection_background",
    "title": "菜单选择背景",
    "variable": "--vscode-menu-selectionBackground"
  },
  {
    "key": "vscode_list_inactive_selection_background",
    "title": "列表非活动选择背景",
    "variable": "--vscode-list-inactiveSelectionBackground"
  },
  {
    "key": "vscode_list_inactive_selection_foreground",
    "title": "列表非活动选择文字",
    "variable": "--vscode-list-inactiveSelectionForeground"
  },
  {
    "key": "vscode_list_hover_foreground",
    "title": "列表悬停文字",
    "variable": "--vscode-list-hoverForeground"
  },
  {
    "key": "vscode_list_drop_background",
    "title": "列表拖放背景",
    "variable": "--vscode-list-dropBackground"
  },
  {
    "key": "vscode_list_focus_background",
    "title": "列表焦点背景",
    "variable": "--vscode-list-focusBackground"
  },
  {
    "key": "vscode_list_focus_foreground",
    "title": "列表焦点文字",
    "variable": "--vscode-list-focusForeground"
  },
  {
    "key": "vscode_list_focus_outline",
    "title": "列表焦点轮廓",
    "variable": "--vscode-list-focusOutline"
  },
  {
    "key": "vscode_list_highlight_foreground",
    "title": "列表匹配文字",
    "variable": "--vscode-list-highlightForeground"
  },
  {
    "key": "vscode_list_invalid_item_foreground",
    "title": "列表无效项文字",
    "variable": "--vscode-list-invalidItemForeground"
  },
  {
    "key": "vscode_list_error_foreground",
    "title": "列表错误文字",
    "variable": "--vscode-list-errorForeground"
  },
  {
    "key": "vscode_list_warning_foreground",
    "title": "列表警告文字",
    "variable": "--vscode-list-warningForeground"
  },
  {
    "key": "vscode_menubar_selection_background",
    "title": "菜单栏选择背景",
    "variable": "--vscode-menubar-selectionBackground"
  },
  {
    "key": "vscode_diff_editor_inserted_text_background",
    "title": "差异编辑器新增文本背景",
    "variable": "--vscode-diffEditor-insertedTextBackground"
  },
  {
    "key": "vscode_diff_editor_removed_text_background",
    "title": "差异编辑器删除文本背景",
    "variable": "--vscode-diffEditor-removedTextBackground"
  },
  {
    "key": "vscode_toolbar_hover_background",
    "title": "工具栏悬停背景",
    "variable": "--vscode-toolbar-hoverBackground"
  },
  {
    "key": "vscode_quick_input_list_focus_background",
    "title": "快速输入框列表焦点背景",
    "variable": "--vscode-quickInputList-focusBackground"
  },
  {
    "key": "vscode_quick_input_list_focus_foreground",
    "title": "快速输入框列表焦点文字",
    "variable": "--vscode-quickInputList-focusForeground"
  },
  {
    "key": "vscode_quick_input_list_focus_icon_foreground",
    "title": "快速输入框列表焦点图标文字",
    "variable": "--vscode-quickInputList-focusIconForeground"
  },
  {
    "key": "vscode_quick_input_list_focus_highlight_foreground",
    "title": "快速输入框列表焦点匹配文字",
    "variable": "--vscode-quickInputList-focusHighlightForeground"
  },
  {
    "key": "vscode_charts_blue",
    "title": "图表蓝色",
    "variable": "--vscode-charts-blue"
  },
  {
    "key": "vscode_charts_purple",
    "title": "图表紫色",
    "variable": "--vscode-charts-purple"
  },
  {
    "key": "vscode_editor_gutter_modified_background",
    "title": "编辑器边栏修改背景",
    "variable": "--vscode-editorGutter-modifiedBackground"
  },
  {
    "key": "list_background",
    "title": "列表背景",
    "variable": "--workspace-list-background"
  },
  {
    "key": "markdown_link",
    "title": "正文链接",
    "variable": "--workspace-markdown-link"
  }
];

// 阅读角色只覆写颜色；未配置时完全继承原主题的排版和表格边线。
const body_roles:[string,string,string,string?][]=[
 ['markdown_background','正文背景','#write','background-color'],
 ['markdown_foreground','正文文字','#write'],
 ['markdown_heading','正文标题（所有级别）','#write h1,#write h2,#write h3,#write h4,#write h5,#write h6'],
 ['markdown_link','正文链接','#write a[href],#write a[href]:is(:hover,:focus,:active,:visited)'],
 ['markdown_link_visited','正文链接·已访问','#write a[href]:visited'],
 ['markdown_link_hover','正文链接·悬停/焦点','#write a[href]:hover,#write a[href]:focus,#write a[href]:active'],
 ['markdown_strong','正文加粗','#write strong'],['markdown_emphasis','正文斜体','#write em'],
 ['markdown_quote_foreground','引用文字','#write blockquote'],
 ['markdown_quote_background','引用背景','#write blockquote','background-color'],
 ['markdown_quote_border','引用边线','#write blockquote','border-color'],
 ['markdown_table_foreground','表格文字','#write table'],
 ['markdown_table_background','表格背景','#write table,#write tr,#write td','background-color'],
 ['markdown_table_border','表格边线','#write table,#write th,#write td','border-color'],
 ['markdown_table_header_foreground','表头文字','#write th'],
 ['markdown_table_header_background','表头背景','#write th','background-color'],
 ['markdown_table_alternate_background','表格隔行背景','#write tbody tr:nth-child(even),#write tbody tr:nth-child(even) td','background-color'],
 ['markdown_code_foreground','行内代码文字','#write code'],
 ['markdown_code_background','行内代码背景','#write code','background-color'],
 ['markdown_fence_foreground','代码围栏文字','#write pre,#write pre code,#write .md-fences,#write .CodeMirror'],
 ['markdown_fence_background','代码围栏背景','#write pre,#write pre code,#write .md-fences,#write .CodeMirror','background-color'],
 ['markdown_rule','水平分隔线','#write hr','border-color'],
 ['markdown_mark_foreground','高亮文字','#write mark'],
 ['markdown_mark_background','高亮背景','#write mark','background-color'],
];
for(let level=1;level<=6;level++)body_roles.push(['markdown_heading_'+level,'正文H'+level+'标题','#write h'+level]);
for(const [key,title,selector,property] of body_roles){
 const existing=WORKSPACE_COLOR_ROLES.find(role=>role.key===key);
 if(existing)Object.assign(existing,{selector,property});else WORKSPACE_COLOR_ROLES.push({key,title,selector,property});
}
for(const [key,title,selector] of [
 ['comment','注释','.cm-tm-comment,.cm-comment,.hljs-comment'],['keyword','关键字','.cm-tm-keyword,.cm-tm-control,.cm-keyword,.hljs-keyword'],
 ['string','字符串','.cm-tm-string,.cm-string,.cm-string-2,.hljs-string'],['number','数字','.cm-tm-number,.cm-number,.hljs-number'],
 ['type','类型','.cm-tm-type,.cm-tm-namespace,.cm-tm-attribute,.cm-type,.hljs-type'],['variable','变量','.cm-tm-variable,.cm-tm-parameter,.cm-variable,.cm-variable-2,.hljs-variable'],
 ['property','属性','.cm-tm-property,.cm-property,.hljs-attr'],['operator','运算符','.cm-tm-operator,.cm-tm-punctuation,.cm-operator,.hljs-operator'],
 ['function','函数','.cm-def,.cm-tm-function,.hljs-title'],['constant','常量','.cm-atom,.cm-tm-constant,.hljs-literal'],['preprocessor','预处理','.cm-meta,.cm-tm-preprocessor,.hljs-meta'],
 ['builtin','内置符号','.cm-builtin,.hljs-built_in'],['tag','标记','.cm-tag,.hljs-tag'],
] as const)WORKSPACE_COLOR_ROLES.push({key:'markdown_syntax_'+key,title:'围栏语法·'+title,selector:selector.split(',').map(part=>'#write '+part).join(',')});
// selection伪元素不能放在:is中，由颜色适配单独生成。
WORKSPACE_COLOR_ROLES.push({key:'markdown_selection_background',title:'正文选中文字背景',variable:'--workspace-markdown-selection-background'},
 {key:'markdown_selection_foreground',title:'正文选中文字前景',variable:'--workspace-markdown-selection-foreground'});
for(const key of ['background','foreground','selection_inactive_background','black','red','green','yellow','blue','magenta','cyan','white','bright_black','bright_red','bright_green','bright_yellow','bright_blue','bright_magenta','bright_cyan','bright_white'])
 WORKSPACE_COLOR_ROLES.push({key:'terminal_'+key,title:'终端 '+key,variable:'--workspace-terminal-'+key.replaceAll('_','-')});
for(const [key,title] of [['base','共同基准'],['other_1','其他分支1'],['other_2','其他分支2'],['other_3','其他分支3'],['other_4','其他分支4'],['other_5','其他分支5']])
 WORKSPACE_COLOR_ROLES.push({key:'graph_'+key,title:'Git支线·'+title,variable:'--workspace-graph-'+key.replaceAll('_','-')});
