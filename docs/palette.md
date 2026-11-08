# Palette and finish

The finish is the last step over the color channel: sharpen, then ordered dither, then each texel to its nearest palette color. Layers stay as they are; the canvas, the 3D view, the export and Blender show the finished color.

The palette tab in the color panel:

| Setting | Effect |
|---|---|
| off, auto, fixed | no palette, one computed from the texture, or one of the project's |
| colors (auto) | how many: 2–256; the palette follows the texture once edits rest, and stays steady |
| quake | Quake's palette |
| lospec | a palette from lospec.com by its slug (as in lospec.com/palette-list/pico-8) |
| file | a palette file: .lmp, .gpl, .hex, or the colors of an image |
| swatches | click: primary color, right-click: secondary, to paint in the palette |
| dither | 4×4 Bayer before the palette, so gradients break into patterns |
| sharpen | crisper edges before the palette |

Palettes and the finish are saved with the project.
