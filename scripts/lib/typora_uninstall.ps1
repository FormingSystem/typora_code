# 卸载只负责确定安装前备份；恢复校验、资产写入和回滚仍由现有事务负责。
function get_typora_uninstall_context {
    param([string]$backup_root, [string]$typora_root='')
    $backup_root = (Resolve-Path -LiteralPath (convert_typora_input_path $backup_root)).Path
    $manifest_path = resolve_typora_asset_path $backup_root 'manifest.json'
    $manifest = [IO.File]::ReadAllText($manifest_path, [Text.Encoding]::UTF8) | ConvertFrom-Json
    if ($manifest.schema_version -ne 4) { throw 'Uninstall requires a complete schema 4 installation backup.' }
    $user_data = [IO.Path]::GetFullPath((get_typora_windows_user_data))
    if ([IO.Path]::GetFullPath($manifest.user_data) -ne $user_data) { throw 'Backup belongs to another user-data directory.' }
    if ($typora_root -and [IO.Path]::GetFullPath($manifest.typora_root) -ne [IO.Path]::GetFullPath($typora_root)) {
        throw 'Backup belongs to another Typora installation.'
    }
    # 更新前备份带有常驻资产，不能把回退增强版本误当作卸载。
    foreach ($filename in @('workspace_core.js','workspace_core.css','workspace.css','workbench.js')) {
        $records = @($manifest.product | Where-Object { $_.relative_path -eq $filename })
        if ($records.Count -ne 1 -or $records[0].existed -isnot [bool] -or $records[0].existed) {
            throw 'This is not a complete pre-install backup. Use restore_windows.ps1 to roll back an update.'
        }
    }
    $saved = resolve_typora_asset_path $backup_root 'window.html'
    $saved_source = [IO.File]::ReadAllText($saved, [Text.Encoding]::UTF8)
    if ($saved_source -match 'typora-code:begin|typora://app/userData/typora_code/') {
        throw 'The saved startup page still loads Typora Code. Use restore_windows.ps1 to roll back an update.'
    }
    return get_typora_restore_context $backup_root
}

function find_typora_uninstall_backups {
    param([string]$typora_root='')
    $directory = Join-Path (get_typora_windows_user_data) 'backups/typora_code_configuration'
    if (-not (Test-Path -LiteralPath $directory -PathType Container)) { return }
    foreach ($item in Get-ChildItem -LiteralPath $directory -Directory | Sort-Object Name) {
        try {
            get_typora_uninstall_context -backup_root $item.FullName -typora_root $typora_root
        } catch {
            Write-Verbose "Skipping backup '$($item.FullName)': $($_.Exception.Message)"
        }
    }
}

function select_typora_uninstall_context {
    param([string]$typora_root='', [string]$backup_root='', [switch]$non_interactive)
    if ($backup_root) { return get_typora_uninstall_context -backup_root $backup_root -typora_root $typora_root }
    $candidates = @(find_typora_uninstall_backups -typora_root $typora_root)
    if ($candidates.Count -eq 0) {
        throw 'No valid pre-install backup was found. Pass -backup_root with the original complete backup; use -Verbose for skipped backup details. Update backups cannot uninstall Typora Code.'
    }
    if ($candidates.Count -eq 1) { return $candidates[0] }
    if ($non_interactive) {
        throw 'Several pre-install backups match. Pass -backup_root to choose one, or -typora_root to limit the installation.'
    }
    Write-Host 'Select the pre-install environment to restore:'
    for ($index = 0; $index -lt $candidates.Count; $index++) {
        $item = $candidates[$index]
        Write-Host ("[{0}] {1} | {2}" -f ($index + 1), $item.manifest.installed_at, $item.manifest.typora_root)
        Write-Host "    $($item.backup_root)"
    }
    while ($true) {
        $answer = Read-Host 'Backup number (Enter or Q cancels)'
        if ([string]::IsNullOrWhiteSpace($answer) -or $answer.Trim() -ieq 'q') { return }
        $selection = 0
        if ([int]::TryParse($answer, [ref]$selection) -and $selection -ge 1 -and $selection -le $candidates.Count) {
            return $candidates[$selection - 1]
        }
        Write-Host "Enter a number from 1 to $($candidates.Count), or leave blank to cancel."
    }
}

function assert_typora_uninstall_closed {
    param([string]$typora_root)
    $executable = Join-Path ([IO.Path]::GetFullPath($typora_root)) 'Typora.exe'
    foreach ($process in Get-Process -Name Typora -ErrorAction SilentlyContinue) {
        $process_path = $null
        try { $process_path = $process.Path } catch { }
        if (-not $process_path -or $process_path -eq $executable) {
            throw 'Save your documents and exit the target Typora before uninstalling. No process was closed and no files were changed.'
        }
    }
}

