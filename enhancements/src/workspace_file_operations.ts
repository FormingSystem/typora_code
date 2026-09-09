export type workspace_file_modules = {fs: any; path_api: any};
export type workspace_move_callback = (root: string, source: string, target: string) => Promise<string>;
const entry_identity = (stat: any) => `${stat.dev}:${stat.ino}`;

function within(path_api: any, root: string, candidate: string, allow_root = true): boolean {
  const relative = path_api.relative(root, candidate);
  return (allow_root || Boolean(relative)) && !path_api.isAbsolute(relative) && relative !== ".." && !relative.startsWith(".." + path_api.sep);
}
function validate_name(path_api: any, name: string) {
  if (!name || name === "." || name === ".." || /[\/\\\x00-\x1f]/u.test(name)) throw new Error("名称不能包含路径分隔符、控制字符或上级目录。");
  if (path_api.sep === "\\" && (/[<>:"|?*]/u.test(name) || /[ .]$/u.test(name) || /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu.test(name))) throw new Error("名称包含 Windows 保留名称或不允许的字符。");
}
/** 根目录由用户选定；根以下拒绝符号链接和非普通条目，不通过字符串前缀判断边界。 */
async function check_entry(modules: workspace_file_modules, root: string, candidate: string, allow_root = true) {
  const {path_api} = modules, fs = modules.fs.promises;
  if (![root, candidate].every(value => path_api.isAbsolute(value))) throw new Error("文件操作需要工作区内的绝对路径。");
  root = path_api.resolve(root); candidate = path_api.resolve(candidate);
  if (!within(path_api, root, candidate, allow_root)) throw new Error("不能操作工作区以外的项目或工作区根目录。");
  const root_real = await fs.realpath(root);
  let cursor = root;
  for (const part of path_api.relative(root, candidate).split(path_api.sep).filter(Boolean)) {
    cursor = path_api.join(cursor, part);
    if ((await fs.lstat(cursor)).isSymbolicLink()) throw new Error("文件操作不能经过符号链接，请打开真实目录。");
  }
  if (!within(path_api, root_real, await fs.realpath(candidate))) throw new Error("项目已移出工作区，请刷新后重试。");
  const stat = await fs.stat(candidate);
  if (!stat.isFile() && !stat.isDirectory()) throw new Error("只能操作普通文件或文件夹。");
  return {path: candidate, stat};
}
async function check_directory(modules: workspace_file_modules, root: string, candidate: string) {
  const entry = await check_entry(modules, root, candidate);
  if (!entry.stat.isDirectory()) throw new Error("目标必须是文件夹。");
  return entry;
}
async function require_absent(fs: any, target: string) {
  try { await fs.lstat(target); } catch (error) { if ((error as {code?: string}).code === "ENOENT") return; throw error; }
  throw new Error("同名文件或文件夹已存在，未覆盖任何内容：" + target);
}
/** 创建使用独占打开或非递归 mkdir；同名项目永不覆盖。 */
export async function create_workspace_entry(modules: workspace_file_modules, root: string, parent: string, name: string, directory: boolean): Promise<string> {
  const {path_api} = modules, fs = modules.fs.promises;
  validate_name(path_api, name); await check_directory(modules, root, parent);
  const target = path_api.join(parent, name);
  if (directory) await fs.mkdir(target); else { const handle = await fs.open(target, "wx"); await handle.close(); }
  return target;
}

type created_entry = {path: string; identity: string; directory: boolean};
/** 回退只删除本次创建且身份未变化的条目，目录必须为空，绝不递归删除后来加入的文件。 */
async function rollback_created(fs: any, created: created_entry[]) {
  const failures: string[] = [];
  for (const entry of [...created].reverse()) {
    try {
      const stat = await fs.lstat(entry.path);
      if (entry_identity(stat) !== entry.identity) throw new Error("条目已被替换");
      if (entry.directory) await fs.rmdir(entry.path); else await fs.unlink(entry.path);
    } catch (error) { if ((error as {code?: string}).code !== "ENOENT") failures.push(entry.path); }
  }
  return failures;
}
/** 整批先检查冲突；复制失败回退本批创建项。Node 路径 API 无跨进程目录句柄锁，不能承诺外部并发改名时的原子 CAS。 */
export async function transfer_workspace_entries(modules: workspace_file_modules, root: string, sources: string[], target_directory: string, move?: workspace_move_callback): Promise<string[]> {
  const {path_api} = modules, fs = modules.fs.promises;
  const destination = await check_directory(modules, root, target_directory);
  if (sources.some(source => !path_api.isAbsolute(source))) throw new Error("源项目必须是绝对路径。");
  const normalized = [...new Set(sources.map(source => path_api.resolve(source)))];
  const selected = normalized.filter(source => !normalized.some(parent => parent !== source && within(path_api, parent, source, false)));
  const plans: {source: string; target: string; identity: string}[] = [], targets = new Set<string>();
  for (const source of selected) {
    const entry = await check_entry(modules, root, source, false), target = path_api.join(destination.path, path_api.basename(source));
    if (entry.stat.isDirectory() && within(path_api, source, destination.path)) throw new Error("不能把文件夹复制或移入自身。");
    const key = path_api.sep === "\\" ? target.toLowerCase() : target;
    if (targets.has(key)) throw new Error("所选项目包含同名目标，未执行操作。"); targets.add(key);
    await require_absent(fs, target); plans.push({source, target, identity: entry_identity(entry.stat)});
  }
  const created: created_entry[] = [], moved: {source: string; target: string}[] = [];
  const copy_entry = async (source: string, target: string): Promise<void> => {
    const entry = await check_entry(modules, root, source, false);
    await check_directory(modules, root, path_api.dirname(target));
    if (entry.stat.isDirectory()) {
      await fs.mkdir(target); created.push({path: target, identity: entry_identity(await fs.lstat(target)), directory: true});
      for (const name of await fs.readdir(source)) await copy_entry(path_api.join(source, name), path_api.join(target, name));
    } else {
      // 独占目标句柄由本次操作持有，读写失败也可准确回退半成品。
      const output = await fs.open(target, "wx"); created.push({path: target, identity: entry_identity(await output.stat()), directory: false});
      try {
        const input = await fs.open(source, "r");
        try {
          if (entry_identity(await input.stat()) !== entry_identity(entry.stat)) throw new Error("源文件已变化，请刷新后重试。");
          const buffer = new Uint8Array(1024 * 1024);
          for (;;) {
            const {bytesRead} = await input.read(buffer, 0, buffer.length, null); if (!bytesRead) break;
            let offset = 0;
            while (offset < bytesRead) { const {bytesWritten} = await output.write(buffer, offset, bytesRead - offset, null); if (!bytesWritten) throw new Error("写入未取得进展。"); offset += bytesWritten; }
          }
          const after = await input.stat();
          if (after.size !== entry.stat.size || after.mtimeMs !== entry.stat.mtimeMs) throw new Error("复制期间源文件发生变化，请重试。");
        } finally { await input.close(); }
      } finally { await output.close(); }
    }
  };
  try {
    for (const plan of plans) {
      const current = await check_entry(modules, root, plan.source, false);
      if (entry_identity(current.stat) !== plan.identity || entry_identity((await check_directory(modules, root, destination.path)).stat) !== entry_identity(destination.stat)) throw new Error("项目或目标目录已变化，请刷新后重试。");
      await require_absent(fs, plan.target);
      if (move) { await move(root, plan.source, plan.target); moved.push(plan); }
      else await copy_entry(plan.source, plan.target);
    }
    return plans.map(plan => plan.target);
  } catch (error) {
    const failures = await rollback_created(fs, created);
    if (move) for (const plan of [...moved].reverse()) {
      try { await move(root, plan.target, plan.source); } catch { failures.push(plan.target); }
    }
    if (failures.length) throw Object.assign(new Error(String(error) + "；部分回退失败，请核对：" + failures.join("、")), {remaining_paths: failures});
    throw error;
  }
}

/** 回收站由宿主系统提供；它不支持多条目原子回滚，失败时明确报告已经送入回收站的条目。 */
export async function trash_workspace_entries(modules: workspace_file_modules, root: string, sources: string[], trash: (path: string) => Promise<void>): Promise<void> {
  if (sources.some(source => !modules.path_api.isAbsolute(source))) throw new Error("源项目必须是绝对路径。");
  const selected = [...new Set(sources.map(source => modules.path_api.resolve(source)))].filter((source, _index, all) => !all.some(parent => parent !== source && within(modules.path_api, parent, source, false)));
  const entries = await Promise.all(selected.map(source => check_entry(modules, root, source, false))), completed: string[] = [];
  try {
    for (const entry of entries) {
      const current = await check_entry(modules, root, entry.path, false);
      if (entry_identity(current.stat) !== entry_identity(entry.stat)) throw new Error("项目已变化，请刷新后重试。");
      await trash(entry.path); completed.push(entry.path);
    }
  } catch (error) { throw Object.assign(new Error(String(error) + (completed.length ? "；已移入回收站：" + completed.join("、") : "")), {trashed_paths: completed}); }
}
