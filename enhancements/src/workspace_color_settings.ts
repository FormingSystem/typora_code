import {get_workspace_app} from './workspace_bootstrap';
import {WORKSPACE_COLOR_ROLES} from './workspace_color_catalog';

export type color_mode='light'|'dark';
export type workspace_color_config={schema:1;themes:Record<color_mode,Record<string,string>>};
const listeners=new Set<()=>void>();
const known_keys=new Set(WORKSPACE_COLOR_ROLES.map(role=>role.key));
export const empty_color_config=():workspace_color_config=>({schema:1,themes:{light:{},dark:{}}});
export function normalize_custom_color(value:unknown):string{
  if(typeof value!=='string')throw Error('颜色必须为十六进制文本。');
  const color=value.trim();if(!color)return '';
  if(!/^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/iu.test(color))throw Error('请输入 #RGB、#RGBA、#RRGGBB 或 #RRGGBBAA；留空继承主题。');
  return (color.length<6?'#'+[...color.slice(1)].map(part=>part+part).join(''):color).toUpperCase();
}
function object(value:unknown):value is Record<string,unknown>{return Boolean(value)&&typeof value==='object'&&!Array.isArray(value);}
export function validate_color_config(value:unknown):workspace_color_config{
  if(!object(value)||value.schema!==1||Object.keys(value).some(key=>!['schema','themes'].includes(key))||!object(value.themes))throw Error('不是支持的颜色配置：需要schema:1和themes对象。');
  if(Object.keys(value.themes).some(key=>key!=='light'&&key!=='dark'))throw Error('颜色配置包含未知主题。');
  const result=empty_color_config();
  for(const mode of ['light','dark'] as const){
    const colors=value.themes[mode];if(!object(colors))throw Error('颜色配置缺少 '+mode+' 对象。');
    for(const [key,color] of Object.entries(colors)){
      if(!known_keys.has(key))throw Error('未知颜色项目：'+key);
      const normalized=normalize_custom_color(color);if(normalized)result.themes[mode][key]=normalized;
    }
  }
  return result;
}
export function parse_color_config(text:string){return validate_color_config(JSON.parse(text.replace(/^\uFEFF/u,'')));}
export function serialize_color_config(config:workspace_color_config){return JSON.stringify(validate_color_config(config),null,2)+'\n';}
export function read_color_config():workspace_color_config{
  const raw=get_workspace_app()?.settings.get('workspace_colors');return raw===undefined?empty_color_config():validate_color_config(raw);
}
export function observe_color_config(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
/** 沿共享设置事务先落盘再发布；失败保留当前颜色，同值不重复写盘。 */
export function save_color_config(value:workspace_color_config){
  const next=validate_color_config(value),settings=get_workspace_app()?.settings;
  if(!settings)throw Error('用户设置尚未就绪。');
  if(serialize_color_config(next)===serialize_color_config(read_color_config()))return;
  settings.set_and_save('workspace_colors',next);
  for(const listener of listeners)listener();
}
export function color_config_css(config:workspace_color_config){
  const css:string[]=[];
  for(const mode of ['light','dark'] as const){
    const prefix=`:root[data-workspace-colors=${mode}]`,variables:string[]=[];
    for(const role of WORKSPACE_COLOR_ROLES){
      const value=config.themes[mode][role.key];if(!value)continue;
      if(role.variable)variables.push(`${role.variable}:${value}!important`);
      if(role.selector)css.push(`${prefix} :is(${role.selector}){${role.property||'color'}:${value}!important}`);
    }
    css.unshift(`${prefix}{${variables.join(';')}}`);
    for(const [key,property] of [['markdown_selection_background','background-color'],['markdown_selection_foreground','color']]){
      const value=config.themes[mode][key];if(value)css.push(`${prefix} #write::selection,${prefix} #write *::selection{${property}:${value}!important}`);
    }
  }
  return css.join('\n');
}
