"""真实临时目录验证 Linux 部署事务；不访问已安装 Typora。"""
import importlib.util
import json
import shutil
import tempfile
from pathlib import Path
from unittest.mock import patch

project = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('deployment', project / 'scripts/lib/typora_workspace.py')
deployment = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deployment)
fixture = Path(tempfile.mkdtemp(prefix='typora_direct_linux_'))
tools = fixture / 'portable checkout'
(tools / 'enhancements').mkdir(parents=True)
shutil.copytree(project / 'enhancements/dist', tools / 'enhancements/dist')
for name in ['enhancements/runtime_head.html', 'enhancements/bundle_markers.txt', 'cpp_github-consolas.css']:
    shutil.copy2(project / name, tools / name)
root = fixture / 'installation with spaces'
(root / 'resources').mkdir(parents=True)
(root / 'typora').write_text('fixture', encoding='utf-8')
window = root / 'resources/window.html'
original = '<html><head><title>fixture</title></head><body><script type="module" src="typora://app/userData/plugins/loader.js"></script></body></html>'
window.write_text(original, encoding='utf-8')
user = fixture / 'user data'
for name in deployment.MIGRATION_FILES:
    target = user / 'plugins' / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text('old:' + name, encoding='utf-8')
settings = user / 'plugins/settings/plugins.json'
deployment.write_json(settings, {deployment.PLUGIN_ID: True, 'other': False, 'nested': {'中文': [1, 2]}})
deployment.write_json(user / 'plugins/settings/core.json', {'version': 2, 'settings': {'displayLang': 'zh-cn', 'githubProxy': 'private', 'downloader': {}, 'internalPlugin.enabledPlugins': ['a'], 'ribbonState': {'core.settings': True, 'core.outline': False}}})
state = user / 'Local Storage/reading.log'
state.parent.mkdir(parents=True)
state.write_text('reading and reviews', encoding='utf-8')
retired = user / 'typora_code/appearance_bootstrap.js'
retired.parent.mkdir(parents=True, exist_ok=True)
retired.write_text('old appearance startup', encoding='utf-8')
profile = user / 'profile.data'
def write_profile(data):
    profile.write_text(json.dumps(data, ensure_ascii=False).encode('utf-8').hex(), encoding='ascii')
write_profile({'framelessWindow': False, 'nested': {'中文': [1, False]}, 'later': 1})
backup = fixture / 'first backup'
deployment.install(tools, root, user, backup)
deployment.check(tools, root, user)
assert deployment.read_native_profile(profile)['data']['framelessWindow'] is True
write_profile({**deployment.read_native_profile(profile)['data'], 'later': 2})
assert not retired.exists()
assert (backup / 'product/appearance_bootstrap.js').read_text(encoding='utf-8') == 'old appearance startup'
installed = window.read_bytes()
assert window.read_text(encoding='utf-8').count('data-typora-code-style') == 2
assert all(not (user / 'plugins' / name).exists() for name in deployment.MIGRATION_FILES)
new_settings = user / 'typora_code/settings/workspace.json'
migrated = deployment.read_object(new_settings)
assert migrated == {'version': 1, 'settings': {'displayLang': 'zh-cn', 'ribbonState': {'core.outline': False}}}
new_settings.write_text('{"version":1,"settings":{"later":true}}', encoding='utf-8')
deployment.install(tools, root, user, fixture / 'repeat backup')
assert window.read_bytes() == installed
assert deployment.read_object(new_settings)['settings']['later'] is True

def rejected(action):
    try:
        action()
    except Exception:
        return
    raise AssertionError('Operation should have been rejected')

product = user / 'typora_code/workbench.js'
product.write_bytes(product.read_bytes() + b'corrupted')
rejected(lambda: deployment.check(tools, root, user))
shutil.copy2(tools / 'enhancements/dist/workbench.js', product)
saved = backup / 'window.html'
saved.write_bytes(saved.read_bytes() + b'corrupted')
rejected(lambda: deployment.restore(user, backup))
assert window.read_bytes() == installed
saved.write_text(original, encoding='utf-8')
manifest = backup / 'manifest.json'
manifest_bytes = manifest.read_bytes()
data = deployment.read_object(manifest)
data['product'][0]['relative_path'] = '../outside.txt'
deployment.write_json(manifest, data)
rejected(lambda: deployment.restore(user, backup))
assert window.read_bytes() == installed
manifest.write_bytes(manifest_bytes)
current = deployment.read_object(settings)
current['later.plugin'] = True
deployment.write_json(settings, current)
rejected(lambda: deployment.install(tools, root, user, fixture / 'conflict'))
assert not (fixture / 'conflict').exists()
real_copy = shutil.copy2
restore_failed = False

def restore_copy_failure(source, destination, *args, **kwargs):
    global restore_failed
    if not restore_failed and Path(destination) == window:
        restore_failed = True
        raise OSError('Injected restore failure')
    return real_copy(source, destination, *args, **kwargs)

