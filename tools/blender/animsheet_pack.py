"""system python: packs tools/out/anim-frames into tools/out/blender-anim-<clip>.png sheets and .gif"""
import glob, os, sys
from PIL import Image
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'out'); F = os.path.join(D, 'anim-frames')
clips = sorted({os.path.basename(p).rsplit('_', 1)[0] for p in glob.glob(F + '/*.png')})
rows = []
for c in clips:
    fr = [Image.open(p).convert('RGB') for p in sorted(glob.glob(F + '/%s_*.png' % c), key=lambda p: int(p.rsplit('_', 1)[1][:-4]))]
    w = sum(f.width for f in fr); sh = Image.new('RGB', (w, fr[0].height))
    x = 0
    for f in fr: sh.paste(f, (x, 0)); x += f.width
    sh.save(os.path.join(D, 'blender-anim-%s.png' % c))
    fr[0].save(os.path.join(D, 'blender-anim-%s.gif' % c), save_all=True, append_images=fr[1:], duration=120, loop=0)
print(clips)
