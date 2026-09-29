[Chinese](test_artifacts.md)

<a id="section_021365874446"></a>
# R077 Test temporary product lifecycle

2026-09-25: Native acceptance copies the entire host each time, installs test cases by copying the distribution files and generates multiple isolated backups; the runner only terminates processes, not recovers payloads. Failed test cases and temporary UI directories are also retained for a long time. The host has accumulated about 226GiB of such directories, and users have manually cleaned them up. The new rules only manage test-generated products. Real Typora's backup, user documents, themes, and configurations are not within the automatic cleanup scope.

<a id="section_05207b74f6ab"></a>
## Ownership and lifecycle

`enhancements/scripts/manage_test_artifacts.py` centralized registration and recovery. Native test cases continue to be logged in `.cache/issue_tracking/native/<随机ID>`; complete `npm run check`, installation, uninstallation, and unified UI runner use `.cache/test_runs/<随机ID>/work` as temporary root, and evidence is stored in the same-level `evidence`. The large payloads are no longer defaulted to be left in the system TEMP. The directory is marked as soon as it starts to be allocated, including type, creation time, owner process, and its launch identity; child processes are included in the lease, to avoid PID reuse misjudgment.

UI and complete checks will retain JSON measurement results with custom names; native and installation test cases will retain check results and logs. Successful, failed, and timeout cases will first retain the result JSON, logs, and screenshots, and then recover the copied host, test workspace, isolated configuration, and backup. Clean up the failure records and do not hide the original test errors; next test startup will recover the marked payloads if the duration exceeds 24 hours, and the owner and already registered child processes have all ended. Only scan these two exclusive root directories, do not delete system temporary directories based on file age or name, and do not touch real recovery backups. Unmarked old directories are not automatically adopted.

Session tests across two process startups are held by the outer runner, and the directories are clearly retained between stages, and finally unifiedly ended. Debug can set `TYPORA_KEEP_TEST_WORK=1` to retain payloads; next expired recovery is still subject to process survival constraints. Manual recovery entry defaults to only list plans, and `python enhancements/scripts/manage_test_artifacts.py sweep --apply` will handle directories that meet the conditions.

Boundary checks include fixed root, random ID, fixed payload name, and prohibition of symbolic links/junctions crossing; recheck processes and paths before cleanup. Payloads are not deleted if registration and evidence retention fail. Test directories cannot carry unique real user data. Volume and time rules are not used to limit user file contents.

<a id="section_19ddf4462452"></a>
## Acceptance

Verify normal/failure cleanup, log/screenshot retention, unmarked rejection, path overflow and link rejection, active process skip, expired crash directory recovery and duplicate end. After real native acceptance, only retain results/screenshots; Windows 5.1 installation and uninstallation regression test payloads are removed; UI tests include timeout cleanup. Retain platform and port replacement boundaries, cannot equate cleanup confirmation with function pass.

Public check entry is held by `run_test_command.py` for the entire set of temporary roots for checks; `check:core` is only for internal commands. New tests can use system temporary directory APIs through these runners to fall into exclusive workspaces, and directly execute old scripts without automatically obtaining outer cleanup. File locks serialization registration and recovery, process exit automatically releases locks; read-only Git objects are handled according to verified boundaries, temporary file occupation is limited to retries, and failure retains the scene and cleanup_error.
