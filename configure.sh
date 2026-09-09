#!/usr/bin/env bash
set -euo pipefail

typora_tools_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=scripts/lib/typora_environment.sh
source "$typora_tools_root/scripts/lib/typora_environment.sh"
source "$typora_tools_root/scripts/lib/typora_workspace.sh"

requested_root=''
non_interactive=0
while [[ "$#" -gt 0 ]]; do
    case "$1" in
        --typora-root)
            [[ "$#" -ge 2 ]] || { printf '%s\n' '[typora] --typora-root requires a path.' >&2; exit 2; }
            requested_root="$2"
            shift 2
            ;;
        --non-interactive) non_interactive=1; shift ;;
        --help|-h)
            printf '%s\n' \
                'Usage: bash ./configure.sh [--typora-root PATH] [--non-interactive]' \
                'Supports Linux Bash and Windows MSYS2 UCRT64 Bash.' \
                'PATH may name the installation root, executable, resources directory, or resources/window.html.'
            exit 0
            ;;
        *) printf '[typora] Unknown option: %s\n' "$1" >&2; exit 2 ;;
    esac
done

typora_environment_init "$typora_tools_root"
typora_root="$(typora_resolve_root "$requested_root" "$non_interactive")"
# Windows 的安装、下载、校验与回滚统一交给同一实现。
if [[ "$TYPORA_PLATFORM_ID" == 'windows-ucrt64' ]]; then
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(cygpath -w "$typora_tools_root/configure_windows.ps1")" -typora_root "$(cygpath -w "$typora_root")" -non_interactive
    exit $?
fi

window_html="$typora_root/resources/window.html"
theme_source="$typora_tools_root/cpp_github-consolas.css"
theme_target="$TYPORA_USER_DATA/themes/cpp_github-consolas.css"
workspace_vendor="$typora_tools_root/enhancements/vendor/typora_workspace"
workspace_manifest="$workspace_vendor/SHA256SUMS"
workspace_target="$TYPORA_USER_DATA/plugins"
plugin_source="$typora_tools_root/enhancements/dist/community_plugin"
plugin_target="$workspace_target/plugins/forming_system.linux_note_enhancements"
plugin_settings="$workspace_target/settings/plugins.json"
timestamp="$(date '+%Y%m%d-%H%M%S-%N')"
backup_root="$TYPORA_USER_DATA/backups/linux_note_typora_configuration/$timestamp"
manifest_path="$backup_root/configuration_manifest.tsv"

command -v python3 >/dev/null || { printf '%s\n' '[typora] Python 3 is required to merge community plugin settings.' >&2; exit 1; }
for required_path in "$window_html" "$theme_source"; do [[ -f "$required_path" ]] || exit 1; done
typora_validate_workspace "$workspace_vendor" "$workspace_manifest"
typora_validate_community_plugin "$plugin_source" "$plugin_source/SHA256SUMS"
grep -Fq '</body>' "$window_html" || { printf '%s\n' '[typora] Missing </body> entry.' >&2; exit 1; }
[[ ! -d "$theme_target" && ! -d "$plugin_settings" ]] || exit 1
mkdir -p "$backup_root" "$(dirname "$theme_target")" "$(dirname "$plugin_settings")"
cp -- "$window_html" "$backup_root/window.html"
theme_existed=0
settings_existed=0
if [[ -f "$theme_target" ]]; then theme_existed=1; cp -- "$theme_target" "$backup_root/cpp_github-consolas.css"; fi
if [[ -f "$plugin_settings" ]]; then settings_existed=1; cp -- "$plugin_settings" "$backup_root/plugins.json"; fi
typora_backup_workspace "$workspace_target" "$backup_root/workspace" "$workspace_manifest"
typora_backup_workspace "$plugin_target" "$backup_root/community_plugin" "$plugin_source/SHA256SUMS"
configuration_committed=0
rollback_configuration() {
    local exit_code=$?
    set +e
    if [[ "$exit_code" -ne 0 && "$configuration_committed" == 0 ]]; then
        typora_restore_workspace "$workspace_target" "$backup_root/workspace" "$timestamp"
        typora_restore_workspace "$plugin_target" "$backup_root/community_plugin" "$timestamp"
        typora_copy_file "$backup_root/window.html" "$window_html"
        typora_restore_managed_file "$theme_target" "$backup_root/cpp_github-consolas.css" "$theme_existed" "$timestamp"
        typora_restore_managed_file "$plugin_settings" "$backup_root/plugins.json" "$settings_existed" "$timestamp"
    fi
    exit "$exit_code"
}
trap rollback_configuration EXIT

typora_install_workspace "$workspace_vendor" "$workspace_target" "$workspace_manifest"
typora_install_community_plugin "$plugin_source" "$plugin_target"
typora_plugin_settings enable "$plugin_settings" "$backup_root/plugins.json"
cp -f -- "$theme_source" "$theme_target"
python3 - "$window_html" "$backup_root/window.installed.html" <<'PY'
import re, sys
from pathlib import Path
source = Path(sys.argv[1]).read_text(encoding='utf-8')
source = re.sub(r'<script\s+defer\s+src="typora://app/userData/linux_note_enhancements/typora_enhancements\.js"\s+data-linux-note-enhancements="true"></script>', '', source)
tag = '<script src="typora://app/userData/plugins/loader.js" type="module"></script>'
source = re.sub(r'<script\s+src="typora://app/userData/plugins/loader\.js"\s+type="module"></script>', '', source)
source = source.replace('</body>', tag + '</body>')
if source.count(tag) != 1: raise ValueError('Expected one official loader entry')
Path(sys.argv[2]).write_text(source, encoding='utf-8')
PY
typora_copy_file "$backup_root/window.installed.html" "$window_html"
[[ "$(typora_sha256 "$theme_source")" == "$(typora_sha256 "$theme_target")" ]] || exit 1
: > "$manifest_path"
for field in typora_root window_html theme_target plugin_target theme_existed settings_existed; do
    typora_manifest_put "$manifest_path" "$field" "${!field}"
done
typora_manifest_put "$manifest_path" schema_version '2'
typora_manifest_put "$manifest_path" configured_at "$(date -Iseconds)"
configuration_committed=1
printf '%s\n' '[typora] Official community loader/core 2.10.15 and TyporaCode plugin installed.' "[typora] Unified backup: $backup_root" '[typora] Save open documents, restart Typora, and select cpp github consolas.'
