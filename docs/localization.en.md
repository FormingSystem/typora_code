[Chinese](localization.md)

<a id="section_bf4d40f031da"></a>
# Chinese and English releases and localization design

<a id="section_7eb41abd0dd7"></a>
## R082: Language Agreement for Releases (2026-09-29)

Users request that formal releases provide independent pure English and pure Chinese documentation, with self-owned code comments in English, and UI support for both Chinese and English. This agreement overrides the old rule in AGENTS.md that code comments use Chinese; Chinese design and handover documents remain in Chinese, while English documents are maintained separately.

2026-09-29 User confirmation of 'Continue, All Fixes': All self-owned documentation (including internal design, detailed explanations of enhanced modules, development handover, and historical acceptance records) is included in the full bilingual scope. Retain the original Chinese pages and add corresponding English pages in the same directory, maintaining matching links and original evidence; no longer retain items with pending confirmation of documentation scope. Original third-party licenses, protocol identifiers, filenames, and actual samples remain unchanged.

<a id="section_0da011fe9087"></a>
### Scope and Status Owner

- The GitHub homepage provides independent English and Simplified Chinese entry points; installation, operation, development, and contribution instructions should have clear language and corresponding entry points. Technical identifiers, commands, paths, product names, and original licenses are not translated.
- Own interface text includes menus, tooltips, accessibility names, statuses, empty states, dialogues, settings, onboarding, and error messages. User-generated text, filenames, Git commit content, process output, and third-party plugin own text are not translation targets.
- The shared language service holds language parsing and selection; domain dictionaries retain semantic keys and named interpolation. Git and Monaco use the same parser, without adding a second configuration. By default, it follows Typora, with explicit selection of Chinese or English; English is used when the host language is not recognizable.
- The scope of language switching must cover menus, settings registry, and Monaco generated during module initialization. It takes effect after saving with a manual restart, not rebuilding documents, losing drafts, or terminating terminals for text updates. Failures retain the original configuration.
- Own code comments are translated into English, retaining their meaning; original licenses, third-party original source code, and Chinese used as data in tests are not mechanically deleted. Installer logs and script interactions are separately accounted for, and cannot claim that the distribution package is fully bilingual just because the renderer is translated.

<a id="section_5e4681eb3de0"></a>
### Implementation plan and trade-offs

First, inventory existing documents, comments, and hard-coded interface text. Reuse the placeholder contract from the existing Git bilingual dictionary, extract language parsing into a shared service; each calling point uses the term when generating text, not traversing/replacing document DOM, not replacing any user string. Persistence is accessed through a common settings entry, with validation of allowed values upon reading.

Language continues to be stored in the core's existing `displayLang` field, with the settings page only adding a form projection of the same field; 'follow Typora' removes explicit values, not introducing a second settings file. The core validates this value upon startup and selects the language for this window, enhancing scripts to wait for the core to be ready before evaluating, so Monaco, module-level tabs, and subsequent dynamic messages all read from the same loaded language. Saving a new language does not rewrite the current core instance, and it is uniformly loaded after a manual restart; read/write failures retain the original value, with document and terminal lifecycles not participating in language configuration. The host's native preference and community plugin's own language settings continue to be decided by their respective owners.

English and Chinese documents are separated by page, with mutual switching links, using the same commands, functional scope, and acceptance limits. Historical evidence, requirement numbers, and existing design links remain traceable; establish link mapping before migration, without truncating history or using summaries to impersonate full translations. Professional terms in the document may use common English.

<a id="section_864c9d7e4fc6"></a>
### Acceptance and release criteria

This round of bilingual startup regression covers two mounts and destructions. On 2026-09-29, it was found that the shared theme observer registered after Monaco's theme asynchronous initialization completed had no editor owner, and may still leave window listeners after destruction completion. Themes and syntax definitions continue to be cached per window, but subscriptions are counted based on actual editor references: first editor registers, last one releases; asynchronous completion only synchronizes themes still in use, not re-registering canceled subscriptions. Regression verifies two startups/destructions, delayed initialization, multiple editors, and listener baselines when there are no editors.

1. Verify English/Chinese entry points, relative links, commands, and declarations; record untranslated items page by page.
2. The keys and placeholders for the two languages are consistent; unsupported languages fall back to English; Chinese/English/follow host settings, damaged configuration, and restart reading are separately verified.
3. Verify the top bar, side bar, settings, file/Git/search/terminal/preview, error and dynamic prompts, accessibility names, and onboarding in both languages; long English text, narrow windows, light/dark mode, and keyboard behavior maintain a common geometric contract.
4. Comment checks distinguish real comments, strings, and third-party content; build and existing related tests verify behavior unchanged. Runtime must not call translation services online.
5. Function candidate executes build, check, isolated installation of the same candidate → check → uninstall → reinstall → check, local read-only uninstall pre-check, and asset verification. Interfaces/platform acceptance that are incomplete translations or unexecuted remain incomplete, not marked as officially release-ready.

<a id="section_c99e30faa576"></a>
### Execution status

2026-09-29: Shared language resolution, persisted settings, core startup, Git/Monaco, background services, the installer, offline help, and bilingual release notes are connected. Chinese comments in owned code have been translated into English; original third-party source, licenses, and test data retain their original values. The default English GitHub README links to a separate Chinese README. All owned design, handoff, and historical documents have English counterparts.

The page pairs are maintained in `docs/languages.json`. Routine checks validate paired pages, English text, and relative links. Shared dictionary checks validate message keys, English text, and placeholders; distinct file and match counts verify interpolation semantics. Chinese documentation retains technical identifiers, commands, and established terminology.

The candidate version is `2026.09.29.5`. Final verification, installation, and untested platform boundaries are recorded in the [current evidence](../enhancements/tests/evidence/localization_20260929.json). Source commits, disk installation, loading by running windows, and public release are recorded separately. Users save their documents and restart normally; this work does not forcibly close their windows. An unpushed candidate is not yet available from GitHub.
