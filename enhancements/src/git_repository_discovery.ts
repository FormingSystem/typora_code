import {workspace_text} from "./workspace_i18n";
import {read_workspace_directory} from './workspace_directory_service';
import {is_missing_repository} from "./git_graph_repository";
import type {git_run} from "./git_graph_data";

/** Asynchronous scanning and Git verification are separated; git can be a directory or worktree pointing to a file, and cannot be determined solely by name as a repository. */
export async function discover_git_repositories(options: {
  root: string; depth: number; run: git_run; fs: any; path: any; signal?: AbortSignal;
}): Promise<{roots: string[]; visited: number; errors: string[]}> {
  const result = {roots: [] as string[], visited: 0, errors: [] as string[]};
  const known = new Set<string>();
  const verify = async (directory: string) => {
    try {
      const root = (await options.run(directory, ["rev-parse", "--show-toplevel"])).trim();
      const key = options.path.normalize(root);
      if (!known.has(key)) { known.add(key); result.roots.push(root); }
    } catch (error) { if (!is_missing_repository(error)) result.errors.push(directory + ": " + String(error)); }
  };
  const walk = async (directory: string, level: number) => {
    if (options.signal?.aborted) throw new Error(workspace_text("git_repository_discovery_repository_discovery_canceled"));
    result.visited++;
    let entries: any[];
    try { entries = await read_workspace_directory(options.fs,options.path,options.root,directory); }
    catch (error) { result.errors.push(directory + ": " + String(error)); return; }
    if (level === 0 || entries.some(entry => entry.name === ".git")) await verify(directory);
    if (level >= options.depth) return;
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.isSymbolicLink() && ![".git", "node_modules", ".cache", ".svn"].includes(entry.name)) await walk(options.path.join(directory, entry.name), level + 1);
    }
  };
  await walk(options.root, 0); return result;
}
