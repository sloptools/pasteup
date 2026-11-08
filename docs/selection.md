# Selection

| Key | Effect |
|---|---|
| M, ⇧M | select tool, next mode (rect, lasso) |
| drag | select; a click without a drag deselects |
| ⇧ drag, ⌥ drag | add to, take from the selection |
| ⌘A, ⌘D, ⌘⇧I | select all, deselect, invert |
| Esc, ✕ in the canvas bar | deselect, in every tool |
| ⌘C, ⌘⇧C | copy from the active layer, copy everything visible |
| ⌘X | cut from the active layer |
| ⌘V | paste as a new layer where it was copied, then move it |
| ⌘⇧V | paste floating into the active layer: move it, Enter places, Esc discards |
| Backspace | clear the selected pixels (without a selection: delete the layer) |
| T | lift the selected pixels into a floating layer to transform them: Enter places, Esc puts them back |

Selections are texel exact. Brush and eraser paint only inside the selection. Pixels outside a piece's rectangle can't be painted or placed; pieces never grow.
