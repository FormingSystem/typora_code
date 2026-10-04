[English](language_environment_plugins.en.md)

# R085 语言分析环境插件（2026-10-04）

## 目标与范围

扩展侧栏提供九个真正的社区体系插件，覆盖 C/C++、C#、CMake、Makefile、Bash、Java、HTML、CSS、JavaScript/TypeScript。每个插件具有独立 manifest、入口和原始 SettingTab，支持安装、启停、配置和卸载，沿用现有社区 ABI。它们随 TyporaCode 提供于“语言环境插件”目录；本轮未向外部社区市场提交或发布。

2026-10-04 用户澄清：系统没有分析工具时仍须可用。配方因此下载自己的便携 Node、Python、JDK 或 .NET，不要求系统预装；安装目录可自选，外部工具仍可配置。本约定替代初稿“要求用户准备缺失运行时”。当前受管下载适用于 Windows x64，其他平台继续使用外部服务配置。没有实现 VS Code 扩展宿主、工程编译或调试器。

## 使用与交互

1. 打开“扩展 → 语言环境插件”，安装需要的插件，再选择“信任并启用”。安装插件本身不执行分析器或下载所有语言的工具。
2. 打开该插件的“设置”。“安装位置”留空使用用户数据内 `typora_code/language_environments/tools`；也可浏览选择另一基目录。点击“下载并安装分析环境”后，配方自动下载所需运行时和服务，无须填写下载链接。
3. “使用受管分析环境”控制是否使用备用工具链。停用插件不会删除已下载的工具；重新启用可继续使用。
4. “配置外部工具及语言参数”使用共享服务配置表单。选择用户或工作区范围，填写可执行文件、参数数组、环境变量、初始化选项和服务设置。“将已安装工具链填入配置草稿”可作为修改起点，保存前不会生效；取消保留旧配置。
5. “清除受管分析环境”先停用该环境，再仅清除有匹配所有权记录的文件。需要迁移位置时，清除后选择新目录重装，再勾选使用。卸载插件同样清理它自己的环境，保留用户配置；引用本机已有程序不会删除它们。

下载及包管理显示进度和上游输出，取消会停止本次下载和安装子进程并清理临时目录。失败不会登记为已安装；网络中断可重新点击安装。Windows 路径过长造成工具启动/安装失败时，选择较短的基目录重试。目录、设置和参数都不写入系统 PATH。

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

`language_service_settings` 是用户/工作区配置唯一所有者。显式 LSP/停用配置及已有 clangd 路径优先；插件只贡献默认服务，不隐式重写手工配置。`language_analysis_service` 持有文档版本、进程和 Java 会话身份，文件监听接入共享目录服务；卸载释放插件注册和分析提供者。`installed.json` 变化通知其他窗口重新解析。外部配置若手工复制了受管路径，清除该工具后会报告路径失效，可恢复继承或重新配置。

下载复用共同 HTTPS 代理/证书设置；npm/pip 子进程取得局部代理和 CA 配置，.NET 包管理遵循 Windows 证书信任。单个插件设置页只持有草稿与任务呈现，离开设置页不取消任务，停用/卸载/销毁取消所属任务。

## 上游依据与验证

固定 VS Code `68070681` 的 `src/vscode-dts/vscode.d.ts` 中 `ExtensionContext.globalStorageUri` 和 TypeScript 扩展的 `package.json`（`js/ts.tsdk.path`）用于核对扩展自有存储、内置服务和用户指定 SDK 的边界；本项目沿自己的社区 SettingTab 和服务所有者实现，不复制 VS Code 扩展宿主。

安装/参数依据：[clangd](https://clangd.llvm.org/installation)、[neocmakelsp](https://neocmakelsp.github.io/docs/installation.html)、[Makefile 服务](https://github.com/Freed-Wu/autotools-language-server)、[Bash](https://github.com/bash-lsp/bash-language-server)、[TypeScript](https://github.com/typescript-language-server/typescript-language-server)、[HTML/CSS](https://github.com/hrsh7th/vscode-langservers-extracted)、[C#](https://github.com/razzmatazz/csharp-language-server)、[Java](https://github.com/eclipse-jdtls/eclipse.jdt.ls)。Makefile 固定旧版是因为新版 0.1.3 不再包含 `make_language_server` 入口，不能升级后仍声称支持 Makefile。

统一测试目录关联事务测试、真实下载测试及原生插件夹具。真实服务测试将 PATH 限制为 Windows System32，并删除外部运行时变量，验证九项配方安装、当前内存代码分析和卸载；一次 CMake 下载连接重置保留失败证据，单项重试通过。原生 Typora 1.14.10 验证九个实际插件启停与设置页、CMake 下载/配置草稿/取消/清除、明暗与焦点，其他语言完整项目及其他平台仍是后续范围。具体本轮证据及交付状态见反馈记录。
