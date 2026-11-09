# pasteup bridge: sends the objects of a material to pasteup and shows the texture
# pasteup paints for it, in the material's own images. Selecting an object shows
# its texture in pasteup. Install: Preferences > Add-ons > Install from Disk, this file.

bl_info = {
    "name": "pasteup bridge",
    "author": "pasteup",
    "version": (0, 2, 0),
    "blender": (4, 2, 0),
    "location": "View3D > Sidebar > pasteup",
    "description": "Texture the objects in pasteup, live, one texture per material",
    "category": "Paint",
}

import json
import os
import sys
import urllib.parse
import urllib.request

import bpy

# What the last poll saw, so only changes act: texture versions and paint marks
# by material, the object and material selected last.
state = {"connected": False, "versions": {}, "painted": {}, "selected": None, "sync": None, "blend": ""}

# The channels pasteup paints, the Principled BSDF input each goes into, and
# whether its image holds data rather than color.
CHANNELS = (
    ("color", ("Base Color",), False),
    ("emission", ("Emission Color", "Emission"), False),
    ("roughness", ("Roughness",), True),
)


def config_dir():
    if sys.platform == "darwin":
        return os.path.expanduser("~/Library/Application Support")
    if sys.platform == "win32":
        return os.environ.get("APPDATA", "")
    return os.environ.get("XDG_CONFIG_HOME") or os.path.expanduser("~/.config")


def call(path, body=None, timeout=0.3):
    """A request to pasteup, None when it isn't running."""
    try:
        with open(os.path.join(config_dir(), "pasteup", "bridge.json")) as f:
            info = json.load(f)
    except (OSError, ValueError):
        return None
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"http://127.0.0.1:{info['port']}{path}", data=data, headers={"X-Pasteup-Token": info["token"]})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            text = res.read()
            return json.loads(text) if text else {}
    except (OSError, ValueError):
        return None


def blend_path():
    return bpy.path.abspath(bpy.data.filepath) if bpy.data.filepath else ""


def blend_name():
    return os.path.splitext(os.path.basename(bpy.data.filepath))[0]


def socket(node, *names):
    for n in names:
        if n in node.inputs:
            return node.inputs[n]


# Materials: pasteup paints into the images a material's Principled BSDF already
# samples, and wires in an image node where one is missing.

def principled(mat):
    if not mat or not mat.use_nodes:
        return None
    return next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)


def image_node(mat, inputs):
    """The image node feeding one of the BSDF's inputs, if any."""
    bsdf = principled(mat)
    sock = bsdf and socket(bsdf, *inputs)
    if not sock or not sock.is_linked:
        return None
    node = sock.links[0].from_node
    return node if node.type == "TEX_IMAGE" else None


def images_of(mat):
    """The image files the material uses, by channel."""
    out = {}
    for key, inputs, _ in CHANNELS:
        node = image_node(mat, inputs)
        if node and node.image and node.image.filepath and not node.image.packed_file:
            out[key] = bpy.path.abspath(node.image.filepath, library=node.image.library)
    return out


def ensure_bsdf(mat):
    mat.use_nodes = True
    bsdf = principled(mat)
    if bsdf:
        return bsdf
    nodes = mat.node_tree.nodes
    out = next((n for n in nodes if n.type == "OUTPUT_MATERIAL"), None) or nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (out.location.x - 300, out.location.y)
    mat.node_tree.links.new(bsdf.outputs[0], out.inputs[0])
    return bsdf


def same_file(a, b):
    return os.path.normcase(os.path.normpath(a)) == os.path.normcase(os.path.normpath(b))


def load_image(tex, path, data=False):
    """Puts the file into an image node, reloading it when it is already there."""
    if tex.image and same_file(bpy.path.abspath(tex.image.filepath), path):
        tex.image.reload()
    else:
        img = bpy.data.images.load(path, check_existing=True)
        img.filepath = bpy.path.relpath(path)
        img.reload()
        tex.image = img
    if data:
        tex.image.colorspace_settings.name = "Non-Color"


