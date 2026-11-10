"""Ancient Lantern Blowfish - procedural Blender build script.

Run with a Python that has the `bpy` module (Blender 4.2+/5.x):
    python build_blowfish.py
Writes the .blend, .fbx, .glb and stats.json next to this file.

Conventions: Z up, the fish faces -Y, 1 unit = 1 Roblox stud,
origin on the ground plane under the body centre.
"""
import json
import math
import os

import bpy
import bmesh  # must follow bpy
from mathutils import Matrix, Vector

OUT = os.path.dirname(os.path.abspath(__file__))
NAME = "AncientLanternBlowfish"
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
    "Sandstone":    ("#D8BE93", 0.0, 0.85, 0.0),
    "Sand_Light":   ("#EFE0BE", 0.0, 0.85, 0.0),
    "Ochre":        ("#C9973F", 0.0, 0.75, 0.0),
    "Ochre_Dark":   ("#9B6B2C", 0.0, 0.75, 0.0),
    "Stone":        ("#A39683", 0.0, 0.92, 0.0),
    "Bronze":       ("#94703C", 0.55, 0.42, 0.0),
    "Bronze_Dark":  ("#5C472C", 0.50, 0.50, 0.0),
    "Patina":       ("#4F9C88", 0.25, 0.60, 0.0),
    "Teal_Deep":    ("#155560", 0.0, 0.60, 0.0),
    "Teal_Mid":     ("#238088", 0.0, 0.60, 0.0),
    "Crystal_Glow": ("#45F0DC", 0.0, 0.30, 5.0),
    "Inlay_Glow":   ("#45F0DC", 0.0, 0.40, 2.5),
    "Eye_White":    ("#F6F0E0", 0.0, 0.35, 0.0),
    "Eye_Black":    ("#0E1518", 0.0, 0.22, 0.0),
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
# Body: faceted squircle lattice with flat caps and sawtooth colour bands
# --------------------------------------------------------------------------
RX, RY, RZ, EXP = 1.25, 1.15, 1.05, 0.8
LATS = [-78, -62, -42, -20, 2, 24, 44, 62, 78]
NL = 16


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


# facet column 0 faces the front (-Y), 4 = +X, 8 = back, 12 = -X
RINGS = [[body_pt(rad(-90 - 11.25 + 22.5 * j), rad(lat)) for j in range(NL)] for lat in LATS]
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


def build_body():
    verts, idx = [], []
    for ring in RINGS:
        idx.append(list(range(len(verts), len(verts) + NL)))
        verts.extend(ring)
    zig = {2: ("Sand_Light", "Sandstone"), 5: ("Sandstone", "Ochre")}
    band_mat = {0: "Sand_Light", 1: "Sand_Light", 3: "Sandstone", 4: "Sandstone", 6: "Ochre", 7: "Ochre"}
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
    by_mat["Sand_Light"].append(idx[0][::-1])
    by_mat["Ochre"].append(idx[-1][:])
    for mat, faces in by_mat.items():
        kit.add("Body", mat, (verts, faces))


def on_facet(b, j, sink=0.0, toward=None, blend=0.0):
    c, n = facet(b, j)
    if toward is not None:
        n = (n * (1 - blend) + Vector(toward) * blend).normalized()
    return frame_z(c - n * sink, n)


# --------------------------------------------------------------------------
# Spikes
# --------------------------------------------------------------------------
def build_spikes():
    layout = {  # band: (columns, base radius, height)
        6: ([2, 4, 6, 10, 12, 14], 0.150, 0.36),
        5: ([3, 5, 7, 9, 11, 13], 0.145, 0.34),
        4: ([3, 6, 10, 13], 0.135, 0.31),
        2: ([1, 3, 5, 7, 9, 11, 13, 15], 0.135, 0.30),
        1: ([2, 6, 10, 14], 0.120, 0.26),
    }
    broken = (6, 10)
    for b, (cols, r, h) in layout.items():
        for j in cols:
            M = on_facet(b, j, sink=0.03) @ R('Z', 30 if (b + j) % 2 else 0)
            if (b, j) == broken:      # deliberately chipped, stump only
                kit.add("Spikes", "Ochre_Dark", solid(lathe(
                    [(r, 0), (r, 0.06), (0.80 * r, 0.11), (0.62 * r, 0.42 * h)], 6), 0.012), M)
                kit.add("Spikes", "Sand_Light", solid(lathe(
                    [(0.62 * r, 0.42 * h), (0.40 * r, 0.50 * h), (0.0, 0.47 * h)], 6)), M @ R('X', 9))
                continue
            kit.add("Spikes", "Ochre_Dark", solid(lathe(
                [(r, 0), (r, 0.06), (0.80 * r, 0.11), (0.45 * r, 0.68 * h)], 6), 0.012), M)
            kit.add("Spikes", "Sand_Light", solid(lathe(
                [(0.45 * r, 0.68 * h), (0.24 * r, 0.96 * h), (0.10 * r, h)], 6), 0.008), M)


