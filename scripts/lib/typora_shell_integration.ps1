Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot 'typora_modern_shell.ps1')

function get_typora_shell_state {
    param([string]$user_data)
    $file = Join-Path $user_data 'typora_code_shell.json'
    if (Test-Path -LiteralPath $file) {
        $state = [IO.File]::ReadAllText($file, [Text.Encoding]::UTF8) | ConvertFrom-Json
        if ($state.schema -ne 1) { throw 'Unsupported shell integration receipt.' }
        return $state
    }
    return [pscustomobject]@{ schema=1; typora_root=''; path_owned=$false; add_path=$false; file_menu=$false; folder_menu=$false; menus=@() }
}

function get_typora_shell_menu {
    param([Microsoft.Win32.RegistryKey]$registry, [string]$key_path)
    $key = $registry.OpenSubKey($key_path)
    if ($null -eq $key) { return $null }
    try {
        $command = $key.OpenSubKey('command')
        try {
            return [pscustomobject]@{ label=$key.GetValue(''); icon=$key.GetValue('Icon'); command=$(if ($command) {$command.GetValue('')} else {''}); values=@($key.GetValueNames()); children=@($key.GetSubKeyNames()); command_values=$(if ($command) {@($command.GetValueNames())} else {@()}) }
        } finally { if ($command) {$command.Dispose()} }
    } finally { $key.Dispose() }
}

function test_typora_owned_menu {
    param($menu, $expected)
    return ($null -ne $menu -and $menu.label -ceq $expected.label -and $menu.icon -ceq $expected.icon -and $menu.command -ceq $expected.command -and @($menu.values | Where-Object {$_ -notin @('', 'Icon')}).Count -eq 0 -and @($menu.children | Where-Object {$_ -ne 'command'}).Count -eq 0 -and @($menu.command_values | Where-Object {$_ -ne ''}).Count -eq 0)
}

function set_typora_shell_menu {
    param([Microsoft.Win32.RegistryKey]$registry, [string]$key_path, $menu)
    if ($null -eq $menu) { $registry.DeleteSubKeyTree($key_path, $false); return }
    $key = $registry.CreateSubKey($key_path)
    try {
        $key.SetValue('', $menu.label, [Microsoft.Win32.RegistryValueKind]::String)
        $key.SetValue('Icon', $menu.icon, [Microsoft.Win32.RegistryValueKind]::String)
        $command = $key.CreateSubKey('command')
        try { $command.SetValue('', $menu.command, [Microsoft.Win32.RegistryValueKind]::String) } finally { $command.Dispose() }
    } finally { $key.Dispose() }
}

