/** 同一宿主内，同一真实仓库的多个视图共用写互斥；不占据工作台或其他仓库。 */
const repository_operations = new WeakMap<object, Set<string>>();
export function acquire_git_repository_operation(owner: object, root: string, normalize: (path: string) => string): () => void {
  const key = normalize(root), active = repository_operations.get(owner) || new Set<string>();
  if (active.has(key)) throw new Error("此仓库已有 Git 操作正在执行，请等待它完成。");
  repository_operations.set(owner, active); active.add(key);
  let released = false;
  return () => { if (!released) { released = true; active.delete(key); if (!active.size) repository_operations.delete(owner); } };
}
