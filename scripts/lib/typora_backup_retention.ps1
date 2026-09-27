# 只轮换新版标准安装器明确登记的自动备份。原生基线、显式目录及未知内容保留。
function assert_typora_retained_backup {
    param([string]$backup, [string]$user_data, [string]$typora_root)
    $parent = [IO.Path]::GetFullPath((Join-Path $user_data 'backups/typora_code_configuration')).TrimEnd('\','/')
    if ((Split-Path -Parent ([IO.Path]::GetFullPath($backup))) -ne $parent) { throw 'Backup is outside the automatic backup directory.' }
    $manifest_path = resolve_typora_asset_path $backup 'manifest.json'
    $manifest = [IO.File]::ReadAllText($manifest_path,[Text.Encoding]::UTF8) | ConvertFrom-Json
    if ($manifest.schema_version -ne 4 -or $manifest.retention.schema -ne 1 -or $manifest.retention.kind -notin @('baseline','upgrade') -or
        [IO.Path]::GetFullPath($manifest.user_data) -ne [IO.Path]::GetFullPath($user_data) -or
        [IO.Path]::GetFullPath($manifest.typora_root) -ne [IO.Path]::GetFullPath($typora_root)) { throw 'Backup ownership differs.' }
    $expected = @{}
    $expected[$manifest_path] = $true
    $window = resolve_typora_asset_path $backup 'window.html'
    if ((Get-FileHash -LiteralPath $window -Algorithm SHA256).Hash -ne $manifest.window_sha256) { throw 'Backup window digest differs.' }
    $expected[$window] = $true
    foreach ($scope in @('product','migration','terminal','settings','theme','native_profile')) {
        $records = @($manifest.$scope)
        assert_typora_record_scope $records $scope
        assert_typora_workspace_backup (Join-Path $backup $scope) $records
        foreach ($record in $records) { if ($record.existed) { $expected[(resolve_typora_asset_path $backup ($scope+'/'+$record.relative_path))] = $true } }
    }
    # 逐层枚举，先拒绝链接再进入目录；额外用户文件会使整份备份退出自动回收。
    $pending = [Collections.Generic.Stack[string]]::new();$pending.Push($backup)
    while ($pending.Count) {
        foreach ($entry in Get-ChildItem -LiteralPath $pending.Pop() -Force) {
            if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Backup contains a linked entry.' }
            if ($entry.PSIsContainer) { $pending.Push($entry.FullName) }
            elseif (-not $expected.ContainsKey($entry.FullName)) { throw 'Backup contains an unregistered file.' }
        }
    }
    return $manifest
}

function prune_typora_automatic_backups {
    param([string]$current_backup, [string]$user_data, [string]$typora_root, [scriptblock]$report)
    $current = assert_typora_retained_backup $current_backup $user_data $typora_root
    if ($current.retention.kind -ne 'upgrade') { return }
    $parent = Split-Path -Parent ([IO.Path]::GetFullPath($current_backup))
    foreach ($entry in Get-ChildItem -LiteralPath $parent -Directory -Force) {
        if ($entry.FullName -eq [IO.Path]::GetFullPath($current_backup)) { continue }
        try {
            $old = assert_typora_retained_backup $entry.FullName $user_data $typora_root
            if ($old.retention.kind -ne 'upgrade') { continue }
            # 路径、归属、清单和摘要均已检查；当前成功事务仍由安装互斥保护。
            Remove-Item -LiteralPath $entry.FullName -Recurse -Force
            & $report ('已回收旧自动升级备份：' + $entry.Name)
        } catch { & $report ('备份保留，未自动回收：' + $entry.Name + '；' + $_.Exception.Message) }
    }
}
