[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$archive,[Parameter(Mandatory=$true)][string]$destination)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.IO.Compression.FileSystem
$destination=[IO.Path]::GetFullPath($destination)
if(Test-Path -LiteralPath $destination){throw 'Extraction destination must not exist.'}
$zip=[IO.Compression.ZipFile]::OpenRead([IO.Path]::GetFullPath($archive))
try {
 if($zip.Entries.Count -gt 30000){throw 'Archive contains too many entries.'}
 $seen=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
 $roots=[Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
 $total=[long]0
 # 先检查全部条目，再写入任何文件；禁止Windows路径别名和Unix符号链接。
 foreach($entry in $zip.Entries){
  $name=$entry.FullName
  if(!$name -or $name.Contains('\') -or $name.StartsWith('/')){throw 'Non-canonical ZIP entry.'}
  $parts=$name.TrimEnd('/').Split('/')
  foreach($part in $parts){
   if(!$part -or $part -eq '.' -or $part -eq '..' -or $part -match '[<>:"|?*\x00-\x1f]' -or $part -match '[. ]$' -or $part -match '^(?i:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)'){throw 'Unsafe ZIP entry.'}
  }
  if(!$seen.Add($name.TrimEnd('/'))){throw 'Duplicate ZIP entry.'}
  [void]$roots.Add($parts[0])
  $mode=($entry.ExternalAttributes -shr 16) -band 0xF000
  if($mode -ne 0 -and $mode -ne 0x8000 -and $mode -ne 0x4000){throw 'Linked or special ZIP entry.'}
  $total+=$entry.Length
  if($total -gt 768MB -or $entry.Length -gt 128MB -or ($entry.Length -gt 1MB -and $entry.Length -gt [Math]::Max(1,$entry.CompressedLength)*300)){throw 'Archive expands beyond limit.'}
 }
 if($roots.Count -ne 1){throw 'Expected one repository root.'}
 New-Item -ItemType Directory -Path $destination | Out-Null
 $prefix=$destination.TrimEnd('\')+'\'
 foreach($entry in $zip.Entries){
  $target=[IO.Path]::GetFullPath((Join-Path $destination $entry.FullName))
  if(!$target.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){throw 'ZIP entry escapes destination.'}
  if($entry.FullName.EndsWith('/')){New-Item -ItemType Directory -Force -Path $target | Out-Null;continue}
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
  [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$target,$false)
 }
 $root=Join-Path $destination (@($roots)[0])
 foreach($name in @('install_windows.ps1','enhancements/release.json','enhancements/dist/SHA256SUMS')){if(!(Test-Path -LiteralPath (Join-Path $root $name) -PathType Leaf)){throw 'Incomplete repository archive.'}}
 Write-Output $root
} finally {$zip.Dispose()}
