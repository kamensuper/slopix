"""Render studio previews of AncientLanternBlowfish.blend with Cycles.

    python render_previews.py [resolution] [samples] [view ...]
The lights, camera and floor live in the "ALB_Render_Rig" collection of a
temporary scene only; nothing is written back to the .blend.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

OUT = os.path.dirname(os.path.abspath(__file__))
RES = int(sys.argv[1]) if len(sys.argv) > 1 else 1400
SPP = int(sys.argv[2]) if len(sys.argv) > 2 else 160
ONLY = sys.argv[3:]

# name: (azimuth from the front toward +X, elevation, distance scale)
VIEWS = {
    "three_quarter_front": (-36, 12, 1.0),
    "front": (0, 5, 0.94),
    "side": (90, 5, 1.02),
    "rear": (180, 8, 0.94),
    "three_quarter_rear": (142, 14, 1.0),
    "top_down": (-30, 58, 1.0),
    "three_quarter_left": (40, 14, 1.0),
    "high_three_quarter": (-52, 34, 1.0),
    "low_hero": (24, 1, 0.92),
}


def orbit(c, az, el, d):
    a, e = math.radians(az), math.radians(el)
    return c + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * d


def aim(ob, target):
    ob.rotation_euler = (target - ob.location).to_track_quat('-Z', 'Y').to_euler()


def bloom(path):
    """Soft post glow around the turquoise emitters only (geometry stays crisp)."""
    try:
        import numpy as np
        from PIL import Image, ImageFilter
    except ImportError:
        return
    im = Image.open(path).convert("RGB")
    a = np.asarray(im).astype(np.float32) / 255.0
    r, g = a[..., 0], a[..., 1]
    w = np.clip((g - 0.80) / 0.15, 0, 1) * np.clip((g - r - 0.25) / 0.15, 0, 1)
    src = Image.fromarray((a * w[..., None] * 255).astype(np.uint8))
    out = a.copy()
    for radius, gain in ((im.width * 0.008, 0.30), (im.width * 0.025, 0.22)):
        b = np.asarray(src.filter(ImageFilter.GaussianBlur(radius))).astype(np.float32) / 255.0
        out = 1 - (1 - out) * (1 - gain * b)
    Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8)).save(path)


def main():
    bpy.ops.wm.open_mainfile(filepath=os.path.join(OUT, "AncientLanternBlowfish.blend"))
    sc = bpy.context.scene
    meshes = [o for o in sc.objects if o.type == 'MESH']
    lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for o in meshes:
        for v in o.data.vertices:
            for i in range(3):
                lo[i] = min(lo[i], v.co[i])
                hi[i] = max(hi[i], v.co[i])
    centre = (lo + hi) / 2
    radius = (hi - lo).length / 2

    rig = bpy.data.collections.new("ALB_Render_Rig")
    sc.collection.children.link(rig)

    def add(name, data):
        ob = bpy.data.objects.new(name, data)
        rig.objects.link(ob)
        return ob

    cam = add("Camera", bpy.data.cameras.new("Camera"))
    cam.data.lens = 85
    sc.camera = cam

    def light(name, power, size, color):
        ld = bpy.data.lights.new(name, 'AREA')
        ld.energy, ld.size, ld.color = power, size, color
        return add(name, ld)

    key = light("Key", 5200, 14.0, (1.0, 0.95, 0.88))
    fill = light("Fill", 1200, 16.0, (0.86, 0.92, 1.0))
    rim = light("Rim", 3000, 12.0, (0.90, 0.97, 1.0))

    # floor that only catches shadows, hovering pet sits slightly above it
    me = bpy.data.meshes.new("Floor")
    me.from_pydata([(-60, -60, 0), (60, -60, 0), (60, 60, 0), (-60, 60, 0)], [], [(0, 1, 2, 3)])
    floor = add("Floor", me)
    floor.location.z = -0.35
    floor.is_shadow_catcher = True

    # blocky avatar-sized dummy for scale (render only, 5 studs tall)
    grey = bpy.data.materials.new("Dummy")
    grey.use_nodes = True
    grey.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.55, 0.55, 0.52, 1.0)
    dv, df = [], []
    for cx, cz, sx, sy, sz in ((-0.5, 1, 1, 1, 2), (0.5, 1, 1, 1, 2), (0, 3, 2, 1, 2),
                               (-1.5, 3, 1, 1, 2), (1.5, 3, 1, 1, 2), (0, 4.6, 1.2, 1.2, 1.2)):
        b = len(dv)
        dv += [(cx + sx / 2 * i, sy / 2 * j, cz + sz / 2 * k) for i in (-1, 1) for j in (-1, 1) for k in (-1, 1)]
        df += [[b + q for q in f] for f in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3))]
    dm = bpy.data.meshes.new("Dummy")
    dm.from_pydata(dv, [], df)
    dm.materials.append(grey)
    dummy = add("Scale_Dummy", dm)
    dummy.location = (lo.x + 0.3, 1.0, floor.location.z)
    dummy.rotation_euler = (0, 0, math.radians(-25))

    world = bpy.data.worlds.new("Studio")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.80, 0.81, 0.83, 1.0)
    bg.inputs["Strength"].default_value = 1.0
    sc.world = world

    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = SPP
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 6
    sc.render.resolution_x = sc.render.resolution_y = RES
    sc.render.film_transparent = False
    sc.render.image_settings.file_format = 'PNG'
    sc.view_settings.view_transform = 'Standard'
    try:
        sc.view_settings.look = 'None'
    except TypeError:
        pass

    fov = 2 * math.atan(18 / cam.data.lens)
    dist = radius / math.sin(fov / 2) * 0.80
    os.makedirs(os.path.join(OUT, "renders"), exist_ok=True)
    for name, (az, el, ds) in VIEWS.items():
        if ONLY and name not in ONLY:
            continue
        cam.location = orbit(centre, az, el, dist * ds)
        aim(cam, centre)
        for ob, daz, lel, d in ((key, -42, 46, radius * 2.2), (fill, 55, 14, radius * 2.4), (rim, 158, 40, radius * 2.2)):
            ob.location = orbit(centre, az + daz, lel, d)
            aim(ob, centre)
        sc.render.filepath = os.path.join(OUT, "renders", name + ".png")
        bpy.ops.render.render(write_still=True)
        bloom(sc.render.filepath)
        print("RENDERED", name)


if __name__ == "__main__":
    main()
