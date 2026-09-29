---
id: tools.typora.copyright
title: "Typora Code Copyright, Open Source, and Contribution Declaration"
kind: policy
status: evolving
domains:
  - tools
  - governance
---

[Chinese](COPYRIGHT.md)

<a id="section_d4d73a082c24"></a>
# Chapter 1\_Typora\_Code\_Copyright, Open Source, and Contribution Declaration


<a id="section_7a99325eeedc"></a>
## 1.1\_ Product and Original Attribution

Product Name: **Typora Code**

Current Original Maintainer: FormingSystem

Contact Email: `lizhaojun97@qq.com`

Project Address: [FormingSystem/typora_code](https://github.com/FormingSystem/typora_code)

The original program code, original user interface, original text, original documentation, themes, and installation scripts of Typora Code should retain the following source information:

```text
Typora Code
Original project: FormingSystem
Source: https://github.com/FormingSystem/typora_code
Contact: lizhaojun97@qq.com
```

<a id="section_f78374f61bdc"></a>
## 1.2\_ Current Open Source Method of the Open Development Version

The current public development version of Typora Code uses **GPL-2.0-only**. It is released according to the **GNU GPL version 2** terms in the root directory of this repository [LICENSE](LICENSE). When copying, modifying, and redistributing, you should comply with this license, retain the copyright, license, product name, and original project source, and clearly indicate the modifications made. You must not lead third parties to mistakenly believe that the modified version is an official release from FormingSystem.

The 'retaining source' in this declaration is used to clearly indicate the original ownership and the boundary of the official version. It does not add any prohibitive clauses against modification or redistribution that conflict with GPL. Legal use still follows the actual text of the license accompanying the current version.

<a id="section_470196bffb62"></a>
## 1.3\_ Secondary Development and Official Requirements

Secondary development is divided into two paths:

1. If changes are intended to enter Typora Code official version, the requirements, design boundaries, and merging methods should be aligned with maintainers via email or project channels first, and then submitted according to the official contribution process.
2. When independently forked or self-secondary developed, it can be carried out under the current version license, but must explicitly declare the source, original project address, modified content, and clearly identify it as a non-official version.

"Aligning requirements" is a collaborative requirement for entering the official version, and does not restrict the rights of independent research, modification, and redistribution under licenses that have already been granted.

<a id="section_ae41e3472053"></a>
## 1.4\_ Future Version Plan

The open-source nature of the current version does not imply that all future versions will necessarily use the same license. FormingSystem can choose to continue open-source, dual-license, commercial license, or other release methods for versions that have not yet been released.

License changes only take effect for versions that adopt the new license. Already publicly released versions continue to be subject to the license they were released with, and are not revoked retroactively due to subsequent plans.

If future external contributions are accepted, an explicit contribution license or copyright authorization mechanism should be established before changing the license. Without such rights, it is not permissible to unilaterally change the license of code contributed by others.

<a id="section_c5b0bcdcf4cd"></a>
## 1.5\_ Third-party content and user documentation

Typora Code's workbench layout, interaction methods, and some functional designs reference and imitate [Visual Studio Code（VS Code）](https://code.visualstudio.com/). The design references and specific adoption scope of this project are seen in [Interface Baseline](docs/vscode_design_baseline.en.md).

Typora Code is an independently maintained community-enhanced project, not an official product of Typora or VS Code. Typora The copyright, trademark, download, and licensing of the core are owned by their rights holders and official channels. This statement does not grant Typora the right to use or redistribute the core.

Third-party software packages, upstream workspace core, referenced code, fonts, icons, themes, and images continue to follow their own copyright and license. Typora Code's original attribution does not claim ownership of these contents, and does not alter their license terms. The source and license are retained as [third-party resources](enhancements/vendor/) and [release license file](enhancements/dist/licenses/); the original copyright and license declarations in the build file are also retained.

The licenses displayed by `enhancements/package-lock.json` MIT for Apache, BSD, ISC, and Typora are part of the corresponding dependencies, and do not represent that the original code of Code adopts these licenses.

The rights and licenses of the Markdown, source code, images, and other files opened, edited, or exported by the user through Typora Code are still determined by their respective rights holders, and are not automatically considered as original content of this project or automatically applicable to GPL-2.0-only.
