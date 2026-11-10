"""Ancient Lantern Blowfish - procedural Blender build script.

Run with a Python that has the `bpy` module (Blender 4.2+/5.x):
    python build_blowfish.py
Writes the .blend, .fbx, .glb and stats.json next to this file.

Conventions: Z up, the fish faces -Y, 1 unit = 1 Roblox stud,
origin on the ground plane under the body centre (the lowest floating relic touches it).
"""
import json
import math
import os

import bpy
import bmesh  # must follow bpy
from mathutils import Matrix, Vector

OUT = os.path.dirname(os.path.abspath(__file__))
NAME = "AncientLanternBlowfish"
SCALE = 2.0   # studs per modelling unit; the pet is boss sized next to an avatar
rad = math.radians

# --------------------------------------------------------------------------
# Palette
# --------------------------------------------------------------------------
def hexc(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c) + (1.0,)


# name: (hex, metallic, roughness, emission strength)
PALETTE = {
    "Teal_Deep":     ("#0E5257", 0.0, 0.70, 0.0),
    "Teal_Mid":      ("#15807C", 0.0, 0.70, 0.0),
    "Teal_Light":    ("#35B8A8", 0.0, 0.70, 0.0),
    "Abyss":         ("#072C33", 0.0, 0.70, 0.0),
    "Gold":          ("#E2A52B", 0.2, 0.50, 0.0),
    "Gold_Dark":     ("#9C6A18", 0.2, 0.55, 0.0),
    "Spike_Crystal": ("#2ED6C4", 0.0, 0.35, 0.12),
    "Crystal_Glow":  ("#3DEBD8", 0.0, 0.30, 1.0),
    "Eye_Glow":      ("#FFDF2E", 0.0, 0.40, 0.9),
    "Eye_Black":     ("#0A0F10", 0.0, 0.30, 0.0),
    "Tooth":         ("#F3EEDC", 0.0, 0.50, 0.0),
    "Bubble":        ("#D8FAF5", 0.0, 0.20, 0.0),
}

# --------------------------------------------------------------------------
# Transform helpers
# --------------------------------------------------------------------------
def T(x=0.0, y=0.0, z=0.0):
    return Matrix.Translation((x, y, z))


def R(axis, deg):
    return Matrix.Rotation(rad(deg), 4, axis)


def S(x=1.0, y=1.0, z=1.0):
    return Matrix.Diagonal((x, y, z, 1.0))


def frame(o, X, Y, Z):
    return Matrix(((X.x, Y.x, Z.x, o.x), (X.y, Y.y, Z.y, o.y), (X.z, Y.z, Z.z, o.z), (0, 0, 0, 1)))


def frame_z(o, zdir, up=Vector((0, 0, 1))):
    """Frame whose local +Z points along zdir and local +Y follows `up`."""
    Z = Vector(zdir).normalized()
    X = Vector(up).cross(Z)
    if X.length < 1e-4:
        X = Vector((1, 0, 0))
    X.normalize()
    return frame(Vector(o), X, Z.cross(X), Z)


# --------------------------------------------------------------------------
# Geometry generators: all return (verts, faces)
# --------------------------------------------------------------------------
def solid(geo, bevel=0.0, segs=1, min_angle=25.0):
    """Fix normals and chamfer hard edges."""
    verts, faces = geo
    bm = bmesh.new()
    bv = [bm.verts.new(v) for v in verts]
    for f in faces:
        try:
            bm.faces.new([bv[i] for i in f])
        except ValueError:
            pass
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    if bevel > 0:
        edges = [e for e in bm.edges
                 if len(e.link_faces) == 2 and e.calc_face_angle(0) > rad(min_angle)]
        bmesh.ops.bevel(bm, geom=edges, offset=bevel, offset_type='OFFSET', segments=segs,
                        profile=0.5, affect='EDGES', clamp_overlap=True)
    bm.verts.index_update()
    out = ([v.co.copy() for v in bm.verts], [[v.index for v in f.verts] for f in bm.faces])
    bm.free()
    return out


def lathe(profile, n, rot=0.0, caps=True, loop=False):
    """Revolve (radius, z) profile around Z with n sides. radius 0 makes a pole."""
    verts, rings = [], []
    for r, z in profile:
        if r <= 1e-6:
            verts.append((0.0, 0.0, z))
            rings.append([len(verts) - 1])
        else:
            ids = []
            for j in range(n):
                a = rad(rot) + 2 * math.pi * j / n
                verts.append((r * math.cos(a), r * math.sin(a), z))
                ids.append(len(verts) - 1)
            rings.append(ids)
    faces = []
    pairs = list(zip(rings[:-1], rings[1:]))
    if loop:
        pairs.append((rings[-1], rings[0]))
    for a, b in pairs:
        for j in range(n):
            j2 = (j + 1) % n
            if len(a) == 1 and len(b) == 1:
                continue
            if len(a) == 1:
                faces.append([a[0], b[j], b[j2]])
            elif len(b) == 1:
                faces.append([a[j], a[j2], b[0]])
            else:
                faces.append([a[j], a[j2], b[j2], b[j]])
    if caps and not loop:
        if len(rings[0]) > 1:
            faces.append(list(reversed(rings[0])))
        if len(rings[-1]) > 1:
            faces.append(list(rings[-1]))
    return verts, faces