function invoke_typora_shell_transaction {
    param([string]$typora_root, [string]$user_data, [bool]$add_path, [bool]$file_menu, [bool]$folder_menu,
        [Microsoft.Win32.RegistryKey]$registry = [Microsoft.Win32.Registry]::CurrentUser,
        [string]$classes_key = 'Software\Classes', [string]$environment_key = 'Environment', [switch]$remove,
        [ValidateSet('keep','on','off')][string]$modern_menu='keep')
    $receipt = Join-Path $user_data 'typora_code_shell.json'
    if ($remove -and !(Test-Path -LiteralPath $receipt)) {return}
    $old = get_typora_shell_state $user_data
    $old_modern=if($old.PSObject.Properties['modern_package']){$old.modern_package}else{$null}
    $modern_enabled=if($modern_menu -eq 'keep'){$old.PSObject.Properties['modern_menu'] -and $old.modern_menu}else{$modern_menu -eq 'on'}
    if($remove){$modern_enabled=$false}
    if(($modern_enabled -or $old_modern) -and ($registry.Name -ne 'HKEY_CURRENT_USER' -or $classes_key -ne 'Software\Classes' -or $environment_key -ne 'Environment')){throw 'Modern registration requires the real current-user shell scope.'}
    if ($remove) {
        if ($old.typora_root -and $typora_root -and $old.typora_root -ine $typora_root) { return }
        $typora_root = $old.typora_root
        $add_path=$false; $file_menu=$false; $folder_menu=$false
    } else {
        $typora_root = [IO.Path]::GetFullPath($typora_root).TrimEnd('\')
        if ($typora_root -match '[;"\r\n\x00]' -or !(Test-Path -LiteralPath (Join-Path $typora_root 'Typora.exe') -PathType Leaf)) { throw 'Select an existing Typora installation with a PATH-compatible directory.' }
    }
    $environment = $registry.CreateSubKey($environment_key)
    $previous_path = $environment.GetValue('Path', $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
    $path_kind = if ($null -ne $previous_path) {$environment.GetValueKind('Path')} else {[Microsoft.Win32.RegistryValueKind]::ExpandString}
    $old_receipt = if (Test-Path -LiteralPath $receipt) {[IO.File]::ReadAllBytes($receipt)} else {$null}
    $changed = [Collections.Generic.List[object]]::new()
    $modern_changed=$false
    $next_modern=$old_modern
    try {
        $segments = @(([string]$previous_path).Split(';'))
        if ($old.path_owned -and $old.typora_root -and (!$add_path -or $old.typora_root -ine $typora_root)) {
            $segments = @($segments | Where-Object { $_.Trim().Trim('"').TrimEnd('\') -ine $old.typora_root })
        }
        $path_owned = $add_path -and $old.path_owned -and $old.typora_root -ieq $typora_root
        if ($add_path -and !@($segments | Where-Object { $_.Trim().Trim('"').TrimEnd('\') -ieq $typora_root }).Count) {
            $segments = @($segments | Where-Object {$_ -ne ''}) + @($typora_root); $path_owned=$true
        }
        $menus = @()
        # A directory separator before the closing quote would escape that quote in Windows argv parsing.
        foreach ($entry in @(@('*','%1',$file_menu), @('Directory','%1\.',$folder_menu), @('Directory\Background','%V\.',$folder_menu))) {
            $key_path = "$classes_key\$($entry[0])\shell\TyporaCode"
            $current = get_typora_shell_menu $registry $key_path
            $owned = @($old.menus | Where-Object {$_.key -ceq $key_path} | Select-Object -First 1)
            $matches = $owned.Count -eq 1 -and (test_typora_owned_menu $current $owned[0])
            if ($current -and !$matches) {
                if ($entry[2]) { throw "The shell menu was changed outside TyporaCode; preserved: $key_path" }
                continue
            }
            $next = $null
            if ($entry[2]) {
                $launch_mode=if($entry[0] -eq '*'){''}else{' --new'}
                $next = [pscustomobject]@{key=$key_path;label='Open with Typora Code';icon=('"'+(Join-Path $typora_root 'Typora.exe')+'"');command=('"'+(Join-Path $typora_root 'Typora.exe')+'"'+$launch_mode+' "'+$entry[1]+'"')}
                $menus += $next
            }
            if ($current -or $next) { $changed.Add([pscustomobject]@{key=$key_path;before=$current;after=$next}); set_typora_shell_menu $registry $key_path $next }
        }
        $next_path = $segments -join ';'
        if ($next_path -cne [string]$previous_path) { $environment.SetValue('Path', $next_path, $path_kind) }
        if($modern_enabled -or $old_modern){
            $next_modern=set_typora_modern_package -user_data $user_data -typora_root $typora_root -file_menu $file_menu -folder_menu $folder_menu -previous $old_modern -enabled ([bool]$modern_enabled)
            $modern_changed=$true
        }
        $state = [ordered]@{schema=1;typora_root=$typora_root;path_owned=[bool]$path_owned;add_path=$add_path;file_menu=$file_menu;folder_menu=$folder_menu;menus=@($menus);modern_menu=[bool]$modern_enabled;modern_package=$next_modern}
        [IO.Directory]::CreateDirectory($user_data) | Out-Null
        $temporary = $receipt + '.' + [Guid]::NewGuid().ToString('N') + '.tmp'
        try {
            [IO.File]::WriteAllText($temporary, ($state | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
            if (Test-Path -LiteralPath $receipt) {[IO.File]::Replace($temporary,$receipt,($temporary+'.previous'),$true);[IO.File]::Delete($temporary+'.previous')} else {[IO.File]::Move($temporary,$receipt)}
        } finally {if (Test-Path -LiteralPath $temporary) {[IO.File]::Delete($temporary)}}
    } catch {
        $failure=$_
        $modern_rollback_error=$null
        if($modern_changed){try{restore_typora_modern_package $next_modern $old_modern}catch{$modern_rollback_error=$_}}
        for ($index=$changed.Count-1; $index -ge 0; $index--) {set_typora_shell_menu $registry $changed[$index].key $changed[$index].before}
        if ($null -eq $previous_path) {$environment.DeleteValue('Path',$false)} else {$environment.SetValue('Path',$previous_path,$path_kind)}
        if ($null -ne $old_receipt) {[IO.File]::WriteAllBytes($receipt,$old_receipt)}
        if($modern_rollback_error){throw ('Shell integration failed: '+$failure.Exception.Message+'; package rollback also failed: '+$modern_rollback_error.Exception.Message)}
        throw $failure
    } finally { $environment.Dispose() }
    if ($environment_key -eq 'Environment' -and $next_path -cne [string]$previous_path) {
        if (-not ('typora_shell_notifications' -as [type])) {
            Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class typora_shell_notifications {
    [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    public static extern IntPtr SendMessageTimeout(IntPtr hwnd, uint msg, UIntPtr wparam, string lparam, uint flags, uint timeout, out UIntPtr result);
}
'@
        }
        $broadcast_result=[UIntPtr]::Zero
        $null=[typora_shell_notifications]::SendMessageTimeout([IntPtr]0xffff,0x1a,[UIntPtr]::Zero,'Environment',2,1000,[ref]$broadcast_result)
    }
}

function set_typora_shell_integration {
    param([string]$typora_root, [string]$user_data, [bool]$add_path, [bool]$file_menu, [bool]$folder_menu,
        [Microsoft.Win32.RegistryKey]$registry = [Microsoft.Win32.Registry]::CurrentUser,
        [string]$classes_key = 'Software\Classes', [string]$environment_key = 'Environment', [switch]$remove,
        [ValidateSet('keep','on','off')][string]$modern_menu='keep')
    $identity=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $mutex=[Threading.Mutex]::new($false,('Local\TyporaCodeShell_'+$identity))
    $locked=$false
    try {
        try {$locked=$mutex.WaitOne(0)} catch [Threading.AbandonedMutexException] {$locked=$true}
        if (!$locked) {throw 'Another Typora Code shell integration operation is running.'}
        invoke_typora_shell_transaction @PSBoundParameters
    } finally {if ($locked) {$mutex.ReleaseMutex()};$mutex.Dispose()}
}
