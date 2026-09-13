# R036 版权与来源声明

## 需求与目标

2026-09-13，用户要求套用linux-note仓库的版权声明样式，并采用相同声明。TyporaCode当前有第三方许可文件和宿主说明，但缺少根目录原创项目许可证与版权声明。补齐读者可直接找到的许可、原创来源和参与开发说明。同日用户补充要求明确提示模仿VS Code的布局和功能设计；README、版权声明和增强模块说明直接说明布局、交互方式及部分功能设计参考并模仿VS Code，链接现有设计基线，并明确非Typora／VS Code官方产品。

## 来源与适用范围

采用linux-note根目录LICENSE的GNU GPL version 2正文，原创项目许可明确为`GPL-2.0-only`；采用其README“版权与来源声明”的分层说明方式，以及`tools/practice_tool/COPYRIGHT.md`的原创署名、当前开源方式、二次开发、未来版本和第三方内容五段结构。FormingSystem及联系邮箱沿用该声明，产品名称和项目链接改为Typora Code与本仓库。

这是一次按用户要求建立声明的文档变更。Typora宿主、第三方依赖／字体／图标／引用代码和用户打开的文档分别保留自身权利及许可；不把上游内容列为项目原创。未来版本与贡献说明沿用参考声明，不追溯改变已经发布版本的许可，也不增加与GPL冲突的独立修改／再分发限制。

固定来源：linux-note提交`5fd52c4a37e484079b694daeb8af848898281fb1`的[根许可证](https://github.com/FormingSystem/linux_note/blob/5fd52c4a37e484079b694daeb8af848898281fb1/LICENSE)、[README版权章节](https://github.com/FormingSystem/linux_note/blob/5fd52c4a37e484079b694daeb8af848898281fb1/README.md)及[产品版权声明](https://github.com/FormingSystem/linux_note/blob/5fd52c4a37e484079b694daeb8af848898281fb1/tools/practice_tool/COPYRIGHT.md)。本次读取的三个参考文件均无未提交差量。

## 文件职责与呈现

- 根`LICENSE`保存未改写的许可证正文；根`COPYRIGHT.md`保存版权、来源、贡献与第三方边界的权威声明。
- 根README增加连续编号的版权与来源章节；增强模块README链接同一权威声明，不复制完整条款。
- `enhancements/package.json`及锁文件根包条目同步声明`GPL-2.0-only`，第三方包条目不修改。
- 本文记录实现设计，需求索引关联R036；当次证据进入忽略台账，交付结果进入反馈记录。

本轮没有运行时交互、弹窗或异步取消路径。版权说明放在仓库文档中，不增加正文／图片／编辑器上的覆盖层，不改变宿主设置或用户文档。所有文件都随本仓库维护，不增加linux-note运行依赖或跨仓同步脚本。

## 验收方法

核对许可证与参考原文一致、原创署名及项目地址有来源；检查Markdown链接、标题和包元数据；确认第三方依赖条目及许可文件不变。审查任务独立差量并运行`git diff --check`；纯声明与元数据变更无需重建或重装工作台，不引用此前UI测试作为本轮证据。提交仅包含本次文件，原有未提交工作完整保留。
