"""准备独立宿主、配置和文档；不修改原安装，不依赖历史缓存。"""
from pathlib import Path
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import uuid

repository_root = Path(__file__).resolve().parents[2]
fixture_path = repository_root / 'enhancements/fixtures/stability_native.js'
# 原生注入前先验证语法，避免静默不执行后等待整轮超时。
subprocess.run(['node', '--check', str(fixture_path)], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
host_root = Path(sys.argv[1]).resolve(strict=True)
release = repository_root / 'enhancements/dist'
case = repository_root / '.cache/issue_tracking/native' / uuid.uuid4().hex
host = case / 'host'
digest = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
asar = host_root / 'resources/app.asar'
# 已核对的原始宿主；其他版本必须重新核对端口，不能静默复用结论。
expected_asar = '4dbee896f9d5a7f393c69611f57bd877a6b9da895f3884028215c2da7894fb53'
assert digest(asar) == expected_asar, 'Native fixture requires verified original Typora 1.14.10'
assert (host_root / 'Typora.exe').is_file()
shutil.copytree(host_root, host, ignore=shutil.ignore_patterns('cache', 'Cache'))
workspace = case / 'workspace'
workspace.mkdir()
(workspace / 'front.md').write_text('# 原生稳定性验收\n\n原文必须保持。\n', encoding='utf-8')
# 避免宿主向上发现开发仓库；所有Git状态只来自这一专属仓库。
git = ['git', '-C', str(workspace), '-c', 'user.name=Native QA', '-c', 'user.email=native@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=.git/unused_hooks', '-c', 'core.autocrlf=false']
for arguments in [['init', '-b', 'main'], ['add', '--', 'front.md'], ['commit', '-m', 'test: isolated native fixture'], ['branch', 'topic/native'], ['tag', '-a', 'release/native', '-m', 'Native annotated tag']]:
    subprocess.run(git + arguments, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
user_data = case / 'user_data'
user_data.mkdir()
for line in (release / 'SHA256SUMS').read_text(encoding='utf-8-sig').splitlines():
    if not line.strip():
        continue
    expected, name = line.split(None, 1)
    relative = Path(name.strip())
    assert not relative.is_absolute() and '..' not in relative.parts
    source = release / relative
    assert digest(source) == expected, f'Invalid candidate asset: {relative}'
    target = user_data / 'typora_code' / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)
# 运行时只复制；安装器负责的私有Node不借用系统PATH。
runtime = Path(os.environ['APPDATA']) / 'Typora/linux_note_enhancements/terminal_runtime'
if runtime.is_dir():
    shutil.copytree(runtime, user_data / 'linux_note_enhancements/terminal_runtime')
(user_data / 'profile.data').write_text(json.dumps({'framelessWindow': True, 'enableAutoSave': False}).encode('utf-8').hex(), encoding='ascii')
fixture_path = repository_root / 'enhancements/fixtures/stability_native.js'
fixture = fixture_path.read_text(encoding='utf-8').replace('__CASE_ROOT__', json.dumps(case.as_posix()))
runner = '(()=>{const poll=setInterval(async()=>{const core=window[Symbol.for("typora-code:workspace")];if(!core?.app?.[Symbol.for("linux-note.workspace-files@v1")]?.host||!core.app.workspace.activeLeaf)return;clearInterval(poll);await (0,eval)(' + json.dumps(fixture) + ')},100)})();'
html = (host / 'resources/window.html').read_text(encoding='utf-8')
html = re.sub(r'<!-- typora-code:begin -->.*?<!-- typora-code:end -->', '', html, flags=re.S)
head = (repository_root / 'enhancements/runtime_head.html').read_text(encoding='utf-8')
html = html.replace('</head>', head + '<script>window.addEventListener("DOMContentLoaded",()=>{' + runner + '});</script></head>')
(host / 'resources/window.html').write_text(html, encoding='utf-8')
assert digest(asar) == expected_asar == digest(host / 'resources/app.asar')
(case / 'setup.json').write_text(json.dumps({'host_version': '1.14.10', 'asar_sha256': expected_asar, 'asset_manifest_sha256': digest(release / 'SHA256SUMS'), 'fixture_sha256': digest(fixture_path), 'front_sha256': digest(workspace / 'front.md')}, indent=2), encoding='utf-8')
print(case)
