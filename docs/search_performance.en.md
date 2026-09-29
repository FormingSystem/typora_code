[Chinese](search_performance.md)

<a id="section_b45dd7cf2345"></a>
# Directory search performance and verification

The fix for September 10, 2026, targets two actual entry points: top bar / `Ctrl+P` file name search, and sidebar content search. Original icons, search scope, click preview, double-click open, and preview before replacement are retained, without changing the project file.

<a id="section_116157a967f7"></a>
## Confirmed blocking sources

- File name search previously displayed results only after all directory enumerations were completed; each input created a score object for all candidates, fully sorted, and then truncated to 100 items. The sorting comparison repeatedly passed in Chinese region and numeric sorting options.
- Content search previously waited for file-by-file reading and authentication; line indices and matches for regular text are still running in the renderer; only regular expressions use Worker.
- The sidebar first waited for the complete Git status, then waited for the entire search round to complete, and finally created all result DOMs at once. The engine already has file-by-file callbacks, but the interface did not use them.

Fixed version VS Code's [RipgrepTextSearchEngine](https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/services/search/node/ripgrepTextSearchEngine.ts) performs search through an independent ripgrep process, streams results, and terminates the process when canceled; [SearchView](https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/contrib/search/browser/searchView.ts) updates the results tree in batches. This time, the same responsibility separation principle is continued, reusing the existing isolated Worker and secure replacement snapshot without introducing new external executable file dependencies.

<a id="section_dce490a6170b"></a>
## Current behavior

2026-09-20 replaced the filename matching part with [R058 file quick open](quick_open.en.md), fixing VS Code scoring/sorting and highlighting, with a maximum of 4 directories processed in parallel, about 8ms slicing, complete enumeration no longer truncated at 50,000 files; 2026-09-25 fully preserved matching and only drew visible lines according to R075. Closing, switching databases or new queries make old calculations invalid. The 100 items and 50,000 candidate records from 2026-09-10 are historical comparisons, and the current behavior is based on R058.

Content search preloads up to 4 files, maintaining the original determined traversal order and per-file identity checks. In the browser, regular queries and regular expressions are both processed by a single Worker per round to build line indexes, calculate positions, and match; asynchronous file system reading can be parallel with this Worker. File decoding, range rules, and replacement authorization remain in the host. Files without matches no longer pre-establish complete line indexes. When a file match exceeds 2 seconds or is canceled, the Worker terminates; timeout results remain incomplete and cannot be used for replacement.

Sidebar updates progress as matching results increase per file, updating approximately every 80ms; large-scale DOM creation yields event loops every 64 items or about 8ms. Ordinary Git decorations and content scanning run in parallel for search; only searches with "only modified files" scope must wait for Git status. `.gitignore` The required Git file list still needs to be obtained first, cannot be skipped for speed improvement. New queries, stop, directory changes, and unloading retain asynchronous result isolation; incomplete searches cannot preview replacements. Search, result preview, and this performance test do not write document content.

<a id="section_601339b24898"></a>
## Reproducible benchmark

Comparison baseline is `56222589f2997a6ee2ea0a6ae87d5015f43af63b`. The following is a record from the same Windows machine, not cross-hardware performance guarantee.

| Scenario / Metric | Before modification | After modification |
| --- | ---: | ---: |
| 50,000 file names in Chromium, complete results visible | 465ms | 189ms |
| Same scenario, first set of results visible | 449ms | 179ms |
| Same scenario, maximum timer interval for event loop | 248ms | 20ms |
| Same scenario, keyboard event synchronization processing | 69ms | 8ms |
| 1,200 real small files, total time for warm cache content scanning | 566ms | 563ms |
| 1,200 real small files, peak simultaneous reading | 1 | 4 |
| Controlled delay scenario with an additional 3ms wait each time, total time | 19145ms | 4468ms |

The last line explicitly inserts `setTimeout(3)`, the Windows timer granularity will amplify the actual waiting time; it verifies that serial waiting is overlapped by bounded concurrency, and cannot be considered as real hard disk or network disk measurement. The total time for warm cache small files is basically comparable; entering ordinary matching into Worker has the cost of messages and thread startup. This test mainly improves input stall, waiting for the first screen result, and high latency reading throughput, and does not claim that all queries are accelerated by the same multiple.

Execute in `enhancements/`:

```sh
node scripts/test_workspace_search_performance.mjs --baseline=56222589f2997a6ee2ea0a6ae87d5015f43af63b
node scripts/test_workspace_search_performance.mjs --baseline=56222589f2997a6ee2ea0a6ae87d5015f43af63b --read-delay=3
npx --no-install electron scripts/test_workspace_quick_open_performance.cjs --baseline=56222589f2997a6ee2ea0a6ae87d5015f43af63b
npm run check:ui -- test_workspace_files_search.cjs test_workspace_quick_open_performance.cjs
```

Baseline parameters are obtained through `git show` only read the old source code, built into memory, without switching work trees or overwriting release products. The 50,000 file names use a controllable directory interface, content scanning uses temporary real files; the test separately records the first result, total time, event loop interval, and reading concurrency, without mixing them into a single metric.

<a id="section_664585ee9d56"></a>
## Regression and boundary

