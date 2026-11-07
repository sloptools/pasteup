# Blender

Install `tools/blender/pasteup_bridge.py`: Preferences › Add-ons › Install from Disk. The panel sits in the 3D view sidebar, tab **pasteup**. The `.blend` must be saved.

| Control | Effect |
|---|---|
| sync | sends the objects with the UV map Blender renders with; pasteup shows their layout |
| use selection | the selected objects share the texture; without it, the first sync takes the selection |
| show texture | the objects show the material `pasteup <name>`; off brings their own back |
| sync (pasteup header) | asks Blender to sync again |

pasteup writes the texture as `<name>.png` beside the `.blend`, about 0.3 s after each change. The material samples it with Closest, roughness 1, metallic 0, no specular.
