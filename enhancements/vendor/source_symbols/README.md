# 离线语法大纲资产

运行时固定 `web-tree-sitter@0.25.10`；五种 grammar 二进制来自 `tree-sitter-wasm@1.1.8` 的 npm 发布归档，只有 JavaScript、TypeScript、Python、CMake、YAML 随产品分发。C/C++ 大纲已改用本机 clangd，不分发或调用这两种 grammar。`source_manifest.json` 固定归档及逐文件 SHA256，并记录原 grammar 仓库和许可文本来源。该预构建包含 semver 源依赖，因此不把许可标签冒充二进制的精确 grammar Git 提交。各原作者的 MIT 许可与运行时许可随资产分发。

`scripts/build_source_symbol_assets.mjs` 校验 grammar SHA256，生成独立 Worker 并复制到 `dist/assets/source_symbols/`。部署沿既有递归 assets 和 SHA256SUMS 路径；解析时从用户数据目录的本产品资产读取，只首次使用时加载对应 grammar。无 CDN、网络获取、编译器调用或源码执行，也不将 WASM 内嵌启动脚本。

这五种语言提供语法树符号导航：Python 赋值目标不冒充声明；CMake 显示函数、宏、set/option 变量及明确的构建目标；YAML 显示映射键和列表层级。TSX、其他语言和语义引用分析尚未提供。文档超过 2 Mi UTF-16 字符时显示边界说明；单次解析使用 750 ms 进度取消预算，最多提取约 5000 个符号。编辑中的不完整语法保留 grammar 可识别部分。
