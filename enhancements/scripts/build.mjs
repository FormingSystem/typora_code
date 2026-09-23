import "./build_terminal_assets.mjs";
import {build_source_symbol_assets} from "./build_source_symbol_assets.mjs";
import { build } from "esbuild";
import fs from "node:fs";
import { editor_plugins } from "./editor_bundle.cjs";

import { build_workspace_core } from "./build_workspace_core.mjs";
import { build_workspace_styles, static_workspace_css_plugin } from "./build_workspace_styles.mjs";
import path from "node:path";
import {check_xterm_patch} from "./check_xterm_patch.mjs";

check_xterm_patch();

// 已退休的首帧脚本不能残留在发布目录。
fs.rmSync('dist/appearance_bootstrap.js',{force:true});
fs.mkdirSync('dist',{recursive:true});
fs.rmSync('dist/workspace_main.cjs',{force:true});
await build_workspace_core({outdir: path.resolve("dist")});
await build_workspace_styles({outdir: path.resolve("dist")});
await build_source_symbol_assets(path.resolve("dist"));
fs.mkdirSync("dist/licenses",{recursive:true});
fs.copyFileSync("vendor/fontawesome/LICENSE.txt","dist/licenses/fontawesome.txt");
fs.writeFileSync("dist/licenses/vscode_quick_open.txt",fs.readFileSync("vendor/vscode_quick_open/LICENSE.txt","utf8").replace(/\r\n?/gu,"\n"));
fs.copyFileSync("vendor/xterm/LICENSE","dist/licenses/xterm.txt");
fs.copyFileSync("vendor/xterm/SOURCE.json","dist/licenses/xterm_source.json");
// 公告与后台辅助程序随同一资产清单安装，普通用户不依赖源码仓库或全局Node。
const update_root="dist/assets/update";
fs.mkdirSync(update_root,{recursive:true});
const {release_info}=await import("../src/workspace_update_service.cjs");
const release_source=fs.readFileSync("release.json","utf8").replace(/\r\n?/gu,"\n");
release_info(JSON.parse(release_source));
fs.writeFileSync(`${update_root}/release.json`,release_source);
fs.writeFileSync(`${update_root}/runtime.json`,JSON.stringify({node_version:JSON.parse(fs.readFileSync("node_runtime.json","utf8")).version})+"\n");
for(const name of ["workspace_update_service.cjs","workspace_update_archive.ps1"])fs.writeFileSync(`${update_root}/${name}`,fs.readFileSync(`src/${name}`,"utf8").replace(/\r\n?/gu,"\n"));
fs.mkdirSync('dist/assets/plugins',{recursive:true});
fs.writeFileSync('dist/assets/plugins/community_plugin_service.cjs',fs.readFileSync('src/community_plugin_service.cjs','utf8').replace(/\r\n?/gu,'\n'));
fs.mkdirSync('dist/assets/remote',{recursive:true});
for(const name of ['remote_ssh_service.cjs','remote_ssh_askpass.mjs','remote_ssh_agent.py','remote_ssh_credentials.cjs'])fs.writeFileSync('dist/assets/remote/'+name,fs.readFileSync('src/'+name,'utf8').replace(/\r\n?/gu,'\n'));

const bundle_result=await build({
  entryPoints: ["src/workspace_entry.ts"],
  bundle: true,
  plugins: [static_workspace_css_plugin(), ...editor_plugins()],
  format: "iife",
  platform: "browser",
  target: ["chrome120"],
  // 保留上游字符串中的空白值，同时避免生成文件出现行尾空格。
  supported: { "template-literal": false },
  outfile: "dist/workbench.js",
  write: false,
  legalComments: "inline",
  banner: { js: "/*! Marked 14.0.0 (MIT)\n" + fs.readFileSync("node_modules/marked/LICENSE.md", "utf8") + "\n*/\n" + "/*! DOMPurify 3.4.14 (Apache-2.0 or MPL-2.0)\n" + fs.readFileSync("node_modules/dompurify/LICENSE", "utf8") + "\n*/\n" + "/*! Monaco Editor 0.56.0 (MIT)\n" + fs.readFileSync("node_modules/monaco-editor/LICENSE", "utf8") + "\n*/\n" + "/*! xterm.js 6.0.0, FitAddon 0.11.0, SearchAddon 0.16.0 (MIT)\n" + fs.readFileSync("node_modules/@xterm/xterm/LICENSE", "utf8") + "\n*/\n" + "/*! gemoji 4.1.0 Unicode data\n" + fs.readFileSync("vendor/gemoji/LICENSE", "utf8") + "\n*/\n" + "/*! Microsoft VS Code Codicons - https://github.com/microsoft/vscode-codicons\nCommit 1c47ab36a4bb845c437866405c2fa67b8ca0fe36; graphics licensed CC BY 4.0, code MIT.\nOriginal SVG paths preserved; display dimensions and fill inherit the current interface theme.\nhttps://creativecommons.org/licenses/by/4.0/\n" + fs.readFileSync("vendor/codicons/LICENSE_CODE", "utf8") + "\n*/" },
  loader: {
    ".css": "text",
    ".wasm": "binary"
  },
  logLevel: "info"
});

// 上游许可证可能来自 CRLF 工作树；与仓库的 eol=lf 保持一致，确保提交前后安装摘要相同。
const bundle_path = "dist/workbench.js";
// 在内存中统一换行后一次发布，避免刚生成的文件被映射时再次原地截断。
const bundle_output=bundle_result.outputFiles.find(file=>file.path===path.resolve(bundle_path));
if(!bundle_output)throw Error('Missing workbench bundle');
const bundle_temporary=`${bundle_path}.${process.pid}.tmp`;
try{
  fs.writeFileSync(bundle_temporary,bundle_output.text.replace(/\r\n?/gu,"\n"),{flag:'wx'});
  fs.renameSync(bundle_temporary,bundle_path);
}finally{fs.rmSync(bundle_temporary,{force:true});}
// 部署仅使用清单中的常驻资产；终端有独立的原生包与摘要。
const { createHash } = await import("node:crypto");
const workspace_assets = ["workspace_core.js", "workspace_core.css", "workspace.css", "workbench.js"];
function collect_assets(directory) {
  if (!fs.existsSync(`dist/${directory}`)) return;
  for (const item of fs.readdirSync(`dist/${directory}`, {withFileTypes:true})) {
    const relative = `${directory}/${item.name}`;
    if (item.isDirectory()) collect_assets(relative);
    else if (item.isFile()) workspace_assets.push(relative);
  }
}
for (const directory of ["assets", "locales", "licenses"]) collect_assets(directory);
const checksums = workspace_assets.sort().map((asset) => `${createHash("sha256").update(fs.readFileSync(`dist/${asset}`)).digest("hex")}  ${asset}`);
fs.writeFileSync("dist/SHA256SUMS", checksums.join("\n") + "\n");
