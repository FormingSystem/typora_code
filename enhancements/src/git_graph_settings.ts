export const GRAPH_SETTINGS_KEY = "linux-note-git-graph:v2:";
export const graph_defaults = {
  graph_style: "curved", colors: ["#2684d4", "#b462d6", "#209572", "#db8540", "#d4567d", "#7783cc"],
  initial_count: 200, page_count: 200, auto_load: false, order: "topo", first_parent: false,
  show_remotes: true, show_remote_heads: false, show_tags: true, tag_only_commits: true, show_stashes: true,
  show_changes: true, show_untracked: true, include_reflogs: false, use_mailmap: true,
  mute_merges: false, mute_unreachable: false, show_signature: false, fetch_avatars: false,
  date_type: "author", date_format: "local", show_date: true, show_author: true, show_hash: true,
  column_widths: { subject: 300, author: 110, date: 145, hash: 80 },
  details_location: "bottom", panel_ratio: 55, auto_center: true, file_view: "tree", compact_folders: true,
  label_alignment: "inline", combine_refs: false, uncommitted_style: "row", inline_markdown: true,
  branch_globs: [] as { name: string; glob: string }[], emoji: {} as Record<string, string>,
  hidden_actions: [] as string[], dialog_defaults: {} as Record<string, Record<string, string | boolean>>,
  shortcuts: { find: "Mod+f", head: "Mod+h", refresh: "Mod+r", stash_next: "Mod+s", stash_previous: "Mod+Shift+s" },
  on_load_head: false, on_load_branch: false, on_load_branches: [] as string[], retain_context: true,
  fetch_prune: false, fetch_prune_tags: false, sign_commits: false, sign_tags: false,
  issue_pattern: "#([0-9]+)", issue_url: "", pr_url: "", pr_base: "main",
  encoding: "utf-8", git_path: "git", terminal_shell: "", new_tab_group: "active", open_active_repo: true,
  search_depth: 2, repository_order: "name", show_status_button: true, file_menu_entry: true, icon_color: "auto",
};
export type graph_settings = typeof graph_defaults;
export const settings_labels: Record<keyof graph_settings, string> = {
  graph_style: "连线样式（curved / straight）", colors: "分支颜色", initial_count: "首次提交数量", page_count: "继续加载数量", auto_load: "滚动到底自动加载", order: "提交顺序（topo / date / author-date）", first_parent: "仅沿第一父提交",
  show_remotes: "显示远端分支", show_remote_heads: "显示远端 HEAD", show_tags: "显示标签", tag_only_commits: "显示仅标签可达的提交", show_stashes: "显示 stash", show_changes: "显示未提交改动", show_untracked: "显示未跟踪文件", include_reflogs: "包含 reflog 提交", use_mailmap: "使用 mailmap", mute_merges: "淡化合并提交", mute_unreachable: "淡化不属于 HEAD 的提交", show_signature: "查看签名状态", fetch_avatars: "显示 Gravatar 头像（联网）",
  date_type: "日期来源（author / committer）", date_format: "日期格式（local / iso / relative）", show_date: "显示日期列", show_author: "显示作者列", show_hash: "显示编号列", column_widths: "列宽",
  details_location: "详情位置（right / bottom / inline）", panel_ratio: "提交列表占面板比例（15～85%）", auto_center: "选中提交自动居中", file_view: "文件视图（tree / list）", compact_folders: "合并单子目录", label_alignment: "引用位置（inline / split / graph）", combine_refs: "合并同名本地和远端引用", uncommitted_style: "未提交节点（row / connected）", inline_markdown: "提交说明行内 Markdown",
  branch_globs: "自定义分支筛选（name / glob）", emoji: "自定义 emoji 短代码", hidden_actions: "隐藏操作 ID", dialog_defaults: "操作对话框默认值", shortcuts: "图内快捷键",
  on_load_head: "打开时定位 HEAD", on_load_branch: "打开时选择当前分支", on_load_branches: "打开时指定分支", retain_context: "保留隐藏标签内容", fetch_prune: "Fetch 同时 prune 分支", fetch_prune_tags: "Fetch 同时 prune 标签", sign_commits: "签署新提交", sign_tags: "签署标签",
  issue_pattern: "Issue 正则（捕获编号）", issue_url: "Issue URL 模板（{id}）", pr_url: "自定义 PR URL（{base} / {branch} / {remote}）", pr_base: "PR 默认目标分支",
  encoding: "历史文件编码", git_path: "Git 可执行文件", terminal_shell: "集成终端 Shell（空为终端默认配置）", new_tab_group: "文件与差异打开位置（active / right / down）", open_active_repo: "从活动文档查找仓库", search_depth: "子仓库发现深度", repository_order: "仓库排序（name / path / recent）", show_status_button: "显示状态栏入口", file_menu_entry: "显示文件菜单入口", icon_color: "入口图标颜色（auto 或 CSS 颜色）",
};

