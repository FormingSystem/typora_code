import {resolve_workspace_locale} from './workspace_locale';

/** Configure service messages from the already loaded window language. */
export function load_workspace_service(require_module: (name: string) => any, filename: string): any {
  const service=require_module(filename);
  service.set_workspace_service_locale(resolve_workspace_locale());
  return service;
}
