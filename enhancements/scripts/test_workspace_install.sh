#!/usr/bin/env bash
set -euo pipefail
typora_tools_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
source "$typora_tools_root/scripts/lib/typora_environment.sh"
source "$typora_tools_root/scripts/lib/typora_workspace.sh"

# 只验证公共文件事务，临时用户目录不包含真实 Typora 配置。
test_root="$(mktemp -d)"
vendor_root="$typora_tools_root/enhancements/vendor/typora_workspace"
manifest_path="$vendor_root/SHA256SUMS"
asset_root="$test_root/user data/plugins"
backup_root="$test_root/backup"
typora_validate_workspace "$vendor_root" "$manifest_path"
mkdir -p "$asset_root/2.10.15"
printf '%s' 'previous core' > "$asset_root/2.10.15/core.js"
typora_backup_workspace "$asset_root" "$backup_root" "$manifest_path"
typora_install_workspace "$vendor_root" "$asset_root" "$manifest_path"
printf '%s' 'corrupted' >> "$asset_root/2.10.15/core.js"
if typora_validate_workspace "$asset_root" "$manifest_path"; then
    printf '%s\n' 'FAIL: corrupted asset passed validation' >&2; exit 1
fi
typora_restore_workspace "$asset_root" "$backup_root" test
[[ "$(cat "$asset_root/2.10.15/core.js")" == 'previous core' ]]
[[ ! -f "$asset_root/2.10.15/core.css" ]]
# 独立插件包校验与重复安装使用同一清单，不混入官方核心。
plugin_source="$typora_tools_root/enhancements/dist/community_plugin"
plugin_target="$asset_root/plugins/forming_system.linux_note_enhancements"
typora_validate_community_plugin "$plugin_source" "$plugin_source/SHA256SUMS"
typora_backup_workspace "$plugin_target" "$test_root/plugin_backup" "$plugin_source/SHA256SUMS"
typora_install_community_plugin "$plugin_source" "$plugin_target"
typora_install_community_plugin "$plugin_source" "$plugin_target"
printf '%s' 'corrupted' >> "$plugin_target/main.js"
if typora_validate_community_plugin "$plugin_target" "$plugin_source/SHA256SUMS"; then
    printf '%s\n' 'FAIL: corrupted plugin passed validation' >&2; exit 1
fi
typora_restore_workspace "$plugin_target" "$test_root/plugin_backup" test
[[ ! -f "$plugin_target/main.js" && ! -f "$plugin_target/manifest.json" ]]
typora_install_community_plugin "$plugin_source" "$plugin_target"
typora_validate_community_plugin "$plugin_target" "$plugin_source/SHA256SUMS"

# Linux 配置用 Python 处理 JSON；测试只读写本次隔离目录。
settings="$test_root/settings.json"
printf '%s' '{"other.plugin":false,"nested":{"key":[1,2,3]}}' > "$settings"
cp -- "$settings" "$test_root/settings.before.json"
typora_plugin_settings enable "$settings" ''
typora_plugin_settings check "$settings" ''
python3 - "$settings" <<'PY'
import json, sys
from pathlib import Path
p = Path(sys.argv[1]); s = json.loads(p.read_text(encoding='utf-8'))
assert s['other.plugin'] is False and s['nested']['key'] == [1,2,3]
s['later.plugin'] = True
p.write_text(json.dumps(s), encoding='utf-8')
PY
typora_plugin_settings restore "$settings" "$test_root/settings.before.json"
python3 - "$settings" <<'PY'
import json, sys
from pathlib import Path
s = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
assert 'forming_system.linux_note_enhancements' not in s
assert s['later.plugin'] is True and s['other.plugin'] is False
assert s['nested']['key'] == [1,2,3]
PY
printf '1\t../../outside\n' > "$backup_root/assets.tsv"
if typora_validate_workspace_backup "$backup_root"; then
    printf '%s\n' 'FAIL: path traversal passed validation' >&2; exit 1
fi
printf 'PASS: core/plugin install, repeat install, corruption rejection, restore, reinstall and settings preservation. Fixtures: %s\n' "$test_root"

# 原生 Linux 使用隔离 XDG 配置目录运行完整入口，绝不访问真实用户数据。
if [[ "$(uname -s)" == Linux ]]; then
    (
        export XDG_CONFIG_HOME="$test_root/config"
        fake_root="$test_root/installation with spaces"
        mkdir -p "$fake_root/resources"
        printf '%s' '<html><body>fixture</body></html>' > "$fake_root/resources/window.html"
        cp -- "$fake_root/resources/window.html" "$test_root/window.original"
        bash "$typora_tools_root/configure.sh" --typora-root "$fake_root" --non-interactive
        bash "$typora_tools_root/check_configuration.sh" --typora-root "$fake_root" --non-interactive
        first_backup="$(find "$XDG_CONFIG_HOME/Typora/backups/linux_note_typora_configuration" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
        bash "$typora_tools_root/configure.sh" --typora-root "$fake_root" --non-interactive
        bash "$typora_tools_root/check_configuration.sh" --typora-root "$fake_root" --non-interactive
        bash "$typora_tools_root/restore_configuration.sh" --backup-root "$first_backup"
        cmp -- "$test_root/window.original" "$fake_root/resources/window.html"
        [[ ! -f "$XDG_CONFIG_HOME/Typora/plugins/plugins/forming_system.linux_note_enhancements/main.js" ]]
        bash "$typora_tools_root/configure.sh" --typora-root "$fake_root" --non-interactive
        bash "$typora_tools_root/check_configuration.sh" --typora-root "$fake_root" --non-interactive
        printf '%s\n' 'PASS: Linux configure/check/repeat/restore/reinstall entry transactions.'
    )
fi
