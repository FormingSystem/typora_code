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
  legalComments: "linked",
  banner: { js: "/*! gemoji 4.1.0 Unicode data\n" + fs.readFileSync("vendor/gemoji/LICENSE", "utf8") + "\n*/" },
  loader: {
    ".css": "text",
    ".wasm": "binary"
  },
  logLevel: "info"
});
