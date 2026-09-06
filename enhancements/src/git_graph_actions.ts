import type { git_run } from "./git_graph_data";

export type action_field = { key: string; title: string; type?: "boolean" | "choice"; choices?: string[]; optional?: boolean; initial?: string | boolean };
export type graph_action = { id: string; title: string; targets: string[]; fields: action_field[]; touches_files?: boolean; destructive?: string };
const field = (key: string, title: string, optional = false): action_field => ({ key, title, optional });
const check = (key: string, title: string, initial = false): action_field => ({ key, title, type: "boolean", initial });
const choice = (key: string, title: string, choices: string[]): action_field => ({ key, title, type: "choice", choices, initial: choices[0] });
const remote = field("remote", "远端名称");
const branch = field("branch", "分支名称");
export const graph_actions: graph_action[] = [
  { id: "branch_create", title: "创建分支", targets: ["commit", "branch", "tag"], fields: [branch, check("checkout", "创建后切换")], touches_files: true },
  { id: "branch_checkout", title: "切换分支", targets: ["branch"], fields: [], touches_files: true },
  { id: "remote_checkout", title: "检出远端分支", targets: ["remote"], fields: [branch], touches_files: true },
  { id: "branch_rename", title: "重命名分支", targets: ["branch"], fields: [branch] },
  { id: "branch_delete", title: "删除分支", targets: ["branch"], fields: [check("force", "允许删除未合并分支")], destructive: "删除所选分支引用。" },
  { id: "remote_branch_delete", title: "删除远端分支", targets: ["remote"], fields: [remote, branch], destructive: "删除服务器上的分支。" },
  { id: "branch_fetch", title: "获取到本地分支", targets: ["remote"], fields: [remote, field("source", "远端分支"), branch, check("force", "允许非快进更新本地分支")] },
  { id: "merge", title: "合并到当前分支", targets: ["commit", "branch", "remote"], fields: [choice("mode", "合并方式", ["normal", "no-ff", "ff-only", "squash"]), check("no_commit", "暂不创建提交")], touches_files: true },
  { id: "rebase", title: "将当前分支变基到此处", targets: ["commit", "branch", "remote"], fields: [check("preserve_merges", "保留合并结构"), check("ignore_date", "使用当前作者时间"), check("interactive", "交互式调整提交"), field("todo", "交互列表：pick / reword / edit / squash / fixup / drop + 完整编号 + 标题", true)], touches_files: true, destructive: "重写当前分支上被重放的提交。" },
  { id: "reset", title: "重置当前分支", targets: ["commit", "branch", "tag", "changes"], fields: [choice("mode", "重置方式", ["mixed", "soft", "hard"])], touches_files: true, destructive: "移动当前分支；hard 会丢弃已跟踪文件的未提交内容。" },
  { id: "commit_checkout", title: "检出此提交（游离 HEAD）", targets: ["commit", "tag"], fields: [], touches_files: true },
  { id: "cherry_pick", title: "拣选提交（Cherry-pick）", targets: ["commit"], fields: [check("no_commit", "只应用改动"), check("record_origin", "在说明中记录来源提交"), field("mainline", "合并提交的父编号", true)], touches_files: true },
  { id: "revert", title: "撤销提交（Revert）", targets: ["commit"], fields: [check("no_commit", "只应用改动"), field("mainline", "合并提交的父编号", true)], touches_files: true },
  { id: "drop", title: "从当前分支移除此提交", targets: ["commit"], fields: [], touches_files: true, destructive: "通过 rebase --onto 重写后继提交，移除所选提交。" },
  { id: "tag_add", title: "添加标签", targets: ["commit", "branch"], fields: [field("tag", "标签名称"), field("message", "注解说明（空为轻量标签）", true), check("sign", "签署标签")] },
  { id: "tag_delete", title: "删除标签", targets: ["tag"], fields: [], destructive: "删除本地标签引用。" },
  { id: "tag_push", title: "推送标签", targets: ["tag"], fields: [remote] },
  { id: "fetch", title: "获取远端更新", targets: ["repository", "remote"], fields: [field("remote", "远端名称（空为全部）", true), check("prune", "清理失效远端分支"), check("prune_tags", "同步清理标签")] },
  { id: "pull", title: "拉取到当前分支", targets: ["repository", "remote"], fields: [remote, branch, choice("mode", "整合方式", ["ff-only", "merge", "rebase", "no-ff", "squash"])], touches_files: true },
  { id: "sync", title: "同步更改", targets: ["repository"], fields: [choice("mode", "拉取整合方式", ["merge", "rebase", "ff-only"])], touches_files: true },
  { id: "push", title: "推送分支", targets: ["repository", "branch"], fields: [remote, branch, check("upstream", "设置上游"), check("force_lease", "Force-with-lease")], destructive: "更新服务器分支；Force-with-lease 可替换远端历史。" },
  { id: "stash_create", title: "贮藏未提交更改", targets: ["changes", "repository"], fields: [field("message", "说明", true), check("untracked", "包含未跟踪文件"), check("keep_index", "保留已暂存内容")], touches_files: true },
  { id: "stash_apply", title: "应用贮藏", targets: ["stash"], fields: [check("index", "恢复暂存状态")], touches_files: true },
  { id: "stash_pop", title: "弹出贮藏", targets: ["stash"], fields: [check("index", "恢复暂存状态")], touches_files: true },
  { id: "stash_drop", title: "删除贮藏", targets: ["stash"], fields: [], destructive: "删除所选 stash 的引用。" },
  { id: "stash_branch", title: "从贮藏创建分支", targets: ["stash"], fields: [branch], touches_files: true },
  { id: "clean", title: "清理未跟踪文件", targets: ["changes"], fields: [check("directories", "包含未跟踪目录"), check("ignored", "同时包含被忽略文件")], touches_files: true, destructive: "永久删除预览中列出的未跟踪文件；Git 无法恢复这些内容。" },
  { id: "clone", title: "克隆仓库", targets: ["repository"], fields: [field("url", "仓库 URL"), field("directory", "目标文件夹（应不存在或为空）")] },
  { id: "remote_add", title: "添加远端", targets: ["repository"], fields: [remote, field("url", "远端 URL 或路径")] },
  { id: "remote_edit", title: "修改远端 URL", targets: ["repository"], fields: [remote, field("url", "远端 URL 或路径"), check("push_url", "设置独立推送 URL")] },
  { id: "remote_remove", title: "删除远端配置", targets: ["repository"], fields: [remote], destructive: "移除本地远端配置及对应跟踪引用。" },
  { id: "remote_prune", title: "清理过期远端跟踪引用", targets: ["repository"], fields: [remote], destructive: "清理服务器上已不存在的跟踪引用。" },
  { id: "stage", title: "暂存文件", targets: ["file"], fields: [] },
  { id: "unstage", title: "取消暂存", targets: ["file"], fields: [] },
  { id: "stage_all", title: "暂存所有更改", targets: ["changes", "repository"], fields: [] },
  { id: "unstage_all", title: "取消所有暂存", targets: ["changes", "repository"], fields: [] },
  { id: "discard_file", title: "放弃文件更改", targets: ["file"], fields: [], touches_files: true, destructive: "将此文件恢复为暂存区版本，丢弃未暂存内容。" },
  { id: "discard_changes", title: "放弃所有更改", targets: ["changes"], fields: [check("include_untracked", "同时将所列未跟踪文件移入回收站", true)], touches_files: true, destructive: "所列已跟踪文件的未暂存内容将被暂存区版本覆盖；暂存内容保持不变。勾选时，所列未跟踪文件移入系统回收站。" },
  { id: "delete_untracked", title: "删除未跟踪文件", targets: ["file"], fields: [], touches_files: true, destructive: "永久删除所选未跟踪文件；Git 无法恢复。" },
  { id: "commit", title: "提交已暂存内容", targets: ["changes"], fields: [field("message", "提交说明"), check("amend", "修改上一个提交")], destructive: "amend 会改写上一个提交。" },
  { id: "continue", title: "继续当前 Git 操作", targets: ["repository"], fields: [], touches_files: true },
  { id: "abort", title: "中止当前 Git 操作", targets: ["repository"], fields: [], touches_files: true },
  { id: "skip", title: "跳过当前提交", targets: ["repository"], fields: [], touches_files: true },
];
export type action_context = { target: string; hash: string; root: string; operation: string; sign_commits?: boolean; sign_tags?: boolean; paths?: string[] };
type sync_target = { local_branch: string; upstream_ref: string; remote: string; remote_ref: string; remote_urls: string };
type discard_plan = {restore_paths: string[]; untracked_paths: string[]; untracked_guards: string[]};
export type action_plan = { action: graph_action; args: string[]; preview: string; fingerprint: string; context: action_context; todo?: string; file_guard?: string; sync?: {target: sync_target; push_args: string[]}; discard?: discard_plan };
export type action_services = {trash_files?: (root: string, files: string[]) => Promise<void>};
const busy_repositories = new Set<string>();
const text_value = (value: unknown, name: string, required = true): string => {
  const text = typeof value === "string" ? value.trim() : "";
  if ((required && !text) || /[\0\r\n]/u.test(text) || text.startsWith("-")) throw new Error(`${name} 无效。`);
  return text;
};
async function valid_ref(run: git_run, root: string, value: unknown, tag = false): Promise<string> {
  const name = text_value(value, tag ? "标签名称" : "分支名称");
  await run(root, ["check-ref-format", ...(tag ? [`refs/tags/${name}`] : ["--branch", name])]); return name;
}
/** 直接读取当前分支的上游配置；远端名可以含斜杠，不能通过拆分 origin/main 猜测。 */
async function read_sync_target(run: git_run, root: string): Promise<sync_target> {
  const local_branch = (await run(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]).catch(() => "")).trim();
  if (!local_branch) throw new Error("游离 HEAD 不能同步，请先切换到分支。");
  const ref = "refs/heads/" + local_branch;
  const source = await run(root, ["for-each-ref", "--format=%(refname)%00%(upstream)%00%(upstream:remotename)%00%(upstream:remoteref)", ref]);
  const parts = source.trimEnd().split("\n").find(line => line.split("\0")[0] === ref)?.split("\0");
  if (!parts?.[1] || !parts[2] || !parts[3]?.startsWith("refs/heads/")) throw new Error("当前分支尚未配置有效上游，请先发布分支并设置上游。");
  const remote_urls = parts[2] === "." ? "." : JSON.stringify(await Promise.all([
    run(root, ["remote", "get-url", "--all", parts[2]]), run(root, ["remote", "get-url", "--push", "--all", parts[2]]),
  ]));
  return {local_branch, upstream_ref: parts[1], remote: parts[2], remote_ref: parts[3], remote_urls};
}
/** 分组传入精确文件名单，目录和 Git pathspec 不能扩大范围；恢复来源始终是 index。 */
async function plan_discard_changes(run: git_run, root: string, paths: string[] | undefined, include_untracked: boolean): Promise<discard_plan> {
  if (!paths?.length || paths.some(file => !file || file.includes("\0") || /^(?:[a-z]:|[\\/])/iu.test(file) || file.split(/[\\/]/u).some(part => !part || part === "." || part === ".." || part.toLowerCase() === ".git"))) throw new Error("放弃更改必须提供分组中明确的相对文件路径，不能使用目录。");
  const selected = [...new Set(paths)];
  const [index, working, untracked] = await Promise.all([
    run(root, ["ls-files", "--stage", "-z", "--", ...selected]),
    run(root, ["diff", "--name-only", "--no-renames", "--no-ext-diff", "--no-textconv", "-z", "--", ...selected]),
    run(root, ["ls-files", "--others", "--exclude-standard", "-z", "--", ...selected]),
  ]);
  const entries = new Map<string, string[]>();
  for (const record of index.split("\0").filter(Boolean)) {
    const tab = record.indexOf("\t"); const file = record.slice(tab + 1);
    entries.set(file, [...entries.get(file) || [], record.slice(0, tab)]);
  }
  const changed = new Set(working.split("\0")); const others = new Set(untracked.split("\0"));
  const restore_paths: string[] = []; const untracked_paths: string[] = [];
  for (const file of selected) {
    const stages = entries.get(file);
    if (stages) {
      if (stages.length !== 1 || !stages[0].endsWith(" 0")) throw new Error(`文件存在未解决冲突，请先处理：${JSON.stringify(file)}`);
      if (stages[0].startsWith("160000 ")) throw new Error(`子模块需要进入其仓库处理，未放弃更改：${JSON.stringify(file)}`);
      if (!changed.has(file)) throw new Error(`文件已没有未暂存更改，请刷新：${JSON.stringify(file)}`);
      restore_paths.push(file);
    } else if (others.has(file)) { if (include_untracked) untracked_paths.push(file); }
    else throw new Error(`文件已改变、被忽略或不是独立文件，请刷新：${JSON.stringify(file)}`);
  }
  if (!restore_paths.length && !untracked_paths.length) throw new Error("没有所选类型的更改可放弃。");
  const untracked_guards = await Promise.all(untracked_paths.map(file => run(root, ["hash-object", "--no-filters", "--", file])));
  return {restore_paths, untracked_paths, untracked_guards};
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
  const action = graph_actions.find(item => item.id === id);
  if (!action) throw new Error("未知 Git 操作。");
  for (const item of action.fields) {
    const value = values[item.key];
    if (item.type === "choice" && !item.choices?.includes(String(value))) throw new Error(`选项无效：${item.title}`);
    if (item.type === "boolean" && typeof value !== "boolean") throw new Error(`选项无效：${item.title}`);
  }
  const { root } = context;
  const file_action = ["stage", "unstage", "discard_file", "delete_untracked"].includes(id);
  const target = file_action ? context.target : text_value(context.target, "目标", false);
  if (target.includes("\0") || file_action && !target) throw new Error("文件路径无效。");
  const paths = context.paths || [target];
  if ((file_action || context.paths) && (!paths.length || paths.some(path => !path || path.includes("\0") || /^(?:[a-z]:|[\\/])/iu.test(path) || path.split(/[\\/]/u).includes("..")))) throw new Error("文件路径无效。");
  const hash = text_value(context.hash, "提交", false);
  const value = (key: string, required = true) => {
    if (key !== "message" && key !== "todo") return text_value(values[key], key, required);
    const message = typeof values[key] === "string" ? values[key].trim() : "";
    if ((required && !message) || message.includes("\0")) throw new Error("提交说明无效。"); return message;
  };
  const remote = () => value("remote");
  const branch = () => valid_ref(run, root, values.branch);
  const flag = (key: string) => values[key] === true;
  const sign = context.sign_commits ? ["-S"] : [];
  const mainline = () => { const n = value("mainline", false); if (n && !/^[1-9]\d*$/u.test(n)) throw new Error("父编号必须为正整数。"); return n ? ["-m", n] : []; };
  let args: string[]; let todo: string | undefined; let sync: action_plan["sync"]; let discard: discard_plan | undefined;
  switch (id) {
    case "branch_create": { const name = await branch(); args = flag("checkout") ? ["checkout", "-b", name, hash] : ["branch", name, hash]; break; }
    case "branch_checkout": args = ["checkout", target]; break;
    case "remote_checkout": args = ["checkout", "-b", await branch(), "--track", target]; break;
    case "branch_rename": args = ["branch", "-m", target, await branch()]; break;
    case "branch_delete": args = ["branch", flag("force") ? "-D" : "-d", target]; break;
    case "remote_branch_delete": args = ["push", remote(), "--delete", await branch()]; break;
    case "branch_fetch": args = ["fetch", ...(flag("force") ? ["--force"] : []), remote(), `${await valid_ref(run, root, values.source)}:${await branch()}`]; break;
    case "merge": args = ["merge", ...sign, ...(values.mode === "normal" ? [] : ["--" + value("mode")]), ...(flag("no_commit") ? ["--no-commit"] : ["--no-edit"]), hash]; break;
    case "rebase": {
      args = ["rebase", ...(context.sign_commits ? ["--gpg-sign"] : []), ...(flag("ignore_date") ? ["--ignore-date"] : []), ...(flag("preserve_merges") ? ["--rebase-merges"] : []), ...(flag("interactive") ? ["--interactive"] : []), hash];
      if (flag("interactive")) {
        if (flag("preserve_merges")) throw new Error("交互列表编辑线性提交；保留合并结构请取消交互选项。");
        const commits = (await run(root, ["rev-list", "--reverse", "--no-merges", `${hash}..HEAD`])).trim().split("\n").filter(Boolean);
        todo = value("todo"); const seen = new Set<string>();
        for (const line of todo.split(/\r?\n/u)) {
          const match = /^(pick|reword|edit|squash|fixup|drop) ([a-f\d]{40}(?:[a-f\d]{24})?)(?: (.*))?$/u.exec(line.trim());
          if (!match || !commits.includes(match[2]) || seen.has(match[2])) throw new Error("交互列表包含无效、重复或范围外提交。");
          if (!seen.size && ["squash", "fixup"].includes(match[1])) throw new Error("首条不能合并到尚不存在的前一提交。");
          if (match[1] === "reword" && !match[3]?.trim()) throw new Error("reword 后须填写新的提交标题。"); seen.add(match[2]);
        }
        if (seen.size !== commits.length) throw new Error("交互列表必须列出范围内每条提交；删除提交请显式使用 drop。");
      } break;
    }
    case "reset": if (!["soft", "mixed", "hard"].includes(value("mode"))) throw new Error("重置方式无效。"); args = ["reset", "--" + value("mode"), hash || "HEAD"]; break;
    case "commit_checkout": args = ["checkout", "--detach", hash]; break;
    case "cherry_pick": case "revert": args = [id === "revert" ? "revert" : "cherry-pick", ...sign, ...(id === "cherry_pick" && flag("record_origin") ? ["-x"] : []), ...mainline(), ...(flag("no_commit") ? ["--no-commit"] : id === "revert" ? ["--no-edit"] : []), hash]; break;
    case "drop": {
      await run(root, ["merge-base", "--is-ancestor", hash, "HEAD"]);
      const parents = (await run(root, ["show", "-s", "--format=%P", hash])).trim().split(" ").filter(Boolean);
      if (parents.length !== 1) throw new Error("移除操作要求所选提交有一个父提交；根提交或合并提交请使用显式 rebase / revert。");
      args = ["rebase", "--rebase-merges", "--onto", parents[0], hash]; break;
    }
    case "tag_add": { const tag = await valid_ref(run, root, values.tag, true); const message = value("message", false); const signed = flag("sign") || context.sign_tags; args = ["tag", ...(signed ? ["-s", "-m", message || tag] : message ? ["-a", "-m", message] : []), tag, hash]; break; }
    case "tag_delete": args = ["tag", "-d", target]; break;
    case "tag_push": args = ["push", remote(), `refs/tags/${target}`]; break;
    case "fetch": args = ["fetch", ...(flag("prune") ? ["--prune"] : []), ...(flag("prune_tags") ? ["--prune-tags"] : []), ...(value("remote", false) ? [value("remote")] : ["--all"])]; break;
    case "pull": args = ["pull", ...sign, ...(values.mode === "rebase" ? ["--rebase"] : values.mode === "ff-only" ? ["--ff-only"] : ["--no-rebase", "--no-edit", ...(values.mode === "merge" ? [] : ["--" + value("mode")])]), remote(), await branch()]; break;
    case "sync": {
      if (context.operation) throw new Error("请先完成或中止当前 Git 操作，再同步更改。");
      const target = await read_sync_target(run, root);
      args = ["pull", ...sign, ...(values.mode === "rebase" ? ["--rebase"] : values.mode === "ff-only" ? ["--ff-only"] : ["--no-rebase", "--no-edit"]), target.remote, target.remote_ref];
      sync = {target, push_args: ["push", target.remote, `refs/heads/${target.local_branch}:${target.remote_ref}`]}; break;
    }
    case "push": args = ["push", ...(flag("upstream") ? ["--set-upstream"] : []), ...(flag("force_lease") ? ["--force-with-lease"] : []), remote(), await branch()]; break;
    case "stash_create": args = ["stash", "push", ...(flag("untracked") ? ["--include-untracked"] : []), ...(flag("keep_index") ? ["--keep-index"] : []), ...(value("message", false) ? ["-m", value("message")] : [])]; break;
    case "stash_apply": case "stash_pop": case "stash_drop": case "stash_branch":
      if (!/^stash@\{\d+\}$/u.test(target)) throw new Error("Stash 引用无效，请刷新。");
      if ((await run(root, ["rev-parse", target])).trim() !== hash) throw new Error("Stash 列表已改变，请刷新。");
      args = ["stash", id.slice(6), ...(id === "stash_branch" ? [await branch()] : flag("index") ? ["--index"] : []), target]; break;
    case "clean": args = ["clean", "-f", ...(flag("directories") ? ["-d"] : []), ...(flag("ignored") ? ["-x"] : [])]; break;
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
      if (!["merge", "rebase", "cherry-pick", "revert"].includes(context.operation)) throw new Error("没有可继续或中止的操作。");
      if (context.operation === "merge" && id === "skip") throw new Error("合并操作不支持跳过。");
      args = [context.operation, "--" + id]; break;
    default: throw new Error("操作尚未注册。");
  }
  if (args.some(arg => arg.includes("\0"))) throw new Error("Git 参数包含无效字符。");
  let preview = "git " + args.map(arg => /\s/u.test(arg) ? JSON.stringify(arg) : arg).join(" ");
  if (sync) preview = `确认同步本地分支 ${sync.target.local_branch} 与 ${sync.target.remote}/${sync.target.remote_ref.slice(11)}。\n先拉取并整合远端提交；成功后推送尚未发布的提交。拉取失败或发生冲突时停止，不执行推送。\n\n1. ${preview}\n2. git ${sync.push_args.map(arg => /\s/u.test(arg) ? JSON.stringify(arg) : arg).join(" ")}\n\n没有待推送提交时跳过第二步。`;
  if (discard) preview = [`恢复到暂存区版本（${discard.restore_paths.length} 个文件）：`, ...discard.restore_paths.map(file => "  恢复：" + JSON.stringify(file)), `\n移入系统回收站（${discard.untracked_paths.length} 个未跟踪文件）：`, ...discard.untracked_paths.map(file => "  回收：" + JSON.stringify(file)), ...(args.length ? ["\n" + preview] : []), "\n仅处理上述精确文件；不会取消暂存，不会清理其他文件。"].join("\n");
  if (id === "clean") preview += "\n\n" + await run(root, args.map(arg => arg === "-f" ? "-n" : arg));
  if (id === "remote_prune") preview += "\n\n" + await run(root, [...args, "--dry-run"]);
  if (todo) preview += "\n\n" + todo;
  const file_guard = id === "delete_untracked" ? await run(root, ["hash-object", "--no-filters", "--", target]) : undefined;
  return { action, args, preview, file_guard, fingerprint: await repository_fingerprint(run, root), context, todo, sync, discard };
}

