[English](language_environment_plugins.en.md)

# R085 语言分析环境插件（2026-10-04）

## 目标与范围

扩展侧栏提供九类 TyporaCode 自有语言支持，覆盖 C/C++、C#、CMake、Makefile、Bash、Java、HTML、CSS、JavaScript/TypeScript。语言支持由独立服务管理，第三方社区插件保留自己的入口与生命周期；原R085的社区Plugin/SettingTab方案已由2026-10-04 R085.2替代。

## 使用与交互

1. 打开“扩展”，在可安装分组点击目标语言的“安装”。安装即启用，缺少工具时自动下载，无需再点下载或填写LSP路径；已存在工具直接复用。
2. 大纲、语义分析和首次F12等待环境准备，完成后自动接通。列表显示准备状态，失败显示原因，可从齿轮菜单重试。
3. 齿轮菜单提供设置、启停、重试和卸载。设置可选择私有工具目录，或打开可选的外部工具及语言参数表单；显式配置优先，不会被默认环境覆盖。
4. 清除或取消准备后保存不自动使用的选择，再次勾选自动使用才重新准备。更换已安装环境的位置时，先清除自有环境，再保存新目录。卸载仅移除自有文件与登记，保留外部工具和用户配置。
5. 旧社区形式的九类语言插件首次启动自动迁移状态、目录与使用选择；其他社区插件不受影响。语言支持无需社区“信任并启用”步骤。

系统无需预装Node、Python、JDK或.NET；受管下载当前支持Windows x64。完整工程SDK和构建调试不属于此层，项目上下文决定语言服务器实际解析结果。直接归档验证摘要，取消/失败回收本次目录；不写系统PATH。更具体的状态所有者、迁移与外观设计见R085.1/R085.2。

## 配方与实际能力

| 插件 | 固定服务 | 私有运行时 | 已验收的能力 |
| --- | --- | --- | --- |
| C/C++ | clangd 23.1.0 | 原生程序 | 文档符号、语义标记、内存修改 |
| CMake | neocmakelsp 0.11.2 | 原生程序 | 文档符号、内存修改、动态文件监听注册 |
| Makefile | autotools-language-server 0.0.23 + lsp-tree-sitter 0.1.0 | Python 3.13.7 embedded、pip 26.2.1 | 变量定义跳转、未保存正文位置变化；该服务没有文档符号能力 |
| Bash | bash-language-server 5.8.1 | Node 24.20.0 | 函数符号、内存修改 |
| JavaScript/TypeScript | typescript-language-server 6.0.1、TypeScript 6.0.3 | Node 24.20.0 | JavaScript 文档符号、语义标记、内存修改 |
| HTML | vscode-langservers-extracted 4.10.0 | Node 24.20.0 | 元素文档符号、内存分析 |
| CSS/SCSS/Less | vscode-langservers-extracted 4.10.0 | Node 24.20.0 | CSS 文档符号、内存修改 |
| C# | csharp-ls 0.28.0 | .NET SDK 10.0.401 | 文档符号、语义标记、内存修改 |
| Java | Eclipse JDT LS 1.55.0 | Temurin JDK 21.0.12.1+1 | 文档符号、语义标记、内存修改 |

语言服务与工程依赖分别管理。C/C++ 完整工程分析仍需正确的头文件/SDK 和编译参数；原大纲设置提供编译数据库、后备参数及已有 clangd 路径。Bash 的 ShellCheck、CMake 工程配置工具、项目依赖恢复等扩展能力由各服务决定，本轮未安装全套编译构建工具，未声称全部 VS Code 语言功能等价。TypeScript、SCSS/Less 注册了同包服务，但本次逐服务实测采用表中具体语言样本。

参数示例：C/C++ 可在原大纲配置填写项目相对 `build` 编译数据库目录及 `-std=c++20` 后备参数；C# 启动参数可在服务 DLL 后追加 `--solution` 和解决方案路径；Java 的 `-Xmx1G` 可按需要修改。初始化选项和工作区设置是两个 JSON 对象，字段按相应上游文档，不把编译命令当成 LSP 服务启动命令。Java `-data` 中的 `${workspace_hash}`、`${session_id}` 由分析服务展开，避免工作区及窗口共用数据库。

