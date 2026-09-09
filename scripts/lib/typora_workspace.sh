#!/usr/bin/env bash

# 只处理摘要清单列出的固定版本文件，不接管用户安装的其他插件或设置。
typora_validate_workspace() {
    local asset_root="$1" manifest_path="$2" line digest relative_path count=0 seen="|"
    [[ -f "$manifest_path" ]] || return 1
    while IFS= read -r line || [[ -n "$line" ]]; do
        line="${line%$'\r'}"
        [[ "$line" =~ ^([a-f0-9]{64})\ \ ((loader\.(js|json))|([0-9.]+/(locales/)?[a-zA-Z0-9._-]+))$ ]] || {
            printf '[typora] Invalid workspace asset manifest entry: %s\n' "$line" >&2; return 1;
        }
        digest="${BASH_REMATCH[1]}" relative_path="${BASH_REMATCH[2]}"
        [[ "$relative_path" != *..* && -f "$asset_root/$relative_path" ]] || return 1
        [[ "$(typora_sha256 "$asset_root/$relative_path")" == "$digest" ]] || {
            printf '[typora] Workspace asset differs from its pinned release: %s\n' "$relative_path" >&2; return 1;
        }
        [[ "$seen" != *"|$relative_path|"* ]] || return 1
        seen+="$relative_path|"
        count=$((count + 1))
    done < "$manifest_path"
    [[ "$count" -gt 0 ]]
}

typora_validate_community_plugin() {
    local asset_root="$1" manifest_path="$2" line digest relative_path count=0 seen="|"
    [[ -f "$manifest_path" ]] || return 1
    while IFS= read -r line || [[ -n "$line" ]]; do
        line="${line%$'\r'}"
        [[ "$line" =~ ^([a-f0-9]{64})\ \ (main\.js|manifest\.json|style\.css)$ ]] || {
            printf '[typora] Invalid community plugin asset manifest entry: %s\n' "$line" >&2; return 1;
        }
        digest="${BASH_REMATCH[1]}" relative_path="${BASH_REMATCH[2]}"
        [[ "$(typora_sha256 "$asset_root/$relative_path")" == "$digest" ]] || {
            printf '[typora] Community plugin asset hash mismatch: %s\n' "$relative_path" >&2; return 1;
        }
        [[ "$seen" != *"|$relative_path|"* ]] || return 1
        seen+="$relative_path|"
        count=$((count + 1))
    done < "$manifest_path"
    [[ "$count" == '3' ]]
}

typora_backup_workspace() {
    local asset_root="$1" backup_root="$2" manifest_path="$3" line relative_path existed
    mkdir -p "$backup_root"
    : > "$backup_root/assets.tsv"
    while IFS= read -r line || [[ -n "$line" ]]; do
        line="${line%$'\r'}"; relative_path="${line:66}"; existed=0
        [[ ! -d "$asset_root/$relative_path" ]] || return 1
        if [[ -f "$asset_root/$relative_path" ]]; then
            existed=1
            mkdir -p "$(dirname "$backup_root/$relative_path")"
            cp -- "$asset_root/$relative_path" "$backup_root/$relative_path"
        fi
        printf '%s\t%s\n' "$existed" "$relative_path" >> "$backup_root/assets.tsv"
    done < "$manifest_path"
}

typora_install_workspace() {
    local vendor_root="$1" asset_root="$2" manifest_path="$3" line relative_path
    while IFS= read -r line || [[ -n "$line" ]]; do
        line="${line%$'\r'}"; relative_path="${line:66}"
        mkdir -p "$(dirname "$asset_root/$relative_path")"
        cp -f -- "$vendor_root/$relative_path" "$asset_root/$relative_path"
    done < "$manifest_path"
    typora_validate_workspace "$asset_root" "$manifest_path"
}

typora_validate_workspace_backup() {
    local backup_root="$1" existed relative_path
    [[ -f "$backup_root/assets.tsv" ]] || return 1
    while IFS=$'\t' read -r existed relative_path; do
        [[ "$existed" =~ ^[01]$ && "$relative_path" =~ ^((loader\.(js|json))|(main\.js|manifest\.json|style\.css)|([0-9.]+/(locales/)?[a-zA-Z0-9._-]+))$ && "$relative_path" != *..* ]] || return 1
        [[ "$existed" == 0 || -f "$backup_root/$relative_path" ]] || return 1
    done < "$backup_root/assets.tsv"
}

typora_restore_workspace() {
    local asset_root="$1" backup_root="$2" timestamp="$3" existed relative_path
    typora_validate_workspace_backup "$backup_root" || return 1
    while IFS=$'\t' read -r existed relative_path; do
        if [[ "$existed" == 1 ]]; then
            mkdir -p "$(dirname "$asset_root/$relative_path")"
            cp -f -- "$backup_root/$relative_path" "$asset_root/$relative_path"
        elif [[ -f "$asset_root/$relative_path" ]]; then
            mv -- "$asset_root/$relative_path" "$asset_root/$relative_path.disabled.$timestamp.$RANDOM"
        fi
    done < "$backup_root/assets.tsv"
}

# 插件和核心使用相同文件事务，但分别约束清单路径。
typora_install_community_plugin() {
    local source_root="$1" target_root="$2" line relative_path
    while IFS= read -r line || [[ -n "$line" ]]; do
        line="${line%$'\r'}"; relative_path="${line:66}"
        mkdir -p "$target_root"
        cp -f -- "$source_root/$relative_path" "$target_root/$relative_path"
    done < "$source_root/SHA256SUMS"
    typora_validate_community_plugin "$target_root" "$source_root/SHA256SUMS"
}

typora_restore_managed_file() {
    local target="$1" backup="$2" existed="$3" timestamp="$4"
    if [[ "$existed" == 1 ]]; then cp -f -- "$backup" "$target"
    elif [[ -f "$target" ]]; then mv -- "$target" "$target.disabled.$timestamp.$RANDOM"; fi
}

# Python 只处理 JSON 对象，避免文本替换损坏其他插件的嵌套配置。
typora_plugin_settings() {
    python3 - "$1" "$2" "$3" <<'PY'
import json, sys
from pathlib import Path
operation, target, backup = sys.argv[1:]
plugin_id = 'forming_system.linux_note_enhancements'
path = Path(target)
def read_object(path):
    data = json.loads(path.read_text(encoding='utf-8-sig')) if path.is_file() else {}
    if not isinstance(data, dict): raise ValueError('Plugin settings must be a JSON object')
    return data
settings = read_object(path)
if operation == 'check':
    if settings.get(plugin_id) is not True: raise ValueError('Community plugin is not enabled')
    sys.exit(0)
if operation == 'enable': settings[plugin_id] = True
elif operation == 'restore':
    previous = read_object(Path(backup))
    if plugin_id in previous: settings[plugin_id] = previous[plugin_id]
    else: settings.pop(plugin_id, None)
else: raise ValueError('Unknown settings operation')
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(settings, ensure_ascii=False, indent=2), encoding='utf-8')
PY
}
