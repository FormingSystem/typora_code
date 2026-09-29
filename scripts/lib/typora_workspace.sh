#!/usr/bin/env bash

# Bash is responsible for platform discovery; JSON, paths, and roll-backable file transactions are concentrated at this Python entrance.
typora_workspace_transaction() {
    command -v python3 >/dev/null || { printf '%s\n' '[typora] Python 3 is required for the deployment transaction.' >&2; return 1; }
    python3 "$TYPORA_TOOLS_ROOT/scripts/lib/typora_workspace.py" "$1" --tools-root "$TYPORA_TOOLS_ROOT" --user-data "$TYPORA_USER_DATA" "${@:2}"
}