def update_material(mat, t):
    """The material with pasteup's latest channels, in nearest pixels; channels
    pasteup doesn't have stay as they are."""
    bsdf = ensure_bsdf(mat)
    nodes = mat.node_tree.nodes
    for i, (key, inputs, data) in enumerate(CHANNELS):
        path = t.get(key)
        if not path or not os.path.exists(path):
            continue
        tex = image_node(mat, inputs)
        if not tex:
            tex = nodes.new("ShaderNodeTexImage")
            tex.location = (bsdf.location.x - 400, bsdf.location.y - 300 * i)
            mat.node_tree.links.new(tex.outputs["Color"], socket(bsdf, *inputs))
        tex.interpolation = "Closest"
        load_image(tex, path, data)
    strength = socket(bsdf, "Emission Strength")
    if strength and t.get("emission"):
        level = t.get("strength")
        strength.default_value = 1.0 if level is None else level
    return mat


def export(context, objects, path):
    view_layer = context.view_layer
    selected = [o for o in view_layer.objects if o.select_get()]
    active = view_layer.objects.active
    try:
        for o in view_layer.objects:
            o.select_set(o in objects)
        bpy.ops.export_scene.gltf(
            filepath=path,
            export_format="GLB",
            use_selection=True,
            export_apply=True,
            # Materials by name only, so pasteup keeps the faces of one.
            export_materials="EXPORT",
            export_image_format="NONE",
            export_animations=False,
            export_cameras=False,
            export_lights=False,
        )
    finally:
        for o in view_layer.objects:
            o.select_set(o in selected)
        view_layer.objects.active = active


def uv_sets(objects):
    """The UV map Blender renders with, per object, as its TEXCOORD index."""
    return {o.name: next((i for i, l in enumerate(o.data.uv_layers) if l.active_render), 0) for o in objects}


def target(context, name=None):
    """The material to sync: by name, else the one of the object by that name or
    the active object. An object without one gets a material of its own."""
    if name and name in bpy.data.materials:
        return bpy.data.materials[name]
    obj = bpy.data.objects.get(name) if name else context.view_layer.objects.active
    if not obj or obj.type != "MESH":
        return None
    if not obj.active_material:
        mat = bpy.data.materials.new(obj.name)
        if obj.material_slots:
            obj.active_material = mat
        else:
            obj.data.materials.append(mat)
    return obj.active_material


def sync(context, name=None):
    """Writes the objects with the material as a GLB and tells pasteup. An error text, or None."""
    blend = blend_path()
    if not blend:
        return "save the .blend first"
    mode = context.mode
    if mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    try:
        return send(context, blend, target(context, name))
    finally:
        if mode == "EDIT_MESH" and context.view_layer.objects.active:
            bpy.ops.object.mode_set(mode="EDIT")


def send(context, blend, mat):
    if not mat:
        return "select a mesh object"
    objects = [o for o in context.view_layer.objects if o.type == "MESH" and any(s.material == mat for s in o.material_slots)]
    if not objects:
        return "no object has " + mat.name
    if not any(o.data.uv_layers for o in objects):
        return "the objects have no UV map"

    if call("/state?blend=" + urllib.parse.quote(blend)) is None:
        return "pasteup is not running"
    written = os.path.join(bpy.app.tempdir, blend_name() + ".pasteup.glb")
    export(context, objects, written)
    body = {"blend": blend, "written": written, "uvSets": uv_sets(objects), "material": mat.name, "images": images_of(mat)}
    if call("/sync", body, timeout=10) is None:
        return "pasteup is not running"
    return None


def in_view(fn):
    """Runs an operator-calling function from a timer, in a window's context."""
    wm = bpy.context.window_manager
    if not wm.windows:
        return
    win = wm.windows[0]
    area = next((a for a in win.screen.areas if a.type == "VIEW_3D"), None)
    with bpy.context.temp_override(window=win, area=area):
        fn(bpy.context)


