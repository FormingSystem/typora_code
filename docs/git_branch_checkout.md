# 分支检出快速选择器

## R048 问题与目标

2026-09-19用户截图复现：底栏分支使用普通右键菜单，列表不能搜索，远端长名称折行，缺少标签、创建来源和提交详情；远端检出还需重复填写已知目标。由独立检出选择器替代左键菜单，SCM仓库行和通用检出菜单复用；右键对象操作、历史引用多选和Graph对象菜单保留各自语义。

## 上游依据与范围

沿用Git模块固定VS Code 1.137.0，提交`645f29cc3176500b4b5762ba887cf2a7f0ffdf2c`。`extensions/git/src/commands.ts`的`_checkout`、`createCheckoutItems`、`CheckoutRemoteHeadItem`、`_branch`：顶部输入，创建/从引用创建/分离检出命令，本地/远端/标签分组；非空查询将匹配引用前置，动作仍可用；详情为作者、短提交号、主题，远端优先查找跟踪分支。`repository.ts`保持实际写事务和刷新。QuickInput源码的600px宽、6px边距、22px普通行和44px详情行，官方Codicons分支/cloud/tag/add（plus语义）/debug-disconnect。固定源码摘要随本轮证据记录。截图不作为像素常量来源。

范围是现有检出能力和截图可见基本流程。无需GitHub/网络；不新增扩展宿主、远端拉取、强制检出、自动stash或工作树窗口。遇到同名本地分支但不跟踪所选远端时明确报错，避免切错对象。分离检出不列标签（普通列表已可选标签）；空仓可创建未出生分支。创建即检出，与Graph保留的“只创建”动作区分。

## 职责与实现

底栏、SCM仓库行和更多菜单调用panel持有的同一选择器；UI负责输入/焦点/阶段/结果展示，服务读取完整引用、作者/日期/主题并解析目标，panel继续持有写锁、草稿保护、执行进度及刷新。详情按一次for-each-ref读取，不依赖Graph分页或过滤，不逐行启动Git。保留完整refs身份、剥离附注标签到commit，跳过远端HEAD符号引用。

打开捕获root/runner/writer/repository_epoch；读取迟到、切库、刷新、销毁时关闭并清理。接受前复核身份，服务在写锁内重新读取目标hash及跟踪映射；与展示引用不一致时拒绝。使用既有plan/execute指纹与can_change_files保护，不自动覆盖工作文件。远端若已有跟踪分支则检出该本地分支，否则按真实remote前缀推导本地完整分支名并创建跟踪。

## 交互与失败

打开焦点在搜索框，方向键移动、Enter单次接受、Esc/外部点击取消并按共同焦点规则恢复。中文输入组合时不接受。创建输入只收集名称，从引用创建先选择来源；无结果有提示，长名称与详情单行省略并提供完整title，列表限定视口。读失败在选择器内显示；执行失败由现有panel反馈，取消零写入。明暗采用共同主题，普通动作22px、双行引用44px；不再夹入“配置此右键菜单”。

## 验收与关联影响

功能：底栏、SCM行、更多菜单；过滤/分组/详情、创建来源、分离/标签、远端跟踪复用、单次执行和刷新；与历史多选互不混用。临时真实Git：斜杠分支/remote、同名分支/标签、标签剥离、重名拒绝、旧引用拒绝、脏工作树和未保存正文保护、HEAD/index/文件字节不变量。UI：键盘/IME/焦点恢复、过期关闭、窄窗/明暗、20/100/1000轻量状态循环。原生独立Typora验证真实底栏入口/主题；环境未具备明确记录。正式证据关联测试目录、报告与安装资产，交付后补结果。

## 本轮验证与交付

2026-09-19：R048已实现。真实临时Git用例验证10组场景；隐藏Electron验证真实鼠标/键盘，写端口替身边界单独记录；20/100/1000档仅压力验证生命周期，不冒称千次Git写入。原始Typora 1.14.10独立目录/私有桌面56项检查通过，其中10项为本轮分支入口、主题、搜索、行高和详情文字起点。明暗原生截图已视检；取消零写入、旧弹层不可执行。

开发中发现三类问题：遗漏的官方图标资源使首次渲染失败；静态样式加载顺序令详情继承居中；旧验收仍等待菜单、原生夹具重名变量及Esc缺少释放事件导致失败。已分别补齐资源/摘要，提升检出行规则的明确作用域，以及更新真实入口和语法预检。首次失败及修复后报告均保留。Codicons与引用名夹具的元数据换行/消歧处理不隐瞒为首次即通过。

选中背景按固定Light/Dark 2026的quickInputList.focusBackground分别为#0069CC/#297AA0，前景#FFFFFF；输入框复用共同焦点色。证据入口为[本轮记录](../enhancements/tests/evidence/branch_checkout_20260919.json)。2026.09.19.3已安装，27项资产匹配、5项保护摘要不变，安装check OK；用户窗口未重启。提交状态见本地台账，未推送。未实现远端自动拉取、冲突自动stash、任意提交号输入或VS Code配置生态；失败明确保留文件，不声称完整Git扩展等价。既有跨平台、物理输入和另一电脑权限验收缺口保持。

### 固定来源摘要

- [extensions/git/src/commands.ts](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/extensions/git/src/commands.ts)：SHA256 `5334bae578a8ddeaf770a695944220a6a66bb50b8588d8aed29bacb5d52b02b4`。
- [extensions/git/src/repository.ts](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/extensions/git/src/repository.ts)：SHA256 `aefaabe5c07ae8669b20e1e1bd3bb36041d8219cd9ae5bb0ce644acdad49a8ff`。
- [src/vs/platform/quickinput/browser/quickInputList.ts](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/platform/quickinput/browser/quickInputList.ts)：SHA256 `b72a7e594568c38072f4e845b84ec09e7244e1e6357b1c3606202f8a2aaabf38`。
- [src/vs/platform/quickinput/browser/media/quickInput.css](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/platform/quickinput/browser/media/quickInput.css)：SHA256 `48679724b7570cb040bd2a0d9a55c0a2602ae1714c322f756f3527ac91fdb9d8`。