## 职责、状态与失败恢复

`language_environment_catalog.json` 声明固定来源、版本、归档摘要及配方。`language_environment_service.cjs` 拥有 `installed.json`、跨窗口环境锁、下载、解包、私有包管理与目录清除。独立安装目录包含随机身份和所有权标记；仅在摘要、解包路径和入口检查通过后登记。归档拒绝越界、重复条目和链接；清除拒绝所有权不符或链接目录。失败/取消清理本次目录；清除中断保留可重试登记，不接管用户的公共工具目录。

Node 使用完整便携包中的 npm，Python 使用 embedded 路径隔离及专用包目录，.NET 使用独立 tool-path、CLI 主目录和 NuGet 缓存。没有全局 npm/pip/dotnet 安装。固定直接归档验证 SHA-256 或 SHA-512；npm/pip/NuGet 按固定顶层版本及包管理器解析依赖，尚未提供所有传递依赖的跨时间锁定或完整离线缓存。

`language_service_settings` 是用户/工作区配置唯一所有者。显式 LSP/停用配置及已有 clangd 路径优先；语言支持只贡献默认服务，不隐式重写手工配置。`language_analysis_service` 持有文档版本、进程和 Java 会话身份，文件监听接入共享目录服务；卸载释放语言注册和分析提供者。`installed.json` 变化通知其他窗口重新解析。外部配置若手工复制了受管路径，清除该工具后会报告路径失效，可恢复继承或重新配置。

下载复用共同 HTTPS 代理/证书设置；npm/pip 子进程取得局部代理和 CA 配置，.NET 包管理遵循 Windows 证书信任。设置页只持有草稿与任务呈现，离开设置页不取消任务，停用/卸载/销毁取消所属任务。

## 上游依据与验证

固定 VS Code `68070681` 的 `src/vscode-dts/vscode.d.ts` 中 `ExtensionContext.globalStorageUri` 和 TypeScript 扩展的 `package.json`（`js/ts.tsdk.path`）用于核对扩展自有存储、内置服务和用户指定 SDK 的边界；本项目通过独立语言设置与服务所有者实现，不复制 VS Code 扩展宿主。

