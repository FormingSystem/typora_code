# Typora workspace dependency

Pinned upstream: [typora-community-plugin 2.10.15](https://github.com/typora-community-plugin/typora-community-plugin/releases/tag/2.10.15).

The version directory contains unmodified release assets, licensed under MIT; see LICENSE.md. SHA256SUMS records each original asset. Release archive SHA-256: `40aeb5cb50ab9afd1c90d67a7bafbe0f7a0696f51dd3776dfa082daaafd80bc2`.

Only the workspace core, stylesheet and locales are distributed. Upstream installers and loader are not executed. Repository installers discover Typora and its user data at runtime, verify these assets and back up every overwritten file. The repository bootstrap loads this pinned core and configures editor groups through its existing APIs.
