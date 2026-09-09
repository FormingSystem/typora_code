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
        --typora-root) [[ "$#" -ge 2 ]] || exit 2; requested_root="$2"; shift 2 ;;
        --non-interactive) non_interactive=1; shift ;;
        --help|-h) printf '%s\n' 'Usage: bash ./check_configuration.sh [--typora-root PATH] [--non-interactive]'; exit 0 ;;
        *) printf '[typora] Unknown option: %s\n' "$1" >&2; exit 2 ;;
    esac
done

typora_environment_init "$typora_tools_root"
typora_root="$(typora_resolve_root "$requested_root" "$non_interactive")"
# Windows 的安装、下载、校验与回滚统一交给同一实现。
if [[ "$TYPORA_PLATFORM_ID" == 'windows-ucrt64' ]]; then
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(cygpath -w "$typora_tools_root/check_configuration_windows.ps1")" -typora_root "$(cygpath -w "$typora_root")" -non_interactive
    exit $?
fi

window_html="$typora_root/resources/window.html"
theme="$TYPORA_USER_DATA/themes/cpp_github-consolas.css"
plugin="$TYPORA_USER_DATA/plugins/plugins/forming_system.linux_note_enhancements"
script_tag='<script src="typora://app/userData/plugins/loader.js" type="module"></script>'
entry_count="$( (grep -oF "$script_tag" "$window_html" || true) | wc -l | tr -d '[:space:]')"
[[ "$entry_count" == '1' ]] || { printf '[typora] Expected one official loader, found %s.\n' "$entry_count" >&2; exit 1; }
! grep -Fq 'data-linux-note-enhancements="true"' "$window_html" || { printf '%s\n' '[typora] Legacy direct entry remains active.' >&2; exit 1; }
typora_validate_workspace "$TYPORA_USER_DATA/plugins" "$typora_tools_root/enhancements/vendor/typora_workspace/SHA256SUMS"
typora_validate_community_plugin "$plugin" "$typora_tools_root/enhancements/dist/community_plugin/SHA256SUMS"
typora_plugin_settings check "$TYPORA_USER_DATA/plugins/settings/plugins.json" ''
[[ "$(typora_sha256 "$theme")" == "$(typora_sha256 "$typora_tools_root/cpp_github-consolas.css")" ]] || { printf '%s\n' '[typora] Theme differs; run configure.sh again.' >&2; exit 1; }
printf '%s\n' "platform: $TYPORA_PLATFORM_ID" "typora_root: $typora_root" "enhancement_entries: $entry_count" "plugin_sha256: $(typora_sha256 "$plugin/main.js")" 'status: OK'
