import { graph_actions_for } from "./git_graph_actions";
import { pull_request_defaults, validate_pull_request_providers, type pull_request_provider } from "./git_graph_pull_request";
import { git_graph_text as text, type git_graph_locale, type git_graph_text_key } from "./git_graph_i18n";

export const GRAPH_SETTINGS_KEY = "linux-note-git-graph:v2:";
const RETIRED_GRAPH_SETTING_KEYS = ["panel_ratio", "scm_integration"] as const;
export const graph_defaults = {
  graph_style: "curved", colors: ["#0085d9", "#d9008f", "#00d90a", "#d98500", "#a300d9", "#ff0000", "#00d9cc", "#e138e8", "#85d900", "#dc5b23", "#6f24d6", "#ffcc00"],
  initial_count: 300, page_count: 100, auto_load: true, order: "date", first_parent: false,
  show_remotes: true, show_remote_heads: true, show_tags: true, tag_only_commits: true, show_stashes: true,
  show_changes: true, show_untracked: true, include_reflogs: false, use_mailmap: false,
  mute_merges: true, mute_unreachable: false, show_signature: false, fetch_avatars: false,
  date_type: "author", date_format: "local",
  column_widths: { subject: 300, author: 110, date: 145, hash: 80 },
  details_location: "inline", show_date: true, show_author: true, show_hash: true, label_alignment: "normal",
  auto_center: true, file_view: "tree", compact_folders: true,
  combine_refs: true, uncommitted_style: "connected", inline_markdown: true,
  branch_globs: [] as { name: string; glob: string }[], emoji: {} as Record<string, string>,
  reference_space: "none", hidden_actions: [] as string[], dialog_defaults: {merge: {mode: "no-ff", squash_message: "default"}, pull: {mode: "merge", squash_message: "default"}, rebase: {ignore_date: true}, stash_create: {untracked: true}} as Record<string, Record<string, string | boolean>>,
  shortcuts: { find: "Mod+f", head: "Mod+h", refresh: "Mod+r", stash_next: "Mod+s", stash_previous: "Mod+Shift+s" },
  on_load_head: false, on_load_branch: false, on_load_branches: [] as string[], retain_context: true,
  fetch_prune: false, fetch_prune_tags: false, sign_commits: false, sign_tags: false,
  pr_providers: [] as pull_request_provider[], pr_config: structuredClone(pull_request_defaults), tab_icon_theme: "colour",
  issue_pattern: "#([0-9]+)", issue_url: "", pr_url: "", pr_base: "main",
  encoding: "utf-8", git_path: "git", terminal_shell: "", new_tab_group: "active", open_active_repo: true,
  search_depth: 0, repository_order: "path", show_status_button: true, file_menu_entry: true, icon_color: "auto",
};
export type graph_settings = typeof graph_defaults;
export function settings_labels_for(locale?: git_graph_locale): Record<keyof graph_settings, string> {
  const label = (key: git_graph_text_key): string => text(key, {}, locale);
  return {
    pr_providers:label("settings.label.pr_providers"),pr_config:label("settings.label.pr_config"),tab_icon_theme:label("settings.label.tab_icon_theme"),
    reference_space: label("settings.label.reference_space"),
    graph_style: label("settings.label.graph_style"), colors: label("settings.label.colors"), initial_count: label("settings.label.initial_count"), page_count: label("settings.label.page_count"), auto_load: label("settings.label.auto_load"), order: label("settings.label.order"), first_parent: label("settings.label.first_parent"),
    show_remotes: label("settings.label.show_remotes"), show_remote_heads: label("settings.label.show_remote_heads"), show_tags: label("settings.label.show_tags"), tag_only_commits: label("settings.label.tag_only_commits"), show_stashes: label("settings.label.show_stashes"), show_changes: label("settings.label.show_changes"), show_untracked: label("settings.label.show_untracked"), include_reflogs: label("settings.label.include_reflogs"), use_mailmap: label("settings.label.use_mailmap"), mute_merges: label("settings.label.mute_merges"), mute_unreachable: label("settings.label.mute_unreachable"), show_signature: label("settings.label.show_signature"), fetch_avatars: label("settings.label.fetch_avatars"),
    date_type: label("settings.label.date_type"), date_format: label("settings.label.date_format"), column_widths: label("settings.label.column_widths"),
    details_location: label("settings.label.details_location"), show_date: label("graph.column.date"), show_author: label("graph.column.author"), show_hash: label("graph.column.commit"), label_alignment: label("settings.label.label_alignment"),
    auto_center: label("settings.label.auto_center"), file_view: label("settings.label.file_view"), compact_folders: label("settings.label.compact_folders"), combine_refs: label("settings.label.combine_refs"), uncommitted_style: label("settings.label.uncommitted_style"), inline_markdown: label("settings.label.inline_markdown"),
    branch_globs: label("settings.label.branch_globs"), emoji: label("settings.label.emoji"), hidden_actions: label("settings.label.hidden_actions"), dialog_defaults: label("settings.label.dialog_defaults"), shortcuts: label("settings.label.shortcuts"),
    on_load_head: label("settings.label.on_load_head"), on_load_branch: label("settings.label.on_load_branch"), on_load_branches: label("settings.label.on_load_branches"), retain_context: label("settings.label.retain_context"), fetch_prune: label("settings.label.fetch_prune"), fetch_prune_tags: label("settings.label.fetch_prune_tags"), sign_commits: label("settings.label.sign_commits"), sign_tags: label("settings.label.sign_tags"),
    issue_pattern: label("settings.label.issue_pattern"), issue_url: label("settings.label.issue_url"), pr_url: label("settings.label.pr_url"), pr_base: label("settings.label.pr_base"),
    encoding: label("settings.label.encoding"), git_path: label("settings.label.git_path"), terminal_shell: label("settings.label.terminal_shell"), new_tab_group: label("settings.label.new_tab_group"), open_active_repo: label("settings.label.open_active_repo"), search_depth: label("settings.label.search_depth"), repository_order: label("settings.label.repository_order"), show_status_button: label("settings.label.show_status_button"), file_menu_entry: label("settings.label.file_menu_entry"), icon_color: label("settings.label.icon_color"),
  };
}

