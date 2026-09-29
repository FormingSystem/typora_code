# Reuse unique host replication, private desktop, and check process.
[CmdletBinding()]
param([string]$typora_root=$env:TYPORA_NATIVE_TEST_ROOT)
& (Join-Path $PSScriptRoot 'test_stability_native.ps1') -typora_root $typora_root -fixture 'drag_windows_native.js'
