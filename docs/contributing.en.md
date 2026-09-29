[Chinese](contributing.zh-CN.md)

<a id="section_d8d236955274"></a>
# Participating in Typora Code development


Typora Code is maintained in this independent repository. When changes are intended to enter the official project, align requirements and design with the maintainers first. The independent fork still complies with the license published with the source code. Please read [LICENSE](../LICENSE) and the current [project statement](../COPYRIGHT.en.md), the original text of the statement is in Chinese.

<a id="section_3fc9196a00fd"></a>
## Development process

1. Check `git status --short`, retain irrelevant local modifications. Read `AGENTS.md`, project homepage, `enhancements/README.md`, and `docs/development_handoff.md`.
2. Register stable requirement numbers, original intent, and acceptance criteria, and associate them with continuously maintained designs in `docs/requirements_design.md`. Local progress and temporary evidence are placed in the ignored directory `.cache/issue_tracking/`.
3. Before implementation, trace actual callers and state ownership. Interface presents state, shared commands and domain services are responsible for behavior, and native capabilities reuse existing adaptations. Each piece of business state and configuration has only one owner.
4. Maintain authorized layouts and scope, partial fixes do not authorize comprehensive redesign. Before adjusting geometry, color, icons, or interactions, verify the upstream version's design facts.
5. First perform the target check, then expand the scope based on impact. Record actual results and untested boundaries. Native and platform acceptance is independent of hidden windows or surrogate testing.

Native identifiers use English `snake_case`, constants may use `UPPER_SNAKE_CASE`. Language and third-party mandatory interfaces retain their original names. New and modified code comments use English, and documentation is maintained independently per language. Read and write explicitly use UTF-8; Windows PowerShell 5.1 scripts containing non-ASCII characters retain the required UTF-8 byte order mark.

<a id="section_e1fd5ba9db5e"></a>
## Build and Test

```powershell
cd enhancements
npm ci
npm run build
npm run check
npm run check:ui
```

`npm run check:ui -- --list` lists the interface suite, and test files can also be specified after `--`. `npm run test:quality -- --list` lists the categorized suites associated with requirements. New test reuse directories and runners clarify module ownership, cleanup, implementation verification, and stress verification purposes. Shared build artifacts are generated sequentially.

Temporary repositories, host copies, and installation payloads use managed artifact lifecycles, retaining logs and evidence, and recycling temporary payloads with clear ownership. Operations that rewrite data, such as testing push, pull, and discard, are prohibited on user real repositories.

<a id="section_64ccb7cb5487"></a>
## Delivery

Feature candidates must include verified native installation. The same candidate executes installation, inspection, uninstallation, reinstallation, and re-inspection in isolated environments, covering valid backup recovery and entry revocation without compatible backups. In real user environments, only read-only pre-checks for uninstallation are performed before final installation, retaining documentation, configuration, and recovery materials.

Separately describe source code changes, build success, asset installation, window loading, and behavior verification. Do not close user windows or discard drafts; explicitly state when manual restarts are required. Public feature candidates incrementally assign release numbers and include user-visible announcements; un-released candidates are not equivalent to versions obtainable remotely.

Review the differential and execute `git diff --check`, only staging the explicitly reviewed paths. Commits use conventional format, with the title stating the Chinese result, and each line of body text starting with `- details` after a blank line. Validate through `scripts/check_commit_messages.py --message-file <file>`, commit with `git commit -F <file>`, and verify the actual body text. Do not push without explicit authorization.

Detailed design, issue log, installation, and historical verification records are still in Chinese; English migration is tracked by R082. This guide does not replace these records and does not indicate that all previous issues have been resolved.
