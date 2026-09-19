import {bind_reading_media_entries,type reading_media_entry} from "./reading_media_entry";
import {open_reading_media,close_reading_media} from "./reading_media_viewer";
import {bind_reading_images} from "./reading_image_viewer";
import {bind_markdown_color_menu} from "./markdown_color_menu";
import {acquire_workspace_style,type workspace_style_handle} from "./workspace_styles";
import {git_icon} from "./git_icons";
import { create_workspace_lifetime } from "./workspace_lifetime";
import { get_workspace_files } from "./workspace_files";
import { bind_workspace_editor_status } from "./workspace_editor_status";
import { dispose_workspace_widgets } from "./workspace_widgets";
import type { graph_core } from "./git_graph_host";
import { Registry, INITIAL, parseRawGrammar, type IGrammar, type StateStack } from "vscode-textmate";
import { loadWASM, OnigScanner, OnigString } from "vscode-oniguruma";
import oniguruma_wasm from "vscode-oniguruma/release/onig.wasm";
import c_grammar from "../vendor/vscode_cpp/syntaxes/c.tmLanguage.json";
import cpp_grammar from "../vendor/vscode_cpp/syntaxes/cpp.tmLanguage.json";
import cpp_macro_grammar from "../vendor/vscode_cpp/syntaxes/cpp.embedded.macro.tmLanguage.json";
import platform_grammar from "../vendor/vscode_cpp/syntaxes/platform.tmLanguage.json";
import extension_css from "./typora_enhancements.css";
import scrollbar_css from "./workspace_scrollbars.css";
import { scope_style } from "./textmate_style";
import { bind_reading_navigation } from "./reading_navigation";
import { initialize_workspace } from "./workspace_bootstrap";
import { bind_file_path_actions } from "./file_path_actions";
import { bind_git_graph } from "./git_graph_view";
import { bind_workspace_browser } from "./workspace_browser";
import {bind_workspace_update} from "./workspace_update";
import { bind_reading_minimap } from "./reading_minimap";
import { bind_reading_link_hover } from "./reading_link_hover";

type code_mirror_stream = {
  string: string;
  pos: number;
  sol(): boolean;
  eol(): boolean;
  skipToEnd(): void;
};

type code_mirror_instance = {
  state: Record<string, unknown>;
  getOption(name: string): unknown;
  setOption(name: string, value: unknown): void;
  refresh(): void;
};

type code_mirror_constructor = {
  defineMode(name: string, factory: () => unknown): void;
  modes?: Record<string, () => unknown>;
};

type textmate_state = {
  rule_stack: StateStack;
  pending_rule_stack: StateStack;
  line: string;
  tokens: Array<{ startIndex: number; endIndex: number; scopes: string[] }>;
  token_index: number;
};

declare global {
  interface Window {
    CodeMirror?: code_mirror_constructor;
  }
}

const EXTENSION_STYLE_ID = "linux-note-typora-enhancements-style";
const C_MODE_NAME = "linux-note-vscode-textmate-c";
const CPP_MODE_NAME = "linux-note-vscode-textmate-cpp";
const MINIMUM_COLLAPSED_CODE_HEIGHT = 320;
const MAXIMUM_COLLAPSED_CODE_HEIGHT = 560;
const CODE_COLLAPSE_TOLERANCE = 48;

let c_textmate_grammar: IGrammar | null = null;
let cpp_textmate_grammar: IGrammar | null = null;
let scan_timer = 0;
const mermaid_buttons = new Map<Element, reading_media_entry>();
let mermaid_entries:ReturnType<typeof bind_reading_media_entries>|undefined;
let runtime_active = false;
let runtime_controller: AbortController | undefined;
let runtime_lifetime = create_workspace_lifetime();
let graph_binding: ReturnType<typeof bind_git_graph>;
let reading_binding: ReturnType<typeof bind_reading_navigation>;
let grammar_loading: Promise<void> | undefined;
const original_code_modes = new Map<code_mirror_instance, unknown>();
let runtime_observer: MutationObserver | null = null;
let dispose_reading_action_events: (() => void) | null = null;

