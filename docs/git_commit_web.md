# R062 提交托管网页入口

2026-09-20 用户要求提交浮层像VS Code一样提供网页入口，并按实际Git远端识别GitHub、Gitee等平台。现状是提交菜单的`commit_github_url`只支持GitHub，浮层只提供复制；两处必须消费同一服务，不能各自拼URL。

## 交互与状态

提交浮层底部保留复制短哈希，同行分隔显示“在 {平台} 上打开”，使用现有官方link-external图标、共同按钮和焦点样式。一个可识别目标直接执行；多个不同目标显示“在远端打开…”并一次选择，条目包含远端名、平台及无凭据的仓库地址。远端按tracking、origin、其他稳定排列，但不把排序当用户已经选定；相同提交URL去重。取消零动作。菜单与浮层复用相同操作；无远端、本地路径或未知站点时浮层不造链接，菜单禁用“在远端打开”。

Git已有repository_state负责远端与tracking；纯解析模块负责平台与URL，UI只组织呈现。鼠标悬停不联网、不额外查询Git；点击后用已有runner只读复核remote get-url，选定仓库改变、切库、runner更换、销毁或读取失败均不打开过期目标。一次操作期间屏蔽重复点击；浏览器失败在当前工作区反馈。普通打开不加确认、不fetch、不push。链接不代表提交已推到远端，尚未推送或无网页访问权限由托管平台反馈，不能为了链接自动推送。

## 平台和地址规则

| 平台域名 | 提交路径 |
| --- | --- |
| github.com | /owner/repo/commit/{完整哈希} |
| gitee.com | /owner/repo/commit/{完整哈希} |
| gitlab.com | /group/subgroup/repo/-/commit/{完整哈希} |
| bitbucket.org（SSH同时识别ssh.bitbucket.org） | /workspace/repo/commits/{完整哈希} |

支持HTTPS/HTTP、ssh://、scp式[user@]host:path；仅输出已识别站点的HTTPS网页。去掉.git和尾斜线，逐段编码路径；用户名密码不进入展示或打开地址。拒绝本地路径、其他协议、伪造域名、非完整对象ID、空段、路径穿越（含剥离.git后形成的点段）及编码斜线／控制字符。SSH端口不当作网页端口。域名只能确定这些公共托管服务，自建GitLab/Gitea、SSH Host别名及其他未知站点没有可靠证据时不猜路由；后续适配应加有依据的provider，不能把“名称含git”当识别。PR模板用途不同，本轮不复用或改写PR生成器。

## 来源与验证

固定VS Code `645f29cc3176500b4b5762ba887cf2a7f0ffdf2c` [hover.ts](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/extensions/git/src/hover.ts) 的appendCommands以分组分隔连接命令，processHoverRemoteCommands传递提交hash；沿用R053的12px/19px排版，不增加浮层字号。Gitee自身[帮助导出](https://gitee.com/oschina/git-osc/wikis/pages/export?doc_id=10526&type=pdf)记录/commit/链接；[GitLab commits API](https://docs.gitlab.com/api/commits/)的web_url含/-/commit/；[Bitbucket commits API](https://developer.atlassian.com/cloud/bitbucket/rest/api-group-commits/)提供网页links，[SSH迁移公告](https://developer.atlassian.com/cloud/bitbucket/changelog/#12-may-2026)说明ssh.bitbucket.org映射网页bitbucket.org。

单元：四平台、HTTP/SSH/scp、带凭据、嵌套路径、伪造主机、无远端、多远端排序去重，20/100/1000解析循环。功能：真实浮层和菜单共用入口、链接与复制同排、一次选择/取消、读取失败、重复点击、切库迟到拒绝、明暗与缩放。系统：独立Typora仓库配置真实远端，renderer触发提交浮层，截获浏览器边界核对目标（不访问真实账号或推送）；正式构建、安装资产和保护项留证。未执行边界和失败原因保留在当次证据，不能将链接生成等同联网可访问验证。

## 本轮验证与交付

2026.09.20.12已安装，29项资产及静态head一致，5项宿主/用户配置摘要不变，安装检查OK。完整check、两组相关UI、20/100/1000解析循环与原始Typora33断言通过；8组UI明暗/缩放/宽窄留证，抽查明暗截图通过。用户窗口未重启，需保存后正常重启加载；未推送。详细来源、首次测试迁移失败、安装核对和原生截图限制见[证据](../enhancements/tests/evidence/git_commit_web_20260920.json)。
