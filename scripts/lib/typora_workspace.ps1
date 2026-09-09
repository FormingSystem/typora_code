function get_typora_workspace_assets {
    param([string]$vendor_root)
    $assets = @()
    foreach ($line in [System.IO.File]::ReadAllLines((Join-Path $vendor_root "SHA256SUMS"))) {
        if ($line -notmatch '^([a-f0-9]{64})  ((?:loader\.(?:js|json))|(?:[0-9.]+/(?:locales/)?[a-zA-Z0-9._-]+))$') {
            throw "Invalid workspace asset manifest entry: $line"
        }
        if ($Matches[2].Contains('..')) { throw "Invalid workspace asset path." }
        $assets += [pscustomobject]@{ relative_path = $Matches[2]; sha256 = $Matches[1] }
    }
    if ($assets.Count -eq 0) { throw "Workspace asset manifest is empty." }
    return $assets
}

function get_typora_community_plugin_assets {
    param([string]$plugin_root)
    $assets = @()
    foreach ($line in [System.IO.File]::ReadAllLines((Join-Path $plugin_root "SHA256SUMS"))) {
        if ($line -notmatch '^([a-f0-9]{64})  (main\.js|manifest\.json|style\.css)$') {
            throw "Invalid community plugin asset manifest entry: $line"
        }
        $assets += [pscustomobject]@{ relative_path = $Matches[2]; sha256 = $Matches[1] }
    }
    if ($assets.Count -ne 3 -or @($assets.relative_path | Sort-Object -Unique).Count -ne 3) { throw "Community plugin asset manifest must contain main.js, manifest.json and style.css." }
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
        if ($record.relative_path -notmatch '^(?:(?:loader\.(?:js|json))|(?:main\.js|manifest\.json|style\.css)|[0-9.]+/(?:(?:locales/)?[a-zA-Z0-9._-]+|(?:node-pty/(?:[a-zA-Z0-9_-]+/)*[a-zA-Z0-9._-]+|terminal_broker.cjs))|node/[0-9.]+/(?:node.exe|LICENSE))$' -or
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

# 只合并本插件的启用项；卸载不撤销用户后来修改的其他插件设置。
function update_typora_plugin_settings {
    param([string]$settings_path, [string]$backup_path, [ValidateSet('enable', 'restore')][string]$operation)
    $plugin_id = 'forming_system.linux_note_enhancements'
    $settings = [pscustomobject]@{}
    if (Test-Path -LiteralPath $settings_path -PathType Leaf) {
        $settings = [IO.File]::ReadAllText($settings_path, [Text.Encoding]::UTF8) | ConvertFrom-Json
        if ($null -eq $settings -or $settings -isnot [pscustomobject]) { throw 'Plugin settings must be a JSON object.' }
    }
    if ($operation -eq 'enable') {
        $settings | Add-Member -NotePropertyName $plugin_id -NotePropertyValue $true -Force
    } else {
        $previous = [pscustomobject]@{}
        if (Test-Path -LiteralPath $backup_path -PathType Leaf) {
            $previous = [IO.File]::ReadAllText($backup_path, [Text.Encoding]::UTF8) | ConvertFrom-Json
            if ($null -eq $previous -or $previous -isnot [pscustomobject]) { throw 'Plugin settings backup must be a JSON object.' }
        }
        $property = $previous.PSObject.Properties[$plugin_id]
        if ($null -ne $property) { $settings | Add-Member -NotePropertyName $plugin_id -NotePropertyValue $property.Value -Force }
        else { $settings.PSObject.Properties.Remove($plugin_id) }
    }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $settings_path) | Out-Null
    [IO.File]::WriteAllText($settings_path, ($settings | ConvertTo-Json -Depth 100), [Text.UTF8Encoding]::new($false))
}