let extension_style:workspace_style_handle|undefined;
function ensure_style(): void { extension_style ??= acquire_workspace_style(EXTENSION_STYLE_ID,extension_css); }

function raw_grammar(value: unknown, path: string) {
  return parseRawGrammar(JSON.stringify(value), path);
}

async function load_textmate_grammars(): Promise<void> {
  await loadWASM(oniguruma_wasm.buffer);
  const grammar_sources = new Map([
    ["source.c", raw_grammar(c_grammar, "c.tmLanguage.json")],
    ["source.cpp", raw_grammar(cpp_grammar, "cpp.tmLanguage.json")],
    ["source.cpp.embedded.macro", raw_grammar(cpp_macro_grammar, "cpp.embedded.macro.tmLanguage.json")],
    ["source.c.platform", raw_grammar(platform_grammar, "platform.tmLanguage.json")],
  ]);
  const registry = new Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (sources: string[]) => new OnigScanner(sources),
      createOnigString: (value: string) => new OnigString(value),
    }),
    loadGrammar: async (scope_name: string) => grammar_sources.get(scope_name) ?? null,
  });
  c_textmate_grammar = await registry.loadGrammar("source.c");
  cpp_textmate_grammar = await registry.loadGrammar("source.cpp");
  if (!c_textmate_grammar || !cpp_textmate_grammar) throw new Error("C/C++ TextMate grammar failed to load");
}

function create_textmate_mode(grammar: IGrammar) {
  return {
    startState(): textmate_state {
      return {
        rule_stack: INITIAL,
        pending_rule_stack: INITIAL,
        line: "",
        tokens: [],
        token_index: 0,
      };
    },
    copyState(state: textmate_state): textmate_state {
      return {
        rule_stack: state.rule_stack,
        pending_rule_stack: state.pending_rule_stack,
        line: state.line,
        tokens: state.tokens,
        token_index: state.token_index,
      };
    },
    blankLine(state: textmate_state): void {
      state.rule_stack = grammar.tokenizeLine("", state.rule_stack).ruleStack;
      state.pending_rule_stack = state.rule_stack;
      state.line = "";
      state.tokens = [];
      state.token_index = 0;
    },
    token(stream: code_mirror_stream, state: textmate_state): string {
      if (stream.sol() || state.line !== stream.string) {
        const result = grammar.tokenizeLine(stream.string, state.rule_stack);
        state.line = stream.string;
        state.tokens = result.tokens;
        state.token_index = 0;
        state.pending_rule_stack = result.ruleStack;
      }
      while (state.token_index < state.tokens.length
          && (state.tokens[state.token_index]?.endIndex ?? 0) <= stream.pos) {
        state.token_index += 1;
      }
      const token = state.tokens[state.token_index];
      if (!token) {
        stream.skipToEnd();
        state.rule_stack = state.pending_rule_stack;
        return "tm-plain";
      }
      stream.pos = Math.min(stream.string.length, Math.max(stream.pos + 1, token.endIndex));
      if (stream.eol()) state.rule_stack = state.pending_rule_stack;
      return scope_style(token.scopes);
    },
  };
}

function normalize_language(value: string): "c" | "cpp" | null {
  const language = value.trim().toLowerCase();
  if (["c", "clike", "csrc", "text/x-csrc"].includes(language)) return "c";
  if (["c++", "cpp", "cc", "cxx", "h", "hpp", "h++", "text/x-c++src"].includes(language)) return "cpp";
  return null;
}

function code_mirror_for_fence(fence: Element): code_mirror_instance | null {
  const wrapper = fence.querySelector<HTMLElement>(".CodeMirror");
  const value = wrapper && (wrapper as HTMLElement & { CodeMirror?: code_mirror_instance }).CodeMirror;
  return value ?? null;
}

