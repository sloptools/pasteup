# pasteup bridge: sends a .blend's objects to pasteup and shows the texture pasteup
# makes for them. Install: Preferences > Add-ons > Install from Disk, this file.

bl_info = {
    "name": "pasteup bridge",
    "author": "pasteup",
    "version": (0, 1, 0),
    "blender": (4, 2, 0),
    "location": "View3D > Sidebar > pasteup",
    "description": "Texture the objects in pasteup, live",
    "category": "Paint",
}

import json
import os
import sys
import urllib.parse
import urllib.request

import bpy

# What the last poll saw, so only changes act.
state = {"connected": False, "texture": -1, "sync": None, "blend": ""}


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


def synced_objects(scene):
    names = [n for n in scene.pasteup_objects.split("\n") if n]
    return [o for o in (bpy.data.objects.get(n) for n in names) if o and o.type == "MESH"]


# Materials: the objects show one pasteup material while the texture is on; their
# own stay remembered on them and come back when it is off.

def material_name():
    return "pasteup " + blend_name()


def show_material(objects, mat):
    for o in objects:
        if "pasteup_own" not in o:
            o["pasteup_own"] = [s.material.name if s.material else "" for s in o.material_slots]
        if not o.material_slots:
            o.data.materials.append(mat)
        for s in o.material_slots:
            s.material = mat


def restore_materials(objects):
    for o in objects:
        own = o.get("pasteup_own")
        if own is None:
            continue
        if not own:
            o.data.materials.clear()
        for s, name in zip(o.material_slots, own):
            s.material = bpy.data.materials.get(name) if name else None
        del o["pasteup_own"]


def socket(node, *names):
    for n in names:
        if n in node.inputs:
            return node.inputs[n]


def load_image(tex, path, data=False):
    """Puts the file into an image node, reloading it when it is already there."""
    if tex.image and bpy.path.abspath(tex.image.filepath) == path:
        tex.image.reload()
    else:
        img = bpy.data.images.load(path, check_existing=True)
        img.filepath = bpy.path.relpath(path)
        img.reload()
        tex.image = img
    if data:
        tex.image.colorspace_settings.name = "Non-Color"


def channel_node(nodes, key, y):
    if key in nodes:
        return nodes[key]
    tex = nodes.new("ShaderNodeTexImage")
    tex.name = key
    tex.interpolation = "Closest"
    tex.location = (-400, y)
    return tex


def update_material(s):
    """The pasteup material with the latest channels: nearest pixels, no shine
    unless a roughness map says so, glow from the emission map."""
    name = material_name()
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links

    if not mat.get("pasteup"):
        nodes.clear()
        out = nodes.new("ShaderNodeOutputMaterial")
        out.location = (300, 0)
        bsdf = nodes.new("ShaderNodeBsdfPrincipled")
        bsdf.name = "bsdf"
        links.new(bsdf.outputs[0], out.inputs[0])
        socket(bsdf, "Roughness").default_value = 1.0
        socket(bsdf, "Metallic").default_value = 0.0
        spec = socket(bsdf, "Specular IOR Level", "Specular")
        if spec:
            spec.default_value = 0.0
        tex = channel_node(nodes, "color", 0)
        links.new(tex.outputs["Color"], socket(bsdf, "Base Color"))
        links.new(tex.outputs["Alpha"], socket(bsdf, "Alpha"))
        mat["pasteup"] = 1

    bsdf = nodes["bsdf"]
    load_image(nodes["color"], s["color"])

    # Optional channels: wired while pasteup has them, unwired otherwise.
    for key, y, target, data in (("emission", -300, ("Emission Color", "Emission"), False), ("roughness", -600, ("Roughness",), True)):
        sock = socket(bsdf, *target)
        path = s.get(key)
        if path and os.path.exists(path):
            tex = channel_node(nodes, key, y)
            load_image(tex, path, data)
            if not sock.links:
                links.new(tex.outputs["Color"], sock)
        else:
            for l in list(sock.links):
                links.remove(l)
    strength = socket(bsdf, "Emission Strength")
    if strength:
        level = s.get("strength")
        strength.default_value = (1.0 if level is None else level) if s.get("emission") else 0.0
    if not s.get("roughness"):
        socket(bsdf, "Roughness").default_value = 1.0
    return mat


def on_show(self, context):
    objects = synced_objects(context.scene)
    mat = bpy.data.materials.get(material_name())
    if self.pasteup_show and mat:
        show_material(objects, mat)
    else:
        restore_materials(objects)


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
            export_materials="NONE",
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


def sync(context):
    """Writes the objects as a GLB and tells pasteup. An error text, or None."""
    blend = blend_path()
    if not blend:
        return "save the .blend first"
    mode = context.mode
    if mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    try:
        return send(context, blend)
    finally:
        if mode == "EDIT_MESH" and context.view_layer.objects.active:
            bpy.ops.object.mode_set(mode="EDIT")