# --------------------------------------------------------------------------
# Face
# --------------------------------------------------------------------------
def build_eye(side, lid_h, lid_tilt, brow_raise, brow_tilt):
    c, n = facet(4, 1)
    n = (n * 0.5 + Vector((0, -1, 0)) * 0.5).normalized()
    M = S(side) @ frame_z(c + n * 0.03, n)
    # socket rim
    kit.add("Face", "Teal_Deep", solid(lathe(
        [(0.335, 0.02), (0.335, 0.10), (0.365, 0.13), (0.415, 0.13), (0.445, 0.09), (0.445, -0.22)],
        12, rot=15, caps=False), 0.0), M)
    # eyeball, iris, pupil, glints
    kit.add("Face", "Eye_White", solid(lathe(
        [(0.335, 0.03), (0.315, 0.085), (0.23, 0.122), (0.12, 0.14), (0.0, 0.145)], 16)), M, smooth=True)
    ic = T(-0.045, -0.06, 0)
    kit.add("Face", "Teal_Mid", solid(lathe(
        [(0.225, 0.09), (0.21, 0.135), (0.13, 0.156), (0.0, 0.162)], 16)), M @ ic, smooth=True)
    kit.add("Face", "Eye_Black", solid(lathe(
        [(0.135, 0.13), (0.125, 0.162), (0.07, 0.174), (0.0, 0.178)], 16)), M @ ic, smooth=True)
    kit.add("Face", "Eye_White", solid(sq_lathe([(0.036, 0.15), (0.036, 0.186)]), 0.006),
            M @ ic @ T(0.075, 0.015, 0) @ R('Z', 12))
    kit.add("Face", "Eye_White", solid(sq_lathe([(0.018, 0.15), (0.018, 0.182)]), 0.004),
            M @ ic @ T(-0.06, -0.085, 0) @ R('Z', 12))
    # heavy upper lid and thin lower lid
    a0 = math.degrees(math.asin(lid_h / 0.47))
    kit.add("Face", "Ochre_Dark", solid(prism(arc(0.47, a0, 180 - a0, 8), -0.20, 0.225), 0.03),
            M @ R('Z', -lid_tilt))
    kit.add("Face", "Ochre", solid(prism(arc(0.465, 222, 318, 5), -0.20, 0.19), 0.025), M @ R('Z', 4))
    # angular brow
    brow = [(-0.33, -0.06), (-0.27, 0.075), (0.25, 0.105), (0.36, 0.0), (0.27, -0.085)]
    kit.add("Face", "Bronze", solid(prism(brow, -0.26, 0.17), 0.028),
            M @ T(0.01, 0.615 + brow_raise, -0.02) @ R('Z', -brow_tilt) @ R('X', -16))


def build_mouth():
    M = on_facet(3, 0, sink=0.02, toward=(0, -1, 0), blend=0.5) @ T(0, -0.02, 0) @ S(1.22, 1.0, 1.0)
    kit.add("Face", "Ochre_Dark", solid(lathe(
        [(0.255, -0.12), (0.255, 0.06), (0.225, 0.155), (0.165, 0.195), (0.105, 0.165), (0.09, 0.07)],
        8, rot=22.5, caps=False), 0.0), M)
    kit.add("Face", "Eye_Black", solid(lathe([(0.09, 0.07), (0.0, 0.07)], 8, rot=22.5)), M)


# --------------------------------------------------------------------------
# Fins and tail
# --------------------------------------------------------------------------
def leaf(L, W):
    return [(-0.12, -0.4 * W), (0.35 * L, -W), (0.8 * L, -0.72 * W), (L, 0.0),
            (0.8 * L, 0.72 * W), (0.35 * L, W), (-0.12, 0.4 * W)]


