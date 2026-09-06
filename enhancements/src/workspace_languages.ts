import * as monaco from "monaco-editor/editor/editor.api";
import "monaco-editor/languages/definitions/bat/register";
import "monaco-editor/languages/definitions/csharp/register";
import "monaco-editor/languages/definitions/objective-c/register";
import "monaco-editor/languages/definitions/kotlin/register";
import "monaco-editor/languages/definitions/scala/register";
import "monaco-editor/languages/definitions/swift/register";
import "monaco-editor/languages/definitions/dart/register";
import "monaco-editor/languages/definitions/dockerfile/register";
import "monaco-editor/languages/definitions/ini/register";
import "monaco-editor/languages/definitions/xml/register";
import "monaco-editor/languages/definitions/scss/register";
import "monaco-editor/languages/definitions/less/register";
import "monaco-editor/languages/definitions/sql/register";
import "monaco-editor/languages/definitions/graphql/register";
import "monaco-editor/languages/definitions/protobuf/register";
import "monaco-editor/languages/definitions/hcl/register";
import "monaco-editor/languages/definitions/ruby/register";
import "monaco-editor/languages/definitions/perl/register";
import "monaco-editor/languages/definitions/php/register";
import "monaco-editor/languages/definitions/lua/register";
import "monaco-editor/languages/definitions/r/register";
import "monaco-editor/languages/definitions/julia/register";
import "monaco-editor/languages/definitions/tcl/register";
import "monaco-editor/languages/definitions/clojure/register";
import "monaco-editor/languages/definitions/scheme/register";
import "monaco-editor/languages/definitions/elixir/register";
import "monaco-editor/languages/definitions/fsharp/register";
import "monaco-editor/languages/definitions/systemverilog/register";
import "monaco-editor/languages/definitions/restructuredtext/register";
import "monaco-editor/languages/definitions/mdx/register";

/** 上游未内置的系统工程文件使用独立语法，不能误标成 C 或 Shell。 */
export function register_file_languages(): void {
  const grammars: Record<string, monaco.languages.IMonarchLanguage> = {
    cmake: {ignoreCase:true,tokenizer:{root:[[/#.*/,"comment"],[/\$\{[^}]+\}/,"variable"],[/\b\w+(?=\s*\()/,"keyword"],[/"([^"\\]|\\.)*"/,"string"],[/\b\d+\b/,"number"]]}},
    ignore: {tokenizer:{root:[[/^\s*#.*/,"comment"],[/^!/,"keyword"],[/[?*]|\[[^\]]+\]/,"regexp"]]}},
    makefile: {tokenizer: {root: [
      [/^\s*#.*/, "comment"], [/\$[({][^)}]+[)}]/, "variable"],
      [/^\s*(?:include|-include|sinclude|ifeq|ifneq|ifdef|ifndef|else|endif|define|endef|export|unexport|override|private|vpath)\b/, "keyword"],
      [/^[^\s:#=][^:=]*:(?![=:])/, "type.identifier"], [/\b[A-Za-z_]\w*(?=\s*[:?+!]?=)/, "variable"],
      [/"([^"\\]|\\.)*"|'[^']*'/, "string"], [/\$[@<^?*%+|]/, "variable"]
    ]}},
    kconfig: {tokenizer: {root: [
      [/^\s*#.*/, "comment"], [/\b(config|menuconfig|menu|endmenu|choice|endchoice|if|endif|source|rsource|osource|orsource|bool|tristate|string|hex|int|prompt|default|def_bool|def_tristate|depends|on|select|imply|range|visible|option|optional|help)\b/, "keyword"],
      [/"([^"\\]|\\.)*"/, "string"], [/\b[A-Z][A-Z_0-9]*\b/, "type.identifier"], [/\b(?:0x[\da-fA-F]+|\d+)\b/, "number"]
    ]}},
    dts: {tokenizer: {root: [
      [/\/\*/, "comment", "@comment"], [/\/\/.*$/, "comment"], [/^\s*#\s*\w+/, "keyword"],
      [/\/(?:dts-v1|plugin|include|delete-node|delete-property|memreserve)\//, "keyword"],
      [/"([^"\\]|\\.)*"/, "string"], [/&[\w]+/, "variable"], [/[\w-]+(?=\s*:)/, "type.identifier"],
      [/\b(?:0x[\da-fA-F]+|\d+)\b/, "number"], [/[{}<>;=]/, "delimiter"]
    ], comment: [[/[^*]+/, "comment"], [/\*\//, "comment", "@pop"], [/\*/, "comment"]]}},
    toml: {tokenizer: {root: [
      [/#.*$/, "comment"], [/^\s*\[\[?[^\]]+\]\]?/, "type.identifier"],
      [/"([^"\\]|\\.)*"|'[^']*'/, "string"], [/\b(?:true|false)\b/, "keyword"],
      [/[\w.-]+(?=\s*=)/, "attribute.name"], [/[+-]?\b\d[\d_.:-]*\b/, "number"]
    ]}},
    asm: {ignoreCase: true, tokenizer: {root: [
      [/\/\/.*$|;.*$|@.*$/, "comment"], [/^\s*#\s*\w+/, "keyword"], [/^\s*\.[\w.]+/, "keyword"],
      [/[\w.$]+(?=\s*:)/, "type.identifier"], [/\b(?:r\d+|x\d+|w\d+|sp|lr|pc|[re]?[abcd]x|[re]?(?:si|di|bp|sp))\b/, "variable"],
      [/"([^"\\]|\\.)*"/, "string"], [/#?-?\b(?:0x[\da-f]+|\d+)\b/, "number"]
    ]}}
  };
  for (const [id, grammar] of Object.entries(grammars)) {
    if (monaco.languages.getLanguages().some(language => language.id === id)) continue;
    monaco.languages.register({id}); monaco.languages.setMonarchTokensProvider(id, grammar);
  }
}