Target regression covers real Worker's regular user cancellation, ordinary query entering Worker, Unicode and multi-line positions, ignoring rules, replacing private snapshots, maximum 4 reading concurrency, no new reading or late callback after cancellation, and the latest input wins among 50,000 candidates, filtering by Enter and closing restores focus. Directory boundary testing ensures that matched files that have been read will not wait for the next slow directory to fill the pre-read queue. The sidebar also verifies that slow Git status and preview of the second half of the scan before the first half is completed can be previewed, 5000 DOM creations change queries without leaving old results, and the DOM node and focus of the list search remain after the search is completed.

On 2026-09-25, according to [R075](resource_capacity.en.md), the default 5000 matching is canceled, with thresholds of 8MiB per file and 64MiB for snapshots; pre-read only controls concurrency, no longer rejects based on size. This test did not change to an infinite task queue, full project document caching, or persistent file indexing. Enumeration of directory trees, main thread decoding, and final visible nodes still have costs; timers and 8ms giving up points are not real-time scheduling guarantees, nor do they represent a complete port of VS Code search backend.

<a id="section_7222856082bd"></a>
## R023

On 2026-09-12, user feedback after scrolling search preview below, clicking the same result again will not return to the matching position. The original selection deduplication also skipped navigation actions. The selection identity still belongs to the search sidebar, content, Markdown hit nodes, and Monaco preview model are owned by `workspace_lookup_preview`; new explicit preview repositioning actions are added, same results reuse content and reposition, switching results enter existing asynchronous reading. File line positioning remembers the match; repeated single-click, keyboard focus, and fold after selection share the same path.

Markdown re-display the original marked hit; source code recovers the line and column selection of the search result and displays it in the visible area, cannot use the arbitrary position selected by the user later in the preview as a navigation target. During loading, do not re-initiate reading, and after the original request is completed, locate according to the current identity; switching/destroying continues to discard old requests. Keep the preview font size, central document/selection/scrolling and double-click or Enter open conventions, without modifying the document or adding new settings.

Regression: when clicking the same line after scrolling away from the hit in the real search sidebar, it covers the file line, fold reopening, MD and source code, source code changes selection, quick switching and loading repeated selection. Check the target visibility, original node/model reuse, single reading, central document and file bytes unchanged; isolate native Typora for actual layout verification, not using synthetic clicks to impersonate physical device operations.


<a id="section_06549d83be91"></a>
## R070.9 Path and document sharing regular boundary

2026-09-24：Own document search, quick file open, and remote address search share regular expression compilation and isolated Worker; the first two are enabled by default and allow disabling through existing/new regex button, the address bar prioritizes parsing real paths, otherwise it uses regular expression query. Selected text search is a literal instruction, continuing to disable regular expression cannot treat document symbols as syntax. Path batch matching retains file name boundaries individually (including line breaks in file names), does not concatenate the entire list into document content; matching only returns candidate indexes and UTF-16 highlight ranges. Each round has AbortController, closing / new input / switching database terminates Worker; 2 seconds CPU timeout local report, does not change files or execute replacement. Remote directory service and UI selection each have their own status, search has no right to switch workspace.

<a id="section_2e1165936f52"></a>
## R058.4 Opened files and disk search merged (2026-09-27)

Problem: When Git ignore is enabled, already opened `.cache` source code is excluded by directory traversal, users see `BSP_CLK_Init` in document but cannot search. Fix 6807068's `services/search/common/searchService.ts#getOpenEditorResults` first search the opened model, to include zero match model results to cover disk results; `search.ts#pathIncludedInQuery` still checks user filters, while Git ignore only constrains disk enumeration.

The search sidebar obtains real source code/Markdown files from the editor identity of the common file service, excluding history, comparison, and tool views; the engine first processes the currently opened file, then continues to enumerate the disk through the common directory service. The opened file is not affected by Git ignore, but still complies with the engineering/file folder boundary, only change/only open scope, include/exclude patterns, and default exclusion in progress. Path deduplication overrides split view and disk candidates; zero matches in the model cannot be compensated back by disk old content. The text is still read by the original file owner's read_text, without creating another persistent editor cache.

After loading the disk identity/encoding, already opened files use current memory document content matching; editor snapshots with different results from the disk can be read and located, and replacement requires explicit save and re-search, preserving the original write-before-disk verification and draft protection. New queries, stop, switch database, and destroy reuse existing AbortController, stale text does not publish results. Ignored files that are not opened still follow existing rules, and the results area explanation has enabled ignore/exclude and points to existing switches; it does not automatically scan the entire cache directory, and does not close the user's filter.

Acceptance uses a real temporary Git repository to recreate `.cache/main.c`, covering default ignore/manual close ignore, current memory zero match and new match, repeated open identity, only open and explicit exclude, *.c/directory scope, replace rejection and cancellation. UI verification of the common file service and default switch; isolate original Typora verification of real source code model, disk no write and on-site similar input, then complete the same candidate installation/uninstallation/reinstallation. This time does not claim to migrate the complete search backend of VS Code or all unnamed draft capabilities.

Subsequent clarification: The main scope of full-text search is always the entire project, and only when the user enables "only search opened editors" is it limited to opened files. Fix SearchView's doSearch to pass disregardIgnoreFiles and disregardExcludeSettings, and QueryBuilder's getFolderQuery applies configuration independently; the *.c inclusion condition will not automatically turn off the ignore switch. Regression must prove that after closing ignore, .cache/*.c files that are not opened still hit, and it cannot just verify the correctness of the entire project search based on opened files.
