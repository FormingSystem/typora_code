import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from 'esbuild';

const compiled = await build({ entryPoints: ['src/terminal_profile_detection.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const api = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const normalize = value => path.win32.normalize(value).toLowerCase();
const system_shell = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
const env = { SystemRoot: 'C:\\Windows', ProgramFiles: 'C:\\Program Files', USERPROFILE: 'C:\\Users\\reader', LOCALAPPDATA: 'C:\\Users\\reader\\AppData\\Local', PATH: 'E:\\git\\cmd;E:\\tools;E:\\tools;relative;"E:\\cygwin\\bin"', HOMEDRIVE: 'C:' };

function fixture({ query_failure = false, hold_query = false } = {}) {
  const files = new Set([
    system_shell, 'C:\\Windows\\System32\\cmd.exe', 'C:\\Windows\\System32\\wsl.exe',
    'C:\\Program Files\\PowerShell\\6\\pwsh.exe', 'C:\\Program Files\\PowerShell\\7\\pwsh.exe', 'C:\\Program Files\\PowerShell\\7-preview\\pwsh.exe',
    'E:\\git\\cmd\\git.exe', 'E:\\git\\bin\\bash.exe', 'E:\\git\\usr\\bin\\bash.exe',
    'E:\\cygwin\\bin\\bash.exe', 'E:\\cygwin\\bin\\cygwin1.dll', 'E:\\msys2\\usr\\bin\\bash.exe',
    'E:\\tools\\nu.exe', 'E:\\tools\\zsh.exe', 'E:\\user_shells\\pwsh.exe', 'E:\\machine_shells\\fish.exe',
  ].map(normalize));
  const directories = new Set(['E:\\msys2\\ucrt64\\bin', 'E:\\msys2\\mingw64\\bin'].map(normalize));
  const listings = new Map([[normalize('C:\\Program Files\\PowerShell'), ['6', '7', '7-preview', 'Scripts']]]);
  const commands = [], deferred = [], inspected = [];
  let kills = 0, fail_wsl = false;
  const registry = { installations: [{ kind: 'git', root: 'E:\\git' }, { kind: 'cygwin', root: 'E:\\cygwin' }], drives: ['C:\\', 'E:\\'], machine_path: 'E:\\machine_shells', user_path: 'E:\\user_shells' };
  const fs = { promises: {
    stat: async value => { inspected.push(value); return { isFile: () => files.has(normalize(value)), isDirectory: () => directories.has(normalize(value)) }; },
    readdir: async value => listings.get(normalize(value)) || [],
    realpath: async value => value,
  } };
  const child_process = { execFile(executable, args, options, callback) {
    commands.push({ executable, args, options });
    assert.equal(options.windowsHide, true);
    assert.equal(options.timeout, 2000);
    assert.equal(options.maxBuffer, Infinity);
    const complete = () => {
      if (args.includes('-EncodedCommand')) {
        assert.ok(args.includes('-NoProfile'));
        assert.ok(args.includes('-NonInteractive'));
        const script = Buffer.from(args.at(-1), 'base64').toString('utf16le');
        assert.match(script, /GitForWindows/u);
        assert.match(script, /DriveInfo/u);
        assert.doesNotMatch(script, /Invoke-Expression|\.ps1|Get-ChildItem[^\n]*-Recurse/u);
        callback(query_failure ? new Error('unavailable') : null, query_failure ? '' : JSON.stringify(registry));
      } else {
        assert.deepEqual(args, ['--list', '--quiet']);
        assert.equal(options.encoding, 'utf16le');
        assert.equal(options.env.WSL_UTF8, '0');
        callback(fail_wsl ? new Error('enumeration timeout') : null, fail_wsl ? '' : '\uFEFFUbuntu-24.04\r\nDebian\r\nUbuntu-24.04\r\ndocker-desktop\r\ndocker-desktop-data\r\n');
      }
    };
    if (hold_query) deferred.push(complete); else queueMicrotask(complete);
    return { kill() { kills++; } };
  } };
  const service = api.create_terminal_profile_service({ process_api: { platform: 'win32', env }, path_api: path.win32, fs, child_process });
  return { service, files, directories, commands, inspected, deferred, registry, fail_wsl() { fail_wsl = true; }, get kills() { return kills; } };
}

const actual = fixture();
assert.deepEqual(actual.service.profiles(), []);
const first = actual.service.ready();
assert.equal(actual.service.ready(), first);
assert.equal(actual.service.refresh(), first);
const profiles = await first;
assert.equal(profiles.find(profile => profile.id === 'pwsh').executable, 'c:\\program files\\powershell\\7\\pwsh.exe');
assert.ok(profiles.some(profile => profile.id === 'powershell'));
assert.ok(profiles.some(profile => profile.id === 'cmd'));
assert.equal(profiles.filter(profile => profile.title === 'Git Bash').length, 1);
assert.equal(profiles.filter(profile => profile.title === 'Cygwin').length, 1);
assert.equal(profiles.filter(profile => profile.title === 'Bash').length, 0);
assert.ok(profiles.some(profile => profile.executable.toLowerCase() === 'e:\\user_shells\\pwsh.exe'));
assert.ok(profiles.some(profile => profile.id === 'fish'));
assert.ok(profiles.some(profile => profile.id === 'nu'));
const msys = profiles.filter(profile => profile.title.startsWith('MSYS2'));
assert.deepEqual(msys.map(profile => profile.env.MSYSTEM).sort(), ['MINGW64', 'MSYS', 'UCRT64']);
for (const profile of msys) { assert.equal(profile.env.CHERE_INVOKING, '1'); assert.deepEqual(profile.args, ['--login', '-i']); }
const wsl = profiles.filter(profile => profile.wsl);
assert.equal(wsl.length, 2);
assert.ok(wsl.some(profile => JSON.stringify(profile.args) === JSON.stringify(['-d', 'Ubuntu-24.04'])));
assert.ok(profiles.every(profile => !profile.title.includes('docker')));
assert.equal(new Set(profiles.map(profile => profile.id)).size, profiles.length);
assert.ok(actual.inspected.every(file_path => path.win32.isAbsolute(file_path)));
const count = actual.commands.length;
await actual.service.ready();
assert.equal(actual.commands.length, count);
const exposed = actual.service.profiles(); exposed[0].args.push('mutation');
assert.ok(!actual.service.profiles()[0].args.includes('mutation'));
const old_ids = profiles.map(profile => profile.id).sort();
const refreshed = await actual.service.refresh();
assert.deepEqual(refreshed.map(profile => profile.id).sort(), old_ids);
actual.files.delete(normalize('E:\\tools\\nu.exe'));
assert.ok(!(await actual.service.refresh()).some(profile => profile.id === 'nu'));
actual.fail_wsl();
assert.equal((await actual.service.refresh()).filter(profile => profile.wsl).length, 2);
assert.ok(actual.service.warnings().some(message => message.includes('WSL')));
actual.registry.wsl_distributions = [];
assert.equal((await actual.service.refresh()).filter(profile => profile.wsl).length, 0);
assert.ok(!actual.service.warnings().some(message => message.includes('WSL')));
actual.service.dispose();
assert.deepEqual(actual.service.profiles(), []);

const failed = fixture({ query_failure: true });
const partial = await failed.service.ready();
assert.ok(partial.some(profile => profile.id === 'cmd'));
assert.ok(partial.some(profile => profile.title === 'Git Bash'));
assert.ok(partial.some(profile => profile.wsl));
failed.service.dispose();

const canceled = fixture({ hold_query: true });
const canceled_scan = canceled.service.ready();
while (canceled.deferred.length === 0) await new Promise(resolve => setTimeout(resolve, 0));
canceled.service.dispose();
assert.deepEqual(await canceled_scan, []);
assert.equal(canceled.kills, 1);
for (const complete of canceled.deferred) complete();
assert.deepEqual(canceled.service.profiles(), []);
assert.deepEqual(await canceled.service.refresh(), []);

// 使用可控时钟跨过整次扫描截止点，证明返回已检查的系统Shell，而非清空所有候选。
const real_now = Date.now;
const base_time = real_now();
let elapsed_time = 0;
Date.now = () => base_time + elapsed_time;
try {
  const deadline = fixture({ hold_query: true });
  const deadline_scan = deadline.service.ready();
  while (!deadline.deferred.length) await new Promise(resolve => setTimeout(resolve, 0));
  elapsed_time = 7000;
  deadline.deferred[0]();
  const deadline_profiles = await deadline_scan;
  assert.ok(deadline_profiles.some(profile => profile.id === 'powershell'));
  assert.ok(deadline_profiles.some(profile => profile.id === 'cmd'));
  assert.ok(deadline.service.warnings().length > 0);
  deadline.service.dispose();
} finally { Date.now = real_now; }

const unix_files = new Set(['/bin/bash', '/bin/zsh', '/bin/sh']);
const unix = api.create_terminal_profile_service({
  process_api: { platform: 'linux', env: { SHELL: '/bin/bash', PATH: '/bin' } }, path_api: path.posix,
  fs: { constants: { X_OK: 1 }, promises: {
    stat: async value => ({ isFile: () => unix_files.has(value) }),
    access: async value => { if (value === '/bin/zsh') throw new Error('not executable'); },
    readFile: async () => '# configured shells\n/bin/bash\n/bin/zsh\nmissing\n/bin/bash # duplicate\n',
    realpath: async value => value,
  } }, child_process: { execFile() { throw new Error('Unix discovery must not start a shell'); } },
});
const unix_profiles = await unix.ready();
assert.equal(unix_profiles.filter(profile => profile.executable === '/bin/bash').length, 1);
assert.equal(unix_profiles[0].id, 'default');
assert.ok(!unix_profiles.some(profile => profile.executable === '/bin/zsh'));
unix.dispose();
console.log(JSON.stringify({ status: 'PASS', discovered_fixture_profiles: profiles.length, checks: ['真实候选存在性', '注册表非默认安装根', '用户和机器PATH', 'PowerShell稳定版优先', 'Git Bash别名和Cygwin去重', 'MSYS环境不合并', 'WSL参数及Docker排除', 'WSL失败保留和真实空区分', '合并并发及刷新缓存', '结果隔离', '局部失败降级', '取消进程及拒绝迟到结果', '总截止点保留已验证候选', 'Unix可执行权限及shells清单'] }));
