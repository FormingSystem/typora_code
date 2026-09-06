import assert from "node:assert/strict";
import fs from "node:fs";
import { transform } from "esbuild";

const compiled = await transform(fs.readFileSync("src/file_language.ts", "utf8"), {loader: "ts", format: "esm"});
const {FILE_LANGUAGE_RULES, match_file_language, detect_file_language, is_markdown_file, detect_binary_bytes, decode_file_bytes} = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString("base64")}`);
const cases = [
  ["index.d.ts", "typescript", ".d.ts"], ["index.d.mts", "typescript", ".d.mts"], ["index.d.cts", "typescript", ".d.cts"],
  ["index.test.ts", "typescript", ".ts"], ["a.test.custom.ts", "typescript", ".ts"], ["theme.module.css", "css", ".module.css"],
  [".env.local", "ini", ".env.*"], [".env.development.local", "ini", ".env.*"], ["Dockerfile.dev", "dockerfile", "Dockerfile.*"],
  ["Dockerfile.dev.test", "dockerfile", "Dockerfile.*"], ["source.tar.gz", "plaintext", ".tar.gz"], ["source.test.tar.xz", "plaintext", ".tar.xz"],
  ["README.zh-CN.md", "markdown", ".md"], ["test.someextension", "plaintext", ""], [".hidden", "plaintext", ""],
  ["CMakeLists.txt", "cmake", "CMakeLists.txt"], ["Kconfig.debug", "kconfig", "Kconfig.*"], ["Makefile.arm", "makefile", "Makefile.*"],
  [".config", "plaintext", ""], [".gitignore", "ignore", ".gitignore"], [".gitmodules", "ini", ".gitmodules"],
  ["kernel.c", "c", ".c"], ["kernel.C", "cpp", ".C"], ["kernel.h", "c", ".h"], ["kernel.H", "cpp", ".H"], ["entry.S", "asm", ".s"],
  ["arch.dtsi", "dts", ".dtsi"], ["messages.proto", "proto", ".proto"], ["README.MD", "markdown", ".md"], ["/src/.hidden/sub.hidden/source.py", "python", ".py"],
  ["C:\\notes\\.hidden\\README.zh-CN.md", "markdown", ".md"], ["C:\\notes\\.hidden.ts\\unknown", "plaintext", ""],
];
for (const [file_path, language, pattern] of cases) {
  assert.equal(detect_file_language(file_path), language, file_path);
  assert.equal(match_file_language(file_path).pattern, pattern, file_path);
}
assert.equal(match_file_language("a.tar.gz").category, "archive");
assert.equal(match_file_language("a.png").category, "binary");
assert.equal(is_markdown_file("a.zh-CN.markdown"), true);
assert.equal(is_markdown_file(".hidden/README.zh-CN.md"), true);
assert.equal(is_markdown_file("notes.mdx"), false);
assert.equal(is_markdown_file("notes.md.bak"), false);
for (const rule of FILE_LANGUAGE_RULES) {
  for (const filename of rule.filenames || []) assert.equal(detect_file_language(filename), rule.language, filename);
  for (const prefix of rule.filename_prefixes || []) assert.equal(detect_file_language(prefix + "debug.local"), rule.language, prefix);
}
const shebang_cases = [
  ["#!/usr/bin/python3.12", "python"], ["#!/usr/bin/env python3", "python"], ["#!/usr/bin/env -S python3 -u", "python"],
  ["#!/usr/bin/env -u PYTHONHOME X=1 python3", "python"], ["#!/usr/bin/env -C /src python3", "python"],
  ["#!/usr/bin/env -S 'python3 -u'", "python"], ["#!/bin/bash", "shell"], ["#!/bin/sh", "shell"],
  ["#!/usr/bin/env node", "javascript"], ["#!/usr/bin/env pwsh", "powershell"], ["#!/usr/bin/env ruby", "ruby"],
  ["#!/usr/bin/perl", "perl"], ["#!/usr/bin/php8.3", "php"], ["#!/usr/bin/lua5.4", "lua"], ["#!/usr/bin/env Rscript", "r"],
  ["\uFEFF#!/bin/sh\nignored", "shell"], ["print('python')", "plaintext"], ["#!/usr/bin/env -S", "plaintext"],
  ["#!/usr/bin/unknown", "plaintext"], ["ordinary\n#!/bin/bash", "plaintext"],
];
for (const [first_line, language] of shebang_cases) assert.equal(detect_file_language("script", first_line), language, first_line);
assert.equal(detect_file_language("script.py", "#!/bin/sh"), "python", "显式文件名规则优先于首行");
const utf8 = value => new TextEncoder().encode(value);
for (const text of ["", "中文\nHello\tWorld\r\n", "# title\n".repeat(1000), "\uFEFF中文💡"])
  assert.equal(detect_binary_bytes(utf8(text)), false);
for (const bytes of [new Uint8Array([0, 1, 2, 3]), utf8("hello\0world"), utf8("%PDF-1.7\n"), new Uint8Array([0x1f, 0x8b, 8]), new Uint8Array([0x50, 0x4b, 3, 4]), new Uint8Array([1, 2, 3, 65])])
  assert.equal(detect_binary_bytes(bytes), true);
assert.equal(detect_binary_bytes(new Uint8Array([0xd6, 0xd0, 0xce, 0xc4])), false, "GBK 文本不能仅因非 UTF-8 被归为二进制");
assert.equal(decode_file_bytes(new Uint8Array([0xd6, 0xd0, 0xce, 0xc4]), "gbk").text, "中文");
assert.throws(() => decode_file_bytes(new Uint8Array([0xd6, 0xd0, 0xce, 0xc4])), TypeError, "非法 UTF-8 不得静默替换");
assert.deepEqual(decode_file_bytes(utf8("\uFEFF中文💡"), "gbk"), {text: "中文💡", encoding: "utf-8", bom: true});
for (const encoding of ["utf-16le", "utf-16be"]) {
  const text = "中文\nconst x = '💡';\r\n";
  const bytes = new Uint8Array(2 + text.length * 2);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 0xfeff, encoding === "utf-16le");
  for (let index = 0; index < text.length; index++) view.setUint16(2 + index * 2, text.charCodeAt(index), encoding === "utf-16le");
  assert.equal(detect_binary_bytes(bytes), false, encoding);
  assert.deepEqual(decode_file_bytes(bytes), {text, encoding, bom: true});
}
assert.equal(detect_binary_bytes(new Uint8Array([0xff, 0xfe, 0, 0])), true, "UTF-32 不冒充 UTF-16");
assert.equal(decode_file_bytes(utf8("normal text")).bom, false);
assert.equal(detect_binary_bytes(utf8("\uFEFF" + "a".repeat(8188) + "💡")), false, "取样边界不得截断字符后误判二进制");
const tar_sample = new Uint8Array(300).fill(65); tar_sample.set(utf8("ustar"), 257);
assert.equal(detect_binary_bytes(tar_sample), true);
console.log(`file language: ${cases.length} names, ${shebang_cases.length} shebangs, ${FILE_LANGUAGE_RULES.length} rules, compound suffixes, hidden paths, binary signatures and BOM decoding passed`);
