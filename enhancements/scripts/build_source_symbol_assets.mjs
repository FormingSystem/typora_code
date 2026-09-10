import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {createRequire} from "node:module";
import {build} from "esbuild";
const require=createRequire(import.meta.url);
export async function build_source_symbol_assets(outdir){
  const target=path.join(outdir,"assets/source_symbols");fs.mkdirSync(target,{recursive:true});
  const manifest=JSON.parse(fs.readFileSync("vendor/source_symbols/source_manifest.json","utf8"));
  for(const asset of manifest.assets){const source=path.join("vendor/source_symbols",asset.file);if(createHash("sha256").update(fs.readFileSync(source)).digest("hex")!==asset.sha256)throw new Error(`Parser asset SHA256 mismatch: ${asset.file}`);fs.copyFileSync(source,path.join(target,asset.file));}
  const runtime=require.resolve("web-tree-sitter/tree-sitter.wasm");if(createHash("sha256").update(fs.readFileSync(runtime)).digest("hex")!==manifest.runtime.sha256)throw new Error("Parser runtime SHA256 mismatch");fs.copyFileSync(runtime,path.join(target,"tree-sitter.wasm"));
  for(const name of fs.readdirSync("vendor/source_symbols").filter(name=>name.startsWith("LICENSE")||name==="source_manifest.json"))fs.copyFileSync(path.join("vendor/source_symbols",name),path.join(target,name));
  fs.copyFileSync(path.join(path.dirname(require.resolve("web-tree-sitter")),"LICENSE"),path.join(target,"LICENSE_runtime"));
  await build({entryPoints:["src/source_symbol_worker.ts"],bundle:true,write:true,outfile:path.join(target,"worker.js"),platform:"browser",format:"iife",target:"chrome120",minify:true,external:["fs/promises","module","fs","path","url"],define:{"process.versions.node":"undefined"}});
}
