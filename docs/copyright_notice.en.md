[Chinese](copyright_notice.md)

<a id="section_361f85467cb2"></a>
# R036 Copyright and Source Attribution

<a id="section_8540b243471a"></a>
## Requirements and Objectives

2026-09-13 , user requires that the copyright and source attribution style of linux-note repository be applied, and the same declaration is adopted. TyporaCode Currently, there are third-party license files and host explanations, but the root directory original project license and copyright attribution are missing. Complete the information that readers can directly find, including the license, original source, and development participation explanations. On the same day, the user supplemented the requirement to clearly indicate that the layout and functional design of VS Code are imitated; README , copyright attribution, and enhanced module explanations directly state the layout, interaction methods, and part of the functional design references and imitations of VS Code , linking the existing design baseline, and clearly indicating that it is not Typora / VS Code official products.

<a id="section_66262b5009bb"></a>
## Source and Applicability

Using the linux-note root directory LICENSE's GNU GPL version 2 document content, the original project license is clearly defined as `GPL-2.0-only`； It adopts its README 'Copyright and Source Attribution' hierarchical explanation method, as well as `tools/practice_tool/COPYRIGHT.md`'s original attribution, current open-source method, secondary development, future versions, and third-party content five-part structure. The FormingSystem and contact email continue to use this declaration, and the product name and project link are changed to Typora Code and this repository.

This is a document change made according to user requirements. Typora Host, third-party dependencies / fonts / icons / reference code and the document opened by the user retain their own rights and licenses; upstream content is not considered original for the project. Future versions and contribution statements follow the reference declaration, and changes to already released versions' licenses are not traced back. Also, no independent modifications / redistribution restrictions conflicting with GPL are added.

Fixed source: linux-note commit `5fd52c4a37e484079b694daeb8af848898281fb1`'s [Root License](https://github.com/FormingSystem/linux_note/blob/5fd52c4a37e484079b694daeb8af848898281fb1/LICENSE), [README Copyright Section](https://github.com/FormingSystem/linux_note/blob/5fd52c4a37e484079b694daeb8af848898281fb1/README.md), and [Product Copyright Statement](https://github.com/FormingSystem/linux_note/blob/5fd52c4a37e484079b694daeb8af848898281fb1/tools/practice_tool/COPYRIGHT.md). The three reference files read this time have no uncommitted differences.

<a id="section_6ca19641f163"></a>
## File Responsibilities and Presentation

- Root `LICENSE` saves the unaltered license text; Root `COPYRIGHT.md` saves the authoritative declarations of copyright, source, contributions, and third-party boundaries.
- Root README adds sequentially numbered copyright and source chapters; enhances module README to link the same authoritative declaration without copying the full terms.
- Sync `enhancements/package.json` and the root file package entry to declare `GPL-2.0-only`; third-party package entries are not modified.
- This document records the implementation design, and the requirement index is associated with R036; when the evidence is entered, it is added to the ignored log, and the delivery result is added to the feedback record.

This round has no runtime interaction, pop-up, or asynchronous cancellation paths. The copyright statement is placed in the repository documentation, without adding a covering layer on the text / image / editor, without changing the host settings or user documentation. All files are maintained with this repository, without adding linux-note runtime dependencies or cross-repository synchronization scripts.

<a id="section_205f29fc2a96"></a>
## Acceptance Methods

Verify that the license and reference original are consistent, original attribution and project address have sources; check Markdown link, title and package metadata; confirm that third-party dependency entries and license files remain unchanged. Review the task's independent difference and run `git diff --check`; changes in pure declarations and metadata do not require rebuilding or reinstalling the workbench, and do not reference previous UI tests as evidence for this round. Submit only includes this document, and the original unsubmitted work is fully preserved.
