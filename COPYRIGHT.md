---
id: tools.typora.copyright
title: "Typora Code 版权、开源与贡献声明"
kind: policy
status: evolving
domains:
  - tools
  - governance
---

# 第1章\_Typora\_Code\_版权、开源与贡献声明

## 1.1\_产品与原创署名

产品名称：**Typora Code**

当前原创维护者：FormingSystem

联系邮箱：`lizhaojun97@qq.com`

项目地址：[FormingSystem/typora_code](https://github.com/FormingSystem/typora_code)

Typora Code 的原创程序代码、原创用户界面、原创文案、原创文档、主题和安装脚本应保留以下来源信息：

```text
Typora Code
Original project: FormingSystem
Source: https://github.com/FormingSystem/typora_code
Contact: lizhaojun97@qq.com
```

## 1.2\_当前开发版本的开源方式

Typora Code 当前公开开发版本采用 **GPL-2.0-only**，按本仓库根目录 [LICENSE](LICENSE) 中的 **GNU GPL version 2** 条款发布。复制、修改和再分发时，应遵守该许可证，保留版权、许可证、产品名称和原始项目出处，并明确标注所做修改，不能使第三方误以为修改版本是 FormingSystem 官方发布。

本声明中的“保留来源”用于明确原创归属和官方版本边界，不增加与 GPL 冲突的禁止修改或禁止再分发条款。合法使用仍以当前版本随附的许可证正文为准。

## 1.3\_二次开发与官方需求

二次开发分为两种路径：

1. 希望改动进入 Typora Code 官方版本时，应先通过邮箱或项目渠道与维护者对齐需求、设计边界和合并方式，再按官方贡献流程提交。
2. 独立分叉或自行二次开发时，可以按当前版本许可证进行，但必须显式声明来源、原始项目地址、修改内容，并明确其为非官方版本。

“先对齐需求”是进入官方版本的协作要求，不限制许可证已经授予的独立研究、修改和再分发权利。

## 1.4\_未来版本计划

当前版本开源不代表所有未来版本必然采用相同许可证。FormingSystem 可以针对尚未发布的新版本选择继续开源、双许可证、商业许可证或其他发布方式。

许可证变更只对采用新许可证发布的版本生效。已经公开发布的版本继续适用其发布时附带的许可证，不因后续计划而被追溯撤销。

若未来接受外部贡献，应在变更许可证前建立明确的贡献许可或版权授权机制；没有相应权利时，不能单方面改变其他贡献者代码的许可证。

## 1.5\_第三方内容与用户文档

Typora Code 的工作台布局、交互方式和部分功能设计参考并模仿 [Visual Studio Code（VS Code）](https://code.visualstudio.com/)。设计参考与本项目的具体采用范围见 [界面基线](docs/vscode_design_baseline.md)。

Typora Code 是独立维护的社区增强项目，不是 Typora 或 VS Code 官方产品。Typora 本体的版权、商标、下载和许可由其权利人及官方渠道提供，本声明不授予 Typora 本体的使用或再分发许可。

第三方软件包、上游工作区核心、引用代码、字体、图标、主题和图片继续遵循其自身版权与许可证。Typora Code 的原创署名不主张拥有这些内容，也不改变其许可条件。来源及许可随 [第三方资源](enhancements/vendor/) 和 [发布许可文件](enhancements/dist/licenses/) 保留；构建文件中的原始版权与许可声明同样保留。

`enhancements/package-lock.json` 中第三方包显示的 MIT、Apache、BSD、ISC 等许可证属于相应依赖，不代表 Typora Code 原创代码采用这些许可证。

用户通过 Typora Code 打开、编辑或导出的 Markdown、源码、图片及其他文件，其权利和许可证仍由各自权利人决定，不因使用本工具而变为本项目原创内容或自动适用 GPL-2.0-only。