def build_fins():
    c, n = facet(3, 4)
    d = Vector((0.80, 0.56, -0.12)).normalized()
    w = Vector((0.0, 0.18, 1.0))
    Zf = d.cross(w).normalized()
    Yf = Zf.cross(d)
    base = frame(c - n * 0.04, d, Yf, Zf)
    plates = [  # length, half width, fan angle, z0, z1, material
        (0.80, 0.20, 40, -0.075, 0.015, "Teal_Deep"),
        (0.74, 0.19, -40, -0.075, 0.015, "Teal_Deep"),
        (1.00, 0.25, 0, -0.02, 0.085, "Teal_Mid"),
    ]
    for side in (1, -1):
        M = S(side) @ base
        for L, W, ang, z0, z1, mat in plates:
            Mp = M @ R('Z', ang)
            kit.add("Fins", mat, solid(prism(leaf(L, W), z0, z1), 0.022), Mp)
            rib = [(0.02, -0.035), (0.72 * L, -0.022), (0.80 * L, 0.0), (0.72 * L, 0.022), (0.02, 0.035)]
            kit.add("Fins", "Bronze", solid(prism(rib, z0 - 0.022, z1 + 0.022), 0.01), Mp)
        # shoulder cuff
        kit.add("Fins", "Bronze", solid(lathe(
            [(0.235, -0.10), (0.235, 0.03), (0.185, 0.09), (0.185, 0.14), (0.13, 0.17)], 8, rot=22.5), 0.015),
            M @ R('Y', 90) @ T(0, 0, -0.06))
        kit.add("Fins", "Patina", solid(lathe(
            [(0.205, 0.045), (0.205, 0.085), (0.19, 0.10)], 8, rot=22.5, caps=False)),
            M @ R('Y', 90) @ T(0, 0, -0.06) @ S(1.04, 1.04, 1))


def build_tail():
    root = body_pt(rad(90), rad(2))
    M = frame(Vector((0, root.y - 0.12, 0.04)), Vector((0, 1, 0)), Vector((0, 0, 1)), Vector((1, 0, 0)))
    # stem (lathe axis runs along +Y)
    Ms = T(0, root.y - 0.12, 0.04) @ R('X', -90) @ S(1.0, 1.25, 1.0)
    kit.add("Tail", "Sandstone", solid(lathe(
        [(0.36, 0.0), (0.30, 0.20), (0.22, 0.44), (0.20, 0.52)], 8, rot=22.5), 0.0), Ms)
    kit.add("Tail", "Bronze", solid(lathe(
        [(0.305, 0.20), (0.335, 0.215), (0.325, 0.295), (0.275, 0.31)], 8, rot=22.5, caps=False)), Ms)
    kit.add("Tail", "Patina", solid(lathe(
        [(0.255, 0.335), (0.275, 0.345), (0.268, 0.385), (0.245, 0.395)], 8, rot=22.5, caps=False)), Ms)
    fan = [(0.0, 0.17), (0.30, 0.70), (0.64, 0.80), (0.76, 0.54), (0.58, 0.16), (0.66, 0.0),
           (0.58, -0.16), (0.76, -0.46), (0.62, -0.70), (0.30, -0.62), (0.0, -0.17)]
    Mf = M @ T(0.36, 0, 0)
    kit.add("Tail", "Teal_Deep", solid(prism(fan, -0.085, 0.085), 0.03), Mf)
    inner = [(0.0, 0.11), (0.24, 0.47), (0.47, 0.55), (0.52, 0.42), (0.40, 0.10), (0.44, 0.0),
             (0.40, -0.10), (0.52, -0.36), (0.45, -0.49), (0.24, -0.42), (0.0, -0.11)]
    kit.add("Tail", "Teal_Mid", solid(prism(inner, -0.125, 0.125), 0.022), Mf)
    for ang, L in ((52, 0.56), (0, 0.40), (-50, 0.50)):
        rib = [(0.0, -0.032), (L, -0.018), (L + 0.05, 0.0), (L, 0.018), (0.0, 0.032)]
        kit.add("Tail", "Bronze", solid(prism(rib, -0.15, 0.15), 0.01), Mf @ T(0.02, 0, 0) @ R('Z', ang))