SQ = math.sqrt(2.0)


def sq_lathe(profile, **kw):
    """Square lathe; profile uses half-widths, sides axis aligned."""
    return lathe([(hw * SQ, z) for hw, z in profile], 4, rot=45.0, **kw)


def prism(poly, z0, z1):
    n = len(poly)
    verts = [(x, y, z0) for x, y in poly] + [(x, y, z1) for x, y in poly]
    faces = [[j, (j + 1) % n, n + (j + 1) % n, n + j] for j in range(n)]
    faces.append(list(reversed(range(n))))
    faces.append(list(range(n, 2 * n)))
    return verts, faces


def box(sx, sy, sz):
    hx, hy = sx / 2, sy / 2
    return prism([(-hx, -hy), (hx, -hy), (hx, hy), (-hx, hy)], -sz / 2, sz / 2)


def torus(Rm, r, n_major=10, n_minor=6):
    verts, faces = [], []
    for i in range(n_major):
        a = 2 * math.pi * i / n_major
        for k in range(n_minor):
            b = 2 * math.pi * k / n_minor
            rr = Rm + r * math.cos(b)
            verts.append((rr * math.cos(a), rr * math.sin(a), r * math.sin(b)))
    for i in range(n_major):
        i2 = (i + 1) % n_major
        for k in range(n_minor):
            k2 = (k + 1) % n_minor
            faces.append([i * n_minor + k, i2 * n_minor + k, i2 * n_minor + k2, i * n_minor + k2])
    return verts, faces


def arc(Rr, a0, a1, k):
    return [(Rr * math.cos(rad(a0 + (a1 - a0) * i / k)), Rr * math.sin(rad(a0 + (a1 - a0) * i / k)))
            for i in range(k + 1)]


def scaled(poly, s, about=(0.0, 0.0)):
    return [(about[0] + (x - about[0]) * s, about[1] + (y - about[1]) * s) for x, y in poly]


# --------------------------------------------------------------------------
# Bucketed mesh assembly: one final object per (region, material)
# --------------------------------------------------------------------------
class Kit:
    def __init__(self):
        self.buckets = {}

    def add(self, region, mat, geo, M=None, smooth=False):
        verts, faces = geo
        M = M if M is not None else Matrix.Identity(4)
        flip = M.determinant() < 0
        bk = self.buckets.setdefault((region, mat), {"v": [], "f": [], "s": []})
        remap = {}
        for f in faces:
            idx = []
            for i in f:
                if i not in remap:
                    remap[i] = len(bk["v"])
                    bk["v"].append(tuple(M @ Vector(verts[i])))
                idx.append(remap[i])
            if flip:
                idx.reverse()
            bk["f"].append(idx)
            bk["s"].append(smooth)


kit = Kit()

# --------------------------------------------------------------------------
# Body: faceted squircle lattice with flat caps and a sawtooth belly line
# --------------------------------------------------------------------------
RX, RY, RZ, EXP = 1.30, 1.20, 1.08, 0.8
LATS = [-78, -62, -42, -20, 2, 24, 44, 62, 78]
NL = 16
OCC = set()      # lattice facets already used by a feature


def sp(c, e):
    return math.copysign(abs(c) ** e, c)


def body_pt(u, v):
    cv = sp(math.cos(v), EXP)
    x = RX * cv * sp(math.cos(u), EXP)
    y = RY * cv * sp(math.sin(u), EXP)
    z = RZ * sp(math.sin(v), EXP)
    if z < 0:
        z *= 0.92            # flatter belly
    if y > 0:                # gentle taper toward the tail
        t = (y / RY) ** 2
        x *= 1 - 0.14 * t
        z *= 1 - 0.10 * t
    return Vector((x, y, z))


def col_u(j):
    return rad(-90 - 11.25 + 22.5 * j)


# facet column 0 faces the front (-Y), 4 = +X, 8 = back, 12 = -X
RINGS = [[body_pt(col_u(j), rad(lat)) for j in range(NL)] for lat in LATS]
Z_TOP = RINGS[-1][0].z


def facet(b, j):
    """Centre and outward normal of lattice facet (band b, column j)."""
    j %= NL
    p = [RINGS[b][j], RINGS[b][(j + 1) % NL], RINGS[b + 1][(j + 1) % NL], RINGS[b + 1][j]]
    c = (p[0] + p[1] + p[2] + p[3]) / 4
    n = (p[2] - p[0]).cross(p[3] - p[1]).normalized()
    if n.dot(c) < 0:
        n = -n
    return c, n


def on_facet(b, j, sink=0.0, toward=None, blend=0.0):
    c, n = facet(b, j)
    if toward is not None:
        n = (n * (1 - blend) + Vector(toward) * blend).normalized()
    return frame_z(c - n * sink, n)


