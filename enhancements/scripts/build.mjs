import "./build_terminal_assets.mjs";
import { build } from "esbuild";
import fs from "node:fs";

await build({
  entryPoints: ["src/typora_enhancements.ts"],
  bundle: true,
  format: "iife",
  globalName: "LinuxNoteTyporaEnhancements",
  platform: "browser",
  target: ["chrome120"],
  outfile: "dist/typora_enhancements.js",
  legalComments: "inline",
  banner: { js: "/*! xterm.js 6.0.0, FitAddon 0.11.0, SearchAddon 0.16.0 (MIT)\n" + fs.readFileSync("node_modules/@xterm/xterm/LICENSE", "utf8") + "\n*/\n" + "/*! gemoji 4.1.0 Unicode data\n" + fs.readFileSync("vendor/gemoji/LICENSE", "utf8") + "\n*/" },
  loader: {
    ".css": "text",
    ".wasm": "binary"
  },
  logLevel: "info"
});
