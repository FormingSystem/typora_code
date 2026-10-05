/** Theme identity is independent of brightness, including same-mode transitions. */
export const WORKSPACE_COLOR_THEMES = {
 light: {file:'vscode_default_light.css',label:'VSCODE_Default_Light',mode:'light'},
 dark: {file:'vscode_default_dark.css',label:'VSCODE_Default_Dark',mode:'dark'},
 light_2026: {file:'vscode_2026_default_light.css',label:'VSCODE_2026_Default_Light',mode:'light'},
 dark_2026: {file:'vscode_2026_default_dark.css',label:'VSCODE_2026_Default_Dark',mode:'dark'},
} as const;
export type color_theme_id=keyof typeof WORKSPACE_COLOR_THEMES;
export const COLOR_THEME_IDS=Object.keys(WORKSPACE_COLOR_THEMES) as color_theme_id[];
export function color_theme_from_file(file:string){return COLOR_THEME_IDS.find(id=>WORKSPACE_COLOR_THEMES[id].file===file);}
