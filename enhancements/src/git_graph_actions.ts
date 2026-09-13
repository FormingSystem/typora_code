import {read_git_network_guard} from "./git_remote_data";
import {worktree_guard} from "./git_worktrees";
import type { git_run } from "./git_graph_data";
import { git_graph_text as text, type git_graph_locale, type git_graph_text_key } from "./git_graph_i18n";

export type action_field = { key: string; title: string; type?: "boolean" | "choice"; choices?: string[]; choice_labels?: Record<string, string>; optional?: boolean; initial?: string | boolean };
export type graph_action = { id: string; title: string; targets: string[]; fields: action_field[]; touches_files?: boolean; destructive?: string };
export function graph_actions_for(locale?: git_graph_locale): graph_action[] {
  const label = (key: git_graph_text_key): string => text(key, {}, locale);
  const field = (key: string, title: git_graph_text_key, optional = false): action_field => ({ key, title: label(title), optional });
  const check = (key: string, title: git_graph_text_key, initial = false): action_field => ({ key, title: label(title), type: "boolean", initial });
  const choice = (key: string, title: git_graph_text_key, choices: string[]): action_field => ({
    key, title: label(title), type: "choice", choices,
    choice_labels: Object.fromEntries(choices.map(value => [value, graph_action_choice_label(value, locale)])),
    initial: choices[0],
  });
  const remote = field("remote", "action.field.remote");
  const branch = field("branch", "action.field.branch");
  return [
    { id: "branch_create", title: label("action.title.branch_create"), targets: ["commit", "branch", "tag"], fields: [branch, check("checkout", "action.field.checkout")], touches_files: true },
    { id: "branch_checkout", title: label("action.title.branch_checkout"), targets: ["branch"], fields: [], touches_files: true },
    { id: "remote_checkout", title: label("action.title.remote_checkout"), targets: ["remote"], fields: [branch], touches_files: true },
    { id: "branch_rename", title: label("action.title.branch_rename"), targets: ["branch"], fields: [branch] },
    { id: "branch_delete", title: label("action.title.branch_delete"), targets: ["branch"], fields: [check("force", "action.field.force_delete")], destructive: label("action.warning.branch_delete") },
    { id: "remote_branch_delete", title: label("action.title.remote_branch_delete"), targets: ["remote"], fields: [remote, branch], destructive: label("action.warning.remote_branch_delete") },
    { id: "branch_fetch", title: label("action.title.branch_fetch"), targets: ["branch", "remote"], fields: [remote, field("source", "action.field.remote_source"), branch, check("force", "action.field.force_fetch")] },
    { id: "merge", title: label("action.title.merge"), targets: ["commit", "branch", "remote"], fields: [choice("mode", "action.field.merge_mode", ["normal", "no-ff", "ff-only", "squash"]), check("no_commit", "action.field.defer_commit"), choice("squash_message", "action.field.squash_message", ["default", "git"])], touches_files: true },
    { id: "rebase", title: label("action.title.rebase"), targets: ["commit", "branch", "remote"], fields: [check("preserve_merges", "action.field.preserve_merges"), check("ignore_date", "action.field.ignore_date"), check("interactive", "action.field.interactive"), field("todo", "action.field.rebase_todo", true)], touches_files: true, destructive: label("action.warning.rebase") },
    { id: "reset", title: label("action.title.reset"), targets: ["commit", "branch", "tag", "changes"], fields: [choice("mode", "action.field.reset_mode", ["mixed", "soft", "hard"])], touches_files: true, destructive: label("action.warning.reset") },
    { id: "commit_checkout", title: label("action.title.commit_checkout"), targets: ["commit", "tag"], fields: [], touches_files: true },
    { id: "cherry_pick", title: label("action.title.cherry_pick"), targets: ["commit"], fields: [check("no_commit", "action.field.apply_only"), check("record_origin", "action.field.record_origin"), field("mainline", "action.field.mainline", true)], touches_files: true },
    { id: "revert", title: label("action.title.revert"), targets: ["commit"], fields: [check("no_commit", "action.field.apply_only"), field("mainline", "action.field.mainline", true)], touches_files: true },
    { id: "drop", title: label("action.title.drop"), targets: ["commit"], fields: [], touches_files: true, destructive: label("action.warning.drop") },
    { id: "tag_add", title: label("action.title.tag_add"), targets: ["commit", "branch"], fields: [field("tag", "action.field.tag"), choice("tag_type", "action.field.tag_type", ["annotated", "lightweight"]), field("message", "action.field.tag_message", true), check("sign", "action.field.sign_tag"), check("push", "action.field.push_tag"), field("remote", "action.field.remote", true)] },
    { id: "tag_delete", title: label("action.title.tag_delete"), targets: ["tag"], fields: [], destructive: label("action.warning.tag_delete") },
    { id: "tag_push", title: label("action.title.tag_push"), targets: ["tag"], fields: [remote] },
    { id: "fetch", title: label("action.title.fetch"), targets: ["repository", "remote"], fields: [field("remote", "action.field.fetch_remote_optional", true), check("prune", "action.field.prune"), check("prune_tags", "action.field.prune_tags")] },
    { id: "pull", title: label("action.title.pull"), targets: ["repository", "branch", "remote"], fields: [remote, branch, choice("mode", "action.field.pull_mode", ["ff-only", "merge", "rebase", "no-ff", "squash"]), choice("squash_message", "action.field.squash_message", ["default", "git"])], touches_files: true },
    { id: "sync", title: label("action.title.sync"), targets: ["repository"], fields: [choice("mode", "action.field.sync_mode", ["merge", "rebase", "ff-only"])], touches_files: true },
    { id: "push", title: label("action.title.push"), targets: ["repository", "branch"], fields: [remote, branch, field("remote_branch","scm.remote_branch",true), check("upstream", "action.field.set_upstream"), check("force_lease", "action.field.force_with_lease")], destructive: label("action.warning.push") },
    { id: "stash_create", title: label("action.title.stash_create"), targets: ["changes", "repository"], fields: [field("message", "action.field.message_optional", true), check("untracked", "action.field.include_untracked"), check("keep_index", "action.field.keep_index")], touches_files: true },
    { id: "stash_apply", title: label("action.title.stash_apply"), targets: ["stash"], fields: [check("index", "action.field.restore_index")], touches_files: true },
    { id: "stash_pop", title: label("action.title.stash_pop"), targets: ["stash"], fields: [check("index", "action.field.restore_index")], touches_files: true },
    { id: "stash_drop", title: label("action.title.stash_drop"), targets: ["stash"], fields: [], destructive: label("action.warning.stash_drop") },
    { id: "stash_branch", title: label("action.title.stash_branch"), targets: ["stash"], fields: [branch], touches_files: true },
    { id: "clean", title: label("action.title.clean"), targets: ["changes"], fields: [check("directories", "action.field.clean_directories"), check("ignored", "action.field.clean_ignored")], touches_files: true, destructive: label("action.warning.clean") },
    {id:"worktree_add",title:label("scm.worktree_add"),targets:["repository"],fields:[field("directory","action.field.target_directory"),field("branch","scm.worktree_new_branch",true)]},
    {id:"worktree_remove",title:label("scm.worktree_remove"),targets:["worktree"],fields:[],touches_files:true,destructive:label("scm.worktree_remove_warning")},
    { id: "clone", title: label("action.title.clone"), targets: ["repository"], fields: [field("url", "action.field.repository_url"), field("directory", "action.field.target_directory")] },
    { id: "remote_add", title: label("action.title.remote_add"), targets: ["repository"], fields: [remote, field("url", "action.field.remote_url")] },
    { id: "remote_edit", title: label("action.title.remote_edit"), targets: ["repository"], fields: [remote, field("url", "action.field.remote_url"), check("push_url", "action.field.push_url")] },
    { id: "remote_remove", title: label("action.title.remote_remove"), targets: ["repository"], fields: [remote], destructive: label("action.warning.remote_remove") },
    { id: "remote_prune", title: label("action.title.remote_prune"), targets: ["repository"], fields: [remote], destructive: label("action.warning.remote_prune") },
    { id: "stage", title: label("action.title.stage"), targets: ["file"], fields: [] },
    { id: "unstage", title: label("action.title.unstage"), targets: ["file"], fields: [] },
    { id: "stage_all", title: label("action.title.stage_all"), targets: ["changes", "repository"], fields: [] },
    { id: "unstage_all", title: label("action.title.unstage_all"), targets: ["changes", "repository"], fields: [] },
    { id: "discard_file", title: label("action.title.discard_file"), targets: ["file"], fields: [], touches_files: true, destructive: label("action.warning.discard_file") },
    { id: "discard_changes", title: label("action.title.discard_changes"), targets: ["changes"], fields: [check("include_untracked", "action.field.discard_untracked", true)], touches_files: true, destructive: label("action.warning.discard_changes") },
    { id: "delete_untracked", title: label("action.title.delete_untracked"), targets: ["file"], fields: [], touches_files: true, destructive: label("action.warning.delete_untracked") },
    { id: "commit", title: label("action.title.commit"), targets: ["changes"], fields: [field("message", "action.field.commit_message"), check("amend", "action.field.amend")], destructive: label("action.warning.commit") },
    { id: "continue", title: label("action.title.continue"), targets: ["repository"], fields: [], touches_files: true },
    { id: "abort", title: label("action.title.abort"), targets: ["repository"], fields: [], touches_files: true },
    { id: "skip", title: label("action.title.skip"), targets: ["repository"], fields: [], touches_files: true },
  ];
}