export const settings_choices: Record<string, string[]> = { tab_icon_theme: ["colour", "grey"], reference_space: ["none", "-", "_"], details_location: ["inline", "docked"], label_alignment: ["normal", "split", "graph"], graph_style: ["curved", "straight"], order: ["topo", "date", "author-date"], date_type: ["author", "committer"], date_format: ["local", "date", "iso", "iso_date", "relative"], file_view: ["tree", "list"], uncommitted_style: ["connected", "head"], new_tab_group: ["active", "right", "down"], repository_order: ["name", "path", "recent"] };

const settings_choice_label_keys: Partial<Record<keyof graph_settings, Record<string, git_graph_text_key>>> = {
  tab_icon_theme:{colour:"settings.choice.tab_icon.colour",grey:"settings.choice.tab_icon.grey"},
  details_location: {inline: "settings.choice.layout.inline", docked: "settings.choice.layout.docked"},
  label_alignment: {normal: "settings.choice.layout.normal", split: "settings.choice.layout.left", graph: "settings.choice.layout.right"},
  graph_style: {curved: "settings.choice.graph_style.curved", straight: "settings.choice.graph_style.straight"},
  order: {topo: "settings.choice.order.topo", date: "settings.choice.order.date", "author-date": "settings.choice.order.author_date"},
  date_type: {author: "settings.choice.date_type.author", committer: "settings.choice.date_type.committer"},
  date_format: {date: "settings.choice.date_format.date", iso_date: "settings.choice.date_format.iso_date", local: "settings.choice.date_format.local", iso: "settings.choice.date_format.iso", relative: "settings.choice.date_format.relative"},
  file_view: {tree: "settings.choice.file_view.tree", list: "settings.choice.file_view.list"},
  uncommitted_style: {head: "settings.choice.uncommitted_style.row", connected: "settings.choice.uncommitted_style.connected"},
  new_tab_group: {active: "settings.choice.new_tab_group.active", right: "settings.choice.new_tab_group.right", down: "settings.choice.new_tab_group.down"},
  repository_order: {name: "settings.choice.repository_order.name", path: "settings.choice.repository_order.path", recent: "settings.choice.repository_order.recent"},
};

export function settings_choice_label(key: keyof graph_settings, value: string, locale?: git_graph_locale): string {
  const label_key = settings_choice_label_keys[key]?.[value];
  return label_key ? text(label_key, {}, locale) : value;
}

export function settings_choice_labels_for(locale?: git_graph_locale): Record<string, Record<string, string>> {
  return Object.fromEntries(Object.entries(settings_choices).map(([key, values]) => [
    key,
    Object.fromEntries(values.map(value => [value, settings_choice_label(key as keyof graph_settings, value, locale)])),
  ]));
}

