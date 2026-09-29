import icons from "../vendor/fontawesome/icons.json";

/** Font Awesome Free 6.7.2 official solid graphics; only change display size and inherited color. */
export function graph_file_icon(name: keyof typeof icons, class_name: string): SVGSVGElement {
  const parsed = new DOMParser().parseFromString(icons[name], "image/svg+xml");
  const icon = document.importNode(parsed.documentElement, true) as unknown as SVGSVGElement;
  icon.setAttribute("class", class_name);
  icon.setAttribute("data-graph-file-icon", name);
  icon.setAttribute("fill", "currentColor");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("focusable", "false");
  icon.setAttribute("width", "13"); icon.setAttribute("height", "13");
  return icon;
}