export const settings_choices: Record<string, string[]> = { graph_style: ["curved", "straight"], order: ["topo", "date", "author-date"], date_type: ["author", "committer"], date_format: ["local", "iso", "relative"], details_location: ["right", "bottom", "inline"], file_view: ["tree", "list"], label_alignment: ["inline", "split", "graph"], uncommitted_style: ["row", "connected"], new_tab_group: ["active", "right", "down"], repository_order: ["name", "path", "recent"] };

export function validate_settings(value: unknown): graph_settings {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("设置必须是 JSON 对象。");
  const result = structuredClone(graph_defaults);
  for (const [key, item] of Object.entries(value)) {
    if (!Object.hasOwn(graph_defaults, key)) throw new Error(`未知设置：${key}`);
    const expected = graph_defaults[key as keyof graph_settings];
    if (typeof expected !== typeof item || Array.isArray(expected) !== Array.isArray(item) || item == null) throw new Error(`设置类型不正确：${key}`);
    (result as Record<string, unknown>)[key] = item;
  }
  for (const key of ["initial_count", "page_count", "search_depth"] as const) {
    if (!Number.isInteger(result[key]) || result[key] < (key === "search_depth" ? 0 : 1) || result[key] > (key === "search_depth" ? 5 : 2000)) throw new Error(`设置超出范围：${key}`);
  }
  for (const [key, allowed] of Object.entries(settings_choices)) {
    if (!allowed.includes(String(result[key as keyof graph_settings]))) throw new Error(`设置取值无效：${key}`);
  }
  if (!result.colors.length || result.colors.some(color => !/^#[a-f\d]{6}$/iu.test(color))) throw new Error("分支颜色须为六位十六进制颜色。");
  if (result.branch_globs.some(item => !item || typeof item.name !== "string" || typeof item.glob !== "string")) throw new Error("分支筛选须包含 name 和 glob。");
  for (const key of ["hidden_actions", "on_load_branches"] as const) if (result[key].some(item => typeof item !== "string")) throw new Error(`设置须为文本数组：${key}`);
  for (const map of [result.emoji, result.shortcuts]) if (Object.values(map).some(item => typeof item !== "string")) throw new Error("快捷键和 emoji 映射必须为文本。");
  for (const key of Object.keys(graph_defaults.shortcuts)) if (!Object.hasOwn(result.shortcuts, key)) throw new Error(`缺少快捷键：${key}`);
  for (const key of Object.keys(graph_defaults.column_widths)) if (!Object.hasOwn(result.column_widths, key)) throw new Error(`缺少列宽：${key}`);
  for (const item of Object.values(result.dialog_defaults)) if (!item || typeof item !== "object" || Array.isArray(item) || Object.values(item).some(value => typeof value !== "string" && typeof value !== "boolean")) throw new Error("对话框默认值须为操作名到字段值的对象。");
  for (const width of Object.values(result.column_widths)) if (!Number.isFinite(width) || width < 40 || width > 1500) throw new Error("列宽须在 40～1500 之间。");
  if (!Number.isFinite(result.panel_ratio) || result.panel_ratio < 15 || result.panel_ratio > 85) throw new Error("面板比例须在 15～85 之间。");
  new TextDecoder(result.encoding);
  if (result.issue_pattern.length > 150) throw new Error("Issue 正则过长。");
  new RegExp(result.issue_pattern, "gu");
  return result;
}

export function load_graph_settings(storage: Storage, root: string): graph_settings {
  try { return validate_settings(JSON.parse(storage.getItem(GRAPH_SETTINGS_KEY + "settings:" + root) || "{}")); }
  catch { return structuredClone(graph_defaults); }
}
export type graph_review = { root: string; from: string; to: string; reviewed: string[]; updated_at: number };
export function load_reviews(storage: Storage, now = Date.now()): graph_review[] {
  try { return (JSON.parse(storage.getItem(GRAPH_SETTINGS_KEY + "reviews") || "[]") as graph_review[]).filter(item => item && typeof item.root === "string" && typeof item.from === "string" && typeof item.to === "string" && Array.isArray(item.reviewed) && item.reviewed.every(file => typeof file === "string") && Number.isFinite(item.updated_at) && now - item.updated_at < 90 * 86400000); }
  catch { return []; }
}
export function save_reviews(storage: Storage, reviews: graph_review[]): void { storage.setItem(GRAPH_SETTINGS_KEY + "reviews", JSON.stringify(reviews)); }
export function glob_matches(pattern: string, value: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/gu, "\\$&").replace(/\*/gu, ".*").replace(/\?/gu, ".");
  return new RegExp(`^${escaped}$`, "u").test(value);
}
