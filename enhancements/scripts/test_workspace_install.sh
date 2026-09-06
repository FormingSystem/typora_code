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
printf '1\t../../outside\n' > "$backup_root/assets.tsv"
if typora_validate_workspace_backup "$backup_root"; then
    printf '%s\n' 'FAIL: path traversal passed validation' >&2; exit 1
fi
printf 'PASS: workspace validation, backup, install, corruption detection and restore. Fixtures: %s\n' "$test_root"
