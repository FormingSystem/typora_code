"""R047.9：用专属小备份验证 Windows/Python 同一保留契约。"""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile

repository = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('workspace', repository / 'scripts/lib/typora_workspace.py')
workspace = importlib.util.module_from_spec(spec)
spec.loader.exec_module(workspace)
os.environ.pop('PSModulePath', None)
os.environ.pop('PSMODULEPATH', None)
root = Path(tempfile.mkdtemp(prefix='typora_retention_'))
checks = []


class log:
    @staticmethod
    def write(*args):
        pass


for platform in ['python'] + (['powershell'] if os.name == 'nt' else []):
    user_data, host = root / platform / 'profile', root / platform / 'host'
    parent = user_data / 'backups/typora_code_configuration'
    parent.mkdir(parents=True)
    host.mkdir(parents=True)

    def make(name, kind='upgrade'):
        backup = parent / name
        (backup / 'product').mkdir(parents=True)
        (backup / 'window.html').write_text('native', encoding='utf-8')
        (backup / 'product/workbench.js').write_text('version-' + name, encoding='utf-8')
        manifest = {scope: [] for scope in workspace.group_roots(user_data)}
        manifest.update(schema_version=4, typora_root=str(host), user_data=str(user_data), window_sha256=workspace.digest(backup / 'window.html'))
        manifest['product'] = [dict(relative_path='workbench.js', existed=True, sha256=workspace.digest(backup / 'product/workbench.js'))]
        manifest['native_profile'] = [dict(relative_path='profile.data', existed=False, sha256=None)]
        if kind:
            manifest['retention'] = dict(schema=1, kind=kind)
        (backup / 'manifest.json').write_text(json.dumps(manifest), encoding='utf-8')
        return backup

    baseline, legacy, extra, damaged = make('baseline', 'baseline'), make('legacy', None), make('extra'), make('damaged')
    (extra / 'personal.txt').write_text('keep', encoding='utf-8')
    (damaged / 'product/workbench.js').write_text('tampered', encoding='utf-8')
    if platform == 'powershell':
        script = root / 'prune.ps1'
        script.write_text('param($repository,$current,$profile,$host_root)\n$ErrorActionPreference="Stop"\n'
                          '. (Join-Path $repository "scripts/lib/typora_workspace.ps1")\n'
                          '. (Join-Path $repository "scripts/lib/typora_backup_retention.ps1")\n'
                          'prune_typora_automatic_backups $current $profile $host_root {param($message)}\n', encoding='utf-8-sig')
    for number in range(20):
        current = make('run-' + str(number))
        if platform == 'python':
            workspace.prune_automatic_backups(current, user_data, host, log())
        else:
            subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', str(script), str(repository), str(current), str(user_data), str(host)], check=True)
        assert sorted(p.name for p in parent.glob('run-*')) == [current.name]
        assert all(p.is_dir() for p in (baseline, legacy, extra, damaged))
        assert (extra / 'personal.txt').read_text(encoding='utf-8') == 'keep'
    checks.append(platform + ': 20次轮换仅保留最近自动升级备份，基线/旧备份/附加文件/损坏备份不动')
    # 当前备份校验失败时不得删除仍可恢复的旧备份。
    latest = current
    invalid = make('invalid-current')
    (invalid / 'window.html').write_text('bad', encoding='utf-8')
    try:
        if platform == 'python':
            workspace.prune_automatic_backups(invalid, user_data, host, log())
        else:
            subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', str(script), str(repository), str(invalid), str(user_data), str(host)], check=True)
        raise AssertionError('invalid current accepted')
    except (ValueError, subprocess.CalledProcessError):
        assert latest.is_dir()
    checks.append(platform + ': 当前备份无效拒绝轮换')
(root / 'checks.json').write_text(json.dumps(checks, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'status': 'PASS', 'checks': checks}, ensure_ascii=False))
