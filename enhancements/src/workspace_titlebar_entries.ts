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
  _options?: {userDataPath?: string};
  $?: any;
};

type entry = titlebar_menu_entry;
const separator = (): entry => ({separator: true});

/**
 * Typora 1.14.9 appsrc/window/frame.js：模块 5e ClientCommand、66 megaMenu，
 * editor.stylize 与 searchPanel；window.html 的 data-insert 定义块类型。
 * 仅重用核对过的调用事实，未取得原生 Menu 树，不声称完整复制其条目/状态。
 */
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
  // 菜单打开后的文档切换必须失效，不能把动作施加到新文档或后台 Markdown。
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
  const recent_entries = (items: any[]): entry[] => (Array.isArray(items) ? items : []).filter(item => typeof item?.path === "string").map(item => ({
    label: item.name || files.path_api.basename(item.path), title: item.path,
    // 复用文件路由和打开保护，不直接调用旧后台 Markdown 文档。
    action: () => files.open_file(item.path),
  }));
  const export_entries = async (): Promise<entry[]> => {
    try {
      const data = await runtime.JSBridge?.invoke("setting.loadExports");
      const [builtin, custom] = typeof data === "string" ? JSON.parse(data) : data;
      return Object.entries({...builtin, ...custom}).filter(([, value]) => value && typeof value === "object").map(([key, value]: [string, any]) => {
        const item = native_entry(value.name || key, () => runtime.ClientCommand, "export", [value], undefined, false);
        return item;
      });
    } catch {return [{label: "无法读取导出配置", disabled: true}];}
  };
  const file_entries = async (): Promise<entry[]> => {
    let recents: any = {};
    try {recents = await runtime.JSBridge?.invoke("setting.getRecentFiles") || {};} catch { /* 不伪造最近记录。 */ }
    const exports = await export_entries();
    const leaf = workspace.activeLeaf;
    return [command("新建", "newFile", "Ctrl+N"), command("新建窗口", "newWindow", "Ctrl+Shift+N"), separator(),
      {label:"打开…",shortcut:"Ctrl+O",action:()=>files.core.app.commands.run("linux_note:open_file")}, {label:"打开文件夹…",shortcut:"Ctrl+K Ctrl+O",action:()=>files.core.app.commands.run("linux_note:open_folder")},
      {label: "打开最近文件", children: recent_entries(recents.files), disabled: !recents.files?.length},
      {label: "最近使用的目录", children: (Array.isArray(recents.folders) ? recents.folders : []).filter((item:any)=>typeof item?.path==="string").map((item:any)=>({label:item.name||files.path_api.basename(item.path),title:item.path,action:()=>files.core.app.commands.run("linux_note:open_folder_path",[item.path])})),disabled:!recents.folders?.length},
      {label: "快速打开…", shortcut: "Ctrl+P", action: open_files}, separator(),
      {label: "保存", shortcut: "Ctrl+S", disabled: !files.can_save_active(), action: () => {if (workspace.activeLeaf === leaf && files.can_save_active()) return files.core.app.commands.run("linux_note:save");}},
      {label: "保存全部",shortcut:"Ctrl+K S",action:()=>files.core.app.commands.run("linux_note:save_all")},
      {label:"自动保存",checked:read_workspace_save_settings()["files.autoSave"]!=="off",action:()=>files.core.app.commands.run("linux_note:auto_save")},
      {label:"自动保存与本地历史设置…",action:()=>files.core.app.commands.run("linux_note:save_settings")},
      {label:"另存为…",shortcut:"Ctrl+Shift+S",disabled:!files.source_editor_active()&&!native_writable(),action:()=>{if(workspace.activeLeaf===leaf)return files.core.app.commands.run("linux_note:save_as");}},
      {label:"从磁盘重新加载",disabled:!files.source_editor_active()&&!native_active(),action:()=>{if(workspace.activeLeaf===leaf)return files.core.app.commands.run("linux_note:reload_file");}},native_command("移动到…", "moveTo"),
      native_command("打开文件位置", "openFileLocation", undefined, false), separator(),
      command("导入…", "import"), {label: "导出", children: exports, disabled: !native_active()},
      {...native_command("使用上一次设置导出", "exportLast", undefined, false), disabled: !native_active() || !has_command("exportLast") || !(runtime.File?.option?.lastExport || runtime.File?.option?._lastExport)},
      native_command("打印…", "print", undefined, false), separator(),
      {label: "关闭标签", shortcut: "Ctrl+W / Ctrl+F4", disabled: !close_button(), action: () => {if (workspace.activeLeaf === leaf) files.core.app.commands.run("linux_note:close_editor");}},
      {label:"关闭文件夹",shortcut:"Ctrl+K F",disabled:!files.context_root(),action:()=>files.core.app.commands.run("linux_note:close_folder")},
      command("偏好设置…", "showPreferencePanel", "Ctrl+,"), command("关闭窗口", "close", "Alt+F4")];
  };
  const search_entry = (replace: boolean): entry => {
    const leaf = workspace.activeLeaf;
    const available = () => workspace.activeLeaf === leaf && (files.source_editor_active() || (native_active() && typeof editor()?.searchPanel?.showPanel === "function"));
    return {label: replace ? "查找和替换" : "查找", shortcut: replace ? "Ctrl+H" : "Ctrl+F", disabled: !available(), action: () => {
      if (!available()) return;
      if (files.source_editor_active()) files.run_editor_command(replace ? "editor.action.startFindReplaceAction" : "actions.find");
      else editor().searchPanel.showPanel(replace);
    }};
  };
  const edit_entries = async (): Promise<entry[]> => [
    edit_command("撤销", "undo", "undo", "Ctrl+Z"), edit_command("重做", "redo", "redo", "Ctrl+Y"), separator(),
    edit_command("剪切", "cut", "editor.action.clipboardCutAction", "Ctrl+X"),
    edit_command("复制", "copy", "editor.action.clipboardCopyAction", "Ctrl+C", false),
    edit_command("粘贴", "paste", "editor.action.clipboardPasteAction", "Ctrl+V"),
    native_command("复制为 Markdown", "copyAsMarkdown", undefined, false),
    native_command("复制为 HTML 代码", "copyAsHTMLSource", undefined, false),
    native_command("复制为纯文本", "copyAsPlainText", undefined, false),
    native_command("粘贴为纯文本", "pasteAsPlain", "Ctrl+Shift+V"), separator(),
    edit_command("全选", "selectAll", "editor.action.selectAll", "Ctrl+A", false),
    native_command("删除当前词", "deleteWord"), native_command("删除当前格式文本", "deleteScope"),
    native_command("删除当前行／句", "deleteLine"), native_command("删除块", "deleteBlock"), separator(),
    search_entry(false), search_entry(true),
    {label: "在文件中查找", shortcut: "Ctrl+Shift+F", action: () => files.core.app.commands.run("linux_note:search")},
  ];
  const paragraph_entries = async (): Promise<entry[]> => [
    ...[1,2,3,4,5,6].map(level => style(`${["一","二","三","四","五","六"][level-1]}级标题`, "changeBlock", [`header${level}`], `Ctrl+${level}`)),
    style("正文", "changeBlock", ["paragraph"], "Ctrl+0"),
    style("提升标题级别", "increaseHeaderLevel"), style("降低标题级别", "decreaseHeaderLevel"), separator(),
    native_entry("表格…", () => editor()?.tableEdit, "insertTable", [], "Ctrl+T", true, true),
    style("代码块", "toggleFences"), style("公式块", "toggleMathBlock"), style("引用", "toggleIndent", ["blockquote"]),
    style("有序列表", "toggleIndent", ["ol"]), style("无序列表", "toggleIndent", ["ul"]), style("任务列表", "toggleIndent", ["tasklist"]),
    style("切换任务状态", "toggleTaskStatus"),
    native_entry("增加缩进", () => editor()?.UserOp, "moreIndent", [editor()], "Ctrl+]", true, true),
    native_entry("减少缩进", () => editor()?.UserOp, "lessIndent", [editor()], "Ctrl+[", true, true), separator(),
    style("链接引用", "insertBlock", ["def_link"]), style("脚注", "insertBlock", ["def_footnote"]),
    style("水平分割线", "insertBlock", ["hr"]), style("内容目录", "insertBlock", ["toc"]), style("YAML Front Matter", "insertMetaBlock"),
  ];
  const format_entries = async (): Promise<entry[]> => {
    const bookmark = editor()?.styleBookmark?.style;
    return [...([ ["加粗","strong"], ["斜体","em"], ["下划线","underline"], ["代码","code"], ["内联公式","inline_math"],
      ["删除线","del"], ["高亮","highlight"], ["上标","superscript"], ["下标","subscript"], ["注释","comment"],
      ["超链接","link"], ["图像","image"] ] as const).map(([label,name]) => ({...style(label,"toggleStyle",[name]), checked: Boolean(native_active() && bookmark?.inline?.includes(name))})),
      separator(), style("清除样式", "clearStyle")];
  };
  const terminal_entries=async():Promise<entry[]>=>{
    const state=read_terminal_state(files.core.app),session_id=state?.active_id;
    const terminal_entry=(label:string,id:string,session=false,shortcut?:string):entry=>({label,shortcut,disabled:!state||(session&&!state.active_id),action:()=>{
      const current=read_terminal_state(files.core.app);
      if(current&&(!session||Boolean(current.active_id)&&current.active_id===session_id))files.core.app.commands.run("linux_note:"+id);
    }});
    return [terminal_entry("新建终端","terminal",false,"Ctrl+Shift+`"),terminal_entry("拆分终端","terminal_split",true),
      {...terminal_entry("显示／隐藏终端","terminal_toggle",false,"Ctrl+`"),checked:Boolean(state?.panel_visible)},separator(),
      terminal_entry("查找…","terminal_find",true),terminal_entry("清屏","terminal_clear",true),terminal_entry("重命名…","terminal_rename",true),separator(),
      {...terminal_entry("移动到编辑器","terminal_move_editor",true),disabled:!state?.active_id||state.location==="editor"},
      {...terminal_entry("移动到面板","terminal_move_panel",true),disabled:!state?.active_id||state.location==="panel"},separator(),
      terminal_entry("重启终端","terminal_restart",true),terminal_entry("终止终端","terminal_kill",true),separator(),terminal_entry("终端设置…","terminal_settings")];
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
    {...native_entry("源代码模式", () => runtime.File, "toggleSourceMode", [], "Ctrl+/", false), checked: Boolean(native_active() && editor()?.sourceView?.inSourceMode)},
    {...native_entry("只读模式", () => runtime.EditHelper, "toggleReadonlyMode", [], undefined, false), checked: Boolean(native_active() && runtime.File?.isReadonlyMode)},
    {...native_entry("专注模式", editor, "toggleFocusMode", [], "F8", false), checked: Boolean(runtime.File?.isFocusMode)},
    {...native_entry("打字机模式", editor, "toggleTypeWriterMode", [], "F9", false), checked: Boolean(runtime.File?.isTypeWriterMode)}, separator(),
    {label: "显示／隐藏侧栏", shortcut: "Ctrl+B", checked:sidebar.sidebar_visible, action: () => workspace.sidebar.toggle()},
    {label:"面包屑导航",checked:read_breadcrumb_settings(files.context_root()).enabled,action:()=>set_breadcrumb_enabled(files.context_root(),!read_breadcrumb_settings(files.context_root()).enabled)},
    {label:"面包屑设置…",action:()=>files.core.app.commands.run("linux_note:breadcrumbs_settings")},
    {label: "大纲", checked:sidebar.sidebar_visible&&sidebar.active_id==="core.outline", action: () => toggle_sidebar_view("core.outline","linux_note:outline")},
    {label: "文件树", checked:sidebar.sidebar_visible&&sidebar.active_id==="core.file-explorer", action: () => toggle_sidebar_view("core.file-explorer","linux_note:file_explorer")},
    {...command("状态栏", "toggleStatusBar"),checked:document.body.classList.contains("show-footer")},
    {...native_command("工具栏", "toggleToolbar",undefined,false),checked:Boolean(native_active()&&toolbar?.getClientRects().length&&getComputedStyle(toolbar).display!=="none")},
    {label:"终端",shortcut:"Ctrl+`",checked:Boolean(terminal?.panel_visible),disabled:!terminal,action:()=>files.core.app.commands.run("linux_note:terminal_toggle")},separator(),
    ...WORKSPACE_ZOOM_ACTIONS.map(({id, label, shortcut}) => ({label, shortcut,
      disabled: !workspace_zoom_available(runtime, id), action: () => {
        if (workspace_zoom_available(runtime, id)) files.core.app.commands.run(id);
      }})),
  ];
  };
  const theme_entries = async (): Promise<entry[]> => {
    try {
      const data = await runtime.JSBridge?.invoke("setting.getThemes");
      if (!Array.isArray(data?.all)) throw new Error("invalid themes");
      return data.all.filter((name:unknown) => typeof name === "string").map((name:string) => {
        const display = name.replace(/\.css$/i, "").replace(/(?:^|_|-)(\w)/g, (_:string, letter:string) => letter.toUpperCase());
        return {label: display, checked: name === data.current, disabled: !has_command("setTheme"), action: () => {if (has_command("setTheme")) return call_command("setTheme", [name, display]);}};
      });
    } catch {return [{label: "无法读取主题列表", disabled: true}];}
  };
  const help_entries = async (): Promise<entry[]> => [
    {label: "检查 Typora Code 更新…", action: () => files.core.app.commands.run("typora_code:check_update")},
    {label: "支持文档", disabled: !runtime.JSBridge?.showInBrowser, action: () => runtime.JSBridge?.showInBrowser?.("https://support.typora.io/")},
    {label: "Typora 官网", disabled: !runtime.JSBridge?.showInBrowser, action: () => runtime.JSBridge?.showInBrowser?.("https://typora.io/")},
  ];
  return [
    {label: "文件", mnemonic: "F", entries: file_entries}, {label: "编辑", mnemonic: "E", entries: edit_entries},
    {label: "段落", mnemonic: "P", entries: paragraph_entries}, {label: "格式", mnemonic: "O", entries: format_entries},
    {label: "视图", mnemonic: "V", entries: view_entries}, {label: "主题", mnemonic: "T", entries: theme_entries},
    {label: "终端", mnemonic: "R", entries: terminal_entries},
    {label: "帮助", mnemonic: "H", entries: help_entries},
  ];
}