# --------------------------------------------------------------------------
# Ancient ornaments on the body
# --------------------------------------------------------------------------
def build_ornaments():
    # stepped bronze crown that seats the lantern stalk
    Mc = T(0, 0, Z_TOP)
    kit.add("Ornaments", "Bronze", solid(lathe(
        [(0.43, -0.07), (0.43, 0.07), (0.37, 0.10), (0.37, 0.16), (0.26, 0.20), (0.26, 0.245), (0.21, 0.265)],
        8, rot=22.5), 0.014), Mc)
    kit.add("Ornaments", "Patina", solid(lathe(
        [(0.375, 0.105), (0.39, 0.115), (0.39, 0.15), (0.375, 0.16)], 8, rot=22.5, caps=False)), Mc)
    for k in range(8):
        kit.add("Ornaments", "Inlay_Glow", solid(box(0.13, 0.03, 0.04)),
                Mc @ R('Z', 45 * k - 90) @ T(0, -0.43 * math.cos(rad(22.5)), 0.022))

    # three overlapping bronze scutes down the back
    shield = [(-0.21, -0.10), (-0.21, 0.11), (-0.11, 0.21), (0.11, 0.21), (0.21, 0.11), (0.21, -0.10), (0.0, -0.25)]
    for b, s in ((7, 0.72), (6, 1.0), (5, 1.08)):
        M = on_facet(b, 8, sink=0.02) @ R('X', 7)
        kit.add("Ornaments", "Bronze", solid(prism(scaled(shield, s), -0.06, 0.075), 0.022), M)
        kit.add("Ornaments", "Bronze_Dark", solid(prism(scaled(shield, s * 0.62), 0.07, 0.10), 0.012), M)
        kit.add("Ornaments", "Inlay_Glow", solid(sq_lathe([(0.042 * s, 0.09), (0.042 * s, 0.113)])),
                M @ T(0, -0.01, 0) @ R('Z', 45))

    # carved stone medallion on the forehead
    M = on_facet(6, 0, sink=0.03)
    kit.add("Ornaments", "Stone", solid(lathe([(0.20, -0.05), (0.20, 0.05), (0.17, 0.07)], 8, rot=22.5), 0.008), M)
    kit.add("Ornaments", "Bronze", solid(lathe(
        [(0.195, -0.05), (0.25, -0.05), (0.25, 0.065), (0.225, 0.085), (0.195, 0.065)], 8, rot=22.5, loop=True),
        0.008), M)
    kit.add("Ornaments", "Inlay_Glow", solid(sq_lathe([(0.052, 0.06), (0.052, 0.082)])), M @ R('Z', 45))
    for sx in (-1, 1):
        kit.add("Ornaments", "Inlay_Glow", solid(prism([(0.085, 0.0), (0.135, 0.045), (0.135, -0.045)], 0.06, 0.082)),
                M @ S(sx))

    # right cheek: engraved chevron glyph (glowing inlay)
    M = on_facet(3, 2, sink=0.0)
    for i, wdt in enumerate((0.24, 0.17, 0.10)):
        chev = [(-wdt / 2, 0.03), (0.0, -0.012), (wdt / 2, 0.03), (wdt / 2, 0.072), (0.0, 0.03), (-wdt / 2, 0.072)]
        kit.add("Ornaments", "Inlay_Glow", solid(prism(chev, -0.03, 0.016)), M @ T(0, 0.075 - 0.095 * i, 0))
    # left cheek: riveted bronze repair plate (deliberate asymmetry)
    M = on_facet(3, 14, sink=0.0) @ R('Z', 9)
    plate = [(-0.15, -0.12), (0.15, -0.12), (0.15, 0.07), (0.09, 0.13), (-0.15, 0.13)]
    kit.add("Ornaments", "Bronze", solid(prism(plate, -0.04, 0.045), 0.014), M)
    for x, y in ((-0.105, -0.075), (0.105, -0.075), (-0.105, 0.085), (0.075, 0.07)):
        kit.add("Ornaments", "Bronze_Dark", solid(lathe([(0.026, 0.04), (0.026, 0.06), (0.012, 0.07)], 6)),
                M @ T(x, y, 0))
    kit.add("Ornaments", "Inlay_Glow", solid(box(0.14, 0.03, 0.02)), M @ T(0, 0.0, 0.045))


# --------------------------------------------------------------------------
# Lantern stalk
# --------------------------------------------------------------------------
KNUCKLES = [(0.00, Z_TOP + 0.21), (0.10, 1.76), (-0.08, 2.28), (-0.50, 2.70),
            (-1.08, 2.97), (-1.70, 2.99), (-2.15, 2.76)]