function apply_textmate_mode(fence: Element): void {
  const language = normalize_language(fence.getAttribute("lang") ?? "");
  if (!language) return;
  const code_mirror = code_mirror_for_fence(fence);
  if (!code_mirror) return;
  const mode = language === "c" ? C_MODE_NAME : CPP_MODE_NAME;
  if (code_mirror.getOption("mode") === mode) return;
  if(!original_code_modes.has(code_mirror))original_code_modes.set(code_mirror,code_mirror.getOption("mode"));
  code_mirror.setOption("mode", mode);
  code_mirror.state.linux_note_textmate_language = language;
  code_mirror.refresh();
}

function collapsed_code_height(): number {
  return Math.round(clamp(window.innerHeight * 0.52, MINIMUM_COLLAPSED_CODE_HEIGHT, MAXIMUM_COLLAPSED_CODE_HEIGHT));
}

function code_fence_is_diagram(fence: Element): boolean {
  const language = (fence.getAttribute("lang") ?? "").trim().toLowerCase();
  return ["flow", "flowchart", "mermaid", "plantuml", "sequence"].includes(language)
    || Boolean(fence.querySelector(".md-diagram-panel-preview"));
}

function remove_code_collapse(fence: HTMLElement): void {
  for (const class_name of ["linux-note-code-collapsible", "is-code-collapsed", "is-code-expanded"]) {
    if (fence.classList.contains(class_name)) fence.classList.remove(class_name);
  }
  fence.style.removeProperty("--linux-note-code-collapsed-height");
  fence.querySelector(":scope > .linux-note-code-toolbar")?.remove();
}

function render_code_toggle(button: HTMLButtonElement, expanded: boolean): void {
  // 无状态变化时保留原节点，避免观察器反复扫描以及按下、松开之间点击目标被替换。
  if (button.getAttribute("aria-expanded") === String(expanded)) return;
  button.setAttribute("aria-expanded", String(expanded));
  button.innerHTML = expanded
    ? '<span aria-hidden="true">↥</span><span>收起代码</span>'
    : '<span aria-hidden="true">↧</span><span>展开全部代码</span>';
  button.title = expanded ? "恢复长代码块的限高显示" : "展示这个代码块的全部内容";
}

function set_code_expanded(fence: HTMLElement, button: HTMLButtonElement, expanded: boolean): void {
  fence.classList.toggle("is-code-expanded", expanded);
  fence.classList.toggle("is-code-collapsed", !expanded);
  render_code_toggle(button, expanded);
  if (!expanded) {
    const scroller = fence.querySelector<HTMLElement>(".CodeMirror-scroll");
    if (scroller) scroller.scrollTop = 0;
  }
  requestAnimationFrame(() => code_mirror_for_fence(fence)?.refresh());
}

function bind_reading_action_events(): () => void {
  // 在正文处理选区前接管按钮事件。委托到 document，代码块重建后也无需重新绑定。
  const handle_event = (event: Event) => {
    const target = event.target;
    const button = target instanceof Element ? target.closest<HTMLButtonElement>(".linux-note-code-toggle") : null;
    const fence = button?.closest<HTMLElement>(".md-fences");

    if (!button || !fence || !button.parentElement?.classList.contains("linux-note-code-toolbar")) return;
    if (event instanceof KeyboardEvent) {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.stopPropagation();
      event.preventDefault();
      if ((event.key === "Enter" && event.type === "keydown" && !event.repeat)
          || (event.key === " " && event.type === "keyup")) button.click();
      return;
    }
    event.stopPropagation();
    // 保持正文光标位置；鼠标仍由 click 切换，按下后移出按钮则不会切换。
    if (event.type === "mousedown" || event.type === "click") event.preventDefault();
    if (event.type === "click") {
      set_code_expanded(fence, button, !fence.classList.contains("is-code-expanded"));
    }
  };
  for (const event_name of ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "dblclick", "keydown", "keypress", "keyup"]) {
    document.addEventListener(event_name, handle_event, true);
  }
  return () => {
    for (const event_name of ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "dblclick", "keydown", "keypress", "keyup"]) {
      document.removeEventListener(event_name, handle_event, true);
    }
  };
}

