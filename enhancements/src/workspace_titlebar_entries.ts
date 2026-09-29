import {workspace_text} from "./workspace_i18n";
import {read_color_config,save_color_config,activate_color_profile} from './workspace_color_settings';
import {get_workspace_recents} from "./workspace_recent";
import {read_breadcrumb_settings,set_breadcrumb_enabled} from "./workspace_breadcrumbs_settings";
import {read_workspace_save_settings} from "./workspace_save_settings";
import {read_terminal_state} from "./terminal_state";
import {native_document_active,read_workspace_sidebar_state} from "./workspace_view_state";
import { WORKSPACE_ZOOM_ACTIONS, workspace_zoom_available } from "./workspace_zoom";
import type { workspace_file_host } from "./workspace_files";
import type { titlebar_menu_definition, titlebar_menu_entry } from "./workspace_titlebar_menu";

export type titlebar_runtime = {
  File?: any;
  EditHelper?: any;
  ClientCommand?: Record<string, (...args: any[]) => unknown>;
  JSBridge?: { invoke(name: string, ...args: unknown[]): any; showInBrowser?(url: string): unknown };
  reqnode?(name: string): any;
  dirname?: string;
  _options?: {userDataPath?: string};
  $?: any;
};

type entry = titlebar_menu_entry;
const separator = (): entry => ({separator: true});

