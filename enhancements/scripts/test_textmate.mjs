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

// 生产配色器使用官方tokenColors；前述断言只验证grammar识别作用域。
const {build}=await import('esbuild');
const bundle=await build({entryPoints:['src/reading_code_theme.ts'],bundle:true,write:false,platform:'node',format:'esm',loader:{'.wasm':'binary'}});
const production=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const themed=await production.load_code_themes();
for(const language of ['c','cpp']){
 const parsed=themed[language].tokenizeLine(line,production.initial_code_stack());
 const token_color=(offset,mode)=>{const token=parsed.tokens.find(token=>token.startIndex<=offset&&token.endIndex>offset),id=token.style.match(new RegExp('vsc-'+mode+'-fg-(\\d+)'))[1];return themed.css.match(new RegExp('vsc-'+mode+'-fg-'+id+'\\)\\{color:([^!]+)'))[1];};
 assert.equal(token_color(0,'dark').toUpperCase(),language==='c'?'#CCCCCC':'#9CDCFE');assert.equal(token_color(0,'light').toUpperCase(),language==='c'?'#3B3B3B':'#001080');
 assert.equal(token_color(line.indexOf('rcu'),'dark').toUpperCase(),'#DCDCAA');assert.equal(token_color(line.indexOf('rcu'),'light').toUpperCase(),'#795E26');
 let stack=production.initial_code_stack();const start=performance.now();
 for(let i=0;i<1000;i++){const source=macro_lines[i%macro_lines.length][0],result=themed[language].tokenizeLine(source,stack);stack=result.ruleStack;assert.equal(result.tokens.map(token=>source.slice(token.startIndex,token.endIndex)).join(''),source);assert(result.tokens.every(token=>token.style.includes('vsc-light-')&&token.style.includes('vsc-dark-')));}
 console.log(JSON.stringify({language,checks:'production defaults/function/1000 multiline reconstruction with two independent theme stacks',ms:performance.now()-start}));
}

const {default:ts}=await import('typescript'),{createHash}=await import('node:crypto');
const upstream_root='vendor/vscode_themes/',manifest=JSON.parse(fs.readFileSync(upstream_root+'SOURCE.json','utf8'));
for(const [name,hash]of Object.entries(manifest.files))assert.equal(createHash('sha256').update(fs.readFileSync(upstream_root+name)).digest('hex'),hash,name+' upstream SHA256');
function resolve_theme(name){const raw=ts.parseConfigFileTextToJson(name,fs.readFileSync(upstream_root+name,'utf8')).config,parent=raw.include?resolve_theme(raw.include.replace('./','')):{colors:{},tokenColors:[]};return{colors:{...parent.colors,...raw.colors},tokenColors:[...parent.tokenColors,...(raw.tokenColors||[])]};}
assert.deepEqual(JSON.parse(fs.readFileSync(upstream_root+'resolved.json','utf8')),{light:resolve_theme('light_modern.json'),dark:resolve_theme('dark_modern.json')});
console.log('PASS official theme source SHA256 and complete JSONC include resolution');
