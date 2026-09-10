#!/usr/bin/env bash
set -euo pipefail
typora_tools_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
# 事务测试只写新建临时目录；同一测试也能在 Windows Python 下验证文件边界。
python3 "$typora_tools_root/enhancements/scripts/test_workspace_install.py"
