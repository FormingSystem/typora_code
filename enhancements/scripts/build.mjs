import "./build_terminal_assets.mjs";
import { build } from "esbuild";
import fs from "node:fs";
import { editor_plugins } from "./editor_bundle.cjs";

await build({
  entryPoints: ["src/typora_enhancements.ts"],
  bundle: true,
  plugins: editor_plugins(),
  format: "iife",
  globalName: "LinuxNoteTyporaEnhancements",
  platform: "browser",
  target: ["chrome120"],
  // 保留上游字符串中的空白值，同时避免生成文件出现行尾空格。
  supported: { "template-literal": false },
  outfile: "dist/typora_enhancements.js",
  legalComments: "inline",
  banner: { js: "/*! Marked 14.0.0 (MIT)\n" + fs.readFileSync("node_modules/marked/LICENSE.md", "utf8") + "\n*/\n" + "/*! DOMPurify 3.4.14 (Apache-2.0 or MPL-2.0)\n" + fs.readFileSync("node_modules/dompurify/LICENSE", "utf8") + "\n*/\n" + "/*! Monaco Editor 0.56.0 (MIT)\n" + fs.readFileSync("node_modules/monaco-editor/LICENSE", "utf8") + "\n*/\n" + "/*! xterm.js 6.0.0, FitAddon 0.11.0, SearchAddon 0.16.0 (MIT)\n" + fs.readFileSync("node_modules/@xterm/xterm/LICENSE", "utf8") + "\n*/\n" + "/*! gemoji 4.1.0 Unicode data\n" + fs.readFileSync("vendor/gemoji/LICENSE", "utf8") + "\n*/\n" + "/*! Microsoft VS Code Codicons - https://github.com/microsoft/vscode-codicons\nCommit 1c47ab36a4bb845c437866405c2fa67b8ca0fe36; graphics licensed CC BY 4.0, code MIT.\nOriginal SVG paths preserved; display dimensions and fill inherit the current interface theme.\nhttps://creativecommons.org/licenses/by/4.0/\n" + fs.readFileSync("vendor/codicons/LICENSE_CODE", "utf8") + "\n*/" },
  loader: {
    ".css": "text",
    ".wasm": "binary"
  },
  logLevel: "info"
});

// 上游许可证可能来自 CRLF 工作树；与仓库的 eol=lf 保持一致，确保提交前后安装摘要相同。
const bundle_path = "dist/typora_enhancements.js";
fs.writeFileSync(bundle_path, fs.readFileSync(bundle_path, "utf8").replace(/\r\n?/gu, "\n"));
