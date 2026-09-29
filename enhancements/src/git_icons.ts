import {workspace_interaction} from "./workspace_interaction";
import codicons from "../vendor/codicons/icons.json";
import { git_graph_text as text } from "./git_graph_i18n";

export type git_icon_name = keyof typeof codicons;
const templates = new Map<git_icon_name, SVGSVGElement>();

/** Use the official Codicons SVG distributed with bundle, avoid changing the document content and system fonts to alter the icon shape. */
export function git_icon(name: git_icon_name, class_name = ""): SVGSVGElement {
  let template = templates.get(name);
  if (!template) {
    const parsed = new DOMParser().parseFromString(codicons[name], "image/svg+xml");
    if (parsed.documentElement.localName !== "svg") throw new Error(text("icon.invalid_builtin", {name}));
    template = document.importNode(parsed.documentElement, true) as unknown as SVGSVGElement;
    template.setAttribute("width", "16"); template.setAttribute("height", "16");
    template.setAttribute("aria-hidden", "true"); template.setAttribute("focusable", "false");
    template.setAttribute("fill", "currentColor"); template.setAttribute("data-git-icon", name);
    // Original SVG is saved in vendor; during display, it follows the interface foreground color, retaining fill=none blank shape.
    for (const node of template.querySelectorAll("[fill]")) if (node.getAttribute("fill") !== "none") node.setAttribute("fill", "currentColor");
    templates.set(name, template);
  }
  const icon = template.cloneNode(true) as SVGSVGElement;
  icon.setAttribute("class", "git-standard-icon" + (class_name ? " " + class_name : "")); return icon;
}

export function git_icon_button(name: git_icon_name, title: string, action: () => void, class_name = ""): HTMLButtonElement {
  const button = document.createElement("button"); button.type = "button";
  button.className = "git-icon-button" + (class_name ? " " + class_name : "");
  workspace_interaction(button);
  button.title = title; button.setAttribute("aria-label", title); button.onclick = action; button.append(git_icon(name)); return button;
}

export function git_disclosure(): SVGSVGElement { return git_icon("chevron-right", "git-disclosure-icon"); }
