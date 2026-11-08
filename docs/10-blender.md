# Blender

Install `tools/blender/pasteup_bridge.py`: Preferences › Add-ons › Install from Disk. The panel sits in the 3D view sidebar, tab **pasteup**. The `.blend` must be saved.

One texture per material. A project holds several; the list in the header switches between them.

| Control | Effect |
|---|---|
| sync | sends the objects with the active object's material, only their faces with that material, in the UV map Blender renders with; an object without a material gets one named after it |
| select an object | pasteup shows its material's texture (with **follow** on in the header) |
| add (pasteup header) | a selected object whose material has no texture yet: sync it |
| sync (pasteup header) | asks Blender to sync the shown texture's material again |

On the first sync, the images the material already uses (base color, emission, roughness) become the first layer of their channel. pasteup then writes into those same files, about 0.3 s after each change, as PNG. Where the material has none, it writes `<material>.png` beside the `.blend`, and `<…>_emission.png`, `<…>_roughness.png`, and wires them in with Closest. Emission takes the glow strength. AO is multiplied into the color unless kept apart (see channels).

A file pasteup didn't write itself is first copied into `.pasteup-backup/` beside it, so nothing painted elsewhere gets lost.

Projects from before textures open as one texture for the material `pasteup <name>` the old add-on made, writing to `<name>.png`.

## Painting in Blender

Paint on the pasteup texture in Blender (texture paint mode) and the strokes come back: about every half second the add-on sends the image while it holds new strokes, and pasteup puts the texels that differ from the texture Blender painted on into a layer `blender` on top of the color. Fade, mask, move or delete it like any layer. Blender takes pasteup's next texture only once all strokes have arrived, so none are lost.

The finish (palette, dither) applies to the strokes too, and with ao into color the AO multiplies over them once more.
