import {workspace_text} from "./workspace_i18n";
/** Within the same host, multiple views of the same real repository share write mutual exclusion; they do not occupy the workbench or other repositories. */
const repository_operations = new WeakMap<object, Set<string>>();
export function acquire_git_repository_operation(owner: object, root: string, normalize: (path: string) => string): () => void {
  const key = normalize(root), active = repository_operations.get(owner) || new Set<string>();
  if (active.has(key)) throw new Error(workspace_text("git_repository_operation_this_repository_already_has_git_operation_in_progress_please"));
  repository_operations.set(owner, active); active.add(key);
  let released = false;
  return () => { if (!released) { released = true; active.delete(key); if (!active.size) repository_operations.delete(owner); } };
}