STALK_R = [0.170, 0.155, 0.140, 0.125, 0.110, 0.098, 0.088]
TIP = Vector((0, KNUCKLES[-1][0], KNUCKLES[-1][1]))
RING_A_Z = TIP.z - 0.17      # stalk hook ring centre
RING_B_Z = RING_A_Z - 0.11   # lantern hanging ring centre
LANTERN = Vector((0, TIP.y, RING_B_Z - 0.90))


def build_stalk():
    P = [Vector((0, y, z)) for y, z in KNUCKLES]
    XU = Vector((1, 0, 0))
    for i in range(len(P) - 1):
        d = P[i + 1] - P[i]
        L = d.length
        r0, r1 = STALK_R[i], STALK_R[i + 1]
        kit.add("Stalk", "Stone" if i % 2 == 0 else "Sandstone", solid(lathe(
            [(r0 * 0.8, 0.0), (r0, 0.16 * L), (r1, 0.84 * L), (r1 * 0.8, L)], 6), 0.012),
            frame_z(P[i], d, up=XU))
    for i in range(1, len(P)):
        d = (P[i] - P[i - 1]).normalized()
        if i < len(P) - 1:
            d = (d + (P[i + 1] - P[i]).normalized()).normalized()
        rr = STALK_R[i] * 1.5
        h = 0.055
        kit.add("Stalk", "Bronze" if i < len(P) - 1 else "Patina", solid(lathe(
            [(rr * 0.72, -h), (rr, -h * 0.45), (rr, h * 0.45), (rr * 0.72, h)], 8, rot=22.5), 0.008),
            frame_z(P[i], d, up=XU))
    # glowing bands leading the eye toward the lantern
    for i in (3, 4, 5):
        mid = (P[i] + P[i + 1]) / 2
        r = (STALK_R[i] + STALK_R[i + 1]) / 2 + 0.006
        kit.add("Stalk", "Inlay_Glow", solid(lathe([(r, -0.03), (r, 0.03)], 6, caps=False)),
                frame_z(mid, P[i + 1] - P[i], up=XU))
    # hook ring under the tip
    kit.add("Stalk", "Bronze", solid(torus(0.09, 0.027, 10, 6)), T(0, TIP.y, RING_A_Z) @ R('Y', 90))