def send(context, blend):
    scene = context.scene
    objects = synced_objects(scene)
    if not objects:
        objects = [o for o in context.selected_objects if o.type == "MESH"]
        if not objects:
            objects = [o for o in scene.objects if o.type == "MESH" and o.visible_get()]
        scene.pasteup_objects = "\n".join(o.name for o in objects)
    if not objects:
        return "no mesh objects"
    if not any(o.data.uv_layers for o in objects):
        return "the objects have no UV map"

    if call("/state?blend=" + urllib.parse.quote(blend)) is None:
        return "pasteup is not running"
    written = os.path.join(bpy.app.tempdir, blend_name() + ".pasteup.glb")
    export(context, objects, written)
    body = {"blend": blend, "written": written, "uvSets": uv_sets(objects)}
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


def painted_image():
    mat = bpy.data.materials.get(material_name())
    node = mat.node_tree.nodes.get("color") if mat and mat.use_nodes else None
    return node.image if node else None


def send_paint(blend):
    """Strokes painted on the pasteup texture in Blender go back to pasteup.
    True while the image holds strokes pasteup hasn't had yet."""
    import numpy as np
    import zlib

    img = painted_image()
    if not img or not img.is_dirty:
        state["painted"] = None
        return False
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    raw = (np.clip(px, 0, 1) * 255 + 0.5).astype(np.uint8).tobytes()
    mark = zlib.crc32(raw)
    if mark == state.get("painted"):
        return False
    written = os.path.join(bpy.app.tempdir, blend_name() + ".pasteup.rgba")
    with open(written, "wb") as f:
        f.write(raw)
    body = {"blend": blend, "written": written, "width": w, "height": h, "texture": state["texture"]}
    if call("/paint", body, timeout=2) is not None:
        state["painted"] = mark
    return True


def poll():
    blend = blend_path()
    if blend != state["blend"]:
        state.update(blend=blend, texture=-1, sync=None, painted=None)
    s = call("/state?blend=" + urllib.parse.quote(blend)) if blend else None
    connected = s is not None
    if connected != state["connected"]:
        state["connected"] = connected
        for win in bpy.context.window_manager.windows:
            for area in win.screen.areas:
                area.tag_redraw()
    if not s:
        return 0.5

    # Paint from Blender first; pasteup's next texture holds it, so reloading then loses nothing.
    fresh_paint = send_paint(blend)
    if not fresh_paint and s["texture"] != state["texture"] and s.get("color") and os.path.exists(s["color"]):
        state["texture"] = s["texture"]
        mat = update_material(s)
        scene = bpy.context.scene
        if scene.pasteup_show:
            show_material(synced_objects(scene), mat)

    # pasteup's sync button; a count seen for the first time is only taken note of.
    if state["sync"] is not None and s["sync"] != state["sync"]:
        in_view(sync)
    state["sync"] = s["sync"]
    return 0.5


class PASTEUP_OT_sync(bpy.types.Operator):
    bl_idname = "pasteup.sync"
    bl_label = "sync"
    bl_description = "Send the objects and their UVs to pasteup"

    def execute(self, context):
        err = sync(context)
        if err:
            self.report({"WARNING"}, err)
            return {"CANCELLED"}
        self.report({"INFO"}, "sent to pasteup")
        return {"FINISHED"}


class PASTEUP_OT_use_selection(bpy.types.Operator):
    bl_idname = "pasteup.use_selection"
    bl_label = "use selection"
    bl_description = "Texture the selected objects in pasteup, sharing one texture"

    def execute(self, context):
        scene = context.scene
        restore_materials(synced_objects(scene))
        objects = [o for o in context.selected_objects if o.type == "MESH"]
        scene.pasteup_objects = "\n".join(o.name for o in objects)
        mat = bpy.data.materials.get(material_name())
        if scene.pasteup_show and mat:
            show_material(objects, mat)
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

        objects = synced_objects(context.scene)
        row = col.row()
        row.label(text=f"{len(objects)} objects" if objects else "selection, on first sync")
        row.operator("pasteup.use_selection", text="", icon="RESTRICT_SELECT_OFF")
        col.operator("pasteup.sync", icon="FILE_REFRESH")
        col.prop(context.scene, "pasteup_show")


classes = (PASTEUP_OT_sync, PASTEUP_OT_use_selection, PASTEUP_PT_panel)


def register():
    for c in classes:
        bpy.utils.register_class(c)
    bpy.types.Scene.pasteup_objects = bpy.props.StringProperty(name="objects")
    bpy.types.Scene.pasteup_show = bpy.props.BoolProperty(name="show texture", default=True, update=on_show)
    bpy.app.timers.register(poll, first_interval=0.5, persistent=True)


def unregister():
    if bpy.app.timers.is_registered(poll):
        bpy.app.timers.unregister(poll)
    del bpy.types.Scene.pasteup_show
    del bpy.types.Scene.pasteup_objects
    for c in reversed(classes):
        bpy.utils.unregister_class(c)