/** Typora 1.14.9 appsrc/window/frame.js: modules 5e ClientCommand and 66 megaMenu, editor.stylize, and searchPanel; window.html data-insert defines block types. Reuse only verified call behavior. The native Menu tree was not obtained; this does not claim complete parity with its entries or state. */
export function create_workspace_titlebar_definitions(
  files: workspace_file_host, runtime: titlebar_runtime, open_files: () => void,
): titlebar_menu_definition[] {
  const workspace = files.core.app.workspace;
  const editor = () => runtime.File?.editor;
  const native_active = () => native_document_active(files,runtime);
  const native_writable = () => native_active() && !runtime.File?.isLocked && !runtime.File?.isReadonlyMode;
  const rich_writable = () => native_writable() && !editor()?.sourceView?.inSourceMode;
  const has_command = (name: string) => typeof runtime.ClientCommand?.[name] === "function";
  const call_command = (name: string, args: unknown[] = []) => runtime.ClientCommand![name](...args);
  const command = (label: string, name: string, shortcut?: string): entry => ({label, shortcut,
    disabled: !has_command(name), action: () => {if (has_command(name)) return call_command(name);}});
  // Document switching after the menu is opened must be invalid, cannot apply actions to new documents or background Markdown.
  const native_entry = (label: string, target: () => any, method: string, args: unknown[] = [],
    shortcut?: string, writable = true, rich = false): entry => {
    const leaf = workspace.activeLeaf;
    const available = () => workspace.activeLeaf === leaf && (rich ? rich_writable() : writable ? native_writable() : native_active())
      && typeof target()?.[method] === "function";
    return {label, shortcut, disabled: !available(), action: () => {if (available()) return target()[method](...args);}};
  };
  const native_command = (label: string, name: string, shortcut?: string, writable = true) =>
    native_entry(label, () => runtime.ClientCommand, name, [], shortcut, writable);
  const style = (label: string, method: string, args: unknown[] = [], shortcut?: string): entry =>
    native_entry(label, () => editor()?.stylize, method, args, shortcut, true, true);
  const edit_command = (label: string, native_name: string, source_name: string, shortcut?: string, writable = true): entry => {
    const leaf = workspace.activeLeaf;
    const available = () => workspace.activeLeaf === leaf && (files.source_editor_active() || ((writable ? native_writable() : native_active()) && has_command(native_name)));
    return {label, shortcut, disabled: !available(), action: () => {
      if (!available()) return;
      if (files.source_editor_active()) files.run_editor_command(source_name); else return call_command(native_name);
    }};
  };
  const close_button = () => {
    const leaf = workspace.activeLeaf;
    return [...((leaf?.parent as any)?.containerEl?.querySelectorAll(".typ-workspace-tab-header .typ-tab") || [])]
      .find((tab: HTMLElement) => tab.dataset.id === leaf?.state.path)?.querySelector(".typ-close") as HTMLElement | undefined;
  };
  const export_entries = async (): Promise<entry[]> => {
    try {
      const data = await runtime.JSBridge?.invoke("setting.loadExports");
      const [builtin, custom] = typeof data === "string" ? JSON.parse(data) : data;
      return Object.entries({...builtin, ...custom}).filter(([, value]) => value && typeof value === "object").map(([key, value]: [string, any]) => {
        const item = native_entry(value.name || key, () => runtime.ClientCommand, "export", [value], undefined, false);
        return item;
      });
    } catch {return [{label: workspace_text("titlebar_entries_cannot_read_export_configuration"), disabled: true}];}
  };
  const file_entries = async (): Promise<entry[]> => {
    const recent_entries=await get_workspace_recents(files)?.entries() || [{label:workspace_text("titlebar_entries_recent_open_service_unavailable"),disabled:true}];
    const exports = await export_entries();
    const leaf = workspace.activeLeaf;
    return [command(workspace_text("titlebar_entries_new"), "newFile", "Ctrl+N"), command(workspace_text("titlebar_entries_new_window"), "newWindow", "Ctrl+Shift+N"), separator(),
      {label:workspace_text("titlebar_entries_open"),shortcut:"Ctrl+O",action:()=>files.core.app.commands.run("linux_note:open_file")}, {label:workspace_text("titlebar_entries_open_folder"),shortcut:"Alt+K Alt+O",action:()=>files.core.app.commands.run("linux_note:open_folder")},
      {label:workspace_text("file_commands_open_recent"),children:recent_entries},
      {label: workspace_text("titlebar_entries_quick_open"), shortcut: "Ctrl+P", action: open_files}, separator(),
      {label: workspace_text("remote_ssh_directory_save"), shortcut: "Ctrl+S", disabled: !files.can_save_active(), action: () => {if (workspace.activeLeaf === leaf && files.can_save_active()) return files.core.app.commands.run("linux_note:save");}},
      {label: workspace_text("file_commands_save_all"),shortcut:"Alt+K S",action:()=>files.core.app.commands.run("linux_note:save_all")},
      {label:workspace_text("save_settings_auto_save"),checked:read_workspace_save_settings()["files.autoSave"]!=="off",action:()=>files.core.app.commands.run("linux_note:auto_save")},
      {label:workspace_text("timeline_auto_save_and_local_history_settings"),action:()=>files.core.app.commands.run("linux_note:save_settings")},
      {label:workspace_text("files_save_as"),shortcut:"Ctrl+Shift+S",disabled:!files.source_editor_active()&&!native_writable(),action:()=>{if(workspace.activeLeaf===leaf)return files.core.app.commands.run("linux_note:save_as");}},
      {label:workspace_text("file_commands_reload_from_disk"),disabled:!files.source_editor_active()&&!native_active(),action:()=>{if(workspace.activeLeaf===leaf)return files.core.app.commands.run("linux_note:reload_file");}},native_command(workspace_text("titlebar_entries_move_to"), "moveTo"),
      native_command(workspace_text("titlebar_entries_open_file_location"), "openFileLocation", undefined, false), separator(),
      command(workspace_text("titlebar_entries_import"), "import"), {label: workspace_text("titlebar_entries_export"), children: exports, disabled: !native_active()},
      {...native_command(workspace_text("titlebar_entries_export_using_last_settings"), "exportLast", undefined, false), disabled: !native_active() || !has_command("exportLast") || !(runtime.File?.option?.lastExport || runtime.File?.option?._lastExport)},
      native_command(workspace_text("titlebar_entries_print"), "print", undefined, false), separator(),
      {label: workspace_text("titlebar_entries_close_tab"), shortcut: "Ctrl+W / Ctrl+F4", disabled: !close_button(), action: () => {if (workspace.activeLeaf === leaf) files.core.app.commands.run("linux_note:close_editor");}},
      {label:workspace_text("file_commands_close_folder"),shortcut:"Alt+K F",disabled:!files.context_root(),action:()=>files.core.app.commands.run("linux_note:close_folder")},
      command(workspace_text("titlebar_entries_preferences"), "showPreferencePanel", "Ctrl+,"), command(workspace_text("titlebar_entries_close_window"), "close", "Alt+F4")];
  };
  const search_entry = (replace: boolean): entry => {
    const leaf = workspace.activeLeaf;
    const available = () => workspace.activeLeaf === leaf && (files.source_editor_active() || (native_active() && typeof editor()?.searchPanel?.showPanel === "function"));
    return {label: replace ? workspace_text("titlebar_entries_find_and_replace") : workspace_text("terminal_surface_find"), shortcut: replace ? "Ctrl+H" : "Ctrl+F", disabled: !available(), action: () => {
      if (!available()) return;
      if (files.source_editor_active()) files.run_editor_command(replace ? "editor.action.startFindReplaceAction" : "actions.find");
      else editor().searchPanel.showPanel(replace);
    }};
  };
  const edit_entries = async (): Promise<entry[]> => [
    edit_command(workspace_text("monaco_text_input_undo"), "undo", "undo", "Ctrl+Z"), edit_command(workspace_text("monaco_text_input_redo"), "redo", "redo", "Ctrl+Y"), separator(),
    edit_command(workspace_text("git_diff_editor_cut"), "cut", "editor.action.clipboardCutAction", "Ctrl+X"),
    edit_command(workspace_text("monaco_text_input_copy"), "copy", "editor.action.clipboardCopyAction", "Ctrl+C", false),
    edit_command(workspace_text("git_diff_editor_paste"), "paste", "editor.action.clipboardPasteAction", "Ctrl+V"),
    native_command(workspace_text("titlebar_entries_copy_as_markdown"), "copyAsMarkdown", undefined, false),
    native_command(workspace_text("titlebar_entries_copy_as_html_code"), "copyAsHTMLSource", undefined, false),
    native_command(workspace_text("titlebar_entries_copy_as_plain_text"), "copyAsPlainText", undefined, false),
    native_command(workspace_text("titlebar_entries_paste_as_plain_text"), "pasteAsPlain", "Ctrl+Shift+V"), separator(),
    edit_command(workspace_text("monaco_text_input_select_all"), "selectAll", "editor.action.selectAll", "Ctrl+A", false),
    native_command(workspace_text("titlebar_entries_delete_current_word"), "deleteWord"), native_command(workspace_text("titlebar_entries_delete_current_formatted_text"), "deleteScope"),
    native_command(workspace_text("titlebar_entries_delete_current_line_sentence"), "deleteLine"), native_command(workspace_text("titlebar_entries_delete_block"), "deleteBlock"), separator(),
    search_entry(false), search_entry(true),
    {label: workspace_text("titlebar_entries_search_in_file"), shortcut: "Ctrl+Shift+F", action: () => files.core.app.commands.run("linux_note:search")},
  ];
  const paragraph_entries = async (): Promise<entry[]> => [
    ...[1,2,3,4,5,6].map(level => style(workspace_text("titlebar_entries_level_heading", {value_0: String([workspace_text("titlebar_entries_1"),workspace_text("titlebar_entries_two"),workspace_text("titlebar_entries_three"),workspace_text("titlebar_entries_four"),workspace_text("titlebar_entries_five"),workspace_text("titlebar_entries_six")][level-1])}), "changeBlock", [`header${level}`], `Ctrl+${level}`)),
    style(workspace_text("titlebar_entries_document_content"), "changeBlock", ["paragraph"], "Ctrl+0"),
    style(workspace_text("titlebar_entries_increase_heading_level"), "increaseHeaderLevel", [], "Ctrl+="), style(workspace_text("titlebar_entries_decrease_heading_level"), "decreaseHeaderLevel", [], "Ctrl+-"), separator(),
    native_entry(workspace_text("titlebar_entries_table"), () => editor()?.tableEdit, "insertTable", [], "Ctrl+T", true, true),
    style(workspace_text("titlebar_entries_code_block"), "toggleFences"), style(workspace_text("titlebar_entries_formula_block"), "toggleMathBlock"), style(workspace_text("titlebar_entries_citation"), "toggleIndent", ["blockquote"]),
    style(workspace_text("titlebar_entries_ordered_list"), "toggleIndent", ["ol"]), style(workspace_text("titlebar_entries_unordered_list"), "toggleIndent", ["ul"]), style(workspace_text("titlebar_entries_task_list"), "toggleIndent", ["tasklist"]),
    style(workspace_text("titlebar_entries_toggle_task_status"), "toggleTaskStatus"),
    native_entry(workspace_text("titlebar_entries_increase_indentation"), () => editor()?.UserOp, "moreIndent", [editor()], "Ctrl+]", true, true),
    native_entry(workspace_text("titlebar_entries_decrease_indentation"), () => editor()?.UserOp, "lessIndent", [editor()], "Ctrl+[", true, true), separator(),
    style(workspace_text("titlebar_entries_link_reference"), "insertBlock", ["def_link"]), style(workspace_text("titlebar_entries_footnote"), "insertBlock", ["def_footnote"]),
    style(workspace_text("titlebar_entries_horizontal_rule"), "insertBlock", ["hr"]), style(workspace_text("titlebar_entries_table_of_contents"), "insertBlock", ["toc"]), style("YAML Front Matter", "insertMetaBlock"),
  ];
  const format_entries = async (): Promise<entry[]> => {
    const bookmark = editor()?.styleBookmark?.style;
    return [...([ [workspace_text("titlebar_entries_bold"),"strong"], [workspace_text("titlebar_entries_italic"),"em"], [workspace_text("terminal_settings_view_underline"),"underline"], [workspace_text("titlebar_entries_code"),"code"], [workspace_text("titlebar_entries_inline_formula"),"inline_math"],
      [workspace_text("titlebar_entries_strikethrough"),"del"], [workspace_text("titlebar_entries_highlight"),"highlight"], [workspace_text("titlebar_entries_superscript"),"superscript"], [workspace_text("titlebar_entries_subscript"),"subscript"], [workspace_text("color_catalog_comment"),"comment"],
      [workspace_text("titlebar_entries_hyperlink"),"link"], [workspace_text("titlebar_entries_image"),"image"] ] as const).map(([label,name]) => ({...style(label,"toggleStyle",[name],({strong:"Ctrl+B",em:"Ctrl+I",underline:"Ctrl+U",code:"Ctrl+Shift+`",link:"Ctrl+K",image:"Ctrl+Shift+I"} as Record<string,string>)[name]), checked: Boolean(native_active() && bookmark?.inline?.includes(name))})),
      separator(), style(workspace_text("titlebar_entries_clear_style"), "clearStyle", [], "Ctrl+\\")];
  };
  const terminal_entries=async():Promise<entry[]>=>{
    const state=read_terminal_state(files.core.app),session_id=state?.active_id;
    const terminal_entry=(label:string,id:string,session=false,shortcut?:string):entry=>({label,shortcut,disabled:!state||(session&&!state.active_id),action:()=>{
      const current=read_terminal_state(files.core.app);
      if(current&&(!session||Boolean(current.active_id)&&current.active_id===session_id))files.core.app.commands.run("linux_note:"+id);
    }});
    return [terminal_entry(workspace_text("titlebar_entries_new_terminal"),"terminal",false,"Alt+Shift+`"),terminal_entry(workspace_text("terminal_workspace_split_terminal"),"terminal_split",true),
      {...terminal_entry(workspace_text("titlebar_entries_show_hide_terminal"),"terminal_toggle",false,"Ctrl+`"),checked:Boolean(state?.panel_visible)},separator(),
      terminal_entry(workspace_text("titlebar_entries_find"),"terminal_find",true),terminal_entry(workspace_text("terminal_workspace_clear_screen"),"terminal_clear",true),terminal_entry(workspace_text("terminal_workspace_rename"),"terminal_rename",true),separator(),
      {...terminal_entry(workspace_text("titlebar_entries_move_to_editor"),"terminal_move_editor",true),disabled:!state?.active_id||state.location==="editor"},
      {...terminal_entry(workspace_text("terminal_workspace_move_to_panel"),"terminal_move_panel",true),disabled:!state?.active_id||state.location==="panel"},separator(),
      terminal_entry(workspace_text("terminal_workspace_restart_terminal"),"terminal_restart",true),terminal_entry(workspace_text("terminal_workspace_terminate_terminal"),"terminal_kill",true),separator(),terminal_entry(workspace_text("terminal_workspace_terminal_settings_e950837d"),"terminal_settings")];
  };
  const toggle_sidebar_view=(id:string,command_id:string)=>{
    const current=read_workspace_sidebar_state(workspace.sidebar);
    if(current.sidebar_visible&&current.active_id===id)workspace.sidebar.hide();
    else files.core.app.commands.run(command_id);
  };
  const view_entries = async (): Promise<entry[]> => {
    const sidebar=read_workspace_sidebar_state(workspace.sidebar),terminal=read_terminal_state(files.core.app);
    const toolbar=editor()?.toolbar?.dom;
    return [
    {...native_entry(workspace_text("titlebar_entries_source_code_mode"), () => runtime.File, "toggleSourceMode", [], "Ctrl+/", false), checked: Boolean(native_active() && editor()?.sourceView?.inSourceMode)},
    {...native_entry(workspace_text("titlebar_entries_read_only_mode"), () => runtime.EditHelper, "toggleReadonlyMode", [], undefined, false), checked: Boolean(native_active() && runtime.File?.isReadonlyMode)},
    {...native_entry(workspace_text("titlebar_entries_focus_mode"), editor, "toggleFocusMode", [], "F8", false), checked: Boolean(runtime.File?.isFocusMode)},
    {...native_entry(workspace_text("titlebar_entries_typewriter_mode"), editor, "toggleTypeWriterMode", [], "F9", false), checked: Boolean(runtime.File?.isTypeWriterMode)}, separator(),
    {label: workspace_text("titlebar_entries_show_hide_sidebar"), shortcut: "Alt+B", checked:sidebar.sidebar_visible, action: () => workspace.sidebar.toggle()},
    {label:workspace_text("titlebar_entries_breadcrumbs_navigation"),checked:read_breadcrumb_settings(files.context_root()).enabled,action:()=>set_breadcrumb_enabled(files.context_root(),!read_breadcrumb_settings(files.context_root()).enabled)},
    {label:workspace_text("breadcrumbs_breadcrumbs_settings"),action:()=>files.core.app.commands.run("linux_note:breadcrumbs_settings")},
    {label: workspace_text("titlebar_entries_outline"), checked:sidebar.sidebar_visible&&sidebar.active_id==="core.outline", action: () => toggle_sidebar_view("core.outline","linux_note:outline")},
    {label: workspace_text("titlebar_entries_file_tree"), checked:sidebar.sidebar_visible&&sidebar.active_id==="core.file-explorer", action: () => toggle_sidebar_view("core.file-explorer","linux_note:file_explorer")},
    {label:workspace_text("community_plugins_extension"),shortcut:"Ctrl+Shift+X",checked:sidebar.sidebar_visible&&sidebar.active_id==="typora_code:community_plugins",action:()=>toggle_sidebar_view("typora_code:community_plugins","typora_code:community_plugins")},
    {...command(workspace_text("titlebar_entries_status_bar"), "toggleStatusBar"),checked:document.body.classList.contains("show-footer")},
    {...native_command(workspace_text("titlebar_entries_toolbar"), "toggleToolbar",undefined,false),checked:Boolean(native_active()&&toolbar?.getClientRects().length&&getComputedStyle(toolbar).display!=="none")},
    {label:workspace_text("terminal_panel_terminal"),shortcut:"Ctrl+`",checked:Boolean(terminal?.panel_visible),disabled:!terminal,action:()=>files.core.app.commands.run("linux_note:terminal_toggle")},separator(),
    ...WORKSPACE_ZOOM_ACTIONS.map(({id, label, shortcut}) => ({label, shortcut,
      disabled: !workspace_zoom_available(runtime, id), action: () => {
        if (workspace_zoom_available(runtime, id)) files.core.app.commands.run(id);
      }})),
  ];
  };
  const theme_entries = async (): Promise<entry[]> => {
    const customize:entry={label:workspace_text("titlebar_entries_custom_color"),action:()=>files.core.app.commands.run('typora_code:custom_colors')};
    try {
      const data = await runtime.JSBridge?.invoke("setting.getThemes");
      if (!Array.isArray(data?.all)) throw new Error("invalid themes");
      const config=read_color_config(),profiles=(config.profiles||[]).map(profile=>({label:profile.name,checked:data.current===`vscode2026_${profile.mode}.css`&&config.active?.[profile.mode]===profile.id,disabled:!has_command('setTheme'),action:()=>activate_color_profile(profile.id,(file,name)=>call_command('setTheme',[file,name]))}));
      return [customize,...profiles,separator(),...data.all.filter((name:unknown) => typeof name === "string").map((name:string) => {
        const paired_names:Record<string,string>={'cpp_github-consolas_light.css':'CppGithubConsoles_Light','cpp_github-consolas_dark.css':'CppGithubConsoles_Dark','vscode2026_light.css':'VSCode2026_Light','vscode2026_dark.css':'VSCode2026_Dark'};
        const display = paired_names[name] || name.replace(/\.css$/i, "").replace(/(?:^|_|-)(\w)/g, (_:string, letter:string) => letter.toUpperCase());
        return {label: display, checked: name === data.current && !(name.startsWith("vscode2026_") && (name.includes("dark")?config.active?.dark:name.includes("light")?config.active?.light:false)), disabled: !has_command("setTheme"), action: () => {if (has_command("setTheme")){const config=read_color_config();config.active={};save_color_config(config);return call_command("setTheme", [name, display]);}}};
      })];
    } catch {return [customize,separator(),{label: workspace_text("titlebar_entries_cannot_read_theme_list"), disabled: true}];}
  };
  const help_document = (label: string, filename = label): entry => ({label,
    disabled: !runtime.dirname || !runtime.JSBridge?.invoke,
    action: () => runtime.dirname && runtime.JSBridge?.invoke("app.openFile", `${runtime.dirname}/Docs/${filename}.md`, {forceCreateWindow: true}),
  });
  const help_url = (label: string, url: string): entry => ({label,
    disabled: !runtime.JSBridge?.showInBrowser, action: () => runtime.JSBridge?.showInBrowser?.(url),
  });
  const help_invoke = (label: string, method: string): entry => ({label,
    disabled: !runtime.JSBridge?.invoke, action: () => runtime.JSBridge?.invoke(method),
  });
  const help_entries = async (): Promise<entry[]> => {
    // Typora 1.14.10 native help: local Docs, mirror options and host IPC, do not establish help/license owner separately.
    const domain = runtime.File?.option?.useMirrorInCN ? "typoraio.cn" : "typora.io";
    return [help_url("What's New...", `https://support.${domain}/What's-New/`), separator(),
      help_document("Quick Start"), help_document("Markdown Reference"), help_document("Install and Use Pandoc"),
      help_document("Custom Themes"), help_document("Use Images in Typora"),
      help_document("Data Recovery and Version Control", "Auto Save, Version Control and Recovery"),
      help_url("More Topics...", `https://support.${domain}/`), separator(),
      help_document(workspace_text("titlebar_entries_credits"), "Credits"), help_document(workspace_text("titlebar_entries_release_notes"), "Change Log"), help_document(workspace_text("titlebar_entries_privacy_policy"), "Privacy Policy"),
      help_url(workspace_text("titlebar_entries_official_website"), `https://${domain}`), help_url(workspace_text("titlebar_entries_feedback"), "mailto:hi@typora.io"), separator(),
      help_invoke(workspace_text("titlebar_entries_check_for_updates"), "updater.checkForUpdates"), help_invoke(workspace_text("titlebar_entries_my_license"), "license.show"),
      {label: workspace_text("titlebar_entries_about"), disabled: !runtime.File?.megaMenu?.show || !runtime.$,
        action: () => {
          runtime.File?.megaMenu?.closePreferencePanel();
          if (document.body.classList.contains("native-window")) {
            runtime.$('.modal:not(.block-modal)').modal('hide'); runtime.$('#about-dialog').modal('show'); runtime.$('*:focus').blur();
          } else {runtime.File?.megaMenu?.show(); runtime.$('#m-about').trigger('click');}
        }}, separator(),
      {label: workspace_text("titlebar_entries_operation_guide"), action: () => files.core.app.commands.run("typora_code:operation_guide")},
      {label: workspace_text("titlebar_entries_operation_instructions_and_keyboard_shortcuts"), action: () => files.core.app.commands.run("typora_code:operation_manual")},
      {label: workspace_text("titlebar_entries_check_typora_code_update"), action: () => files.core.app.commands.run("typora_code:check_update")},
      help_url(workspace_text("titlebar_entries_typora_code_github_repository"), "https://github.com/FormingSystem/typora_code"),
    ];
  };
  return [
    {label: workspace_text("recent_view_file"), mnemonic: "F", entries: file_entries}, {label: workspace_text("titlebar_entries_edit"), mnemonic: "E", entries: edit_entries},
    {label: workspace_text("titlebar_entries_paragraph"), mnemonic: "P", entries: paragraph_entries}, {label: workspace_text("titlebar_entries_format"), mnemonic: "O", entries: format_entries},
    {label: workspace_text("titlebar_entries_view"), mnemonic: "V", entries: view_entries}, {label: workspace_text("titlebar_entries_theme"), mnemonic: "T", entries: theme_entries},
    {label: workspace_text("terminal_panel_terminal"), mnemonic: "R", entries: terminal_entries},
    {label: workspace_text("titlebar_entries_help"), mnemonic: "H", entries: help_entries},
  ];
}
