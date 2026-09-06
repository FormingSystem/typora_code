import fs from "node:fs";
import path from "node:path";
import textmate from "vscode-textmate";
import oniguruma from "vscode-oniguruma";
import assert from "node:assert/strict";
import { transform } from "esbuild";

const { Registry, INITIAL, parseRawGrammar } = textmate;
const { loadWASM, OnigScanner, OnigString } = oniguruma;

const root = process.cwd();
const style_module = await transform(fs.readFileSync(path.join(root, "src/textmate_style.ts"), "utf8"), {
  loader: "ts", format: "esm",
});
const { scope_style } = await import(`data:text/javascript;base64,${Buffer.from(style_module.code).toString("base64")}`);
await loadWASM(fs.readFileSync(path.join(root, "node_modules/vscode-oniguruma/release/onig.wasm")).buffer);

const files = new Map([
  ["source.c", "c.tmLanguage.json"],
  ["source.cpp", "cpp.tmLanguage.json"],
  ["source.cpp.embedded.macro", "cpp.embedded.macro.tmLanguage.json"],
  ["source.c.platform", "platform.tmLanguage.json"],
]);
const registry = new Registry({
  onigLib: Promise.resolve({
    createOnigScanner: (sources) => new OnigScanner(sources),
    createOnigString: (value) => new OnigString(value),
  }),
  loadGrammar: async (scope_name) => {
    const filename = files.get(scope_name);
    if (!filename) return null;
    const grammar_path = path.join(root, "vendor/vscode_cpp/syntaxes", filename);
    return parseRawGrammar(fs.readFileSync(grammar_path, "utf8"), grammar_path);
  },
});

const grammar = await registry.loadGrammar("source.c");
if (!grammar) throw new Error("source.c grammar failed to load");
const line = "p = rcu_dereference(table[id]);";
const result = grammar.tokenizeLine(line, INITIAL);
const function_token = result.tokens.find((token) => line.slice(token.startIndex, token.endIndex) === "rcu_dereference");
if (!function_token?.scopes.some((scope) => scope.startsWith("entity.name.function"))) {
  throw new Error(`function call was not recognized: ${JSON.stringify(result.tokens)}`);
}
console.log(`recognized rcu_dereference as ${function_token.scopes.at(-1)}`);

// 按真实多行宏保留 ruleStack，验证解析结果经过生产颜色映射后仍保留各语法角色。
const macro_lines = [
  ["#define raw_local_irq_save(flags) \\", { define: "tm-preprocessor", raw_local_irq_save: "tm-preprocessor", flags: "tm-parameter" }],
  ["    do { \\", { do: "tm-control", "{": "tm-punctuation" }],
  ["        typecheck(unsigned long, flags); \\", { typecheck: "tm-function", unsigned: "tm-keyword", long: "tm-keyword" }],
  ["        flags = arch_local_irq_save(); \\", { "=": "tm-operator", arch_local_irq_save: "tm-function" }],
  ["        if (flags) trace_flags(\"flags\"); /* 保存状态 */ \\", { if: "tm-control", trace_flags: "tm-function" }],
  ["    } while (0)", { while: "tm-control", "0": "tm-number", ")": "tm-punctuation" }],
  ["static void after_macro(void) { return; }", { static: "tm-keyword", after_macro: "tm-function", return: "tm-control" }],
];
for (const language of ["source.c", "source.cpp"]) {
  const language_grammar = await registry.loadGrammar(language);
  assert.ok(language_grammar);
  let stack = INITIAL;
  const styles_seen = new Set();
  for (const [source, expected] of macro_lines) {
    const parsed = language_grammar.tokenizeLine(source, stack);
    stack = parsed.ruleStack;
    const actual = new Map(parsed.tokens.map((token) => {
      const style = scope_style(token.scopes);
      styles_seen.add(style);
      return [source.slice(token.startIndex, token.endIndex).trim(), style];
    }));
    for (const [word, style] of Object.entries(expected)) {
      assert.equal(actual.get(word), style, `${language}: ${word} in ${source}`);
    }
  }
  assert.ok(styles_seen.has("tm-comment"), `${language}: 宏中的注释`);
  assert.ok(styles_seen.has("tm-string"), `${language}: 宏中的字符串`);
  console.log(`${language}: multiline macro colors and following code passed`);
}
