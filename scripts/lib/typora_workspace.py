"""Linux 部署事务：路径、摘要与 JSON 由同一处验证，Bash 保留平台发现。"""
import argparse
import hashlib
import json
import re
import shutil
import uuid
import os
import tempfile
from pathlib import Path

def read_native_profile(path):
    if not path.exists():
        return {'data': {}, 'sha256': 'missing', 'exists': False}
    raw = path.read_bytes()
    if not raw or len(raw) % 2 or not re.fullmatch(b'[0-9a-f]+', raw):
        raise ValueError('Unknown native profile encoding')
    try:
        data = json.loads(bytes.fromhex(raw.decode('ascii')).decode('utf-8'), parse_constant=lambda _: (_ for _ in ()).throw(ValueError('Invalid JSON constant')))
    except (UnicodeError, ValueError):
        raise ValueError('Invalid native profile JSON') from None
    if not isinstance(data, dict) or ('framelessWindow' in data and type(data['framelessWindow']) is not bool):
        raise ValueError('Invalid native profile object or window preference')
    return {'data': data, 'sha256': hashlib.sha256(raw).hexdigest(), 'exists': True}

def update_native_profile(path, operation, expected, backup=None):
    current = read_native_profile(path)
    if current['sha256'] != expected:
        raise ValueError('Native profile changed concurrently')
    previous = read_native_profile(backup)['data'] if operation == 'restore' else {'framelessWindow': True}
    data = dict(current['data'])
    if 'framelessWindow' in previous:
        data['framelessWindow'] = previous['framelessWindow']
    else:
        data.pop('framelessWindow', None)
    if data == current['data']:
        return False
    raw = json.dumps(data, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf-8').hex().encode('ascii')
    descriptor, temporary = tempfile.mkstemp(prefix=path.name + '.typora-code-', suffix='.tmp', dir=path.parent)
    try:
        if current['exists']:
            os.chmod(temporary, path.stat().st_mode)
        with os.fdopen(descriptor, 'wb') as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        if read_native_profile(path)['sha256'] != expected:
            raise ValueError('Native profile changed concurrently')
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)
    return True

CORE_FILES = {'workspace_core.js', 'workspace_core.css', 'workspace.css',  'workbench.js'}
# 只处理明确退休的产品文件，沿用安装备份和恢复事务，不遍历删除目录。
RETIRED_PRODUCT_FILES = ['appearance_bootstrap.js',
                         'assets/source_symbols/tree-sitter-c.wasm', 'assets/source_symbols/tree-sitter-cpp.wasm',
                         'assets/source_symbols/LICENSE_c', 'assets/source_symbols/LICENSE_cpp']
PLUGIN_ID = 'forming_system.linux_note_enhancements'
MIGRATION_FILES = ['loader.js', 'loader.json', '2.10.15/core.js', '2.10.15/core.css',
                   '2.10.15/locales/lang.de.json', '2.10.15/locales/lang.en.json', '2.10.15/locales/lang.zh-cn.json',
                   *['plugins/' + PLUGIN_ID + '/' + name for name in ['main.js', 'manifest.json', 'style.css']]]

def asset_path(root, relative):
    if not isinstance(relative, str) or not re.fullmatch(r'[a-zA-Z0-9_-][a-zA-Z0-9_./-]*', relative) or '..' in relative or relative.endswith('/'):
        raise ValueError('Invalid managed path')
    if any(not part or part == '.' or part.endswith('.') for part in relative.split('/')):
        raise ValueError('Non-canonical managed path')
    target = Path(root).absolute() / relative
    for item in [target, *target.parents]:
        if item.is_symlink():
            raise ValueError('Linked managed path: ' + str(item))
    if not target.resolve().is_relative_to(Path(root).resolve()):
        raise ValueError('Managed path escapes root')
    return target

def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def read_object(path):
    data = json.loads(path.read_text(encoding='utf-8-sig')) if path.is_file() else {}
    if not isinstance(data, dict):
        raise ValueError('Expected JSON object: ' + str(path))
    return data

def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')

def product_path(relative):
    return relative in CORE_FILES or relative == 'SHA256SUMS' or bool(re.fullmatch(r'(assets|locales|licenses)/[a-zA-Z0-9_./-]+', relative))

def release_assets(root):
    assets = {}
    for line in (root / 'SHA256SUMS').read_text(encoding='utf-8').splitlines():
        match = re.fullmatch(r'([a-f0-9]{64})  ([a-zA-Z0-9_./-]+)', line)
        if not match or not product_path(match[2]) or match[2] == 'SHA256SUMS' or match[2] in assets:
            raise ValueError('Invalid or duplicate release manifest entry')
        asset_path(root, match[2])
        assets[match[2]] = match[1]
    if not CORE_FILES <= assets.keys():
        raise ValueError('Incomplete startup release')
    verify_assets(root, assets)
    return assets

