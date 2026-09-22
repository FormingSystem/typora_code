export type workspace_tree_row<T> = {item?: T; directory?: string; depth: number};
/** 先组织路径树再按展开状态投影；名称/状态排序也不会拆散同一目录。 */
export function workspace_tree_rows<T>(items: readonly T[], path_of: (item: T) => string, collapsed: ReadonlySet<string>, compact = false): workspace_tree_row<T>[] {
  type node = {path: string; directories: Map<string, node>; files: T[]};
  const root: node = {path: "", directories: new Map(), files: []};
  for (const item of items) {
    const parts = path_of(item).split("/"); let current = root;
    for (const part of parts.slice(0, -1)) {
      if (!current.directories.has(part)) current.directories.set(part, {path: current.path ? current.path + "/" + part : part, directories: new Map(), files: []});
      current = current.directories.get(part)!;
    }
    current.files.push(item);
  }
  const result: workspace_tree_row<T>[] = [];
  const walk = (current: node, depth: number) => {
    for (let child of current.directories.values()) {
      if (compact) while (!child.files.length && child.directories.size === 1) child = child.directories.values().next().value!;
      result.push({directory: child.path, depth});
      if (!collapsed.has(child.path)) walk(child, depth + 1);
    }
    for (const item of current.files) result.push({item, depth});
  };
  walk(root, 0); return result;
}
