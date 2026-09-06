import codicons from "../vendor/codicons/icons.json";

export type git_icon_name = keyof typeof codicons;
const templates = new Map<git_icon_name, SVGSVGElement>();

/** 使用随 bundle 分发的官方 Codicons SVG，避免正文及系统字体改变图标形状。 */
export function git_icon(name: git_icon_name, class_name = ""): SVGSVGElement {
  let template = templates.get(name);
  if (!template) {
    const parsed = new DOMParser().parseFromString(codicons[name], "image/svg+xml");
    if (parsed.documentElement.localName !== "svg") throw new Error("无效的内置 Git 图标：" + name);
    template = document.importNode(parsed.documentElement, true) as unknown as SVGSVGElement;
    template.setAttribute("width", "16"); template.setAttribute("height", "16");
    template.setAttribute("aria-hidden", "true"); template.setAttribute("focusable", "false");
    template.setAttribute("fill", "currentColor"); template.setAttribute("data-git-icon", name);
    // 原始 SVG 保存在 vendor；显示时跟随界面前景色，保留 fill=none 的空白形状。
    for (const node of template.querySelectorAll("[fill]")) if (node.getAttribute("fill") !== "none") node.setAttribute("fill", "currentColor");
    templates.set(name, template);
  }
  const icon = template.cloneNode(true) as SVGSVGElement;
  icon.setAttribute("class", "git-standard-icon" + (class_name ? " " + class_name : "")); return icon;
}

export function git_icon_button(name: git_icon_name, title: string, action: () => void, class_name = ""): HTMLButtonElement {
  const button = document.createElement("button"); button.type = "button";
  button.className = "git-icon-button" + (class_name ? " " + class_name : "");
  button.title = title; button.setAttribute("aria-label", title); button.onclick = action; button.append(git_icon(name)); return button;
}

export function git_disclosure(): SVGSVGElement { return git_icon("chevron-right", "git-disclosure-icon"); }