def verify_assets(root, assets):
    for relative, expected in assets.items():
        if digest(asset_path(root, relative)) != expected:
            raise ValueError('Release hash mismatch: ' + relative)

def check_conflicts(user_data):
    path = asset_path(user_data, 'plugins/settings/plugins.json')
    if path.is_dir():
        raise ValueError('Plugin settings is a directory')
    settings = read_object(path)
    other = [key for key, value in settings.items() if key != PLUGIN_ID and value is True]
    if other:
        raise ValueError('Other enabled community plugins depend on the old runtime: ' + ', '.join(other))
    return settings

def host_window_source(source):
    if len(re.findall('</head>', source, flags=re.I)) != 1:
        raise ValueError('Expected one </head>')
    source = re.sub(r'<!-- typora-code:begin -->.*?<!-- typora-code:end -->\s*', '', source, flags=re.S)
    source = re.sub(r'<script\b[^>]*\bsrc=["\']typora://app/userData/(plugins/loader\.js|linux_note_enhancements/typora_enhancements\.js)["\'][^>]*>\s*</script>', '', source, flags=re.I)
    return re.sub(r'\s*</head>', '</head>', source, flags=re.I).strip()

def window_source(source, head):
    source = re.sub('</head>', lambda _: head.rstrip() + '\n</head>', host_window_source(source), flags=re.I)
    check_window(source, head)
    return source

def check_window(source, head):
    if source.count(head.rstrip()) != 1 or source.index(head.rstrip()) > source.lower().index('</head>'):
        raise ValueError('Startup block must occur exactly once in head')
    if source.count('<!-- typora-code:begin -->') != 1 or source.count('typora://app/userData/typora_code/workbench.js') != 1:
        raise ValueError('Duplicate workbench startup')
    for filename in CORE_FILES:
        if source.count('typora://app/userData/typora_code/' + filename) != 1:
            raise ValueError('Duplicate startup asset: ' + filename)
    if 'typora://app/userData/plugins/loader.js' in source or 'typora://app/userData/linux_note_enhancements/typora_enhancements.js' in source:
        raise ValueError('Previous runtime entry remains')

def migrated_settings(user_data):
    target = asset_path(user_data, 'typora_code/settings/workspace.json')
    if target.is_dir():
        raise ValueError('Workspace settings is a directory')
    if target.exists():
        return None
    old = asset_path(user_data, 'plugins/settings/core.json')
    if not old.is_file():
        return None
    data = read_object(old)
    settings = data.get('settings')
    if not isinstance(settings, dict):
        raise ValueError('Previous core settings must contain settings object')
    for key in ['internalPlugin.enabledPlugins', 'downloader', 'githubProxy']:
        settings.pop(key, None)
    if isinstance(settings.get('ribbonState'), dict):
        settings['ribbonState'].pop('core.settings', None)
    return {'version': 1, 'settings': settings}

def snapshot(root, backup, paths):
    records = []
    for relative in paths:
        source = asset_path(root, relative)
        saved = asset_path(backup, relative)
        if source.is_dir():
            raise ValueError('Managed file is a directory: ' + str(source))
        existed = source.is_file()
        if existed:
            saved.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, saved)
        records.append({'relative_path': relative, 'existed': existed, 'sha256': digest(saved) if existed else None})
    return records

def validate_records(root, backup, records, scope):
    if scope == 'native_profile' and (len(records) != 1 or records[0].get('relative_path') != 'profile.data'):
        raise ValueError('Invalid native profile backup scope')
    seen = set()
    for record in records:
        relative = record['relative_path']
        target, saved = asset_path(root, relative), asset_path(backup, relative)
        valid = {'product': product_path(relative) or relative in RETIRED_PRODUCT_FILES, 'migration': relative in MIGRATION_FILES,
                 'native_profile': relative == 'profile.data', 'settings': relative == 'plugins.json', 'theme': relative == 'cpp_github-consolas.css',
                 'terminal': bool(re.fullmatch(r'([0-9.]+/(node-pty/[a-zA-Z0-9_./-]+|terminal_broker.cjs)|node/[0-9.]+/(node.exe|LICENSE))', relative))}[scope]
        if not valid or relative in seen or type(record['existed']) is not bool or target.is_dir():
            raise ValueError('Invalid backup record or target')
        if scope == 'native_profile' and not record['existed'] and saved.exists():
            raise ValueError('Unexpected native profile backup')
        seen.add(relative)
        if record['existed'] and (not re.fullmatch(r'[a-f0-9]{64}', record['sha256'] or '') or digest(saved) != record['sha256']):
            raise ValueError('Backup integrity check failed: ' + relative)

