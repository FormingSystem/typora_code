#!/usr/bin/env bash

# 只处理摘要清单列出的固定版本文件，不接管用户安装的其他插件或设置。
typora_validate_workspace() {
    local asset_root="$1" manifest_path="$2" line digest relative_path count=0
    [[ -f "$manifest_path" ]] || return 1
    while IFS= read -r line || [[ -n "$line" ]]; do
        line="${line%$'\r'}"
        [[ "$line" =~ ^([a-f0-9]{64})\ \ ([0-9.]+/(locales/)?[a-zA-Z0-9._-]+)$ ]] || {
            printf '[typora] Invalid workspace asset manifest entry: %s\n' "$line" >&2; return 1;
        }
        digest="${BASH_REMATCH[1]}" relative_path="${BASH_REMATCH[2]}"
        [[ "$relative_path" != *..* && -f "$asset_root/$relative_path" ]] || return 1
        [[ "$(typora_sha256 "$asset_root/$relative_path")" == "$digest" ]] || {
            printf '[typora] Workspace asset differs from its pinned release: %s\n' "$relative_path" >&2; return 1;
        }
        count=$((count + 1))
    done < "$manifest_path"
    [[ "$count" -gt 0 ]]
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
        [[ "$existed" =~ ^[01]$ && "$relative_path" =~ ^[0-9.]+/(locales/)?[a-zA-Z0-9._-]+$ && "$relative_path" != *..* ]] || return 1
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
