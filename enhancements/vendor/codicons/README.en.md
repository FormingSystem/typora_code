---
id: tools.typora.vendor.codicons
title: "Source of Codicons Icons and Usage"
kind: reference
status: maintained
domains:
  - tools
---

[Chinese](README.md)

<a id="section_1a13250f199a"></a>
# Chapter 1\_Source of Codicons Icons and Usage

This directory stores official SVGs contributed by Microsoft and Codicons contributors for use by Typora's source code management, commit history, diff viewing, status bar, workspace search, and file browsing. The graphics come from [microsoft/vscode-codicons](https://github.com/microsoft/vscode-codicons), fixed to commit [`1c47ab36a4bb845c437866405c2fa67b8ca0fe36`](https://github.com/microsoft/vscode-codicons/tree/1c47ab36a4bb845c437866405c2fa67b8ca0fe36). Installing and running with the fixed resources in this directory does not query native VS Code, and does not require online downloading or installation of icon fonts.

<a id="section_bdbbc2bd24b8"></a>
## 1.1\_Graphics and Operation Mapping

Icon ID continues to use the upstream public name; Local SVG filename uses `snake_case`. `icons.json` saves the original SVG string by icon ID for static import building. The original file is saved in `icons/` for source verification; The graphic path, fill, and size with `viewBox` have not been modified. The original canvas of `source-control`, `terminal`, and `settings-gear` is `24 × 24`, while the rest of the icons retain their upstream canvas; When displayed, the original `viewBox` should be retained, and scaled proportionally by layout size.

The repository list uses `repo`, selecting the regular repository icon based on the fixed VS Code `repository.ts`; this SVG is also taken from the fixed Codicons commit in this directory.

| Action | Upstream icon ID | Local original file |
| --- | --- | --- |
| Extended activity bar | `extensions` | [extensions.svg](icons/extensions.svg) |
| Markdown read preview | `preview` | [preview.svg](icons/preview.svg) |
| Git repository | `repo` | [repo.svg](icons/repo.svg) |
| View all changes in this group | `diff-multiple` | [diff_multiple.svg](icons/diff_multiple.svg) |
| Open Single File Changes | `compare-changes` | [compare_changes.svg](icons/compare_changes.svg) |
| Edit Full Path | `edit` | [edit.svg](icons/edit.svg) |
| Open File | `go-to-file` | [go_to_file.svg](icons/go_to_file.svg) |
| Discard Changes | `discard` | [discard.svg](icons/discard.svg) |
| Show Blanks in Diff | `whitespace` | [whitespace.svg](icons/whitespace.svg) |
| Remote History Reference | `cloud` | [cloud.svg](icons/cloud.svg) |
| Discard Changes Confirmation Warning | `warning` | [warning.svg](icons/warning.svg) |
| Timeline Source Filter | `filter` | [filter.svg](icons/filter.svg) |
| Stage Changes | `add` | [add.svg](icons/add.svg) |
| Unstage | `remove` | [remove.svg](icons/remove.svg) |
| Commit, Selected Menu Item | `check` | [check.svg](icons/check.svg) |
| Collapse Item, Submenu Direction | `chevron-right` | [chevron_right.svg](icons/chevron_right.svg) |
| Expand Item, Dropdown Button | `chevron-down` | [chevron_down.svg](icons/chevron_down.svg) |
| More operations | `more` | [more.svg](icons/more.svg) |
| Branches and history scope | `git-branch` | [git_branch.svg](icons/git_branch.svg) |
| Locate current commit | `target` | [target.svg](icons/target.svg) |
| Get remote updates | `git-fetch` | [git_fetch.svg](icons/git_fetch.svg) |
| Pull | `repo-pull` | [repo_pull.svg](icons/repo_pull.svg) |
| Push | `repo-push` | [repo_push.svg](icons/repo_push.svg) |
| Refresh | `refresh` | [refresh.svg](icons/refresh.svg) |
| Sync | `sync` | [sync.svg](icons/sync.svg) |
| Release branch | `cloud-upload` | [cloud_upload.svg](icons/cloud_upload.svg) |
| Commit history | `git-commit` | [git_commit.svg](icons/git_commit.svg) |
| File history and timeline | `history` | [history.svg](icons/history.svg) |
| Open external link | `link-external` | [link_external.svg](icons/link_external.svg) |
| Source control entry | `source-control` | [source_control.svg](icons/source_control.svg) |
| Workspace search | `search` | [search.svg](icons/search.svg) |
| Integrated terminal | `terminal` | [terminal.svg](icons/terminal.svg) |
| Settings | `settings-gear` | [settings_gear.svg](icons/settings_gear.svg) |
| Zoomed-in view entry | `zoom-in` | [zoom_in.svg](icons/zoom_in.svg) |
| Zoomed-out view entry | `zoom-out` | [zoom_out.svg](icons/zoom_out.svg) |
| Return to previous editing location | `arrow-left` | [arrow_left.svg](icons/arrow_left.svg) |
| Advance to next editing location | `arrow-right` | [arrow_right.svg](icons/arrow_right.svg) |
| Case sensitive | `case-sensitive` | [case_sensitive.svg](icons/case_sensitive.svg) |
| Whole word match | `whole-word` | [whole_word.svg](icons/whole_word.svg) |
| Use regular expressions | `regex` | [regex.svg](icons/regex.svg) |
| Replace one | `replace` | [replace.svg](icons/replace.svg) |
| Replace all | `replace-all` | [replace_all.svg](icons/replace_all.svg) |
| Replace while preserving case | `preserve-case` | [preserve_case.svg](icons/preserve_case.svg) |
| Clear search results | `clear-all` | [clear_all.svg](icons/clear_all.svg) |
| All collapse | `collapse-all` | [collapse_all.svg](icons/collapse_all.svg) |
| All expanded | `expand-all` | [expand_all.svg](icons/expand_all.svg) |
| Stop search | `search-stop` | [search_stop.svg](icons/search_stop.svg) |
| List view | `list-flat` | [list_flat.svg](icons/list_flat.svg) |
| Tree view | `list-tree` | [list_tree.svg](icons/list_tree.svg) |
| Close or remove result | `close` | [close.svg](icons/close.svg) |
| Folder | `folder` | [folder.svg](icons/folder.svg) |
| Expanded folder | `folder-opened` | [folder_opened.svg](icons/folder_opened.svg) |
| regular file | `file` | [file.svg](icons/file.svg) |
| New file | `new-file` | [new_file.svg](icons/new_file.svg) |
| previous result | `arrow-up` | [arrow_up.svg](icons/arrow_up.svg) |
| next result | `arrow-down` | [arrow_down.svg](icons/arrow_down.svg) |
| Search only changes in source code management | `edit-code` | [edit_code.svg](icons/edit_code.svg) |
| Search only open editors | `book` | [book.svg](icons/book.svg) |
| use exclusion settings and ignore files | `exclude` | [exclude.svg](icons/exclude.svg) |