def build_body():
    verts, idx = [], []
    for ring in RINGS:
        idx.append(list(range(len(verts), len(verts) + NL)))
        verts.extend(ring)
    zig = {2: ("Teal_Light", "Teal_Mid")}
    band_mat = {0: "Teal_Light", 1: "Teal_Light", 3: "Teal_Mid", 4: "Teal_Mid", 5: "Teal_Mid",
                6: "Teal_Deep", 7: "Teal_Deep"}
    mids = {}
    for b in zig:
        mids[b] = []
        for j in range(NL):
            verts.append((RINGS[b + 1][j] + RINGS[b + 1][(j + 1) % NL]) / 2)
            mids[b].append(len(verts) - 1)
    by_mat = {}

    def put(mat, f):
        c = sum((verts[i] for i in f), Vector()) / len(f)
        n = (verts[f[1]] - verts[f[0]]).cross(verts[f[2]] - verts[f[1]])
        by_mat.setdefault(mat, []).append(f if n.dot(c) > 0 else f[::-1])

    for b in range(len(LATS) - 1):
        L, U = idx[b], idx[b + 1]
        for j in range(NL):
            j2 = (j + 1) % NL
            if b in zig:
                lo, up = zig[b]
                m = mids[b][j]
                put(lo, [L[j], L[j2], m])
                put(up, [L[j], m, U[j]])
                put(up, [L[j2], U[j2], m])
            else:
                lower = [L[j], mids[b - 1][j], L[j2]] if (b - 1) in zig else [L[j], L[j2]]
                put(band_mat[b], lower + [U[j2], U[j]])
    by_mat["Teal_Light"].append(idx[0][::-1])
    by_mat["Teal_Deep"].append(idx[-1][:])
    for mat, faces in by_mat.items():
        kit.add("Body", mat, (verts, faces))


def build_belt():
    """Gold headband that also hides the colour seam, with a studded rim."""
    la, lb = rad(40), rad(49)
    verts, faces = [], []
    for j in range(NL):
        pa, pb = body_pt(col_u(j), la), body_pt(col_u(j), lb)
        verts += [pa * 1.045, pb * 1.045, pa * 0.97, pb * 0.97]
    for j in range(NL):
        a, b = 4 * j, 4 * ((j + 1) % NL)
        faces += [[a, b, b + 1, a + 1], [a + 1, b + 1, b + 3, a + 3], [a + 3, b + 3, b + 2, a + 2], [a + 2, b + 2, b, a]]
    kit.add("Ornaments", "Gold", solid((verts, faces)))
    for j in range(1, NL):
        p = body_pt(col_u(j) + rad(11.25), rad(44.5)) * 1.045
        kit.add("Ornaments", "Gold_Dark", solid(box(0.085, 0.085, 0.07)), frame_z(p, p) @ R('Z', 45))
    # buckle on the forehead
    p = body_pt(rad(-90), rad(45))
    M = frame_z(p * 1.03, p + Vector((0, -0.25, 0)))
    kit.add("Ornaments", "Gold", solid(lathe([(0.30, -0.06), (0.30, 0.06), (0.25, 0.09)], 8, rot=22.5)), M)
    kit.add("Ornaments", "Gold_Dark", solid(lathe([(0.20, 0.08), (0.20, 0.105)], 8, rot=22.5)), M)
    kit.add("Ornaments", "Crystal_Glow", solid(sq_lathe([(0.10, 0.10), (0.10, 0.125), (0.0, 0.17)])), M @ R('Z', 45))
    OCC.update({(6, 0), (5, 0)})


# --------------------------------------------------------------------------
# Crystal spikes and scale shingles
# --------------------------------------------------------------------------
SPIKES = {  # band: (columns, base radius, height)
    7: ([2, 4, 6, 10, 12, 14], 0.105, 0.40),
    6: ([3, 5, 7, 9, 11, 13], 0.130, 0.52),
    5: ([2, 4, 6, 10, 12, 14], 0.140, 0.54),
    4: ([3, 5, 7, 9, 11, 13], 0.140, 0.50),
    3: ([2, 6, 10, 14], 0.130, 0.44),
    2: ([1, 3, 5, 7, 9, 11, 13, 15], 0.125, 0.42),
    1: ([0, 2, 4, 6, 8, 10, 12, 14], 0.105, 0.34),
}


def build_spikes():
    for b, (cols, r, h) in SPIKES.items():
        for j in cols:
            M = on_facet(b, j, sink=0.02) @ R('Z', 36 * ((b + j) % 2))
            kit.add("Spikes", "Gold", solid(lathe([(1.3 * r, 0), (1.3 * r, 0.06), (r, 0.09)], 5)), M)
            if (b, j) == (5, 10):     # one snapped-off shard
                prof = [(r, 0.09), (0.86 * r, 0.40 * h), (0.0, 0.47 * h)]
            else:
                prof = [(r, 0.09), (0.80 * r, 0.55 * h), (0.0, h)]
            kit.add("Spikes", "Spike_Crystal", solid(lathe(prof, 5)), M)
            OCC.add((b, j))


def build_scales():
    tile = [(-0.14, 0.10), (0.14, 0.10), (0.0, -0.15)]
    for b in (3, 4, 5, 6):
        for j in range(NL):
            if (b, j) in OCC:
                continue
            mat = "Teal_Light" if b == 6 else "Teal_Deep"
            kit.add("Scales", mat, solid(prism(tile, -0.03, 0.045)),
                    on_facet(b, j) @ T(0, -0.02 if b == 6 else 0.0, 0) @ R('X', 10))


