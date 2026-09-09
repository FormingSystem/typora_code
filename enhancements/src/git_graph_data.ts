import { git_graph_text as text } from "./git_graph_i18n";

export const GIT_GRAPH_COMMAND = "linux_note:git_graph";
export const GIT_GRAPH_TYPE = "linux_note.git_graph";
export type git_run = (cwd: string, args: string[], execution?: { todo?: string }) => Promise<string>;
export type git_commit = { hash: string; parents: string[]; author: string; date: string; subject: string };
export type git_ref = { hash: string; name: string };

const valid_hash = (hash: string) => /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(hash);
function require_hash(hash: string): string {
  if (!valid_hash(hash)) throw new Error(text("data.invalid_commit_hash"));
  return hash;
}

/** NUL 分隔避免中文、空格和提交标题中的换行影响字段边界。 */
export function parse_git_log(source: string): git_commit[] {
  const fields = source.split("\0");
  if (fields.at(-1) === "") fields.pop();
  if (fields.length % 5) throw new Error(text("data.incomplete_history"));
  const commits: git_commit[] = [];
  for (let index = 0; index < fields.length; index += 5) {
    const [hash, parent_text, author, date, subject] = fields.slice(index, index + 5);
    const parents = parent_text ? parent_text.split(" ") : [];
    require_hash(hash); parents.forEach(require_hash);
    commits.push({ hash, parents, author, date, subject });
  }
  return commits;
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
