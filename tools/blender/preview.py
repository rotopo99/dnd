"""Preview renders (EEVEE toon / Workbench) -> tools/out/blender-*.png (contact sheets)."""
from common import *
import numpy as np


def _cam(loc, target, ortho=None, lens=60):
    cam = bpy.data.objects.get('PCam') or link(bpy.data.objects.new('PCam', bpy.data.cameras.new('PCam')))
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    cam.data.type = 'ORTHO' if ortho else 'PERSP'
    if ortho: cam.data.ortho_scale = ortho
    else: cam.data.lens = lens
    bpy.context.scene.camera = cam
    return cam


def _world(color=(0.18, 0.2, 0.26)):
    w = bpy.data.worlds.get('PW') or bpy.data.worlds.new('PW'); w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (*color, 1)
    bpy.context.scene.world = w


def toonify(objs):
    """Replace materials by a 3-band toon shader (Shader-to-RGB) keeping base colour / texture. Returns restore fn."""
    saved = []
    for o in objs:
        if o.type != 'MESH': continue
        saved.append((o, [s.material for s in o.material_slots]))
        for s in o.material_slots:
            src = s.material
            if src is None: continue
            m = bpy.data.materials.new(src.name + '_toon'); m.use_nodes = True
            nt = m.node_tree; nt.nodes.clear()
            out = nt.nodes.new('ShaderNodeOutputMaterial')
            base = nt.nodes.new('ShaderNodeBsdfDiffuse')
            s2r = nt.nodes.new('ShaderNodeShaderToRGB')
            ramp = nt.nodes.new('ShaderNodeValToRGB')
            mixc = nt.nodes.new('ShaderNodeMix'); mixc.data_type = 'RGBA'; mixc.blend_type = 'MULTIPLY'
            mixc.inputs[0].default_value = 1
            bsdf = src.node_tree.nodes.get('Principled BSDF')
            tex = next((n for n in src.node_tree.nodes if n.type == 'TEX_IMAGE'), None)
            if tex:
                t = nt.nodes.new('ShaderNodeTexImage'); t.image = tex.image
                col_out = t.outputs['Color']
            else:
                c = nt.nodes.new('ShaderNodeRGB'); c.outputs[0].default_value = bsdf.inputs['Base Color'].default_value
                col_out = c.outputs[0]
            # shade -> bands (bright, mid, shadow tinted)
            nt.links.new(base.outputs[0], s2r.inputs[0])
            nt.links.new(s2r.outputs[0], ramp.inputs[0])
            ramp.color_ramp.interpolation = 'CONSTANT'
            e = ramp.color_ramp.elements
            e[0].position = 0.0; e[0].color = (0.55, 0.5, 0.68, 1); e[1].position = 0.32; e[1].color = (1, 1, 1, 1)
            e.new(0.62).color = (1.12, 1.1, 1.08, 1)
            nt.links.new(col_out, mixc.inputs[6]); nt.links.new(ramp.outputs[0], mixc.inputs[7])
            em = nt.nodes.new('ShaderNodeEmission')
            nt.links.new(mixc.outputs[2], em.inputs[0]); nt.links.new(em.outputs[0], out.inputs[0])
            s.material = m
    def restore():
        for o, ms in saved:
            for s, mm in zip(o.material_slots, ms): s.material = mm
    return restore


def outline(objs, width=0.0025, color=(0.07, 0.05, 0.1)):
    """Inverted-hull outline (solidify, flipped normals, backface culling) on temporary modifiers."""
    m = bpy.data.materials.get('OutlineMat') or bpy.data.materials.new('OutlineMat')
    m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission')
    em.inputs[0].default_value = (*color, 1); nt.links.new(em.outputs[0], out.inputs[0])
    m.use_backface_culling = True
    if hasattr(m, 'use_backface_culling_shadow'): m.use_backface_culling_shadow = True
    added = []
    for o in objs:
        if o.type != 'MESH': continue
        o.data.materials.append(m)
        md = o.modifiers.new('PO', 'SOLIDIFY'); md.thickness = -width; md.offset = 1; md.use_flip_normals = True
        md.material_offset = len(o.data.materials) - 1; md.use_rim = False
        added.append((o, md))
    def restore():
        for o, md in added:
            o.modifiers.remove(md); o.data.materials.pop()
    return restore


def render_views(objs, path, views=('front', 'side', 'back', 'three'), size=(480, 720), toon=True, center=(0, 0, 0.9), height=2.0, engine='EEVEE', posefn=None, extra=None):
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE' if engine == 'EEVEE' else 'BLENDER_WORKBENCH'
    sc.render.resolution_x, sc.render.resolution_y = size
    sc.render.image_settings.file_format = 'PNG'
    if engine == 'EEVEE':
        try: sc.eevee.taa_render_samples = 16
        except Exception: pass
    _world()
    sc.view_settings.view_transform = 'Standard'
    rs = []
    if toon: rs.append(toonify(objs))
    if toon: rs.append(outline(objs))
    L = bpy.data.objects.get('PLight')
    if not L:
        L = link(bpy.data.objects.new('PLight', bpy.data.lights.new('PLight', 'SUN')))
    L.rotation_euler = Vector((0.75, 0.55, -0.55)).to_track_quat('-Z', 'Y').to_euler(); L.data.energy = 3
    d = 7.0; c = Vector(center)
    dirs = {'front': (0, -1, 0.05), 'side': (1, 0, 0.05), 'back': (0, 1, 0.05), 'three': (0.7, -0.7, 0.12), 'face': (0.15, -1, 0.0), 'faceside': (0.8, -0.6, 0.0)}
    imgs = []
    for v in views:
        dv = Vector(dirs[v]).normalized()
        if v.startswith('face'):
            _cam(c + dv * 2.0, c, ortho=None, lens=120)
        else:
            _cam(c + dv * d, c, ortho=height)
        fp = os.path.join(WORK, 'v_%s.png' % v); sc.render.filepath = fp
        bpy.ops.render.render(write_still=True)
        im = bpy.data.images.load(fp); w, h = im.size
        imgs.append(np.array(im.pixels[:]).reshape(h, w, 4)); bpy.data.images.remove(im)
    for r in rs: r()
    sheet = np.concatenate(imgs, axis=1)
    im = bpy.data.images.new('sheet', sheet.shape[1], sheet.shape[0], alpha=True)
    im.pixels = sheet.ravel().tolist(); im.filepath_raw = path; im.file_format = 'PNG'; im.save()
    bpy.data.images.remove(im)
    return path