# --------------------------------------------------------------------------
# Face
# --------------------------------------------------------------------------
def build_eye(side):
    c, n = facet(4, 1)
    n = (n * 0.68 + Vector((0, -1, 0)) * 0.32).normalized()
    M = S(side) @ frame_z(c - n * 0.01, n)
    kit.add("Face", "Abyss", solid(lathe(
        [(0.30, 0.02), (0.30, 0.09), (0.34, 0.12), (0.40, 0.12), (0.43, 0.08), (0.43, -0.22)],
        8, rot=22.5, caps=False)), M)
    kit.add("Face", "Eye_Glow", solid(lathe([(0.30, 0.03), (0.27, 0.10), (0.0, 0.118)], 8, rot=22.5)), M)
    slit = [(-0.03, -0.20), (0.03, -0.20), (0.055, 0.0), (0.03, 0.20), (-0.03, 0.20), (-0.055, 0.0)]
    kit.add("Face", "Eye_Black", solid(prism(slit, 0.09, 0.14)), M @ T(-0.05, -0.05, 0) @ R('Z', 8))
    # heavy lid slanted down toward the nose: half asleep, half furious
    tilt = R('Z', 17)
    a0 = math.degrees(math.asin(0.03 / 0.46))
    kit.add("Face", "Teal_Deep", solid(prism(arc(0.46, a0, 180 - a0, 6), -0.20, 0.205)), M @ tilt)
    kit.add("Face", "Teal_Deep", solid(prism(arc(0.45, 228, 312, 4), -0.20, 0.175)), M)
    brow = [(-0.42, -0.07), (-0.34, 0.07), (0.30, 0.11), (0.46, 0.02), (0.32, -0.07)]
    kit.add("Face", "Gold", solid(prism(brow, -0.22, 0.24)), M @ tilt @ T(0.0, 0.50, 0))
    OCC.update({(4, 1), (4, 15), (5, 1), (5, 15), (3, 1), (3, 15)})


def build_mouth():
    M = on_facet(3, 0, sink=0.02, toward=(0, -1, 0), blend=0.5) @ S(1.3, 1.0, 1.0)
    kit.add("Face", "Teal_Deep", solid(lathe(
        [(0.27, -0.12), (0.27, 0.06), (0.245, 0.16), (0.20, 0.195), (0.155, 0.16), (0.145, 0.06)],
        8, rot=22.5, caps=False)), M)
    kit.add("Face", "Eye_Black", solid(lathe([(0.145, 0.06), (0.0, 0.06)], 8, rot=22.5)), M)
    fang = lathe([(0.036, 0.0), (0.0, 0.13)], 4)
    for x in (-0.085, -0.03, 0.03, 0.085):
        kit.add("Face", "Tooth", solid(fang), M @ T(x, 0.135 - abs(x) * 0.25, 0.15) @ R('X', 90))
    for x in (-0.06, 0.0, 0.06):
        kit.add("Face", "Tooth", solid(fang), M @ T(x, -0.135 + abs(x) * 0.25, 0.15) @ R('X', -90) @ S(1, 1, 0.8))
    OCC.update({(3, 0), (4, 0)})


# --------------------------------------------------------------------------
# Spiny fans: side fins, dorsal crest, tail
# --------------------------------------------------------------------------
def fan(region, M, rays, half=0.045, mem="Teal_Deep", root=0.16):
    """Scalloped membrane in local XY with dark spines and gold tips."""
    pts = [(-0.10, -root)]
    for i, (a, L) in enumerate(rays):
        if i > 0:
            pa, pL = rays[i - 1]
            am, Lm = rad((a + pa) / 2), min(L, pL) * 0.60
            pts.append((Lm * math.cos(am), Lm * math.sin(am)))
        pts.append((0.84 * L * math.cos(rad(a)), 0.84 * L * math.sin(rad(a))))
    pts.append((-0.10, root))
    kit.add(region, mem, solid(prism(pts, -half, half)), M)
    for a, L in rays:
        Mr = M @ R('Z', a)
        rib = [(0.0, -0.05), (0.8 * L, -0.024), (0.8 * L, 0.024), (0.0, 0.05)]
        kit.add(region, "Abyss", solid(prism(rib, -half - 0.03, half + 0.03)), Mr)
        tip = [(0.8 * L, -0.024), (L + 0.10, 0.0), (0.8 * L, 0.024)]
        kit.add(region, "Gold", solid(prism(tip, -half - 0.03, half + 0.03)), Mr)


def build_fins():
    c, n = facet(3, 4)
    d = Vector((0.80, 0.50, 0.10)).normalized()
    Zf = d.cross(Vector((0.0, 0.18, 1.0))).normalized()
    base = frame(c - n * 0.06, d, Zf.cross(d), Zf)
    rays = [(-56, 0.85), (-28, 1.15), (0, 1.35), (28, 1.20), (56, 0.90)]
    for side in (1, -1):
        M = S(side) @ base
        fan("Fins", M, rays)
        cuff = M @ R('Y', 90) @ T(0, 0, -0.08)
        kit.add("Fins", "Gold", solid(lathe(
            [(0.27, -0.10), (0.27, 0.05), (0.21, 0.11), (0.21, 0.17), (0.14, 0.20)], 8, rot=22.5)), cuff)
        kit.add("Fins", "Gold_Dark", solid(lathe([(0.225, 0.115), (0.225, 0.155)], 8, rot=22.5, caps=False)), cuff)
    OCC.update({(3, 4), (3, 12), (4, 4), (4, 12), (3, 3), (3, 5), (3, 11), (3, 13)})


