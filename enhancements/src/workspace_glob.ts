const escape_regex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/** 逗号只分隔最外层模式，保留 {a,b} 与字符类里的逗号。 */
function split_globs(value: string): string[] {
  const output: string[] = []; let start = 0; let braces = 0; let brackets = 0;
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    if (character === "[" && !brackets) brackets++;
    else if (character === "]" && brackets) brackets--;
    else if (!brackets && character === "{") braces++;
    else if (!brackets && character === "}") { if (!braces) throw new Error("文件模式的大括号不匹配。"); braces--; }
    else if (!braces && !brackets && character === ",") { output.push(value.slice(start, index).trim()); start = index + 1; }
  }
  if (braces || brackets) throw new Error("文件模式的括号不匹配。");
  output.push(value.slice(start).trim()); return output.filter(Boolean);
}

/** 对齐 Search 输入框的隐含递归前缀及目录后代匹配，不将此解析器用于 .gitignore。 */
export function compile_workspace_globs(value: string, case_sensitive = true, search_prefix = true, descendants = true): (relative_path: string) => boolean {
  const patterns = split_globs(value).map(pattern => {
    if (pattern.includes("\\")) throw new Error("文件模式请使用正斜线 /。");
    const anchored = pattern.startsWith("./") || pattern.startsWith("/");
    pattern = pattern.replace(/^(?:\.\/|\/)/u, "").replace(/\/+$/u, "");
    let result = ""; let index = 0;
    while (index < pattern.length) {
      const character = pattern[index++];
      if (character === "*") {
        if (pattern[index] === "*") { while (pattern[index] === "*") index++; if (pattern[index] === "/") { index++; result += "(?:[^/]+/)*"; } else result += ".*"; }
        else result += "[^/]*";
      } else if (character === "?") result += "[^/]";
      else if (character === "{") result += "(?:";
      else if (character === "}") result += ")";
      else if (character === ",") result += "|";
      else if (character === "[") {
        const end = pattern.indexOf("]", index); let contents = pattern.slice(index, end);
        if (!contents || contents.includes("/")) throw new Error("文件模式字符类无效。");
        if (contents[0] === "!") contents = "^" + contents.slice(1);
        else if (contents[0] === "^") contents = "\\^" + contents.slice(1);
        result += "[" + contents + "]"; index = end + 1;
      } else result += escape_regex(character);
    }
    try { return new RegExp("^" + (search_prefix && !anchored ? "(?:[^/]+/)*" : "") + result + (descendants ? "(?:/.*)?$" : "$"), case_sensitive ? "u" : "iu"); }
    catch { throw new Error("文件包含或排除模式无效。"); }
  });
  return relative_path => patterns.some(pattern => pattern.test(relative_path));
}
