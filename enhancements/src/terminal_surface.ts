import {workspace_text} from "./workspace_i18n";
import {content_font_size,observe_content_zoom,change_content_font} from './workspace_content_zoom';
import {create_workspace_progress_view} from "./workspace_progress_view";
import {is_composing_key} from "./workspace_keyboard";
import type {Terminal,IWindowsPty,IMarker} from "@xterm/xterm";
import {wheel_zoom_direction} from "./workspace_wheel_zoom";
import {Terminal as terminal_constructor} from "../vendor/xterm/xterm.mjs";
import {FitAddon} from "@xterm/addon-fit";
import {SearchAddon} from "@xterm/addon-search";
import {git_icon_button} from "./git_icons";
import {workspace_element as el,workspace_button as button,workspace_dialog} from "./workspace_widgets";
import {create_workspace_lifetime} from "./workspace_lifetime";
import {terminal_theme} from "./terminal_theme";
import {bind_terminal_composition} from "./terminal_composition";
import type {terminal_settings} from "./terminal_settings";

/** The same session always reuses the same terminal screen; moving containers do not rebuild buffers or PTY. */
export class terminal_surface {
  readonly container=el("section","linux-note-terminal");readonly viewport=el("div","linux-note-terminal-viewport");
  readonly status=el("div","linux-note-terminal-status");readonly term:Terminal;readonly fit=new FitAddon();readonly search=new SearchAddon();
  private lifetime=create_workspace_lifetime();private frame=0;private settings:terminal_settings;private find_bar=el("div","terminal-find");
  private opened=false;private progress=create_workspace_progress_view();private sent_cols=0;private sent_rows=0;
  private font_frame=0;private font_direction=0;private restore_frame=0;
  private resize_anchor:{marker?:IMarker;bottom:boolean;cell_offset:number}|undefined;
  constructor(settings:terminal_settings,private actions:{input(data:string):void;resize(cols:number,rows:number):void;copy(text:string):Promise<unknown>;active():void;error(error:unknown):void},windows_pty?:IWindowsPty){
    this.settings=settings;this.term=new terminal_constructor({allowProposedApi:false,theme:terminal_theme(),windowsPty:windows_pty});this.apply_settings(settings);this.lifetime.add(observe_content_zoom(()=>{if(content_font_size(this.settings.font_size,"terminal")===this.term.options.fontSize){this.clear_font_anchor();return;}this.apply_settings(this.settings);},()=>this.remember_font_anchor()));
    // Respond to ConPTY's DA1 handshake in the same way as VS's Code, to avoid the new backend waiting for capability response.
    if(windows_pty?.backend==="conpty")this.lifetime.own(this.term.parser.registerCsiHandler({final:"c"},params=>{if(!params.length||params.length===1&&params[0]===0){actions.input("\x1b[?61;4c");return true;}return false;}));
    this.term.loadAddon(this.fit);this.term.loadAddon(this.search);
    this.status.setAttribute("role","status");this.status.hidden=true;this.container.append(this.progress.root,this.viewport,this.status,this.find_bar);this.lifetime.add(()=>this.progress.dispose());
    this.find_bar.hidden=true;this.find_bar.setAttribute("role","search");
    const input=el("input"),count=el("span","terminal-find-count");input.placeholder=workspace_text("terminal_surface_find");input.setAttribute("aria-label",workspace_text("terminal_surface_find_terminal_output"));
    const options={caseSensitive:false,wholeWord:false,regex:false};
    const find=(back=false)=>{try{const found=input.value&&(back?this.search.findPrevious(input.value,options):this.search.findNext(input.value,options));count.textContent=found?"":workspace_text("terminal_surface_no_results");}catch{count.textContent=workspace_text("terminal_surface_invalid_expression");}};
    const toggles=([ ["case-sensitive",workspace_text("terminal_surface_case_sensitive"),"caseSensitive"],["whole-word",workspace_text("terminal_surface_whole_word_match"),"wholeWord"],["regex",workspace_text("terminal_surface_regular_expression"),"regex"] ]as const).map(([icon,title,key])=>{
      const control=git_icon_button(icon,title,()=>{options[key]=!options[key];control.setAttribute("aria-pressed",String(options[key]));find();});control.setAttribute("aria-pressed","false");return control;
    });
    this.find_bar.append(input,...toggles,count,git_icon_button("arrow-up",workspace_text("terminal_surface_previous_match"),()=>find(true)),git_icon_button("arrow-down",workspace_text("terminal_surface_next_match"),()=>find()),git_icon_button("close",workspace_text("terminal_surface_close_find"),()=>{this.find_bar.hidden=true;this.search.clearDecorations();this.term.focus();}));
    input.oninput=()=>find();input.onkeydown=event=>{event.stopPropagation();if(is_composing_key(event))return;if(event.key==="Enter"){event.preventDefault();find(event.shiftKey);}if(event.key==="Escape"){this.find_bar.hidden=true;this.term.focus();}};
    this.lifetime.own(this.term.onData(data=>actions.input(data)));
    this.lifetime.own(this.term.onSelectionChange(()=>{if(this.settings.copy_on_selection&&this.term.hasSelection())void actions.copy(this.term.getSelection()).catch(actions.error);}));
    this.term.attachCustomKeyEventHandler(event=>{
      // Candidate selection and Chinese/English switch are handed over to the input method and xterm, and cannot be moved away from the input focus due to shortcut keys.
      if(is_composing_key(event))return true;
      const key=event.key.toLowerCase(),control=event.ctrlKey||event.metaKey;
      const paste_key=key==='v'&&!event.altKey&&(control&&event.shiftKey||event.metaKey&&!event.ctrlKey||event.ctrlKey&&!event.metaKey&&/^Win/iu.test(navigator.platform));
      if(paste_key){if(event.type==='keydown'){event.preventDefault();void this.paste();}return false;}
      if(control&&(event.shiftKey&&["c","f"].includes(key)||key==="c"&&this.term.hasSelection())){
        if(event.type==="keydown"){event.preventDefault();if(key==="c")void actions.copy(this.term.getSelection()).catch(actions.error);else this.find();}return false;
      }
      return true;
    });
    this.container.onpointerdown=()=>{this.clear_font_anchor();actions.active();};
    this.lifetime.listen(this.viewport,"wheel",raw=>{
      const event=raw as WheelEvent,direction=wheel_zoom_direction(event);
      if(!direction){this.clear_font_anchor();return;}
      if(event.defaultPrevented)return;
      event.preventDefault();event.stopImmediatePropagation();this.font_direction=direction;
      if(this.font_frame)return;
      this.font_frame=requestAnimationFrame(()=>{
        this.font_frame=0;if(this.lifetime.disposed)return;
        change_content_font("terminal",this.font_direction,this.settings.font_size);
      });
    },{capture:true,passive:false});
    // xterm Process the target event; including Shift lift-in, the complete input chain does not bubble to the host editor.
    // Only stop bubbling, retain the browser's default input and combination on-screen, and key state cleanup for xterm.
    for(const type of ["keydown","keypress","keyup","beforeinput","input","compositionstart","compositionupdate","compositionend"]){
      this.lifetime.listen(this.container,type,event=>event.stopPropagation());
    }
    // Ctrl+V , system paste and menu paste go through the same strategy, and cannot bypass the multi-line confirmation setting.
    this.viewport.addEventListener("paste",event=>{event.preventDefault();event.stopImmediatePropagation();if(event.clipboardData)this.paste_text(event.clipboardData.getData("text/plain"));},true);
    const observer=new ResizeObserver(()=>this.resize());observer.observe(this.viewport);this.lifetime.add(()=>observer.disconnect());
    this.lifetime.add(()=>{cancelAnimationFrame(this.frame);cancelAnimationFrame(this.font_frame);this.clear_font_anchor();this.term.dispose();this.container.remove();});
  }
  mount(){if(this.lifetime.disposed)return;if(!this.opened){this.opened=true;this.term.open(this.viewport);if(this.term.textarea)this.lifetime.own(bind_terminal_composition(this.term.textarea));}this.resize();}
  apply_settings(settings:terminal_settings){
    const font_size=content_font_size(settings.font_size,'terminal');
    if(this.opened&&!this.resize_anchor&&(font_size!==this.term.options.fontSize||['font_family','font_size','font_weight','line_height','letter_spacing'].some(key=>(settings as any)[key]!==(this.settings as any)[key]))){
      this.remember_font_anchor();
    }
    this.settings=settings;this.term.options={fontFamily:settings.font_family,fontSize:font_size,fontWeight:settings.font_weight,lineHeight:settings.line_height,letterSpacing:settings.letter_spacing,cursorStyle:settings.cursor_style,cursorBlink:settings.cursor_blink,cursorWidth:settings.cursor_width,scrollback:settings.scrollback,smoothScrollDuration:settings.smooth_scrolling?100:0,scrollSensitivity:settings.scroll_sensitivity,fastScrollSensitivity:settings.fast_scroll_sensitivity,minimumContrastRatio:settings.minimum_contrast,tabStopWidth:settings.tab_stop_width};this.resize();
  }
  private remember_font_anchor(){
    if(!this.opened||this.resize_anchor)return;
    const buffer=this.term.buffer.active;if(buffer.type!=='normal')return;
    let start=buffer.viewportY;while(start>0&&buffer.getLine(start)?.isWrapped)start--;
    this.resize_anchor={bottom:buffer.viewportY===buffer.baseY,marker:this.term.registerMarker(start-buffer.baseY-buffer.cursorY),cell_offset:(buffer.viewportY-start)*this.term.cols};
  }
  resize(){if(this.frame||this.lifetime.disposed)return;this.frame=requestAnimationFrame(()=>{this.frame=0;if(!this.opened||!this.viewport.clientWidth||!this.viewport.clientHeight)return;try{
    this.fit.fit();
    cancelAnimationFrame(this.restore_frame);
    // xterm synchronizes character grid with scroll pixels on the next draw, and then locates according to the logical anchor point.
    if(this.resize_anchor)this.restore_frame=requestAnimationFrame(()=>this.restore_font_anchor());
    const {cols,rows}=this.term;if(cols!==this.sent_cols||rows!==this.sent_rows){this.sent_cols=cols;this.sent_rows=rows;this.actions.resize(cols,rows);}
  }catch{/* Initial layout waits for available dimensions. */}});}
  private clear_font_anchor(){cancelAnimationFrame(this.restore_frame);this.restore_frame=0;this.resize_anchor?.marker?.dispose();this.resize_anchor=undefined;}
  private restore_font_anchor(){
    this.restore_frame=0;const anchor=this.resize_anchor;this.resize_anchor=undefined;
    if(!anchor)return;
    const smooth=this.term.options.smoothScrollDuration;this.term.options.smoothScrollDuration=0;
    try{
      if(this.term.buffer.active.type!=='normal')return;
      if(anchor.bottom){this.term.scrollToBottom();return;}
      if(!anchor.marker||anchor.marker.isDisposed)return;
      let line=anchor.marker.line;const limit=line+Math.floor(anchor.cell_offset/this.term.cols);
      while(line<limit&&this.term.buffer.active.getLine(line+1)?.isWrapped)line++;
      // Public scrollToLine scrolls relatively with current pixel offset; first synchronize the absolute bottom of the new font size.
      // Re-locate the anchor point within the same frame, avoid the pixel offset of the old character height participating in the calculation.
      this.term.scrollToBottom();this.term.scrollToLine(line);
    }finally{this.term.options.smoothScrollDuration=smooth;anchor.marker?.dispose();}
  }
  focus(){if(!this.lifetime.disposed)this.term.focus();}
  find(){this.find_bar.hidden=false;this.find_bar.querySelector("input")?.focus();}
  private paste_text(text:string){
    if(this.lifetime.disposed)return;
      if(this.settings.confirm_multiline&&/[\r\n]/u.test(text)){
        const dialog=workspace_dialog(workspace_text("terminal_surface_paste_multi_line_command"));this.lifetime.add(dialog.close);dialog.content.append(el("pre","",text));
        dialog.footer.prepend(button(workspace_text("terminal_surface_paste_to_terminal"),()=>{if(this.lifetime.disposed)return;this.term.paste(text);dialog.close();this.focus();}));
      }else{this.term.paste(text);this.focus();}
  }
  async paste(){
    try{
      // Desktop commands use the host clipboard; browser fixtures retain the web port.
      const clipboard=(window as any).reqnode?.('electron')?.clipboard;
      this.paste_text(clipboard?clipboard.readText():await navigator.clipboard.readText());
    }
    catch(error){if(!this.lifetime.disposed)this.actions.error(error);}
  }
  set_status(state:string,message:string,busy=state==="starting"){this.container.dataset.state=state;this.container.setAttribute("aria-busy",String(busy));this.status.textContent=message;this.status.hidden=!message;if(busy)this.progress.update(message);else this.progress.hide();}
  dispose(){this.lifetime.dispose();}
}