def build_crest():
    c, n = facet(6, 8)
    X = Vector((0, 0.42, 0.91)).normalized()
    Y = Vector((0, 0.91, -0.42)).normalized()
    fan("Crest", frame(c - n * 0.10, X, Y, X.cross(Y)),
        [(-52, 0.70), (-22, 0.95), (8, 1.10), (36, 0.95)], half=0.05, root=0.2)
    OCC.update({(6, 8), (5, 8), (7, 8)})


def build_tail():
    root = body_pt(rad(90), rad(2))
    Ms = T(0, root.y - 0.12, 0.04) @ R('X', -90) @ S(1.0, 1.25, 1.0)
    kit.add("Tail", "Teal_Mid", solid(lathe(
        [(0.38, 0.0), (0.31, 0.20), (0.23, 0.44), (0.21, 0.52)], 8, rot=22.5)), Ms)
    kit.add("Tail", "Gold", solid(lathe(
        [(0.315, 0.20), (0.35, 0.215), (0.34, 0.30), (0.285, 0.315)], 8, rot=22.5, caps=False)), Ms)
    kit.add("Tail", "Gold_Dark", solid(lathe(
        [(0.262, 0.345), (0.285, 0.355), (0.277, 0.40), (0.25, 0.41)], 8, rot=22.5, caps=False)), Ms)
    fan("Tail", frame(Vector((0, root.y + 0.34, 0.04)), Vector((0, 1, 0)), Vector((0, 0, 1)), Vector((1, 0, 0))),
        [(-62, 1.05), (-34, 1.25), (0, 0.95), (34, 1.30), (62, 1.10)], half=0.06, root=0.2)
    OCC.update({(3, 8), (4, 8), (3, 7), (3, 9)})


# --------------------------------------------------------------------------
# Ancient ornaments on the body
# --------------------------------------------------------------------------
def build_ornaments():
    # stepped gold crown that seats the lantern stalk
    Mc = T(0, 0, Z_TOP)
    kit.add("Ornaments", "Gold", solid(lathe(
        [(0.45, -0.07), (0.45, 0.07), (0.38, 0.10), (0.38, 0.16), (0.27, 0.20), (0.27, 0.245), (0.21, 0.265)],
        8, rot=22.5)), Mc)
    kit.add("Ornaments", "Gold_Dark", solid(lathe(
        [(0.385, 0.105), (0.40, 0.115), (0.40, 0.15), (0.385, 0.16)], 8, rot=22.5, caps=False)), Mc)
    for k in range(8):
        kit.add("Ornaments", "Crystal_Glow", solid(box(0.14, 0.03, 0.045)),
                Mc @ R('Z', 45 * k - 90) @ T(0, -0.45 * math.cos(rad(22.5)), 0.02))
    # square-spiral glyph carved in gold on each flank
    segs = [(-0.20, -0.20, 0.20, -0.135), (0.135, -0.20, 0.20, 0.20), (-0.20, 0.135, 0.20, 0.20),
            (-0.20, -0.05, -0.135, 0.20), (-0.20, -0.05, 0.05, 0.015), (-0.015, -0.05, 0.05, 0.08)]
    for sx in (1, -1):
        M = S(sx) @ on_facet(4, 6)
        for x0, y0, x1, y1 in segs:
            kit.add("Ornaments", "Gold", solid(prism([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], -0.03, 0.04)), M)
    OCC.update({(4, 6), (4, 10)})


# --------------------------------------------------------------------------
# Floating relics: broken pillars, crystal shards, bubbles
# --------------------------------------------------------------------------
def build_relics():
    pillars = [  # angle, radius, z, tilt x, tilt y, scale
        (20, 3.55, 1.05, 14, -8, 1.00), (68, 3.35, -0.55, -12, 9, 1.20), (118, 3.25, 1.55, 9, 12, 0.90),
        (165, 3.55, -0.25, -8, -14, 1.10), (215, 3.10, 0.95, 12, 6, 0.95), (322, 3.05, -0.65, -10, -7, 1.05),
    ]
    for ang, rr, z, tx, ty, s in pillars:
        M = (T(rr * math.cos(rad(ang)), rr * math.sin(rad(ang)), z) @ R('Z', ang * 1.7)
             @ R('X', tx) @ R('Y', ty) @ S(s, s, s))
        kit.add("Relics", "Gold", solid(sq_lathe([(0.0, -0.80), (0.12, -0.45), (0.16, 0.25), (0.16, 0.33)])),
                M @ R('X', 5))
        kit.add("Relics", "Gold", solid(sq_lathe([(0.17, 0.33), (0.28, 0.40), (0.28, 0.53)])), M)
        kit.add("Relics", "Gold_Dark", solid(sq_lathe([(0.178, 0.16), (0.178, 0.24)])), M)
    shard = lathe([(0.0, -0.24), (0.085, -0.05), (0.06, 0.10), (0.0, 0.26)], 5)
    for x, y, z, a in ((2.95, 0.3, 2.05, 20), (-2.9, 0.5, 1.95, -25), (-1.9, 2.3, 2.3, 15), (1.7, 2.6, -0.7, -30)):
        kit.add("Relics", "Crystal_Glow", solid(shard), T(x, y, z) @ R('X', a) @ R('Y', a * 0.6))
    for x, y, z, r in ((-1.45, -1.9, 0.55, 0.09), (-1.7, -2.05, 1.0, 0.13), (-1.55, -2.2, 1.5, 0.07),
                       (1.55, -1.7, -0.35, 0.10), (1.8, -1.85, 0.15, 0.06), (-2.3, 0.9, 1.55, 0.11),
                       (2.35, 1.3, 1.25, 0.08)):
        kit.add("Relics", "Bubble", solid(lathe(
            [(0.0, -r), (0.75 * r, -0.66 * r), (r, 0.0), (0.75 * r, 0.66 * r), (0.0, r)], 8)), T(x, y, z))