def restore_records(root, backup, records):
    for record in records:
        target = asset_path(root, record['relative_path'])
        if record['existed']:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(asset_path(backup, record['relative_path']), target)
        elif target.is_file():
            target.rename(target.with_name('disabled_' + uuid.uuid4().hex))

def group_roots(user_data):
    return {'product': user_data / 'typora_code', 'migration': user_data / 'plugins',
            'terminal': user_data / 'linux_note_enhancements/terminal_runtime',
            'settings': user_data / 'plugins/settings', 'theme': user_data / 'themes', 'native_profile': user_data}

def install(tools_root, typora_root, user_data, backup):
    source = tools_root / 'enhancements/dist'
    assets = release_assets(source)
    bundle = (source / 'workbench.js').read_text(encoding='utf-8') + (source / 'workspace.css').read_text(encoding='utf-8')
    for marker in (tools_root / 'enhancements/bundle_markers.txt').read_text(encoding='utf-8').splitlines():
        if marker.strip() and marker.strip() not in bundle:
            raise ValueError('Incomplete workbench release: ' + marker)
    profile_path = asset_path(user_data, 'profile.data')
    profile_before = read_native_profile(profile_path)
    settings = check_conflicts(user_data)
    new_settings = migrated_settings(user_data)
    window = asset_path(typora_root, 'resources/window.html')
    head = (tools_root / 'enhancements/runtime_head.html').read_text(encoding='utf-8')
    updated = window_source(window.read_text(encoding='utf-8'), head)
    theme = tools_root / 'cpp_github-consolas.css'
    theme.read_bytes()
    assets['SHA256SUMS'] = digest(source / 'SHA256SUMS')
    roots = group_roots(user_data)
    paths = {'product': list(assets) + RETIRED_PRODUCT_FILES, 'migration': MIGRATION_FILES, 'terminal': [], 'settings': ['plugins.json'], 'theme': ['cpp_github-consolas.css'], 'native_profile': ['profile.data']}
    for name, entries in paths.items():
        for relative in entries:
            if asset_path(roots[name], relative).is_dir():
                raise ValueError('Managed file target is a directory')
    asset_path(backup, 'manifest.json')
    if backup.exists():
        raise ValueError('Use a new backup destination')
    backup.mkdir(parents=True)
    shutil.copy2(window, backup / 'window.html')
    records = {name: snapshot(roots[name], backup / name, entries) for name, entries in paths.items()}
    created = False
    profile_changed = False
    settings_target = user_data / 'typora_code/settings/workspace.json'
    try:
        for relative in assets:
            target = asset_path(roots['product'], relative)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source / relative, target)
        for relative in RETIRED_PRODUCT_FILES:
            asset_path(roots['product'], relative).unlink(missing_ok=True)
        for relative in MIGRATION_FILES:
            asset_path(roots['migration'], relative).unlink(missing_ok=True)
        if PLUGIN_ID in settings:
            settings.pop(PLUGIN_ID)
            write_json(user_data / 'plugins/settings/plugins.json', settings)
        if new_settings is not None and not settings_target.exists():
            write_json(settings_target, new_settings)
            created = True
        roots['theme'].mkdir(parents=True, exist_ok=True)
        shutil.copy2(theme, roots['theme'] / theme.name)
        window.write_text(updated, encoding='utf-8')
        verify_assets(roots['product'], assets)
        check_window(window.read_text(encoding='utf-8'), head)
        profile_changed = update_native_profile(profile_path, 'install', profile_before['sha256'])
        write_json(backup / 'manifest.json', {'schema_version': 4, 'typora_root': str(typora_root), 'user_data': str(user_data), 'window_sha256': digest(backup / 'window.html'), **records})
    except Exception:
        for name, entries in records.items():
            if name != 'native_profile':
                restore_records(roots[name], backup / name, entries)
        if profile_changed:
            update_native_profile(profile_path, 'restore', read_native_profile(profile_path)['sha256'], backup / 'native_profile/profile.data')
        if created:
            settings_target.rename(settings_target.with_suffix('.disabled.' + uuid.uuid4().hex))
        shutil.copy2(backup / 'window.html', window)
        raise
    print('TyporaCode installed. Backup:', backup)

