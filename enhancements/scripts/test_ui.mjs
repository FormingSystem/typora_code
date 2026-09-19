import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const script_directory = dirname(fileURLToPath(import.meta.url));
const package_directory = dirname(script_directory);
const require = createRequire(import.meta.url);
const configured_timeout_ms = Number.parseInt(process.env.TYPORA_UI_TEST_TIMEOUT_MS ?? "", 10);
const test_timeout_ms = Number.isFinite(configured_timeout_ms) && configured_timeout_ms >= 1_000
  ? configured_timeout_ms
  : 180_000;
const host_fixture_environment = Object.freeze([
  "ELECTRON_RUN_AS_NODE",
  "TYPORA_LOOKUP_CODEMIRROR_DIR",
  "TYPORA_PREVIEW_TEST_ROOT",
  "TYPORA_RESOURCES_DIR",
  "TYPORA_TEST_USER_DATA",
]);

// Keep this list explicit. Each entry is an isolated hidden-Electron fixture that
// creates its own temporary workspace and does not launch or modify real Typora.
const ui_tests = Object.freeze([
  "test_workspace_stability.cjs",
  "test_diff_overview.cjs",
  "test_git_graph_i18n.cjs",
  "test_git_graph_interaction.cjs",
  "test_git_scm_actions.cjs",
  "test_git_discard_confirmation.cjs",
  "test_git_scm_ref_picker.cjs",
  "test_git_quick_actions.cjs",
  "test_git_diff_toolbar.cjs",
  "test_git_revision_reader.cjs",
  "test_git_graph_pull_request.cjs",
  "test_git_graph_ref_colors.cjs",
  "test_git_graph_settings_view.cjs",
  "test_git_graph_visibility.cjs",
  "test_interaction.cjs",
  "test_reading_media_viewer.cjs",
  "test_workspace_startup.cjs",
  "test_workspace_breadcrumbs.cjs",
  "test_reading_minimap.cjs",
  "test_reading_lifecycle.cjs",
  "test_reading_link_hover.cjs",
  "test_scm_history_layout.cjs",
  "test_scm_file_icons.cjs",
  "test_scm_sidebar_layout.cjs",
  "test_scm_vscode_geometry.cjs",
  "test_markdown_color.cjs",
  "test_terminal_theme.cjs",
  "test_terminal_panel.cjs",
  "test_terminal_composition.cjs",
  "test_terminal_capture.cjs",
  "test_workspace_activity.cjs",
  "test_workspace_core_smoke.cjs",
  "test_workspace_diff_status.cjs",
  "test_workspace_editor_status.cjs",
  "test_workspace_explorer.cjs",
  "test_workspace_explorer_history.cjs",
  "test_workspace_file_editing.cjs",
  "test_workspace_file_icons.cjs",
  "test_workspace_files_search.cjs",
  "test_workspace_first_frame.cjs",
  "test_workspace_footer.cjs",
  "test_workspace_document_margin.cjs",
  "test_workspace_lookup_preview.cjs",
  "test_workspace_outline.cjs",
  "test_workspace_source_outline.cjs",
  "test_source_outline_settings.cjs",
  "test_workspace_preferences.cjs",
  "test_workspace_selection_search.cjs",
  "test_workspace_shortcuts.cjs",
  "test_workspace_zoom.cjs",
  "test_workspace_sidebar_sash.cjs",
  "test_workspace_source_lifecycle.cjs",
  "test_workspace_titlebar.cjs",
  "test_workspace_titlebar_entries.cjs",
  "test_workspace_view_layout.cjs",
  "test_workspace_tab_controls.cjs",
  "test_workspace_editor_actions.cjs",
  "test_workspace_file_header.cjs",
  "test_workspace_interaction.cjs",
  "test_workspace_interaction_defaults.cjs",
  "test_workspace_quick_open_performance.cjs",
  "test_workspace_drag.cjs",
  "test_workspace_detached_window.cjs",
  "test_workspace_document_transfer.cjs",
  "test_workspace_widgets.cjs",
  "test_workspace_escape_focus.cjs",
  "test_workspace_dismissal.cjs",
]);

