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
}


def orbit(c, az, el, d):
    a, e = math.radians(az), math.radians(el)
    return c + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * d


def aim(ob, target):
    ob.rotation_euler = (target - ob.location).to_track_quat('-Z', 'Y').to_euler()


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

    key = light("Key", 2100, 6.0, (1.0, 0.95, 0.88))
    fill = light("Fill", 550, 8.0, (0.86, 0.92, 1.0))
    rim = light("Rim", 1900, 5.0, (0.90, 0.97, 1.0))

    # floor that only catches shadows, hovering pet sits slightly above it
    me = bpy.data.meshes.new("Floor")
    me.from_pydata([(-60, -60, 0), (60, -60, 0), (60, 60, 0), (-60, 60, 0)], [], [(0, 1, 2, 3)])
    floor = add("Floor", me)
    floor.location.z = -0.45
    floor.is_shadow_catcher = True

    world = bpy.data.worlds.new("Studio")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.085, 0.09, 0.10, 1.0)
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
    sc.view_settings.view_transform = 'AgX'
    try:
        sc.view_settings.look = 'AgX - Punchy'
    except TypeError:
        pass

    fov = 2 * math.atan(18 / cam.data.lens)
    dist = radius / math.sin(fov / 2) * 0.72
    os.makedirs(os.path.join(OUT, "renders"), exist_ok=True)
    for name, (az, el, ds) in VIEWS.items():
        if ONLY and name not in ONLY:
            continue
        cam.location = orbit(centre, az, el, dist * ds)
        aim(cam, centre)
        for ob, daz, lel, d in ((key, -42, 42, 9.0), (fill, 55, 12, 10.0), (rim, 158, 38, 9.0)):
            ob.location = orbit(centre, az + daz, lel, d)
            aim(ob, centre)
        sc.render.filepath = os.path.join(OUT, "renders", name + ".png")
        bpy.ops.render.render(write_still=True)
        print("RENDERED", name)


if __name__ == "__main__":
    main()