export const settings_labels = settings_labels_for();
export const settings_choice_labels = settings_choice_labels_for();

export function validate_settings(value: unknown): graph_settings {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(text("settings.error.object_required"));
  const result = structuredClone(graph_defaults);
  for (const [key, item] of Object.entries(value)) {
    if (!Object.hasOwn(graph_defaults, key)) throw new Error(text("settings.error.unknown", {key}));
    const expected = graph_defaults[key as keyof graph_settings];
    if (typeof expected !== typeof item || Array.isArray(expected) !== Array.isArray(item) || item == null) throw new Error(text("settings.error.invalid_type", {key}));
    (result as Record<string, unknown>)[key] = item;
  }
  for (const key of ["initial_count", "page_count", "search_depth"] as const) {
    if (!Number.isInteger(result[key]) || result[key] < (key === "search_depth" ? 0 : 1) || result[key] > (key === "search_depth" ? 5 : 2000)) throw new Error(text("settings.error.out_of_range", {key}));
  }
  for (const [key, allowed] of Object.entries(settings_choices)) {
    if (!allowed.includes(String(result[key as keyof graph_settings]))) throw new Error(text("settings.error.invalid_choice", {key}));
  }
  if (!result.colors.length || result.colors.some(color => !/^#[a-f\d]{6}$/iu.test(color))) throw new Error(text("settings.error.invalid_colors"));
  if (result.branch_globs.some(item => !item || typeof item.name !== "string" || typeof item.glob !== "string")) throw new Error(text("settings.error.invalid_branch_globs"));
  for (const key of ["hidden_actions", "on_load_branches"] as const) if (result[key].some(item => typeof item !== "string")) throw new Error(text("settings.error.text_array", {key}));
  for (const map of [result.emoji, result.shortcuts]) if (Object.values(map).some(item => typeof item !== "string")) throw new Error(text("settings.error.string_maps"));
  for (const key of Object.keys(graph_defaults.shortcuts)) if (!Object.hasOwn(result.shortcuts, key)) throw new Error(text("settings.error.missing_shortcut", {key}));
  for (const key of Object.keys(graph_defaults.column_widths)) if (!Object.hasOwn(result.column_widths, key)) throw new Error(text("settings.error.missing_column_width", {key}));
  for (const item of Object.values(result.dialog_defaults)) if (!item || typeof item !== "object" || Array.isArray(item) || Object.values(item).some(value => typeof value !== "string" && typeof value !== "boolean")) throw new Error(text("settings.error.invalid_dialog_defaults"));
  const actions = graph_actions_for();
  for (const [id, values] of Object.entries(result.dialog_defaults)) {
    const action = actions.find(action => action.id === (id === "reset_changes" ? "reset" : id));
    for (const [name, value] of Object.entries(values)) {
      const field = action?.fields.find(field => field.key === name);
      if (field && (field.type === "boolean" ? typeof value !== "boolean" : field.type === "choice" ? !field.choices?.includes(String(value)) : typeof value !== "string")) throw new Error(text("settings.error.invalid_choice", {key: `dialog_defaults.${id}.${name}`}));
    }
  }
  for (const width of Object.values(result.column_widths)) if (!Number.isFinite(width) || width < 40 || width > 1500) throw new Error(text("settings.error.invalid_column_width"));
  validate_pull_request_providers(result.pr_providers);
  if(Object.keys(pull_request_defaults).some(key=>typeof result.pr_config[key as keyof typeof pull_request_defaults]!=="string"))throw new Error("PR integration fields must be strings.");
  try { new TextDecoder(result.encoding); }
  catch { throw new Error(text("settings.error.invalid_encoding", {encoding: result.encoding})); }
  if (result.issue_pattern.length > 150) throw new Error(text("settings.error.issue_pattern_too_long"));
  try { new RegExp(result.issue_pattern, "gu"); }
  catch { throw new Error(text("settings.error.invalid_issue_pattern")); }
  return result;
}

export function load_graph_settings(storage: Storage, root: string): graph_settings {
  try {
    const stored = JSON.parse(storage.getItem(GRAPH_SETTINGS_KEY + "settings:" + root) || "{}") as Record<string, unknown>;
    for (const key of RETIRED_GRAPH_SETTING_KEYS) delete stored[key];
    return validate_settings(stored);
  }
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