# --------------------------------------------------------------------------
# Ancient lantern
# --------------------------------------------------------------------------
def build_lantern():
    G = "Lantern"
    M0 = T(*LANTERN)

    def side(k):   # maps a prism built in XY onto lantern side k (XZ plane, +z -> outward)
        return M0 @ R('Z', 90 * k)

    # hanging ring + finial
    kit.add(G, "Bronze", solid(torus(0.09, 0.026, 10, 6)), M0 @ T(0, 0, 0.90) @ R('X', 90))
    kit.add(G, "Bronze", solid(lathe([(0.075, 0.71), (0.10, 0.745), (0.065, 0.79), (0.035, 0.835)], 8), 0.006), M0)
    # stepped roof
    kit.add(G, "Stone", solid(sq_lathe([(0.21, 0.63), (0.10, 0.72)]), 0.012), M0)
    kit.add(G, "Bronze", solid(sq_lathe([(0.285, 0.575), (0.285, 0.635)]), 0.014), M0)
    kit.add(G, "Stone", solid(sq_lathe([(0.45, 0.435), (0.25, 0.58)]), 0.014), M0)
    kit.add(G, "Bronze", solid(sq_lathe([(0.51, 0.355), (0.51, 0.44)]), 0.018), M0)
    # glowing triangles engraved into each roof face
    slope = Vector((0.0, 0.20, 0.145)).normalized()      # up-slope direction of the -Y... face
    for k in range(4):
        Mk = M0 @ R('Z', 90 * k)
        nrm = Vector((0, -0.145, 0.20)).normalized()
        up = Vector((0, 0.20, 0.145)).normalized()
        F = frame(Vector((0, -0.35, 0.5075)) + nrm * 0.002, Vector((1, 0, 0)).cross(nrm).cross(nrm) * -1, up, nrm)
        tri = [(-0.13, -0.05), (0.13, -0.05), (0.0, 0.06)]
        kit.add(G, "Inlay_Glow", solid(prism(tri, -0.01, 0.012)), Mk @ F)
    # upturned eaves at the corners
    horn = [(0.0, -0.035), (0.17, -0.01), (0.27, 0.10), (0.225, 0.125), (0.13, 0.045), (0.0, 0.045)]
    for k in range(4):
        dgn = Vector((math.cos(rad(45 + 90 * k)), math.sin(rad(45 + 90 * k)), 0))
        F = frame(dgn * 0.60 + Vector((0, 0, 0.40)), dgn, Vector((0, 0, 1)), dgn.cross(Vector((0, 0, 1))))
        kit.add(G, "Patina", solid(prism(horn, -0.04, 0.04), 0.012), M0 @ F)
    # corner posts with patina collars
    for sx in (-1, 1):
        for sy in (-1, 1):
            Mp = M0 @ T(0.375 * sx, 0.375 * sy, 0)
            kit.add(G, "Bronze", solid(box(0.085, 0.085, 0.74), 0.012), Mp)
            kit.add(G, "Patina", solid(box(0.115, 0.115, 0.06), 0.012), Mp)
    # rails and angular gussets framing each window
    gus = [(0.335, 0.30), (0.335 - 0.17, 0.30), (0.335, 0.30 - 0.17)]
    for k in range(4):
        Ms = side(k) @ T(0, -0.375, 0)
        for sz in (-1, 1):
            kit.add(G, "Bronze_Dark", solid(box(0.67, 0.06, 0.07), 0.01), Ms @ T(0, 0, 0.325 * sz))
            for sx in (-1, 1):
                kit.add(G, "Bronze", solid(prism(gus, -0.025, 0.025)), Ms @ S(sx, 1, sz) @ R('X', 90))
    # weathered stone base with engraved, glowing motifs
    kit.add(G, "Stone", solid(sq_lathe([(0.49, -0.51), (0.49, -0.36)]), 0.018), M0)
    for k in range(4):
        Ms = side(k) @ T(0, -0.49, -0.435) @ R('X', 90)
        kit.add(G, "Inlay_Glow", solid(sq_lathe([(0.04, -0.008), (0.04, 0.012)])), Ms @ R('Z', 45))
        for sx in (-1, 1):
            meander = [(0.13, -0.045), (0.36, -0.045), (0.36, 0.045), (0.22, 0.045), (0.22, 0.01),
                       (0.325, 0.01), (0.325, -0.012), (0.13, -0.012)]
            kit.add(G, "Inlay_Glow", solid(prism(meander, -0.008, 0.012)), Ms @ S(sx))
    # underside, bead and pendant shard
    kit.add(G, "Bronze", solid(sq_lathe([(0.40, -0.51), (0.21, -0.61), (0.21, -0.635)]), 0.012), M0)
    kit.add(G, "Patina", solid(lathe([(0.06, -0.635), (0.10, -0.67), (0.06, -0.705)], 8), 0.0), M0)
    kit.add(G, "Bronze", solid(lathe([(0.0, -0.70), (0.028, -0.745), (0.0, -0.79)], 4)), M0)
    kit.add(G, "Crystal_Glow", solid(lathe([(0.0, -0.78), (0.065, -0.84), (0.045, -0.93), (0.0, -1.02)], 5)), M0)

    # crystal seat and luminous crystal cluster
    kit.add(G, "Bronze", solid(lathe([(0.26, -0.36), (0.26, -0.315), (0.20, -0.285)], 8, rot=22.5), 0.008), M0)
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
            kit.add(G, "Bronze_Dark", solid(lathe([(0.0, z), (0.026, z - 0.045), (0.0, z - 0.09)], 4)), Md)
            z -= 0.085
        kit.add(G, "Stone", solid(lathe([(0.03, z), (0.055, z - 0.04), (0.055, z - 0.07), (0.03, z - 0.11)], 6), 0.006), Md)
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
        mesh.from_pydata([(x, y, z - zmin) for x, y, z in bk["v"]], [], bk["f"])
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
    build_spikes()
    build_eye(1, lid_h=0.075, lid_tilt=9, brow_raise=0.035, brow_tilt=7)
    build_eye(-1, lid_h=0.035, lid_tilt=11, brow_raise=0.0, brow_tilt=11)   # sleepier left eye
    build_mouth()
    build_fins()
    build_tail()
    build_ornaments()
    build_stalk()
    build_lantern()

    mats = make_materials()
    objs, zmin = make_objects(mats)
    unwrap(objs)
    st = stats(objs)
    st["lantern_centre"] = [round(LANTERN.x, 3), round(LANTERN.y, 3), round(LANTERN.z - zmin, 3)]

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