function ensure_code_collapse(fence_element: Element): void {
  if (!(fence_element instanceof HTMLElement)) return;
  const fence = fence_element;
  const scroller = fence.querySelector<HTMLElement>(".CodeMirror-scroll");
  const sizer = fence.querySelector<HTMLElement>(".CodeMirror-sizer");
  if (!scroller || code_fence_is_diagram(fence)) {
    remove_code_collapse(fence);
    return;
  }

  const maximum_height = collapsed_code_height();
  const content_height = Math.max(scroller.scrollHeight, sizer?.scrollHeight ?? 0, sizer?.offsetHeight ?? 0);
  if (content_height <= maximum_height + CODE_COLLAPSE_TOLERANCE) {
    remove_code_collapse(fence);
    return;
  }

  if (!fence.classList.contains("linux-note-code-collapsible")) {
    fence.classList.add("linux-note-code-collapsible");
  }
  fence.style.setProperty("--linux-note-code-collapsed-height", `${maximum_height}px`);
  let toolbar = fence.querySelector<HTMLElement>(":scope > .linux-note-code-toolbar");
  let button = toolbar?.querySelector<HTMLButtonElement>(".linux-note-code-toggle");
  if (!toolbar || !button) {
    toolbar?.remove();
    toolbar = document.createElement("div");
    toolbar.className = "linux-note-code-toolbar";
    toolbar.contentEditable = "false";
    button = document.createElement("button");
    button.type = "button";
    button.className = "linux-note-code-toggle";
    toolbar.append(button);
    fence.append(toolbar);
  }
  if (!fence.classList.contains("is-code-collapsed") && !fence.classList.contains("is-code-expanded")) {
    set_code_expanded(fence, button, false);
  } else {
    render_code_toggle(button, fence.classList.contains("is-code-expanded"));
  }
}

function schedule_scan(): void {
  if (!runtime_active) return;
  // 分栏布局持续更新时也必须推进扫描，不能被新的 mutation 一直推迟。
  if (scan_timer) return;
  scan_timer = window.setTimeout(() => {
    scan_timer = 0;
    scan_document();
  }, 80);
}

function scan_document(): void {
  if (!runtime_active) return;
  if (!reading_binding && document.documentElement.getAttribute("data-linux-note-workspace") !== "loading") reading_binding=runtime_lifetime.own(bind_reading_navigation());
  document.querySelectorAll(".md-fences[lang]").forEach(apply_textmate_mode);
  document.querySelectorAll(".md-fences").forEach(ensure_code_collapse);
  const diagram_containers = new Set<Element>();
  document.querySelectorAll(".md-diagram-panel-preview").forEach((preview) => {
    diagram_containers.add(mermaid_container_for_preview(preview));
  });
  diagram_containers.forEach(ensure_mermaid_button);
  for (const [container, entry] of mermaid_buttons) {
    if (!container.isConnected) {
      entry.dispose();mermaid_buttons.delete(container);
    } else if (!entry.source.isConnected) {
      entry.dispose();mermaid_buttons.delete(container);
      ensure_mermaid_button(container);
    }
  }
}

function namespace_svg_ids(svg: SVGSVGElement): void {
  const prefix = `linux-note-mermaid-${Date.now().toString(36)}`;
  const replacements = new Map<string, string>();
  svg.querySelectorAll<SVGElement>("[id]").forEach((element) => {
    const old_id = element.id;
    const new_id = `${prefix}-${old_id}`;
    replacements.set(old_id, new_id);
    element.id = new_id;
  });
  svg.querySelectorAll<SVGElement>("*").forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      let value = attribute.value;
      for (const [old_id, new_id] of replacements) {
        value = value.replaceAll(`url(#${old_id})`, `url(#${new_id})`).replaceAll(`#${old_id}`, `#${new_id}`);
      }
      if (value !== attribute.value) element.setAttribute(attribute.name, value);
    }
  });
  svg.querySelectorAll("style").forEach((style) => {
    let value = style.textContent ?? "";
    for (const [old_id, new_id] of replacements) value = value.replaceAll(`#${old_id}`, `#${new_id}`);
    style.textContent = value;
  });
}