const action_choice_label_keys: Record<string, git_graph_text_key> = {
  annotated: "action.choice.annotated", lightweight: "action.choice.lightweight", default: "action.choice.default", git: "action.choice.git",
  normal: "action.choice.normal", "no-ff": "action.choice.no_ff", "ff-only": "action.choice.ff_only", squash: "action.choice.squash",
  mixed: "action.choice.mixed", soft: "action.choice.soft", hard: "action.choice.hard", merge: "action.choice.merge", rebase: "action.choice.rebase",
};

export function graph_action_choice_label(value: string, locale?: git_graph_locale): string {
  const key = action_choice_label_keys[value];
  return key ? text(key, {}, locale) : value;
}

export const graph_actions = graph_actions_for();
export type action_context = { target: string; hash: string; root: string; operation: string; sign_commits?: boolean; sign_tags?: boolean; paths?: string[]; reference_space?: string };
type sync_target = { local_branch: string; upstream_ref: string; remote: string; remote_ref: string; remote_urls: string };
type discard_plan = {restore_paths: string[]; deleted_paths: string[]; untracked_paths: string[]; untracked_guards: string[]};
export type action_plan = { action: graph_action; args: string[]; preview: string; fingerprint: string; context: action_context; todo?: string; stdin?: string; index_guard?: string; network_guard?: string; file_guard?: string; sync?: {target: sync_target; push_args: string[]}; discard?: discard_plan; followup?: {args: string[]; if_staged: boolean}; worktree_guard?:string };
export type action_services = {trash_files?: (root: string, files: string[]) => Promise<void>};
const busy_repositories = new Set<string>();
const text_value = (value: unknown, name: string, required = true): string => {
  const normalized = typeof value === "string" ? value.trim() : "";
  if ((required && !normalized) || /[\0\r\n]/u.test(normalized) || normalized.startsWith("-")) throw new Error(text("action.error.invalid_value", {name}));
  return normalized;
};
async function valid_ref(run: git_run, root: string, value: unknown, tag = false): Promise<string> {
  const name = text_value(value, text(tag ? "action.label.tag_name" : "action.label.branch_name"));
  await run(root, ["check-ref-format", ...(tag ? [`refs/tags/${name}`] : ["--branch", name])]); return name;
}
/** 直接读取当前分支的上游配置；远端名可以含斜杠，不能通过拆分 origin/main 猜测。 */
async function read_sync_target(run: git_run, root: string): Promise<sync_target> {
  const local_branch = (await run(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]).catch(() => "")).trim();
  if (!local_branch) throw new Error(text("action.error.detached_sync"));
  const ref = "refs/heads/" + local_branch;
  const source = await run(root, ["for-each-ref", "--format=%(refname)%00%(upstream)%00%(upstream:remotename)%00%(upstream:remoteref)", ref]);
  const parts = source.trimEnd().split("\n").find(line => line.split("\0")[0] === ref)?.split("\0");
  if (!parts?.[1] || !parts[2] || !parts[3]?.startsWith("refs/heads/")) throw new Error(text("action.error.missing_upstream"));
  const remote_urls = parts[2] === "." ? "." : JSON.stringify(await Promise.all([
    run(root, ["remote", "get-url", "--all", parts[2]]), run(root, ["remote", "get-url", "--push", "--all", parts[2]]),
  ]));
  return {local_branch, upstream_ref: parts[1], remote: parts[2], remote_ref: parts[3], remote_urls};
}
/** 分组传入精确文件名单，目录和 Git pathspec 不能扩大范围；恢复来源始终是 index。 */
async function plan_discard_changes(run: git_run, root: string, paths: string[] | undefined, include_untracked: boolean): Promise<discard_plan> {
  if (!paths?.length || paths.some(file => !file || file.includes("\0") || /^(?:[a-z]:|[\\/])/iu.test(file) || file.split(/[\\/]/u).some(part => !part || part === "." || part === ".." || part.toLowerCase() === ".git"))) throw new Error(text("action.error.discard_paths"));
  const selected = [...new Set(paths)];
  const [index, working, untracked] = await Promise.all([
    run(root, ["ls-files", "--stage", "-z", "--", ...selected]),
    run(root, ["diff", "--name-status", "--no-renames", "--no-ext-diff", "--no-textconv", "-z", "--", ...selected]),
    run(root, ["ls-files", "--others", "--exclude-standard", "-z", "--", ...selected]),
  ]);
  const entries = new Map<string, string[]>();
  for (const record of index.split("\0").filter(Boolean)) {
    const tab = record.indexOf("\t"); const file = record.slice(tab + 1);
    entries.set(file, [...entries.get(file) || [], record.slice(0, tab)]);
  }
  // --no-renames 使每条记录固定为状态、原始路径两个 NUL 分隔字段，路径中的空格或制表符不会误分列。
  const changed = new Map<string, string>(); const records = working.split("\0");
  for (let index = 0; index + 1 < records.length; index += 2) changed.set(records[index + 1], records[index]);
  const others = new Set(untracked.split("\0"));
  const restore_paths: string[] = []; const deleted_paths: string[] = []; const untracked_paths: string[] = [];
  for (const file of selected) {
    const stages = entries.get(file);
    if (stages) {
      if (stages.length !== 1 || !stages[0].endsWith(" 0")) throw new Error(text("action.error.unresolved_conflict", {file: JSON.stringify(file)}));
      if (stages[0].startsWith("160000 ")) throw new Error(text("action.error.submodule", {file: JSON.stringify(file)}));
      if (!changed.has(file)) throw new Error(text("action.error.no_unstaged_changes", {file: JSON.stringify(file)}));
      restore_paths.push(file);
      if (changed.get(file) === "D") deleted_paths.push(file);
    } else if (others.has(file)) { if (include_untracked) untracked_paths.push(file); }
    else throw new Error(text("action.error.file_state_changed", {file: JSON.stringify(file)}));
  }
  if (!restore_paths.length && !untracked_paths.length) throw new Error(text("action.error.nothing_to_discard"));
  const untracked_guards = await Promise.all(untracked_paths.map(file => run(root, ["hash-object", "--no-filters", "--", file])));
  return {restore_paths, deleted_paths, untracked_paths, untracked_guards};
}
function discard_preview(discard: discard_plan, args: string[]): string {
  return text("action.preview.discard", {
    restore_count: discard.restore_paths.length,
    restore_lines: discard.restore_paths.map(file => text("action.preview.restore_file", {file: JSON.stringify(file)})).join("\n"),
    untracked_count: discard.untracked_paths.length,
    untracked_lines: discard.untracked_paths.map(file => text("action.preview.recycle_file", {file: JSON.stringify(file)})).join("\n"),
    command: args.length ? "\n\ngit " + args.map(arg => /\s/u.test(arg) ? JSON.stringify(arg) : arg).join(" ") : "",
  });
}
/** 从已确认的同一快照缩小范围；不能重新读取 Git，否则按钮选择可能认领后来出现的更改。 */
export function select_discard_scope(plan: action_plan, scope: "tracked" | "all"): action_plan {
  if (plan.action.id !== "discard_changes" || !plan.discard || scope !== "tracked" && scope !== "all") throw new Error(text("action.error.unknown_action"));
  const discard: discard_plan = {
    restore_paths: [...plan.discard.restore_paths], deleted_paths: [...plan.discard.deleted_paths],
    untracked_paths: scope === "all" ? [...plan.discard.untracked_paths] : [],
    untracked_guards: scope === "all" ? [...plan.discard.untracked_guards] : [],
  };
  if (!discard.restore_paths.length && !discard.untracked_paths.length) throw new Error(text("action.error.nothing_to_discard"));
  const args = [...plan.args];
  return {...plan, args, discard, preview: discard_preview(discard, args)};
}
export async function repository_fingerprint(run: git_run, root: string): Promise<string> {
  const [head, status, refs, working, staged, remotes] = await Promise.all([
    run(root, ["rev-parse", "--verify", "--quiet", "HEAD"]).catch(error => { if (error.code === 1) return "unborn"; throw error; }),
    run(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
    run(root, ["for-each-ref", "--format=%(refname) %(objectname)"]),
    run(root, ["diff", "--binary", "--no-ext-diff", "--no-textconv", "--"]),
    run(root, ["diff", "--cached", "--binary", "--no-ext-diff", "--no-textconv", "--"]),
    run(root, ["remote", "-v"]),
  ]); return JSON.stringify([head, status, refs, working, staged, remotes]);
}

export async function plan_git_action(run: git_run, id: string, context: action_context, values: Record<string, unknown>): Promise<action_plan> {
  const action = graph_actions_for().find(item => item.id === id);
  if (!action) throw new Error(text("action.error.unknown_action"));
  for (const item of action.fields) {
    const value = values[item.key];
    if (item.type === "choice" && !item.choices?.includes(String(value))) throw new Error(text("action.error.invalid_option", {field: item.title}));
    if (item.type === "boolean" && typeof value !== "boolean") throw new Error(text("action.error.invalid_option", {field: item.title}));
  }
  const { root } = context;
  const file_action = ["stage", "unstage", "discard_file", "delete_untracked"].includes(id);
  const target = file_action ? context.target : text_value(context.target, text("action.label.target"), false);
  if (target.includes("\0") || file_action && !target) throw new Error(text("action.error.invalid_file_path"));
  const paths = context.paths || [target];
  if ((file_action || context.paths) && (!paths.length || paths.some(path => !path || path.includes("\0") || /^(?:[a-z]:|[\\/])/iu.test(path) || path.split(/[\\/]/u).includes("..")))) throw new Error(text("action.error.invalid_file_path"));
  const hash = text_value(context.hash, text("action.label.commit"), false);
  const value = (key: string, required = true) => {
    if (key !== "message" && key !== "todo") return text_value(values[key], action.fields.find(item => item.key === key)?.title || key, required);
    const message = typeof values[key] === "string" ? values[key].trim() : "";
    if ((required && !message) || message.includes("\0")) throw new Error(text("action.error.invalid_commit_message")); return message;
  };
  const remote = () => value("remote");
  const reference = (value: unknown): unknown => typeof value === "string" && ["-", "_"].includes(context.reference_space || "") ? value.replace(/ /gu, context.reference_space!) : value;
  const branch = () => valid_ref(run, root, reference(values.branch));
  const flag = (key: string) => values[key] === true;
  const sign = context.sign_commits ? ["-S"] : [];
  const mainline = () => { const n = value("mainline", false); if (n && !/^[1-9]\d*$/u.test(n)) throw new Error(text("action.error.invalid_mainline")); return n ? ["-m", n] : []; };
  let worktree_snapshot:string|undefined;
  let args: string[]; let todo: string | undefined; let sync: action_plan["sync"]; let discard: discard_plan | undefined; let followup: action_plan["followup"];
  switch (id) {
    case "branch_create": { const name = await branch(); args = flag("checkout") ? ["checkout", "-b", name, hash] : ["branch", name, hash]; break; }
    case "branch_checkout": args = ["checkout", target]; break;
    case "remote_checkout": args = ["checkout", "-b", await branch(), "--track", target]; break;
    case "branch_rename": args = ["branch", "-m", target, await branch()]; break;
    case "branch_delete": args = ["branch", flag("force") ? "-D" : "-d", target]; break;
    case "remote_branch_delete": args = ["push", remote(), "--delete", await branch()]; break;
    case "branch_fetch": args = ["fetch", ...(flag("force") ? ["--force"] : []), remote(), `${await valid_ref(run, root, reference(values.source))}:${await branch()}`]; break;
    case "merge": args = ["merge", ...sign, ...(values.mode === "normal" ? [] : ["--" + value("mode")]), ...(flag("no_commit") ? ["--no-commit"] : ["--no-edit"]), hash]; break;
    case "rebase": {
      args = ["rebase", ...(context.sign_commits ? ["--gpg-sign"] : []), ...(flag("ignore_date") ? ["--ignore-date"] : []), ...(flag("preserve_merges") ? ["--rebase-merges"] : []), ...(flag("interactive") ? ["--interactive"] : []), hash];
      if (flag("interactive")) {
        if (flag("preserve_merges")) throw new Error(text("action.error.interactive_preserve_merges"));
        const commits = (await run(root, ["rev-list", "--reverse", "--no-merges", `${hash}..HEAD`])).trim().split("\n").filter(Boolean);
        todo = value("todo"); const seen = new Set<string>();
        for (const line of todo.split(/\r?\n/u)) {
          const match = /^(pick|reword|edit|squash|fixup|drop) ([a-f\d]{40}(?:[a-f\d]{24})?)(?: (.*))?$/u.exec(line.trim());
          if (!match || !commits.includes(match[2]) || seen.has(match[2])) throw new Error(text("action.error.invalid_todo_commit"));
          if (!seen.size && ["squash", "fixup"].includes(match[1])) throw new Error(text("action.error.invalid_todo_first_command"));
          if (match[1] === "reword" && !match[3]?.trim()) throw new Error(text("action.error.reword_subject_required")); seen.add(match[2]);
        }
        if (seen.size !== commits.length) throw new Error(text("action.error.incomplete_todo"));
      } break;
    }
    case "reset": if (!["soft", "mixed", "hard"].includes(value("mode"))) throw new Error(text("action.error.invalid_reset_mode")); args = ["reset", "--" + value("mode"), hash || "HEAD"]; break;
    case "commit_checkout": args = ["checkout", "--detach", hash]; break;
    case "cherry_pick": case "revert": args = [id === "revert" ? "revert" : "cherry-pick", ...sign, ...(id === "cherry_pick" && flag("record_origin") ? ["-x"] : []), ...mainline(), ...(flag("no_commit") ? ["--no-commit"] : id === "revert" ? ["--no-edit"] : []), hash]; break;
    case "drop": {
      await run(root, ["merge-base", "--is-ancestor", hash, "HEAD"]);
      const parents = (await run(root, ["show", "-s", "--format=%P", hash])).trim().split(" ").filter(Boolean);
      if (parents.length !== 1) throw new Error(text("action.error.invalid_drop_commit"));
      args = ["rebase", "--rebase-merges", "--onto", parents[0], hash]; break;
    }
    case "tag_add": {
      const tag = await valid_ref(run, root, reference(values.tag), true); const message = value("message", false); const signed = flag("sign") || context.sign_tags;
      args = ["tag", ...(signed ? ["-s", "-m", message || tag] : values.tag_type !== "lightweight" ? ["-a", "-m", message || tag] : []), tag, hash];
      if (flag("push")) followup = {args: ["push", remote(), `refs/tags/${tag}`], if_staged: false}; break;
    }
    case "tag_delete": args = ["tag", "-d", target]; break;
    case "tag_push": args = ["push", remote(), `refs/tags/${target}`]; break;
    case "fetch": args = ["fetch", ...(flag("prune") ? ["--prune"] : []), ...(flag("prune_tags") ? ["--prune-tags"] : []), ...(value("remote", false) ? [value("remote")] : ["--all"])]; break;
    case "pull": args = ["pull", ...sign, ...(values.mode === "rebase" ? ["--rebase"] : values.mode === "ff-only" ? ["--ff-only"] : ["--no-rebase", "--no-edit", ...(values.mode === "merge" ? [] : ["--" + value("mode")])]), remote(), await branch()]; break;
    case "sync": {
      if (context.operation) throw new Error(text("action.error.operation_blocks_sync"));
      const target = await read_sync_target(run, root);
      args = ["pull", ...sign, ...(values.mode === "rebase" ? ["--rebase"] : values.mode === "ff-only" ? ["--ff-only"] : ["--no-rebase", "--no-edit"]), target.remote, target.remote_ref];
      sync = {target, push_args: ["push", target.remote, `refs/heads/${target.local_branch}:${target.remote_ref}`]}; break;
    }
    case "push": {const local=await branch();const destination=value("remote_branch",false);args=["push",...(flag("upstream")?["--set-upstream"]:[]),...(flag("force_lease")?["--force-with-lease"]:[]),remote(),destination?`refs/heads/${local}:refs/heads/${await valid_ref(run,root,destination)}`:local];break;}
    case "stash_create": args = ["stash", "push", ...(flag("untracked") ? ["--include-untracked"] : []), ...(flag("keep_index") ? ["--keep-index"] : []), ...(value("message", false) ? ["-m", value("message")] : [])]; break;
    case "stash_apply": case "stash_pop": case "stash_drop": case "stash_branch":
      if (!/^stash@\{\d+\}$/u.test(target)) throw new Error(text("action.error.invalid_stash"));
      if ((await run(root, ["rev-parse", target])).trim() !== hash) throw new Error(text("action.error.stash_changed"));
      args = ["stash", id.slice(6), ...(id === "stash_branch" ? [await branch()] : flag("index") ? ["--index"] : []), target]; break;
    case "clean": args = ["clean", "-f", ...(flag("directories") ? ["-d"] : []), ...(flag("ignored") ? ["-x"] : [])]; break;
    case "worktree_add": {
      const directory=value("directory");
      if(!/^(?:[a-z]:[\\/]|\/)/iu.test(directory)||directory.split(/[\\/]/u).some(part=>part===".."||part.toLowerCase()===".git"))throw new Error(text("scm.worktree_absolute"));
      if(!/^[a-f\d]{40}(?:[a-f\d]{24})?$/u.test(hash))throw new Error(text("action.error.invalid_value",{name:text("action.label.commit")}));
      const name=value("branch",false);worktree_snapshot=await worktree_guard(run,root);
      args=["worktree","add",...(name?["-b",await branch()]:["--detach"]),"--",directory,hash];break;
    }
    case "worktree_remove": worktree_snapshot=await worktree_guard(run,root,target);args=["worktree","remove","--",target];break;
    case "clone": args = ["clone", "--", value("url"), value("directory")]; break;
    case "remote_add": args = ["remote", "add", remote(), value("url")]; break;
    case "remote_edit": args = ["remote", "set-url", ...(flag("push_url") ? ["--push"] : []), remote(), value("url")]; break;
    case "remote_remove": args = ["remote", "remove", remote()]; break;
    case "remote_prune": args = ["remote", "prune", remote()]; break;
    case "stage": args = ["add", "--", ...paths]; break;
    case "unstage": {
      const head = await run(root, ["rev-parse", "--verify", "--quiet", "HEAD"]).catch(error => { if (error.code === 1) return ""; throw error; });
      args = head ? ["reset", "--", ...paths] : ["rm", "--cached", "--", ...paths]; break;
    }
    case "stage_all": args = ["add", "-A", "--", "."]; break;
    case "unstage_all": {
      const head = await run(root, ["rev-parse", "--verify", "--quiet", "HEAD"]).catch(error => { if (error.code === 1) return ""; throw error; });
      args = head ? ["reset", "--", "."] : ["rm", "--cached", "-r", "--", "."]; break;
    }
    case "discard_file": args = ["restore", "--worktree", "--", target]; break;
    case "discard_changes": {
      discard = await plan_discard_changes(run, root, context.paths, flag("include_untracked"));
      // checkout-index 不带 -u 时只写工作区，不刷新索引的 stat 缓存或暂存内容。
      args = discard.restore_paths.length ? ["checkout-index", "--force", "--", ...discard.restore_paths] : []; break;
    }
    case "delete_untracked": args = ["clean", "-f", "--", target]; break;
    case "commit": args = ["commit", ...sign, ...(flag("amend") ? ["--amend"] : []), "-m", value("message")]; break;
    case "continue": case "abort": case "skip":
      if (!["merge", "rebase", "cherry-pick", "revert"].includes(context.operation)) throw new Error(text("action.error.no_operation"));
      if (context.operation === "merge" && id === "skip") throw new Error(text("action.error.merge_cannot_skip"));
      args = [context.operation, "--" + id]; break;
    default: throw new Error(text("action.error.unregistered"));
  }
  if (args.some(arg => arg.includes("\0"))) throw new Error(text("action.error.invalid_git_argument"));
  let preview = "git " + args.map(arg => /\s/u.test(arg) ? JSON.stringify(arg) : arg).join(" ");
  if (sync) preview = text("action.preview.sync", {
    local_branch: sync.target.local_branch,
    remote_branch: `${sync.target.remote}/${sync.target.remote_ref.slice(11)}`,
    pull_command: preview,
    push_command: "git " + sync.push_args.map(arg => /\s/u.test(arg) ? JSON.stringify(arg) : arg).join(" "),
  });
  if (discard) preview = discard_preview(discard, args);
  if (["merge", "pull"].includes(id) && values.mode === "squash" && !flag("no_commit")) {
    followup = {args: ["commit", ...sign, ...(values.squash_message === "git" ? ["--no-edit"] : ["-m", `Merge '${target || hash || value("branch")}'`])], if_staged: true};
  }
  if (followup) preview += "\n\n" + (followup.if_staged ? text("action.preview.if_staged") + "\n" : "") + "git " + followup.args.map(arg => JSON.stringify(arg)).join(" ");
  if (id === "clean") preview += "\n\n" + await run(root, args.map(arg => arg === "-f" ? "-n" : arg));
  if (id === "remote_prune") preview += "\n\n" + await run(root, [...args, "--dry-run"]);
  if (todo) preview += "\n\n" + todo;
  const file_guard = id === "delete_untracked" ? await run(root, ["hash-object", "--no-filters", "--", target]) : undefined;
  return { action, args, preview, file_guard, fingerprint: await repository_fingerprint(run, root), context, todo, sync, discard, followup, worktree_guard:worktree_snapshot };
}

export async function execute_git_action(run: git_run, plan: action_plan, can_change_files: () => boolean, services: action_services = {}): Promise<string> {
  const root = plan.context.root;
  if (busy_repositories.has(root)) throw new Error(text("action.error.busy"));
  busy_repositories.add(root);
  try {
    if (plan.action.touches_files && !can_change_files()) throw new Error(text("action.error.unsaved_document"));
    if (await repository_fingerprint(run, root) !== plan.fingerprint) throw new Error(text("action.error.repository_changed"));
    if (plan.network_guard !== undefined && await read_git_network_guard(run, root) !== plan.network_guard) throw new Error(text("quick.target_changed"));
    if(plan.worktree_guard!==undefined&&await worktree_guard(run,root,plan.action.id==="worktree_remove"?plan.context.target:undefined)!==plan.worktree_guard)throw new Error(text("action.error.repository_changed"));
    if (plan.file_guard && await run(root, ["hash-object", "--no-filters", "--", plan.context.target]) !== plan.file_guard) throw new Error(text("action.error.untracked_changed"));
    if (plan.discard) {
      const {restore_paths, untracked_paths, untracked_guards} = plan.discard;
      if (untracked_paths.length && !services.trash_files) throw new Error(text("action.error.recycle_unavailable"));
      const current_guards = await Promise.all(untracked_paths.map(file => run(root, ["hash-object", "--no-filters", "--", file])));
      if (current_guards.some((guard, index) => guard !== untracked_guards[index])) throw new Error(text("action.error.untracked_changed"));
      // 文件校验包含异步读取；用户可能在等待期间开始编辑，必须在第一笔写入前再次核对。
      if (!can_change_files()) throw new Error(text("action.error.unsaved_document"));
      if (restore_paths.length) await run(root, plan.args);
      try {
        if (untracked_paths.length) {
          // 已跟踪文件恢复也会等待 Git，继续回收前仍需保护此时新出现的编辑器草稿。
          if (!can_change_files()) throw new Error(text("action.error.unsaved_document"));
          await services.trash_files!(root, untracked_paths);
        }
      }
      catch (error) { throw new Error(text("action.error.trash_failed", {restored: restore_paths.length, error: String(error instanceof Error ? error.message : error)})); }
      return text("action.result.discard", {restored: restore_paths.length, untracked: untracked_paths.length});
    }
    if (plan.sync) {
      const guard = JSON.stringify(plan.sync.target);
      if (JSON.stringify(await read_sync_target(run, root)) !== guard) throw new Error(text("action.error.sync_target_changed"));
      // 上游校验经过异步读取，必须在开始拉取前再次保护此时新出现的草稿。
      if (!can_change_files()) throw new Error(text("action.error.unsaved_document"));
      // 一个仓库操作锁覆盖两步；pull 抛错时不会进入 push，也不自动解决冲突或提交未暂存内容。
      const pulled = await run(root, plan.args);
      if (JSON.stringify(await read_sync_target(run, root)) !== guard) throw new Error(text("action.error.sync_target_changed_after_pull"));
      if (plan.network_guard !== undefined && await read_git_network_guard(run, root) !== plan.network_guard) throw new Error(text("quick.target_changed"));
      const ahead = Number((await run(root, ["rev-list", "--count", "FETCH_HEAD..HEAD"])).trim());
      if (!Number.isSafeInteger(ahead) || ahead < 0) throw new Error(text("action.error.invalid_ahead_count"));
      if (!ahead) return pulled + "\n" + text("action.result.sync_no_push");
      try { return pulled + "\n" + await run(root, plan.sync.push_args); }
      catch (error) { throw new Error(text("action.error.push_after_pull_failed", {error: String(error instanceof Error ? error.message : error)})); }
    }
    if (plan.index_guard !== undefined && await run(root, ["ls-files", "--stage", "-z", "--", plan.context.target]) !== plan.index_guard) throw new Error(text("action.error.repository_changed"));
    if (plan.action.touches_files && !can_change_files()) throw new Error(text("action.error.unsaved_document"));
    const result = await run(root, plan.args, { todo: plan.todo, stdin: plan.stdin });
    if (plan.followup) {
      try {
        if (plan.followup.if_staged) {
          if (!can_change_files()) throw new Error(text("action.error.unsaved_document"));
          // 重检squash之后的index，发现两步之间的外部暂存改动。
          // 插件仓库锁不是外部Git事务锁，最后检查与commit之间仍非跨进程原子操作。
          const index_snapshot = await run(root, ["ls-files", "--stage", "-z"]);
          const staged = await run(root, ["diff", "--cached", "--name-only", "-z"]);
          if (!can_change_files()) throw new Error(text("action.error.unsaved_document"));
          if (await run(root, ["ls-files", "--stage", "-z"]) !== index_snapshot) throw new Error(text("action.error.repository_changed"));
          if (!staged) return result;
          if (!can_change_files()) throw new Error(text("action.error.unsaved_document"));
        }
        return result + "\n" + await run(root, plan.followup.args);
      } catch (error) { throw new Error(text("action.error.followup_failed", {error: String(error instanceof Error ? error.message : error)})); }
    }
    return result;
  } finally { busy_repositories.delete(root); }
}
