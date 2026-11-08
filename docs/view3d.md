# 3D view

The ref area shows the photos or the model in 3D: the switch in its bar, or `.

| Input | Effect |
|---|---|
| two fingers, drag | orbit |
| pinch, ctrl + scroll | zoom towards the cursor |
| ⇧ two fingers, ⇧ drag, right drag | pan |
| ⌘0, frame | frame the model |
| lit, flat | light from the camera, or the texture as it is |

The model is the one whose UVs show, opened or synced from Blender. It shows the texture as it is written, with AO multiplied in unless kept apart, and the emission glowing; texels stay crisp up close and calm far away, like Godot's nearest_mipmap. It follows painting a few times a second.