def send_paint(blend, name, version):
    """Strokes painted on a material's color image in Blender go back to pasteup.
    True while the image holds strokes pasteup hasn't had yet."""
    import numpy as np
    import zlib

    node = image_node(bpy.data.materials.get(name), CHANNELS[0][1])
    img = node.image if node else None
    if not img or not img.is_dirty:
        state["painted"].pop(name, None)
        return False
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    raw = (np.clip(px, 0, 1) * 255 + 0.5).astype(np.uint8).tobytes()
    mark = zlib.crc32(raw)
    if mark == state["painted"].get(name):
        return False
    written = os.path.join(bpy.app.tempdir, blend_name() + ".pasteup.rgba")
    with open(written, "wb") as f:
        f.write(raw)
    body = {"blend": blend, "material": name, "written": written, "width": w, "height": h, "texture": version}
    if call("/paint", body, timeout=2) is not None:
        state["painted"][name] = mark
    return True


def selected_object():
    try:
        return bpy.context.view_layer.objects.active
    except AttributeError:
        return None


def poll():
    blend = blend_path()
    if blend != state["blend"]:
        state.update(blend=blend, versions={}, painted={}, selected=None, sync=None)
    s = call("/state?blend=" + urllib.parse.quote(blend)) if blend else None
    connected = s is not None
    if connected != state["connected"]:
        state["connected"] = connected
        for win in bpy.context.window_manager.windows:
            for area in win.screen.areas:
                area.tag_redraw()
    if not s:
        return 0.5

    for name, t in (s.get("textures") or {}).items():
        mat = bpy.data.materials.get(name)
        if not mat:
            continue
        # Paint from Blender first; pasteup's next texture holds it, so reloading then loses nothing.
        fresh_paint = send_paint(blend, name, state["versions"].get(name, -1))
        if not fresh_paint and t["version"] != state["versions"].get(name) and t.get("color") and os.path.exists(t["color"]):
            state["versions"][name] = t["version"]
            update_material(mat, t)

    # The active object and its material, so pasteup can show its texture.
    obj = selected_object()
    if obj and obj.type == "MESH":
        name = obj.active_material.name if obj.active_material else ""
        if (obj.name, name) != state["selected"]:
            state["selected"] = (obj.name, name)
            call("/select", {"blend": blend, "material": name, "object": obj.name})

    # pasteup's sync button; a count seen for the first time is only taken note of.
    if state["sync"] is not None and s["sync"] != state["sync"]:
        in_view(lambda context: sync(context, s.get("syncOf") or None))
    state["sync"] = s["sync"]
    return 0.5


class PASTEUP_OT_sync(bpy.types.Operator):
    bl_idname = "pasteup.sync"
    bl_label = "sync"
    bl_description = "Send the objects with the active object's material and their UVs to pasteup"

    def execute(self, context):
        err = sync(context)
        if err:
            self.report({"WARNING"}, err)
            return {"CANCELLED"}
        self.report({"INFO"}, "sent to pasteup")
        return {"FINISHED"}


class PASTEUP_PT_panel(bpy.types.Panel):
    bl_label = "pasteup"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "pasteup"

    def draw(self, context):
        col = self.layout.column()
        if not bpy.data.filepath:
            col.label(text="save the .blend first")
        elif state["connected"]:
            col.label(text="pasteup: live", icon="LINKED")
        else:
            col.label(text="pasteup is not running", icon="UNLINKED")

        obj = context.view_layer.objects.active
        if obj and obj.type == "MESH":
            mat = obj.active_material
            col.label(text=mat.name if mat else obj.name + ": new material", icon="MATERIAL")
        else:
            col.label(text="select a mesh object")
        col.operator("pasteup.sync", icon="FILE_REFRESH")


classes = (PASTEUP_OT_sync, PASTEUP_PT_panel)


def register():
    for c in classes:
        bpy.utils.register_class(c)
    bpy.app.timers.register(poll, first_interval=0.5, persistent=True)


def unregister():
    if bpy.app.timers.is_registered(poll):
        bpy.app.timers.unregister(poll)
    for c in reversed(classes):
        bpy.utils.unregister_class(c)
