# 所有清单路径均相对于专属资产目录；恢复清单不能逃逸到外部文件。
function resolve_typora_asset_path {
    param([string]$asset_root, [string]$relative_path)
    if ($relative_path -notmatch '^[a-zA-Z0-9_-][a-zA-Z0-9_./-]*$' -or $relative_path.Contains('..') -or $relative_path.EndsWith('/')) { throw 'Invalid asset path.' }
    foreach ($segment in $relative_path.Split('/')) { if (-not $segment -or $segment -eq '.' -or $segment.EndsWith('.')) { throw 'Non-canonical asset path.' } }
    $resolved_root = [IO.Path]::GetFullPath($asset_root).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
    $resolved_target = [IO.Path]::GetFullPath((Join-Path $asset_root $relative_path))
    if (-not $resolved_target.StartsWith($resolved_root, [StringComparison]::OrdinalIgnoreCase)) { throw 'Asset path escapes its root.' }
    $current_path = $resolved_target
    while ($current_path) {
        if (Test-Path -LiteralPath $current_path) {
            if ((Get-Item -LiteralPath $current_path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Linked asset path is not allowed: $current_path" }
        }
        $current_path = Split-Path -Parent $current_path
    }
    return $resolved_target
}

function get_typora_workspace_assets {
    param([string]$vendor_root)
    $assets = @()
    $seen = @{}
    foreach ($line in [IO.File]::ReadAllLines((Join-Path $vendor_root 'SHA256SUMS'))) {
        if ($line -notmatch '^([a-f0-9]{64})  ([a-zA-Z0-9_./-]+)$') { throw 'Invalid workspace asset manifest.' }
        $relative_path = $Matches[2]; $digest = $Matches[1]
        $null = resolve_typora_asset_path $vendor_root $relative_path
        if ($relative_path -notmatch '^(?:workspace_core\.(?:js|css)|workspace\.css|workbench\.js|(?:assets|locales|licenses)/[a-zA-Z0-9_./-]+)$' -or $seen.ContainsKey($relative_path)) { throw 'Invalid or duplicate workspace asset.' }
        $seen[$relative_path] = $true
        $assets += [pscustomobject]@{ relative_path = $relative_path; sha256 = $digest }
    }
    foreach ($required in @('workspace_core.js','workspace_core.css','workspace.css','workbench.js')) {
        if (-not $seen.ContainsKey($required)) { throw "Required startup asset is missing: $required" }
    }
    return $assets
}

function get_typora_migration_assets {
    # 仅清理由旧安装器部署的十个入口和运行文件，其他用户文件不属于迁移目标。
    return @('loader.js','loader.json','2.10.15/core.js','2.10.15/core.css',
        '2.10.15/locales/lang.de.json','2.10.15/locales/lang.en.json','2.10.15/locales/lang.zh-cn.json',
        'plugins/forming_system.linux_note_enhancements/main.js','plugins/forming_system.linux_note_enhancements/manifest.json','plugins/forming_system.linux_note_enhancements/style.css') |
        ForEach-Object { [pscustomobject]@{relative_path = $_} }
}

function get_typora_retired_product_assets {
    # 仅退休已发布的确定文件；由安装事务统一备份、移除和恢复，不扫描资产目录。
    return @('appearance_bootstrap.js',
        'assets/source_symbols/tree-sitter-c.wasm','assets/source_symbols/tree-sitter-cpp.wasm',
        'assets/source_symbols/LICENSE_c','assets/source_symbols/LICENSE_cpp') |
        ForEach-Object { [pscustomobject]@{relative_path = $_} }
}

function assert_typora_migration_available {
    param([string]$user_data)
    $settings_path = Join-Path $user_data 'plugins/settings/plugins.json'
    if (Test-Path -LiteralPath $settings_path -PathType Container) { throw 'Previous plugin settings path is a directory.' }
    if (Test-Path -LiteralPath $settings_path -PathType Leaf) {
        $settings = [IO.File]::ReadAllText($settings_path, [Text.Encoding]::UTF8) | ConvertFrom-Json
        if ($settings -isnot [pscustomobject]) { throw 'Previous plugin settings must be a JSON object.' }
        $other = @($settings.PSObject.Properties | Where-Object { $_.Name -ne 'forming_system.linux_note_enhancements' -and ($_.Value -is [bool] -and $_.Value) })
        if ($other.Count) { throw "Other enabled community plugins depend on the previous runtime: $($other.Name -join ', '). Disable them before installing the independent workbench." }
    }
}

function get_typora_window_source {
    param([string]$window_source, [string]$head_source)
    if (([regex]::Matches($window_source, '</head>', 'IgnoreCase')).Count -ne 1) { throw 'Expected one </head>; no files changed.' }
    $window_source = [regex]::Replace($window_source, '(?s)<!-- typora-code:begin -->.*?<!-- typora-code:end -->\s*', '')
    $window_source = [regex]::Replace($window_source, '<script\s+src="typora://app/userData/plugins/loader\.js"\s+type="module"></script>', '')
    $window_source = [regex]::Replace($window_source, '<script\s+defer\s+src="typora://app/userData/linux_note_enhancements/typora_enhancements\.js"\s+data-linux-note-enhancements="true"></script>', '')
    return [regex]::Replace($window_source, '</head>', [System.Text.RegularExpressions.MatchEvaluator]{ param($match) $head_source.TrimEnd() + "`n</head>" }, 'IgnoreCase')
}

function assert_typora_window_source {
    param([string]$window_source, [string]$head_source)
    $expected = $head_source.TrimEnd()
    if (([regex]::Matches($window_source, [regex]::Escape($expected))).Count -ne 1 -or $window_source.IndexOf($expected) -gt $window_source.ToLowerInvariant().IndexOf('</head>')) { throw 'Independent startup assets must appear exactly once in <head>.' }
    if (([regex]::Matches($window_source, 'typora://app/userData/typora_code/workbench\.js')).Count -ne 1 -or ([regex]::Matches($window_source, '<!-- typora-code:begin -->')).Count -ne 1) { throw 'Duplicate workbench startup.' }
    foreach ($filename in @('workspace_core.js','workspace_core.css','workspace.css','workbench.js')) {
        if (([regex]::Matches($window_source, [regex]::Escape('typora://app/userData/typora_code/' + $filename), 'IgnoreCase')).Count -ne 1) { throw "Duplicate or missing startup asset: $filename" }
    }
    if ($window_source.Contains('typora://app/userData/plugins/loader.js') -or $window_source.Contains('data-linux-note-enhancements="true"')) { throw 'Previous runtime entry remains active.' }
}

function assert_typora_workspace_assets {
    param([string]$asset_root, [object[]]$assets)
    foreach ($asset in $assets) {
        $asset_path = resolve_typora_asset_path $asset_root $asset.relative_path
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
        $target_path = resolve_typora_asset_path $asset_root $asset.relative_path
        $backup_path = resolve_typora_asset_path $backup_root $asset.relative_path
        $existed = Test-Path -LiteralPath $target_path -PathType Leaf
        if (Test-Path -LiteralPath $target_path -PathType Container) { throw "Asset target is a directory: $target_path" }
        if ($existed) {
            New-Item -ItemType Directory -Force -Path (Split-Path -Parent $backup_path) | Out-Null
            Copy-Item -LiteralPath $target_path -Destination $backup_path
        }
        $records += [pscustomobject]@{ relative_path = $asset.relative_path; existed = $existed; sha256 = $(if ($existed) { (Get-FileHash -LiteralPath $backup_path -Algorithm SHA256).Hash.ToLowerInvariant() } else { $null }) }
    }
    return $records
}

function install_typora_workspace {
    param([string]$vendor_root, [string]$asset_root, [object[]]$assets)
    foreach ($asset in $assets) {
        $target_path = resolve_typora_asset_path $asset_root $asset.relative_path
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
    $seen = @{}
    foreach ($record in $records) {
        $saved_path = resolve_typora_asset_path $backup_root $record.relative_path
        if ($record.existed -isnot [bool] -or $seen.ContainsKey($record.relative_path)) { throw 'Invalid or duplicate backup record.' }
        $seen[$record.relative_path] = $true
        if ($record.existed -and ($record.sha256 -notmatch '^[a-f0-9]{64}$' -or -not (Test-Path -LiteralPath $saved_path -PathType Leaf) -or
            (Get-FileHash -LiteralPath $saved_path -Algorithm SHA256).Hash -ne $record.sha256)) { throw "Workspace backup integrity check failed: $($record.relative_path)" }
    }
}

function restore_typora_workspace {
    param([string]$asset_root, [string]$backup_root, [object[]]$records, [string]$timestamp)
    assert_typora_workspace_backup -backup_root $backup_root -records $records
    foreach ($record in $records) {
        $target_path = resolve_typora_asset_path $asset_root $record.relative_path
        if ($record.existed) {
            New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target_path) | Out-Null
            $saved_path = resolve_typora_asset_path $backup_root $record.relative_path
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

# 迁移只撤销旧注册；恢复只还原该键，不影响用户之后修改的其他设置。
function update_typora_plugin_settings {
    param([string]$settings_path, [string]$backup_path, [ValidateSet('remove', 'restore')][string]$operation)
    $plugin_id = 'forming_system.linux_note_enhancements'
    $settings = [pscustomobject]@{}
    if (Test-Path -LiteralPath $settings_path -PathType Leaf) {
        $settings = [IO.File]::ReadAllText($settings_path, [Text.Encoding]::UTF8) | ConvertFrom-Json
        if ($null -eq $settings -or $settings -isnot [pscustomobject]) { throw 'Plugin settings must be a JSON object.' }
    }
    if ($operation -eq 'remove') {
        if ($null -eq $settings.PSObject.Properties[$plugin_id]) { return }
        $settings.PSObject.Properties.Remove($plugin_id)
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

function get_typora_migrated_settings {
    param([string]$user_data)
    $target = resolve_typora_asset_path $user_data 'typora_code/settings/workspace.json'
    if (Test-Path -LiteralPath $target -PathType Container) { throw 'Workspace settings path is a directory.' }
    if (Test-Path -LiteralPath $target -PathType Leaf) { return $null }
    $source = resolve_typora_asset_path $user_data 'plugins/settings/core.json'
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { return $null }
    $previous = [IO.File]::ReadAllText($source, [Text.Encoding]::UTF8) | ConvertFrom-Json
    if ($previous -isnot [pscustomobject] -or $previous.settings -isnot [pscustomobject]) { throw 'Previous core settings must contain a settings object.' }
    foreach ($key in @('internalPlugin.enabledPlugins','downloader','githubProxy')) { $previous.settings.PSObject.Properties.Remove($key) }
    if ($previous.settings.PSObject.Properties['ribbonState'] -and $previous.settings.ribbonState -is [pscustomobject]) { $previous.settings.ribbonState.PSObject.Properties.Remove('core.settings') }
    return ([ordered]@{version=1;settings=$previous.settings} | ConvertTo-Json -Depth 100)
}

function assert_typora_release {
    param([string]$tools_root)
    $source = Join-Path $tools_root 'enhancements/dist'
    $assets = @(get_typora_workspace_assets $source)
    assert_typora_workspace_assets $source $assets
    $bundle = [IO.File]::ReadAllText((Join-Path $source 'workbench.js'), [Text.Encoding]::UTF8) + [IO.File]::ReadAllText((Join-Path $source 'workspace.css'), [Text.Encoding]::UTF8)
    foreach ($marker in [IO.File]::ReadAllLines((Join-Path $tools_root 'enhancements/bundle_markers.txt'), [Text.Encoding]::UTF8)) {
        if ($marker.Trim() -and -not $bundle.Contains($marker.Trim())) { throw "Incomplete workbench release: $marker" }
    }
    return $assets
}

function assert_typora_record_scope {
    param([object[]]$records, [ValidateSet('product','migration','terminal','settings','theme','native_profile')][string]$scope)
    if ($scope -eq 'native_profile' -and ($records.Count -ne 1 -or $records[0].relative_path -ne 'profile.data')) { throw 'Invalid native profile backup scope.' }
    $migration = @(get_typora_migration_assets | ForEach-Object { $_.relative_path })
    foreach ($record in $records) {
        $valid = switch ($scope) {
            'native_profile' { $record.relative_path -eq 'profile.data' }
            'product' { $record.relative_path -match '^(appearance_bootstrap\.js|workspace_core\.(js|css)|workspace\.css|workbench\.js|SHA256SUMS|(assets|locales|licenses)/[a-zA-Z0-9_./-]+)$' }
            'migration' { $migration -contains $record.relative_path }
            'terminal' { $record.relative_path -match '^([0-9.]+/(node-pty/[a-zA-Z0-9_./-]+|terminal_broker.cjs)|node/[0-9.]+/(node.exe|LICENSE))$' }
            'settings' { $record.relative_path -eq 'plugins.json' }
            'theme' { $record.relative_path -eq 'cpp_github-consolas.css' }
        }
        if (-not $valid) { throw "Backup path is outside the managed $scope scope: $($record.relative_path)" }
    }
}

function get_typora_restore_context {
    param([string]$backup_root)
    $backup_root = (Resolve-Path -LiteralPath $backup_root).Path
    $manifest_path = resolve_typora_asset_path $backup_root 'manifest.json'
    $manifest = [IO.File]::ReadAllText($manifest_path, [Text.Encoding]::UTF8) | ConvertFrom-Json
    if ($manifest.schema_version -ne 4) { throw 'Unsupported backup schema; expected version 4.' }
    $user_data = [IO.Path]::GetFullPath((get_typora_windows_user_data))
    if ([IO.Path]::GetFullPath($manifest.user_data) -ne $user_data) { throw 'Backup belongs to another user-data directory.' }
    $root = resolve_typora_windows_root -typora_root $manifest.typora_root -non_interactive
    $window = resolve_typora_asset_path $root 'resources/window.html'
    $saved = resolve_typora_asset_path $backup_root 'window.html'
    if ($manifest.window_sha256 -notmatch '^[a-f0-9]{64}$' -or (Get-FileHash -LiteralPath $saved -Algorithm SHA256).Hash -ne $manifest.window_sha256) { throw 'Window backup integrity check failed.' }
    # 只忽略本工程拥有的入口；宿主页面其他变化必须先停止恢复。
    $current_host = get_typora_window_source ([IO.File]::ReadAllText($window, [Text.Encoding]::UTF8)) ''
    $saved_host = get_typora_window_source ([IO.File]::ReadAllText($saved, [Text.Encoding]::UTF8)) ''
    $current_host = [regex]::Replace($current_host.Replace("`r`n", "`n"), '\s*</head>', '</head>').Trim()
    $saved_host = [regex]::Replace($saved_host.Replace("`r`n", "`n"), '\s*</head>', '</head>').Trim()
    if ($current_host -cne $saved_host) { throw 'Typora startup page changed outside the managed entry. Do not restore a backup from another Typora version; reinstall Typora Code for the current version.' }
    $groups = @(
        [pscustomobject]@{name='product';root=(Join-Path $user_data 'typora_code');records=@($manifest.product)},
        [pscustomobject]@{name='migration';root=(Join-Path $user_data 'plugins');records=@($manifest.migration)},
        [pscustomobject]@{name='terminal';root=(Join-Path $user_data 'linux_note_enhancements/terminal_runtime');records=@($manifest.terminal)},
        [pscustomobject]@{name='settings';root=(Join-Path $user_data 'plugins/settings');records=@($manifest.settings)},
        [pscustomobject]@{name='theme';root=(Join-Path $user_data 'themes');records=@($manifest.theme)},
        [pscustomobject]@{name='native_profile';root=$user_data;records=@($manifest.native_profile)}
    )
    foreach ($group in $groups) {
        assert_typora_record_scope $group.records $group.name
        assert_typora_workspace_backup (Join-Path $backup_root $group.name) $group.records
        if ($group.name -eq 'native_profile' -and -not $group.records[0].existed -and (Test-Path -LiteralPath (Join-Path $backup_root 'native_profile/profile.data'))) { throw 'Unexpected native profile backup.' }
        foreach ($record in $group.records) {
            $target = resolve_typora_asset_path $group.root $record.relative_path
            if (Test-Path -LiteralPath $target -PathType Container) { throw "Restore target is a directory: $target" }
        }
    }
    return [pscustomobject]@{manifest=$manifest;backup_root=$backup_root;window=$window;groups=$groups}
}

function invoke_typora_native_profile {
    param([string]$node, [string]$tools_root, [string]$operation, [string]$target, [string]$expected='', [string]$backup_path='')
    $arguments = @((Join-Path $tools_root 'scripts/lib/typora_native_profile.cjs'), $operation, $target)
    if ($operation -in @('install','restore')) { $arguments += $expected }
    if ($operation -eq 'restore') { $arguments += $backup_path }
    $result = & $node @arguments
    if ($LASTEXITCODE -ne 0) { throw 'Native profile validation or atomic update failed.' }
    return ($result | ConvertFrom-Json)
}
