import {workspace_text} from "./workspace_i18n";
import {remote_files_for} from './remote_workspace_files';
export type workspace_file_modules = {fs: any; path_api: any};
export type workspace_move_callback = (root: string, source: string, target: string) => Promise<string>;
const entry_identity = (stat: any) => `${stat.dev}:${stat.ino}`;

function within(path_api: any, root: string, candidate: string, allow_root = true): boolean {
  const relative = path_api.relative(root, candidate);
  return (allow_root || Boolean(relative)) && !path_api.isAbsolute(relative) && relative !== ".." && !relative.startsWith(".." + path_api.sep);
}
function validate_name(path_api: any, name: string) {
  if (!name || name === "." || name === ".." || /[\/\\\x00-\x1f]/u.test(name)) throw new Error(workspace_text("file_operations_names_cannot_contain_path_separators_control_characters_or_p"));
  if (path_api.sep === "\\" && (/[<>:"|?*]/u.test(name) || /[ .]$/u.test(name) || /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu.test(name))) throw new Error(workspace_text("file_operations_the_name_contains_a_windows_reserved_name_or_a_forbidden_cha"));
}
/** Root directory is selected by the user; symbols links and non-normal entries below the root are rejected, and the boundary is not determined by string prefixes. */
async function check_entry(modules: workspace_file_modules, root: string, candidate: string, allow_root = true) {
  const {path_api} = modules, fs = modules.fs.promises;
  if (![root, candidate].every(value => path_api.isAbsolute(value))) throw new Error(workspace_text("file_operations_file_operations_require_an_absolute_path_within_the_workspac"));
  root = path_api.resolve(root); candidate = path_api.resolve(candidate);
  if (!within(path_api, root, candidate, allow_root)) throw new Error(workspace_text("file_operations_the_workspace_root_and_items_outside_the_workspace_cannot_be"));
  const root_real = await fs.realpath(root);
  let cursor = root;
  for (const part of path_api.relative(root, candidate).split(path_api.sep).filter(Boolean)) {
    cursor = path_api.join(cursor, part);
    if ((await fs.lstat(cursor)).isSymbolicLink()) throw new Error(workspace_text("file_operations_file_operations_cannot_traverse_symbolic_links_open_the_actu"));
  }
  if (!within(path_api, root_real, await fs.realpath(candidate))) throw new Error(workspace_text("file_operations_the_item_has_moved_outside_the_workspace_refresh_and_try_aga"));
  const stat = await fs.stat(candidate);
  if (!stat.isFile() && !stat.isDirectory()) throw new Error(workspace_text("file_operations_only_regular_files_and_folders_are_supported"));
  return {path: candidate, stat};
}
async function check_directory(modules: workspace_file_modules, root: string, candidate: string) {
  const entry = await check_entry(modules, root, candidate);
  if (!entry.stat.isDirectory()) throw new Error(workspace_text("file_operations_the_destination_must_be_a_folder"));
  return entry;
}
async function require_absent(fs: any, target: string) {
  try { await fs.lstat(target); } catch (error) { if ((error as {code?: string}).code === "ENOENT") return; throw error; }
  throw new Error(workspace_text("file_operations_a_file_or_folder_with_the_same_name_already_exists_nothing_w") + target);
}
/** Check the source file before copying to the system clipboard; do not save the editor draft. */
export async function validate_workspace_entries(modules:workspace_file_modules,root:string,paths:string[]):Promise<void>{
  for(const source of paths)await check_entry(modules,root,source,false);
}
/** Create using exclusive open or non-recursive mkdir; same-named projects never overwrite. */
export async function create_workspace_entry(modules: workspace_file_modules, root: string, parent: string, name: string, directory: boolean): Promise<string> {
  const {path_api} = modules, fs = modules.fs.promises;
  validate_name(path_api, name); await check_directory(modules, root, parent);
  const target = path_api.join(parent, name);
  if (directory) await fs.mkdir(target); else { const handle = await fs.open(target, "wx"); await handle.close(); }
  return target;
}

type created_entry = {path: string; identity: string; directory: boolean};
/** Rollback only deletes entries created in this session with unchanged identity; directories must be empty, and never recursively delete files added later. */
async function rollback_created(fs: any, created: created_entry[]) {
  const failures: string[] = [];
  for (const entry of [...created].reverse()) {
    try {
      const stat = await fs.lstat(entry.path);
      if (entry_identity(stat) !== entry.identity) throw new Error(workspace_text("file_operations_the_item_has_been_replaced"));
      if (entry.directory) await fs.rmdir(entry.path); else await fs.unlink(entry.path);
    } catch (error) { if ((error as {code?: string}).code !== "ENOENT") failures.push(entry.path); }
  }
  return failures;
}
/** Check conflicts in bulk first; if copy fails, rollback the batch-created items. Node path API has no cross-process directory handle lock, cannot guarantee atomic CAS during external and re-naming. */
export async function transfer_workspace_entries(modules: workspace_file_modules, root: string, sources: string[], target_directory: string, move?: workspace_move_callback, external = false): Promise<string[]> {
  const {path_api} = modules, fs = modules.fs.promises;
  if(external&&move)throw new Error(workspace_text("file_operations_only_copying_is_supported_across_workspaces_the_source_files"));
  const destination = await check_directory(modules, root, target_directory);
  if (sources.some(source => !path_api.isAbsolute(source))) throw new Error(workspace_text("file_operations_the_source_item_must_have_an_absolute_path"));
  if(sources.some(source=>/[\x00-\x1f]/u.test(source)||source.startsWith("\\\\?\\")||source.startsWith("\\\\.\\")))throw new Error(workspace_text("file_operations_device_paths_and_source_paths_containing_control_characters"));
  const normalized = [...new Set(sources.map(source => path_api.resolve(source)))];
  const selected = normalized.filter(source => !normalized.some(parent => parent !== source && within(path_api, parent, source, false)));
  const plans: {source: string; source_root: string; target: string; identity: string}[] = [], targets = new Set<string>();
  for (const source of selected) {
    // External sources verify their root-level paths layer by layer; write boundary remains as the user-selected workspace.
    const source_root=external?(remote_files_for(source)?.cache_root||path_api.parse(source).root):root;
    validate_name(path_api,path_api.basename(source));
    const entry = await check_entry(modules, source_root, source, false), target = path_api.join(destination.path, path_api.basename(source));
    if (entry.stat.isDirectory() && within(path_api, source, destination.path)) throw new Error(workspace_text("file_operations_a_folder_cannot_be_copied_or_moved_into_itself"));
    const key = path_api.sep === "\\" ? target.toLowerCase() : target;
    if (targets.has(key)) throw new Error(workspace_text("file_operations_the_selected_items_contain_duplicate_destination_names_no_op")); targets.add(key);
    await require_absent(fs, target); plans.push({source, source_root, target, identity: entry_identity(entry.stat)});
  }
  const created: created_entry[] = [], moved: {source: string; target: string}[] = [];
  const copy_entry = async (source: string, target: string, source_root: string): Promise<void> => {
    const entry = await check_entry(modules, source_root, source, false);
    await check_directory(modules, root, path_api.dirname(target));
    if (entry.stat.isDirectory()) {
      await fs.mkdir(target); created.push({path: target, identity: entry_identity(await fs.lstat(target)), directory: true});
      for (const name of await fs.readdir(source)) { validate_name(path_api,name); await copy_entry(path_api.join(source, name), path_api.join(target, name),source_root); }
    } else {
      // Exclusive target handle is held by this operation; read/write failure can still accurately rollback the half-finished product.
      const output = await fs.open(target, "wx"); created.push({path: target, identity: entry_identity(await output.stat()), directory: false});
      try {
        const input = await fs.open(source, "r");
        try {
          if (entry_identity(await input.stat()) !== entry_identity(entry.stat)) throw new Error(workspace_text("file_operations_the_source_file_has_changed_refresh_and_try_again"));
          const buffer = new Uint8Array(1024 * 1024);
          for (;;) {
            const {bytesRead} = await input.read(buffer, 0, buffer.length, null); if (!bytesRead) break;
            let offset = 0;
            while (offset < bytesRead) { const {bytesWritten} = await output.write(buffer, offset, bytesRead - offset, null); if (!bytesWritten) throw new Error(workspace_text("file_operations_write_has_not_made_progress")); offset += bytesWritten; }
          }
          const after = await input.stat();
          if (after.size !== entry.stat.size || after.mtimeMs !== entry.stat.mtimeMs) throw new Error(workspace_text("file_operations_the_source_file_has_changed_during_copy_please_retry"));
        } finally { await input.close(); }
      } finally { await output.close(); }
    }
  };
  try {
    for (const plan of plans) {
      const current = await check_entry(modules, plan.source_root, plan.source, false);
      if (entry_identity(current.stat) !== plan.identity || entry_identity((await check_directory(modules, root, destination.path)).stat) !== entry_identity(destination.stat)) throw new Error(workspace_text("file_operations_the_project_or_target_directory_has_changed_please_refresh_a"));
      await require_absent(fs, plan.target);
      if (move) { await move(root, plan.source, plan.target); moved.push(plan); }
      else await copy_entry(plan.source, plan.target,plan.source_root);
    }
    return plans.map(plan => plan.target);
  } catch (error) {
    const failures = await rollback_created(fs, created);
    if (move) for (const plan of [...moved].reverse()) {
      try { await move(root, plan.target, plan.source); } catch { failures.push(plan.target); }
    }
    if (failures.length) throw Object.assign(new Error(String(error) + workspace_text("file_operations_part_of_the_rollback_failed_please_check") + failures.join("、")), {remaining_paths: failures});
    throw error;
  }
}

/** Removal is not atomic across items; retain identities and completed paths for both modes. */
export type workspace_removal_plan = (remove:(path:string)=>Promise<void>)=>Promise<void>;
/** Capture identities before confirmation; execution cannot silently select replacement entries. */
export async function prepare_workspace_removal(modules:workspace_file_modules,root:string,sources:readonly string[]):Promise<workspace_removal_plan> {
  if (sources.some(source => !modules.path_api.isAbsolute(source))) throw new Error(workspace_text("file_operations_the_source_item_must_have_an_absolute_path"));
  const selected = [...new Set(sources.map(source => modules.path_api.resolve(source)))].filter((source, _index, all) => !all.some(parent => parent !== source && within(modules.path_api, parent, source, false)));
  const entries = await Promise.all(selected.map(source => check_entry(modules, root, source, false)));
  let used=false;
  return async remove=>{
    if(used)throw new Error(workspace_text('file_delete_request_used'));used=true;
    const completed:string[]=[];
    const verify=async(entry:typeof entries[number])=>{const current=await check_entry(modules,root,entry.path,false);if(entry_identity(current.stat)!==entry_identity(entry.stat))throw new Error(workspace_text('file_operations_the_project_has_changed_please_refresh_and_retry'));};
    try {
      for(const entry of entries)await verify(entry);
      for(const entry of entries){await verify(entry);await remove(entry.path);completed.push(entry.path);}
    }catch(error){throw Object.assign(new Error(String(error)+(completed.length?'\n'+workspace_text('file_task_completed_paths',{value_0:completed.join('\n')}):'')),{name:error instanceof Error?error.name:'Error',cause:error,removed_paths:completed});}
  };
}
export async function trash_workspace_entries(modules:workspace_file_modules,root:string,sources:string[],trash:(path:string)=>Promise<void>):Promise<void>{
  await (await prepare_workspace_removal(modules,root,sources))(trash);
}
/** Called only by a confirmed, identity-checked removal plan; never follows nested link targets. */
export async function permanently_remove_path(modules:workspace_file_modules,target:string):Promise<void>{
  try{await modules.fs.promises.rm(target,{recursive:true,force:false,maxRetries:3,retryDelay:100});}
  catch(error){throw Object.assign(new Error(workspace_text('file_delete_partial',{value_0:target,value_1:error instanceof Error?error.message:String(error)})),{cause:error});}
  try{await modules.fs.promises.lstat(target);}catch(error){if((error as {code?:string}).code==='ENOENT')return;throw error;}
  throw new Error(workspace_text('file_delete_remaining',{value_0:target}));
}
