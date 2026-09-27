import {workspace_button,workspace_dialog,workspace_element as el} from './workspace_widgets';
import {acquire_workspace_style} from './workspace_styles';
import {create_workspace_lifetime} from './workspace_lifetime';
import tour_css from './workspace_onboarding.css';

const steps = [
 {title:'欢迎使用 Typora Code',target:'',text:'用几分钟认识功能栏。正文仍由 Typora 编辑；新增的文件、搜索、Git 和终端入口就在周围。可随时跳过，以后从“帮助 → 操作指导”重看。'},
 {title:'顶栏：原生菜单与文件导航',target:'.workspace-titlebar-left',text:'文件、编辑、段落、格式等菜单保留 Typora 编辑操作。中间搜索框用 Ctrl+P 查找工程文件；Alt+← / → 返回或前进到阅读位置。'},
 {title:'活动栏与资源管理器',target:'.typ-ribbon',text:'左侧图标切换资源管理器、搜索、大纲、Git 等工具。Alt+B 显示或隐藏侧栏；Ctrl+B 仍是 Typora 原生加粗。文件或目录右键的“vscode打开工程”会打开所属工程并定位目标。'},
 {title:'预览标签与常驻标签',target:'.typ-workspace-tab-header',text:'单击资源管理器文件会替换当前未编辑的预览标签。Alt+左键让文件保持打开；开始编辑也会自动常驻。标签右键可分屏，多文档对照时不会替换常驻标签。',demo:'tabs'},
 {title:'正文、代码块与内容缩放',target:'content, .typ-workspace',text:'照常编辑 Markdown。代码块有复制入口，长代码可展开，Mermaid 可独立查看。编辑区 Ctrl+滚轮只缩放内容；Ctrl+- / = 缩放界面，当前正文与终端保持视觉字号。新文档继承本窗口内容字号，重启恢复保存的基础配置。',demo:'zoom'},
 {title:'搜索：先预览，再打开',target:'[data-id="core.search"], .typ-ribbon',text:'Ctrl+Shift+F 搜索工作区。单击结果在侧栏预览，双击打开文件；筛选包含/排除范围可缩小搜索。预览里的链接浏览有自己的后退/前进记录。'},
 {title:'Git：看清改动与来源',target:'[data-id="linux_note:source_control"], .typ-ribbon',text:'源码管理显示工作区、暂存区及提交图。选择变更文件查看差异，Markdown 可切换源码/渲染比较；差异编辑器的定位图标会回到对应提交与文件。提交、暂存和同步都由你主动执行。'},
 {title:'终端：工程内运行命令',target:'.workspace-titlebar-menu',text:'从“终端 → 新建终端”打开底部面板（Alt+Shift+`）。可新增、切换、拆分终端，按当前工程运行命令。终端输入有自己的焦点与字号；教程不会替你运行命令。'},
 {title:'设置、主题与快捷键',target:'.workspace-preferences-trigger, .typ-ribbon',text:'左下齿轮或 Ctrl+, 打开统一设置。主题菜单支持明暗主题及自定义颜色，可即时预览、恢复默认、导入/导出 JSON。工作台占用原生编辑键的冲突入口已迁到 Alt；完整键表见操作说明。'},
 {title:'准备好了，随时回来查看',target:'.workspace-titlebar-menu',text:'“帮助 → 操作指导”可重看本教程；“操作说明与快捷键”打开随安装包提供的 user_guide.md，离线也能查阅。每次成功安装后的下一次启动会再提示一次，普通重启不重复。'}
];

