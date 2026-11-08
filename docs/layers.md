# Layers

| Key | Effect |
|---|---|
| ⌘Z, ⌘⇧Z | undo, redo |
| ⌘J | duplicate |
| ⌘⇧A | adjustment layer above the active one |
| ⌘E | merge down |
| ⌘[, ⌘] | move down, up |
| Q | paint the active layer's mask (gives it one if it has none); Q or Esc back to its pixels |
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

Every layer can take a grunge mask (+ grunge in its settings, the bin removes it, right-click too): it shows only where the mask does. The grunge layer button makes a color layer with one, for dirt, rust and grime.

| Setting | Effect |
|---|---|
| map | noise (chunky blocks), clouds (soft), or one of texxer's 34 grunge maps |
| scale | repeats across the texture; noise: block size in texels |
| stretch | pulls the map down (2 to 8) or across (−2 to −8), for streaks and runs |
| level | how much shows |
| contrast | soft to hard edges |
| seed | another variant: shifts and turns the map |
| invert | show where the mask hides |

All maps tile, so masks stay seamless in tile mode.

## Painted masks and color layers

A painted mask (+ mask, or Q; the bin or right-click removes it) decides where its layer shows, at texture size; it multiplies with the grunge mask. While it is painted (mask in the canvas bar, mask chip in the layer row), the color tools work on it: brush shows, eraser hides, fill shows, a gradient sets it from shown to hidden (right button: the other way), shapes show. Opacity, hardness, selection and island clip apply. Dirt running down from an edge: a gradient on the mask under a grunge mask stretched down.

A color layer is the whole texture in one color, no pixels: change it with the swatch in its settings, or take the primary color. It takes paint only on its mask.

## Blur

A gaussian blur on any layer but adjustments (+ blur in its settings): across and down in texels, the standard deviation as in GIMP; the chain moves both together. It comes before the masks, so they still cut sharp. Edges clamp, so a layer covering the texture doesn't darken at its border; in tile mode the blur wraps. A fake screen: a filled rect on its own layer, blurred, with screen or add for the glow.
