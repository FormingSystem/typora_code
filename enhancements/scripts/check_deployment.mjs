import fs from "node:fs";
import "./test_native_profile.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const enhancement_root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const typora_root = path.resolve(enhancement_root, "..");
process.chdir(enhancement_root);
const bundle_markers = fs.readFileSync(path.join(typora_root, 'enhancements/bundle_markers.txt'), 'utf8')
  .split(/\r?\n/u).map((marker) => marker.trim()).filter(Boolean);
const bundle_source = fs.readFileSync(path.join(typora_root, 'enhancements/dist/workbench.js'), 'utf8') + fs.readFileSync(path.join(typora_root, 'enhancements/dist/workspace.css'), 'utf8');
for (const marker of ['bind_reading_action_events', 'bind_reading_navigation', 'initialize_workspace', 'create_reading_workspace',
  'linux-note-reading-position:v1:', 'data-linux-note-reading-positions', 'bind_file_path_actions', 'data-linux-note-copy-path',
  'bind_git_graph', 'data-linux-note-git-graph', 'linux_note:git_graph', 'data-linux-note-git-graph-actions', 'plan_git_action', 'linux-note-git-graph:v2:', 'git-graph-dialog-shade', 'data-linux-note-source-control', 'data-linux-note-monaco-diff', 'linux_note:source_control',
  'data-linux-note-git-commit-shortcut', 'data-linux-note-scm-history', 'append_git_ignore', '#outline-btn-wrapper', 'data-linux-note-reading-minimap', 'bind_reading_minimap', 'data-linux-note-git-status', 'data-linux-note-git-sync', 'data-linux-note-git-discard', 'trashItem']) {
  if (!bundle_markers.includes(marker)) throw new Error(`required deployment capability is missing: ${marker}`);
}
for (const marker of bundle_markers) {
  if (!bundle_source.includes(marker)) throw new Error(`prebuilt bundle is missing: ${marker}`);
}
for(const marker of ['data-git-icon','bind_workspace_browser','data-linux-note-workspace-files','data-linux-note-workspace-search','data-linux-note-workspace-explorer','install_workspace_activity','data-linux-note-terminal-theme','data-linux-note-workspace-outline','bind_workspace_selection_search','data-linux-note-lookup-preview','linux-note-search-selection','workspace-search-preview-section','linux-note:lookup:preview-scale:v1','install_workspace_sidebar_sash','data-linux-note-source-editing','install_workspace_footer','bind_workspace_editor_status','linux-note-editor-status','install_workspace_titlebar']) {
  if(!bundle_markers.includes(marker))throw new Error(`required workspace deployment capability is missing: ${marker}`);
}
const codicon_root = 'vendor/codicons';
// 这些元数据按Git的eol=lf检出，摘要必须从同一规范字节计算。
for (const name of ['icons.json', 'source_manifest.json']) if (fs.readFileSync(`${codicon_root}/${name}`, 'utf8').includes('\r')) throw new Error(`Codicons metadata must use LF before calculating checksums: ${name}`);
const codicon_checksums = new Map();
for(const line of fs.readFileSync(`${codicon_root}/SHA256SUMS`,'utf8').trim().split(/\r?\n/u)) {
  const match=/^([a-f\d]{64})  ([a-zA-Z0-9_./-]+)$/u.exec(line);
  if(!match||match[2].includes('..')||codicon_checksums.has(match[2])||createHash('sha256').update(fs.readFileSync(`${codicon_root}/${match[2]}`)).digest('hex')!==match[1])throw new Error('Codicons asset hash mismatch');
  codicon_checksums.set(match[2], match[1]);
}
const codicon_manifest = JSON.parse(fs.readFileSync(`${codicon_root}/source_manifest.json`, 'utf8'));
const codicon_icons = JSON.parse(fs.readFileSync(`${codicon_root}/icons.json`, 'utf8'));
if (codicon_manifest.repository_url !== 'https://github.com/microsoft/vscode-codicons' || !/^[a-f\d]{40}$/u.test(codicon_manifest.revision)) throw new Error('Codicons source identity is invalid');
if (Object.keys(codicon_icons).sort().join('\n') !== Object.keys(codicon_manifest.icons).sort().join('\n')) throw new Error('Codicons icon indexes differ');
for (const [icon_name, source] of Object.entries(codicon_manifest.icons)) {
  if (!/^icons\/[a-z0-9_]+\.svg$/u.test(source.file) || !/^src\/icons\/[a-z0-9-]+\.svg$/u.test(source.source_path) || !/^[a-f\d]{40}$/u.test(source.git_blob_sha1) || !/^[a-f\d]{64}$/u.test(source.sha256)) throw new Error(`Codicons source entry is invalid: ${icon_name}`);
  const icon_source = fs.readFileSync(`${codicon_root}/${source.file}`, 'utf8');
  const digest = createHash('sha256').update(icon_source).digest('hex');
  if (digest !== source.sha256 || codicon_checksums.get(source.file) !== digest || codicon_icons[icon_name] !== icon_source.trim()) throw new Error(`Codicons manifest differs from packaged icon: ${icon_name}`);
}
for (const source of codicon_manifest.licenses) {
  if (!/^[A-Z_]+$/u.test(source.file) || !/^[a-f\d]{40}$/u.test(source.git_blob_sha1) || !/^[a-f\d]{64}$/u.test(source.sha256)) throw new Error(`Codicons license entry is invalid: ${source.file}`);
  const digest = createHash('sha256').update(fs.readFileSync(`${codicon_root}/${source.file}`)).digest('hex');
  if (digest !== source.sha256 || codicon_checksums.get(source.file) !== digest) throw new Error(`Codicons manifest differs from packaged license: ${source.file}`);
}
if(!bundle_source.includes('Microsoft VS Code Codicons')||!bundle_source.includes('https://creativecommons.org/licenses/by/4.0/'))throw new Error('Codicons attribution is missing from the installed bundle');
for (const line of fs.readFileSync('vendor/gemoji/SHA256SUMS', 'utf8').trim().split(/\r?\n/u)) {
  const match = /^([a-f\d]{64})  (emoji\.json|LICENSE)$/u.exec(line);
  if (!match || createHash('sha256').update(fs.readFileSync('vendor/gemoji/' + match[2])).digest('hex') !== match[1]) throw new Error('Gemoji release hash mismatch');
}
if (!bundle_source.includes('Copyright (c) 2019 GitHub, Inc.')) throw new Error('Gemoji license is missing from installed bundle');
const deployment_files = [
  "install_windows.cmd",
  "install_windows.ps1",
  "check_windows.ps1",
  "uninstall_windows.cmd",
  "uninstall_windows.ps1",
  "restore_windows.ps1",
  "install.sh",
  "check.sh",
  "restore.sh",
  "scripts/lib/typora_environment.ps1",
  "scripts/lib/typora_install_log.ps1",
  "scripts/lib/typora_install_permissions.ps1",
  "scripts/lib/typora_terminal.ps1",
  "scripts/lib/typora_environment.sh",
  "scripts/lib/typora_workspace.ps1",
  "scripts/lib/typora_uninstall.ps1",
  "scripts/lib/typora_workspace.sh",
  "scripts/lib/typora_workspace.py",
  "enhancements/runtime_head.html",
  "scripts/install_workspace_windows.ps1",
  "scripts/restore_workspace_windows.ps1",
];

