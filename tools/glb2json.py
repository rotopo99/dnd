#!/usr/bin/env python3
"""Convert .glb files to JSON glTF with embedded base64 buffer (<name>.gltf.json) for static hosts that don't serve .glb.
Usage: python3 tools/glb2json.py <out_dir> <file.glb>..."""
import sys, json, struct, base64, os
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
for f in sys.argv[2:]:
    b = open(f, 'rb').read()
    assert b[:4] == b'glTF'
    off = 12; js = None; bin_ = b''
    while off < len(b):
        ln, typ = struct.unpack_from('<I4s', b, off); off += 8
        chunk = b[off:off + ln]; off += ln
        if typ == b'JSON': js = json.loads(chunk.decode('utf-8'))
        elif typ == b'BIN\x00': bin_ = chunk
    if js.get('buffers'):
        js['buffers'][0]['uri'] = 'data:application/octet-stream;base64,' + base64.b64encode(bin_).decode()
    name = os.path.basename(f)[:-4] + '.gltf.json'
    open(os.path.join(out, name), 'w').write(json.dumps(js, separators=(',', ':')))
