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
window_html="$typora_root/resources/window.html"
theme="$TYPORA_USER_DATA/themes/cpp_github-consolas.css"
bundle="$TYPORA_USER_DATA/linux_note_enhancements/typora_enhancements.js"
for required_path in "$window_html" "$theme" "$bundle"; do
    [[ -f "$required_path" ]] || { printf '[typora] Installed file is missing: %s\n' "$required_path" >&2; exit 1; }
done

entry_count="$(grep -oF 'data-linux-note-enhancements="true"' "$window_html" | wc -l | tr -d '[:space:]')"
[[ "$entry_count" == '1' ]] || { printf '[typora] Expected one enhancement entry, found %s.\n' "$entry_count" >&2; exit 1; }
typora_validate_bundle "$bundle" "$typora_tools_root/enhancements/bundle_markers.txt"
typora_validate_workspace "$TYPORA_USER_DATA/plugins" "$typora_tools_root/enhancements/vendor/typora_workspace/SHA256SUMS"

[[ "$(typora_sha256 "$theme")" == "$(typora_sha256 "$typora_tools_root/cpp_github-consolas.css")" ]] || {
    printf '%s\n' '[typora] Installed theme differs from this repository theme; run configure.sh again.' >&2
    exit 1
}

[[ "$(typora_sha256 "$bundle")" == "$(typora_sha256 "$typora_tools_root/enhancements/dist/typora_enhancements.js")" ]] || {
    printf '%s\n' '[typora] Installed extension differs from this repository prebuilt bundle; run configure.sh again.' >&2
    exit 1
}

git_graph_runtime='Git missing on PATH; install Git to use Git Graph'
if command -v git >/dev/null 2>&1; then git_graph_runtime='Git available on PATH'; fi
printf '%s\n' \
    "platform: $TYPORA_PLATFORM_ID" \
    "typora_root: $typora_root" \
    "enhancement_entries: $entry_count" \
    "theme_sha256: $(typora_sha256 "$theme")" \
    "bundle_sha256: $(typora_sha256 "$bundle")" \
    "git_graph_runtime: $git_graph_runtime" \
    'status: OK'