const sources = new Map(deployment_files.map((relative_path) => {
  const file_path = path.join(typora_root, relative_path);
  if (!fs.existsSync(file_path)) throw new Error(`deployment file is missing: ${relative_path}`);
  return [relative_path, fs.readFileSync(file_path, "utf8")];
}));

const forbidden_install_locations = [
  /[a-z]:\\program files(?: \(x86\))?\\typora/iu,
  /[a-z]:\\users\\[^\s"']+\\.*typora/iu,
  /[a-z]:\\typora(?:\\|["'])/iu,
  /\/usr\/share\/typora(?:\/|["'])/u,
  /\/opt\/typora(?:\/|["'])/u,
];
for (const [relative_path, source] of sources) {
  for (const forbidden_pattern of forbidden_install_locations) {
    if (forbidden_pattern.test(source)) {
      throw new Error(`hard-coded Typora installation path in ${relative_path}: ${forbidden_pattern}`);
    }
  }
}

const powershell_environment = sources.get("scripts/lib/typora_environment.ps1");
for (const marker of ["TYPORA_ROOT", "Get-Process Typora", "Registry::", "Read-Host", "^/mnt/", "^/([A-Za-z])"]) {
  if (!powershell_environment.includes(marker)) throw new Error(`PowerShell discovery marker is missing: ${marker}`);
}

const bash_environment = sources.get("scripts/lib/typora_environment.sh");
for (const marker of ["UCRT64", "Linux", "cygpath", "TYPORA_ROOT", "/dev/tty", "typora_root_from_candidate"]) {
  if (!bash_environment.includes(marker)) throw new Error(`Bash discovery marker is missing: ${marker}`);
}

const release_root = path.join(enhancement_root, 'dist');
const {release_info}=await import('../src/workspace_update_service.cjs');
const update_release=fs.readFileSync(path.join(enhancement_root,'release.json'),'utf8').replace(/\r\n?/gu,'\n');
release_info(JSON.parse(update_release));
if(fs.readFileSync(path.join(release_root,'assets/update/release.json'),'utf8')!==update_release)throw new Error('Update release notes differ from the built version. Rebuild before publishing.');
for(const name of ['workspace_update_service.cjs','workspace_update_archive.ps1'])if(fs.readFileSync(path.join(release_root,'assets/update',name),'utf8')!==fs.readFileSync(path.join(enhancement_root,'src',name),'utf8').replace(/\r\n?/gu,'\n'))throw new Error('Update helper differs from source: '+name);

const fontawesome_root = path.join(enhancement_root, 'vendor/fontawesome');
const fontawesome_manifest = JSON.parse(fs.readFileSync(path.join(fontawesome_root, 'SOURCE.json'), 'utf8'));
const fontawesome_icons = JSON.parse(fs.readFileSync(path.join(fontawesome_root, 'icons.json'), 'utf8'));
for (const entry of fontawesome_manifest.files) {
  if (!['file.svg', 'folder.svg', 'folder-open.svg', 'LICENSE.txt'].includes(entry.file)) throw new Error('Invalid Font Awesome asset');
  const bytes = fs.readFileSync(path.join(fontawesome_root, entry.file));
  if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new Error('Font Awesome source hash mismatch');
  if (entry.file.endsWith('.svg') && fontawesome_icons[entry.file.slice(0, -4)] !== bytes.toString('utf8')) throw new Error('Font Awesome bundled icon differs from original');
}
if (!bundle_source.includes('Font Awesome Free 6.7.2') || !fs.readFileSync(path.join(release_root, 'licenses/fontawesome.txt'), 'utf8').includes('CC BY 4.0')) throw new Error('Font Awesome attribution missing');
const required = new Set(['workspace_core.js','workspace_core.css','workspace.css','workbench.js']);
const seen = new Set();
for (const line of fs.readFileSync(path.join(release_root, 'SHA256SUMS'),'utf8').trim().split(/\r?\n/u)) {
  const match = /^([a-f0-9]{64})  (workspace_core\.(?:js|css)|workspace\.css|workbench\.js|(?:assets|locales|licenses)\/[a-zA-Z0-9_./-]+)$/u.exec(line);
  if (!match || match[2].includes('..') || seen.has(match[2])) throw new Error('Invalid or duplicate product asset manifest');
  seen.add(match[2]);
  if (createHash('sha256').update(fs.readFileSync(path.join(release_root,match[2]))).digest('hex') !== match[1]) throw new Error(`Product asset hash mismatch: ${match[2]}`);
}
for (const name of required) if (!seen.has(name)) throw new Error(`Missing startup asset ${name}`);
const head = sources.get('enhancements/runtime_head.html');
for (const name of required) if ((head.match(new RegExp(`typora://app/userData/typora_code/${name.replaceAll('.', '\\.')}`, 'gu')) || []).length !== 1) throw new Error(`Head must contain one ${name}`);
if ((head.match(/data-typora-code-style/gu)||[]).length !== 2 || head.indexOf('workspace_core.css') > head.indexOf('workspace.css')) throw new Error('Static startup order is invalid');
if (head.includes('/plugins/') || head.includes('data-linux-note-enhancements')) throw new Error('Old entry in production head');
const core_source = fs.readFileSync(path.join(release_root,'workspace_core.js'),'utf8');
if (!core_source.includes('typora-code:workspace') || !bundle_source.includes('typora-code:workspace')) throw new Error('Independent runtime namespace missing');
for (const line of fs.readFileSync('dist/terminal_runtime/SHA256SUMS','utf8').trim().split(/\r?\n/u)) {
  const match = /^([a-f0-9]{64})  ([0-9.]+\/(?:node-pty\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9._-]+|terminal_broker.cjs))$/u.exec(line);
  if (!match || match[2].includes('..') || createHash('sha256').update(fs.readFileSync('dist/terminal_runtime/'+match[2])).digest('hex') !== match[1]) throw new Error('Terminal asset hash mismatch');
}
const node_release = JSON.parse(fs.readFileSync('node_runtime.json','utf8'));
if (!bundle_source.includes(node_release.version) || !bundle_source.includes('Copyright (c) 2017-2019, The xterm.js authors')) throw new Error('Terminal runtime version or license is missing');
if (!bundle_source.includes('Monaco Editor 0.56.0 (MIT)') || !bundle_source.includes('_VSCODE_NLS_LANGUAGE')) throw new Error('Monaco license or locale is missing');
console.log(`validated ${deployment_files.length} portable deployment files and ${seen.size} independent workspace assets`);
