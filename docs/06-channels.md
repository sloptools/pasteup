# Channels

| Key | Effect |
|---|---|
| ⌘1–⌘4 | show color, emission, ao, roughness (⇧ adds one not there yet) |
| tabs | the same in the layer panel; a faint tab is a channel not there yet, a click adds it |
| right-click a tab | show it faintly over the others, remove it |
| right-click a layer | copy it to another channel |

Each channel is a stack of its own layers; the tools work the same in all. Where nothing is painted, emission is black (no glow), ao and roughness white (no occlusion, matte). ao and roughness show and write in gray, and the brush paints the brightness of the color.

Onion (under the tabs): another channel faintly over the canvas, as a reference while painting; it is never written.

glow (with emission): how strongly it glows, 1 to start; Blender's emission strength and the 3D view's glow and bloom follow it.

ao into color (on by default): export and Blender get the color with the AO multiplied in, the classic way; off writes the AO as its own file.

Export writes `name.png` and beside it `name_emission.png`, `name_roughness.png`, `name_ao.png` (when kept apart). The Blender bridge wires emission into the material's emission and roughness (non-color) into its roughness, and unwires a channel removed again.

Undo covers all channels; it shows the channel a step changed. Showing another channel is no step.