# --------------------------------------------------------------------------
# Lantern stalk
# --------------------------------------------------------------------------
KNUCKLES = [(0.00, Z_TOP + 0.21), (0.10, 1.80), (-0.08, 2.38), (-0.55, 2.98),
            (-1.15, 3.32), (-1.78, 3.36), (-2.25, 3.14)]
STALK_R = [0.170, 0.155, 0.140, 0.125, 0.110, 0.098, 0.088]
TIP = Vector((0, KNUCKLES[-1][0], KNUCKLES[-1][1]))
RING_A_Z = TIP.z - 0.17      # stalk hook ring centre
RING_B_Z = RING_A_Z - 0.11   # lantern hanging ring centre
LS = 1.2                     # lantern scale
LANTERN = Vector((0, TIP.y, RING_B_Z - 0.90 * LS))


def build_stalk():
    P = [Vector((0, y, z)) for y, z in KNUCKLES]
    XU = Vector((1, 0, 0))
    for i in range(len(P) - 1):
        d = P[i + 1] - P[i]
        L = d.length
        r0, r1 = STALK_R[i], STALK_R[i + 1]
        kit.add("Stalk", "Teal_Deep" if i % 2 == 0 else "Teal_Mid", solid(lathe(
            [(r0 * 0.8, 0.0), (r0, 0.16 * L), (r1, 0.84 * L), (r1 * 0.8, L)], 6), 0.012),
            frame_z(P[i], d, up=XU))
    for i in range(1, len(P)):
        d = (P[i] - P[i - 1]).normalized()
        if i < len(P) - 1:
            d = (d + (P[i + 1] - P[i]).normalized()).normalized()
        rr = STALK_R[i] * 1.5
        h = 0.055
        kit.add("Stalk", "Gold" if i < len(P) - 1 else "Teal_Light", solid(lathe(
            [(rr * 0.72, -h), (rr, -h * 0.45), (rr, h * 0.45), (rr * 0.72, h)], 8, rot=22.5)),
            frame_z(P[i], d, up=XU))
    # glowing bands leading the eye toward the lantern
    for i in (3, 4, 5):
        mid = (P[i] + P[i + 1]) / 2
        r = (STALK_R[i] + STALK_R[i + 1]) / 2 + 0.006
        kit.add("Stalk", "Crystal_Glow", solid(lathe([(r, -0.03), (r, 0.03)], 6, caps=False)),
                frame_z(mid, P[i + 1] - P[i], up=XU))
    # hook ring under the tip
    kit.add("Stalk", "Gold", solid(torus(0.09, 0.027, 10, 6)), T(0, TIP.y, RING_A_Z) @ R('Y', 90))


