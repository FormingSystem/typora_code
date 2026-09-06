export const GIT_GRAPH_COMMAND = "linux_note:git_graph";
export const GIT_GRAPH_TYPE = "linux_note.git_graph";
export const GIT_PAGE_SIZE = 200;
export const GIT_MAX_COMMITS = 5000;
export type git_run = (cwd: string, args: string[]) => Promise<string>;
export type git_commit = { hash: string; parents: string[]; author: string; date: string; subject: string };
export type git_ref = { hash: string; name: string };
export type git_snapshot = { root: string; head: string; refs: git_ref[]; commits: git_commit[]; more: boolean };
export type git_file = { status: string; path: string };

const valid_hash = (hash: string) => /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(hash);
function require_hash(hash: string): string {
  if (!valid_hash(hash)) throw new Error("提交编号无效，请刷新 Git Graph。");
  return hash;
}

/** NUL 分隔避免中文、空格和提交标题中的换行影响字段边界。 */
export function parse_git_log(source: string): git_commit[] {
  const fields = source.split("\0");
  if (fields.at(-1) === "") fields.pop();
  if (fields.length % 5) throw new Error("Git 历史格式不完整。");
  const commits: git_commit[] = [];
  for (let index = 0; index < fields.length; index += 5) {
    const [hash, parent_text, author, date, subject] = fields.slice(index, index + 5);
    const parents = parent_text ? parent_text.split(" ") : [];
    require_hash(hash); parents.forEach(require_hash);
    commits.push({ hash, parents, author, date, subject });
  }
  return commits;
}

export async function read_git_snapshot(run: git_run, cwd: string, limit = GIT_PAGE_SIZE, revision = ""): Promise<git_snapshot> {
  const root = (await run(cwd, ["rev-parse", "--show-toplevel"])).replace(/[\r\n]+$/u, "");
  const [ref_text, head_text] = await Promise.all([
    run(root, ["for-each-ref", "--format=%(objectname)%00%(*objectname)%00%(refname)", "refs/heads", "refs/remotes", "refs/tags"]),
    // --quiet 在尚无首个提交的仓库返回 1；其他错误必须继续报告。
    run(root, ["rev-parse", "--verify", "--quiet", "HEAD"]).catch((error) => {
      if (error.code === 1) return "";
      throw error;
    }),
  ]);
  const head = head_text.trim();
  const refs = ref_text.split("\n").filter(Boolean).map((line) => {
    const [object_hash, peeled_hash, name] = line.replace(/\r$/u, "").split("\0");
    return { hash: require_hash(peeled_hash || object_hash), name };
  });
  const count = Math.min(GIT_MAX_COMMITS, Math.max(GIT_PAGE_SIZE, Math.floor(limit)));
  const revisions = revision ? [require_hash(revision)] : ["--all", ...(head ? [require_hash(head)] : [])];
  const commits = refs.length || head ? parse_git_log(await run(root, ["log", "--topo-order", "--date-order",
    `--max-count=${count + 1}`, "--format=%H%x00%P%x00%an%x00%aI%x00%s", "-z", ...revisions, "--"])) : [];
  return { root, head, refs, commits: commits.slice(0, count), more: commits.length > count };
}

function diff_arguments(hash: string, parent: string): string[] {
  return ["diff-tree", "--root", "--no-commit-id", "-r", "--no-renames", "--no-ext-diff", "--no-textconv",
    ...(parent ? [require_hash(parent)] : []), require_hash(hash)];
}

export async function read_git_files(run: git_run, root: string, hash: string, parent = ""): Promise<git_file[]> {
  const text = await run(root, [...diff_arguments(hash, parent), "--name-status", "-z", "--"]);
  const fields = text.split("\0");
  if (fields.at(-1) === "") fields.pop();
  if (fields.length % 2) throw new Error("Git 文件列表格式不完整。");
  const files: git_file[] = [];
  for (let index = 0; index < fields.length; index += 2) files.push({ status: fields[index], path: fields[index + 1] });
  return files;
}

export function read_git_patch(run: git_run, root: string, hash: string, parent: string, file: string): Promise<string> {
  if (!file || file.includes("\0")) throw new Error("文件路径无效。");
  return run(root, [...diff_arguments(hash, parent), "-p", "--unified=3", "--no-color", "--", file]);
}

export function read_git_message(run: git_run, root: string, hash: string): Promise<string> {
  return run(root, ["show", "--no-patch", "--format=%B", require_hash(hash), "--"]);
}

type graph_lane = { hash: string; color: number };
export type graph_edge = { from: number; to: number; color: number; upper: boolean };
export type graph_row = { lane: number; color: number; edges: graph_edge[] };
/** 按拓扑顺序跟踪尚未出现的父提交；汇合复用已有轨道，分叉新增轨道。 */
export function build_git_graph(commits: git_commit[]): { rows: graph_row[]; width: number } {
  let lanes: graph_lane[] = [];
  let next_color = 0;
  let width = 1;
  const rows: graph_row[] = [];
  for (const commit of commits) {
    const incoming = [...lanes];
    let lane = lanes.findIndex((item) => item.hash === commit.hash);
    if (lane < 0) { lane = lanes.length; lanes.push({ hash: commit.hash, color: next_color++ }); }
    const current = lanes[lane];
    const edges: graph_edge[] = incoming.map((item, index) => ({ from: index, to: index, color: item.color, upper: true }));
    const before = [...lanes];
    lanes.splice(lane, 1);
    let insert_at = lane;
    commit.parents.forEach((hash, index) => {
      if (!lanes.some((item) => item.hash === hash)) {
        lanes.splice(insert_at++, 0, { hash, color: index === 0 ? current.color : next_color++ });
      }
    });
    before.forEach((item, index) => {
      if (index !== lane) edges.push({ from: index, to: lanes.findIndex((next) => next.hash === item.hash), color: item.color, upper: false });
    });
    for (const hash of commit.parents) {
      const target = lanes.findIndex((item) => item.hash === hash);
      edges.push({ from: lane, to: target, color: lanes[target].color, upper: false });
    }
    width = Math.max(width, before.length, lanes.length);
    rows.push({ lane, color: current.color, edges });
  }
  return { rows, width };
}
