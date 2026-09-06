function get_typora_workspace_assets {
    param([string]$vendor_root)
    $assets = @()
    foreach ($line in [System.IO.File]::ReadAllLines((Join-Path $vendor_root "SHA256SUMS"))) {
        if ($line -notmatch '^([a-f0-9]{64})  ([0-9.]+/(?:locales/)?[a-zA-Z0-9._-]+)$') {
            throw "Invalid workspace asset manifest entry: $line"
        }
        if ($Matches[2].Contains('..')) { throw "Invalid workspace asset path." }
        $assets += [pscustomobject]@{ relative_path = $Matches[2]; sha256 = $Matches[1] }
    }
    if ($assets.Count -eq 0) { throw "Workspace asset manifest is empty." }
    return $assets
}

function assert_typora_workspace_assets {
    param([string]$asset_root, [object[]]$assets)
    foreach ($asset in $assets) {
        $asset_path = Join-Path $asset_root $asset.relative_path
        if (-not (Test-Path -LiteralPath $asset_path -PathType Leaf) -or
            (Get-FileHash -LiteralPath $asset_path -Algorithm SHA256).Hash -ne $asset.sha256) {
            throw "Workspace asset is missing or differs from its pinned release: $asset_path"
        }
    }
}

function backup_typora_workspace {
    param([string]$asset_root, [string]$backup_root, [object[]]$assets)
    $records = @()
    foreach ($asset in $assets) {
        $target_path = Join-Path $asset_root $asset.relative_path
        $backup_path = Join-Path $backup_root $asset.relative_path
        $existed = Test-Path -LiteralPath $target_path -PathType Leaf
        if (Test-Path -LiteralPath $target_path -PathType Container) { throw "Asset target is a directory: $target_path" }
        if ($existed) {
            New-Item -ItemType Directory -Force -Path (Split-Path -Parent $backup_path) | Out-Null
            Copy-Item -LiteralPath $target_path -Destination $backup_path
        }
        $records += [pscustomobject]@{ relative_path = $asset.relative_path; existed = $existed }
    }
    return $records
}

function install_typora_workspace {
    param([string]$vendor_root, [string]$asset_root, [object[]]$assets)
    foreach ($asset in $assets) {
        $target_path = Join-Path $asset_root $asset.relative_path
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target_path) | Out-Null
        # 相同版本的原生模块可能已被运行窗口加载，摘要一致时无需覆盖。
        if (-not (Test-Path -LiteralPath $target_path -PathType Leaf) -or (Get-FileHash -LiteralPath $target_path -Algorithm SHA256).Hash -ne $asset.sha256) {
            Copy-Item -LiteralPath (Join-Path $vendor_root $asset.relative_path) -Destination $target_path -Force
        }
    }
    assert_typora_workspace_assets -asset_root $asset_root -assets $assets
}

function assert_typora_workspace_backup {
    param([string]$backup_root, [object[]]$records)
    foreach ($record in $records) {
        if ($record.relative_path -notmatch '^(?:[0-9.]+/(?:(?:locales/)?[a-zA-Z0-9._-]+|(?:node-pty/(?:[a-zA-Z0-9_-]+/)*[a-zA-Z0-9._-]+|terminal_broker.cjs))|node/[0-9.]+/(?:node.exe|LICENSE))$' -or
            $record.relative_path.Contains('..')) { throw "Invalid workspace backup path." }
        if ($record.existed -and -not (Test-Path -LiteralPath (Join-Path $backup_root $record.relative_path) -PathType Leaf)) {
            throw "Workspace backup is missing: $($record.relative_path)"
        }
    }
}

function restore_typora_workspace {
    param([string]$asset_root, [string]$backup_root, [object[]]$records, [string]$timestamp)
    assert_typora_workspace_backup -backup_root $backup_root -records $records
    foreach ($record in $records) {
        $target_path = Join-Path $asset_root $record.relative_path
        if ($record.existed) {
            New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target_path) | Out-Null
            $saved_path = Join-Path $backup_root $record.relative_path
            if (-not (Test-Path -LiteralPath $target_path -PathType Leaf) -or (Get-FileHash -LiteralPath $target_path -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $saved_path -Algorithm SHA256).Hash) {
                Copy-Item -LiteralPath $saved_path -Destination $target_path -Force
            }
        } elseif (Test-Path -LiteralPath $target_path -PathType Leaf) {
            Move-Item -LiteralPath $target_path -Destination (Join-Path (Split-Path -Parent $target_path) ("disabled_" + [guid]::NewGuid().ToString('N')))
        }
    }
}

# 终端与工作区共用逐文件校验、备份、复制和回滚，清单限定在版本目录内。
function get_typora_terminal_assets {
    param([string]$vendor_root)
    $assets = @()
    foreach ($line in [IO.File]::ReadAllLines((Join-Path $vendor_root 'SHA256SUMS'))) {
        if ($line -notmatch '^([a-f0-9]{64})  ([0-9.]+/(?:node-pty/(?:[a-zA-Z0-9_-]+/)*[a-zA-Z0-9._-]+|terminal_broker.cjs))$' -or $Matches[2].Contains('..')) { throw 'Invalid terminal asset manifest.' }
        $assets += [pscustomobject]@{ relative_path = $Matches[2]; sha256 = $Matches[1] }
    }
    if ($assets.Count -eq 0) { throw 'Terminal asset manifest is empty.' }
    return $assets
}
