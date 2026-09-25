import {workspace_element as el,workspace_button as button} from './workspace_widgets';
import {WORKSPACE_COLOR_ROLES} from './workspace_color_catalog';
import {save_color_config,read_color_config,normalize_custom_color,parse_color_config,serialize_color_config,type color_mode} from './workspace_color_settings';
import {export_color_file} from './workspace_color_files';
import type {workspace_setting_field} from './workspace_settings_registry';
import {acquire_workspace_style} from './workspace_styles';
import css from './workspace_color_view.css';

export function mount_color_settings(host:HTMLElement,fields:workspace_setting_field[],status:(text:string)=>void){
  const style=acquire_workspace_style('typora-code-style:workspace_color_view',css);
  let draft=read_color_config(),mode:color_mode=document.documentElement.dataset.workspaceColors==='dark'?'dark':'light',disposed=false,revision=0;
  const invalid=new Set<string>(),toolbar=el('div','workspace-color-toolbar'),theme=el('select'),table=el('table','workspace-color-table'),tbody=el('tbody');
  host.classList.add('workspace-color-settings');theme.setAttribute('aria-label','自定义颜色主题');theme.append(new Option('CppGithubConsoles_Light · 明色','light'),new Option('CppGithubConsoles_Dark · 暗色','dark'));theme.value=mode;
  const note=el('p','','留空继承主题。支持 #RGB / #RRGGBB 及带透明度的 #RGBA / #RRGGBBAA。有效改动立即生效并自动保存，无需另点保存。恢复默认即清除自定义色。只有切到对应主题时才显示其配色。');
  const apply=()=>{revision++;save_color_config(draft);status('配色已自动保存并生效。');};
  const report=(error:unknown)=>status(error instanceof Error?error.message:String(error));
  const render=()=>{
    tbody.replaceChildren();invalid.clear();
    for(const role of WORKSPACE_COLOR_ROLES.filter(role=>fields.some(field=>field.key===role.key)).sort((a,b)=>Number(b.key.startsWith('markdown_'))-Number(a.key.startsWith('markdown_')))){
      const row=el('tr'),label=el('td'),value=el('td'),actions=el('td'),input=el('input'),picker=el('input'),key=el('small','',role.key);
      label.append(el('span','',role.title),key);label.title=role.variable||role.selector||'';
      input.type='text';input.value=draft.themes[mode][role.key]||'';input.placeholder='继承主题';input.spellcheck=false;input.dataset.colorKey=role.key;input.setAttribute('aria-label',role.title+' 色值');
      picker.type='color';picker.setAttribute('aria-label',role.title+' 取色');picker.dataset.colorPicker=role.key;
      const fill_picker=()=>{const color=draft.themes[mode][role.key];picker.value=color?.slice(0,7)||'#808080';picker.title=color||'继承主题（选择后自定义）';};fill_picker();
      const change=(text:string)=>{try{const color=normalize_custom_color(text);input.setCustomValidity('');input.removeAttribute('aria-invalid');invalid.delete(role.key);if(color)draft.themes[mode][role.key]=color;else delete draft.themes[mode][role.key];fill_picker();apply();}catch(error){revision++;draft=read_color_config();invalid.add(role.key);input.setCustomValidity(String(error));input.setAttribute('aria-invalid','true');report(error);}};
      input.oninput=()=>change(input.value);picker.oninput=()=>{input.value=picker.value+(draft.themes[mode][role.key]?.slice(7)||'');change(input.value);};
      value.append(picker,input);actions.append(button('恢复默认',()=>{input.value='';change('');}));row.append(label,value,actions);tbody.append(row);
    }
  };
  const inherit=button('当前主题恢复默认',()=>{try{const next=structuredClone(draft);next.themes[mode]={};save_color_config(next);revision++;draft=next;render();status('当前主题已恢复默认并保存。');}catch(error){report(error);}});inherit.dataset.colorAction='inherit';
  const picker=el('input');picker.type='file';picker.accept='.json,application/json';picker.hidden=true;picker.dataset.colorImport='true';
  picker.onchange=async()=>{const file=picker.files?.[0];picker.value='';if(!file)return;const request=++revision;try{const next=parse_color_config(await file.text());if(disposed||revision!==request)return;save_color_config(next);revision++;draft=next;render();status('JSON已导入、保存并生效。');}catch(error){if(!disposed&&revision===request)report(error);}};
  const import_button=button('导入 JSON…',()=>picker.click());import_button.dataset.colorAction='import';
  const export_button=button('导出 JSON…',async()=>{try{if(invalid.size)throw Error('请先修正标红的无效色值。');const saved=await export_color_file(serialize_color_config(draft),()=>!disposed);if(!disposed)status(saved?'颜色JSON已导出。':'已取消导出。');}catch(error){if(!disposed)report(error);}});export_button.dataset.colorAction='export';
  theme.onchange=()=>{mode=theme.value as color_mode;render();};
  toolbar.append(theme,inherit,import_button,export_button,picker);
  const head=el('thead'),heading=el('tr');heading.append(el('th','','颜色项目'),el('th','','自定义色值 / 透明度'),el('th','','恢复'));head.append(heading);table.append(head,tbody);
  host.append(note,toolbar,table);render();
  return{update(next:workspace_setting_field[]){if(next.map(field=>field.key).join()===fields.map(field=>field.key).join())return;fields=next;render();},dispose(){if(disposed)return;disposed=true;revision++;style.remove();}};
}
