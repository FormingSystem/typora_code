import {read_status_snapshot,read_changes_snapshot} from './git_status_snapshot';
import {read_scm_tracking, read_branch_status, type branch_status, type scm_tracking} from "./git_scm_data";
import { parse_git_log, type git_commit, type git_run, type git_ref } from "./git_graph_data";
import { glob_matches, type graph_settings } from "./git_graph_settings";
import { git_graph_text as text } from "./git_graph_i18n";

export const WORKTREE = "WORKTREE";
export const INDEX = "INDEX";
export const EMPTY = "EMPTY";
export type graph_commit = git_commit & { email?: string; committer?: string; committer_email?: string; commit_date?: string; stash?: string };
export type graph_change = { status: string; path: string; old_path?: string; index_status?: string; work_status?: string };
export type repository_state = {
  root: string; head: string; branch: string; refs: git_ref[]; commits: graph_commit[]; more: boolean;
  tracking?: scm_tracking; status?: branch_status;
  stashes: { hash: string; name: string; subject: string; date: string }[];
  changes: graph_change[]; remotes: { name: string; fetch: string; push: string }[]; operation: string;
};
/** 底栏和仓库行读取同一状态；精简模型也保留未出生分支和分离HEAD语义。 */
export function repository_branch_status(state: repository_state): branch_status {
  return state.status || {branch: state.branch || "(detached)", head: state.head || "(initial)",
    upstream: state.tracking?.upstream?.replace(/^refs\/remotes\//u, "") || "", ahead: state.tracking?.ahead || 0,
    behind: state.tracking?.behind || 0, dirty: state.changes.length > 0};
}
/** VS Code repository.headLabel：工作树*、暂存+、合并/变基!各自独立。 */
export function repository_head_label(state: repository_state): string {
  const status=repository_branch_status(state);
  const name=status.branch==="(detached)"?status.head.slice(0,8):status.branch||"Git";
  const working=state.changes.some(change=>change.status==="??"||Boolean(change.work_status?.trim()));
  const staged=state.changes.some(change=>Boolean(change.index_status?.trim())&&change.index_status!=="?");
  const conflict=state.operation==="merge"||state.operation==="rebase"||state.changes.some(change=>["DD","AU","UD","UA","DU","AA","UU"].includes(change.status));
  return name+(working?"*":"")+(staged?"+":"")+(conflict?"!":"");
}
export function require_revision(value: string): string {
  if (!/^[a-f\d]{40}(?:[a-f\d]{24})?$/u.test(value)) throw new Error(text("repository.invalid_revision")); return value;
}
export function parse_status(source: string): graph_change[] {
  const fields = source.split("\0"); const result: graph_change[] = [];
  for (let i = 0; i < fields.length; i++) {
    if (!fields[i]) continue;
    const status = fields[i].slice(0, 2); const item: graph_change = { status: status.trim(), index_status: status[0], work_status: status[1], path: fields[i].slice(3) };
    if (/[RC]/u.test(status)) item.old_path = fields[++i];
    result.push(item);
  }
  return result;
}
export function parse_changes(source: string): graph_change[] {
  const fields = source.split("\0"); const result: graph_change[] = [];
  for (let i = 0; i < fields.length && fields[i];) {
    const status = fields[i++]; const old_path = /^[RC]/u.test(status) ? fields[i++] : undefined;
    const path = fields[i++]; if (!path) throw new Error(text("repository.incomplete_diff"));
    result.push({ status, path, ...(old_path ? { old_path } : {}) });
  }
  return result;
}
const quiet_head = async (run: git_run, root: string) => run(root, ["rev-parse", "--verify", "--quiet", "HEAD"]).then(value => value.trim()).catch(error => { if (error.code === 1) return ""; throw error; });

/** 只把 Git 明确报告的非仓库识别为空状态；权限、可执行文件和损坏仓库错误继续报告。 */
export function is_missing_repository(error: unknown): boolean {
  return (error as {code?: number})?.code === 128 && /not a git repository \(or any of the parent directories\): \.git/u.test(String((error as Error)?.message));
}
export async function initialize_repository(run: git_run, cwd: string): Promise<void> {
  try { await run(cwd, ["rev-parse", "--show-toplevel"]); return; }
  catch (error) { if (!is_missing_repository(error)) throw error; }
  await run(cwd, ["init"]);
}

export async function read_repository(run: git_run, cwd: string, settings: graph_settings, count: number, branches: string[] = []): Promise<repository_state> {
  const root = (await run(cwd, ["rev-parse", "--show-toplevel"])).replace(/[\r\n]+$/u, "");
  const [head, branch, ref_text, stash_text, changes, remote_text, git_path, branch_only] = await Promise.all([
    quiet_head(run, root),
    run(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]).then(value => value.trim()).catch(error => { if (error.code === 1) return ""; throw error; }),
    run(root, ["for-each-ref", "--format=%(objectname)%00%(*objectname)%00%(refname)%00%(objecttype)%00%(*objecttype)", "refs/heads", "refs/remotes", "refs/tags"]),
    settings.show_stashes ? run(root, ["stash", "list", "--format=%H%x00%gd%x00%gs%x00%aI", "-z"]) : "",
    settings.show_changes ? read_status_snapshot(run, root, settings.show_untracked) : [],
    run(root, ["remote", "-v"]),
    run(root, ["rev-parse", "--absolute-git-dir"]),
    settings.show_changes ? undefined : read_branch_status(run, root),
  ]);
  const refs = ref_text.split("\n").filter(line => /\0commit(?:\0|$)/u.test(line)).map(line => {
    const [hash, peeled, name] = line.replace(/\r$/u, "").split("\0"); return { hash: peeled || hash, name };
  });
  const stash_fields = stash_text.split("\0"); const stashes: repository_state["stashes"] = [];
  for (let i = 0; i + 3 < stash_fields.length; i += 4) stashes.push({ hash: stash_fields[i], name: stash_fields[i + 1], subject: stash_fields[i + 2], date: stash_fields[i + 3] });
  const remotes: repository_state["remotes"] = [];
  for (const line of remote_text.split("\n")) {
    const match = /^(\S+)\s+(.+) \((fetch|push)\)$/u.exec(line.replace(/\r$/u, "")); if (!match) continue;
    let entry = remotes.find(item => item.name === match[1]);
    if (!entry) { entry = { name: match[1], fetch: "", push: "" }; remotes.push(entry); }
    entry[match[3] as "fetch" | "push"] = match[2];
  }
  const tracking=await read_scm_tracking(run,root,branch,head,refs);
  const status=branch_only || {head:head||"(initial)",branch:branch||"(detached)",upstream:tracking.upstream.replace(/^refs\/remotes\//u,""),ahead:tracking.ahead,behind:tracking.behind,dirty:changes.length>0};
  const automatic=branches.length===1&&branches[0]==="AUTO";
  const selected_refs = refs.filter(ref => {
    if(automatic)return ["refs/heads/"+branch,tracking.upstream,tracking.base].includes(ref.name);
    if (!settings.show_remotes && ref.name.startsWith("refs/remotes/")) return false;
    if (!settings.show_remote_heads && ref.name.startsWith("refs/remotes/") && ref.name.endsWith("/HEAD")) return false;
    if ((!settings.show_tags || !settings.tag_only_commits) && ref.name.startsWith("refs/tags/")) return false;
    return !branches.length || branches.some(pattern => pattern === ref.name || glob_matches(pattern.replace(/^glob:/u, ""), ref.name.replace(/^refs\//u, "")));
  });
  const starts = new Set(selected_refs.map(ref => require_revision(ref.hash)));
  if (head && (!branches.length || automatic || branches.includes("HEAD"))) starts.add(head);
  const ordinary_starts = [...starts];
  const hidden_stash_parents = new Set<string>();
  if (!branches.length && stashes.length) {
    const parent_text = await run(root, ["log", "--no-walk=unsorted", "--format=%P", ...stashes.map(stash => require_revision(stash.hash)), "--"]);
    const helpers = new Set(parent_text.trim().split(/\r?\n/u).flatMap(line => line.split(" ").slice(1)).filter(Boolean));
    for (const hash of helpers) {
      // 只隐藏stash私有辅助对象；普通分支／标签仍可达的同一提交不能丢弃。
      const outside = ordinary_starts.length ? await run(root, ["rev-list", "--max-count=1", require_revision(hash), "--not", ...ordinary_starts, "--"]) : hash;
      if (outside.trim()) hidden_stash_parents.add(hash);
    }
  }
  if (!branches.length) for (const stash of stashes) starts.add(stash.hash);
  const records = starts.size || settings.include_reflogs ? await run(root, ["log", `--${settings.order}-order`, `--max-count=${Math.max(1, count) + 1 + hidden_stash_parents.size}`,
    ...(settings.first_parent ? ["--first-parent"] : []), ...(!branches.length && settings.include_reflogs ? ["--reflog"] : []),
    `--format=%H%x00%P%x00%${settings.use_mailmap ? "aN" : "an"}%x00%aI%x00%s%x00%${settings.use_mailmap ? "aE" : "ae"}%x00%${settings.use_mailmap ? "cN" : "cn"}%x00%cI%x00%${settings.use_mailmap ? "cE" : "ce"}`, "-z", ...starts, "--"]) : "";
  const fields = records.split("\0"); const commits: graph_commit[] = [];
  for (let i = 0; i + 8 < fields.length; i += 9) {
    const base = parse_git_log(fields.slice(i, i + 5).join("\0") + "\0")[0];
    if (hidden_stash_parents.has(base.hash)) continue;
    if (stashes.some(item => item.hash === base.hash)) base.parents = base.parents.slice(0, 1);
    commits.push({ ...base, email: fields[i + 5], committer: fields[i + 6], commit_date: fields[i + 7], committer_email: fields[i + 8], stash: stashes.find(item => item.hash === base.hash)?.name });
  }
  // Git 自身决定工作树状态，文件系统只用于识别进行中的多步操作。
  const operation = git_path.trim();
  return { root, head, branch, refs, tracking, status, commits: commits.slice(0, count), more: commits.length > count, stashes, changes, remotes, operation };
}

function comparison_args(from: string, to: string, head: string): string[] {
  if (from === EMPTY && to !== WORKTREE && to !== INDEX) return ["diff-tree", "--root", "--no-commit-id", "-r", require_revision(to)];
  if (from === INDEX && to === WORKTREE) return ["diff"];
  if (to === INDEX) return ["diff", "--cached", ...(head ? [require_revision(from === EMPTY ? head : from)] : [])];
  if (to === WORKTREE) return ["diff", ...(from === EMPTY ? [] : [require_revision(from)] )];
  return ["diff", require_revision(from), require_revision(to)];
}
export async function compare_files(run: git_run, state: repository_state, from: string, to: string): Promise<graph_change[]> {
  // 尚无首次提交时，暂存的新文件也属于工作区内容，普通 diff 只会返回未暂存差量。
  if (from === EMPTY && to === WORKTREE) return state.changes.filter(file => file.work_status !== "D").map(file => ({ ...file, status: "A" }));
  const changes = await read_changes_snapshot(run,state.root,[...comparison_args(from, to, state.head), "--find-renames", "--name-status", "-z", "--no-ext-diff", "--no-textconv", "--"]);
  if (to === WORKTREE) {
    const paths = new Set(changes.map(file => file.path));
    for (const file of state.changes) if (file.status === "??" && !paths.has(file.path)) { paths.add(file.path); changes.push(file); }
  }
  return changes;
}
export async function compare_patch(run: git_run, state: repository_state, from: string, to: string, file: graph_change): Promise<string> {
  if (file.status === "??" || from === EMPTY && to === WORKTREE) return ""; // 无基准内容由宿主读取并显示为新增。
  return run(state.root, [...comparison_args(from, to, state.head), "--find-renames", "-p", "--no-ext-diff", "--no-textconv", "--", file.path, ...(file.old_path ? [file.old_path] : [])]);
}

/** --follow 在重命名前继续追踪旧路径；每个提交携带当时的文件名，避免拿今天的路径读旧对象。 */
export async function read_file_history(run: git_run, root: string, file: string, count = 200): Promise<{commit: graph_commit; file: graph_change}[]> {
  const source = await run(root, ["log", "--follow", `--max-count=${count}`, "--format=%H%x00%P%x00%an%x00%aI%x00%s", "-z", "--name-status", "--find-renames", "--", file]);
  const fields = source.split("\0"); const result: {commit: graph_commit; file: graph_change}[] = [];
  for (let index = 0; index < fields.length && fields[index];) {
    const commit = parse_git_log(fields.slice(index, index + 5).join("\0") + "\0")[0]; index += 5;
    while (index < fields.length && fields[index] && !/^[a-f\d]{40}(?:[a-f\d]{24})?$/u.test(fields[index])) {
      const status = fields[index++].replace(/^\n/u, "");
      if (!/^[ACDMRTUXB][0-9]*$/u.test(status)) throw new Error(text("repository.invalid_history_status"));
      const old_path = /^[RC]/u.test(status) ? fields[index++] : undefined;
      const path = fields[index++]; if (!path) throw new Error(text("repository.missing_history_path"));
      result.push({commit, file: {status, path, ...(old_path ? {old_path} : {})}});
    }
  }
  return result;
}
export async function commit_containment(run: git_run, state: repository_state, hash: string): Promise<string> {
  require_revision(hash);
  const [refs, in_head] = await Promise.all([
    run(state.root, ["for-each-ref", `--contains=${hash}`, "--format=%(refname)"]),
    state.head ? run(state.root, ["merge-base", "--is-ancestor", hash, state.head]).then(() => true).catch(error => { if (error.code === 1) return false; throw error; }) : false,
  ]);
  const stashes = await Promise.all(state.stashes.map(async stash => {
    try { await run(state.root, ["merge-base", "--is-ancestor", hash, stash.hash]); return stash.name; } catch (error) { if (error.code === 1) return ""; throw error; }
  }));
  return [in_head ? text("repository.in_head_history") : text("repository.not_in_head_history"), refs.trim(), ...stashes.filter(Boolean)].filter(Boolean).join("\n");
}

export function pull_request_url(remote: string, branch: string, base: string, custom = ""): string {
  const web = remote.replace(/^git@([^:]+):/u, "https://$1/").replace(/^ssh:\/\/git@/u, "https://").replace(/\.git\/?$/u, "");
  const url = new URL(web); if (!["http:", "https:"].includes(url.protocol)) throw new Error(text("repository.no_remote_web_url"));
  const replacement = (template: string) => template.replace(/\{(branch|base|remote)\}/gu, (_, name) => name === "remote" ? web : encodeURIComponent(name === "branch" ? branch : base));
  if (custom) return replacement(custom);
  if (url.hostname === "github.com") return `${web}/compare/${encodeURIComponent(base)}...${encodeURIComponent(branch)}?expand=1`;
  if (url.hostname === "gitlab.com") return `${web}/-/merge_requests/new?merge_request[source_branch]=${encodeURIComponent(branch)}&merge_request[target_branch]=${encodeURIComponent(base)}`;
  if (url.hostname === "bitbucket.org") return `${web}/pull-requests/new?source=${encodeURIComponent(branch)}&dest=${encodeURIComponent(base)}`;
  throw new Error(text("repository.pr_template_required"));
}

export type commit_hover_detail = {message:string;files:number;insertions:number;deletions:number};
export async function read_commit_hover_detail(run:git_run,state:repository_state,commit:graph_commit):Promise<commit_hover_detail>{
  const hash=require_revision(commit.hash);
  const [message,source]=await Promise.all([
    run(state.root,["show","-s","--format=%B",hash,"--"]),
    run(state.root,[...comparison_args(commit.parents[0]||EMPTY,hash,state.head),"--numstat","-z","--find-renames","--no-ext-diff","--no-textconv","--"])
  ]);
  let files=0,insertions=0,deletions=0;
  const records=source.split("\0");
  for(let index=0;index<records.length;index++){
    const record=records[index];if(!record)continue;
    const match=/^(\d+|-)\t(\d+|-)\t([\s\S]*)$/u.exec(record);
    if(!match)throw new Error(text("history.stats_unavailable"));
    files++;if(match[1]!=="-")insertions+=Number(match[1]);if(match[2]!=="-")deletions+=Number(match[2]);
    // -z重命名以空路径引出旧名、新名；文件名中的制表符不能作为下一条记录。
    if(!match[3])index+=2;
  }
  return {message:message.trim(),files,insertions,deletions};
}
