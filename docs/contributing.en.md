# Contributing to Typora Code

English | [Simplified Chinese](contributing.zh-CN.md)

Typora Code is maintained in this standalone repository. Coordinate requirements and design with the maintainer before proposing changes for the official project. Independent forks remain subject to the license distributed with their source. Read [LICENSE](../LICENSE) and the current [project statement](../COPYRIGHT.en.md).

## Development workflow

1. Check `git status --short` and preserve unrelated local changes. Read `AGENTS.md`, the project README, `enhancements/README.md`, and `docs/development_handoff.md`.
2. Register a stable requirement ID, intent, and acceptance criteria. Link its maintained design from `docs/requirements_design.md`. Local progress and temporary evidence belong in the ignored `.cache/issue_tracking/` directory.
3. Trace actual callers and state ownership before implementing. UI presents state; shared commands and domain services own behavior; native capabilities use the existing adapters. Keep one owner for each business state and configuration.
4. Preserve the approved layout and scope. A targeted fix does not authorize a broad redesign. Verify upstream design facts against the pinned version before changing geometry, colors, icons, or interaction.
5. Run targeted checks, then broaden them according to impact. Record actual results and untested boundaries. Native and platform acceptance are distinct from hidden-window or mocked tests.

Self-owned identifiers use English `snake_case`; constants may use `UPPER_SNAKE_CASE`. Required language and third-party interfaces retain their names. New and modified code comments use English. Documentation is maintained as separate language pages. Files are read and written explicitly as UTF-8; Windows PowerShell 5.1 scripts containing non-ASCII text retain their required UTF-8 BOM.

## Build and test

```powershell
cd enhancements
npm ci
npm run build
npm run check
npm run check:ui
```

Use `npm run check:ui -- --list` to list UI suites, or supply a test filename after `--`. `npm run test:quality -- --list` lists classified suites linked to requirements. Add tests through the existing catalog and runners, with explicit module ownership, cleanup, and implementation/stress purposes. Shared build output must be generated serially.

Test repositories, host copies, and installer payloads use the managed artifact lifecycle. Retain logs and evidence while reclaiming owned temporary payloads. Never use a user's real repository to test push, pull, discard, or other data-changing operations.

## Delivery

Functional candidates must include a verified local installation. Validate the same candidate in isolated install/check/uninstall/reinstall/check cycles, including backup restoration and removal without a compatible backup. The real user environment receives only a read-only uninstall preview before the final installation. Preserve documents, configuration, and recovery material.

Distinguish source changes, build success, installed assets, loaded windows, and verified behavior. Do not close user windows or discard drafts. Explain when a manual restart is needed. Public functional candidates increment the release sequence and include user-visible notes; an unpublished candidate is not a remotely available release.

Review the diff and run `git diff --check`. Stage only explicit reviewed paths. Commits use Conventional Commits with a Chinese result-oriented title, a blank line, and one `- detail` item per body line. Validate the message through `scripts/check_commit_messages.py --message-file <file>`, commit with `git commit -F <file>`, and verify the actual body. Do not push without explicit authorization.

Detailed design, issue tracking, installation, and historical verification records currently remain in Chinese. Their migration is tracked by R082; this guide does not replace those records or claim that all prior issues are resolved.
