import {workspace_text} from "./workspace_i18n";
import {remote_files_for} from './remote_workspace_files';
type trash_runtime = {JSBridge?: {invoke(command: string, ...args: unknown[]): Promise<unknown>}; reqnode(name: string): any};

/** The recycling station of Typora is executed in the main process; the rejection of recycling cannot be degenerated into permanent deletion. */
export async function trash_native_path(runtime: trash_runtime, target: string): Promise<void> {
  const remote=remote_files_for(target);if(remote){await remote.trash(target);return;}
  const fs = runtime.reqnode("fs").promises;
  if (runtime.JSBridge?.invoke) {
    if (await runtime.JSBridge.invoke("shell.trashItem", target) !== true) {
      throw new Error(workspace_text("native_trash_failed_to_move_to_the_recycle_bin") + target + workspace_text("native_trash_please_check_file_locking_directory_permissions_and_recycle"));
    }
  } else {
    const shell = runtime.reqnode("electron")?.shell;
    if (typeof shell?.trashItem !== "function") throw new Error(workspace_text("native_trash_the_current_host_does_not_provide_a_recycle_bin_interface_th"));
    await shell.trashItem(target);
  }
  try { await fs.lstat(target); }
  catch (error) { if ((error as {code?: string}).code === "ENOENT") return; throw error; }
  throw new Error(workspace_text("native_trash_the_recycle_bin_operation_returned_but_the_project_still_exi") + target + workspace_text("native_trash_please_refresh_and_verify_permanent_deletion_was_not_execute"));
}