function clone_mermaid_svg(preview: Element): SVGSVGElement | null {
  const source = preview.querySelector("svg");
  if (!(source instanceof SVGSVGElement)) return null;
  const svg = source.cloneNode(true) as SVGSVGElement;
  namespace_svg_ids(svg);
  try {
    const bounds = source.getBBox();
    if (!bounds.width || !bounds.height) throw new Error("empty SVG bounds");
    const padding = Math.max(12, Math.min(32, Math.max(bounds.width, bounds.height) * 0.025));
    const width = Math.ceil(bounds.width + padding * 2);
    const height = Math.ceil(bounds.height + padding * 2);
    svg.setAttribute("viewBox", [bounds.x - padding, bounds.y - padding, width, height].join(" "));
    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));
  } catch {
    const view_box = svg.getAttribute("viewBox")?.trim().split(/\s+/u).map(Number);
    if (view_box?.length === 4 && view_box.every(Number.isFinite)) {
      svg.setAttribute("width", String(Math.max(1, Math.ceil(view_box[2] ?? 1))));
      svg.setAttribute("height", String(Math.max(1, Math.ceil(view_box[3] ?? 1))));
    } else {
      const bounds = source.getBoundingClientRect();
      svg.setAttribute("width", String(Math.max(1, Math.ceil(bounds.width))));
      svg.setAttribute("height", String(Math.max(1, Math.ceil(bounds.height))));
    }
  }
  svg.removeAttribute("style");
  svg.style.backgroundColor = "transparent";
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  return svg;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function open_mermaid_viewer(preview: Element): void {
  const svg=clone_mermaid_svg(preview);if(!svg)return;
  open_reading_media({content:svg,source:preview,width:Number(svg.getAttribute("width")),height:Number(svg.getAttribute("height")),label:"Mermaid 图表全屏查看"});
}

function mermaid_container_for_preview(preview: Element): Element {
  return preview.closest(".md-fences") ?? preview.closest(".md-diagram-panel") ?? preview.parentElement ?? preview;
}

function select_mermaid_preview(container: Element): Element | null {
  const previews = Array.from(container.matches(".md-diagram-panel-preview")
    ? [container]
    : container.querySelectorAll(".md-diagram-panel-preview"));
  const with_svg = previews.filter((preview) => preview.querySelector("svg"));
  const candidates = with_svg.length ? with_svg : previews;
  let selected: Element | null = null;
  let selected_area = -1;
  for (const preview of candidates) {
    const style = getComputedStyle(preview);
    const bounds = preview.getBoundingClientRect();
    const visible = style.display !== "none" && style.visibility !== "hidden" && bounds.width > 0 && bounds.height > 0;
    const area = visible ? bounds.width * bounds.height : 0;
    if (area >= selected_area) {
      selected = preview;
      selected_area = area;
    }
  }
  return selected;
}

function ensure_mermaid_button(container: Element): void {
  const preview = select_mermaid_preview(container);
  if (!preview) return;
  const existing=mermaid_buttons.get(container);
  if(existing?.source===preview&&existing.button.isConnected)return;
  existing?.dispose();
  mermaid_entries??=bind_reading_media_entries();
  const entry=mermaid_entries.add({source:preview as HTMLElement,host:preview,label:"全屏查看 Mermaid 图表",button_class:"linux-note-mermaid-open",open:()=>open_mermaid_viewer(preview)});
  mermaid_buttons.set(container,entry);
}

