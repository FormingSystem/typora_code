[Chinese](git_commit_messages.md)

<a id="section_bc586bb8e483"></a>
# Git commit message and history completion

<a id="section_28351d038543"></a>
## R051 Title and list content

On 2026-09-19, the user explicitly required that each commit must have a newline for `- details`, and complete the existing history. This convention replaces the previous AGENTS exception of 'only adding content when the title is insufficient'. The title continues to follow the Conventional Commits standard for Chinese results, with a blank line after, and each item on a separate line starting with `- `; even simple changes must have at least one specific description, and complex changes should be broken down into items. The description should explain the behavior, reason, scope, and have basis for verification; it cannot just repeat the title, list file names, or fabricate history test passes.

On the same day, the user further corrected: the details should summarize the actual modifications, allowing readers to understand the problem and effect without expanding the diff. File names, module names, and 'synchronize document / add new test' cannot replace the summary; for example, column width repair should be written as 'When dragging the date / author boundary, the width of both sides increases and decreases, and the dividing line moves in the same direction as the mouse', rather than 'add column width module and update test'. Syntax checks and content review are independent; the former passing does not mean the latter is qualified. The document commit message should allow readers to know what they can do based on the document, and the rule commit message adds new constraints.

```text
fix(workspace): <Chinese summary of the restored theme boundary>

- <Chinese explanation of the full-width 1px boundary and light/dark theme colors>
- <Chinese explanation that height, controls, and the hidden-breadcrumb layout remain unchanged>
```

<a id="section_35eab6d35e60"></a>
## History processing plan

The first round covered 86 commits across three local branches reachable: 64 commits added missing content, 3 commits organized the original paragraph, and 19 commits retained the existing list. The first round format was qualified, but the user pointed out that some content was still a list of files and delivery, so the content acceptance was not passed. On the same day, the second round reviewed 87 commits, including the newly added rule commits, and rewrote 68 commits' summary, retaining 19 commits with substantive explanations. Based on the actual difference of each commit, the same design / feedback record, and the supplement, the history before migration only described the changes retained in this repository, not inferring the full set of changes from the original knowledge base. The history title, tree, author / submitter identity and date, and parent node order are all retained, and only the message and any necessary parent OID changes due to ancestor changes are retained; the current code and installed assets remain unchanged.

First, create and verify a Git bundle containing all references, generate a reviewable message plan; generate new objects offline, check each tree / metadata / message / topology one by one, and then update the three branches with a transaction that includes old values for comparison. If the transaction fails, do not update the branch; if the reference changes during the period, the transaction is rejected, and the audit is redone. The remote and remote-tracking, as well as internal tool references, are kept in their factual state, and are not rewritten for the sake of graphical neatness. No signed commits or tags; if the subsequent scope includes signatures, do not silently delete them.

The rewritten scope has been explicitly authorized by the user, and the remote force release still requires independent authorization. Two rounds of complete bundle are saved in the ignored `.cache/issue_tracking/git_history_20260919/` and `.cache/issue_tracking/git_history_summary_20260919/`; the formal new and old OID mapping and verification evidence are versioned, and the original commit numbers in the original document still represent the original verification time point. Through the mapping, the new commit can be located, and the historical evidence is not batch rewritten. When restoring, first check the subsequent work, then import the bundle into an isolated repository for review, and cannot use the restore operation to overwrite the new commits.

<a id="section_a74d73989d6b"></a>
## Check and delivery

`scripts/check_commit_messages.py --all` checks the title and list content of all local branches; `--message-file` checks the UTF-8 message file before the commit. AI commits use the message file and `git commit -F` to retain the real line breaks, and verify `git log -1 --format=%B` after the commit. Do not automatically replace the global Git configuration or existing hooks.

This round follows the format of failed / passed examples, checks 87 commits unchanged, bundle recovery, three branches, working tree / index, and installed assets verification, with no product logic changes, no repeated building or installation. Additionally, each commit is reviewed individually to ensure that the content clearly explains the specific behavior, problem, and effect; format checks cannot determine the semantics. History rewriting does not mean that the history function has been retested, and the old tests and cross-platform gaps are maintained.

<a id="section_ea601ffe1fc0"></a>
## 2026-09-19 This round's results

The second round has changed the list-style details to a summary that is understandable to readers. For example, the boundary of the column width repair line moves in the same direction as the mouse, adjacent columns increase and decrease accordingly, and the hash column has been adjusted to the left. The breadcrumbs repair explanation states that the boundary spans the entire row and has no residual when hidden. Small changes should be clearly stated in one sentence, not 'synchronize the document, add tests' to pad the content. Collaboration rules and development skills have both been added to the content review requirements.

87 files are checked one by one, with the file tree, title, author/submitter, and time all the same. The parent node order is preserved according to the new OID mapping. Three local branches have been updated atomically, while the remote tracking and tool internal references have not changed. 87 format checks and 8 sample cases have passed. The Git object connectivity check has passed. The complete bundle of the second round has been restored and verified in an independent bare repository, and the three old branches have been checked. The summary of 27 products and installation assets has been maintained. Subsequent rules added are summarized and checked separately, and are not included in the 87 rewritten objects.

The latest results can be seen at [Modification summary and original/first round/final OID mapping](git_history/20260919_commit_summary_map.json), [First round records](git_history/20260919_commit_map.json) are retained as process evidence and no longer represent the final message. The original, old, and new in the latest records respectively represent the original commit, the first round commit, and this round's commit. They can be directly located to the current history from the old evidence. The remote main is still the original history, which has not been pushed. If authorized for release in the future, the remote will be rechecked first, and the remote history will be protected with clear old OID's force-with-lease to prevent concurrent updates. It is not allowed to push unconditionally. Ordinary push will be rejected because the history is no longer fast.

2026-09-20 R055 supplement: Users have authorized the release of the rewritten main and subsequent commits. The remote 9164530 is mapped to the local f425394, and the file tree is consistent, and the mapping commit is the ancestor of the current main. The complete bundle of this round is retained with the remote old history and local branches. The actual push receipt can be seen at [Current release records](workspace_update.en.md#section_4ac94851cba2), and the previous 'not pushed' is the historical status on September 19.