with patch.object(deployment.shutil, 'copy2', restore_copy_failure):
    rejected(lambda: deployment.restore(user, backup))
assert deployment.read_native_profile(profile)['data']['framelessWindow'] is True
assert deployment.read_native_profile(profile)['data']['later'] == 2
assert restore_failed and window.read_bytes() == installed and product.is_file()
assert not (user / 'plugins/loader.js').exists()
deployment.restore(user, backup)
assert deployment.read_native_profile(profile)['data'] == {'framelessWindow': False, 'nested': {'中文': [1, False]}, 'later': 2}
assert retired.read_text(encoding='utf-8') == 'old appearance startup'
assert window.read_text(encoding='utf-8') == original
assert deployment.read_object(new_settings)['settings']['later'] is True
assert state.read_text(encoding='utf-8') == 'reading and reviews'
assert deployment.read_object(settings)['later.plugin'] is True
assert deployment.read_object(settings)[deployment.PLUGIN_ID] is True
assert all((user / 'plugins' / name).read_text(encoding='utf-8') == 'old:' + name for name in deployment.MIGRATION_FILES)
current = deployment.read_object(settings)
current['later.plugin'] = False
deployment.write_json(settings, current)
real_copy = shutil.copy2
failed = False

def copy_failure(source, destination, *args, **kwargs):
    global failed
    if not failed and Path(destination) == product:
        failed = True
        raise OSError('Injected copy failure')
    return real_copy(source, destination, *args, **kwargs)

with patch.object(deployment.shutil, 'copy2', copy_failure):
    rejected(lambda: deployment.install(tools, root, user, fixture / 'failed transaction'))
assert failed
assert window.read_text(encoding='utf-8') == original
assert not product.exists()
assert (user / 'plugins/loader.js').read_text(encoding='utf-8') == 'old:loader.js'
print('PASS: Linux transaction, head order, migration, hashes, settings, conflicts, constrained restore and rollback')
print('Fixtures:', fixture)

# 两个平台遵守相同的严格编码与字段恢复边界。
codec = fixture / 'codec.data'
assert deployment.update_native_profile(codec, 'install', 'missing') is True
assert deployment.read_native_profile(codec)['data'] == {'framelessWindow': True}
for invalid in [b'not-hex', b'7B7D', b'5b5d', b'ff', b'7b226672616d656c65737357696e646f77223a317d']:
    codec.write_bytes(invalid)
    rejected(lambda: deployment.read_native_profile(codec))
    assert codec.read_bytes() == invalid
codec.write_bytes(b'7b7d')
old_hash = deployment.read_native_profile(codec)['sha256']
codec.write_text(json.dumps({'later': 3}).encode('utf-8').hex(), encoding='ascii')
changed = codec.read_bytes()
rejected(lambda: deployment.update_native_profile(codec, 'install', old_hash))
assert codec.read_bytes() == changed
deployment.update_native_profile(codec, 'install', deployment.read_native_profile(codec)['sha256'])
deployment.update_native_profile(codec, 'restore', deployment.read_native_profile(codec)['sha256'], fixture / 'missing-original-profile')
assert deployment.read_native_profile(codec)['data'] == {'later': 3}
print('PASS: native profile strict codec, concurrent refusal and absent-key restoration')

# 配置已经切到原生窗口后，最后的备份清单写入失败仍需恢复原字段。
real_write_json = deployment.write_json

def manifest_failure(path, data):
    if Path(path).name == 'manifest.json':
        raise OSError('Injected manifest failure')
    return real_write_json(path, data)

with patch.object(deployment, 'write_json', manifest_failure):
    rejected(lambda: deployment.install(tools, root, user, fixture / 'late install failure'))
assert deployment.read_native_profile(profile)['data'] == {'framelessWindow': False, 'nested': {'中文': [1, False]}, 'later': 2}
assert window.read_text(encoding='utf-8') == original
assert not product.exists()
profile_before = profile.read_bytes()
profile.write_bytes(b'unknown-encoding')
rejected(lambda: deployment.install(tools, root, user, fixture / 'invalid profile'))
assert profile.read_bytes() == b'unknown-encoding'
assert not (fixture / 'invalid profile').exists()
profile.write_bytes(profile_before)
profile.unlink()
with patch.object(deployment, 'write_json', manifest_failure):
    rejected(lambda: deployment.install(tools, root, user, fixture / 'absent late failure'))
assert deployment.read_native_profile(profile)['data'] == {}
assert not product.exists()
profile.unlink()
absent_backup = fixture / 'absent profile backup'
deployment.install(tools, root, user, absent_backup)
assert deployment.read_native_profile(profile)['data'] == {'framelessWindow': True}
assert deployment.read_object(absent_backup / 'manifest.json')['native_profile'][0]['existed'] is False
write_profile({'framelessWindow': True, 'created_later': {'中文': 4}})
deployment.restore(user, absent_backup)
assert deployment.read_native_profile(profile)['data'] == {'created_later': {'中文': 4}}
print('PASS: late install rollback, malformed profile preflight and absent profile full transaction')
