"""Close-up expression check: tools/out/blender-face-<sex>.png (neutral/happy/angry/sad/surprised/blink). usage: NEED_GL=1 run.sh face_check.py [female|male]"""
import sys
from common import *
import rig, hair, preview
from skeleton import FEMALE, MALE
sex = sys.argv[1] if len(sys.argv) > 1 else 'female'
reset(); P, arm, body, fixed = rig.build_body(sex)
o, sp = hair.build_hair('bob' if sex == 'female' else 'short', arm, P, hair.HAIR_COLORS['brown'], hair.HAIR_TIPS['brown'])
hz = P['hs'] * 1.65
import numpy as np
imgs = []
for ex in (None, 'happy', 'angry', 'sad', 'surprised', 'blink'):
    for k in body.data.shape_keys.key_blocks[1:]: k.value = 0
    if ex: body.data.shape_keys.key_blocks[ex].value = 1.0
    bpy.context.view_layer.update()
    pth = os.path.join(WORK, 'fc.png')
    preview.render_views([body, o], pth, views=('face',), toon=True, size=(300, 340), center=(0, 0.0, hz))
    im = bpy.data.images.load(pth); w, h = im.size; imgs.append(np.array(im.pixels[:]).reshape(h, w, 4)); bpy.data.images.remove(im)
sheet = np.concatenate([np.concatenate(imgs[:3], 1), np.concatenate(imgs[3:], 1)], 0)
im = bpy.data.images.new('s', sheet.shape[1], sheet.shape[0], alpha=True); im.pixels = sheet.ravel().tolist()
im.filepath_raw = os.path.join(OUT, 'blender-face-%s.png' % sex); im.file_format = 'PNG'; im.save()
print('face done')