export async function execute_git_action(run: git_run, plan: action_plan, can_change_files: () => boolean, services: action_services = {}): Promise<string> {
  const root = plan.context.root;
  if (busy_repositories.has(root)) throw new Error("此仓库已有操作在执行。");
  busy_repositories.add(root);
  try {
    if (plan.action.touches_files && !can_change_files()) throw new Error("当前 Typora 文档有未保存修改。请先保存，再执行会改变工作区文件的操作。");
    if (await repository_fingerprint(run, root) !== plan.fingerprint) throw new Error("仓库已被其他程序改变，请重新预览操作。");
    if (plan.file_guard && await run(root, ["hash-object", "--no-filters", "--", plan.context.target]) !== plan.file_guard) throw new Error("未跟踪文件内容已改变，请重新预览。 ");
    if (plan.discard) {
      const {restore_paths, untracked_paths, untracked_guards} = plan.discard;
      if (untracked_paths.length && !services.trash_files) throw new Error("系统回收站不可用，未放弃任何更改。请取消包含未跟踪文件后重新预览。");
      const current_guards = await Promise.all(untracked_paths.map(file => run(root, ["hash-object", "--no-filters", "--", file])));
      if (current_guards.some((guard, index) => guard !== untracked_guards[index])) throw new Error("未跟踪文件内容已改变，请重新预览放弃更改。");
      if (restore_paths.length) await run(root, plan.args);
      try { if (untracked_paths.length) await services.trash_files!(root, untracked_paths); }
      catch (error) { throw new Error(`已恢复 ${restore_paths.length} 个已跟踪文件；移入回收站失败，未执行永久删除。请检查文件状态：${String(error instanceof Error ? error.message : error)}`); }
      return `已恢复 ${restore_paths.length} 个文件，${untracked_paths.length} 个未跟踪文件已移入回收站。暂存内容未改变。`;
    }
    if (plan.sync) {
      const guard = JSON.stringify(plan.sync.target);
      if (JSON.stringify(await read_sync_target(run, root)) !== guard) throw new Error("当前分支或上游配置已改变，请重新预览同步。");
      // 一个仓库操作锁覆盖两步；pull 抛错时不会进入 push，也不自动解决冲突或提交未暂存内容。
      const pulled = await run(root, plan.args);
      if (JSON.stringify(await read_sync_target(run, root)) !== guard) throw new Error("已完成拉取，但当前分支或上游配置发生改变，已停止推送。请刷新并重新同步。");
      const ahead = Number((await run(root, ["rev-list", "--count", "FETCH_HEAD..HEAD"])).trim());
      if (!Number.isSafeInteger(ahead) || ahead < 0) throw new Error("已完成拉取，但无法确认待推送提交，已停止推送。");
      if (!ahead) return pulled + "\n同步完成，没有待推送提交。";
      try { return pulled + "\n" + await run(root, plan.sync.push_args); }
      catch (error) { throw new Error("已完成拉取，但推送失败：" + String(error instanceof Error ? error.message : error)); }
    }
    return await run(root, plan.args, { todo: plan.todo });
  } finally { busy_repositories.delete(root); }
}
