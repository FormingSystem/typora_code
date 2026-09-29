. (Join-Path $PSScriptRoot 'typora_locale.ps1')
# Rotate verifiable ownership product upgrade backups; native baseline, explicit directory and unknown content are retained.
function assert_typora_retained_backup {
    param([string]$backup, [string]$user_data, [string]$typora_root)
    $parent = [IO.Path]::GetFullPath((Join-Path $user_data 'backups/typora_code_configuration')).TrimEnd('\','/')
    if ((Split-Path -Parent ([IO.Path]::GetFullPath($backup))) -ne $parent) { throw 'Backup is outside the automatic backup directory.' }
    $manifest_path = resolve_typora_asset_path $backup 'manifest.json'
    $manifest = [IO.File]::ReadAllText($manifest_path,[Text.Encoding]::UTF8) | ConvertFrom-Json
    if ($manifest.schema_version -notin @(3,4) -or
        [IO.Path]::GetFullPath($manifest.user_data) -ne [IO.Path]::GetFullPath($user_data) -or
        [IO.Path]::GetFullPath($manifest.typora_root) -ne [IO.Path]::GetFullPath($typora_root)) { throw 'Backup ownership differs.' }
    if ($manifest.PSObject.Properties.Name -contains 'retention') {
        if ($manifest.retention.schema -ne 1 -or $manifest.retention.kind -notin @('baseline','upgrade')) { throw 'Unsupported backup retention marker.' }
    } else {
        # Only identify complete product upgrade from old standard installer; do not infer ownership based on age or directory list alone.
        $saved_source = [IO.File]::ReadAllText((resolve_typora_asset_path $backup 'window.html'),[Text.Encoding]::UTF8)
        $product_entry = @($manifest.product | Where-Object { $_.relative_path -eq 'workbench.js' -and $_.existed })
        if ((Split-Path -Leaf $backup) -notmatch '^\d{8}-\d{6}-\d{3}-[a-f0-9]{32}$' -or $product_entry.Count -ne 1 -or
            ([regex]::Matches($saved_source,'<script\b[^>]*\bsrc=["'']typora://app/userData/typora_code/workbench\.js["''][^>]*>')).Count -ne 1) {
            throw (get_typora_text -key 'the_old_backup_is_not_a_verified_typoracode_upgrade_native_or_un')
        }
        $manifest | Add-Member -NotePropertyName retention -NotePropertyValue ([pscustomobject]@{schema=1;kind='upgrade'})
    }
    $expected = @{}
    $expected[$manifest_path] = $true
    $window = resolve_typora_asset_path $backup 'window.html'
    if ((Get-FileHash -LiteralPath $window -Algorithm SHA256).Hash -ne $manifest.window_sha256) { throw 'Backup window digest differs.' }
    $expected[$window] = $true
    foreach ($scope in @('product','migration','terminal','settings','theme','native_profile')) {
        if ($scope -eq 'native_profile' -and $manifest.schema_version -eq 3 -and $manifest.PSObject.Properties.Name -notcontains $scope) { continue }
        $records = @($manifest.$scope)
        assert_typora_record_scope $records $scope
        assert_typora_workspace_backup (Join-Path $backup $scope) $records
        foreach ($record in $records) { if ($record.existed) { $expected[(resolve_typora_asset_path $backup ($scope+'/'+$record.relative_path))] = $true } }
    }
    # Enumerate layer by layer, reject links first, then enter the directory; additional user files may cause the entire backup to exit the auto-reclamation process.
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
            # Paths, ownership, list, and summary have been checked; the current successful transaction is still protected by the installation mutex.
            Remove-Item -LiteralPath $entry.FullName -Recurse -Force
            & $report ((get_typora_text -key 'removed_old_automatic_upgrade_backup') + $entry.Name)
        } catch { & $report ((get_typora_text -key 'backup_preserved_automatic_cleanup_skipped') + $entry.Name + '；' + $_.Exception.Message) }
    }
}