two IDs use upstream alias: `more` corresponds to `src/icons/ellipsis.svg`, `compare-changes` corresponds to `src/icons/git-compare.svg`. The mapping relationship is taken from the same commit's [src/template/mapping.json](https://github.com/microsoft/vscode-codicons/blob/1c47ab36a4bb845c437866405c2fa67b8ca0fe36/src/template/mapping.json). They are not alternative graphics for this repository's redraw.

This commit does not have `search-refresh` icon; refresh search uses existing `refresh`, does not add self-made aliases.

<a id="section_eb999f40b24d"></a>
## 1.2 _source verification and license attribution

[source_manifest.json](source_manifest.json) records the upstream relative path of each icon and license, the Git blob SHA-1 in the fixed commit, and the SHA-256 of the downloaded bytes. Before saving resources, each downloaded file's `blob <字节数>\0<原始字节>` digest was compared item by item with the Git tree in the fixed commit. Each string of `icons.json` is re-encoded as UTF-8, and is consistent with the corresponding original SVG bytes. [SHA256SUMS](SHA256SUMS) is used for subsequent offline verification of directory contents; the original SVG and licenses are prohibited from line breaks conversion in this directory `.gitattributes`.

Microsoft and Codicons contributors retain the copyright of the original graphics and code. The upstream will authorize the documentation and other contents under **CC BY 4.0**, and the code under **MIT**, see the upstream license explanation in the same commit's [upstream license explanation](https://github.com/microsoft/vscode-codicons/blob/1c47ab36a4bb845c437866405c2fa67b8ca0fe36/README.md#legal-notices). This directory retains the complete [LICENSE](LICENSE) and [LICENSE_CODE](LICENSE_CODE); the latter corresponds to the upstream file `LICENSE-CODE`, only the filename changes, the content bytes remain unchanged.

The organization of this repository is limited to selecting the above icons, changing the local filenames to `snake_case`, establishing the JSON mapping and digest list, and writing this Chinese explanation. The SVG graphics are kept as original. When distributing these graphics, the source, author attribution, license files, and the above organization explanation should be retained simultaneously. The original icon licenses do not grant the trademark rights of Microsoft products, brands, or logos; these operation icons are only used to express the corresponding interface functions.

This round's top bar uses `chrome-minimize`, `chrome-maximize`, `chrome-restore`, `chrome-close`; Activity uses `files`, `search`, `source-control`, `symbol-class`, respectively corresponding to file, search, source code management, and outline. Git references use `tag` and `archive`.

Add hover card for commit with `account` and `copy` original icons for the author and copy commit number, respectively, and the source and summary are uniformly registered in `source_manifest.json` and `SHA256SUMS`.
