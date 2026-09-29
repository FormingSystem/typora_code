import {workspace_text} from "./workspace_i18n";
const escape_regex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/** Commas only separate the outermost mode; retain {a,b} and commas in character classes. */
function split_globs(value: string): string[] {
  const output: string[] = []; let start = 0; let braces = 0; let brackets = 0;
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    if (character === "[" && !brackets) brackets++;
    else if (character === "]" && brackets) brackets--;
    else if (!brackets && character === "{") braces++;
    else if (!brackets && character === "}") { if (!braces) throw new Error(workspace_text("glob_braces_in_the_file_pattern_are_mismatched")); braces--; }
    else if (!braces && !brackets && character === ",") { output.push(value.slice(start, index).trim()); start = index + 1; }
  }
  if (braces || brackets) throw new Error(workspace_text("glob_parentheses_in_the_file_pattern_are_mismatched"));
  output.push(value.slice(start).trim()); return output.filter(Boolean);
}

/** Align the Search input box's implicit recursive prefix and directory descendants matching, do not use this parser for .gitignore. */
export function compile_workspace_globs(value: string, case_sensitive = true, search_prefix = true, descendants = true): (relative_path: string) => boolean {
  const patterns = split_globs(value).map(pattern => {
    if (pattern.includes("\\")) throw new Error(workspace_text("glob_use_a_forward_slash_for_the_file_pattern"));
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
        if (!contents || contents.includes("/")) throw new Error(workspace_text("glob_invalid_character_class_in_the_file_pattern"));
        if (contents[0] === "!") contents = "^" + contents.slice(1);
        else if (contents[0] === "^") contents = "\\^" + contents.slice(1);
        result += "[" + contents + "]"; index = end + 1;
      } else result += escape_regex(character);
    }
    try { return new RegExp("^" + (search_prefix && !anchored ? "(?:[^/]+/)*" : "") + result + (descendants ? "(?:/.*)?$" : "$"), case_sensitive ? "u" : "iu"); }
    catch { throw new Error(workspace_text("glob_invalid_include_or_exclude_pattern_for_the_file")); }
  });
  return relative_path => patterns.some(pattern => pattern.test(relative_path));
}
