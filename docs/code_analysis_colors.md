# R068.4 代码分析与颜色一致性（2026-09-27）

源码编辑器与搜索源码预览原来使用Monaco内置Monarch及vs/vs-dark，正文围栏已使用官方TextMate；同一C代码因识别器与主题不同，出现宏、函数、类型和背景色差。目标是统一词法与主题来源，并用现有clangd补充真正依赖工程上下文的语义，不按标识符名称猜测类型。

## 分层与所有者

- 词法层：共同代码服务持有已内置VS Code C/C++ TextMate语法及四套主题。Monaco通过公开token provider接入，正文CodeMirror保持原适配；源码、预览和历史使用相同语法和颜色，历史不冒用当前工程的语义结果。
- 语义层：C/C++沿已有clangd LSP服务、编译数据库和模型版本，文档符号与semanticTokens共享进程及didOpen/didChange。只对活动真实源码分析；隐藏、切换、取消和销毁释放订阅，迟到结果不得覆盖新模型。语义结果只覆盖其明确返回的范围。
- 配色层：沿当前明确主题身份选用官方主题colors与tokenColors。Monaco颜色索引和TextMate注册表同源；语义类别按固定VS Code tokenClassificationRegistry的TextMate后备作用域解析。切换主题不改正文、字体、几何、选区或撤销。

clangd内嵌Clang前端，需要编译参数而不需要执行工程构建。compile_commands.json提供目标、宏和头文件目录；缺失时使用既有后备配置并保留分析提示。没有clangd或服务失败时保留词法着色，不能将颜色可见当作编译正确。保留当前不执行query-driver、不开后台索引、PCH仅内存和不执行工程脚本的边界。此轮不增加补全、跨文件引用、重构和新诊断面板；Markdown示例围栏没有完整工程上下文，仅做词法着色。

## 来源与适配

固定VS Code 6807068：theme-defaults/themes/2026-dark.json与2026-light.json及include链；workbench/services/textMate/browser/textMateTokenizationFeatureImpl.ts；platform/theme/common/tokenClassificationRegistry.ts。Monaco0.56公开EncodedTokensProvider与DocumentSemanticTokensProvider承接token，仍由其原生增量分词和可见区调度绘制。不复制VS Code扩展宿主；clangd与微软C/C++扩展的语义结果可能不同，编译环境不完整时不保证截图逐token相同。

## R068.5 按语言配置分析服务

2026-09-27用户要求参考VS Code，按语言选择解析器并支持Python、Java。沿VS Code语言标识、用户默认与工作区覆盖的层次组织配置；语言服务是独立进程，不将编译器路径等同于解析器。C/C++默认继续clangd，其他已有语言默认离线符号解析；用户可为指定语言选择stdio LSP或关闭分析。设置保存在本工具，不读取或改写VS Code用户设置。

统一设置中的“语言服务”提供用户/工作区语言JSON表，键为c、cpp、python、java等语言标识；每项声明provider、command、args、initialization_options、settings。工作区项整体覆盖该语言用户项；删除覆盖后继承。C/C++既有clangd路径、编译数据库和后备参数继续由原配置持有。通用LSP参数显式填写，程序从系统PATH或绝对路径解析，shell关闭；不执行工程脚本，不自动下载服务，不复制扩展宿主或微软Pylance。Java服务启动与工作目录参数由用户配置，不能自动在系统临时目录产生长期索引。

同一模型的大纲、面包屑与语义颜色共享LSP会话，使用UTF-16和完整内存正文。依据initialize返回能力请求documentSymbol和semanticTokens/full；不支持的能力保持基础着色并提示。标准workspace/configuration读取已选语言设置，拒绝服务器要求修改文件或执行命令。保存失败保留旧配置，取消及旧版本结果不覆盖当前模型。输入JSON格式错误在设置内报告；服务不存在/启动失败可改回默认配置。修改配置通知共同分析所有者取消旧请求、清理旧进程并重新分析。

验收包含用户/工作区优先级、非法配置与保存失败、Python/Java语言标识透传、LSP能力协商、配置请求、语义legend转换、版本取消和最后订阅释放；协议替身不代替真实Python/Java服务验收，最终报告实际已测服务及平台。

## 验收

使用含宏、typedef、结构体、函数、参数、注释、头文件和非ASCII字符的C/C++样例，验证真实TextMate类别与官方主题颜色；源码/搜索预览/历史基础着色、明暗切换和编辑状态保持。真实clangd验证语义请求、UTF-16位置、内存更新、取消、缺能力和进程退出；模型版本检查防止旧结果投影。安装最终候选后按标准隔离安装/卸载/重装流程检查，同步报告原始宿主与未测平台边界。

## 配置示例与操作

