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
        --help|-h) printf '%s\n' 'Usage: bash ./check.sh [--typora-root PATH] [--non-interactive]'; exit 0 ;;
        *) printf '[typora] Unknown option: %s\n' "$1" >&2; exit 2 ;;
    esac
done

typora_environment_init "$typora_tools_root"
typora_root="$(typora_resolve_root "$requested_root" "$non_interactive")"
# Windows 的安装、下载、校验与回滚统一交给同一实现。
if [[ "$TYPORA_PLATFORM_ID" == 'windows-ucrt64' ]]; then
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(cygpath -w "$typora_tools_root/check_windows.ps1")" -typora_root "$(cygpath -w "$typora_root")" -non_interactive
    exit $?
fi

typora_workspace_transaction check --typora-root "$typora_root"
