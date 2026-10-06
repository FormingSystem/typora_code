[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$vswhere=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$visual_studio=(& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath | Select-Object -First 1)
if(!$visual_studio){throw 'MSVC x64 build tools are required to rebuild the Windows shell adapter.'}
$vcvars=Join-Path $visual_studio 'VC/Auxiliary/Build/vcvars64.bat'
$output=Join-Path $root 'enhancements/native/windows_x64'
$work=Join-Path $root '.cache/shell_native_build'
[IO.Directory]::CreateDirectory($output)|Out-Null
[IO.Directory]::CreateDirectory($work)|Out-Null
$source=Join-Path $PSScriptRoot 'native/typora_shell.cpp'
Push-Location $work
try {
    foreach($target in @(@('typora_shell.dll','/LD'),@('typora_shell_host.exe','/DTYPORA_SHELL_HOST'))) {
        $file=Join-Path $output $target[0]
        $subsystem=if($target[0].EndsWith('.exe')){'/SUBSYSTEM:WINDOWS'}else{'/DEF:"'+(Join-Path $PSScriptRoot 'native/typora_shell.def')+'" /IMPLIB:"'+(Join-Path $work 'typora_shell.lib')+'"'}
        $command='""'+$vcvars+'" >nul && cl.exe /nologo /std:c++17 /EHsc /MT /O1 /utf-8 /Brepro '+$target[1]+' "'+$source+'" /Fe:"'+$file+'" /link /Brepro /INCREMENTAL:NO '+$subsystem+' ole32.lib shell32.lib shlwapi.lib uuid.lib"'
        & $env:ComSpec /d /s /c $command
        if($LASTEXITCODE -ne 0){throw 'Native shell compilation failed.'}
    }
    $hashes=[ordered]@{}
    foreach($name in @('typora_shell.dll','typora_shell_host.exe')){$hashes[$name]=(Get-FileHash -LiteralPath (Join-Path $output $name) -Algorithm SHA256).Hash.ToLowerInvariant()}
    $hash=[Security.Cryptography.SHA256]::Create()
    try {$source_hash=([BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes([IO.File]::ReadAllText($source).Replace("`r`n","`n"))))).Replace('-','').ToLowerInvariant()}finally{$hash.Dispose()}
    [IO.File]::WriteAllText((Join-Path $output 'build.json'),([ordered]@{schema=1;architecture='x64';compiler='MSVC /MT /O1 /Brepro';source_sha256=$source_hash;files=$hashes}|ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))
} finally {Pop-Location}
