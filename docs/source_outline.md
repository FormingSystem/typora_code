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

符号图标采用固定 VS Code Codicons，颜色来自 `symbolIcon.*`：函数／方法为紫色，类／枚举为橙色，变量／字段／接口为蓝色；其他类别遵循原前景色。明暗主题分别使用上游对应颜色，符号名称保持正常文字颜色。

协议与行为依据：[clangd 工作方式](https://clangd.llvm.org/design/compile-commands)、[clangd 安装与编辑器接入](https://clangd.llvm.org/installation)、[VS Code 文档符号提供器](https://code.visualstudio.com/api/language-extensions/programmatic-language-features#show-all-symbol-definitions-within-a-document)、[固定版本符号配色](https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/editor/contrib/symbolIcons/browser/symbolIcons.ts)。

## 验证入口

`npm run check:ui` 包含离线语法、Markdown 大纲、配置保存及布局回归。安装了 clangd 的开发环境另执行 `npm run check:clangd` 和 `npm run check:clangd-ui`：前者验证真实 LSP 与进程生命周期，后者使用隐藏 Electron 和真实 Monaco 验证编译配置、分类颜色、点击定位、未保存正文、切换文件和设置入口。测试工程与用户数据使用临时目录，不控制用户窗口。

## 同期交互修复与验证

下列运行记录属于 `8ffad67` 历史基线。后续复查发现该版活动栏选择器没有匹配真实宿主 `header` 层级，旧检查也未验证首槽严格贴合顶栏；活动栏位置及其他遗漏的修复、重新验收见[反馈复查记录](feedback_review.md)。不要将旧 63 项结果解释为这个几何问题已在该版解决。

- 活动栏从单行顶栏下方开始，Explorer 图标保持完整的 24px 显示和 48px 点击区。Typora 原图标使用 24px 正方形框，清除宿主图片透明边框造成的压缩；侧栏、标签、底栏采用同一组明暗分界色。
- 链接悬停仍等待 1 秒，生成的目标位置以项目根目录表示，例如 `/governance/conventions/git_guide.md`。鼠标移入提示浮层后可以选择文字或复制原始链接；浮层与链接之间保留 250ms 移动宽限，不改写文档链接或执行跳转。
- Markdown 大纲的自动高亮优先选择完整进入可读视口的标题，没有可读标题时才回退正文所属章节；相邻标题在视口边缘采用 12px 进入／退出缓冲，不必等待新标题滚出顶边。向宿主传入明确标题，统一原生延迟回调，同一章节及边界微滚动不重复改选。显式点击目录仍保留原生定位与手动高亮；大纲自动显示当前行只滚动自身容器。后续验证见[反馈复查记录](feedback_review.md)。
- Windows 与 Python 安装事务会备份并移除已退休的 C/C++ Tree-sitter 资产，恢复或安装失败时按原字节回滚，不扫描删除用户文件。

本轮整批基础检查和 40/40 UI 目标通过（`.cache/clangd_release_check.log`、`.cache/clangd_release_ui.log`）。独立审查后补齐 clangd 管道错误处理；原生窗口检查发现并修正宿主图片和底栏样式覆盖。最终重建后，发布资产检查通过，标题栏／活动栏／大纲／链接提示四个目标全部通过（`.cache/clangd_release_ui_final_targets.log`），真实 clangd 与 Monaco 的 11 组端到端检查通过（`.cache/clangd_release_ui_real.log`）。LSP 服务 16 项检查覆盖进程退出、三路管道错误、多个待处理请求、取消、UTF-16 和当前版本诊断；两套隔离安装事务覆盖退休资产恢复及失败回滚。Python 部署测试在 Windows 执行，不代表原生 Linux 验收。

最终原生 Typora 使用未修改 ASAR，在从未切换到用户前台的私有桌面完成 63 项检查，存活至 60.23 秒后受控清理。真实 C 函数与头文件声明点击定位、设置保存、分类配色、Markdown 同标题滚动、相对 Markdown／YAML 链接及缺失链接保留真实未保存草稿均通过；23 个发布资产与最终构建摘要一致，原 ASAR、原图标和 7 个临时工程文件字节不变。证据为 `.cache/native_single_row_compare/clangd_geometry_final_ready/verification.json`；合成按键仍不等同于物理键盘 accelerator 实机验证。

最终 Windows 安装与配置核验通过（`.cache/clangd_live_install.log`、`.cache/clangd_live_check.log`），事务自动备份旧资产并清除退休资源；安装前后的 ASAR、原生窗口配置和已有工作台设置摘要一致。没有关闭或重载用户窗口，保存文档后正常重启 Typora 加载更新。
