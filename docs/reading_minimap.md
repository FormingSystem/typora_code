[English](reading_minimap.en.md)

# 阅读缩略图媒体与引用留白

R087.9：现有缩略图仅遍历文本，导致图片及Mermaid缺失。VS Code源码minimap不等于Markdown阅读缩略图；本次依据正文实际媒体矩形绘制img/canvas及内联SVG，保留现有纵向压缩与点击/拖动映射，不改变正文、模型或源码minimap。SVG离屏序列化样式后异步解码，缓存由单个缩略图所有，换源/主题失效及销毁释放；加载失败保持文字和布局，不阻断导航。图形异步加载完成触发已有合并刷新，不持续动画刷新。图片与SVG文字不再重复绘制。验收真实颜色像素、换源、点击定位、四主题及销毁，远程图片加载失败和跨域画布保留浏览器边界。

R074.11：当前主题上下padding为0；本机Typora github.css也是0，但原生段落布局不同。按用户明确要求仅在自有主题增加0.35em上下padding（16px正文约5.6px），保持16px横向padding、边线、颜色和行高；此值是产品适配，不声称来自GitHub常量。共享预览继承同一规则，覆盖单行/多行/嵌套及字号变化。

已核对[VS Code官方minimap说明](https://code.visualstudio.com/docs/editing/getting-started/userinterface#_minimap)：它是源码概览。本修复的媒体呈现是Markdown阅读缩略图的职责扩展。原生Mermaid的foreignObject通过内嵌数据图像解码，避免Blob解码造成跨域画布污染。
