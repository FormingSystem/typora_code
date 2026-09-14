import {Terminal} from "@xterm/xterm";
import {FitAddon} from "@xterm/addon-fit";
import {SearchAddon} from "@xterm/addon-search";
import {git_icon_button} from "./git_icons";
import {workspace_element as el,workspace_button as button,workspace_dialog} from "./workspace_widgets";
import {create_workspace_lifetime} from "./workspace_lifetime";
import {terminal_theme} from "./terminal_theme";
import {bind_terminal_composition} from "./terminal_composition";
import type {terminal_settings} from "./terminal_settings";

/** 同一会话始终复用同一终端屏幕；移动容器不重建缓冲或 PTY。 */
export class terminal_surface {
  readonly container=el("section","linux-note-terminal");readonly viewport=el("div","linux-note-terminal-viewport");
  readonly status=el("div","linux-note-terminal-status");readonly term:Terminal;readonly fit=new FitAddon();readonly search=new SearchAddon();
  private lifetime=create_workspace_lifetime();private frame=0;private settings:terminal_settings;private find_bar=el("div","terminal-find");
  private opened=false;
  constructor(settings:terminal_settings,private actions:{input(data:string):void;resize(cols:number,rows:number):void;copy(text:string):Promise<unknown>;active():void;error(error:unknown):void}){
    this.settings=settings;this.term=new Terminal({allowProposedApi:false,theme:terminal_theme()});this.apply_settings(settings);
    this.term.loadAddon(this.fit);this.term.loadAddon(this.search);
    this.status.setAttribute("role","status");this.status.hidden=true;this.container.append(this.viewport,this.status,this.find_bar);
    this.find_bar.hidden=true;this.find_bar.setAttribute("role","search");
    const input=el("input"),count=el("span","terminal-find-count");input.placeholder="查找";input.setAttribute("aria-label","查找终端输出");
    const options={caseSensitive:false,wholeWord:false,regex:false};
    const find=(back=false)=>{try{const found=input.value&&(back?this.search.findPrevious(input.value,options):this.search.findNext(input.value,options));count.textContent=found?"":"无结果";}catch{count.textContent="表达式无效";}};
    const toggles=([ ["case-sensitive","区分大小写","caseSensitive"],["whole-word","全字匹配","wholeWord"],["regex","正则表达式","regex"] ]as const).map(([icon,title,key])=>{
      const control=git_icon_button(icon,title,()=>{options[key]=!options[key];control.setAttribute("aria-pressed",String(options[key]));find();});control.setAttribute("aria-pressed","false");return control;
    });
    this.find_bar.append(input,...toggles,count,git_icon_button("arrow-up","上一个匹配",()=>find(true)),git_icon_button("arrow-down","下一个匹配",()=>find()),git_icon_button("close","关闭查找",()=>{this.find_bar.hidden=true;this.search.clearDecorations();this.term.focus();}));
    input.oninput=()=>find();input.onkeydown=event=>{event.stopPropagation();if(event.isComposing||event.keyCode===229)return;if(event.key==="Enter"){event.preventDefault();find(event.shiftKey);}if(event.key==="Escape"){this.find_bar.hidden=true;this.term.focus();}};
    this.lifetime.own(this.term.onData(data=>actions.input(data)));
    this.lifetime.own(this.term.onSelectionChange(()=>{if(this.settings.copy_on_selection&&this.term.hasSelection())void actions.copy(this.term.getSelection()).catch(actions.error);}));
    this.term.attachCustomKeyEventHandler(event=>{
      // 候选选择与中英切换交给输入法及 xterm，不能因快捷键移走输入焦点。
      if(event.isComposing||event.keyCode===229)return true;
      const key=event.key.toLowerCase(),control=event.ctrlKey||event.metaKey;
      if(control&&(event.shiftKey&&["c","v","f"].includes(key)||key==="c"&&this.term.hasSelection())){
        if(event.type==="keydown"){event.preventDefault();if(key==="c")void actions.copy(this.term.getSelection()).catch(actions.error);else if(key==="v")void this.paste();else this.find();}return false;
      }
      return true;
    });
    this.container.onpointerdown=()=>actions.active();
    // xterm 先处理目标事件；包括 Shift 抬起在内的完整输入链不冒泡到宿主编辑器。
    // 仅停止冒泡，保留浏览器默认输入与 xterm 的组合上屏、按键状态清理。
    for(const type of ["keydown","keypress","keyup","beforeinput","input","compositionstart","compositionupdate","compositionend"]){
      this.lifetime.listen(this.container,type,event=>event.stopPropagation());
    }
    // Ctrl+V、系统粘贴和菜单粘贴经过同一策略，不能绕过多行确认设置。
    this.viewport.addEventListener("paste",event=>{event.preventDefault();event.stopImmediatePropagation();if(event.clipboardData)this.paste_text(event.clipboardData.getData("text/plain"));},true);
    const observer=new ResizeObserver(()=>this.resize());observer.observe(this.viewport);this.lifetime.add(()=>observer.disconnect());
    this.lifetime.add(()=>{cancelAnimationFrame(this.frame);this.term.dispose();this.container.remove();});
  }
  mount(){if(this.lifetime.disposed)return;if(!this.opened){this.opened=true;this.term.open(this.viewport);if(this.term.textarea)this.lifetime.own(bind_terminal_composition(this.term.textarea));}this.resize();}
  apply_settings(settings:terminal_settings){this.settings=settings;this.term.options={fontFamily:settings.font_family,fontSize:settings.font_size,fontWeight:settings.font_weight,lineHeight:settings.line_height,letterSpacing:settings.letter_spacing,cursorStyle:settings.cursor_style,cursorBlink:settings.cursor_blink,cursorWidth:settings.cursor_width,scrollback:settings.scrollback,smoothScrollDuration:settings.smooth_scrolling?100:0,scrollSensitivity:settings.scroll_sensitivity,fastScrollSensitivity:settings.fast_scroll_sensitivity,minimumContrastRatio:settings.minimum_contrast,tabStopWidth:settings.tab_stop_width};this.resize();}
  resize(){if(this.frame||this.lifetime.disposed)return;this.frame=requestAnimationFrame(()=>{this.frame=0;if(!this.opened||!this.viewport.clientWidth||!this.viewport.clientHeight)return;try{this.fit.fit();this.actions.resize(this.term.cols,this.term.rows);}catch{/* 初次布局等待可用尺寸。 */}});}
  focus(){if(!this.lifetime.disposed)this.term.focus();}
  find(){this.find_bar.hidden=false;this.find_bar.querySelector("input")?.focus();}
  private paste_text(text:string){
    if(this.lifetime.disposed)return;
      if(this.settings.confirm_multiline&&/[\r\n]/u.test(text)){
        const dialog=workspace_dialog("粘贴多行命令");this.lifetime.add(dialog.close);dialog.content.append(el("pre","",text));
        dialog.footer.prepend(button("粘贴到终端",()=>{if(this.lifetime.disposed)return;this.term.paste(text);dialog.close();this.focus();}));
      }else{this.term.paste(text);this.focus();}
  }
  async paste(){
    try{this.paste_text(await navigator.clipboard.readText());}
    catch(error){if(!this.lifetime.disposed)this.actions.error(error);}
  }
  set_status(state:string,message:string){this.container.dataset.state=state;this.status.textContent=message;this.status.hidden=!message;}
  dispose(){this.lifetime.dispose();}
}