# --------------------------------------------------------------------------
# Ancient lantern
# --------------------------------------------------------------------------
def build_lantern():
    G = "Lantern"
    M0 = T(*LANTERN) @ S(LS, LS, LS)

    def side(k):   # maps a prism built in XY onto lantern side k (XZ plane, +z -> outward)
        return M0 @ R('Z', 90 * k)

    # hanging ring + finial
    kit.add(G, "Gold", solid(torus(0.09, 0.026, 10, 6)), M0 @ T(0, 0, 0.90) @ R('X', 90))
    kit.add(G, "Gold", solid(lathe([(0.075, 0.71), (0.10, 0.745), (0.065, 0.79), (0.035, 0.835)], 8), 0.006), M0)
    # stepped roof
    kit.add(G, "Teal_Deep", solid(sq_lathe([(0.21, 0.63), (0.10, 0.72)]), 0.012), M0)
    kit.add(G, "Gold", solid(sq_lathe([(0.285, 0.575), (0.285, 0.635)]), 0.014), M0)
    kit.add(G, "Teal_Deep", solid(sq_lathe([(0.45, 0.435), (0.25, 0.58)]), 0.014), M0)
    kit.add(G, "Gold", solid(sq_lathe([(0.51, 0.355), (0.51, 0.44)]), 0.018), M0)
    # glowing triangles engraved into each roof face
    slope = Vector((0.0, 0.20, 0.145)).normalized()      # up-slope direction of the -Y... face
    for k in range(4):
        Mk = M0 @ R('Z', 90 * k)
        nrm = Vector((0, -0.145, 0.20)).normalized()
        up = Vector((0, 0.20, 0.145)).normalized()
        F = frame(Vector((0, -0.35, 0.5075)) + nrm * 0.002, Vector((1, 0, 0)).cross(nrm).cross(nrm) * -1, up, nrm)
        tri = [(-0.13, -0.05), (0.13, -0.05), (0.0, 0.06)]
        kit.add(G, "Crystal_Glow", solid(prism(tri, -0.01, 0.012)), Mk @ F)
    # upturned eaves at the corners
    horn = [(0.0, -0.035), (0.17, -0.01), (0.27, 0.10), (0.225, 0.125), (0.13, 0.045), (0.0, 0.045)]
    for k in range(4):
        dgn = Vector((math.cos(rad(45 + 90 * k)), math.sin(rad(45 + 90 * k)), 0))
        F = frame(dgn * 0.60 + Vector((0, 0, 0.40)), dgn, Vector((0, 0, 1)), dgn.cross(Vector((0, 0, 1))))
        kit.add(G, "Teal_Light", solid(prism(horn, -0.04, 0.04), 0.012), M0 @ F)
    # corner posts with patina collars
    for sx in (-1, 1):
        for sy in (-1, 1):
            Mp = M0 @ T(0.375 * sx, 0.375 * sy, 0)
            kit.add(G, "Gold", solid(box(0.085, 0.085, 0.74), 0.012), Mp)
            kit.add(G, "Teal_Light", solid(box(0.115, 0.115, 0.06), 0.012), Mp)
    # rails and angular gussets framing each window
    gus = [(0.335, 0.30), (0.335 - 0.17, 0.30), (0.335, 0.30 - 0.17)]
    for k in range(4):
        Ms = side(k) @ T(0, -0.375, 0)
        for sz in (-1, 1):
            kit.add(G, "Gold_Dark", solid(box(0.67, 0.06, 0.07), 0.01), Ms @ T(0, 0, 0.325 * sz))
            for sx in (-1, 1):
                kit.add(G, "Gold", solid(prism(gus, -0.025, 0.025)), Ms @ S(sx, 1, sz) @ R('X', 90))
    # weathered stone base with engraved, glowing motifs
    kit.add(G, "Teal_Deep", solid(sq_lathe([(0.49, -0.51), (0.49, -0.36)]), 0.018), M0)
    for k in range(4):
        Ms = side(k) @ T(0, -0.49, -0.435) @ R('X', 90)
        kit.add(G, "Crystal_Glow", solid(sq_lathe([(0.04, -0.008), (0.04, 0.012)])), Ms @ R('Z', 45))
        for sx in (-1, 1):
            meander = [(0.13, -0.045), (0.36, -0.045), (0.36, 0.045), (0.22, 0.045), (0.22, 0.01),
                       (0.325, 0.01), (0.325, -0.012), (0.13, -0.012)]
            kit.add(G, "Crystal_Glow", solid(prism(meander, -0.008, 0.012)), Ms @ S(sx))
    # underside, bead and pendant shard
    kit.add(G, "Gold", solid(sq_lathe([(0.40, -0.51), (0.21, -0.61), (0.21, -0.635)]), 0.012), M0)
    kit.add(G, "Teal_Light", solid(lathe([(0.06, -0.635), (0.10, -0.67), (0.06, -0.705)], 8), 0.0), M0)
    kit.add(G, "Gold", solid(lathe([(0.0, -0.70), (0.028, -0.745), (0.0, -0.79)], 4)), M0)
    kit.add(G, "Crystal_Glow", solid(lathe([(0.0, -0.78), (0.065, -0.84), (0.045, -0.93), (0.0, -1.02)], 5)), M0)

    # crystal seat and luminous crystal cluster
    kit.add(G, "Gold", solid(lathe([(0.26, -0.36), (0.26, -0.315), (0.20, -0.285)], 8, rot=22.5), 0.008), M0)
    kit.add(G, "Crystal_Glow", solid(lathe(
        [(0.115, -0.30), (0.215, -0.10), (0.235, 0.07), (0.15, 0.24), (0.0, 0.325)], 6, rot=14)), M0)
    for (x, y, ang, axis, s) in ((0.185, 0.07, -24, 'Y', 1.0), (-0.16, -0.12, 27, 'Y', 0.8), (-0.03, 0.2, 24, 'X', 0.7)):
        kit.add(G, "Crystal_Glow", solid(lathe(
            [(0.045, 0.0), (0.075, 0.10), (0.06, 0.21), (0.0, 0.29)], 5)),
            M0 @ T(x, y, -0.31) @ R(axis, -ang) @ S(s, s, s))

    # ornamental danglers below each eave tip (front pair hangs longer)
    for k in range(4):
        dgn = Vector((math.cos(rad(45 + 90 * k)), math.sin(rad(45 + 90 * k)), 0))
        z = 0.50
        front = dgn.y < 0
        Md = M0 @ T(dgn.x * 0.845, dgn.y * 0.845, 0)
        for _ in range(3 if front else 2):
            kit.add(G, "Gold_Dark", solid(lathe([(0.0, z), (0.026, z - 0.045), (0.0, z - 0.09)], 4)), Md)
            z -= 0.085
        kit.add(G, "Teal_Deep", solid(lathe([(0.03, z), (0.055, z - 0.04), (0.055, z - 0.07), (0.03, z - 0.11)], 6), 0.006), Md)
        z -= 0.105
        kit.add(G, "Crystal_Glow", solid(lathe([(0.0, z), (0.05, z - 0.06), (0.03, z - 0.14), (0.0, z - 0.20)], 5)), Md)


