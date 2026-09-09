type rename_modules = {fs: any; path_api: any};
export type workspace_rename_plan = {old_path: string; new_path: string; directory: boolean; apply(): Promise<void>};
const identity = (stat: any) => `${stat.dev}:${stat.ino}`;
const same_entry = (left: any, right: any) => identity(left) === identity(right) && left.mode === right.mode && left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;

/** 路径按组件比较，避免 a 目录误匹配到 abc。返回的路径保留新名称的大小写。 */
export function renamed_workspace_path(path_api: any, candidate: string, old_path: string, new_path: string, directory: boolean): string | undefined {
  if (!candidate || !path_api.isAbsolute(candidate)) return;
  const relative = path_api.relative(old_path, candidate);
  if (!relative) return new_path;
  if (!directory || path_api.isAbsolute(relative) || relative === ".." || relative.startsWith(".." + path_api.sep)) return;
  return path_api.join(new_path, relative);
}

/** 只改同目录名称；检查与 Node rename 之间没有跨进程锁，不能宣称原子 compare-and-swap。 */
export async function prepare_workspace_rename(modules: rename_modules, root: string, source: string, name: string): Promise<workspace_rename_plan> {
  const {path_api} = modules, fs = modules.fs.promises;
  if (!path_api.isAbsolute(root) || !path_api.isAbsolute(source)) throw new Error("重命名需要工作区内的绝对路径。");
  if (!name || name === "." || name === ".." || /[\/\\\x00-\x1f]/u.test(name)) throw new Error("请输入名称，不能包含路径分隔符、控制字符或上级目录。");
  if (path_api.sep === "\\" && (/[<>:"|?*]/u.test(name) || /[ .]$/u.test(name) || /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu.test(name))) throw new Error("名称含有 Windows 不允许的字符、保留名称或末尾空格/句点。");
  return prepare_workspace_move(modules,root,source,path_api.join(path_api.dirname(source),name));
}

/** 跨目录移动沿用重命名事务；目标必须仍在同一工作区且不经过符号链接。 */
export async function prepare_workspace_move(modules: rename_modules, root: string, source: string, target: string): Promise<workspace_rename_plan> {
  const {path_api}=modules,fs=modules.fs.promises;
  if(![root,source,target].every(value=>path_api.isAbsolute(value)))throw new Error("移动需要工作区内的绝对路径。");
  root=path_api.resolve(root);source=path_api.resolve(source);target=path_api.resolve(target);
  if(!path_api.relative(root,source))throw new Error("不能移动或重命名工作区根目录。");
  const name=path_api.basename(target);
  if(/[\x00-\x1f]/u.test(target)||!name||name==="."||name===".."||path_api.sep==="\\"&&(/[<>:"|?*]/u.test(name)||/[ .]$/u.test(name)||/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(name)))throw new Error("目标名称不合法。");
  const target_relative=path_api.relative(root,target);
  if(!target_relative||path_api.isAbsolute(target_relative)||target_relative===".."||target_relative.startsWith(".."+path_api.sep))throw new Error("目标必须位于当前工作区内。");
  const nested=path_api.relative(source,target);
  if(nested&&!path_api.isAbsolute(nested)&&nested!==".."&&!nested.startsWith(".."+path_api.sep))throw new Error("不能把文件夹移入自身。");
  const relative = path_api.relative(root, source);
  if (!relative || path_api.isAbsolute(relative) || relative === ".." || relative.startsWith(".." + path_api.sep)) throw new Error("只能重命名当前工作区内的文件或文件夹，不能重命名工作区根目录。");
  const root_real = await fs.realpath(root), parent = path_api.dirname(source), parent_real = await fs.realpath(parent);
  const parent_relative = path_api.relative(root_real, parent_real);
  if (path_api.isAbsolute(parent_relative) || parent_relative === ".." || parent_relative.startsWith(".." + path_api.sep)) throw new Error("该项目经过指向工作区外的符号链接，不能在这里重命名。");
  // 不跟随重命名路径中的链接。根目录本身由用户选定，可解析到其真实目录。
  let walk = root;
  for (const component of relative.split(path_api.sep)) {
    walk = path_api.join(walk, component);
    if ((await fs.lstat(walk)).isSymbolicLink()) throw new Error("暂不重命名符号链接或链接目录中的项目，请在其真实目录中操作。");
  }
  const target_parent=path_api.dirname(target),target_parent_real=await fs.realpath(target_parent);
  let target_walk=root;
  for(const component of path_api.relative(root,target_parent).split(path_api.sep).filter(Boolean)){
    target_walk=path_api.join(target_walk,component);if((await fs.lstat(target_walk)).isSymbolicLink())throw new Error("目标目录不能经过符号链接。");
  }
  const target_parent_identity=identity(await fs.stat(target_parent_real));
  const root_identity = identity(await fs.stat(root_real)), parent_identity = identity(await fs.stat(parent_real)), snapshot = await fs.lstat(source);
  if (!snapshot.isFile() && !snapshot.isDirectory()) throw new Error("只能重命名普通文件或文件夹。");
  const case_only = path_api.sep === "\\" && source.toLowerCase() === target.toLowerCase() && source !== target;
  const check_target = async () => {
    try {
      const existing = await fs.lstat(target);
      if (source === target || case_only && identity(existing) === identity(snapshot)) return;
      throw new Error("同名文件或文件夹已存在，未覆盖任何内容。");
    } catch (error) { if ((error as {code?: string}).code !== "ENOENT") throw error; }
  };
  await check_target();
  let used = false;
  return {old_path: source, new_path: target, directory: snapshot.isDirectory(), async apply() {
    if (used) throw new Error("此重命名操作已执行，请刷新后重试。"); used = true;
    if (source === target) return;
    if (await fs.realpath(root) !== root_real || identity(await fs.stat(root_real)) !== root_identity || await fs.realpath(parent) !== parent_real || identity(await fs.stat(parent_real)) !== parent_identity || !same_entry(snapshot, await fs.lstat(source))) throw new Error("文件或所在目录已经变化，请刷新后再重命名。");
    if(await fs.realpath(target_parent)!==target_parent_real||identity(await fs.stat(target_parent_real))!==target_parent_identity)throw new Error("目标目录已变化，请刷新后再移动。");
    await check_target();
    // Windows 的 MoveFileEx/Node rename 支持仅改变名称大小写，无需另建中转路径。
    await fs.rename(source, target);
    if (identity(await fs.lstat(target)) !== identity(snapshot)) throw new Error("重命名后项目又被其他进程替换，请刷新目录核对当前状态。");
  }};
}
