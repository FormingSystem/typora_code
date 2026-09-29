[Chinese](resource_capacity.md)

<a id="section_058693dc917d"></a>
# R075 User Content Capacity and Runtime Failure

2026-09-25 User explicitly requested to cancel the restriction of rejecting content based on preset file size, quantity, or processing volume: whether the device can handle it is determined by the actual runtime results, and the user can independently trim the files. The previous Markdown comparison's two sides totaling 1MiB and 10000 blocks rollback rules are covered by this requirement.

<a id="section_d52844e80491"></a>
## Behavior and Scope

Normal file read/write, window handover, preview, outline, Git document/content/difference/status/repository discovery, search and replace, SSH file protocol, session recovery must not reject, omit, or truncate user content due to product-builtin capacity constants. Download, certificate, and plugin packages should not use any volume as a format validity criterion. Cancel fixed time limits to avoid content processing rejection; network connection/credential wait timeout is not equivalent to content capacity limits.

Maintain streaming transmission, concurrent queue, yielding main thread in batches, visible line virtualization, cache eviction and difference algorithm's low-cost rollback: these methods process complete content, and should not limit the final accessible result. User explicitly set search scope, historical retention strategy, etc., are still valid; default cannot secretly replace user input size limits. The real format, length or memory errors of the operating system/third-party engine should be reported truthfully, not disguised as predictive capability.

This requirement does not cancel file identity/concurrency conflict, encoding, binary format, permission, path boundary, TLS, compressed package path traversal, unsaved document and incomplete replacement protection. Block size only determines transmission method, not the total size limit of the file.

<a id="section_a6ca6c98bb7b"></a>
## Owner and Implementation

Capacity rules are cleaned up with each domain service, without increasing a global 'large file service' or moving all processing into UI. Markdown comparison retains generation cancellation and batch construction; text files maintain complete snapshot and atomic saving; Git maintains flow consumer backpressure and cancellation; search worker can be canceled by the user, not pre-terminated based on file size or result quantity; SSH local response and remote read/write synchronization cancel capacity limits, avoiding one side being open while still being intercepted by downstream.

Actual read, allocation or rendering exceptions are presented through the original error channel; failure should not clear the current document, impersonate success, truncate content or overwrite other operations. Results that are canceled or switched by the user still need to be rejected. Progress, cache, pagination and user settings should not be mixed as capacity limits.

<a id="section_a2a942842079"></a>
## Verification and delivery

First scan the call chain and original capacity branch, then verify with real content exceeding the original threshold: Markdown greater than 1MiB, text and Git greater than 16MiB, search greater than the old file/snapshot threshold, SSH large content and directory, and search paths exceeding the original result limit. Cover complete bytes, final results, save/cancel/failure and theme/location retention, reuse existing tests; cannot use increased constants or deleted old assertions to replace behavior verification. Build, install check, isolate uninstall and reinstall, and deliver, and truthfully record if the platform is not covered.

Actual scanning and final verification see [2026.09.25.2 Evidence](../enhancements/tests/evidence/resource_capacity_20260925.json); do not claim that third-party editors and operating system capacities are infinite.

2026-09-25 Supplement: User explicitly requested that a 64GiB device can try 300MiB files. Acceptance includes 300MiB complete read/write and repeated loading after GC's heap/external/arrayBuffers/RSS sampling. Observation data is used to locate whether the owner releases resources, and cannot be used to recover the preset rejection threshold; single-process memory increase or RSS not immediately falling back is not separately concluded as a leak. The workbench's persistent monitoring is not a prerequisite for this capacity opening.

SSH's request_timeout now only controls the protocol handshake; connected files/Git requests are not rejected due to processing time, and the connection remains alive by OpenSSH's keep-alive and user disconnection control. Request serialization failure does not register pending response queue, and response allocation failure cleans the connection and pending response objects.

Memory Recheck Entry: Execute `node scripts/test_resource_capacity.mjs` in the enhancements directory, generate a temporary 300MiB file, and output integrity assertions and memory samples for each round. This entry does not read user documentation and is not part of the product's persistent monitoring or rejection open conditions.
