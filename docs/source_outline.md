# 代码大纲与解析环境

C、C++ 和头文件的大纲由本机 **clangd** 提供。工作台通过标准 LSP 发送当前编辑器内存中的正文，接收符号名称、类别、父子关系及选择范围，点击后在当前 Monaco 编辑器定位。这里使用 clangd 的 Clang 编译器前端；GCC 是编译工具链，不能直接当作 LSP 服务器。Markdown 继续显示原生标题目录。

## 配置入口

打开代码文件并切换大纲，点击标题行右侧的 **解析环境设置**，或在命令面板运行“代码大纲：解析环境设置”。

| 设置 | 行为 |
| --- | --- |
| clangd 可执行文件 | 留空检查 PATH、LLVM 环境变量与标准安装目录；也可指定本机 clangd。全局共用，不把个人盘符写入产品默认值。 |
| 编译数据库文件夹 | 按当前项目保存，以项目根目录为起点，例如 `build/bringup`。留空检查根目录、`build` 及其一级构建目录。目录应包含 `compile_commands.json` 或 `compile_flags.txt`。 |
| 后备编译参数 | 仅在没有编译命令时使用，每行一项；含空格的参数也保持为一项，不通过 shell 拼接。 |

“检测路径”显示实际发现结果；多个构建目录时可以明确选择。配置存入工作台用户数据目录的 `settings/workspace.json`，不写入打开的工程。保存先原子落盘，成功后刷新大纲；写入失败保留原设置和窗口内填写内容。

## 分析与定位边界

- C/C++ 只有 clangd 这一条分析路径；已删除对应的 Tree-sitter 提取代码和 grammar 资产。没有 clangd 时明确提示配置，不改用手写规则猜测符号。
- clangd 使用工程编译数据库中的语言、宏和头文件配置，不执行固件构建。未保存编辑通过 `didChange` 同步，只用于分析；定位和解析不写源文件。请求取消、编辑版本和活动文件检查阻止过期结果覆盖当前大纲。
- 大纲忠实显示 clangd 的 `documentSymbol` 结果。函数、变量、类型和成员是否出现取决于编译配置及语言服务；不会为 clangd 未返回的宏或局部变量另造规则。GCC 专用参数与 Clang 不匹配时显示 clangd 诊断，不能把编译参数诊断描述为文档“语法尚未完整”。
- 诊断与符号响应异步到达，当前仅采样与本次编辑版本一致的诊断。没有显示诊断不代表已经完成全部语法检查，也不是工程能够编译的证明。
- 当前服务关闭后台索引、clang-tidy、磁盘 PCH 和自动 `.clangd` 配置加载；不启用 `query-driver`，不调用工程中的编译器或脚本。当前目标是单文件大纲和定位，不提供跨文件语义引用、补全或重构。编辑器原有词法着色独立保留。
- JavaScript、TypeScript、Python、CMake、YAML 继续使用随包的离线 Tree-sitter。Markdown 不进入代码解析器。

[工作区内容搜索](search_performance.md)匹配磁盘文本，与当前内存的符号分析分开；[源码跨窗移交](drag_and_windows.md)恢复文档和语言后，新窗口按自身解析环境重新请求符号，不迁移旧窗口的clangd进程或诊断缓存。

符号图标采用固定 VS Code Codicons，颜色来自 `symbolIcon.*`：函数／方法为紫色，类／枚举为橙色，变量／字段／接口为蓝色；其他类别遵循原前景色。明暗主题分别使用上游对应颜色，符号名称保持正常文字颜色。

协议与行为依据：[clangd 工作方式](https://clangd.llvm.org/design/compile-commands)、[clangd 安装与编辑器接入](https://clangd.llvm.org/installation)、[VS Code 文档符号提供器](https://code.visualstudio.com/api/language-extensions/programmatic-language-features#show-all-symbol-definitions-within-a-document)、[固定版本符号配色](https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/editor/contrib/symbolIcons/browser/symbolIcons.ts)。

## 验证入口

`npm run check:ui` 包含离线语法、Markdown 大纲、配置保存及布局回归。安装了 clangd 的开发环境另执行 `npm run check:clangd` 和 `npm run check:clangd-ui`：前者验证真实 LSP 与进程生命周期，后者使用隐藏 Electron 和真实 Monaco 验证编译配置、分类颜色、点击定位、未保存正文、切换文件和设置入口。测试工程与用户数据使用临时目录，不控制用户窗口。

## 同期交互修复与验证

Markdown 大纲保留原生目录树。自动高亮优先选择完整进入可读视口的标题，没有可读标题时才回退正文所属章节；相邻标题在视口边缘采用 12px 进入／退出缓冲，不必等待新标题滚出顶边。原生延迟回调与工作台自动选择共用一次同步，避免相邻标题争抢高亮。显式点击目录继续使用原生定位；自动显示当前目录行只滚动大纲自身，不移动正文或光标。

可读视口扣除底栏覆盖区域，大纲与文档缩略图共用这一边界，避免把字数栏后的标题当作可见内容。底栏单侧 0%～24% 的 Markdown 边距调整会保留当前阅读段落；它只恢复原有宽度控件，不重新引入整套外观设置。

安装器仅备份并移除已退休的 C/C++ Tree-sitter grammar 与许可证，恢复或失败时按原字节回滚，不扫描删除用户文件。当前发布资产与 schema 4 部署方式见[安装与备份](../enhancements/README.md#1.3_PowerShell单独安装扩展与备份)。

当前结果、历史基线和后续修复的验证计数统一记录在[反馈复查记录](feedback_review.md)。真实 clangd、隐藏 Electron、私有桌面的原生 Typora 及物理键盘是不同证据层；合成按键不证明原生 accelerator 冲突已排除，Windows 上的 Python 部署测试也不代表原生 Linux 验收。

2026-09-25容量约定由[R075](resource_capacity.md)覆盖此前固定大小/结果数门槛：完整处理内容，保留用户主动取消与实际失败，历史保留数量及搜索范围仍由用户配置。
