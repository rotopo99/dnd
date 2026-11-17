"""Shared helpers of the Blender pipeline (run via tools/blender/run.sh, headless bpy)."""
import bpy, bmesh, math, os, json, sys
from mathutils import Vector, Quaternion, Matrix, kdtree

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
MODELS = os.path.join(ROOT, 'game', 'assets', 'models')
OUT = os.path.join(ROOT, 'tools', 'out')
WORK = os.environ.get('BLENDER_WORK', os.path.join(OUT, 'blender-work'))
for d in (MODELS, OUT, WORK): os.makedirs(d, exist_ok=True)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for blk in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.armatures, bpy.data.actions):
        for x in list(blk): blk.remove(x)


def mode(m, obj=None):
    if obj is not None:
        bpy.context.view_layer.objects.active = obj
        for o in bpy.context.scene.objects: o.select_set(o is obj)
    if bpy.context.object and bpy.context.object.mode != m:
        bpy.ops.object.mode_set(mode=m)


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def mesh_obj(name, verts, faces, uvs=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.update()
    o = bpy.data.objects.new(name, me)
    link(o)
    return o


def smooth_shade(obj, angle=None):
    for p in obj.data.polygons: p.use_smooth = True


def tri_count(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    me = obj.evaluated_get(dg).to_mesh()
    n = sum(len(p.vertices) - 2 for p in me.polygons)
    obj.evaluated_get(dg).to_mesh_clear()
    return n


def apply_modifiers(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev)
    old = obj.data
    obj.modifiers.clear()
    obj.data = me
    if old.users == 0: bpy.data.meshes.remove(old)


def bm_from(obj):
    bm = bmesh.new(); bm.from_mesh(obj.data); return bm


def bm_to(bm, obj):
    bm.to_mesh(obj.data); bm.free(); obj.data.update()


def kd_of(points):
    kd = kdtree.KDTree(len(points))
    for i, p in enumerate(points): kd.insert(p, i)
    kd.balance(); return kd


def mat_toon(name, color, tex=None, rough=1.0, emission=None):
    """Principled material (exports cleanly to glTF); toon look is done by the game shader / preview override."""
    m = bpy.data.materials.new(name); m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = rough
    for k in ('Specular IOR Level', 'Specular'):
        if k in bsdf.inputs: bsdf.inputs[k].default_value = 0.0
    if tex is not None:
        t = m.node_tree.nodes.new('ShaderNodeTexImage'); t.image = tex
        m.node_tree.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
    return m


def srgb(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)


def vg_weights(obj, bone_names):
    """-> list per vertex of {bone: w}."""
    names = {g.index: g.name for g in obj.vertex_groups}
    out = []
    for v in obj.data.vertices:
        out.append({names[g.group]: g.weight for g in v.groups if names.get(g.group) in bone_names})
    return out


def set_weights(obj, W, bone_names):
    for n in bone_names:
        if n not in obj.vertex_groups: obj.vertex_groups.new(name=n)
    for i, w in enumerate(W):
        tot = sum(w.values()) or 1
        for b, x in w.items():
            if x > 1e-4: obj.vertex_groups[b].add([i], x / tot, 'REPLACE')


def copy_weights_nearest(src, dst, bones, kmax=1):
    """Vertex weights of dst from nearest vertices of src (same armature)."""
    Ws = vg_weights(src, bones)
    kd = kd_of([src.matrix_world @ v.co for v in src.data.vertices])
    W = []
    for v in dst.data.vertices:
        co, i, d = kd.find(dst.matrix_world @ v.co)
        W.append(dict(Ws[i]))
    set_weights(dst, W, bones)


def transfer_shapekeys(src, dst):
    """dst gets shape keys of src: delta of the nearest src vertex."""
    if not src.data.shape_keys: return
    kd = kd_of([v.co.copy() for v in src.data.vertices])
    idx = [kd.find(v.co)[1] for v in dst.data.vertices]
    if not dst.data.shape_keys: dst.shape_key_add(name='Basis')
    for k in src.data.shape_keys.key_blocks[1:]:
        nk = dst.shape_key_add(name=k.name, from_mix=False)
        nk.slider_min, nk.slider_max = k.slider_min, k.slider_max; nk.value = 0.0
        base = src.data.shape_keys.key_blocks[0].data
        for i, v in enumerate(dst.data.vertices):
            j = idx[i]
            nk.data[i].co = v.co + (k.data[j].co - base[j].co)


def save_blend(name):
    p = os.path.join(WORK, name + '.blend')
    bpy.ops.wm.save_as_mainfile(filepath=p); return p


def load_blend(name):
    bpy.ops.wm.open_mainfile(filepath=os.path.join(WORK, name + '.blend'))
