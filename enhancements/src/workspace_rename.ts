import {workspace_text} from "./workspace_i18n";
type rename_modules = {fs: any; path_api: any};
export type workspace_rename_plan = {old_path: string; new_path: string; directory: boolean; apply(): Promise<void>};
const identity = (stat: any) => `${stat.dev}:${stat.ino}`;
const same_entry = (left: any, right: any) => identity(left) === identity(right) && left.mode === right.mode && left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;

/** Paths are compared by component, avoid a directory mistakenly matching to abc. The returned path retains the size case of the new name. */
export function renamed_workspace_path(path_api: any, candidate: string, old_path: string, new_path: string, directory: boolean): string | undefined {
  if (!candidate || !path_api.isAbsolute(candidate)) return;
  const relative = path_api.relative(old_path, candidate);
  if (!relative) return new_path;
  if (!directory || path_api.isAbsolute(relative) || relative === ".." || relative.startsWith(".." + path_api.sep)) return;
  return path_api.join(new_path, relative);
}

/** Only rename within the same directory; check that there is no cross-process lock between Node rename; cannot claim atomic compare-and-swap. */
export async function prepare_workspace_rename(modules: rename_modules, root: string, source: string, name: string): Promise<workspace_rename_plan> {
  const {path_api} = modules, fs = modules.fs.promises;
  if (!path_api.isAbsolute(root) || !path_api.isAbsolute(source)) throw new Error(workspace_text("rename_renaming_requires_an_absolute_path_within_the_workspace"));
  if (!name || name === "." || name === ".." || /[\/\\\x00-\x1f]/u.test(name)) throw new Error(workspace_text("rename_please_enter_a_name_that_does_not_contain_path_separators_co"));
  if (path_api.sep === "\\" && (/[<>:"|?*]/u.test(name) || /[ .]$/u.test(name) || /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu.test(name))) throw new Error(workspace_text("rename_the_name_contains_windows_invalid_characters_reserved_names"));
  return prepare_workspace_move(modules,root,source,path_api.join(path_api.dirname(source),name));
}

/** Moving across directories retains the rename transaction; the target must still be within the same workspace and not pass through symbolic links. */
export async function prepare_workspace_move(modules: rename_modules, root: string, source: string, target: string): Promise<workspace_rename_plan> {
  const {path_api}=modules,fs=modules.fs.promises;
  if(![root,source,target].every(value=>path_api.isAbsolute(value)))throw new Error(workspace_text("rename_moving_requires_an_absolute_path_within_the_workspace"));
  root=path_api.resolve(root);source=path_api.resolve(source);target=path_api.resolve(target);
  if(!path_api.relative(root,source))throw new Error(workspace_text("rename_cannot_move_or_rename_the_workspace_root_directory"));
  const name=path_api.basename(target);
  if(/[\x00-\x1f]/u.test(target)||!name||name==="."||name===".."||path_api.sep==="\\"&&(/[<>:"|?*]/u.test(name)||/[ .]$/u.test(name)||/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(name)))throw new Error(workspace_text("rename_the_target_name_is_invalid"));
  const target_relative=path_api.relative(root,target);
  if(!target_relative||path_api.isAbsolute(target_relative)||target_relative===".."||target_relative.startsWith(".."+path_api.sep))throw new Error(workspace_text("rename_the_target_must_be_within_the_current_workspace"));
  const nested=path_api.relative(source,target);
  if(nested&&!path_api.isAbsolute(nested)&&nested!==".."&&!nested.startsWith(".."+path_api.sep))throw new Error(workspace_text("rename_cannot_move_a_folder_into_itself"));
  const relative = path_api.relative(root, source);
  if (!relative || path_api.isAbsolute(relative) || relative === ".." || relative.startsWith(".." + path_api.sep)) throw new Error(workspace_text("rename_only_files_or_folders_within_the_current_workspace_can_be_re"));
  const root_real = await fs.realpath(root), parent = path_api.dirname(source), parent_real = await fs.realpath(parent);
  const parent_relative = path_api.relative(root_real, parent_real);
  if (path_api.isAbsolute(parent_relative) || parent_relative === ".." || parent_relative.startsWith(".." + path_api.sep)) throw new Error(workspace_text("rename_the_project_points_to_a_symbol_link_outside_the_workspace_so"));
  // Do not follow links in the rename path. The root directory itself is selected by the user and can resolve to its real directory.
  let walk = root;
  for (const component of relative.split(path_api.sep)) {
    walk = path_api.join(walk, component);
    if ((await fs.lstat(walk)).isSymbolicLink()) throw new Error(workspace_text("rename_do_not_rename_symbol_links_or_projects_in_a_linked_directory"));
  }
  const target_parent=path_api.dirname(target),target_parent_real=await fs.realpath(target_parent);
  let target_walk=root;
  for(const component of path_api.relative(root,target_parent).split(path_api.sep).filter(Boolean)){
    target_walk=path_api.join(target_walk,component);if((await fs.lstat(target_walk)).isSymbolicLink())throw new Error(workspace_text("rename_the_target_directory_cannot_be_through_a_symbol_link"));
  }
  const target_parent_identity=identity(await fs.stat(target_parent_real));
  const root_identity = identity(await fs.stat(root_real)), parent_identity = identity(await fs.stat(parent_real)), snapshot = await fs.lstat(source);
  if (!snapshot.isFile() && !snapshot.isDirectory()) throw new Error(workspace_text("rename_only_regular_files_or_folders_can_be_renamed"));
  const case_only = path_api.sep === "\\" && source.toLowerCase() === target.toLowerCase() && source !== target;
  const check_target = async () => {
    try {
      const existing = await fs.lstat(target);
      if (source === target || case_only && identity(existing) === identity(snapshot)) return;
      throw new Error(workspace_text("rename_a_file_or_folder_with_the_same_name_already_exists_no_conten"));
    } catch (error) { if ((error as {code?: string}).code !== "ENOENT") throw error; }
  };
  await check_target();
  let used = false;
  return {old_path: source, new_path: target, directory: snapshot.isDirectory(), async apply() {
    if (used) throw new Error(workspace_text("rename_this_rename_operation_has_been_executed_please_refresh_and_r")); used = true;
    if (source === target) return;
    if (await fs.realpath(root) !== root_real || identity(await fs.stat(root_real)) !== root_identity || await fs.realpath(parent) !== parent_real || identity(await fs.stat(parent_real)) !== parent_identity || !same_entry(snapshot, await fs.lstat(source))) throw new Error(workspace_text("rename_the_file_or_its_directory_has_changed_please_refresh_and_ren"));
    if(await fs.realpath(target_parent)!==target_parent_real||identity(await fs.stat(target_parent_real))!==target_parent_identity)throw new Error(workspace_text("rename_the_target_directory_has_changed_please_refresh_and_move_aga"));
    await check_target();
    // Windows's MoveFileEx/Node rename supports only changing the case of the name, without the need for a temporary path.
    await fs.rename(source, target);
    if (identity(await fs.lstat(target)) !== identity(snapshot)) throw new Error(workspace_text("rename_the_project_was_replaced_by_another_process_after_renaming_p"));
  }};
}
