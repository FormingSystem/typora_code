#!/usr/bin/env bash
set -euo pipefail
typora_tools_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
# Transaction testing writes only to a new temporary directory; the same test can also verify file boundaries under Windows Python.
python3 "$typora_tools_root/enhancements/scripts/test_workspace_install.py"