// This is still a useful focused test, but it starts a real shell through the
// terminal runtime found in TYPORA_TEST_USER_DATA. Keep it outside the isolated
// suite so `npm run check:ui` never depends on a Typora installation or profile.
const excluded_ui_tests = new Map([
  ["test_workspace_clangd_outline.cjs", "requires installed clangd; run npm run check:clangd-ui"],
  ["test_terminal_interaction.cjs", "requires an installed terminal runtime and starts a real shell"],
]);

function classify_test_files() {
  const discovered = readdirSync(script_directory)
    .filter((name) => /^test_.*\.cjs$/u.test(name))
    .sort();
  const classified = new Set([...ui_tests, ...excluded_ui_tests.keys()]);
  const missing = [...classified].filter((name) => !discovered.includes(name));
  const unclassified = discovered.filter((name) => !classified.has(name));
  if (missing.length || unclassified.length) {
    const messages = [];
    if (missing.length) messages.push(`missing classified tests: ${missing.join(", ")}`);
    if (unclassified.length) messages.push(`unclassified tests: ${unclassified.join(", ")}`);
    throw new Error(messages.join("; "));
  }
}

function selected_tests(arguments_) {
  if (!arguments_.length) return [...ui_tests];
  const unknown = arguments_.filter((name) => !ui_tests.includes(name));
  if (unknown.length) {
    throw new Error(`unknown or non-isolated UI test: ${unknown.join(", ")}`);
  }
  return [...new Set(arguments_)];
}

function print_list() {
  console.log("Isolated hidden-Electron UI tests:");
  for (const name of ui_tests) console.log(`  ${name}`);
  console.log("\nExcluded from the isolated suite:");
  for (const [name, reason] of excluded_ui_tests) console.log(`  ${name}: ${reason}`);
}

function run_test(electron_executable, name, position, total) {
  return new Promise((resolve) => {
    const started_at = performance.now();
    const child_environment = { ...process.env };
    for (const name of host_fixture_environment) delete child_environment[name];
    console.log(`\n[UI ${position}/${total}] ${name}`);
    const child = spawn(electron_executable, [join(script_directory, name)], {
      cwd: package_directory,
      env: child_environment,
      stdio: "inherit",
      windowsHide: true,
    });
    let spawn_error;
    let timed_out = false;
    const timeout = setTimeout(() => {
      timed_out = true;
      console.error(`[UI TIMEOUT] ${name} exceeded ${test_timeout_ms} ms`);
      child.kill("SIGKILL");
    }, test_timeout_ms);
    child.once("error", (error) => {
      spawn_error = error;
    });
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      const duration_ms = Math.round(performance.now() - started_at);
      const passed = !spawn_error && !timed_out && code === 0;
      console.log(`[UI ${passed ? "PASS" : "FAIL"}] ${name} (${duration_ms} ms)`);
      resolve({ name, passed, code, signal, duration_ms, timed_out, error: spawn_error?.message });
    });
  });
}

classify_test_files();

const arguments_ = process.argv.slice(2);
if (arguments_.includes("--help")) {
  console.log("Usage: npm run check:ui -- [test_name.cjs ...]\n       npm run check:ui -- --list");
  process.exit(0);
}
if (arguments_.includes("--list")) {
  if (arguments_.length !== 1) throw new Error("--list cannot be combined with test names");
  print_list();
  process.exit(0);
}

const tests = selected_tests(arguments_);
const electron_executable = require("electron");
const electron_version = require("electron/package.json").version;
console.log(`Electron ${electron_version}: ${electron_executable}`);
console.log(`Running ${tests.length} isolated UI tests sequentially (${test_timeout_ms} ms timeout per test).`);

const suite_started_at = performance.now();
const results = [];
for (const [index, name] of tests.entries()) {
  results.push(await run_test(electron_executable, name, index + 1, tests.length));
}

const failures = results.filter((result) => !result.passed);
const duration_ms = Math.round(performance.now() - suite_started_at);
console.log(`\nUI test summary: ${results.length - failures.length} passed, ${failures.length} failed (${duration_ms} ms).`);
for (const failure of failures) {
  console.error(`  ${failure.name}: code=${failure.code ?? "none"}, signal=${failure.signal ?? "none"}${failure.timed_out ? ", timed out" : ""}${failure.error ? `, ${failure.error}` : ""}`);
}
if (failures.length) process.exitCode = 1;
