#!/usr/bin/env bash
set -euo pipefail

typora_tools_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=scripts/lib/typora_environment.sh
source "$typora_tools_root/scripts/lib/typora_environment.sh"
source "$typora_tools_root/scripts/lib/typora_workspace.sh"

backup_input=''
while [[ "$#" -gt 0 ]]; do
    case "$1" in
        --backup-root) [[ "$#" -ge 2 ]] || exit 2; backup_input="$2"; shift 2 ;;
        --help|-h) printf '%s\n' 'Usage: bash ./restore_configuration.sh --backup-root PATH'; exit 0 ;;
        *) printf '[typora] Unknown option: %s\n' "$1" >&2; exit 2 ;;
    esac
done
[[ -n "$backup_input" ]] || { printf '%s\n' '[typora] --backup-root is required.' >&2; exit 2; }

typora_environment_init "$typora_tools_root"
backup_root="$(typora_normalize_input_path "$backup_input")"
backup_root="$(cd "$backup_root" && pwd -P)" || { printf '%s\n' '[typora] Backup directory is unavailable.' >&2; exit 1; }
if [[ "$TYPORA_PLATFORM_ID" == 'windows-ucrt64' ]]; then
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(cygpath -w "$typora_tools_root/restore_configuration_windows.ps1")" -backup_root "$(cygpath -w "$backup_root")"
    exit $?
fi
manifest_path="$backup_root/configuration_manifest.tsv"
window_backup="$backup_root/window.html"
[[ -f "$manifest_path" && -f "$window_backup" ]] || { printf '%s\n' '[typora] Backup manifest or window.html is missing.' >&2; exit 1; }

[[ "$(typora_manifest_get "$manifest_path" schema_version)" == '2' ]] || { printf '%s\n' '[typora] Unsupported backup schema.' >&2; exit 1; }
typora_root="$(typora_manifest_get "$manifest_path" typora_root)"
window_html="$(typora_manifest_get "$manifest_path" window_html)"
theme_target="$(typora_manifest_get "$manifest_path" theme_target)"
plugin_target="$(typora_manifest_get "$manifest_path" plugin_target)"
theme_existed="$(typora_manifest_get "$manifest_path" theme_existed)"
settings_existed="$(typora_manifest_get "$manifest_path" settings_existed)"
[[ "$window_html" == "$typora_root/resources/window.html" && "$theme_target" == "$TYPORA_USER_DATA/themes/cpp_github-consolas.css" && "$plugin_target" == "$TYPORA_USER_DATA/plugins/plugins/forming_system.linux_note_enhancements" ]] || { printf '%s\n' '[typora] Invalid backup targets.' >&2; exit 1; }
[[ -f "$window_html" && "$theme_existed" =~ ^[01]$ && "$settings_existed" =~ ^[01]$ ]] || exit 1
[[ "$theme_existed" == 0 || -f "$backup_root/cpp_github-consolas.css" ]] || exit 1
[[ "$settings_existed" == 0 || -f "$backup_root/plugins.json" ]] || exit 1
typora_validate_workspace_backup "$backup_root/workspace"
typora_validate_workspace_backup "$backup_root/community_plugin"
timestamp="$(date '+%Y%m%d-%H%M%S-%N')"
cp -- "$window_html" "$backup_root/window.before_restore.$timestamp.html"
typora_plugin_settings restore "$TYPORA_USER_DATA/plugins/settings/plugins.json" "$backup_root/plugins.json"
typora_restore_workspace "$plugin_target" "$backup_root/community_plugin" "$timestamp"
other_plugins=0
for other_manifest in "$TYPORA_USER_DATA/plugins/plugins/"*/manifest.json; do
    [[ -f "$other_manifest" && "$other_manifest" != "$plugin_target/manifest.json" ]] && other_plugins=1
done
if [[ "$other_plugins" == 0 ]]; then
    typora_restore_workspace "$TYPORA_USER_DATA/plugins" "$backup_root/workspace" "$timestamp"
fi
typora_restore_managed_file "$theme_target" "$backup_root/cpp_github-consolas.css" "$theme_existed" "$timestamp"
if [[ "$other_plugins" == 0 ]]; then typora_copy_file "$window_backup" "$window_html"
else
    python3 - "$window_backup" "$backup_root/window.shared_core.html" <<'PY'
from pathlib import Path
import sys, re
source = Path(sys.argv[1]).read_text(encoding='utf-8')
source = re.sub(r'<script\s+defer\s+src="typora://app/userData/linux_note_enhancements/typora_enhancements\.js"\s+data-linux-note-enhancements="true"></script>', '', source)
tag = '<script src="typora://app/userData/plugins/loader.js" type="module"></script>'
if tag not in source: source = source.replace('</body>', tag + '</body>')
Path(sys.argv[2]).write_text(source, encoding='utf-8')
PY
    typora_copy_file "$backup_root/window.shared_core.html" "$window_html"
    printf '%s\n' '[typora] Other community plugins remain installed; shared loader/core retained.'
fi
printf '%s\n' '[typora] Configuration restored.' "[typora] Backup source: $backup_root" '[typora] Save open documents and restart Typora.'
