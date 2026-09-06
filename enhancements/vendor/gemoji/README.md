---
id: tools.typora.vendor.gemoji
title: "Gemoji 短代码数据来源"
kind: reference
status: maintained
domains:
  - tools
---

# 第1章\_Gemoji短代码数据来源

Git Graph 使用 GitHub Gemoji `v4.1.0` 的 Unicode 短代码数据，补充常用 emoji 与别名。原始数据来自 [emoji.json](https://github.com/github/gemoji/blob/v4.1.0/db/emoji.json)，许可证来自 [MIT LICENSE](https://github.com/github/gemoji/blob/v4.1.0/LICENSE)。两个文件保持下载字节，摘要记录在 `SHA256SUMS`。

构建时将数据编入 bundle，并将完整许可证写入 bundle 的开头，因此普通安装无需联网和 Ruby，也不依赖本机 emoji 数据。自定义短代码映射优先于内置映射；显示字形由系统字体决定。
