[Chinese](reading_minimap.md)

# Reading minimap media and quotation spacing

R087.9: the existing minimap traverses text only. VS Code source minimaps differ from rendered Markdown thumbnails. Draw img/canvas and inline SVG at actual document rectangles, retaining vertical compression, seek and drag mapping. Serialize SVG with computed styles for asynchronous decoding; each minimap owns its cache and releases stale/detached resources. Load failures preserve navigation and text. Loaded media uses the existing coalesced refresh; no continuous animation loop. Avoid duplicate SVG labels. Verify actual pixels, replacement, seek, themes and disposal; browser cross-origin and unavailable remote resource limits remain. Source minimaps and document models remain unchanged.

R074.11: current themes and the inspected native Typora github.css have zero vertical padding, but native paragraph layout differs. Add only 0.35em vertical padding (about 5.6px at 16px body) to owned themes as a user-requested product adaptation. Preserve 16px horizontal padding, borders, colors and line height. Shared readers inherit the rule; cover single/multiple lines, nesting and content zoom.

Verified [VS Code minimap documentation](https://code.visualstudio.com/docs/editing/getting-started/userinterface#_minimap): it is a source overview. Media here belongs to the rendered Markdown thumbnail. Native Mermaid foreignObject content uses a data image to avoid canvas taint from Blob decoding.