async function initialize(controller: AbortController, lifetime: ReturnType<typeof create_workspace_lifetime>): Promise<void> {
  ensure_style();
  const current=()=>runtime_controller===controller&&!controller.signal.aborted;
  lifetime.add(dispose_workspace_widgets);
  const workspace_ready=initialize_workspace(controller.signal).then(binding=>{lifetime.own(binding);return binding;});
  grammar_loading ||= load_textmate_grammars().catch(error=>{grammar_loading=undefined;throw error;});
  await Promise.all([workspace_ready,grammar_loading]);
  if(!current())return;
  const core=(window as unknown as Record<symbol,graph_core>)[Symbol.for("typora-code:workspace")];
  if(core?.app)lifetime.add(()=>bind_workspace_editor_status(core).dispose());
  reading_binding=lifetime.own(bind_reading_navigation());
  lifetime.own(bind_file_path_actions());
  if(core?.app)lifetime.own(bind_markdown_color_menu(core));
  graph_binding=lifetime.own(bind_git_graph());
  lifetime.own(bind_workspace_browser());
  lifetime.own(bind_workspace_update());
  lifetime.own(bind_reading_minimap());
  lifetime.own(bind_reading_link_hover());
  lifetime.add(()=>{close_reading_media();});
  const images=bind_reading_images(document.body,"content > #write img");
  lifetime.add(()=>images.dispose());
  if (!window.CodeMirror) throw new Error("Typora CodeMirror is unavailable");
  const code_mirror=window.CodeMirror;
  const previous_modes=[C_MODE_NAME,CPP_MODE_NAME].map(name=>code_mirror.modes?.[name]);
  code_mirror.defineMode(C_MODE_NAME, () => create_textmate_mode(c_textmate_grammar!));
  code_mirror.defineMode(CPP_MODE_NAME, () => create_textmate_mode(cpp_textmate_grammar!));
  lifetime.add(()=>{if(code_mirror.modes)for(const [index,name]of [C_MODE_NAME,CPP_MODE_NAME].entries()){const previous=previous_modes[index];if(previous)code_mirror.modes[name]=previous;else delete code_mirror.modes[name];}});
  dispose_reading_action_events = bind_reading_action_events();
  scan_document();
  runtime_observer = new MutationObserver(schedule_scan);
  runtime_observer.observe(document.body, {subtree:true,childList:true,attributes:true,attributeFilter:["class","hidden","lang"]});
  window.addEventListener("resize", schedule_scan, { passive: true });
  document.documentElement.setAttribute("data-linux-note-typora-enhancements", "ready");
}

export function assert_can_deactivate_typora_enhancements(): void {
  get_workspace_files()?.assert_can_dispose();
  graph_binding?.assert_can_dispose();
}

export async function activate_typora_enhancements(): Promise<void> {
  if(runtime_active)return;
  runtime_active=true;
  const controller=runtime_controller=new AbortController();
  const lifetime=runtime_lifetime=create_workspace_lifetime();
  document.documentElement.setAttribute("data-linux-note-typora-enhancements","loading");
  try {
    lifetime.add(acquire_workspace_style("typora-code-style:workspace_scrollbars",scrollbar_css).remove);
    await initialize(controller,lifetime);
  }
  catch(error:unknown){
    if(runtime_controller!==controller||controller.signal.aborted)return;
    deactivate_typora_enhancements();
    document.documentElement.setAttribute("data-linux-note-typora-enhancements","failed");
    throw error;
  }
}

export function deactivate_typora_enhancements(): void {
  assert_can_deactivate_typora_enhancements();
  runtime_active = false;
  runtime_controller?.abort();runtime_controller=undefined;
  if (scan_timer) {
    window.clearTimeout(scan_timer);
    scan_timer = 0;
  }
  runtime_observer?.disconnect();
  runtime_observer = null;
  dispose_reading_action_events?.();
  dispose_reading_action_events = null;
  window.removeEventListener("resize", schedule_scan);
  close_reading_media();
  for(const entry of mermaid_buttons.values())entry.dispose();
  mermaid_entries?.dispose();mermaid_entries=undefined;
  mermaid_buttons.clear();
  document.querySelectorAll<HTMLElement>(".linux-note-code-collapsible").forEach(remove_code_collapse);
  for(const [editor,mode]of original_code_modes){
    try{if([C_MODE_NAME,CPP_MODE_NAME].includes(String(editor.getOption("mode"))))editor.setOption("mode",mode);delete editor.state.linux_note_textmate_language;}catch(error){console.error("[Typora Code restore syntax]",error);}
  }
  original_code_modes.clear();
  runtime_lifetime.dispose();graph_binding=undefined;reading_binding=undefined;
  document.documentElement.removeAttribute("data-linux-note-workspace");
  extension_style?.remove();extension_style=undefined;
  document.documentElement.removeAttribute("data-linux-note-typora-enhancements");
}