# 旧备份或宿主升级不妨碍撤销当前接入；绝不把旧window.html回灌新宿主。
function get_typora_current_uninstall_context {
    param([string]$typora_root)
    $window = resolve_typora_asset_path $typora_root 'resources/window.html'
    $bytes = [IO.File]::ReadAllBytes($window)
    $encoding = [Text.UTF8Encoding]::new($false, $true)
    $source = $encoding.GetString($bytes)
    $begin = '<!-- typora-code:begin -->'
    $end = '<!-- typora-code:end -->'
    $starts = [regex]::Matches($source, [regex]::Escape($begin))
    $ends = [regex]::Matches($source, [regex]::Escape($end))
    $reference = 'typora://app/userData/typora_code/'
    if (-not $starts.Count -and -not $ends.Count -and -not $source.Contains($reference)) {
        return [pscustomobject]@{mode='absent';typora_root=$typora_root;window=$window}
    }
    if ($starts.Count -ne 1 -or $ends.Count -ne 1 -or $ends[0].Index -lt $starts[0].Index) {
        throw 'Invalid or duplicate Typora Code startup markers; no files changed.'
    }
    $heads = [regex]::Matches($source, '<head(?:\s[^>]*)?>', 'IgnoreCase')
    $tails = [regex]::Matches($source, '</head>', 'IgnoreCase')
    $offset = $starts[0].Index
    $length = $ends[0].Index + $end.Length - $offset
    if ($heads.Count -ne 1 -or $tails.Count -ne 1 -or $offset -lt ($heads[0].Index + $heads[0].Length) -or ($offset + $length) -gt $tails[0].Index) {
        throw 'Typora Code startup entry is outside the unique head; no files changed.'
    }
    $block = $source.Substring($offset, $length)
    foreach ($name in @('workspace_core.js','workspace_core.css','workspace.css','workbench.js')) {
        if ([regex]::Matches($block, [regex]::Escape($reference + $name) + '(?=["''\s>])').Count -ne 1) {
            throw "Incomplete Typora Code startup entry: $name; no files changed."
        }
    }
    $after = $source.Remove($offset, $length)
    if ($after.Contains($reference)) { throw 'Typora Code references remain outside its managed entry; no files changed.' }
    return [pscustomobject]@{mode='detach';typora_root=$typora_root;window=$window;before=$bytes;after=$encoding.GetBytes($after);sha256=(Get-FileHash -LiteralPath $window -Algorithm SHA256).Hash}
}

function get_typora_uninstall_plan {
    param([string]$typora_root='', [string]$backup_root='', [switch]$non_interactive)
    if ($backup_root) {
        $context = get_typora_uninstall_context -backup_root $backup_root -typora_root $typora_root
    } else {
        $candidates = @(find_typora_uninstall_backups -typora_root $typora_root)
        if (-not $candidates.Count) {
            $root = resolve_typora_windows_root -typora_root $typora_root -non_interactive:$non_interactive
            return get_typora_current_uninstall_context $root
        }
        $context = select_typora_uninstall_context -typora_root $typora_root -non_interactive:$non_interactive
    }
    if ($null -eq $context) { return }
    return [pscustomobject]@{mode='restore';typora_root=$context.manifest.typora_root;context=$context}
}

function invoke_typora_current_uninstall {
    param([object]$context, [string]$user_data)
    $denied = @(get_typora_write_denials @($context.window))
    if ($denied.Count) { throw ('Uninstall needs write permission to the Typora startup page. Run uninstall_windows.cmd as administrator for this installation: ' + ($denied -join '; ')) }
    assert_typora_uninstall_closed $context.typora_root
    if ((Get-FileHash -LiteralPath $context.window -Algorithm SHA256).Hash -ne $context.sha256) { throw 'Typora startup page changed during uninstall preparation; retry. No files changed.' }
    $attempt = resolve_typora_asset_path $user_data ('backups/typora_code_uninstall/' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '-' + [guid]::NewGuid().ToString('N'))
    $records = @(backup_typora_workspace $context.typora_root $attempt @([pscustomobject]@{relative_path='resources/window.html'}))
    assert_typora_workspace_backup $attempt $records
    if ($records[0].sha256 -ne $context.sha256) { throw 'Typora startup page changed while backing up; no files changed.' }
    $receipt = [ordered]@{schema_version=1;operation='uninstall_current_entry';typora_root=$context.typora_root;user_data=$user_data;before_sha256=$context.sha256;status='prepared'}
    $receipt_path = Join-Path $attempt 'uninstall.json'
    [IO.File]::WriteAllText($receipt_path, ($receipt | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
    $temporary = Join-Path (Split-Path -Parent $context.window) ('.typora-code-uninstall-' + [guid]::NewGuid().ToString('N') + '.tmp')
    $written = $false
    try {
        [IO.File]::WriteAllBytes($temporary, $context.after)
        if ((Get-FileHash -LiteralPath $context.window -Algorithm SHA256).Hash -ne $context.sha256) { throw 'Typora startup page changed before replacement; no files changed.' }
        assert_typora_uninstall_closed $context.typora_root
        [IO.File]::Replace($temporary, $context.window, [NullString]::Value)
        $written = $true
        if ((get_typora_current_uninstall_context $context.typora_root).mode -ne 'absent') { throw 'Uninstall verification failed.' }
        $receipt.status = 'complete'
        $receipt.after_sha256 = (Get-FileHash -LiteralPath $context.window -Algorithm SHA256).Hash
        [IO.File]::WriteAllText($receipt_path, ($receipt | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
    } catch {
        $failure = $_
        if ($written) { restore_typora_workspace $context.typora_root $attempt $records '' }
        $receipt.status = 'failed'
        [IO.File]::WriteAllText($receipt_path, ($receipt | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
        throw $failure
    } finally { if ([IO.File]::Exists($temporary)) { [IO.File]::Delete($temporary) } }
    return $attempt
}
