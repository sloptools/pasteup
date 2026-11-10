# Selection

| Key | Effect |
|---|---|
| M, ⇧M | select tool, next mode (rect, lasso) |
| drag | select; a click without a drag keeps the selection |
| ⇧ drag, ⌥ drag | add to, take from the selection |
| ⌘A, ⌘D, ⌘⇧I | select all, deselect, invert |
| Esc, ✕ in the options bar | deselect, in every tool |
| ⌘C, ⌘⇧C | copy from the active layer, copy everything visible |
| ⌘X | cut from the active layer |
| ⌘V | paste floating into the active layer: move it, Enter or the next action places it, Esc discards it |
| ⌘⇧V | paste as a new layer |
| Backspace | clear the selected pixels (without a selection: delete the layer) |
| T | lift the selected pixels into a floating layer to transform them: Enter places, Esc puts them back |

Selections are texel exact. Brush and eraser paint only inside the selection. Pixels outside a piece's rectangle can't be painted or placed; pieces never grow.

A paste lands where it was copied; the next one of the same copy where the last was placed, so ⌘V, ↓, ⌘V, ↓ stacks rows.
