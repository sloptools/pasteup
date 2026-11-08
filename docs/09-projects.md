# Projects

| Key | Effect |
|---|---|
| ⌘S | save; the first time, ask where |
| ⌘⇧S | save as |
| ⌘O | open a project or a model |
| drop a .pasteup | open it |

The header shows the project's name and ● while there are unsaved changes; quitting or opening another project asks before they are lost.

A project is one `.pasteup` file, a zip: `project.json` (size, tile mode, colors, swatches, the model's UVs, the .blend it came from, the layers), `pieces/` with the layers' pixels and painted masks, `refs/` with copies of the ref photos, so the file travels on its own. Saving again writes only new pieces and copies the rest over; the file is replaced only once the new one is whole.

Not saved: undo, the selection, tool settings.

Unsaved changes are kept aside 5 s after each edit, one file per session in pasteup's settings folder. When pasteup ended without quitting (a crash, the terminal), the next start shows **unsaved session from …** in the header: restore opens it unsaved, ⌘S saves into its project; discard deletes it. Quitting with "Quit without saving" drops it.
