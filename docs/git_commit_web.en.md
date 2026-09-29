[Chinese](git_commit_web.md)

<a id="section_bd083e854934"></a>
# R062 Host web entry for commit

2026-09-20 User requires that the commit floating panel provides a web entry like VS Code, and identifies GitHub, Gitee, etc., based on the actual Git remote. The current status is that the commit menu's `commit_github_url` only supports GitHub, and the floating panel only provides copy. Both areas must consume the same service and cannot each construct their own URL.

<a id="section_ccff7bc08855"></a>
## Interaction and Status

Keep the copy of the short hash at the bottom of the commit floating panel. Display 'Open on {platform}' in the same line, separated by a line. Use the existing official link-external icon, common button, and focus style. One identifiable target directly executes; multiple different targets display 'Open on remote...', and choose once. Entries include remote name, platform, and the repository address without credentials. Remotes are arranged by tracking, origin, and other stable ones, but the sorting is not considered as the user has already selected. Duplicate commit URLs are removed. No zero actions. The menu and floating panel reuse the same operation. When there is no remote, local path, or unknown site, the floating panel does not create links, and the menu disables 'Open on remote'.

Git already has repository_state responsible for remote and tracking; the pure parsing module is responsible for platform and URL, and the UI only organizes the presentation. Hovering does not connect to the internet or perform additional Git queries; clicking uses the existing runner to read-only verify remote get-url. When the selected repository changes, switching repositories, runner replacement, destruction, or read failure do not open the outdated target. During one operation, duplicate clicks are blocked. Browser failures are reported in the current workspace. Ordinary opening does not require confirmation, does not fetch, does not push. The link does not mean the commit has been pushed to the remote. Whether the commit has been pushed to the remote or whether the web access permission is available by the host platform is feedback by the host platform, and it is not allowed to automatically push for the link.

<a id="section_88167b99ed6c"></a>
## Platform and address rules

| Platform domain | Commit path |
| --- | --- |
| github.com | /owner/repo/commit/{complete hash} |
| gitee.com | /owner/repo/commit/{complete hash} |
| gitlab.com | /group/subgroup/repo/-/commit/{complete hash} |
| bitbucket.org (SSH also identifies ssh.bitbucket.org) | /workspace/repo/commits/{complete hash} |

Supports HTTPS/HTTP, ssh://, scp-style [user@]host:path; only outputs the HTTPS web of identified sites. Remove .git and trailing slash, encode path segment by segment; user name and password do not enter the display or open address. Reject local paths, other protocols, forged domains, non-complete object IDs, empty segments, path traversal (including segments formed after stripping .git), and encoded slashes / control characters. The SSH port is not considered as a web port. The domain can only determine these public host services, and self-built GitLab/Gitea, SSH Host alias, and other unknown sites without reliable evidence are not guessed; subsequent adaptation should add providers with evidence, and it is not allowed to consider 'name contains git' as identification. PR templates have different purposes, and this round does not reuse or rewrite the PR generator.

<a id="section_ead9d4fd7fd3"></a>
## Source and verification

Fix VS Code `645f29cc3176500b4b5762ba887cf2a7f0ffdf2c` [hover.ts](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/extensions/git/src/hover.ts) appendCommands to group separated connection commands, pass commit hash to processHoverRemoteCommands; continue R053's 12px/19px layout, do not increase floating layer font size. Gitee itself [help export](https://gitee.com/oschina/git-osc/wikis/pages/export?doc_id=10526&type=pdf) records /commit/ links; [GitLab commits API](https://docs.gitlab.com/api/commits/) web_url includes /-/commit/; [Bitbucket commits API](https://developer.atlassian.com/cloud/bitbucket/rest/api-group-commits/) provides web links, [SSH migration announcement](https://developer.atlassian.com/cloud/bitbucket/changelog/#12-may-2026) explains ssh.bitbucket.org maps to bitbucket.org.

Unit: four platforms, HTTP/SSH/scp, with credentials, nested paths, fake host, no remote, multi-remote sort and deduplication, 20/100/1000 parsing loops. Function: real floating layer and menu share the same entry point, links and copy are aligned, one selection/cancellation, read failure, repeated click, database delay rejection, light/dark and scaling. System: independent Typora repository configuration for real remote, renderer triggers commit floating layer, intercept browser boundary to verify target (without accessing real account or push); formal build, install assets and protection items leave evidence. Unexecuted boundary and failure reasons are retained in the current evidence, cannot equate link generation with network accessibility verification.

<a id="section_f9f35dc3cb06"></a>
## This round of verification and delivery

2026.09.20.12 has been installed, 29 assets and static head are consistent, 5 host/user configuration summaries are unchanged, installation check is OK. Complete check, two related UIs, 20/100/1000 parsing loops and original Typora33 assertions pass; 8 groups of UI light/dark/scaling/wide/narrow leave evidence, random light/dark screenshots pass. User window has not been restarted, needs to save and then normally restart to load; no push. Detailed source, first test migration failure, installation verification and native screenshot restrictions see [evidence](../enhancements/tests/evidence/git_commit_web_20260920.json).