def check(tools_root, typora_root, user_data):
    if read_native_profile(asset_path(user_data, 'profile.data'))['data'].get('framelessWindow') is not True:
        raise ValueError('Single-row workspace requires framelessWindow=true')
    source = tools_root / 'enhancements/dist'
    for relative in RETIRED_PRODUCT_FILES:
        if asset_path(user_data / 'typora_code', relative).exists():
            raise ValueError('Retired product asset remains: ' + relative)
    verify_assets(user_data / 'typora_code', release_assets(source))
    if digest(user_data / 'typora_code/SHA256SUMS') != digest(source / 'SHA256SUMS'):
        raise ValueError('Installed release manifest differs')
    check_window((typora_root / 'resources/window.html').read_text(encoding='utf-8'), (tools_root / 'enhancements/runtime_head.html').read_text(encoding='utf-8'))
    if PLUGIN_ID in check_conflicts(user_data):
        raise ValueError('Old product plugin registration remains')
    for relative in MIGRATION_FILES:
        if asset_path(user_data / 'plugins', relative).exists():
            raise ValueError('Old runtime asset remains: ' + relative)
    if digest(user_data / 'themes/cpp_github-consolas.css') != digest(tools_root / 'cpp_github-consolas.css'):
        raise ValueError('Theme differs from release')
    print('status: OK (independent head startup, static CSS, release hashes and migration)')

def restore(user_data, backup):
    manifest = read_object(asset_path(backup, 'manifest.json'))
    if manifest.get('schema_version') != 4 or Path(manifest['user_data']).resolve() != user_data.resolve():
        raise ValueError('Unsupported backup schema or different user-data root')
    typora_root = Path(manifest['typora_root'])
    window = asset_path(typora_root, 'resources/window.html')
    if not window.is_file():
        raise ValueError('Backup installation target is unavailable')
    saved_window = asset_path(backup, 'window.html')
    if digest(saved_window) != manifest['window_sha256']:
        raise ValueError('Window backup integrity check failed')
    if host_window_source(window.read_text(encoding='utf-8')) != host_window_source(saved_window.read_text(encoding='utf-8')):
        raise ValueError('Typora startup page changed outside the managed entry; do not restore across Typora versions')
    roots = group_roots(user_data)
    for name, root in roots.items():
        validate_records(root, backup / name, manifest[name], name)
    profile_path = asset_path(user_data, 'profile.data')
    profile_before = read_native_profile(profile_path)
    read_native_profile(backup / 'native_profile/profile.data')
    profile_changed = False
    attempt = backup / ('restore_' + uuid.uuid4().hex)
    attempt.mkdir()
    shutil.copy2(window, attempt / 'window.html')
    before = {name: snapshot(root, attempt / name, [r['relative_path'] for r in manifest[name]]) for name, root in roots.items()}
    try:
        for name, root in roots.items():
            if name == 'native_profile':
                continue
            if name == 'settings':
                settings = read_object(root / 'plugins.json')
                previous = read_object(backup / 'settings/plugins.json')
                if PLUGIN_ID in previous:
                    settings[PLUGIN_ID] = previous[PLUGIN_ID]
                else:
                    settings.pop(PLUGIN_ID, None)
                if settings or (root / 'plugins.json').exists():
                    write_json(root / 'plugins.json', settings)
            else:
                restore_records(root, backup / name, manifest[name])
        profile_changed = update_native_profile(profile_path, 'restore', profile_before['sha256'], backup / 'native_profile/profile.data')
        shutil.copy2(saved_window, window)
    except Exception:
        for name, root in roots.items():
            if name != 'native_profile':
                restore_records(root, attempt / name, before[name])
        if profile_changed:
            update_native_profile(profile_path, 'restore', read_native_profile(profile_path)['sha256'], attempt / 'native_profile/profile.data')
        shutil.copy2(attempt / 'window.html', window)
        raise
    print('TyporaCode installation restored; workspace settings and user data preserved.')

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('operation', choices=['install', 'check', 'restore'])
    parser.add_argument('--tools-root', type=Path, required=True)
    parser.add_argument('--user-data', type=Path, required=True)
    parser.add_argument('--typora-root', type=Path)
    parser.add_argument('--backup-root', type=Path)
    args = parser.parse_args()
    if args.operation == 'install':
        backup = args.backup_root or args.user_data / 'backups/typora_code_configuration' / uuid.uuid4().hex
        install(args.tools_root, args.typora_root, args.user_data, backup)
    elif args.operation == 'check':
        check(args.tools_root, args.typora_root, args.user_data)
    else:
        restore(args.user_data, args.backup_root)

if __name__ == '__main__':
    main()
