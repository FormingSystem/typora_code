export type terminal_profile = { id: string; title: string; executable: string; args: string[]; env?: Record<string,string|null>; wsl?: boolean };

export function terminal_environment(source: Record<string, string | undefined>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) if (value != null && !/^(?:ELECTRON_RUN_AS_NODE|NODE_OPTIONS|GIT_(?:DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|NAMESPACE))$/iu.test(key)) result[key] = value;
  return { ...result, TERM: "xterm-256color", COLORTERM: "truecolor", TERM_PROGRAM: "Typora" };
}

// 提权仅在用户点击菜单后由 Windows 的正常 UAC 流程处理；Typora 自身保持普通权限。
export function administrator_launch(root: string, process_api: any, path_api: any): { executable: string; args: string[] } {
  if (process_api.platform !== "win32") throw new Error("管理员终端入口当前仅支持 Windows。");
  if (!root || root.includes("\0")) throw new Error("终端工作目录无效。");
  const system_root = Object.entries(process_api.env).find(([key])=>key.toLowerCase()==="systemroot")?.[1];
  if(typeof system_root!=="string"||!system_root)throw new Error("未找到 Windows 系统目录。");
  const powershell = path_api.join(system_root,"System32","WindowsPowerShell","v1.0","powershell.exe");
  const quote = (value: string) => "'" + value.replace(/'/gu, "''") + "'";
  // Windows 提权启动会改变工作目录，显式在新 PowerShell 中恢复仓库根目录。
  const inner = "Set-Location -LiteralPath " + quote(root);
  const encode = (value: string) => {
    const bytes = new Uint8Array(value.length * 2); for (let index = 0; index < value.length; index++) { bytes[index * 2] = value.charCodeAt(index) & 255; bytes[index * 2 + 1] = value.charCodeAt(index) >> 8; }
    let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary);
  };
  const script = "$ErrorActionPreference='Stop'; try { Start-Process -FilePath " + quote(powershell)
    + " -Verb RunAs -WorkingDirectory " + quote(root) + " -ArgumentList @('-NoLogo','-NoExit','-EncodedCommand','" + encode(inner) + "') } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }";
  return { executable: powershell, args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encode(script)] };
}
