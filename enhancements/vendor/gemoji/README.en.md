---
id: tools.typora.vendor.gemoji
title: "Source of Gemoji Short Code Data"
kind: reference
status: maintained
domains:
  - tools
---

[Chinese](README.md)

<a id="section_bd75183b364d"></a>
# Chapter 1\_Source of Gemoji Short Code Data

Git Graph uses the Unicode short code data from GitHub Gemoji `v4.1.0`. It supplements common emojis and aliases. The original data comes from [emoji.json](https://github.com/github/gemoji/blob/v4.1.0/db/emoji.json), and the license comes from [MIT LICENSE](https://github.com/github/gemoji/blob/v4.1.0/LICENSE). The two files keep the downloaded byte count, and the digest is recorded in `SHA256SUMS`.

The data is compiled into a bundle during building, and the complete license is written at the beginning of the bundle. Therefore, a regular installation does not require internet access or Ruby, and does not depend on native emoji data. Custom short code mappings take precedence over built-in mappings; the display of glyphs is determined by the system font.
