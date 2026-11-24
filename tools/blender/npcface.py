"""NPC face close-up: NEED_GL=1 run.sh npcface.py <npc id> -> tools/out/blender-npcface-<id>.png (front / three-quarter / side)"""
import sys
from common import *
import npc, preview
from skeleton import joints, zmap

nid = sys.argv[1]
_cam = preview._cam
preview._cam = lambda loc, target, ortho=None, lens=60: _cam(loc, target, ortho, 230 if lens == 120 else lens)   # tighter close-up
HIDE = os.environ.get('HIDE', '')   # e.g. HIDE=Headgear,Hair: diagnostics
P, arm, objs, names, sp = npc.build(nid)
objs = [o for o in objs if not any(o.name.startswith(h) for h in HIDE.split(',') if h)]
J = joints(P); hz = zmap(J['head'][2] + 0.10 * P['hs'], P)
out = os.path.join(OUT, 'blender-npcface-%s.png' % nid)
preview.render_views(objs, out, views=('face', 'faceside'), toon=True, size=(360, 400), center=(0, 0.0, hz))
print('wrote', out)
