# 复用唯一宿主复制、私有桌面和检查流程。
[CmdletBinding()]
param([string]$typora_root=$env:TYPORA_NATIVE_TEST_ROOT)
& (Join-Path $PSScriptRoot 'test_stability_native.ps1') -typora_root $typora_root -fixture 'drag_windows_native.js'
