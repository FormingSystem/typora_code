[CmdletBinding()]
param([string]$probe='', [switch]$adapter_only)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../../scripts/lib/typora_modern_shell.ps1')
if(!$adapter_only -and @(get_typora_modern_package).Count){throw 'Run before local delivery: an existing development shell package must not be replaced by tests.'}
$manager=Join-Path $PSScriptRoot 'manage_test_artifacts.py'
$artifact=(& python -X utf8 $manager create --pid $PID | Select-Object -Last 1)
if($LASTEXITCODE -ne 0){throw 'Cannot allocate owned test artifacts.'}
$state=$null;$successful=$false
function assert_true($condition,$message){if(!$condition){throw $message}}
try {
    $work=Join-Path $artifact 'work'
    $host_root=Join-Path $work 'Typora space & test'
    $profile=Join-Path $work 'profile'
    $assets=Join-Path $profile 'typora_code/assets/shell_windows_x64'
    [IO.Directory]::CreateDirectory($assets)|Out-Null
    [IO.Directory]::CreateDirectory($host_root)|Out-Null
    if(!$probe){
        $vswhere=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
        $visual_studio=(& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath | Select-Object -First 1)
        if(!$visual_studio){throw 'MSVC x64 is required for the native test probe.'}
        $vcvars=Join-Path $visual_studio 'VC/Auxiliary/Build/vcvars64.bat'
        $source=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../scripts/native/test_typora_shell.cpp'))
        $probe=Join-Path $work 'probe.exe'
        $command='""'+$vcvars+'" >nul && cl.exe /nologo /std:c++17 /EHsc /MT /O1 /utf-8 "'+$source+'" /Fe:"'+$probe+'" /Fo:"'+(Join-Path $work 'probe.obj')+'" /link ole32.lib shell32.lib shlwapi.lib uuid.lib"'
        & $env:ComSpec /d /s /c $command
        if($LASTEXITCODE -ne 0){throw 'Native test compilation failed.'}
    }
    & $probe
    assert_true ($LASTEXITCODE -eq 0) 'Native unit contracts must pass before package registration.'
    foreach($name in @('typora_shell.dll','typora_shell_host.exe','build.json','appx_manifest.xml')){[IO.File]::Copy((Join-Path $PSScriptRoot "../dist/assets/shell_windows_x64/$name"),(Join-Path $assets $name))}
    Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Text;
public class shell_target_recorder {
    public static void Main(string[] arguments) {
        string target=arguments.Length==2&&arguments[0]=="--new"?arguments[1]:arguments.Length==1?arguments[0]:"INVALID_ARGUMENT_COUNT";
        File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"arguments.txt"),target,Encoding.UTF8);
        File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"launch_mode.txt"),arguments.Length==2?arguments[0]:"file",Encoding.UTF8);
    }
}
'@ -OutputAssembly (Join-Path $host_root 'Typora.exe') -OutputType WindowsApplication
    $file=Join-Path $work ('space & '+[char]0x4e2d+[char]0x6587+'.md')
    [IO.File]::WriteAllText($file,'# Shell fixture',[Text.UTF8Encoding]::new($false))
    if($adapter_only){
        $config=Join-Path (Split-Path $probe -Parent) 'shell_config.ini'
        if(Test-Path -LiteralPath $config){throw 'Refusing to replace an existing probe configuration.'}
        try {
            [IO.File]::WriteAllText($config,"[shell]`r`nexecutable=$(Join-Path $host_root 'Typora.exe')`r`nfile_menu=1`r`nfolder_menu=1`r`n",[Text.Encoding]::Unicode)
            $empty_folder=Join-Path $work ('empty space & '+[char]0x4e2d+[char]0x6587)
            [IO.Directory]::CreateDirectory($empty_folder)|Out-Null
            foreach($target in @($host_root,$empty_folder,[IO.Path]::GetPathRoot($work))){
                $record=Join-Path $host_root 'arguments.txt'
                if(Test-Path -LiteralPath $record){[IO.File]::Delete($record)}
                & $probe --background $target invoke
                assert_true ($LASTEXITCODE -eq 0) 'Background COM resolution and invocation must succeed.'
                $watch=[Diagnostics.Stopwatch]::StartNew()
                while(!(Test-Path -LiteralPath $record) -and $watch.ElapsedMilliseconds -lt 5000){Start-Sleep -Milliseconds 50}
                assert_true ((Test-Path -LiteralPath $record) -and [IO.File]::ReadAllText($record,[Text.Encoding]::UTF8) -ceq $target) 'Background invocation must pass exactly the current directory.'
                assert_true ([IO.File]::ReadAllText((Join-Path $host_root 'launch_mode.txt'),[Text.Encoding]::UTF8) -ceq '--new') 'Background invocation must bypass global document reopen for this launch.'
            }
        } finally {if(Test-Path -LiteralPath $config){[IO.File]::Delete($config)}}
        $successful=$true
        Write-Output 'PASS: isolated background COM adapter and real process arguments; existing user package untouched.'
        return
    }
    $parameters=@{user_data=$profile;typora_root=$host_root;enabled=$true;file_menu=$true;folder_menu=$true}
    $state=set_typora_modern_package @parameters -previous $null
    $initial_path=$state.path
    for($index=0;$index -lt 20;$index++){$state=set_typora_modern_package @parameters -previous $state}
    assert_true ($state.path -ceq $initial_path) 'Repeated registration must reuse the owned package.'
    foreach($target in @($file,$work,[IO.Path]::GetPathRoot($work))){
        $record=Join-Path $host_root 'arguments.txt'
        if(Test-Path -LiteralPath $record){[IO.File]::Delete($record)}
        $result=& $probe $target invoke
        assert_true ($LASTEXITCODE -eq 0 -and ($result -join '') -match 'state=0') 'Native COM invocation must be enabled and succeed.'
        $watch=[Diagnostics.Stopwatch]::StartNew()
        while(!(Test-Path -LiteralPath $record) -and $watch.ElapsedMilliseconds -lt 5000){Start-Sleep -Milliseconds 50}
        assert_true ((Test-Path -LiteralPath $record) -and [IO.File]::ReadAllText($record,[Text.Encoding]::UTF8) -ceq $target) 'The process must receive exactly the original single path.'
    }
    $parameters.file_menu=$false
    $state=set_typora_modern_package @parameters -previous $state
    assert_true (((& $probe $file) -join '') -match 'state=2') 'Disabled file menu must be hidden.'
    assert_true (((& $probe $work) -join '') -match 'state=0') 'Folder menu must remain enabled.'
    $manifest=Join-Path $assets 'appx_manifest.xml'
    $bytes=[IO.File]::ReadAllBytes($manifest)
    [IO.File]::WriteAllText($manifest,'invalid manifest',[Text.UTF8Encoding]::new($false))
    $failed=$false
    try {$null=set_typora_modern_package @parameters -previous $state}catch{$failed=$true}
    [IO.File]::WriteAllBytes($manifest,$bytes)
    assert_true $failed 'Invalid package must fail.'
    assert_true ((@(get_typora_modern_package))[0].InstallLocation -ieq $state.path) 'Failed registration must restore the previous package.'
    $config=Join-Path $state.path 'shell_config.ini';$before=[IO.File]::ReadAllBytes($config)
    [IO.File]::AppendAllText($config,'external',[Text.Encoding]::Unicode)
    $failed=$false
    try {$null=set_typora_modern_package @parameters -previous $state}catch{$failed=$true}
    assert_true $failed 'External package edits must be preserved and reported.'
    [IO.File]::WriteAllBytes($config,$before)
    restore_typora_modern_package $state $null
    $state=$null
    assert_true (@(get_typora_modern_package).Count -eq 0) 'Uninstall must remove the registered package.'
    $parameters.file_menu=$true
    $state=set_typora_modern_package @parameters -previous $null
    assert_true (((& $probe $file) -join '') -match 'state=0') 'Reinstallation must restore native activation.'
    $successful=$true
    Write-Output 'PASS: 20 idempotent registrations, native file/folder/root invocation, independent options, registration failure rollback, external edit preservation, uninstall and reinstall.'
} finally {
    if($state){restore_typora_modern_package $state $null}
    & python -X utf8 $manager finish $artifact --status $(if($successful){'pass'}else{'fail'})
}
