# Tools

The tools run down the strip right of the canvas; their settings (tip, size, opacity) are in the bar above the canvas. A small arrow in a button's corner means variants: hold the button or right-click it.

| Key | Effect |
|---|---|
| V | move: drag or arrows (⇧ 8 texels) |
| T | transform: handles scale, inside moves; with a selection, lifts it first |
| I | island: click an island to clip the active layer to it |
| B, ⇧B | brush, next tip (round, square) |
| E, ⇧E | eraser, next tip |
| [, ] | brush or eraser size, in texels |
| 1–9, 0 | brush or eraser opacity 10–90 %, 100 %; a stroke never builds up past it |
| ⇧ click | brush or eraser: straight line from where the last stroke ended |
| right button | brush: paint with the secondary color |
| ⌥ click, ⌥ right click | brush or eraser: pick into the primary, secondary color |
| X | swap primary and secondary |
| ⇧ click | move: select the layer under the cursor |
| [, ] | transform: smaller, bigger, aspect kept |
| R, ⇧R | transform: rotate 90° clockwise, counter-clockwise |
| H, ⇧H | transform: flip horizontally, vertically |
| ⇧ drag a corner | transform: the other aspect mode (keep, free) |
| ⌘⇧N | new empty layer |

The color panel: the picker button picks once from the canvas (Esc cancels). Swatches: click sets the primary, right-click the secondary, ⌥ click removes, + adds the primary.

The brush is hard and texel exact on the whole image, whatever the layer's transform. A scaled or stretched layer is redrawn at one pixel per texel on the first stroke, at its size and place; a piece from a sharp photo loses that sharpness then (undo brings it back). With no layer, the brush makes one. Each stroke and each transform drag is one undo step.

Transform: corners keep the aspect or not (keep, free in the bar), edges stretch one side. Sizes snap to whole texels; the bar takes a typed width and height. Pieces grown past their pixel size show crisp, shrunk ones smooth.

With the tip list open, ↑ and ↓ pick the tip, Enter or Esc close it.

Every slider: click its value to type one, Enter sets it, Esc cancels. Values read as shown (opacity in %, levels in 0–255).
