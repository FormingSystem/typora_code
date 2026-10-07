import {workspace_text} from './workspace_i18n';
import {workspace_element as el,workspace_button as button} from './workspace_widgets';
import {register_workspace_context_guard} from './workspace_context';
import type {workspace_setting_field} from './workspace_settings_registry';

type startup_options = {restoreWhenLaunch?: string | number; pinFolder?: string};

/** Native preferences remain the only persisted owner; this view never writes defaults. */
export function mount_window_settings(host: HTMLElement, _fields: workspace_setting_field[], status: (text: string) => void) {
  const runtime = window as unknown as {JSBridge?: {invoke(method: string, ...args: unknown[]): Promise<unknown>}};
  const row = el('div', 'workspace-setting-row'), label = el('label', 'workspace-setting-label', workspace_text('window_startup_label'));
  const select = el('select'); select.dataset.setting = 'window.startup_behavior'; select.setAttribute('aria-label', workspace_text('window_startup_label'));
  const folder = el('p'), description = el('p', '', workspace_text('window_startup_description'));
  let disposed = false, busy = false, revision = 0, snapshot: startup_options | undefined;
  const invoke = async (method: string, ...args: unknown[]) => {
    if (!runtime.JSBridge?.invoke) throw Error(workspace_text('window_startup_unavailable'));
    return runtime.JSBridge.invoke(method, ...args);
  };
  const read = async (): Promise<startup_options> => {
    const value = await invoke('setting.getExtraOption');
    const options = typeof value === 'string' ? JSON.parse(value) : value;
    if (!options || typeof options !== 'object') throw Error(workspace_text('window_startup_unavailable'));
    return options as startup_options;
  };
  const show = (options: startup_options) => {
    snapshot = options;
    const mode = String(options.restoreWhenLaunch ?? ''); select.replaceChildren();
    if (!['0', '1', '2', '3'].includes(mode)) {
      const option = new Option(workspace_text('window_startup_native_default'), mode); option.disabled = true; select.append(option);
    }
    for (const [value, title] of [['0', workspace_text('window_startup_empty')], ['1', workspace_text('window_startup_folders')], ['2', workspace_text('window_startup_restore')], ['3', workspace_text('window_startup_custom')]]) select.append(new Option(title, value));
    select.value = mode; folder.textContent = mode === '3' ? options.pinFolder || '' : ''; folder.hidden = !folder.textContent;
  };
  const disable = (value: boolean) => { select.disabled = value; retry.disabled = value; };
  const report = (error: unknown) => status(error instanceof Error ? error.message : String(error));
  async function refresh() {
    if (disposed || busy) return;
    const request = ++revision; disable(true);
    try { const options = await read(); if (!disposed && request === revision) { show(options); status(''); } }
    catch (error) { if (!disposed && request === revision) { snapshot = undefined; report(error); } }
    finally { if (!disposed && request === revision) { select.disabled = !snapshot; retry.disabled = false; } }
  }
  async function save(mode: string) {
    if (disposed || busy || !snapshot || !['0', '1', '2', '3'].includes(mode)) return;
    busy = true; const request = ++revision; disable(true);
    try {
      const current = await read();
      if (disposed || request !== revision) return;
      if (mode === '3' && !current.pinFolder) {
        const choice = await invoke('dialog.showOpenDialog', {properties: ['openDirectory']}) as {canceled?: boolean; filePaths?: string[]};
        if (disposed || request !== revision) return;
        if (choice?.canceled || !choice?.filePaths?.[0]) { show(current); status(workspace_text('file_tree_operation_canceled')); return; }
        await invoke('setting.put', 'pinFolder', choice.filePaths[0]);
        if (disposed || request !== revision) return;
      }
      if (String(current.restoreWhenLaunch) !== mode) await invoke('setting.put', 'restoreWhenLaunch', Number(mode));
      const actual = await read();
      if (disposed || request !== revision) return;
      show(actual);
      if (String(actual.restoreWhenLaunch) !== mode) throw Error(workspace_text('window_startup_save_unconfirmed'));
      status(workspace_text('window_startup_saved'));
    } catch (error) {
      if (!disposed && request === revision) {
        try { const actual = await read(); if (!disposed && request === revision) show(actual); } catch { snapshot = undefined; }
        if (!disposed && request === revision) report(error);
      }
    } finally { busy = false; if (!disposed && request === revision) { select.disabled = !snapshot; retry.disabled = false; } }
  }
  const retry = button(workspace_text('window_startup_reload'), () => void refresh());
  label.append(select); row.append(label, retry, description, folder); host.append(row);
  select.onchange = () => void save(select.value);
  const focus = () => { void refresh(); }; window.addEventListener('focus', focus);
  const release = register_workspace_context_guard(() => busy ? workspace_text('window_startup_saving') : undefined);
  void refresh();
  return {update(_next: workspace_setting_field[]) {}, dispose() { disposed = true; revision++; window.removeEventListener('focus', focus); release(); select.onchange = null; }};
}