/** 只指认区域，不激活面板或修改文档；全部资源随共同对话框退出。 */
export function show_workspace_onboarding(open_guide:()=>void,on_close:()=>void=()=>{}) {
 const lifetime=create_workspace_lifetime();
 const style=acquire_workspace_style('typora-code-style:workspace_onboarding',tour_css);lifetime.add(style.remove);
 const dialog=workspace_dialog('操作指导','跳过教程',()=>{lifetime.dispose();on_close();});
 dialog.root.classList.add('workspace-onboarding');
 const panel=dialog.root.querySelector<HTMLElement>('.git-graph-dialog')!;
 const highlight=el('div','workspace-onboarding-highlight');highlight.setAttribute('aria-hidden','true');dialog.root.prepend(highlight);
 const title=el('h4'),description=el('p'),hint=el('p','workspace-onboarding-hint'),demo=el('div','workspace-onboarding-demo');
 const progress=el('span','workspace-onboarding-progress');progress.setAttribute('role','status');progress.setAttribute('aria-live','polite');
 const previous=workspace_button('上一步',()=>render(index-1));
 const next=workspace_button('下一步',()=>index===steps.length-1?dialog.close():render(index+1),'workspace-onboarding-next');
 next.dataset.workspaceInteraction='primary';
 const skip=workspace_button('跳过',()=>dialog.close());
 const guide=workspace_button('操作说明与快捷键',()=>{dialog.close();open_guide();});
 dialog.content.replaceChildren(title,description,hint,demo,guide);
 const actions=el('div','workspace-onboarding-actions');actions.append(previous,next);
 dialog.footer.replaceChildren(progress,skip,actions);
 let index=0,frame=0,target:HTMLElement|undefined;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let paused=reduced.matches;
 const position=()=>{
  frame=0;if(lifetime.disposed)return;
  const selector=steps[index].target;
  const found=selector?selector.split(',').flatMap(part=>[...document.querySelectorAll<HTMLElement>(part.trim())]).find(node=>{const r=node.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.right>0&&r.left<innerWidth&&r.top<innerHeight&&getComputedStyle(node).visibility!=='hidden';}):undefined;
  if(found!==target){if(target)observer.unobserve(target);target=found;if(target)observer.observe(target);}
  const r=target?.getBoundingClientRect();
  highlight.hidden=!r;hint.hidden=!selector||Boolean(r);
  hint.textContent='该区域当前未显示；退出教程后可从顶栏或左侧活动栏进入。';
  const margin=16,rect=panel.getBoundingClientRect();let x=(innerWidth-rect.width)/2,y=(innerHeight-rect.height)/2;
  if(r){
   const left=Math.max(2,r.left),top=Math.max(2,r.top),right=Math.min(innerWidth-2,r.right),bottom=Math.min(innerHeight-2,r.bottom);
   Object.assign(highlight.style,{left:left+'px',top:top+'px',width:Math.max(0,right-left)+'px',height:Math.max(0,bottom-top)+'px'});
   if(right+margin+rect.width<=innerWidth-margin){x=right+margin;y=top;}
   else if(left-margin-rect.width>=margin){x=left-margin-rect.width;y=top;}
   else if(bottom+margin+rect.height<=innerHeight-margin){x=left;y=bottom+margin;}
   else if(top-margin-rect.height>=margin){x=left;y=top-margin-rect.height;}
  }
  panel.style.left=Math.max(margin,Math.min(x,innerWidth-rect.width-margin))+'px';
  panel.style.top=Math.max(margin,Math.min(y,innerHeight-rect.height-margin))+'px';
 };
 const schedule=()=>{if(!frame&&!lifetime.disposed)frame=requestAnimationFrame(position);};
 const observer=new ResizeObserver(schedule);observer.observe(panel);
 lifetime.add(()=>{observer.disconnect();cancelAnimationFrame(frame);});
 lifetime.listen(window,'resize',schedule);lifetime.listen(window,'scroll',schedule,true);
 const render_demo=()=>{
  demo.replaceChildren();const kind=steps[index].demo;demo.hidden=!kind;if(!kind)return;
  demo.dataset.demo=kind;demo.dataset.paused=String(paused);
  const label=el('span','','操作示意（不会打开真实文件）');
  const first=el('div','workspace-onboarding-phase workspace-onboarding-phase-first',kind==='tabs'?'单击 A → [预览 A]':'Ctrl+滚轮 → 内容字号变大');
  const second=el('div','workspace-onboarding-phase workspace-onboarding-phase-second',kind==='tabs'?'单击 B → [预览 B]；Alt+单击 A → [预览 B] [常驻 A]':'工具栏保持原大小，阅读位置保留');
  const toggle=workspace_button(paused?'播放示意':'暂停示意',()=>{paused=!paused;render_demo();schedule();});toggle.setAttribute('aria-pressed',String(!paused));
  if(reduced.matches){toggle.textContent='系统已减少动画';toggle.disabled=true;}
  demo.append(label,first,second,toggle);
 };
 const motion_changed=()=>{paused=reduced.matches;render_demo();schedule();};
 lifetime.listen(reduced,'change',motion_changed);
 function render(next_index:number){
  index=Math.max(0,Math.min(steps.length-1,next_index));dialog.root.dataset.step=String(index);
  title.textContent=steps[index].title;description.textContent=steps[index].text;progress.textContent=`${index+1} / ${steps.length}`;
  previous.disabled=index===0;next.textContent=index===steps.length-1?'完成':'下一步';render_demo();schedule();
 }
 render(0);
 const focus_timer=window.setTimeout(()=>{if(!lifetime.disposed)next.focus({preventScroll:true});},0);
 lifetime.add(()=>clearTimeout(focus_timer));
 return {close:dialog.close};
}
