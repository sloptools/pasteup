# Layers

| Key | Effect |
|---|---|
| ⌘Z, ⌘⇧Z | undo, redo |
| ⌘J | duplicate |
| ⌘⇧A | adjustment layer above the active one |
| ⌘E | merge down |
| ⌘[, ⌘] | move down, up |
| ↑, ↓ | select the layer above, below (after a click in the panel; other keys act as in the canvas) |
| drag in the list | move to the line shown |
| right click in the panel | new layer or adjustment; on a layer also rename, duplicate, merge, delete |
| ⌘⌥G | clip to the layer below |
| 1–9, 0 | opacity 10–90 %, 100 % (canvas, except brush and eraser) |
| ⇧+, ⇧− | next, previous blend mode (canvas) |
| ⇧ click | select the layer under the cursor (canvas) |
| Enter, double click | rename |
| Backspace | delete (canvas) |
| ⌘⇧E | export the texture |
| ⌘0 | fit the view |

Blend modes: normal, multiply, screen, overlay, add, soft light. A clipped layer shows only where the next unclipped layer below has pixels, and hides with it.

An adjustment layer changes everything below it: levels (black, gamma, white), then brightness, then hue and saturation. Clip it to adjust only the layer below, or pick an island with the island tool to adjust only that island. Double-click a slider to reset it.

Merge down bakes both layers into one layer at texture size; its transform and island clip are gone.

Switching the texture size (header) scales every layer along, so the texture keeps its look at the new resolution; undo brings back size and layers together.

## Grunge masks

Every layer can take a grunge mask (the select under blend and opacity): it shows only where the mask does. The grunge layer button makes a layer of the primary color with one, for dirt, rust and grime.

| Setting | Effect |
|---|---|
| map | noise (chunky blocks), clouds (soft), or one of texxer's 34 grunge maps |
| scale | repeats across the texture; noise: block size in texels |
| level | how much shows |
| contrast | soft to hard edges |
| seed | another variant: shifts and turns the map |
| invert | show where the mask hides |

All maps tile, so masks stay seamless in tile mode.
