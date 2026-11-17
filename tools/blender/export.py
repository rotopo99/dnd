"""GLB export helpers."""
from common import *

EXPRESSIONS = ['blink', 'happy', 'angry', 'sad', 'surprised']


def glb(path, objs, animations=True, extras=None):
    mode('OBJECT')
    for o in bpy.context.scene.objects: o.select_set(False)
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_apply=False, export_morph=True, export_morph_normal=False,
              export_skins=True, export_extras=True, export_yup=True, export_image_format='AUTO', export_cameras=False, export_lights=False,
              export_animations=animations, export_materials='EXPORT')
    if animations: kw.update(export_animation_mode='ACTIONS', export_force_sampling=True, export_optimize_animation_size=True, export_anim_single_armature=True)
    try: bpy.ops.export_scene.gltf(**kw)
    except TypeError:
        for k in ('export_anim_single_armature', 'export_optimize_animation_size', 'export_morph_normal'): kw.pop(k, None)
        bpy.ops.export_scene.gltf(**kw)
    return os.path.getsize(path)


def meta(path, arm, P, sex, parts, anims, springs, extra=None):
    from skeleton import bone_table
    m = dict(name=os.path.basename(path), sex=sex, height_m=round(P['hs'] * 1.79, 3), up='Y', front='+Z', bones_vrm_humanoid=[b[0] for b in bone_table(P)],
             expressions=EXPRESSIONS, body_shape_keys=['bust', 'hips', 'shoulders', 'build', 'legs_long', 'height'], parts=parts, animations=anims,
             springBones=springs, **(extra or {}))
    json.dump(m, open(os.path.splitext(path)[0] + '.json', 'w'), indent=1, ensure_ascii=False)
