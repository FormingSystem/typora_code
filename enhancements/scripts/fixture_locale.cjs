// Legacy assertions exercise Chinese messages explicitly, independently of the machine locale.
globalThis._options ??= {appLocale:'zh-CN'};
require('../src/workspace_service_i18n.cjs').set_workspace_service_locale('zh-cn');
