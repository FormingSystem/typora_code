const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'typora_graph_i18n_'));
app.setPath('userData', path.join(root, 'user_data'));
app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});

const expectations = {
  'zh-CN': {
    graph_label: 'Git Graph 提交历史',
    toolbar: ['查找提交', '在仓库根目录打开集成终端', 'Git 操作和设置', '获取远端更新', '刷新提交图'],
    source_control: '源代码管理',
    message: '消息（Ctrl+Enter 提交）',
    scm_tools: ['刷新', '选择视图'],
    view_menu: ['仓库', '更改', '提交图', '配置此右键菜单…'],
    merge_title: '合并到当前分支',
    merge_field: '合并方式',
    merge_choice: '默认合并',
    preview: '预览操作',
    execute: '执行此操作',
    settings_title: 'Git Graph 设置',
    settings_field: '连线样式',
    settings_choice: '曲线',
    close: '关闭',
  },
  'en-US': {
    graph_label: 'Git Graph commit history',
    toolbar: ['Find Commits', 'Open Integrated Terminal at Repository Root', 'Git Actions and Settings', 'Fetch from Remote(s)', 'Refresh Graph'],
    source_control: 'Source Control',
    message: 'Message (Ctrl+Enter to Commit)',
    scm_tools: ['Refresh', 'Select Views'],
    view_menu: ['Repositories', 'Changes', 'Graph', 'Configure this Context Menu…'],
    merge_title: 'Merge into Current Branch',
    merge_field: 'Merge Method',
    merge_choice: 'Default Merge',
    preview: 'Preview Action',
    execute: 'Run this Action',
    settings_title: 'Git Graph Settings',
    settings_field: 'Line Style',
    settings_choice: 'Curved',
    close: 'Close',
  },
};

function host_source() {
  return `(() => {
    const runner = () => ({run: async () => '', cancel() {}});
    const path_api = {
      join: (...parts) => parts.join('/'),
      basename: value => value.replace(/\\\\/g, '/').split('/').filter(Boolean).at(-1) || value,
    };
    const host = {
      runner, path_api, process_api: {platform: 'win32'},
      fs: {existsSync: () => false, statSync: () => ({size: 0}), readFileSync: () => ''},
      core: {app: {workspace: {sidebar: {toggle() {}}, activeLeaf: null}}},
      terminal() {}, clear_avatars() {}, copy: async () => {}, can_change_files: () => true,
      show_output() {}, show_history() {}, export_file() {}, discover: async () => [],
    };
    window.panel = new graph_i18n_qa.git_graph_panel(host, 'C:/example repository');
    const hash = 'a'.repeat(40);
    panel.state = {
      root: 'C:/example repository', head: hash, branch: 'main', refs: [], commits: [], more: false,
      stashes: [], changes: [], remotes: [{name: 'origin', fetch: 'https://example.invalid/repo.git', push: 'https://example.invalid/repo.git'}], operation: '',
    };
    document.body.append(panel.workbench.sidebar, panel.container);
  })()`;
}

async function inspect_locale(bundle, html, locale) {
  const window = new BrowserWindow({show: false, width: 1000, height: 760, webPreferences: {nodeIntegration: true, contextIsolation: false}});
  try {
    await window.loadFile(html);
    await window.webContents.executeJavaScript(`window._options = {displayLang: ${JSON.stringify(locale)}}`);
    await window.webContents.executeJavaScript(bundle);
    await window.webContents.executeJavaScript(host_source());
    return await window.webContents.executeJavaScript(`(() => {
      const direct_text = node => [...node.childNodes].find(child => child.nodeType === Node.TEXT_NODE)?.textContent || '';
      const result = {
        graph_label: panel.container.getAttribute('aria-label'),
        toolbar: [...panel.toolbar.querySelectorAll('button')].map(button => button.title),
        source_control: direct_text(panel.workbench.title),
        message: panel.workbench.message.placeholder,
        scm_tools: [...panel.workbench.title.querySelectorAll('button')].map(button => button.title),
      };
      panel.workbench.view_menu(new MouseEvent('contextmenu', {clientX: 10, clientY: 10, bubbles: true}));
      result.view_menu = [...document.querySelectorAll('.git-graph-menu[data-menu-level="0"] .git-menu-label')].map(node => node.textContent);
      document.querySelectorAll('.git-graph-menu').forEach(node => node.remove());

      panel.action_dialog('merge', 'commit', panel.state.head, panel.state.head);
      let dialog = document.querySelector('.git-graph-dialog-shade');
      result.merge_title = dialog.querySelector('h3').textContent;
      result.merge_field = direct_text(dialog.querySelector('.git-graph-form label'));
      result.merge_choice = dialog.querySelector('select option').textContent;
      const action_buttons = [...dialog.querySelectorAll('.git-graph-dialog-footer button')].map(button => button.textContent);
      result.preview = action_buttons.find(label => /预览|Preview/u.test(label));
      result.execute = action_buttons.find(label => /执行|Run/u.test(label));
      result.close = action_buttons.at(-1);
      dialog.remove();

      panel.settings_dialog();
      dialog = document.querySelector('.git-graph-dialog-shade');
      result.settings_title = dialog.querySelector('h3').textContent;
      const graph_style = dialog.querySelector('[data-setting="graph_style"]');
      result.settings_field = direct_text(graph_style.parentElement);
      result.settings_choice = graph_style.options[0].textContent;
      result.settings_close = [...dialog.querySelectorAll('.git-graph-dialog-footer button')].at(-1).textContent;
      return result;
    })()`);
  } finally {
    window.destroy();
  }
}

app.whenReady().then(async () => {
  const html = path.join(root, 'test.html');
  fs.writeFileSync(html, '<!doctype html><html><body></body></html>');
  const compiled = await build({
    stdin: {contents: 'export { git_graph_panel } from "./src/git_graph_panel";', resolveDir: path.join(__dirname, '..')},
    bundle: true, format: 'iife', globalName: 'graph_i18n_qa', write: false,
  });
  const bundle = compiled.outputFiles[0].text;
  for (const [locale, expected] of Object.entries(expectations)) {
    const actual = await inspect_locale(bundle, html, locale);
    assert.deepEqual(actual, {...expected, settings_close: expected.close}, `${locale} localizes panel, SCM, tooltips, menu and dialogs as one language`);
  }
  console.log('git graph DOM i18n: zh-CN and en-US panel, SCM, tooltips, menus and dialogs passed');
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
