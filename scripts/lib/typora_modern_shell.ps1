Set-StrictMode -Version Latest

function get_typora_modern_package {
    return @(Get-AppxPackage -Name 'TyporaCode.ShellDevelopment' -ErrorAction Stop)
}

function assert_typora_modern_owner {
    param($current,$expected)
    if(@($current).Count -gt 1){throw 'Multiple TyporaCode development shell packages were found.'}
    if(@($current).Count -and (!$expected -or $current[0].PackageFullName -cne $expected.package_full_name -or $current[0].InstallLocation -ine $expected.path)){throw 'The modern shell package belongs to another installation; preserved.'}
    if(!$expected){return}
    if(@($expected.files.PSObject.Properties).Count -ne 5){throw 'Incomplete modern shell receipt.'}
    foreach($file in $expected.files.PSObject.Properties){
        if($file.Name -notin @('AppxManifest.xml','typora_shell.dll','typora_shell_host.exe','shell.png','shell_config.ini')){throw 'Invalid modern shell receipt.'}
        $path=Join-Path $expected.path $file.Name
        if(!(Test-Path -LiteralPath $path) -or (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ine $file.Value){throw 'The modern shell package was modified externally; preserved.'}
    }
}

function restore_typora_modern_package {
    param($expected,$desired)
    $current=@(get_typora_modern_package)
    assert_typora_modern_owner $current $expected
    if($current.Count){Remove-AppxPackage -Package $current[0].PackageFullName -ErrorAction Stop}
    if($desired){Add-AppxPackage -Register (Join-Path $desired.path 'AppxManifest.xml') -ExternalLocation $desired.path -ErrorAction Stop}
}

function set_typora_modern_package {
    param([string]$user_data,[string]$typora_root,[bool]$file_menu,[bool]$folder_menu,$previous,[bool]$enabled)
    $current=@(get_typora_modern_package)
    assert_typora_modern_owner $current $previous
    if(!$enabled -or (!$file_menu -and !$folder_menu)){
        if($current.Count){Remove-AppxPackage -Package $current[0].PackageFullName -ErrorAction Stop}
        return $null
    }
    $development=[Microsoft.Win32.Registry]::GetValue('HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock','AllowDevelopmentWithoutDevLicense',0)
    $build=[int][Microsoft.Win32.Registry]::GetValue('HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion','CurrentBuildNumber','0')
    if($development -ne 1 -or $build -lt 22000 -or $env:PROCESSOR_ARCHITECTURE -ne 'AMD64'){throw 'This unsigned modern-menu candidate requires existing Windows 11 x64 Developer Mode. No security settings were changed. Use modern_menu off for the traditional menu.'}
    $assets=Join-Path $user_data 'typora_code/assets/shell_windows_x64'
    $metadata=[IO.File]::ReadAllText((Join-Path $assets 'build.json'),[Text.Encoding]::UTF8)|ConvertFrom-Json
    foreach($name in @('typora_shell.dll','typora_shell_host.exe')){
        if((Get-FileHash -LiteralPath (Join-Path $assets $name) -Algorithm SHA256).Hash -ine $metadata.files.$name){throw 'The installed native shell assets failed verification.'}
    }
    $config="[shell]`r`nexecutable=$(Join-Path $typora_root 'Typora.exe')`r`nfile_menu=$([int]$file_menu)`r`nfolder_menu=$([int]$folder_menu)`r`n"
    $hash=[Security.Cryptography.SHA256]::Create()
    try {$identity=([BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($config+([IO.File]::ReadAllText((Join-Path $assets 'build.json')))+(Get-FileHash -LiteralPath (Join-Path $assets 'appx_manifest.xml')).Hash)))).Replace('-','').ToLowerInvariant()} finally {$hash.Dispose()}
    $prefix=Join-Path $user_data ('typora_code/shell_development/'+$identity.Substring(0,16)+'-')
    $destination=if($previous -and $previous.identity -ceq $identity -and $previous.path.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){$previous.path}else{$prefix+[guid]::NewGuid().ToString('N').Substring(0,16)}
    if(!$previous -or $previous.path -ine $destination){
        if(Test-Path -LiteralPath $destination){throw 'An unowned shell staging directory already exists; preserved.'}
        [IO.Directory]::CreateDirectory($destination)|Out-Null
        foreach($name in @('typora_shell.dll','typora_shell_host.exe')){[IO.File]::Copy((Join-Path $assets $name),(Join-Path $destination $name))}
        [IO.File]::Copy((Join-Path $assets 'appx_manifest.xml'),(Join-Path $destination 'AppxManifest.xml'))
        [IO.File]::WriteAllText((Join-Path $destination 'shell_config.ini'),$config,[Text.Encoding]::Unicode)
        Add-Type -AssemblyName System.Drawing
        $icon=[Drawing.Icon]::ExtractAssociatedIcon((Join-Path $typora_root 'Typora.exe'))
        try {$bitmap=$icon.ToBitmap();try {$bitmap.Save((Join-Path $destination 'shell.png'),[Drawing.Imaging.ImageFormat]::Png)}finally{$bitmap.Dispose()}}finally{$icon.Dispose()}
    }
    $files=[ordered]@{}
    foreach($name in @('AppxManifest.xml','typora_shell.dll','typora_shell_host.exe','shell.png','shell_config.ini')){$files[$name]=(Get-FileHash -LiteralPath (Join-Path $destination $name) -Algorithm SHA256).Hash.ToLowerInvariant()}
    if($previous -and $previous.path -ieq $destination -and $current.Count){return $previous}
    $next=$null
    try {
        if($current.Count){Remove-AppxPackage -Package $current[0].PackageFullName -ErrorAction Stop}
        Add-AppxPackage -Register (Join-Path $destination 'AppxManifest.xml') -ExternalLocation $destination -ErrorAction Stop
        $registered=@(get_typora_modern_package)
        if($registered.Count -ne 1 -or $registered[0].InstallLocation -ine $destination){throw 'Modern shell registration could not be verified.'}
        $next=[pscustomobject]@{path=$destination;identity=$identity;package_full_name=$registered[0].PackageFullName;files=[pscustomobject]$files}
        return $next
    } catch {
        $failure=$_
        $partial=@(get_typora_modern_package | Where-Object {$_.InstallLocation -ieq $destination})
        foreach($package in $partial){Remove-AppxPackage -Package $package.PackageFullName -ErrorAction Stop}
        if($previous){Add-AppxPackage -Register (Join-Path $previous.path 'AppxManifest.xml') -ExternalLocation $previous.path -ErrorAction Stop}
        throw $failure
    }
}
