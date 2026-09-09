import "./build_terminal_assets.mjs";
import { build } from "esbuild";
import fs from "node:fs";
import { editor_plugins } from "./editor_bundle.cjs";

const community_core_plugin = {
  name: "typora-community-core",
  setup(build_context) {
    build_context.onResolve({ filter: /^@typora-community-plugin\/core$/ }, () => ({
      path: "core",
      namespace: "typora-community-core",
    }));
    build_context.onLoad({ filter: /^core$/, namespace: "typora-community-core" }, () => ({
      contents: [
        'const core = window[Symbol.for("typora-plugin-core@v2")];',
        'if (!core?.Plugin) throw new Error("Typora Community Plugin core is unavailable.");',
        'export const Plugin = core.Plugin;',
      ].join("\n"),
      loader: "js",
    }));
  },
};

await build({
  entryPoints: ["src/community_plugin.ts"],
  bundle: true,
  plugins: [community_core_plugin, ...editor_plugins()],
  format: "esm",
  platform: "browser",
  target: ["chrome120"],
  // 保留上游字符串中的空白值，同时避免生成文件出现行尾空格。
  supported: { "template-literal": false },
  outfile: "dist/community_plugin/main.js",
  legalComments: "inline",
  banner: { js: "/*! Marked 14.0.0 (MIT)\n" + fs.readFileSync("node_modules/marked/LICENSE.md", "utf8") + "\n*/\n" + "/*! DOMPurify 3.4.14 (Apache-2.0 or MPL-2.0)\n" + fs.readFileSync("node_modules/dompurify/LICENSE", "utf8") + "\n*/\n" + "/*! Monaco Editor 0.56.0 (MIT)\n" + fs.readFileSync("node_modules/monaco-editor/LICENSE", "utf8") + "\n*/\n" + "/*! xterm.js 6.0.0, FitAddon 0.11.0, SearchAddon 0.16.0 (MIT)\n" + fs.readFileSync("node_modules/@xterm/xterm/LICENSE", "utf8") + "\n*/\n" + "/*! gemoji 4.1.0 Unicode data\n" + fs.readFileSync("vendor/gemoji/LICENSE", "utf8") + "\n*/\n" + "/*! Microsoft VS Code Codicons - https://github.com/microsoft/vscode-codicons\nCommit 1c47ab36a4bb845c437866405c2fa67b8ca0fe36; graphics licensed CC BY 4.0, code MIT.\nOriginal SVG paths preserved; display dimensions and fill inherit the current interface theme.\nhttps://creativecommons.org/licenses/by/4.0/\n" + fs.readFileSync("vendor/codicons/LICENSE_CODE", "utf8") + "\n*/" },
  loader: {
    ".css": "text",
    ".wasm": "binary"
  },
  logLevel: "info"
});

// 上游许可证可能来自 CRLF 工作树；与仓库的 eol=lf 保持一致，确保提交前后安装摘要相同。
const bundle_path = "dist/community_plugin/main.js";
fs.writeFileSync(bundle_path, fs.readFileSync(bundle_path, "utf8").replace(/\r\n?/gu, "\n"));
// 统一文本资产换行；平台差异不能改变已经发布的三文件摘要。
for (const name of ["manifest.json", "style.css"]) fs.writeFileSync("dist/community_plugin/" + name, fs.readFileSync("community_plugin/" + name, "utf8").replace(/\r\n?/gu, "\n"), "utf8");

const { createHash } = await import("node:crypto");
const plugin_assets = ["main.js", "manifest.json", "style.css"];
const plugin_checksums = plugin_assets.map((asset) => {
  const digest = createHash("sha256").update(fs.readFileSync(`dist/community_plugin/${asset}`)).digest("hex");
  return `${digest}  ${asset}`;
});
fs.writeFileSync("dist/community_plugin/SHA256SUMS", plugin_checksums.join("\n") + "\n");
