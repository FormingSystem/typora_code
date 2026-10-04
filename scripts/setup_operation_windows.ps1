# The graphical installer passes structured data to the same public command entry points.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][ValidateSet('install','check','uninstall')][string]$operation,
      [Parameter(Mandatory=$true)][string]$parameters_base64)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
try {
    Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Utility/Microsoft.PowerShell.Utility.psd1') -ErrorAction Stop
    $request=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($parameters_base64)) | ConvertFrom-Json
    $parameters=@{}
    foreach($property in $request.PSObject.Properties){$parameters[$property.Name]=$property.Value}
    & (Join-Path (Split-Path -Parent $PSScriptRoot) ($operation+'_windows.ps1')) @parameters
    exit 0
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    [Console]::Error.WriteLine($_.ScriptStackTrace)
    exit 1
}
