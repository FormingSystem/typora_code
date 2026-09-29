import {workspace_text} from "./workspace_i18n";
/** The file name rules only decide the displayed language, not whether the file appears in the Explorer. */
export type file_language_rule = {
  language: string;
  label: string;
  filenames?: readonly string[];
  filename_prefixes?: readonly string[];
  suffixes?: readonly string[];
  case_sensitive?: boolean;
  category?: "text" | "archive" | "binary";
};

/** Special file names → longest composite suffix → last suffix; for unknown names, try to interpret the first line. */
export const FILE_LANGUAGE_RULES: readonly file_language_rule[] = [
  { language: "markdown", label: "Markdown", suffixes: [".md", ".markdown", ".mdown", ".mkdn", ".mkd"] },
  { language: "mdx", label: "MDX", suffixes: [".mdx"] },
  { language: "typescript", label: "TypeScript", suffixes: [".d.ts", ".d.mts", ".d.cts", ".ts", ".tsx", ".mts", ".cts"] },
  { language: "javascript", label: "JavaScript", suffixes: [".js", ".jsx", ".mjs", ".cjs"] },
  { language: "json", label: "JSON", filenames: [".babelrc", ".eslintrc", ".prettierrc", ".jshintrc"], suffixes: [".json", ".jsonc", ".jsonl", ".ipynb", ".code-workspace"] },
  { language: "c", label: "C", suffixes: [".c", ".h", ".i"] },
  { language: "cpp", label: "C++", suffixes: [".cpp", ".cc", ".cxx", ".c++", ".hpp", ".hh", ".hxx", ".h++", ".ipp", ".tpp", ".ino"] },
  { language: "cpp", label: "C++", suffixes: [".C", ".H"], case_sensitive: true },
  { language: "objective-c", label: "Objective-C", suffixes: [".m", ".mm"] },
  { language: "csharp", label: "C#", suffixes: [".cs", ".csx"] },
  { language: "rust", label: "Rust", suffixes: [".rs"] },
  { language: "go", label: "Go", suffixes: [".go"] },
  { language: "java", label: "Java", suffixes: [".java"] },
  { language: "kotlin", label: "Kotlin", suffixes: [".kt", ".kts"] },
  { language: "scala", label: "Scala", suffixes: [".scala", ".sc"] },
  { language: "swift", label: "Swift", suffixes: [".swift"] },
  { language: "dart", label: "Dart", suffixes: [".dart"] },
  { language: "python", label: "Python", filenames: ["SConstruct", "SConscript"], suffixes: [".py", ".pyi", ".pyw", ".pyx", ".pxd"] },
  { language: "shell", label: "Shell", filenames: [".bashrc", ".bash_profile", ".bash_login", ".profile", ".zshrc", ".zprofile", ".zshenv", ".kshrc"], suffixes: [".sh", ".bash", ".zsh", ".ksh", ".fish"] },
  { language: "powershell", label: "PowerShell", suffixes: [".ps1", ".psm1", ".psd1"] },
  { language: "bat", label: workspace_text("file_language_windows_batch"), suffixes: [".bat", ".cmd"] },
  { language: "makefile", label: "Makefile", filenames: ["Makefile", "GNUmakefile", "Kbuild"], filename_prefixes: ["Makefile.", "GNUmakefile.", "Kbuild."], suffixes: [".mk", ".mak"] },
  { language: "cmake", label: "CMake", filenames: ["CMakeLists.txt"], suffixes: [".cmake"] },
  { language: "kconfig", label: "Kconfig", filenames: ["Kconfig"], filename_prefixes: ["Kconfig."] },
  { language: "dts", label: workspace_text("file_language_device_tree"), suffixes: [".dts", ".dtsi", ".dtso"] },
  { language: "asm", label: workspace_text("file_language_assembly"), suffixes: [".s", ".asm", ".inc"] },
  { language: "dockerfile", label: "Dockerfile", filenames: ["Dockerfile", "Containerfile"], filename_prefixes: ["Dockerfile.", "Containerfile."], suffixes: [".dockerfile", ".containerfile"] },
  { language: "ini", label: workspace_text("file_language_ini_environment_variables"), filenames: [".env", ".gitconfig", ".gitmodules", ".editorconfig", ".npmrc", ".yarnrc"], filename_prefixes: [".env."], suffixes: [".ini", ".cfg", ".conf", ".properties", ".service", ".socket", ".timer", ".desktop"] },
  { language: "ignore", label: workspace_text("file_language_ignore_rules"), filenames: [".gitignore", ".gitattributes", ".dockerignore", ".ignore", ".npmignore", ".eslintignore", ".prettierignore"], suffixes: [".gitignore"] },
  { language: "toml", label: "TOML", filenames: ["Cargo.lock", "poetry.lock", "uv.lock"], suffixes: [".toml"] },
  { language: "yaml", label: "YAML", suffixes: [".yaml", ".yml"] },
  { language: "xml", label: "XML", suffixes: [".xml", ".xsd", ".xsl", ".xslt", ".svg", ".plist", ".csproj", ".props", ".targets", ".ui"] },
  { language: "html", label: "HTML", suffixes: [".html", ".htm", ".xhtml", ".vue", ".svelte"] },
  { language: "css", label: "CSS", suffixes: [".module.css", ".css"] },
  { language: "scss", label: "SCSS", suffixes: [".module.scss", ".scss"] },
  { language: "less", label: "Less", suffixes: [".less"] },
  { language: "sql", label: "SQL", suffixes: [".sql"] },
  { language: "graphql", label: "GraphQL", suffixes: [".graphql", ".gql"] },
  { language: "proto", label: "Protocol Buffers", suffixes: [".proto"] },
  { language: "hcl", label: "HCL / Terraform", suffixes: [".hcl", ".tf", ".tfvars"] },
  { language: "ruby", label: "Ruby", filenames: ["Gemfile", "Rakefile", "Guardfile", "Vagrantfile"], suffixes: [".rb", ".rake", ".gemspec"] },
  { language: "perl", label: "Perl", suffixes: [".pl", ".pm", ".pod"] },
  { language: "php", label: "PHP", suffixes: [".php", ".phtml"] },
  { language: "lua", label: "Lua", suffixes: [".lua"] },
  { language: "r", label: "R", suffixes: [".r", ".rprofile"] },
  { language: "julia", label: "Julia", suffixes: [".jl"] },
  { language: "tcl", label: "Tcl", suffixes: [".tcl", ".tk"] },
  { language: "clojure", label: "Clojure", suffixes: [".clj", ".cljs", ".cljc", ".edn"] },
  { language: "scheme", label: "Scheme", suffixes: [".scm", ".ss", ".rkt"] },
  { language: "elixir", label: "Elixir", suffixes: [".ex", ".exs"] },
  { language: "fsharp", label: "F#", suffixes: [".fs", ".fsi", ".fsx"] },
  { language: "systemverilog", label: "Verilog / SystemVerilog", suffixes: [".v", ".vh", ".sv", ".svh"] },
  { language: "restructuredtext", label: "reStructuredText", suffixes: [".rst"] },
  { language: "plaintext", label: workspace_text("file_language_plain_text"), filenames: ["LICENSE", "COPYING", "AUTHORS", "NOTICE", "README", "CHANGELOG", "COMMIT_EDITMSG", "MERGE_MSG"], suffixes: [".txt", ".text", ".log", ".csv", ".tsv", ".patch", ".diff"] },
  { language: "plaintext", label: workspace_text("file_language_archive_file"), category: "archive", suffixes: [".tar.gz", ".tar.bz2", ".tar.xz", ".tar.zst", ".tar.lz4", ".tgz", ".tbz2", ".txz", ".zip", ".7z", ".rar", ".gz", ".bz2", ".xz", ".zst", ".tar", ".jar", ".war", ".deb", ".rpm"] },
  { language: "plaintext", label: workspace_text("file_language_binary_file"), category: "binary", suffixes: [".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".pdf", ".exe", ".dll", ".so", ".a", ".o", ".class", ".pyc", ".wasm", ".woff", ".woff2", ".ttf", ".mp3", ".mp4", ".wav", ".bin", ".dtb"] },
];

export type file_language_match = { language: string; label: string; category: "text" | "archive" | "binary"; matched_by: "filename" | "suffix" | "shebang" | "fallback"; pattern: string };

const suffix_rules = FILE_LANGUAGE_RULES.flatMap(rule => (rule.suffixes || []).map(suffix => ({rule, suffix})))
  .sort((left, right) => right.suffix.length - left.suffix.length || Number(Boolean(right.rule.case_sensitive)) - Number(Boolean(left.rule.case_sensitive)));

function basename(file_path: string): string { return file_path.replace(/\\/g, "/").split("/").pop() || ""; }

function from_rule(rule: file_language_rule, matched_by: file_language_match["matched_by"], pattern: string): file_language_match {
  return {language: rule.language, label: rule.label, category: rule.category || "text", matched_by, pattern};
}

function shebang_language(first_line: string): string | undefined {
  const line = first_line.replace(/^\uFEFF/, "").split(/[\r\n]/, 1)[0];
  if (!line.startsWith("#!")) return;
  // Only identify the interpreter name, not execute commands; support env -S, environment variable assignment, and version numbers.
  const tokens = line.slice(2).trim().match(/"[^"\r\n]*"|'[^'\r\n]*'|\S+/g) || [];
  let executable = tokens.shift()?.replace(/^['"]|['"]$/g, "") || "";
  if (basename(executable) === "env") {
    while (tokens.length) {
      const token = tokens.shift()!;
      if (["-u", "--unset", "-C", "--chdir"].includes(token)) { tokens.shift(); continue; }
      if (token.startsWith("-") || /^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) continue;
      executable = token.replace(/^['"]|['"]$/g, "").split(/\s/)[0]; break;
    }
  }
  const command = basename(executable).replace(/\.exe$/i, "");
  if (/^python(?:\d+(?:\.\d+)*)?$/.test(command)) return "python";
  if (/^(?:sh|bash|dash|ash|zsh|ksh|fish)$/.test(command)) return "shell";
  if (/^(?:node|nodejs|bun|deno)$/.test(command)) return "javascript";
  if (/^(?:pwsh|powershell)$/.test(command)) return "powershell";
  if (/^ruby(?:\d+(?:\.\d+)*)?$/.test(command)) return "ruby";
  if (/^perl(?:\d+(?:\.\d+)*)?$/.test(command)) return "perl";
  if (/^php(?:\d+(?:\.\d+)*)?$/.test(command)) return "php";
  if (/^lua(?:\d+(?:\.\d+)*)?$/.test(command)) return "lua";
  if (/^Rscript$/.test(command)) return "r";
  return;
}

export function match_file_language(file_path: string, first_line = ""): file_language_match {
  const name = basename(file_path), lower_name = name.toLowerCase();
  for (const rule of FILE_LANGUAGE_RULES) {
    const candidate = rule.case_sensitive ? name : lower_name;
    const normalize = (value: string) => rule.case_sensitive ? value : value.toLowerCase();
    const exact = rule.filenames?.find(value => candidate === normalize(value));
    if (exact) return from_rule(rule, "filename", exact);
    const prefix = rule.filename_prefixes?.find(value => candidate.startsWith(normalize(value)));
    if (prefix) return from_rule(rule, "filename", prefix + "*");
  }
  for (const {rule, suffix} of suffix_rules) {
    if ((rule.case_sensitive ? name : lower_name).endsWith(rule.case_sensitive ? suffix : suffix.toLowerCase())) return from_rule(rule, "suffix", suffix);
  }
  const language = shebang_language(first_line);
  const rule = language && FILE_LANGUAGE_RULES.find(candidate => candidate.language === language);
  if (rule) return from_rule(rule, "shebang", "#!");
  return {language: "plaintext", label: workspace_text("file_language_plain_text"), category: "text", matched_by: "fallback", pattern: ""};
}

export function detect_file_language(file_path: string, first_line = ""): string { return match_file_language(file_path, first_line).language; }
export function is_markdown_file(file_path: string): boolean { return detect_file_language(file_path) === "markdown"; }

export type decoded_file = { text: string; encoding: string; bom: boolean };

function byte_prefix(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.length <= bytes.length && signature.every((value, index) => bytes[index] === value);
}

function bom_encoding(bytes: Uint8Array): { encoding: string; offset: number } | undefined {
  if (byte_prefix(bytes, [0xef, 0xbb, 0xbf])) return {encoding: "utf-8", offset: 3};
  // The UTF-32 cannot impersonate UTF-16; TextDecoder has no UTF-32 decoder, and it is explicitly given to the binary preview.
  if (byte_prefix(bytes, [0xff, 0xfe, 0x00, 0x00]) || byte_prefix(bytes, [0x00, 0x00, 0xfe, 0xff])) return;
  if (byte_prefix(bytes, [0xff, 0xfe])) return {encoding: "utf-16le", offset: 2};
  if (byte_prefix(bytes, [0xfe, 0xff])) return {encoding: "utf-16be", offset: 2};
}

/** The BOM takes precedence over user coding; it does not use replacement characters to secretly hide illegal bytes. */
export function decode_file_bytes(bytes: Uint8Array, fallback_encoding = "utf-8"): decoded_file {
  const bom = bom_encoding(bytes);
  // The BOM has already been separated here; the subsequent U+FEFF belongs to the document content, and cannot be lost by TextDecoder as the second BOM.
  const decoder = new TextDecoder(bom?.encoding || fallback_encoding, {fatal: true, ignoreBOM: true});
  return {text: decoder.decode(bom ? bytes.subarray(bom.offset) : bytes), encoding: decoder.encoding, bom: Boolean(bom)};
}

const BINARY_SIGNATURES: readonly (readonly number[])[] = [
  [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], [0xff, 0xd8, 0xff],
  [0x47, 0x49, 0x46, 0x38], [0x25, 0x50, 0x44, 0x46, 0x2d], [0x7f, 0x45, 0x4c, 0x46],
  [0x50, 0x4b, 0x03, 0x04], [0x50, 0x4b, 0x05, 0x06], [0x50, 0x4b, 0x07, 0x08],
  [0x1f, 0x8b], [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00], [0x42, 0x5a, 0x68],
  [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c], [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07],
  [0x00, 0x61, 0x73, 0x6d], [0x28, 0xb5, 0x2f, 0xfd],
];

function contains_binary_controls(text: string): boolean {
  if (text.includes("\0")) return true;
  const controls = text.match(/[\x01-\x08\x0e-\x1f\x7f]/g)?.length || 0;
  return controls > 0 && controls / Math.max(1, text.length) > 0.1;
}

/** Judgment of already read bytes; check at most 8 KiB, do not hide files directly because of the file extension or non UTF-8 encoding. */
export function detect_binary_bytes(bytes: Uint8Array): boolean {
  if (BINARY_SIGNATURES.some(signature => byte_prefix(bytes, signature))) return true;
  if (bytes.length >= 262 && String.fromCharCode(...bytes.subarray(257, 262)) === "ustar") return true;
  const bom = bom_encoding(bytes);
  if (bom) {
    const limit = Math.min(bytes.length, 8192);
    const end = bom.encoding.startsWith("utf-16") ? limit - ((limit - bom.offset) % 2) : limit;
    try {
      // The sample end may truncate UTF-8 characters or UTF-16 agents; stream allows this end fragment.
      return contains_binary_controls(new TextDecoder(bom.encoding, {fatal: true}).decode(bytes.subarray(bom.offset, end), {stream: end < bytes.length}));
    } catch { return true; }
  }
  let controls = 0;
  const length = Math.min(bytes.length, 8192);
  for (let index = 0; index < length; index++) {
    const value = bytes[index];
    if (!value) return true;
    if (value < 9 || value > 13 && value < 32 || value === 127) controls++;
  }
  return controls > 0 && controls / Math.max(1, length) > 0.1;
}
