import titlebar_css from "./workspace_titlebar.css";

type titlebar_runtime = {
  File?: {isNode?: boolean; isMac?: boolean; option?: {framelessWindow?: boolean}};
  JSBridge?: {invoke(name: string, ...args: unknown[]): unknown};
  reqnode?(name: string): any;
};

/** 采用 Typora 的 Unibody 窗口，并复用原生菜单、标题更新和窗口按钮。 */
export function install_workspace_titlebar() {
  const runtime=window as unknown as titlebar_runtime;
  const bar=document.querySelector<HTMLElement>("#top-titlebar");
  if(!bar||!runtime.File?.isNode||runtime.File.isMac||bar.dataset.workspaceTitlebar)return;
  const platform=runtime.reqnode?.("process").platform;
  if(platform&&!['win32','linux'].includes(platform))return;
  bar.dataset.workspaceTitlebar="ready";
  const style=document.createElement("style");style.dataset.workspaceTitlebarStyle="true";style.textContent=titlebar_css;document.head.append(style);
  // 原生首选项也使用此 IPC；窗口边框在创建时确定，不强制关闭带草稿的既有窗口。
  if(!runtime.File.option?.framelessWindow&&runtime.reqnode){
    void runtime.reqnode("electron").ipcRenderer.invoke("setting.put","framelessWindow",true).then(()=>{
      document.documentElement.dataset.linuxNoteTitlebar="next-window";
    }).catch(()=>{document.documentElement.dataset.linuxNoteTitlebar="setting-failed";});
  }else document.documentElement.dataset.linuxNoteTitlebar="ready";
  const icon=document.createElement("img");icon.className="workspace-titlebar-icon";
  icon.src=new URL("./assets/icon/icon_32x32@2x.png",document.baseURI).href;icon.alt="Typora";icon.draggable=false;
  const menu=document.createElement("nav");menu.className="workspace-titlebar-menu";menu.setAttribute("aria-label","主菜单");menu.setAttribute("role","menubar");
  const entries=[["文件","F"],["编辑","E"],["段落","P"],["格式","O"],["视图","V"],["主题","T"],["帮助","H"]];
  entries.forEach(([label,key],index)=>{
    const button=document.createElement("button");button.type="button";button.textContent=label;
    button.title=`${label}（Alt+${key}）`;button.setAttribute("role","menuitem");button.setAttribute("aria-haspopup","menu");
    const open=()=>{const rect=button.getBoundingClientRect();runtime.JSBridge?.invoke("menu.popup",{x:Math.round(rect.left),y:Math.round(rect.bottom),positioningItem:index});};
    button.onclick=open;
    button.onkeydown=event=>{if(event.key==="ArrowDown"){event.preventDefault();open();}else if(["ArrowLeft","ArrowRight","Home","End"].includes(event.key)){
      event.preventDefault();const position=event.key==="Home"?0:event.key==="End"?entries.length-1:(index+(event.key==="ArrowLeft"?-1:1)+entries.length)%entries.length;
      (menu.children[position] as HTMLButtonElement).focus();
    }};
    menu.append(button);
  });
  bar.prepend(icon,menu);
  const title=document.querySelector<HTMLElement>("#title-text");
  if(title){const refresh=()=>{title.title=title.textContent||document.title;};refresh();new MutationObserver(refresh).observe(title,{childList:true,characterData:true,subtree:true});}
}
