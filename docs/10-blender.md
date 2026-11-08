# Blender

Install `tools/blender/pasteup_bridge.py`: Preferences › Add-ons › Install from Disk. The panel sits in the 3D view sidebar, tab **pasteup**. The `.blend` must be saved.

| Control | Effect |
|---|---|
| sync | sends the objects with the UV map Blender renders with; pasteup shows their layout |
| use selection | the selected objects share the texture; without it, the first sync takes the selection |
| show texture | the objects show the material `pasteup <name>`; off brings their own back |
| sync (pasteup header) | asks Blender to sync again |

pasteup writes the texture as `<name>.png` beside the `.blend`, about 0.3 s after each change, and the other channels as `<name>_emission.png`, `<name>_roughness.png`. The material samples them with Closest, metallic 0, no specular: emission into the emission color, roughness (non-color) into roughness, roughness 1 without one. AO is multiplied into the color unless kept apart (see channels).

## Painting in Blender

Paint on the pasteup texture in Blender (texture paint mode) and the strokes come back: about every half second the add-on sends the image while it holds new strokes, and pasteup puts the texels that differ from the texture Blender painted on into a layer `blender` on top of the color. Fade, mask, move or delete it like any layer. Blender takes pasteup's next texture only once all strokes have arrived, so none are lost.

The finish (palette, dither) applies to the strokes too, and with ao into color the AO multiplies over them once more.
