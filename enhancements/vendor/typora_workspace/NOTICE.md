# Typora workspace dependency

Pinned upstream: [typora-community-plugin 2.10.15](https://github.com/typora-community-plugin/typora-community-plugin/releases/tag/2.10.15).

The version directory contains unmodified release assets, licensed under MIT; see LICENSE.md. SHA256SUMS records each original asset. Release archive SHA-256: `40aeb5cb50ab9afd1c90d67a7bafbe0f7a0696f51dd3776dfa082daaafd80bc2`.

The distribution includes the official module loader, its pinned loader.json, core, stylesheet and locales. Repository installers discover Typora and its user data at runtime, verify SHA256SUMS and back up overwritten files; they do not execute upstream installer scripts. The official loader starts core 2.10.15, which loads TyporaCode as a community plugin from plugins/forming_system.linux_note_enhancements. There is no separate direct bundle bootstrap. Shared loader/core remain installed when other community plugins still depend on them.