安装/参数依据：[clangd](https://clangd.llvm.org/installation)、[neocmakelsp](https://neocmakelsp.github.io/docs/installation.html)、[Makefile 服务](https://github.com/Freed-Wu/autotools-language-server)、[Bash](https://github.com/bash-lsp/bash-language-server)、[TypeScript](https://github.com/typescript-language-server/typescript-language-server)、[HTML/CSS](https://github.com/hrsh7th/vscode-langservers-extracted)、[C#](https://github.com/razzmatazz/csharp-language-server)、[Java](https://github.com/eclipse-jdtls/eclipse.jdt.ls)。Makefile 固定旧版是因为新版 0.1.3 不再包含 `make_language_server` 入口，不能升级后仍声称支持 Makefile。

首版2026.10.04.1的验证：统一测试目录关联事务测试、真实下载测试及原生插件夹具。真实服务测试将 PATH 限制为 Windows System32，并删除外部运行时变量，验证九项配方安装、当前内存代码分析和卸载；一次 CMake 下载连接重置保留失败证据，单项重试通过。原生 Typora 1.14.10 验证九个实际插件启停与设置页、CMake 下载/配置草稿/取消/清除、明暗与焦点，其他语言完整项目及其他平台仍是后续范围。具体本轮证据及交付状态见反馈记录。

## R085.1 自动准备与导航等待（2026-10-04）

用户现场已启用CMake且选择默认解析，却未安装受管工具。旧实现只注册读取函数，仍要求再点下载；此处修正该遗漏，替代上文将下载作为必需手动步骤的约定。启用且勾选使用环境的插件自动下载到已配置目录；已存在环境直接复用。取消、清除或取消勾选会保存不自动使用的选择；再次勾选或点击重试可恢复准备，停用插件取消所属任务。

插件任务拥有下载与错误，解析配置所有者提供可等待的环境准备入口。大纲和定义导航等待同一任务，不因每次输入重复下载；导航期间的环境就绪通知不取消首次跳转，正文变化、切换与销毁仍取消过期请求。准备失败保留明确错误及重试入口，不降级为要求手工填LSP；显式外部服务/禁用配置优先。跨窗口或同窗口不同插件共用环境锁，等待可取消，重复准备在锁内复用已登记结果。

不执行用户CMake工程来猜测变量，不把词法颜色当语义解析。对照neocmakelsp的VS Code适配器：默认使用下载的服务，也允许指定本地目标；实际定义结果由语言服务器和工程上下文决定。VS Code其他CMake插件可能采用其他服务，不能承诺所有动态Zephyr变量都等价。

验收补充自动启用→无需点下载→当前文件解析→变量/跨文件定义跳转；配置优先级、取消/失败/重试、并发与卸载清理分别回归。使用原生Typora隔离实例及真实CMake服务，记录仍未覆盖的工程语义，不使用已下载夹具代替自动准备验证。

## R085.2 自有语言支持与扩展列表（2026-10-04）

用户最新明确语言支持归TyporaCode，独立于Typora社区插件。本节替代R085首版社区Plugin/SettingTab架构与操作步骤。自有语言支持清单、安装状态、设置及下载任务由独立服务负责；解析仍通过共同语言配置/分析服务。扩展活动入口保持原位置，默认呈现自有语言列表，社区入口进入独立原有社区视图，不将自有功能注册为第三方插件。

首次启动从已知九个旧语言插件迁移安装/启用状态和目录/使用选择；先持久化自有记录，再移除社区索引中的精确旧ID，失败可重试，不删除用户配置或已下载工具。无旧项不写社区数据。迁移在社区启动前完成，禁止同时运行两套语言提供者；未迁移成功显示错误，不悄悄重装。受管目录与清除所有权保持R085契约。

自有列表提供搜索、已安装/可安装折叠组、名称/描述/作者状态三行、安装按钮和齿轮操作菜单。安装即启用并自动准备，下载失败仍保留可重试条目；停用取消任务并释放服务，卸载仅删除自有工具和登记。设置独立打开目录、自动使用、进度/重试/取消和高级参数入口；高级语言配置继续复用唯一配置所有者。

外观依据固定VS Code 68070681的extensionsViewlet.css（41px搜索区、28px输入、12/20px边距）、extension.css（三行细节、20px标题/描述行）及extensionsList.ts的72px条目；窄宽图标按其24/36px适配。使用已核对Seti语言文件字形与官方Codicons操作图标，共享交互/选择/菜单/滚动条，不复制局部hover颜色。UI保留键盘方向键、Enter/Space、搜索、焦点和选择状态，后台进度只更新所属条目。

验证覆盖旧状态迁移、独立启停与卸载、自动准备和首次F12、共享配置优先级、明暗与窄宽几何、长名称和原社区入口回归。未安装外部市场/不提供VS Code扩展宿主，不借此次样式整改改变其他面板布局。

[上游CMake客户端](https://github.com/neocmakelsp/neocmakelsp-vscode/blob/master/src/extension.ts)的`NeocmakeContext.create`先下载服务再启动，初始化选项包含`semantic_token: true`；本次已采用。具体扩展几何来源和摘要见`vscode_design_sources.json`的`language_support_20261004`。

清除与卸载持有该语言的独占任务状态；进行期间禁用冲突操作，服务也拒绝重试和配置写入，避免新环境被旧清除任务移除。注册锁独立于下载锁，取消或停用不必等待下载锁释放。当前自动准备、独立列表与迁移验证见[本次证据](../enhancements/tests/evidence/language_support_20261004.json)，不以首版社区插件验收代替独立架构验证。
