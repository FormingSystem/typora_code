import type { workspace_file_host } from "./workspace_files";
import type { titlebar_menu_definition, titlebar_menu_entry } from "./workspace_titlebar_menu";
import { close_active_workspace_tab, close_all_workspace_tabs } from "./workspace_tabs";
import { open_workspace_ui_appearance } from "./workspace_ui_appearance";

export type titlebar_runtime = {
  File?: any;
  ClientCommand?: Record<string, (...args: any[]) => unknown>;
  JSBridge?: { invoke(name: string, ...args: unknown[]): any; showInBrowser?(url: string): unknown };
  reqnode?(name: string): any;
  $?: (selector: string) => { modal?(action: string): unknown };
};

type recent_item = { name?: string; path?: string; pinned?: boolean };

function command(runtime: titlebar_runtime, name: string, ...args: unknown[]): () => unknown {
  return () => runtime.ClientCommand?.[name]?.(...args);
}

/** 把 Typora 命令映射为独立分类菜单；渲染器只负责交互，不持有宿主业务。 */
export function create_workspace_titlebar_definitions(
  files: workspace_file_host,
  runtime: titlebar_runtime,
  open_quickly: () => void,
): titlebar_menu_definition[] {
  const editor = () => runtime.File?.editor;
  const library = () => editor()?.library;
  const stylize = (name: string, ...args: unknown[]) => () => editor()?.stylize?.[name]?.(...args);
  const native_document_active = () => !String(files.core.app.workspace.activeLeaf?.state.path || "").startsWith("typ://");
  const native_only = (entry: titlebar_menu_entry): titlebar_menu_entry => ({ ...entry, disabled: !native_document_active() || entry.disabled });
  const recent_children = (items: recent_item[] | undefined): titlebar_menu_entry[] => {
    const usable = (items || []).filter(item => item.path);
    if (!usable.length) return [{ label: "空", disabled: true }];
    return usable.map(item => ({ label: item.name || files.path_api.basename(item.path!), title: item.path, action: command(runtime, "openWithPath", item.path) }));
  };
  const file_entries = async (): Promise<titlebar_menu_entry[]> => {
    let recents: { files?: recent_item[]; folders?: recent_item[] } = {};
    try { recents = await runtime.JSBridge?.invoke("setting.getRecentFiles") || {}; } catch { /* 最近记录不可用时仍显示其他文件命令。 */ }
    return [
      { label: "新建", shortcut: "Ctrl+N", action: command(runtime, "newFile") },
      { label: "新建窗口", shortcut: "Ctrl+Shift+N", action: command(runtime, "newWindow") },
      { separator: true },
      { label: "打开…", shortcut: "Ctrl+O", action: command(runtime, "open") },
      { label: "打开文件夹…", shortcut: "Ctrl+K Ctrl+O", action: command(runtime, "openFolder") },
      { label: "打开最近文件", children: recent_children(recents.files) },
      { label: "最近使用的目录", children: recent_children(recents.folders) },
      { label: "清除最近文件", action: () => runtime.JSBridge?.invoke("setting.askForClearRecentDocuments") },
      { label: "快速打开…", shortcut: "Ctrl+P", action: open_quickly },
      { separator: true },
      native_only({ label: "选择编码重新打开", children: ["utf-8", "gb18030", "big5", "windows-1252", "utf-16le", "utf-16be"].map(encoding => ({ label: encoding.toUpperCase(), action: () => runtime.File?.reloadWithEncoding?.(encoding) })) }),
      native_only({ label: "从磁盘重新加载", action: command(runtime, "reloadFromDisk") }),
      { separator: true },
      { label: "保存", shortcut: "Ctrl+S", disabled: !files.can_save_active(), action: () => void files.save_active() },
      { label: "保存全部打开的文件", shortcut: "Ctrl+K S", action: () => void files.save_all() },
      native_only({ label: "另存为…", shortcut: "Ctrl+Shift+S", action: command(runtime, "saveAs") }),
      native_only({ label: "创建副本", action: () => library()?.duplicateFileCommand?.() }),
      native_only({ label: "重命名", shortcut: "F2", action: () => library()?.renameFileCommand?.() }),
      native_only({ label: "移动到…", action: command(runtime, "moveTo") }),
      { separator: true },
      native_only({ label: "打开文件位置", action: command(runtime, "openFileLocation") }),
      native_only({ label: "在文档列表中显示", action: () => library()?.revealInFileList?.() }),
      native_only({ label: "在文件树中显示", action: () => library()?.revealInFileTree?.() }),
      { separator: true },
      { label: "导入…", action: command(runtime, "import") },
      native_only({ label: "导出…", action: command(runtime, "export") }),
      native_only({ label: "使用上一次设置导出", action: command(runtime, "exportLast") }),
      native_only({ label: "打印…", action: command(runtime, "print") }),
      { separator: true },
      { label: "关闭标签", shortcut: "Ctrl+W", disabled: !files.core.app.workspace.activeLeaf?.state.path, action: () => close_active_workspace_tab(files) },
      { label: "关闭所有标签", shortcut: "Ctrl+K W", disabled: !files.core.app.workspace.activeLeaf?.state.path, action: () => void close_all_workspace_tabs(files) },
      { label: "关闭窗口", shortcut: "Alt+F4", action: command(runtime, "close") },
    ];
  };
  const edit_entries = async (): Promise<titlebar_menu_entry[]> => [
    native_only({ label: "撤消", shortcut: "Ctrl+Z", action: command(runtime, "undo") }),
    native_only({ label: "重做", shortcut: "Ctrl+Y", action: command(runtime, "redo") }),
    { separator: true },
    native_only({ label: "剪切", shortcut: "Ctrl+X", action: command(runtime, "cut") }),
    native_only({ label: "复制", shortcut: "Ctrl+C", action: command(runtime, "copy") }),
    native_only({ label: "粘贴", shortcut: "Ctrl+V", action: command(runtime, "paste") }),
    native_only({ label: "复制／粘贴为", children: [
      { label: "复制为 Markdown", action: command(runtime, "copyAsMarkdown") },
      { label: "复制为 HTML 代码", action: command(runtime, "copyAsHTMLSource") },
      { label: "复制为纯文本", action: command(runtime, "copyAsPlainText") },
      { label: "复制为语义 HTML", action: command(runtime, "copyAsSemanticHTML") },
      { label: "粘贴为纯文本", shortcut: "Ctrl+Shift+V", action: command(runtime, "pasteAsPlain") },
    ] }),
    { separator: true },
    native_only({ label: "选择", children: [
      { label: "全选", shortcut: "Ctrl+A", action: command(runtime, "selectAll") },
      { label: "选中当前行或句", action: () => editor()?.selection?.selectLine?.() },
      { label: "选中当前格式文本", action: () => editor()?.selection?.selectBlock?.() },
      { label: "选中当前词", action: () => editor()?.selection?.selectWord?.() },
    ] }),
    native_only({ label: "删除", children: [
      { label: "删除所选范围", action: () => editor()?.UserOp?.deleteSelectable?.() },
      { label: "删除当前词", action: command(runtime, "deleteWord") },
      { label: "删除当前格式文本", action: command(runtime, "deleteScope") },
      { label: "删除当前行或句", action: command(runtime, "deleteLine") },
      { label: "删除块", action: command(runtime, "deleteBlock") },
    ] }),
    native_only({ label: "跳转到", children: [
      { label: "跳转到文首", shortcut: "Ctrl+Home", action: () => editor()?.selection?.jumpTop?.() },
      { label: "跳转到所选内容", action: () => editor()?.selection?.jumpSelection?.() },
      { label: "跳转到文末", shortcut: "Ctrl+End", action: () => editor()?.selection?.jumpBottom?.() },
    ] }),
    { separator: true },
    native_only({ label: "查找", shortcut: "Ctrl+F", action: () => editor()?.searchPanel?.showPanel?.() }),
    { label: "在文件中查找", shortcut: "Ctrl+Shift+F", action: () => files.core.app.commands.run("linux_note:search") },
  ];
  const paragraph_entries = async (): Promise<titlebar_menu_entry[]> => [
    ...[1, 2, 3, 4, 5, 6].map(level => native_only({ label: `${["一", "二", "三", "四", "五", "六"][level - 1]}级标题`, shortcut: `Ctrl+${level}`, action: () => editor()?.stylize?.changeBlock?.(`header${level}`) })),
    native_only({ label: "正文", shortcut: "Ctrl+0", action: () => editor()?.stylize?.changeBlock?.("paragraph") }),
    native_only({ label: "提升标题级别", action: () => editor()?.stylize?.increaseHeaderLevel?.() }),
    native_only({ label: "降低标题级别", action: () => editor()?.stylize?.decreaseHeaderLevel?.() }),
    { separator: true },
    native_only({ label: "表格…", shortcut: "Ctrl+T", action: () => editor()?.tableEdit?.insertTable?.() }),
    native_only({ label: "代码块", action: stylize("toggleFences") }),
    native_only({ label: "公式块", action: stylize("toggleMathBlock") }),
    native_only({ label: "引用", action: stylize("toggleIndent", "blockquote") }),
    native_only({ label: "有序列表", action: stylize("toggleIndent", "ol") }),
    native_only({ label: "无序列表", action: stylize("toggleIndent", "ul") }),
    native_only({ label: "任务列表", action: stylize("toggleIndent", "tasklist") }),
    native_only({ label: "增加缩进", shortcut: "Ctrl+]", action: () => editor()?.UserOp?.moreIndent?.(editor()) }),
    native_only({ label: "减少缩进", shortcut: "Ctrl+[", action: () => editor()?.UserOp?.lessIndent?.(editor()) }),
    { separator: true },
    native_only({ label: "链接引用", action: stylize("insertBlock", "link_reference") }),
    native_only({ label: "脚注", action: stylize("insertBlock", "footnote") }),
    native_only({ label: "水平分割线", action: stylize("insertBlock", "hr") }),
    native_only({ label: "内容目录", action: stylize("insertBlock", "toc") }),
    native_only({ label: "YAML Front Matter", action: stylize("insertMetaBlock") }),
  ];
  const format_entries = async (): Promise<titlebar_menu_entry[]> => [
    native_only({ label: "加粗", action: stylize("toggleStyle", "strong") }),
    native_only({ label: "斜体", shortcut: "Ctrl+I", action: stylize("toggleStyle", "em") }),
    native_only({ label: "下划线", shortcut: "Ctrl+U", action: stylize("toggleStyle", "underline") }),
    native_only({ label: "代码", action: stylize("toggleStyle", "code") }),
    native_only({ label: "内联公式", action: stylize("toggleStyle", "inline_math") }),
    native_only({ label: "删除线", action: stylize("toggleStyle", "del") }),
    native_only({ label: "高亮", action: stylize("toggleStyle", "highlight") }),
    native_only({ label: "上标", action: stylize("toggleStyle", "superscript") }),
    native_only({ label: "下标", action: stylize("toggleStyle", "subscript") }),
    native_only({ label: "注释", action: stylize("toggleStyle", "comment") }),
    { separator: true },
    native_only({ label: "超链接", action: stylize("toggleStyle", "link") }),
    native_only({ label: "图像", action: stylize("toggleStyle", "image") }),
    native_only({ label: "清除样式", shortcut: "Ctrl+\\", action: stylize("clearStyle") }),
  ];
  const view_entries = async (): Promise<titlebar_menu_entry[]> => [
    native_only({ label: "源代码模式", shortcut: "Ctrl+/", checked: Boolean(editor()?.sourceView?.inSourceMode), action: () => runtime.File?.toggleSourceMode?.() }),
    native_only({ label: "只读模式", checked: Boolean(runtime.File?.isReadonlyMode), action: () => runtime.File?.toggleReadonlyMode?.() }),
    native_only({ label: "专注模式", shortcut: "F8", checked: Boolean(runtime.File?.isFocusMode), action: () => editor()?.toggleFocusMode?.() }),
    native_only({ label: "打字机模式", shortcut: "F9", checked: Boolean(runtime.File?.isTypeWriterMode), action: () => editor()?.toggleTypeWriterMode?.() }),
    { separator: true },
    { label: "显示／隐藏侧边栏", shortcut: "Ctrl+B", action: () => files.core.app.workspace.sidebar.toggle() },
    { label: "大纲", action: command(runtime, "toggleOutline") },
    { label: "文档列表", action: command(runtime, "toggleFileList") },
    { label: "文件树", shortcut: "Ctrl+Shift+E", action: () => files.core.app.commands.run("linux_note:file_explorer") },
    { label: "状态栏", action: command(runtime, "toggleStatusBar") },
    { label: "工具栏", action: command(runtime, "toggleToolbar") },
    { separator: true },
    { label: "界面外观…", action: open_workspace_ui_appearance },
    { label: "放大", shortcut: "Ctrl+=", action: command(runtime, "zoomIn") },
    { label: "缩小", shortcut: "Ctrl+-", action: command(runtime, "zoomOut") },
    { label: "实际大小", shortcut: "Ctrl+数字键盘 0", action: command(runtime, "resetZoom") },
    { separator: true },
    { label: "开发者工具", shortcut: "Ctrl+Shift+I", action: command(runtime, "toggleDevTools") },
  ];
  const theme_entries = async (): Promise<titlebar_menu_entry[]> => {
    let theme_data: any = {};
    try { theme_data = await runtime.JSBridge?.invoke("setting.getThemes"); } catch { /* 主题列表不可用时仍保留入口。 */ }
    const themes = Array.isArray(theme_data?.all) ? theme_data.all : [];
    const current = String(theme_data?.current ?? runtime.File?.option?.curTheme ?? "").replace(/\.css$/iu, "");
    return [
      ...themes.map((theme: any) => {
        const name = String(theme?.name ?? theme?.displayName ?? theme);
        const display = String(theme?.displayName ?? theme?.name ?? theme).replace(/\.css$/iu, "");
        return { label: display, checked: current === name.replace(/\.css$/iu, "") || theme?.active, action: command(runtime, "setTheme", name) };
      }),
      ...(themes.length ? [{ separator: true }] : [{ label: "没有发现可用主题", disabled: true }]),
      { label: "打开主题文件夹", action: () => runtime.JSBridge?.invoke("shell.openItem", `${(window as any)._options?.userDataPath || ""}/themes`) },
    ];
  };
  const help_entries = async (): Promise<titlebar_menu_entry[]> => [
    { label: "偏好设置", shortcut: "Ctrl+,", action: command(runtime, "showPreferencePanel") },
    { separator: true },
    { label: "隐私条款", action: () => runtime.JSBridge?.showInBrowser?.("https://typora.io/privacy/") },
    { label: "鸣谢", action: () => runtime.JSBridge?.showInBrowser?.("https://typora.io/credits/") },
    { label: "更新日志", action: () => runtime.JSBridge?.showInBrowser?.("https://typora.io/releases/all") },
    { label: "官方网站", action: () => runtime.JSBridge?.showInBrowser?.("https://typora.io/") },
    { label: "反馈", action: () => runtime.JSBridge?.showInBrowser?.("https://support.typora.io/") },
    { label: "检查更新", action: () => runtime.JSBridge?.invoke("app.checkForUpdates") },
    { separator: true },
    { label: "关于 Typora", action: () => runtime.$?.("#about-dialog")?.modal?.("show") },
  ];
  return [
    { label: "文件", mnemonic: "F", entries: file_entries },
    { label: "编辑", mnemonic: "E", entries: edit_entries },
    { label: "段落", mnemonic: "P", entries: paragraph_entries },
    { label: "格式", mnemonic: "O", entries: format_entries },
    { label: "视图", mnemonic: "V", entries: view_entries },
    { label: "主题", mnemonic: "T", entries: theme_entries },
    { label: "帮助", mnemonic: "H", entries: help_entries },
  ];
}