# --------------------------------------------------------------------------
# Scene assembly
# --------------------------------------------------------------------------
def make_materials():
    mats = {}
    for name, (hx, metal, rough, emit) in PALETTE.items():
        m = bpy.data.materials.new("ALB_" + name)
        m.use_nodes = True
        bsdf = m.node_tree.nodes["Principled BSDF"]
        col = hexc(hx)
        bsdf.inputs["Base Color"].default_value = col
        bsdf.inputs["Metallic"].default_value = metal
        bsdf.inputs["Roughness"].default_value = rough
        if emit > 0:
            bsdf.inputs["Emission Color"].default_value = col
            bsdf.inputs["Emission Strength"].default_value = emit
        m.diffuse_color = col
        mats[name] = m
    return mats


def make_objects(mats):
    zmin = min(v[2] for bk in kit.buckets.values() for v in bk["v"])
    root = bpy.data.collections.new(NAME)
    bpy.context.scene.collection.children.link(root)
    cols, objs = {}, []
    for (region, mat), bk in sorted(kit.buckets.items()):
        mesh = bpy.data.meshes.new(f"ALB_{region}_{mat}")
        mesh.from_pydata([(x * SCALE, y * SCALE, (z - zmin) * SCALE) for x, y, z in bk["v"]], [], bk["f"])
        mesh.update()
        bm = bmesh.new()
        bm.from_mesh(mesh)
        for f, s in zip(bm.faces, bk["s"]):
            f.smooth = s
        for e in bm.edges:   # smooth only across gentle angles between smooth faces
            fs = e.link_faces
            e.smooth = len(fs) == 2 and fs[0].smooth and fs[1].smooth and e.calc_face_angle(0) < rad(40)
        bm.to_mesh(mesh)
        bm.free()
        mesh.materials.append(mats[mat])
        mesh.validate()
        ob = bpy.data.objects.new(mesh.name, mesh)
        if region not in cols:
            cols[region] = bpy.data.collections.new("ALB_" + region)
            root.children.link(cols[region])
        cols[region].objects.link(ob)
        objs.append(ob)
    return objs, zmin


def unwrap(objs):
    for ob in objs:
        bpy.ops.object.select_all(action='DESELECT')
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=rad(66), island_margin=0.01)
        bpy.ops.object.mode_set(mode='OBJECT')


def stats(objs):
    rows, tv, tt = [], 0, 0
    lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for ob in objs:
        me = ob.data
        me.calc_loop_triangles()
        tris = len(me.loop_triangles)
        rows.append({"object": ob.name, "material": me.materials[0].name, "vertices": len(me.vertices),
                     "faces": len(me.polygons), "triangles": tris, "uv_layers": len(me.uv_layers)})
        tv += len(me.vertices)
        tt += tris
        for v in me.vertices:
            for i in range(3):
                lo[i] = min(lo[i], v.co[i])
                hi[i] = max(hi[i], v.co[i])
    return {"objects": rows, "object_count": len(objs), "total_vertices": tv, "total_triangles": tt,
            "bounds_min": [round(x, 3) for x in lo], "bounds_max": [round(x, 3) for x in hi],
            "size_xyz_studs": [round(hi[i] - lo[i], 3) for i in range(3)],
            "materials": sorted({r["material"] for r in rows})}


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    build_body()
    build_belt()
    build_spikes()
    build_eye(1)
    build_eye(-1)
    build_mouth()
    build_fins()
    build_crest()
    build_tail()
    build_ornaments()
    build_scales()
    build_stalk()
    build_lantern()
    build_relics()

    mats = make_materials()
    objs, zmin = make_objects(mats)
    unwrap(objs)
    st = stats(objs)
    st["lantern_centre"] = [round(LANTERN.x * SCALE, 3), round(LANTERN.y * SCALE, 3), round((LANTERN.z - zmin) * SCALE, 3)]

    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, NAME + ".blend"))
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objs:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.fbx(filepath=os.path.join(OUT, NAME + ".fbx"), use_selection=True,
                             object_types={'MESH'}, mesh_smooth_type='FACE', use_triangles=True,
                             add_leaf_bones=False, bake_anim=False, path_mode='COPY')
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, NAME + ".glb"), export_format='GLB',
                              use_selection=True, export_apply=True, export_yup=True)
    with open(os.path.join(OUT, "stats.json"), "w") as fh:
        json.dump(st, fh, indent=2)
    print("BUILD_OK", st["object_count"], "objects", st["total_triangles"], "tris", st["size_xyz_studs"])


if __name__ == "__main__":
    main()
