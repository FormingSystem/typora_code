---
id: tools.typora.typora配置修改
title: "Typora 自定义配置"
kind: reference
status: evolving
domains:
  - tools
---

安装入口和阅读导航见 [Typora 安装与阅读工作区](./README.md#1.1_安装、检查与恢复)。本文件维护配置步骤、增强能力和验收边界；[原生偏好设置截图](./typora配置展示.md#第1章_文件) 保留独立参考位置。

# 第1章\_显式行号

1. Typora 本身不自带“显式显示代码块行号”的功能，但可以通过 **自定义 CSS 主题** 来实现。下面给你一个完整的方案：

   ------


## 1.1\_找到\_Typora\_的主题目录

在 Typora 中：

- 打开菜单 **文件**→**偏好设置 → Markdown→ 代码块** →**勾选：显式行号** → **重启软件**
   里面有 `*.css` 文件（如 `github.css`、`night.css` 等）。

------

## 1.2\_修改主题\_CSS

不要按用户名和盘符拼接主题目录。在 Typora 中使用 **主题 → 打开主题文件夹** 定位；自动部署脚本则根据当前平台的用户数据环境变量解析目录。

由于每次typora更新会把自身携带的 主题（如 `github.css` ）给还原，因此需要在对应主题文件(如 `github.css` )复制出文件副本，重命名 `cpp_github.css` ，在副本文件的末尾添加以下样式：

```css
/* 给代码块加上行号 */
pre.md-fences {
  position: relative;
  counter-reset: line; /* 初始化行号 */
  padding-left: 3em;   /* 给行号留空间 */
}

pre.md-fences code {
  counter-reset: line;
}

pre.md-fences code span {
  display: block;
  counter-increment: line;
}

pre.md-fences code span::before {
  content: counter(line);
  display: inline-block;
  width: 2em;             /* 行号宽度 */
  margin-left: -3em;      /* 向左顶格 */
  text-align: right;
  color: #888;            /* 行号颜色 */
  user-select: none;      /* 不可复制 */
}
```

------

## 1.3\_启用行号效果

- 打开 Typora，切换到对应的主题（如 `Github`）。
- 在代码块内每一行都会自动显示行号。

------

## 1.4\_注意事项

1. Typora 渲染代码块时，每行内容会包在 `<span>` 里，所以样式选择器必须用 `code span`。
2. 如果某些主题不生效，说明该主题代码块结构不同，可以按 F12（开发者工具）检查 DOM。
3. 你可以额外美化，比如背景框、行号高亮当前行等。

------

要不要我帮你把 **完整的“代码高亮 + 行号主题（比如 GitHub 风格）”** 直接给你一份 CSS，你可以直接放到 Typora 里用？

# 第2章\_标题颜色修改

我懂了 👍。你是希望在 **Typora** 里写 Markdown 时，标题（`# 一级标题`, `## 二级标题` …）显示成蓝色，而不是默认和正文一样的黑色。

Typora 本身就是用 CSS 渲染 Markdown 的，所以改 **主题 CSS** 就能改变标题颜色。

------

## 2.1\_方法步骤

1. **找到主题目录**

   在 Typora 中使用 **主题 → 打开主题文件夹**。不要在说明或脚本里写死用户名、盘符或 Linux 安装位置。这里每个 `.css` 文件就是一个主题（比如 `night.css`、`github.css`）。

2. **复制一个主题**
    比如你平时用的是 `github.css`，可以复制一份改名成 `github-blue.css`，这样不会破坏原主题。

3. **修改标题颜色**
    打开你复制的 `.css` 文件，加入或修改以下样式（放到文件最后也行）：

   ```css
   h1, h2, h3, h4, h5, h6 {
       color: #0066cc; /* 标题颜色改为蓝色 */
   }
   ```

   - `#0066cc` 是深蓝色，你可以换成你喜欢的颜色，比如亮蓝 `#3399ff`。

4. **在 Typora 中选择新主题**
    打开 Typora → 菜单 **主题** → 选择 `github-blue`（就是你新建的主题）。

------

## 2.2\_效果

- 原来标题是黑色 → 改为蓝色。
- 正文依然是黑色，不会混淆。

------

# 第3章\_添加公式渲染选项

文件->偏好设置->Markdown->公式->开启内联公式和代码块公式

# 第4章\_C与C++代码块语法高亮

## 4.1\_为什么主题CSS不等于语法识别器

主题 CSS 只能给语法识别器已经生成的类别着色，不能根据 `()` 判断函数，也不能根据某个单词恰好叫 `int`、`rcu_read_lock` 或 `old_cfg` 就自行创造语法类别。原来的增强只映射 Typora 内置 CodeMirror 的 `cm-*` 类，所以声明较多的代码看起来颜色丰富，调用密集的代码却仍接近纯文本。

当前配置把这两层明确拆开：

| 层次 | 实现 | 职责 |
| --- | --- | --- |
| C/C++ 语法识别 | VS Code 内置 C/C++ TextMate grammar + Oniguruma | 识别函数、类型、变量、参数、宏、预处理、关键字、字符串、数字、注释和标点等作用域 |
| 颜色映射 | GitHub Light 代码配色 | 把 `entity.name.function.c`、`entity.name.type.c`、`variable.*` 等作用域映射为适合 GitHub 浅灰代码块背景的颜色 |
| 主题基础样式 | `cpp_github-consolas.css` | 保留字体，并统一 GitHub Light 的代码块背景、边框和其他语言的内置 CodeMirror 后备配色 |

这不是针对 `int` 或某几个 Linux API 写的私有规则。例如下面的调用由 grammar 自动把 `rcu_dereference` 识别为 `entity.name.function.c`，样式层再按 GitHub Light 的实体色显示函数名：

```c
p = rcu_dereference(table[id]);
```

TextMate 属于 **语法级识别**，不是编译器或语言服务器。它不会读取当前项目的头文件、宏展开结果和 `compile_commands.json`，因此不能冒充 VS Code C/C++ 扩展的完整语义分析；但它比 Typora 原生的扁平 C 模式提供了完整得多的 C/C++ 语法作用域。

当前 vendored grammar 来自 VS Code `1.135.0` 的内置 `cpp` 扩展，扩展版本为 `10.0.0`，许可证和来源说明保存在 [VS Code C/C++ grammar notice](./enhancements/vendor/vscode_cpp/NOTICE.md)。

## 4.2\_支持的代码围栏

C 和 C++ 代码块仍必须明确写语言：

````markdown
```c
static int counter;
```

```cpp
std::vector<int> values;
```
````

当前会把 `c`、`clike`、`csrc` 映射到 C grammar，把 `c++`、`cpp`、`cc`、`cxx`、`h`、`hpp` 和 `h++` 映射到 C++ grammar。没有语言标签的围栏按纯文本处理，因为系统无法可靠判断它究竟是 C、日志、配置还是伪代码。

## 4.3\_长代码块限高与完整展开

长代码如果默认占据数屏，会把“正文提出问题 → 代码提供证据 → 正文继续解释”的阅读链切断。扩展因此只对 **确实超过阅读高度的普通代码块** 增加折叠控制：

- 默认展示高度取当前窗口高度的 `52%`，同时限制在 `320px`～`560px` 之间；
- 只有代码真实内容比该高度至少多 `48px` 时才出现控制，短代码完全保持原样；
- 收起状态仍可在代码块内部滚动，不会截断或删除内容；
- 点击底部的 `展开全部代码` 后取消高度限制，按钮随即变为 `收起代码`；
- 无论光标位于正文还是代码块，点击按钮都直接生效；按钮获焦后也可用 Enter 或空格切换；
- 再次收起时回到代码开头，便于从正文继续向下阅读；
- Mermaid、流程图、时序图等图表围栏不套用代码限高，它们继续使用独立全屏查看器；
- 打印或导出时强制展示全部代码并隐藏交互按钮。

这个状态只存在于 Typora 当前窗口的 DOM 中，不写入 Markdown，也不会向代码中插入折叠标记。代码围栏即使没有语言标签，只要确实很长也可以限高；语言标签只决定语法高亮，不决定是否允许折叠。

# 第5章\_Mermaid独立查看器

## 5.1\_为什么不能只把正文图强行拉宽

复杂 Mermaid 图直接塞在正文宽度里，会把节点和文字整体缩小。把正文 SVG 原地放大又会改变文档布局、滚动位置和编辑状态。因此当前实现沿用仓库 Mermaid 查看器的边界：**正文图负责阅读上下文，独立查看器负责细看**，两套尺寸和交互状态互不复用。

每张已渲染的 Mermaid 图上方有一行普通工具区，`全屏查看` 按钮位于右侧并与图间隔 `8px`。按钮不是固定或粘滞浮层，不跟随屏幕移动，也不覆盖节点；它随该图一起自然滚动。工具区放在实际预览容器内部，并以所属 Mermaid 代码块为去重边界：Typora 即使同时保留当前预览和重建中的预览，一个可见代码块也只能出现一个按钮，隐藏预览不会把自己的按钮漏到外面。

## 5.2\_查看器操作

打开查看器后默认保持 `100%` 可读尺寸，不再为了“一屏塞下整张宽图”而自动压缩到 `47%` 等比例。宽图可以直接拖动查看：

| 操作 | 作用 |
| --- | --- |
| `−`、`＋` | 按固定倍率缩小或放大 |
| `适应宽度` | 只按可用宽度计算比例，适合纵向继续阅读 |
| `适应屏幕` | 同时按宽高显示整张图，可能小于 `100%` |
| `100%` 或 `Ctrl + 0` | 恢复实际可读尺寸并回到中心 |
| `Ctrl + 滚轮` | 以鼠标指针为中心连续缩放 |
| 按住左键拖动 | 平移当前图 |
| 双击画布 | 适应屏幕 |
| `Esc` | 退出查看器并把焦点还给原位置 |

克隆 SVG 时会重新测量真实图形边界、裁掉原 `viewBox` 的多余空白并重建明确宽高。查看器退出后不会把缩放和平移写回正文 SVG，也不会改变 Markdown 源码。

# 第6章\_PowerShell、UCRT64与Linux一键配置

## 6.1\_路径发现不是安装目录猜测

仓库已经保存预构建扩展，普通使用者 **不需要安装 Node.js**。部署脚本也不写死盘符、用户名、`Program Files`、`/usr/share` 或某台机器的 Typora 位置。路径发现顺序为：

1. 命令行显式传入的位置；
2. 用户设置的 `TYPORA_ROOT` 环境变量；
3. 当前正在运行的 Typora 进程；
4. `PATH` 中的 `typora`、`Typora` 或 `Typora.exe`；
5. PowerShell 环境可读取的 Typora 应用注册信息；
6. 仍未找到时，停下来询问用户输入，不做更多目录猜测。

用户输入不必恰好是安装根目录，也可以是 Typora 可执行文件、`resources` 目录或 `resources/window.html`。脚本只有在确认目标目录含有真实 `resources/window.html`，并在 Windows 上同时确认 `Typora.exe` 后才允许修改。

不同入口接受的路径形式如下：

| 入口 | 可接受路径 |
| --- | --- |
| Windows PowerShell | Windows 路径、UCRT64 的 `/盘符/...`、WSL 的 `/mnt/盘符/...` |
| MSYS2 UCRT64 Bash | Windows 路径或 UCRT64 POSIX 路径 |
| Linux Bash | Linux 绝对路径或相对路径；不会把 Windows 路径误当作 Linux 目录 |

仓库脚本不保存机器专用绝对路径。配置完成后，备份清单会记录 **本次实际解析并验证的目标路径**，这是回退时精确找回原文件所必需的运行结果，不是硬编码安装位置。

## 6.2\_WindowsPowerShell入口

在 PowerShell 中执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\typora\configure_windows.ps1
```

也可以在资源管理器中双击 `tools\typora\configure_windows.cmd`；这个文件只负责转交给同目录 PowerShell 脚本，不包含安装位置。如果自动发现失败，脚本会提示输入路径。自动化环境不允许等待输入时，可以提前设置 `TYPORA_ROOT`，或同时传入 `-typora_root` 与 `-non_interactive`：

```powershell
.\tools\typora\configure_windows.ps1 `
  -typora_root $env:TYPORA_ROOT `
  -non_interactive
```

## 6.3\_UCRT64与LinuxBash入口

MSYS2 必须打开 **UCRT64** 终端；Git Bash、MINGW64 和其他 MSYS2 子环境不是此脚本的支持目标。UCRT64 与 Linux 都执行同一个入口：

```bash
cd tools/typora
bash ./configure.sh
```

如果没有运行中的 Typora，且可执行文件不在 `PATH`，脚本会要求输入位置。也可以显式传递环境变量；UCRT64 会通过 `cygpath` 统一处理 Windows 与 POSIX 路径：

```bash
bash ./configure.sh --typora-root "$TYPORA_ROOT" --non-interactive
```

Linux 安装目录通常不允许普通用户修改。脚本只会在已经验证的 `resources/window.html` 目标需要写入时调用 `sudo`，主题、bundle 和备份始终写入当前用户的 Typora 数据目录，不会用管理员身份创建用户配置。

只读挂载的 AppImage 运行目录不能持久写回，脚本会在写入阶段失败并保留备份，不把临时挂载点伪装成已安装成功。Linux 端应使用具有稳定 `resources/window.html` 的安装形态。

## 6.4\_部署动作与统一备份

PowerShell 和 Bash 入口执行同一组动作：

1. 按共享 `bundle_markers.txt` 验证 C/C++、代码按钮、Mermaid、阅读导航、阅读位置恢复、路径复制、Git Graph 和工作区入口，并按 `SHA256SUMS` 校验社区插件核心和终端模块，Windows 另校验官方 Node 下载包及可执行文件；
2. 解析并验证 Typora 安装根；
3. 备份当前主题、`resources/window.html`、旧扩展 bundle 和本次将覆盖的插件文件；
4. 把仓库主题、bundle 和插件文件安装到当前用户的 Typora 数据目录，并核对安装后的摘要；
5. 在 `window.html` 的 `</body>` 前保持唯一一条用户数据脚本入口；
6. 记录平台、精确目标、文件是否原本存在及修改后 SHA-256。

每次配置都会创建新的带时间戳备份目录，并把确切位置打印到终端。Windows PowerShell 与 UCRT64 统一使用 JSON 清单，Linux Bash 清单使用逐字段 Base64 编码的 TSV；回退脚本不会把 TSV 当 shell 代码执行。

插件核心固定为 Typora Community Plugin `2.10.15`，原始核心、CSS 和三个语言包随仓库分发。入口 bundle 加载用户数据目录中的 `plugins/2.10.15/core.js`；安装器不执行上游安装脚本，不建立指向仓库或某台机器的符号链接，也不依赖本机 Node.js。插件设置和后来安装的其他插件不在覆盖清单内。来源、许可证与摘要见 [工作区依赖说明](./enhancements/vendor/typora_workspace/NOTICE.md)。

使用配置输出的备份目录回退：

```powershell
.\tools\typora\restore_configuration_windows.ps1 `
  -backup_root '<配置脚本输出的备份目录>'
```

```bash
bash ./tools/typora/restore_configuration.sh \
  --backup-root '<配置脚本输出的备份目录>'
```

回退前还会在备份目录保存当前 `window.html` 的安全副本。如果配置前不存在同名主题、bundle 或核心文件，回退时会将新增文件改名停用；原先存在的文件则恢复备份。安装过程中发生失败时也按同一清单回滚。

## 6.5\_只读状态检查

以下检查不修改 Typora；缺少安装位置时也遵循同一套发现和询问规则：

```powershell
.\tools\typora\check_configuration_windows.ps1
```

```bash
bash ./tools/typora/check_configuration.sh
```

检查通过时会报告平台、已验证的 Typora 根目录、唯一脚本入口数量、主题 SHA-256、bundle SHA-256 和 `status: OK`。检查会分别比较已安装主题、bundle 与当前仓库文件是否一致，并校验全部插件资产；旧主题、旧 bundle 或缺失、损坏的插件文件不能仅凭入口还在就通过。普通安装也会在复制后校验主题、bundle 和插件资产。持续集成或其他非交互环境应增加 `-non_interactive` 或 `--non-interactive`，防止脚本等待终端输入。

`git_graph_features` 报告完整提交图、操作、比较、评审与设置能力；功能标记和 bundle 摘要校验防止旧版查看器误通过。`git_graph_runtime` 另报告当前检查进程能否从 PATH 发现 Git；它与配置文件完整性分别检查。Git Graph 使用系统 Git 和 Typora 自带的运行时，安装脚本不固定 Git 的绝对路径、不改写系统 PATH，也不要求额外安装 Node.js。详见 [Git Graph 提交关系图](./enhancements/README.md#1.5_Git_Graph提交关系图)。

# 第7章\_维护、验收与边界

## 7.1\_开发者重新构建

只有修改扩展源码、升级 grammar 或依赖时才需要自行准备开发用 Node.js；Windows 安装器会另外管理集成终端的私有运行时：

```powershell
cd tools\typora\enhancements
npm ci
npm run build
npm run check
```

自动测试确认函数调用与 C/C++ 多行宏的语法角色和颜色映射；宏体中的关键字、类型、函数调用、字符串和注释不得被外层预处理器上下文统一覆盖。阅读历史测试覆盖跳转、前进分支截断、取消打开与重复按键；安装测试使用隔离临时目录。交互夹具和实窗验证入口见 [Typora 工作区与增强](./enhancements/README.md#1.2_开发者构建)。

## 7.2\_人工验收

- 打开带 `c` 围栏的文档，确认函数调用、类型、变量、关键字、常量、字符串和预处理不再全部同色。
- 打开一段长代码，每次先点击代码框外的正文，再直接点击 `展开全部代码` 或 `收起代码`，确认首次点击即生效；同时检查块内滚动、按钮重建后的操作与 Enter / 空格切换。短代码和 Mermaid 不应出现代码折叠按钮。
- 打开包含 Mermaid 的文档，确认按钮处于图上方而不是盖住 SVG。
- 进入查看器后确认默认 `100%`、适应宽度、适应屏幕、按钮缩放、`Ctrl + 滚轮`、拖动和 `Esc` 均正常。
- 退出查看器后确认正文图尺寸和 Markdown 内容没有变化。
- 在没有编辑正文的情况下确认窗口不会仅因扩展加载而出现未保存标记。
- 在当前窗口打开两篇 Markdown，确认产生两个文件标签；`Ctrl + \` 向右分栏，`Ctrl + K` 再按 `Ctrl + \` 向下分栏，拖动分隔线调整大小，点击预览分栏正文后切入编辑。
- 通过文内锚点和跨文件锚点跳转，确认 `Alt + ←` 一次返回链接来源，`Alt + →` 回到目标，并恢复阅读位置；在有未保存修改时取消宿主确认，确认原文保留。
- 从另一栏点击带中文标题的链接，确认目标标题出现在视口中，光标和目录选中同一标题，来源栏仍显示原来的段落；关闭标签、关闭窗口后分别重开，确认普通打开延续上次位置，带标题打开优先到指定标题。
- 右键非活动文件标签或文件树项目，复制相对路径与绝对路径，确认复制对象正确且没有切换文档；检查 `Ctrl + K`、`P` 和 `Ctrl + K`、`Ctrl + Shift + C`，并确认原来的向下分栏快捷键正常。
- 打开 Git Graph，检查提交连线、分支筛选、合并父提交及中文文件差异；再在测试仓库验证操作预览、执行、评审记录和 Ctrl 版本比较；从图标签切回正文后，确认原有非零阅读位置保持。临时仓库回归通过 `test_reading_native.ps1 -suite git` 执行，并比较未提交正文和索引的原始字节。

## 7.3\_Typora升级边界

Typora 没有提供主题 JavaScript 的正式入口，所以该方案需要对安装目录的 `resources\window.html` 增加一条脚本引用。Typora 更新或重装会替换这个文件；更新后先运行只读检查，若入口消失，重新执行一键配置。不要把旧版 `window.html` 整文件覆盖到新版本，应该让配置脚本基于新文件重新插入唯一入口。

当前已在 Windows Typora `1.14.9` 上完成实窗与 PowerShell 5.1 配置、检查、回退验收；UCRT64 代码路径已完成 Bash 语法、Windows/POSIX 路径归一化以及同一 Windows 安装上的配置—检查—回退闭环。当前机器没有独立 UCRT64 终端和原生 Linux Typora 安装，因此这两个正式环境仍需补充各自的实机复核，不能把兼容 shell 测试写成平台验收完成。未来 Typora 版本也必须重新核对入口结构，不能只依据版本号假定兼容。

2026-09-06 本轮在 Windows Typora `1.14.9` 上另行验证了默认单组标签、跨文件增加标签、左右／上下分栏、点击预览切入编辑、文内与跨文件后退／前进及滚动恢复，测试 Markdown 的文件摘要未变化。代码按钮与颜色还通过隐藏 Chromium 的真实输入回归。PowerShell 5.1 的隔离安装、重复安装、校验、恢复和失败回滚通过；Bash 插件资产事务和语法检查通过，未替代原生 Linux／UCRT64 验收。

# 第8章\_单窗口多文档工作区

默认采用 VS Code 的单窗口、多文件标签页布局。打开其他 Markdown 后，文件保留在当前窗口的标签栏；需要同时展示时，再向右或向下拆分。各组可独立选择显示的文档，并通过分隔线调整宽高，无须为每篇笔记另开一个桌面窗口。

`Ctrl + \` 将当前文档打开到右侧组；先按 `Ctrl + K`、再按 `Ctrl + \` 打开到下方组。标签右键菜单也可分栏，拖动标签可调整顺序或移到其他组。`Alt + ←` / `Alt + →` 用于阅读历史，跨文件链接中“打开文件”和随后“跳到锚点”合并为一次跳转。

带标题的链接会同步定位目标栏的光标、正文和目录，来源栏保持阅读位置。普通重开文档会延续上次阅读位置，包括关闭窗口之后；安装或恢复扩展保留已有记录。保存位置及标题优先级见 [阅读位置与标题定位](./enhancements/README.md#1.4.1_阅读位置与标题定位)。

文件标签和侧栏文件树的右键菜单提供相对路径、绝对路径复制；相对路径以当前打开的文件夹根目录为基准。操作入口和快捷键见 [复制文件路径](./enhancements/README.md#1.4.2_复制文件路径)。

左侧活动栏中，文件、大纲下方的 Git 图标在原有主侧栏打开中文 **源代码管理**，中央文档保留。主侧栏提供文件分组、提交消息和分类省略号菜单；提交图、文件时间线和 Monaco 左右差异在原有编辑标签栏中打开，支持源码高亮、行对齐、行内改动、查找和改动导航。分支、贮藏、合并、变基、远端同步与评审继续在这些入口操作。完整收集与对应入口见 [Git Graph 功能对照](./enhancements/git_graph_features.md#第1章_Git_Graph功能对照与操作说明)。操作与查询边界见 [Git Graph 提交关系图](./enhancements/README.md#1.5_Git_Graph提交关系图)。

社区工作区使用一个活动的 Typora 原生编辑器，其余分栏显示预览；点击预览正文会交换编辑器所在分栏。多份独立未保存缓冲区、VS Code 语言服务器等能力不在本实现范围内，切换文件仍遵循 Typora 的保存确认。完整操作、插件管理和历史边界见 [标签页、分栏与阅读历史](./enhancements/README.md#1.4_标签页、分栏与阅读历史)。


# 第9章\_仓库终端与可调整面板

Git Graph 工具栏、文件树右键和左侧终端图标均能打开仓库根目录的集成终端。默认采用下方编辑组，也可选择当前组标签、右侧或下方分栏；切换标签保留正在运行的会话。Ctrl + ` 聚焦或打开终端，Ctrl + Shift + ` 新建会话，Ctrl + Shift + C / V / F 复制、粘贴或查找。右键还提供 **以管理员身份打开仓库终端（UAC）**，它在独立 PowerShell 窗口中提权并定位同一目录。完整操作见 [集成终端、管理员入口与分界线](./enhancements/README.md#1.6_集成终端、管理员入口与分界线)。

原有主侧栏、提交列表与详情、Monaco 历史双栏、编辑组之间的分界线支持鼠标拖动；表头右键切换列显示，布局按钮选择详情位置。各类 Git 对象的右键菜单末尾提供显示项勾选和恢复入口，设置按仓库保存。

Windows 首次安装下载并校验 Node `24.20.0` 私有运行时，不要求预装 Node，不写系统 PATH，不固定本机安装路径。普通图查询继续使用 Typora 运行时，集成终端通过独立后台进程运行 node-pty。安装、检查与回退同时覆盖运行文件；下载缓存、平台范围和原生验证方法见 [终端运行文件、安装与验证](./enhancements/README.md#1.7_终端运行文件、安装与验证)。