优先从 **设置 → 语言服务 → 选择语言服务与环境…** 选择语言、配置范围及检测到的程序；参数和高级选项可在同一表单填写。也可以在 **按语言配置（用户JSON）** 填入语言表；界面修改成功保存后，活动源码重新分析。默认值为空对象 `{}`，C/C++自动使用clangd，已有离线语言使用Tree-sitter。`provider: "disabled"`只关闭符号/语义分析，基础高亮继续显示。工作区JSON整项替换该语言配置，不逐字段混合不同服务。

Python安装python-lsp-server后可使用：

```json
{
  "python": {
    "provider": "lsp",
    "command": "python",
    "args": ["-m", "pylsp"],
    "settings": {"pylsp": {"plugins": {"pycodestyle": {"enabled": false}}}}
  }
}
```

command使用系统PATH或用户填写的绝对可执行文件路径；安装到不同Python时应填写该解释器路径。Python运行时和语言服务是两个组件，单独安装解释器不等于安装服务。服务未返回semanticTokens/full时继续基础高亮，不会伪造语义色。

Java可接入自行安装的Eclipse JDT Language Server，command设为相应JDK的java可执行文件，args按照所装JDT LS官方启动要求填写launcher JAR、平台configuration及专属工作区data路径。不同发行包的launcher文件名和JDK要求不同，工具不猜测本机路径或将某一版本的命令写入默认值；args是参数数组，路径中的空格无需再嵌套引号。`initialization_options`对应LSP initialize的initializationOptions，`settings`对应workspace/configuration与didChangeConfiguration。

同一组配置支持提供标准stdio LSP的其他语言服务。VS Code扩展本体不能填入command；Pylance等扩展的私有接入不属于通用LSP入口。请求使用UTF-16位置，默认单次20秒超时，错误保留当前文档及基础着色。大纲仍报告服务异常，未配置服务的语言不假称已完成编译检查。

源码、搜索源码预览、历史和差异共用官方主题及C/C++语法。语义颜色仅用于活动真实源码及其共享模型，大纲和面包屑沿同一所有者复用。历史/独立快照及Markdown代码示例保留基础着色，不以当前工作区语义覆盖不同版本。非C/C++的基础语法仍由Monaco内置提供，语义取决于所配置语言服务。

