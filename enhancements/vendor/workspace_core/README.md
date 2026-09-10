# Typora Code 常驻工作台核心

从 MIT 授权的 Typora Community Plugin 2.10.15 派生。源码身份见 SOURCE.json，许可见 LICENSE.md；src 保留独立构建运行闭包及其类型依赖闭包。原上游标识符保留便于追溯。

本派生版本取消插件管理、插件市场、插件设置菜单、内部 workspace 启用开关、目录级配置切换与重载。工作台服务在窗口启动时建立一次，普通文件夹切换只发送挂载事件。配置固定保存于用户数据目录 typora_code/settings/workspace.json，格式为 {version:1,settings:{...}}。

构建：node enhancements/scripts/build_workspace_core.mjs。可导入 build_workspace_core({outdir})，导入本身不运行。输出 workspace_core.js、workspace_core.css、locales/lang.en.json、locales/lang.zh-cn.json、locales/lang.de.json。先加载静态核心 CSS，再加载产品 CSS；两 link 使用 data-typora-code-style。脚本同步提供 Symbol.for('typora-code:workspace') 下的 ready Promise，宿主和样式准备后建立 app，并在根布局及侧栏可用时完成 ready。

实际导出 app、WorkspaceView、SidebarPanel、Notice、Component、Events；app.runtime_version 为 2.10.15-typora-code.1。app.load 仅发一次。统计、命令、Markdown、布局、侧栏及文件夹事件保持源自固定上游的实现。生产使用宿主 jQuery/reqnode；测试通过独立 Electron 与 jQuery 复现宿主契约，不把测试替身用于生产。

验证：check_workspace_core.mjs 检查产物与已退役插件路径；test_workspace_core_smoke.cjs 执行真实生成 bundle，检查启动、全局配置写入、目录切换保持 app/root 实例、不创建目录级配置及重复 start 不再次发 load。它不代替真实 Typora 文档编辑与全功能回归。

审计边界：运行入口已去除插件管理器与目录切换重载，但部分上游组件抽象及旧接口仍保留，例如 Sidebar 的组件登记／load／unload、ViewLegacy 分支与 Notice 旧方法。它们不代表产品提供插件启停；后续删减须核对组件树检索与释放关系，不宣称所有历史类型和接口均已移除。纯类型依赖 `utils/types.d.ts` 与 `markdown-view/mode-controller.ts` 按固定上游补齐，不产生运行代码。
