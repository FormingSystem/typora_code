import type {read_reading_image_settings} from './reading_image_settings';

/** Frame padding changes layout; border effects remain outside serialized markup. */
export function reading_image_decoration(settings:ReturnType<typeof read_reading_image_settings>,dark:boolean){
  const base_color=(dark?settings.border_color_dark:settings.border_color_light)||`var(--theme-muted,var(--text-color,${dark?'#9d9d9d':'#3b3b3b'}))`;
  const color=settings.border_opacity===100?base_color:`color-mix(in srgb, ${base_color} ${settings.border_opacity}%, transparent)`;
  const width=settings.border?settings.border_width:0;
  const shadows:Record<string,string>={soft:`0 2px 8px rgb(0 0 0 / ${dark?.4:.16})`,medium:`0 4px 12px rgb(0 0 0 / ${dark?.5:.2})`,strong:`0 8px 24px rgb(0 0 0 / ${dark?.65:.28})`};
  return `box-sizing:border-box;padding:${settings.padding_y}px ${settings.padding_x}px;object-fit:contain;object-position:${settings.alignment};border-radius:${settings.border_radius}px;--reading-image-decoration-width:${width}px;${settings.border?`outline:${width}px solid ${color};outline-offset:-${width}px;`:''}${shadows[settings.shadow]?`box-shadow:${shadows[settings.shadow]};`:''}`;
}
