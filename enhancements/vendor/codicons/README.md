---
id: tools.typora.vendor.codicons
title: "Codicons 图标来源与使用"
kind: reference
status: maintained
domains:
  - tools
---

# 第1章\_Codicons图标来源与使用

本目录保存 Microsoft 与 Codicons 贡献者提供的 官方 SVG，供 Typora 的源代码管理、提交历史、差异查看、状态栏、工作区搜索和文件浏览共用。图形来自 [microsoft/vscode-codicons](https://github.com/microsoft/vscode-codicons)，固定到提交 [`1c47ab36a4bb845c437866405c2fa67b8ca0fe36`](https://github.com/microsoft/vscode-codicons/tree/1c47ab36a4bb845c437866405c2fa67b8ca0fe36)。安装与运行使用本目录的固定资源，不查询本机 VS Code，不需要联网下载图标或安装图标字体。

## 1.1\_图形与操作映射

图标 ID 沿用上游公共名称；本地 SVG 文件名使用 `snake_case`。`icons.json` 按图标 ID 保存原始 SVG 字符串，供构建静态引入。原始文件保存在 `icons/`，用于核对来源；图形路径、填色、尺寸与 `viewBox` 均未修改。`source-control`、`terminal` 和 `settings-gear` 的原始画布为 `24 × 24`，其余图标保留各自的上游画布；显示时应保留原始 `viewBox`，通过布局尺寸等比缩放。

仓库列表使用 `repo`，依据固定 VS Code `repository.ts` 的普通仓库图标选择；该 SVG 同样取自本目录固定的 Codicons 提交。

| 操作 | 上游图标 ID | 本地原始文件 |
| --- | --- | --- |
| Markdown 阅读预览 | `preview` | [preview.svg](icons/preview.svg) |
| Git 仓库 | `repo` | [repo.svg](icons/repo.svg) |
| 查看本组全部更改 | `diff-multiple` | [diff_multiple.svg](icons/diff_multiple.svg) |
| 打开单文件更改 | `compare-changes` | [compare_changes.svg](icons/compare_changes.svg) |
| 打开文件 | `go-to-file` | [go_to_file.svg](icons/go_to_file.svg) |
| 放弃更改 | `discard` | [discard.svg](icons/discard.svg) |
| Diff 空白字符显示 | `whitespace` | [whitespace.svg](icons/whitespace.svg) |
| 远端历史引用 | `cloud` | [cloud.svg](icons/cloud.svg) |
| 放弃更改确认警告 | `warning` | [warning.svg](icons/warning.svg) |
| 时间线来源筛选 | `filter` | [filter.svg](icons/filter.svg) |
| 暂存更改 | `add` | [add.svg](icons/add.svg) |
| 取消暂存 | `remove` | [remove.svg](icons/remove.svg) |
| 提交、已选菜单项 | `check` | [check.svg](icons/check.svg) |
| 折叠项、子菜单方向 | `chevron-right` | [chevron_right.svg](icons/chevron_right.svg) |
| 展开项、下拉按钮 | `chevron-down` | [chevron_down.svg](icons/chevron_down.svg) |
| 更多操作 | `more` | [more.svg](icons/more.svg) |
| 分支与历史范围 | `git-branch` | [git_branch.svg](icons/git_branch.svg) |
| 定位当前提交 | `target` | [target.svg](icons/target.svg) |
| 获取远端更新 | `git-fetch` | [git_fetch.svg](icons/git_fetch.svg) |
| 拉取 | `repo-pull` | [repo_pull.svg](icons/repo_pull.svg) |
| 推送 | `repo-push` | [repo_push.svg](icons/repo_push.svg) |
| 刷新 | `refresh` | [refresh.svg](icons/refresh.svg) |
| 同步 | `sync` | [sync.svg](icons/sync.svg) |
| 发布分支 | `cloud-upload` | [cloud_upload.svg](icons/cloud_upload.svg) |
| 提交记录 | `git-commit` | [git_commit.svg](icons/git_commit.svg) |
| 文件历史与时间线 | `history` | [history.svg](icons/history.svg) |
| 打开外部链接 | `link-external` | [link_external.svg](icons/link_external.svg) |
| 源代码管理入口 | `source-control` | [source_control.svg](icons/source_control.svg) |
| 工作区搜索 | `search` | [search.svg](icons/search.svg) |
| 集成终端 | `terminal` | [terminal.svg](icons/terminal.svg) |
| 设置 | `settings-gear` | [settings_gear.svg](icons/settings_gear.svg) |
| 窗口放大状态入口 | `zoom-in` | [zoom_in.svg](icons/zoom_in.svg) |
| 窗口缩小状态入口 | `zoom-out` | [zoom_out.svg](icons/zoom_out.svg) |
| 返回上一个编辑位置 | `arrow-left` | [arrow_left.svg](icons/arrow_left.svg) |
| 前进到下一个编辑位置 | `arrow-right` | [arrow_right.svg](icons/arrow_right.svg) |
| 区分大小写 | `case-sensitive` | [case_sensitive.svg](icons/case_sensitive.svg) |
| 全字匹配 | `whole-word` | [whole_word.svg](icons/whole_word.svg) |
| 使用正则表达式 | `regex` | [regex.svg](icons/regex.svg) |
| 替换一处 | `replace` | [replace.svg](icons/replace.svg) |
| 替换全部 | `replace-all` | [replace_all.svg](icons/replace_all.svg) |
| 替换时保留大小写 | `preserve-case` | [preserve_case.svg](icons/preserve_case.svg) |
| 清除搜索结果 | `clear-all` | [clear_all.svg](icons/clear_all.svg) |
| 全部折叠 | `collapse-all` | [collapse_all.svg](icons/collapse_all.svg) |
| 全部展开 | `expand-all` | [expand_all.svg](icons/expand_all.svg) |
| 停止搜索 | `search-stop` | [search_stop.svg](icons/search_stop.svg) |
| 列表展示 | `list-flat` | [list_flat.svg](icons/list_flat.svg) |
| 树形展示 | `list-tree` | [list_tree.svg](icons/list_tree.svg) |
| 关闭或移除结果 | `close` | [close.svg](icons/close.svg) |
| 文件夹 | `folder` | [folder.svg](icons/folder.svg) |
| 已展开文件夹 | `folder-opened` | [folder_opened.svg](icons/folder_opened.svg) |
| 普通文件 | `file` | [file.svg](icons/file.svg) |
| 新建文件 | `new-file` | [new_file.svg](icons/new_file.svg) |
| 上一个结果 | `arrow-up` | [arrow_up.svg](icons/arrow_up.svg) |
| 下一个结果 | `arrow-down` | [arrow_down.svg](icons/arrow_down.svg) |
| 仅搜索源代码管理中的更改文件 | `edit-code` | [edit_code.svg](icons/edit_code.svg) |
| 仅搜索已打开的编辑器 | `book` | [book.svg](icons/book.svg) |
| 使用排除设置与忽略文件 | `exclude` | [exclude.svg](icons/exclude.svg) |

两个 ID 使用上游已有别名：`more` 对应 `src/icons/ellipsis.svg`，`compare-changes` 对应 `src/icons/git-compare.svg`。对应关系取自同一提交的 [src/template/mapping.json](https://github.com/microsoft/vscode-codicons/blob/1c47ab36a4bb845c437866405c2fa67b8ca0fe36/src/template/mapping.json)。它们不是本仓库重新绘制的替代图形。

该提交没有 `search-refresh` 图标；刷新搜索使用已有的 `refresh`，不添加自造别名。

## 1.2\_来源校验与许可归属

[source_manifest.json](source_manifest.json) 记录每个图标与许可证的上游相对路径、固定提交中的 Git blob SHA-1，以及下载字节的 SHA-256。保存资源前已将每个下载文件的 `blob <字节数>\0<原始字节>` 摘要与固定提交的 Git 文件树逐项比较。`icons.json` 的每个字符串重新编码为 UTF-8 后，与对应原始 SVG 字节一致。[SHA256SUMS](SHA256SUMS) 用于后续离线校验目录内容；原始 SVG 与许可证通过本目录 `.gitattributes` 禁止换行转换。

Microsoft 与 Codicons 贡献者保留原始图形及代码的著作权。上游将文档和其他内容按 **CC BY 4.0** 授权，将代码按 **MIT** 授权，详见同一提交的 [上游许可说明](https://github.com/microsoft/vscode-codicons/blob/1c47ab36a4bb845c437866405c2fa67b8ca0fe36/README.md#legal-notices)。本目录保留完整 [LICENSE](LICENSE) 与 [LICENSE_CODE](LICENSE_CODE)；后者对应上游文件 `LICENSE-CODE`，仅文件名变化，内容字节未改。

本仓库的整理工作限于选取上述图标、将本地文件名改为 `snake_case`、建立 JSON 映射与摘要清单，以及编写这份中文说明。SVG 图形保持原样。分发这些图形时应同时保留来源、作者归属、许可文件与上述整理说明。原始图标许可不授予 Microsoft 产品名称、品牌或标志的商标权；这些操作图标仅用于表达对应界面功能。

本轮标题栏使用 `chrome-minimize`、`chrome-maximize`、`chrome-restore`、`chrome-close`；Activity 使用 `files`、`search`、`source-control`、`symbol-class`，分别对应文件、搜索、源代码管理与大纲。Git 引用使用 `tag` 和 `archive`。

提交悬停卡片新增同一固定提交的 `account` 与 `copy` 原始图标，分别表示作者与复制提交号，来源和摘要统一登记在 `source_manifest.json` 与 `SHA256SUMS`。
