"""Render animation frames (hero_f_uniform) to tools/out/anim-frames/<clip>_<n>.png ; tools/blender/animsheet_pack.py (system python + PIL) builds sheets/gifs.
usage: NEED_GL=1 run.sh animsheet.py [clip,clip..] [sex]"""
import sys
from common import *
import rig, anim, hair, clothes, preview
from skeleton import FEMALE, MALE
clips = (sys.argv[1] if len(sys.argv) > 1 else 'idle,walk,run,attack_melee,attack_shoot,cast,hit,death').split(',')
sex = sys.argv[2] if len(sys.argv) > 2 else 'female'
reset(); P, arm, body, fixed = rig.build_body(sex)
names = anim.author(arm, P)
o, sp = hair.build_hair('long' if sex == 'female' else 'short', arm, P, hair.HAIR_COLORS['silver'], hair.HAIR_TIPS['silver'])
parts, sps = clothes.build_outfit('uniform', body, arm, P, sex)
objs = [body, o] + parts
D = os.path.join(OUT, 'anim-frames'); os.makedirs(D, exist_ok=True)
sc = bpy.context.scene
N = {'idle': (60, 6), 'walk': (32, 8), 'run': (24, 8), 'attack_melee': (40, 8), 'attack_shoot': (42, 6), 'cast': (58, 8), 'hit': (20, 5), 'death': (50, 8)}
for c in clips:
    n, k = N[c]; act = bpy.data.actions[c]; arm.animation_data.action = act
    for i in range(k):
        fr = 1 + int(i * (n - 1) / max(1, (k if c in ('idle', 'walk', 'run') else k - 1)))
        sc.frame_set(fr); bpy.context.view_layer.update()
        view = 'side' if c in ('walk', 'run') else 'three'
        preview.render_views(objs, os.path.join(D, '%s_%d.png' % (c, i)), views=(view,), toon=True, engine='EEVEE', size=(240, 400), center=(0, 0, 0.85), height=1.9)
print('frames done')
