# Tools

The tools run down the strip right of the canvas; their settings (tip, size, opacity) are in the bar above the canvas. A small arrow in a button's corner means variants: hold the button or right-click it.

| Key | Effect |
|---|---|
| V | move: drag or arrows (⇧ 8 texels) |
| T | transform: handles scale, inside moves; with a selection, lifts it first |
| I | island: click an island to clip the active layer to it |
| B, ⇧B | brush, next tip (round, square) |
| E, ⇧E | eraser, next tip |
| G, ⇧G | fill, next kind (bucket, gradient) |
| G | bucket: like texels touching the clicked one, or all alike (contiguous off); tolerance 0–255 |
| drag | gradient: set one up, primary to secondary (right button: the other way), linear or radial around the start |
| drag an end, the line | gradient: change length and direction, move it; it snaps level, plumb and diagonal near them (⌥ while dragging: free, ⇧: 45° steps) |
| Enter, Esc | gradient: apply, discard; another tool or layer applies it too |
| ⇧T | tile mode: off, x, y, xy |
| O | tile mode: shift the view by half a texture, to bring a seam to the middle |
| U, ⇧U | shape, next kind (rect, rect filled, ellipse, ellipse filled) |
| ⇧ drag, ⌥ drag | shape: square or circle, from the center |
| [, ] | brush or eraser size, shape outline width, in texels |
| hard | brush, eraser: 100 is hard and texel exact, lower fades the tip toward its edge; a stroke keeps each texel's strongest dab |
| ⇧I | island clip: brush, eraser, fill and shapes keep to the UV island they start in |
| 1–9, 0 | opacity of brush, eraser, fill or shape: 10–90 %, 100 %; a stroke never builds up past it |
| ⇧ click | brush or eraser: straight line from where the last stroke ended |
| right button | brush, fill, shape: the secondary color |
| ⌥ click, ⌥ right click | brush, eraser, fill: pick into the primary, secondary color |
| X | swap primary and secondary |
| ⇧ click | move: select the layer under the cursor |
| [, ] | transform: smaller, bigger, aspect kept |
| R, ⇧R | transform: rotate 90° clockwise, counter-clockwise |
| H, ⇧H | transform: flip horizontally, vertically |
| ⇧ drag a corner | transform: the other aspect mode (keep, free) |
| ⌘⇧N | new empty layer |

The color panel: the picker button picks once from the canvas (Esc cancels). Swatches: click sets the primary, right-click the secondary, ⌥ click removes, + adds the primary.

Layers always show one pixel per texel, drawn from their source pixels; transforms redraw from the source, so shrinking and growing again stays sharp. The brush is hard and texel exact on the whole image. Painting makes a scaled layer's texels its new source: growing it later is blocky. With no layer, brush, fill and shapes make one. Fill compares the active layer's colors, or all visible layers with all on; clear texels count as alike whatever color they keep. Fill and shapes stay inside a selection like the brush. Each stroke and each transform drag is one undo step.

Transform: corners keep the aspect or not (keep, free in the bar), edges stretch one side. Sizes snap to whole texels; the bar takes a typed width and height. Pieces grown past their pixel size show crisp, shrunk ones smooth.

With the tip list open, ↑ and ↓ pick the tip, Enter or Esc close it.

Every slider: click its value to type one, Enter sets it, Esc cancels. Values read as shown (opacity in %, levels in 0–255). In the bar above the canvas the values stand alone: drag them sideways to change them.

Island clip needs a model. It counts every texel an island touches, even partly, so paint reaches the seams; the island under the cursor shows faintly. Unlike the island tool, which clips a whole layer for good, it only limits where a stroke lands.

Gradient: a click without a drag sets up nothing; angle and length can also be typed in the bar. Dither makes each texel one color or the other in a 4×4 Bayer pattern; to clear fades the primary out instead. It fills everything the selection and island clip leave.

Tile mode (in the header) shows the texture's neighbors. Brush, eraser, shapes and fill wrap at the edges, and layers pushed past an edge come back in on the other side, so pieces make seamless textures.
