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
        --help|-h) printf '%s\n' 'Usage: bash ./restore.sh --backup-root PATH'; exit 0 ;;
        *) printf '[typora] Unknown option: %s\n' "$1" >&2; exit 2 ;;
    esac
done
[[ -n "$backup_input" ]] || { printf '%s\n' '[typora] --backup-root is required.' >&2; exit 2; }

typora_environment_init "$typora_tools_root"
backup_root="$(typora_normalize_input_path "$backup_input")"
backup_root="$(cd "$backup_root" && pwd -P)" || { printf '%s\n' '[typora] Backup directory is unavailable.' >&2; exit 1; }
if [[ "$TYPORA_PLATFORM_ID" == 'windows-ucrt64' ]]; then
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(cygpath -w "$typora_tools_root/restore_windows.ps1")" -backup_root "$(cygpath -w "$backup_root")"
    exit $?
fi
typora_workspace_transaction restore --backup-root "$backup_root"
