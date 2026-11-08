# Tools

The tools run down the strip right of the canvas; their settings (tip, size, opacity) are in the bar above the canvas. A small arrow in a button's corner means variants: hold the button or right-click it.

| Key | Effect |
|---|---|
| V | move |
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
| ⌘⇧N | new empty layer |

The color panel: the picker button picks once from the canvas (Esc cancels). Swatches: click sets the primary, right-click the secondary, ⌥ click removes, + adds the primary.

The brush is hard and texel exact. It paints on the active layer; with no layer, it makes one. A placed piece that is moved, scaled or turned is baked to texels on the first stroke: its transform is gone, undo brings it back. Each stroke is one undo step.

Arrows, [ ], R and H move, scale, turn and flip the active layer in the move tool only.

With the tip list open, ↑ and ↓ pick the tip, Enter or Esc close it.

Every slider: click its value to type one, Enter sets it, Esc cancels. Values read as shown (opacity in %, levels in 0–255).