参考：[VS Code按语言设置](https://code.visualstudio.com/docs/configure/settings)、[语义着色分层](https://code.visualstudio.com/api/language-extensions/semantic-highlight-guide)、[python-lsp-server配置](https://github.com/python-lsp/python-lsp-server/blob/develop/CONFIGURATION.md)、[Eclipse JDT LS启动说明](https://github.com/eclipse-jdtls/eclipse.jdt.ls#running-from-the-command-line)。

## R068.5 环境发现与快捷选择（2026-09-27补充）

设置的语言服务分类提供“选择语言服务与环境”入口。选择语言和用户/当前工作区范围后，下拉展示从进程PATH、CLANGD_PATH/LLVM_PATH、JAVA_HOME/JDK_HOME、DOTNET_ROOT及Python VIRTUAL_ENV/CONDA_PREFIX检测到的程序；Python还检查当前工程的`.venv`、`venv`。只检查这些已知位置的可执行文件，不递归扫描磁盘、不执行候选、不修改系统环境变量。编译器只显示其角色，不能误当作stdio LSP启动。

用户可以选择已发现语言服务或运行时，也可以手动填写可执行文件路径。Python虚拟环境直接使用Scripts/python.exe或bin/python，以`-m pylsp`启动安装在该环境中的python-lsp-server；无需激活shell或修改PATH。也可以手填虚拟环境目录解析解释器。单独存在Python、Java、Node或dotnet不表示安装了语言服务，界面明确提示相应服务和启动参数仍需安装/填写。

配置草稿由对话框拥有；切换语言/范围加载对应已保存配置，保存成功才发布变更，取消不写入。下拉仅修改草稿；“恢复继承”删除当前范围的语言项。异步发现用代次和销毁状态拒绝迟到结果，切换工作区后不能将旧草稿写入新工程。底层仍使用同一language_service_settings存储，JSON与表单互通，不另建双份配置。程序名通过PATH解析，绝对路径直接执行，参数数组不经shell解释。通用LSP与编译器/运行时的区分遵循VS Code语言扩展的职责；这里提供的是本工具自己的统一配置界面，不读取或改写VS Code用户设置。

验收覆盖路径含空格、PATH重复/不存在路径、手填无效路径、venv优先候选、用户/工作区继承、保存失败/取消、选择后实际解释器启动以及六种语言的真实服务能力。沿用现有语言配置对话框几何和共享控件/焦点/主题规则，不新增单独设置页。

实际PowerShell Editor Services的stdio启动必须使用PowerShell的`-NoProfile -NonInteractive`，再通过`-File`指定`Start-EditorServices.ps1 -Stdio -LogLevel Error`（按所装版本补充所需参数）。未指定NonInteractive时本次实测initialize无响应；客户端超时报告具体请求并回收进程，不改变系统执行策略。Python、Bash所测服务不提供semanticTokens/full，保留基础高亮属于能力协商结果，不声称与完整VS Code扩展能力相同。

下拉选择clangd时提供关闭后台索引、内存PCH等与默认路径一致的参数。独立C/C++编译数据库/后备参数配置用于默认clangd模式；显式LSP配置使用自身args、initialization_options和settings，避免隐式混合两个解析器配置。

## 实测服务与配置提示

2026-09-27在Windows实际启动下列服务，逐一验证文档符号、内存修改、预先取消、磁盘不变和进程回收；六种语言基础语法均经真实Monaco分词检查。测试组件在专属临时目录验证后回收，产品不打包这些第三方服务。用户需自行安装选定服务，系统探测不会自动安装。

| 语言 | 本次实际服务 | 程序/参数配置要点 | 完整语义颜色 |
| --- | --- | --- | --- |
| C/C++ | 本机clangd | 默认发现clangd，配置compile_commands.json目录和后备参数 | 已验证 |
| Python | python-lsp-server 1.15.0 | 选择已安装pylsp的Python或venv解释器，args为`["-m","pylsp"]` | 该服务本次未提供，保留基础高亮 |
| Java | Eclipse JDT LS 1.47.0，Java21 | java程序，加官方launcher/configuration/data参数；data目录应专属工程 | 已验证 |
| Bash/Shell | bash-language-server 5.8.1 | node程序，args为安装包out/cli.js绝对路径及`start` | 该服务本次未提供，保留基础高亮 |
| PowerShell | Editor Services 4.4.0，PowerShell7.6.5 | pwsh加`-NoProfile -NonInteractive -File`及Start-EditorServices.ps1路径、`-Stdio -LogLevel Error`等参数 | 已验证 |
| Rust | rust-analyzer / rustc / Cargo 1.98.1；另测独立rust-analyzer 0.3.3057 | rust-analyzer程序，真实Cargo工程加载rust-src、标准库及同项目模块 | 已验证 |
| C# | csharp-ls 0.28.0，.NET10 | csharp-ls程序，工程中提供.csproj | 已验证 |

语义能力依据所选服务返回的能力，不依据语言名称猜测。当前仅接入文档符号和完整语义token；未实现完整VS Code补全、调试、重构或第三方扩展宿主。Java/C#示例不代表所有大型工程、交叉编译环境或版本均已验收。历史/只读独立快照不套用当前文件的语义结果。

### Rust补充（2026-09-27）

Rust通过同一stdio LSP入口使用rust-analyzer，不新增私有编译接口。检测PATH、CARGO_HOME/bin及用户HOME/USERPROFILE下.cargo/bin；rustc、Cargo标明编译器/工程工具，只有rust-analyzer直接作为语言服务。手动完整路径与用户/工作区覆盖、取消、错误规则与其他语言一致。Rust源文件继续使用Monaco基础语法；有真实服务后叠加符号与语义。大型Cargo工程、依赖下载、build.rs和proc-macro由用户配置的服务自行管理；检测本身不执行它们，预置服务配置关闭checkOnSave、build scripts及procMacro。验收使用独立无依赖项目，记录未覆盖工具链与宏展开边界。

Rust实测通过符号、语义token、未保存内容更新和进程释放。最初使用独立rust-analyzer与无依赖crate验证，后按用户授权下载官方1.98.1工具链、rust-src和rust-analyzer，在真实Cargo库工程通过cargo check --offline，确认标准库HashMap识别为struct、同项目另一文件adjust识别为function。工具链及缓存共约751MB载荷已回收，未改变系统PATH；第三方Cargo依赖下载、build.rs及proc-macro展开仍未验收。来源：[官方独立程序安装](https://rust-analyzer.github.io/book/rust_analyzer_binary.html)、[rust-analyzer配置](https://rust-analyzer.github.io/book/configuration)。

2026-09-27用户明确允许下载缺少的工具链。补充验证使用官方rustup在专属测试目录安装minimal、rust-src与rust-analyzer；CARGO_HOME/RUSTUP_HOME只传给测试子进程，安装使用--no-modify-path，验证后由R077回收。增加真实Cargo工程、标准库HashMap及同项目跨文件函数的语义断言，下载/构建失败保留日志，不冒充已通过。

语言服务完成工程/标准库加载后的workspace/semanticTokens/refresh交给同一模型所有者合并调度。正在进行的响应先结束，再按既有150ms调度重新读取当前内存版本，保留现有颜色；关闭/切换后的通知不重启旧服务。协议验收检查能力声明、通知回执与回调，真实服务验收核对工程加载后的语义分类。
