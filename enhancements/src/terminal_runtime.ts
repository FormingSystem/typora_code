import {workspace_text} from "./workspace_i18n";
export type terminal_profile = { id: string; title: string; executable: string; args: string[]; env?: Record<string,string|null>; wsl?: boolean };

export function terminal_environment(source: Record<string, string | undefined>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) if (value != null && !/^(?:ELECTRON_RUN_AS_NODE|NODE_OPTIONS|GIT_(?:DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|NAMESPACE))$/iu.test(key)) result[key] = value;
  return { ...result, TERM: "xterm-256color", COLORTERM: "truecolor", TERM_PROGRAM: "Typora" };
}

// Privilege escalation only occurs when the user clicks the menu, and is handled by the normal UAC process of Windows; Typora itself maintains normal permissions.
export function administrator_launch(root: string, process_api: any, path_api: any): { executable: string; args: string[] } {
  if (process_api.platform !== "win32") throw new Error(workspace_text("terminal_runtime_administrator_terminal_entry_currently_only_supports_windows"));
  if (!root || root.includes("\0")) throw new Error(workspace_text("terminal_runtime_terminal_working_directory_is_invalid"));
  const system_root = Object.entries(process_api.env).find(([key])=>key.toLowerCase()==="systemroot")?.[1];
  if(typeof system_root!=="string"||!system_root)throw new Error(workspace_text("terminal_runtime_could_not_find_windows_system_directory"));
  const powershell = path_api.join(system_root,"System32","WindowsPowerShell","v1.0","powershell.exe");
  const quote = (value: string) => "'" + value.replace(/'/gu, "''") + "'";
  // Privilege escalation starting with Windows changes the working directory, explicitly restoring the repository root directory in a new PowerShell.
  const inner = "Set-Location -LiteralPath " + quote(root);
  const encode = (value: string) => {
    const bytes = new Uint8Array(value.length * 2); for (let index = 0; index < value.length; index++) { bytes[index * 2] = value.charCodeAt(index) & 255; bytes[index * 2 + 1] = value.charCodeAt(index) >> 8; }
    let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary);
  };
  const script = "$ErrorActionPreference='Stop'; try { Start-Process -FilePath " + quote(powershell)
    + " -Verb RunAs -WorkingDirectory " + quote(root) + " -ArgumentList @('-NoLogo','-NoExit','-EncodedCommand','" + encode(inner) + "') } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }";
  return { executable: powershell, args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encode(script)] };
}
