import fs from "node:fs";
import path from "node:path";

const output = path.resolve("dist/workbench.js");
if (!fs.existsSync(output)) throw new Error("dist/workbench.js is missing; run npm run build");
const source = fs.readFileSync(output, "utf8");
const enhancement_css = fs.readFileSync(path.resolve("src/typora_enhancements.css"), "utf8");
const runtime_source = fs.readFileSync(path.resolve("dist/workspace_core.js"), "utf8");
const static_css = fs.readFileSync(path.resolve("dist/workspace.css"), "utf8");
if (!source.includes('Symbol.for("typora-code:workspace")')) throw new Error("resident core bridge is missing");
if (!source.includes("start_typora_code")) throw new Error("resident startup entry is missing");
for (const forbidden of ["PluginManager", "InternalPluginManager", "class linux_note_enhancements_plugin", "plugins/loader.json"]) {
  if (source.includes(forbidden) || runtime_source.includes(forbidden)) throw new Error(`Previous plugin lifecycle remains: ${forbidden}`);
}
if (!source.includes('bind_community_plugins') || (source.match(/typora-plugin-core@v2/g)||[]).length!==1 || runtime_source.includes('typora-plugin-core@v2')) throw new Error('Community ABI must be exposed only by the resident workbench adapter');
for (const marker of [
  "linux-note-vscode-textmate-",
  "reading-media-viewer",
  "reading-media-entry",
  "linux-note-code-collapsible",
  "linux-note-code-toggle",
  "is-code-collapsed",
  "bind_reading_media_entries",
  "mermaid_container_for_preview",
  "fit-width",
  "data-linux-note-typora-enhancements",
]) {
  if (!source.includes(marker)) throw new Error(`bundle marker is missing: ${marker}`);
}
if (source.includes("schedule_mermaid_positions")) {
  throw new Error("obsolete viewport-following Mermaid positioner is still bundled");
}
for (const marker of ['load_code_themes','typora-code-official-code-theme','editor.foreground']) {
  if (!source.includes(marker)) throw new Error('Official code theme pipeline missing: '+marker);
}
for(const [file,identity,color] of [['vscode_default_light.css','light','#3B3B3B'],['vscode_default_dark.css','dark','#CCCCCC'],['vscode_2026_default_light.css','light_2026','#202020'],['vscode_2026_default_dark.css','dark_2026','#BBBEBF']]){
  const theme=fs.readFileSync(path.resolve('..',file),'utf8');
  for(const marker of [`--workspace-code-theme: ${identity};`,`--text-color: ${color}`,`--theme-heading: ${identity.startsWith('dark')?'#CE9178':'#0066CC'}`, 'vscode_default/base.css'])if(!theme.includes(marker))throw Error(file+' missing '+marker);
}
console.log(`validated ${path.relative(process.cwd(), output)} (${source.length} bytes)`);
