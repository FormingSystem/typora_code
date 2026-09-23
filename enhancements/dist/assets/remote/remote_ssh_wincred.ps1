$ErrorActionPreference = 'Stop'
# 秘密只通过标准输入/输出传递；调用方不记录协议正文。
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class typora_ssh_credential {
 [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
 public struct credential {
  public UInt32 Flags, Type; public string TargetName, Comment;
  public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
  public UInt32 CredentialBlobSize; public IntPtr CredentialBlob;
  public UInt32 Persist, AttributeCount; public IntPtr Attributes;
  public string TargetAlias, UserName;
 }
 [DllImport("advapi32.dll", EntryPoint="CredReadW", CharSet=CharSet.Unicode, SetLastError=true)]
 public static extern bool read(string target, UInt32 type, UInt32 flags, out IntPtr credential);
 [DllImport("advapi32.dll", EntryPoint="CredWriteW", CharSet=CharSet.Unicode, SetLastError=true)]
 public static extern bool write(ref credential value, UInt32 flags);
 [DllImport("advapi32.dll", EntryPoint="CredDeleteW", CharSet=CharSet.Unicode, SetLastError=true)]
 public static extern bool delete(string target, UInt32 type, UInt32 flags);
 [DllImport("advapi32.dll", EntryPoint="CredEnumerateW", CharSet=CharSet.Unicode, SetLastError=true)]
 public static extern bool enumerate(string filter, UInt32 flags, out UInt32 count, out IntPtr credentials);
 [DllImport("advapi32.dll", EntryPoint="CredFree")] public static extern void free(IntPtr buffer);
}
'@
try {
 $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
 $target = [string]$request.target
 if ($target -notmatch '^TyporaCode/SSH/[a-f0-9]{32}/[a-z0-9/-]*$') { throw 'Invalid credential namespace' }
 $value = $null
 switch ($request.operation) {
  'read' {
   $pointer = [IntPtr]::Zero
   if ([typora_ssh_credential]::read($target,1,0,[ref]$pointer)) {
    try { $record=[Runtime.InteropServices.Marshal]::PtrToStructure($pointer,[type][typora_ssh_credential+credential]); $bytes=New-Object byte[] $record.CredentialBlobSize; [Runtime.InteropServices.Marshal]::Copy($record.CredentialBlob,$bytes,0,$bytes.Length); $value=[Convert]::ToBase64String($bytes) }
    finally { [typora_ssh_credential]::free($pointer) }
   } elseif ([Runtime.InteropServices.Marshal]::GetLastWin32Error() -ne 1168) { throw 'Credential read failed' }
  }
  'write' {
   $bytes=[Convert]::FromBase64String([string]$request.value)
   if ($bytes.Length -gt 2560) { throw 'Credential exceeds system limit' }
   $record=New-Object typora_ssh_credential+credential
   $record.Type=1; $record.TargetName=$target; $record.Persist=2; $record.UserName='TyporaCode SSH'; $record.CredentialBlobSize=$bytes.Length
   $record.CredentialBlob=[Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
   try { [Runtime.InteropServices.Marshal]::Copy($bytes,0,$record.CredentialBlob,$bytes.Length); if(-not [typora_ssh_credential]::write([ref]$record,0)){throw 'Credential write failed'} }
   finally { for($i=0;$i -lt $bytes.Length;$i++){[Runtime.InteropServices.Marshal]::WriteByte($record.CredentialBlob,$i,0)}; [Runtime.InteropServices.Marshal]::FreeHGlobal($record.CredentialBlob); [Array]::Clear($bytes,0,$bytes.Length) }
  }
  'delete' { if(-not [typora_ssh_credential]::delete($target,1,0) -and [Runtime.InteropServices.Marshal]::GetLastWin32Error() -ne 1168){throw 'Credential delete failed'} }
  'list' {
   $pointer=[IntPtr]::Zero; $count=[uint32]0; $names=@()
   if([typora_ssh_credential]::enumerate($target+'*',0,[ref]$count,[ref]$pointer)){
    try { for($i=0;$i -lt $count;$i++){ $entry=[Runtime.InteropServices.Marshal]::ReadIntPtr($pointer,$i*[IntPtr]::Size); $record=[Runtime.InteropServices.Marshal]::PtrToStructure($entry,[type][typora_ssh_credential+credential]); $names+=$record.TargetName } }
    finally { [typora_ssh_credential]::free($pointer) }
   } elseif([Runtime.InteropServices.Marshal]::GetLastWin32Error() -ne 1168){throw 'Credential enumeration failed'}
   $value=@($names)
  }
  default { throw 'Unsupported credential operation' }
 }
 [Console]::Out.Write((@{ok=$true;value=$value}|ConvertTo-Json -Compress -Depth 5))
} catch { [Console]::Out.Write('{"ok":false}'); exit 1 }
