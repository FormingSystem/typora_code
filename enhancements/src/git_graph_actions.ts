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
  { id: "branch_fetch", title: "Fetch 到本地分支", targets: ["remote"], fields: [remote, field("source", "远端分支"), branch, check("force", "允许非快进更新本地分支")] },
  { id: "merge", title: "合并到当前分支", targets: ["commit", "branch", "remote"], fields: [choice("mode", "合并方式", ["normal", "no-ff", "ff-only", "squash"]), check("no_commit", "暂不创建提交")], touches_files: true },
  { id: "rebase", title: "将当前分支变基到此处", targets: ["commit", "branch", "remote"], fields: [check("preserve_merges", "保留合并结构"), check("ignore_date", "使用当前作者时间"), check("interactive", "交互式调整提交"), field("todo", "交互列表：pick / reword / edit / squash / fixup / drop + 完整编号 + 标题", true)], touches_files: true, destructive: "重写当前分支上被重放的提交。" },
  { id: "reset", title: "重置当前分支", targets: ["commit", "branch", "tag", "changes"], fields: [choice("mode", "重置方式", ["mixed", "soft", "hard"])], touches_files: true, destructive: "移动当前分支；hard 会丢弃已跟踪文件的未提交内容。" },
  { id: "commit_checkout", title: "检出此提交（游离 HEAD）", targets: ["commit", "tag"], fields: [], touches_files: true },
  { id: "cherry_pick", title: "Cherry-pick 提交", targets: ["commit"], fields: [check("no_commit", "只应用改动"), check("record_origin", "在说明中记录来源提交"), field("mainline", "合并提交的父编号", true)], touches_files: true },
  { id: "revert", title: "Revert 提交", targets: ["commit"], fields: [check("no_commit", "只应用改动"), field("mainline", "合并提交的父编号", true)], touches_files: true },
  { id: "drop", title: "从当前分支移除此提交", targets: ["commit"], fields: [], touches_files: true, destructive: "通过 rebase --onto 重写后继提交，移除所选提交。" },
  { id: "tag_add", title: "添加标签", targets: ["commit", "branch"], fields: [field("tag", "标签名称"), field("message", "注解说明（空为轻量标签）", true), check("sign", "签署标签")] },
  { id: "tag_delete", title: "删除标签", targets: ["tag"], fields: [], destructive: "删除本地标签引用。" },
  { id: "tag_push", title: "推送标签", targets: ["tag"], fields: [remote] },
  { id: "fetch", title: "Fetch 远端", targets: ["repository", "remote"], fields: [field("remote", "远端名称（空为全部）", true), check("prune", "清理失效远端分支"), check("prune_tags", "同步清理标签")] },
  { id: "pull", title: "Pull 到当前分支", targets: ["repository", "remote"], fields: [remote, branch, choice("mode", "整合方式", ["ff-only", "merge", "rebase", "no-ff", "squash"])], touches_files: true },
  { id: "push", title: "推送分支", targets: ["repository", "branch"], fields: [remote, branch, check("upstream", "设置上游"), check("force_lease", "Force-with-lease")], destructive: "更新服务器分支；Force-with-lease 可替换远端历史。" },
  { id: "stash_create", title: "暂存未提交改动（stash）", targets: ["changes", "repository"], fields: [field("message", "说明", true), check("untracked", "包含未跟踪文件"), check("keep_index", "保留已暂存内容")], touches_files: true },
  { id: "stash_apply", title: "应用 stash", targets: ["stash"], fields: [check("index", "恢复暂存状态")], touches_files: true },
  { id: "stash_pop", title: "应用并移除 stash", targets: ["stash"], fields: [check("index", "恢复暂存状态")], touches_files: true },
  { id: "stash_drop", title: "删除 stash", targets: ["stash"], fields: [], destructive: "删除所选 stash 的引用。" },
  { id: "stash_branch", title: "从 stash 创建分支", targets: ["stash"], fields: [branch], touches_files: true },
  { id: "clean", title: "清理未跟踪文件", targets: ["changes"], fields: [check("directories", "包含未跟踪目录"), check("ignored", "同时包含被忽略文件")], touches_files: true, destructive: "永久删除预览中列出的未跟踪文件；Git 无法恢复这些内容。" },
  { id: "remote_add", title: "添加远端", targets: ["repository"], fields: [remote, field("url", "远端 URL 或路径")] },
  { id: "remote_edit", title: "修改远端 URL", targets: ["repository"], fields: [remote, field("url", "远端 URL 或路径"), check("push_url", "设置独立推送 URL")] },
  { id: "remote_remove", title: "删除远端配置", targets: ["repository"], fields: [remote], destructive: "移除本地远端配置及对应跟踪引用。" },
  { id: "remote_prune", title: "Prune 远端跟踪引用", targets: ["repository"], fields: [remote], destructive: "清理服务器上已不存在的跟踪引用。" },
  { id: "stage", title: "暂存文件", targets: ["file"], fields: [] },
  { id: "unstage", title: "取消暂存", targets: ["file"], fields: [] },
  { id: "commit", title: "提交已暂存内容", targets: ["changes"], fields: [field("message", "提交说明"), check("amend", "修改上一个提交")], destructive: "amend 会改写上一个提交。" },
  { id: "continue", title: "继续当前 Git 操作", targets: ["repository"], fields: [], touches_files: true },
  { id: "abort", title: "中止当前 Git 操作", targets: ["repository"], fields: [], touches_files: true },
  { id: "skip", title: "跳过当前提交", targets: ["repository"], fields: [], touches_files: true },
];
export type action_context = { target: string; hash: string; root: string; operation: string; sign_commits?: boolean; sign_tags?: boolean };
export type action_plan = { action: graph_action; args: string[]; preview: string; fingerprint: string; context: action_context; todo?: string };
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
  const target = ["stage", "unstage"].includes(id) ? context.target : text_value(context.target, "目标", false);
  if (target.includes("\0") || ["stage", "unstage"].includes(id) && !target) throw new Error("文件路径无效。");
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
  let args: string[]; let todo: string | undefined;
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
    case "push": args = ["push", ...(flag("upstream") ? ["--set-upstream"] : []), ...(flag("force_lease") ? ["--force-with-lease"] : []), remote(), await branch()]; break;
    case "stash_create": args = ["stash", "push", ...(flag("untracked") ? ["--include-untracked"] : []), ...(flag("keep_index") ? ["--keep-index"] : []), ...(value("message", false) ? ["-m", value("message")] : [])]; break;
    case "stash_apply": case "stash_pop": case "stash_drop": case "stash_branch":
      if (!/^stash@\{\d+\}$/u.test(target)) throw new Error("Stash 引用无效，请刷新。");
      if ((await run(root, ["rev-parse", target])).trim() !== hash) throw new Error("Stash 列表已改变，请刷新。");
      args = ["stash", id.slice(6), ...(id === "stash_branch" ? [await branch()] : flag("index") ? ["--index"] : []), target]; break;
    case "clean": args = ["clean", "-f", ...(flag("directories") ? ["-d"] : []), ...(flag("ignored") ? ["-x"] : [])]; break;
    case "remote_add": args = ["remote", "add", remote(), value("url")]; break;
    case "remote_edit": args = ["remote", "set-url", ...(flag("push_url") ? ["--push"] : []), remote(), value("url")]; break;
    case "remote_remove": args = ["remote", "remove", remote()]; break;
    case "remote_prune": args = ["remote", "prune", remote()]; break;
    case "stage": args = ["add", "--", target]; break;
    case "unstage": {
      const head = await run(root, ["rev-parse", "--verify", "--quiet", "HEAD"]).catch(error => { if (error.code === 1) return ""; throw error; });
      args = head ? ["reset", "--", target] : ["rm", "--cached", "--", target]; break;
    }
    case "commit": args = ["commit", ...sign, ...(flag("amend") ? ["--amend"] : []), "-m", value("message")]; break;
    case "continue": case "abort": case "skip":
      if (!["merge", "rebase", "cherry-pick", "revert"].includes(context.operation)) throw new Error("没有可继续或中止的操作。");
      if (context.operation === "merge" && id === "skip") throw new Error("合并操作不支持跳过。");
      args = [context.operation, "--" + id]; break;
    default: throw new Error("操作尚未注册。");
  }
  if (args.some(arg => arg.includes("\0"))) throw new Error("Git 参数包含无效字符。");
  let preview = "git " + args.map(arg => /\s/u.test(arg) ? JSON.stringify(arg) : arg).join(" ");
  if (id === "clean") preview += "\n\n" + await run(root, args.map(arg => arg === "-f" ? "-n" : arg));
  if (id === "remote_prune") preview += "\n\n" + await run(root, [...args, "--dry-run"]);
  if (todo) preview += "\n\n" + todo;
  return { action, args, preview, fingerprint: await repository_fingerprint(run, root), context, todo };
}

export async function execute_git_action(run: git_run, plan: action_plan, can_change_files: () => boolean): Promise<string> {
  const root = plan.context.root;
  if (busy_repositories.has(root)) throw new Error("此仓库已有操作在执行。");
  busy_repositories.add(root);
  try {
    if (plan.action.touches_files && !can_change_files()) throw new Error("当前 Typora 文档有未保存修改。请先保存，再执行会改变工作区文件的操作。");
    if (await repository_fingerprint(run, root) !== plan.fingerprint) throw new Error("仓库已被其他程序改变，请重新预览操作。");
    return await run(root, plan.args, { todo: plan.todo });
  } finally { busy_repositories.delete(root); }
}
