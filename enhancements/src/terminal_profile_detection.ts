import type { terminal_profile } from "./terminal_runtime";

type detection_dependencies = { process_api: any; path_api: any; fs: any; child_process: any };
type profile_candidate = terminal_profile & { priority: number; canonical_path?: string };

// 仅查询安装信息：不加载用户 Profile，不运行候选 Shell，也不递归遍历磁盘。
const WINDOWS_INSTALLATION_QUERY = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$detected_installations = @()
foreach ($registry_hive in @('HKLM:', 'HKCU:')) {
  foreach ($registry_prefix in @('SOFTWARE', 'SOFTWARE\WOW6432Node')) {
    $git_installation = Get-ItemProperty -LiteralPath "$registry_hive\$registry_prefix\GitForWindows"
    if ($git_installation.InstallPath) { $detected_installations += @{kind='git';root=$git_installation.InstallPath} }
    $cygwin_installation = Get-ItemProperty -LiteralPath "$registry_hive\$registry_prefix\Cygwin\setup"
    if ($cygwin_installation.rootdir) { $detected_installations += @{kind='cygwin';root=$cygwin_installation.rootdir} }
    Get-ChildItem -LiteralPath "$registry_hive\$registry_prefix\Microsoft\PowerShellCore\InstalledVersions" | ForEach-Object {
      $powershell_installation = Get-ItemProperty -LiteralPath $_.PSPath
      if ($powershell_installation.InstallLocation) { $detected_installations += @{kind='pwsh';root=$powershell_installation.InstallLocation} }
    }
    Get-ChildItem -LiteralPath "$registry_hive\$registry_prefix\Microsoft\Windows\CurrentVersion\Uninstall" | ForEach-Object {
      $installed_program = Get-ItemProperty -LiteralPath $_.PSPath
      if ($installed_program.InstallLocation) {
        if ($installed_program.DisplayName -match '^MSYS2') { $detected_installations += @{kind='msys';root=$installed_program.InstallLocation} }
        elseif ($installed_program.DisplayName -match '^Cygwin') { $detected_installations += @{kind='cygwin';root=$installed_program.InstallLocation} }
        elseif ($installed_program.DisplayName -match '^PowerShell') { $detected_installations += @{kind='pwsh';root=$installed_program.InstallLocation} }
        elseif ($installed_program.DisplayName -match '^Git($| version)') { $detected_installations += @{kind='git';root=$installed_program.InstallLocation} }
      }
    }
  }
}
$fixed_drives = @([System.IO.DriveInfo]::GetDrives() | Where-Object {$_.DriveType -eq 'Fixed'} | ForEach-Object {$_.Name})
$wsl_distributions = @(Get-ChildItem -LiteralPath 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Lxss' | ForEach-Object {(Get-ItemProperty -LiteralPath $_.PSPath).DistributionName} | Where-Object {$_})
@{installations=$detected_installations;machine_path=[Environment]::GetEnvironmentVariable('Path','Machine');user_path=[Environment]::GetEnvironmentVariable('Path','User');drives=$fixed_drives;wsl_distributions=$wsl_distributions} | ConvertTo-Json -Depth 4 -Compress
`;

function encode_query(script: string): string {
  let bytes = "";
  for (let index = 0; index < script.length; index++) bytes += String.fromCharCode(script.charCodeAt(index) & 255, script.charCodeAt(index) >> 8);
  return btoa(bytes);
}

function stable_suffix(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(36);
}

export function create_terminal_profile_service({ process_api, path_api, fs, child_process }: detection_dependencies) {
  const windows = process_api.platform === "win32";
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(process_api.env || {})) if (typeof value === "string") env[name.toLowerCase()] = value;
  const cancel_queries = new Set<() => void>();
  let disposed = false, initialized = false;
  let scan_deadline = 0;
  let detection_warnings: string[] = [];
  const scan_stats = new Map<string, any>();
  let snapshot: terminal_profile[] = [], pending: Promise<terminal_profile[]> | null = null;
  const clone = () => snapshot.map(profile => ({ ...profile, args: [...profile.args], ...(profile.env ? { env: { ...profile.env } } : {}) }));
  const normalize = (value: string) => windows ? path_api.normalize(value).toLowerCase() : path_api.normalize(value);
  const expand = (value: string) => value.replace(/%([^%]+)%/gu, (match, name) => env[name.toLowerCase()] || match);
  const remaining_time = () => Math.max(0, scan_deadline - Date.now());
  function warn(message: string) { if (!disposed && !detection_warnings.includes(message)) detection_warnings.push(message); }

  // 网络 PATH 或失效挂载不能无限阻塞菜单；所有等待归探测服务生命周期管理。
  function bounded<T>(operation: Promise<T>, fallback: T, timeout_ms = 750): Promise<T> {
    if (disposed || remaining_time() <= 0) { Promise.resolve(operation).catch(() => {}); warn("部分安装位置查询超时，可重新检测。"); return Promise.resolve(fallback); }
    return new Promise(resolve => {
      let settled = false;
      const finish = (value: T) => { if (settled) return; settled = true; clearTimeout(timer); cancel_queries.delete(cancel); resolve(value); };
      const cancel = () => finish(fallback);
      const timer = setTimeout(cancel, Math.min(timeout_ms, remaining_time()));
      cancel_queries.add(cancel);
      Promise.resolve(operation).then(value => finish(disposed ? fallback : value), cancel);
      if (disposed) cancel();
    });
  }

  async function stat(file_path: string): Promise<any> {
    if (disposed || !file_path || file_path.includes("\0")) return null;
    const key = normalize(file_path);
    if (scan_stats.has(key)) return scan_stats.get(key);
    if (remaining_time() <= 0) { warn("部分安装位置查询超时，可重新检测。"); return null; }
    try { const result = await bounded(fs.promises.stat(file_path), null); if (result) scan_stats.set(key, result); return result; } catch { return null; }
  }
  async function exists(file_path: string) { return !!(await stat(file_path))?.isFile(); }
  async function directory(file_path: string) { return !!(await stat(file_path))?.isDirectory(); }
  async function list(folder: string): Promise<string[]> {
    if (disposed || remaining_time() <= 0 || !folder) return [];
    try { const entries = await bounded<string[]>(fs.promises.readdir(folder), []); return entries.filter(name => typeof name === "string").slice(0, 256).sort(); } catch { return []; }
  }
  function query(executable: string, args: string[], encoding = "utf8", query_env = process_api.env, failure_message = "部分安装信息查询失败，可重新检测。"): Promise<string> {
    if (disposed || remaining_time() <= 0 || !child_process?.execFile) { warn(failure_message); return Promise.resolve(""); }
    return new Promise(resolve => {
      let child: any, settled = false;
      const finish = (text = "") => { if (settled) return; settled = true; clearTimeout(timer); cancel_queries.delete(cancel); resolve(disposed ? "" : text); };
      const cancel = () => { try { child?.kill(); } catch {} warn(failure_message); finish(); };
      const timer = setTimeout(cancel, Math.min(2500, remaining_time()));
      cancel_queries.add(cancel);
      try {
        child = child_process.execFile(executable, args, { encoding, windowsHide: true, timeout: Math.min(2000, remaining_time()), maxBuffer: 512 * 1024, env: query_env }, (error: any, output: any) => { if (error) warn(failure_message); finish(error ? "" : String(output || "")); });
        if (disposed) cancel();
      } catch { cancel(); }
    });
  }
  async function map_bounded<T>(items: T[], action: (item: T) => Promise<void>) {
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(16, items.length) }, async () => { while (!disposed && cursor < items.length) await action(items[cursor++]); }));
  }

  async function scan(): Promise<terminal_profile[]> {
    const candidates: profile_candidate[] = [];
    const add = (id: string, title: string, executable: string, args: string[], priority: number, profile_env?: Record<string, string>, wsl?: boolean) => {
      if (!executable || !path_api.isAbsolute(executable) || candidates.length >= 2048) return;
      candidates.push({ id, title, executable: path_api.normalize(executable), args, priority, ...(profile_env ? { env: profile_env } : {}), ...(wsl ? { wsl } : {}) });
    };
    const path_entries = new Set<string>();
    function add_paths(value: string) {
      for (const entry of String(value || "").split(windows ? ";" : ":")) {
        const normalized = expand(entry.trim().replace(/^"|"$/gu, ""));
        if (path_entries.size < 256 && path_api.isAbsolute(normalized)) path_entries.add(normalize(normalized));
      }
    }
    add_paths(env.path);
    if (windows) {
      const system_root = env.systemroot || env.windir;
      const system_folder = system_root ? path_api.join(system_root, env.processor_architew6432 ? "Sysnative" : "System32") : "";
      const powershell = system_folder ? path_api.join(system_folder, "WindowsPowerShell", "v1.0", "powershell.exe") : "";
      if (powershell) add("powershell", "Windows PowerShell", powershell, ["-NoLogo"], 80);
      if (system_folder) { const command_prompt = path_api.join(system_folder, "cmd.exe"); if (await exists(command_prompt)) add("cmd", "Command Prompt", command_prompt, [], 90); }
      if (env.comspec) add("cmd", "Command Prompt", env.comspec, [], 89);
      let installations: any = {};
      if (await exists(powershell)) {
        const output = await query(powershell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encode_query(WINDOWS_INSTALLATION_QUERY)]);
        try { installations = JSON.parse(output.replace(/^\uFEFF/u, "")); } catch {}
      }
      add_paths(installations.machine_path); add_paths(installations.user_path);
      const git_roots = new Set<string>(), msys_roots = new Set<string>(), cygwin_roots = new Set<string>(), powershell_roots = new Set<string>();
      const add_root = (roots: Set<string>, value: unknown) => { if (typeof value === "string" && path_api.isAbsolute(value)) roots.add(normalize(value)); };
      for (const installation of Array.isArray(installations.installations) ? installations.installations.slice(0, 256) : []) {
        const roots = ({ git: git_roots, msys: msys_roots, cygwin: cygwin_roots, pwsh: powershell_roots } as any)[installation.kind];
        if (roots) add_root(roots, installation.root);
      }
      for (const prefix of [env.programw6432, env.programfiles, env["programfiles(x86)"], env.localappdata && path_api.join(env.localappdata, "Programs")].filter(Boolean)) {
        add_root(git_roots, path_api.join(prefix, "Git"));
        for (const version of await list(path_api.join(prefix, "PowerShell"))) if (/^\d+(?:\.\d+)*(?:-preview)?$/iu.test(version)) add_root(powershell_roots, path_api.join(prefix, "PowerShell", version));
      }
      if (env.userprofile) {
        add_root(powershell_roots, path_api.join(env.userprofile, ".dotnet", "tools"));
        for (const app of ["pwsh", "pwsh-preview"]) add_root(powershell_roots, path_api.join(env.userprofile, "scoop", "apps", app, "current"));
        for (const app of ["git", "git-with-openssh"]) add_root(git_roots, path_api.join(env.userprofile, "scoop", "apps", app, "current"));
        add_root(msys_roots, path_api.join(env.userprofile, "scoop", "apps", "msys2", "current"));
      }
      if (env.localappdata) {
        const aliases = path_api.join(env.localappdata, "Microsoft", "WindowsApps");
        for (const alias of await list(aliases)) if (/^Microsoft\.PowerShell(?:Preview)?_/u.test(alias)) add_root(powershell_roots, path_api.join(aliases, alias));
      }
      const drives = new Set<string>([env.homedrive, system_root && path_api.parse(system_root).root, ...(Array.isArray(installations.drives) ? installations.drives.slice(0, 26) : [])].filter(Boolean));
      for (const drive of drives) if (/^[a-z]:\\?$/iu.test(drive)) {
        for (const folder of ["msys64", "msys32", "msys2"]) add_root(msys_roots, path_api.join(drive + "\\", folder));
        for (const folder of ["cygwin64", "cygwin"]) add_root(cygwin_roots, path_api.join(drive + "\\", folder));
      }
      for (const key of ["msys2_root", "msys_root"]) add_root(msys_roots, env[key]);
      add_root(cygwin_roots, env.cygwin_root);
      // PATH 的 git.exe 可以位于 cmd、bin 或 mingw64/bin；逐层限定候选而非扫描父目录。
      const path_bash: string[] = [];
      await map_bounded([...path_entries], async prefix => {
        if (await exists(path_api.join(prefix, "git.exe"))) {
          add_root(git_roots, path_api.dirname(prefix)); add_root(git_roots, path_api.dirname(path_api.dirname(prefix)));
        }
        if (await exists(path_api.join(prefix, "bash.exe"))) {
          path_bash.push(path_api.join(prefix, "bash.exe"));
          const parent = path_api.dirname(prefix), grandparent = path_api.dirname(parent);
          if (await exists(path_api.join(grandparent, "msys2_shell.cmd"))) add_root(msys_roots, grandparent);
          if (await exists(path_api.join(prefix, "cygwin1.dll"))) add_root(cygwin_roots, parent);
        }
        for (const [name, title, args, priority] of [["pwsh", "PowerShell", ["-NoLogo"], 20], ["nu", "Nushell", [], 60], ["zsh", "Zsh", ["-l"], 65], ["fish", "Fish", ["-l"], 66]] as const) {
          add(name, title, path_api.join(prefix, name + ".exe"), [...args], priority);
        }
      });
      let powershell_rank = 0;
      for (const root of [...powershell_roots].sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))) {
        const preview = /preview/iu.test(root);
        add("pwsh", "PowerShell" + (preview ? " Preview" : "") + " (" + path_api.basename(root) + ")", path_api.join(root, "pwsh.exe"), ["-NoLogo"], (preview ? 30 : 10) + powershell_rank++ / 1000);
      }
      const assigned_bash = new Set<string>();
      async function bash_for_root(root: string, segments: string[][]): Promise<string> {
        let chosen = "";
        for (const segments_item of segments) {
          const file_path = path_api.join(root, ...segments_item);
          if (await exists(file_path)) { assigned_bash.add(normalize(file_path)); if (!chosen) chosen = file_path; }
        }
        return chosen;
      }
      for (const root of [...git_roots].sort()) {
        if (msys_roots.has(root) || cygwin_roots.has(root)) continue;
        const executable = await bash_for_root(root, [["bin", "bash.exe"], ["usr", "bin", "bash.exe"]]);
        if (executable) add("git_bash_" + stable_suffix(root), "Git Bash", executable, ["--login", "-i"], 40, { CHERE_INVOKING: "1" });
      }
      for (const root of [...msys_roots].sort()) {
        const executable = await bash_for_root(root, [["usr", "bin", "bash.exe"]]);
        if (!executable) continue;
        add("msys2_msys_" + stable_suffix(root), "MSYS2 MSYS", executable, ["--login", "-i"], 50, { MSYSTEM: "MSYS", CHERE_INVOKING: "1" });
        for (const variant of ["ucrt64", "mingw64", "mingw32", "clang64", "clangarm64"]) if (await directory(path_api.join(root, variant, "bin"))) {
          add("msys2_" + variant + "_" + stable_suffix(root), "MSYS2 " + variant.toUpperCase(), executable, ["--login", "-i"], 51, { MSYSTEM: variant.toUpperCase(), CHERE_INVOKING: "1" });
        }
      }
      for (const root of [...cygwin_roots].sort()) {
        const executable = await bash_for_root(root, [["bin", "bash.exe"]]);
        if (executable) add("cygwin_" + stable_suffix(root), "Cygwin", executable, ["--login", "-i"], 55, { CHERE_INVOKING: "1" });
      }
      for (const executable of path_bash.sort()) if (!assigned_bash.has(normalize(executable))) add("bash", "Bash", executable, ["--login", "-i"], 70);
      if (env.cmder_root && system_folder && await exists(path_api.join(env.cmder_root, "vendor", "bin", "vscode_init.cmd"))) {
        add("cmder", "Cmder", path_api.join(system_folder, "cmd.exe"), ["/K", path_api.join(env.cmder_root, "vendor", "bin", "vscode_init.cmd")], 75);
      }
      const wsl = system_folder ? path_api.join(system_folder, "wsl.exe") : "";
      if (!(Array.isArray(installations.wsl_distributions) && installations.wsl_distributions.length === 0) && await exists(wsl)) {
        const wsl_failure = "WSL 发行版查询失败；本次未取得新的 WSL 配置。";
        const distro_output = await query(wsl, ["--list", "--quiet"], "utf16le", { ...process_api.env, WSL_UTF8: "0" }, wsl_failure);
        const distros = new Set(distro_output.replace(/^\uFEFF/u, "").replace(/\0/gu, "").split(/\r?\n/u).map(name => name.trim()).filter(name => name && !/^docker-desktop/iu.test(name)));
        for (const name of [...distros].slice(0, 64)) add("wsl_" + stable_suffix(name.toLowerCase()), name + " (WSL)", wsl, ["-d", name], 100, undefined, true);
        // 枚举超时不等于发行版已删除：保留已知配置，并由状态提示说明此次未刷新。
        if (detection_warnings.includes(wsl_failure)) for (const profile of snapshot.filter(profile => profile.wsl)) candidates.push({ ...profile, priority: 100 });
      }
    } else {
      if (env.shell) add("default", path_api.basename(env.shell), env.shell, ["-l"], 0);
      let shell_file = "";
      try { shell_file = await bounded<string>(fs.promises.readFile("/etc/shells", "utf8"), ""); } catch {}
      for (const value of String(shell_file).split(/\r?\n/u)) {
        const executable = value.replace(/#.*/u, "").trim();
        if (path_api.isAbsolute(executable)) add(path_api.basename(executable), path_api.basename(executable), executable, ["-l"], 10);
      }
      for (const prefix of path_entries) for (const name of ["bash", "zsh", "fish", "pwsh", "nu", "sh"]) add(name, name, path_api.join(prefix, name), name === "nu" ? [] : ["-l"], 20);
      add("sh", "sh", "/bin/sh", ["-l"], 30);
    }
    const valid: profile_candidate[] = [];
    await map_bounded(candidates, async candidate => {
      if (!await exists(candidate.executable)) return;
      if (fs.promises.realpath) { try { candidate.canonical_path = await bounded<string>(fs.promises.realpath(candidate.executable), candidate.executable); } catch {} }
      if (!windows) { try { await bounded(fs.promises.access(candidate.executable, fs.constants?.X_OK ?? 1).then(() => true), false).then(result => { if (result) valid.push(candidate); }); } catch {} }
      else valid.push(candidate);
    });
    valid.sort((left, right) => left.priority - right.priority || left.executable.localeCompare(right.executable, undefined, { numeric: true }) || left.id.localeCompare(right.id));
    const keys = new Set<string>(), ids = new Set<string>(), result: terminal_profile[] = [];
    for (const candidate of valid) {
      const key = JSON.stringify([normalize(candidate.canonical_path || candidate.executable), candidate.args, Object.entries(candidate.env || {}).sort()]);
      if (keys.has(key)) continue;
      keys.add(key);
      const { priority, canonical_path, ...profile } = candidate;
      if (ids.has(profile.id)) profile.id += "_" + stable_suffix(key);
      ids.add(profile.id); result.push(profile);
    }
    const title_counts = new Map<string, number>();
    for (const profile of result) title_counts.set(profile.title, (title_counts.get(profile.title) || 0) + 1);
    for (const profile of result) if ((title_counts.get(profile.title) || 0) > 1) profile.title += " — " + path_api.dirname(profile.executable);
    return result;
  }

  function refresh(): Promise<terminal_profile[]> {
    if (disposed) return Promise.resolve([]);
    if (pending) return pending;
    scan_deadline = Date.now() + 6000;
    detection_warnings = [];
    scan_stats.clear();
    pending = scan().then(result => { if (!disposed) { snapshot = result; initialized = true; } return disposed ? [] : clone(); }).finally(() => { pending = null; });
    return pending;
  }
  return {
    profiles: clone,
    warnings: () => [...detection_warnings],
    ready: () => disposed ? Promise.resolve([]) : initialized ? Promise.resolve(clone()) : refresh(),
    refresh,
    dispose() { if (disposed) return; disposed = true; for (const cancel of [...cancel_queries]) cancel(); cancel_queries.clear(); snapshot = []; },
  };
}

export type terminal_profile_service = ReturnType<typeof create_terminal_profile_service>;
