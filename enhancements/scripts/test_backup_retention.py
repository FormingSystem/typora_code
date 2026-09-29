"R047.9/R047.11: Verify Windows/Python rotation and native backup protection."
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
    native_backup = user_data / 'backups/native_document.md'
    native_backup.write_text('native backup must remain', encoding='utf-8')

    def make_old(number, schema=4, change=None):
        backup = make('20260901-120000-000-' + f'{number:032x}', None)
        (backup / 'window.html').write_text('<script defer src="typora://app/userData/typora_code/workbench.js"></script>', encoding='utf-8')
        manifest = json.loads((backup / 'manifest.json').read_text(encoding='utf-8'))
        manifest.update(schema_version=schema, window_sha256=workspace.digest(backup / 'window.html'))
        if schema == 3:
            del manifest['native_profile']
        if change:
            change(backup, manifest)
        (backup / 'manifest.json').write_text(json.dumps(manifest), encoding='utf-8')
        return backup

    old_upgrades = [make_old(1, 3), make_old(2)]
    native_old = make_old(3, change=lambda backup, manifest: (
        (backup / 'window.html').write_text('native before enhancement', encoding='utf-8'),
        manifest.update(window_sha256=workspace.digest(backup / 'window.html'))))
    old_extra = make_old(4)
    (old_extra / 'personal.txt').write_text('keep', encoding='utf-8')
    old_bad = make_old(5)
    (old_bad / 'product/workbench.js').write_text('tampered', encoding='utf-8')
    old_foreign = make_old(6, change=lambda backup, manifest: manifest.update(user_data=str(root / 'another-user')))
    old_unknown = make_old(7, change=lambda backup, manifest: manifest.update(retention=dict(schema=2, kind='upgrade')))
    old_baseline = make_old(8, change=lambda backup, manifest: manifest.update(retention=dict(schema=1, kind='baseline')))
    old_missing = make_old(9)
    (old_missing / 'manifest.json').unlink()
    protected = [baseline, legacy, extra, damaged, native_backup, native_old, old_extra, old_bad, old_foreign, old_unknown, old_baseline, old_missing]

    def snapshot():
        return {str(file): workspace.digest(file) for entry in protected
                for file in ([entry] if entry.is_file() else entry.rglob('*')) if file.is_file()}

    before = snapshot()
    if platform == 'powershell':
        script = root / 'prune.ps1'
        script.write_text('param($repository,$current,$profile,$host_root)\n$ErrorActionPreference="Stop"\n'
                          '. (Join-Path $repository "scripts/lib/typora_workspace.ps1")\n'
                          '. (Join-Path $repository "scripts/lib/typora_backup_retention.ps1")\n'
                          'prune_typora_automatic_backups $current $profile $host_root {param($message)}\n', encoding='utf-8-sig')
    def prune(current):
        if platform == 'python':
            workspace.prune_automatic_backups(current, user_data, host, log())
        else:
            subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', str(script), str(repository), str(current), str(user_data), str(host)], check=True)

    prune(baseline)
    assert all(entry.is_dir() for entry in old_upgrades)
    for number in range(20):
        current = make('run-' + str(number))
        prune(current)
        assert sorted(p.name for p in parent.glob('run-*')) == [current.name]
        assert all(not entry.exists() for entry in old_upgrades)
        assert all(entry.exists() for entry in protected)
        assert snapshot() == before
    checks.append(platform + ': 20次轮换回收已核实schema3/4旧升级，仅保留最新升级；原生/基线/未知/异常备份逐文件摘要不变')
    # Do not delete the old backup if the backup verification fails, but the old backup can still be recovered.
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
