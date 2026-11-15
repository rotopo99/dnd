// glTF 2.0 / GLB / VRM loader for future hand-made assets (docs/specs/3d.md). No libraries. Nothing loads unless a unit asks
// for it (`u.model3d = url`): without it the procedural models of units3d.js are used.
//   parseGlb(buffer)                     -> { json, bin }  (GLB container or plain glTF JSON text in an ArrayBuffer)
//   loadGltf(urlOrBuffer)                -> Promise<Model>
//   Model { meshes: [{ mb, material }], nodes, skin: {joints[], inverseBind[]}, bones: Map<humanName, nodeIndex>,
//           springs: [{ root, nodes[], stiffness, drag, gravity, radius }], materials, vrm: 0|0.x|1 }
//   toonMaterial(m)                      MToon / PBR material -> { ramp: [shadeRGB, baseRGB, lightRGB], rim, outline, texture }
//   modelToMesh(model)                   MeshBuilder with 2-bone skin per vertex (bone = joint index; remap to NBONES with the
//                                        `bones` map of the VRM humanoid before upload)
import { MeshBuilder } from './mesh.js';

const COMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const ARR = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };

export function parseGlb(buf) {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) return { json: JSON.parse(new TextDecoder().decode(buf)), bin: null }; // plain glTF
  let off = 12, json = null, bin = null;
  while (off < buf.byteLength) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    const chunk = buf.slice(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk)); else if (type === 0x004e4942) bin = chunk;
    off += 8 + len + ((4 - (len % 4)) % 4);
  }
  if (!json) throw new Error('glb: no JSON chunk');
  return { json, bin };
}

function accessor(json, bin, idx) {
  const a = json.accessors[idx], bv = json.bufferViews[a.bufferView], n = COMP[a.type], T = ARR[a.componentType];
  const stride = bv.byteStride || n * T.BYTES_PER_ELEMENT, base = (bv.byteOffset || 0) + (a.byteOffset || 0), out = new Float32Array(a.count * n);
  const dv = new DataView(bin);
  const rd = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[a.componentType];
  const norm = a.normalized ? { 5121: 255, 5123: 65535, 5120: 127, 5122: 32767 }[a.componentType] : 1;
  for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++) out[i * n + k] = dv[rd](base + i * stride + k * T.BYTES_PER_ELEMENT, true) / norm;
  return { data: out, n, count: a.count };
}

export async function loadGltf(src) {
  const buf = typeof src === 'string' ? await (await fetch(src)).arrayBuffer() : src;
  const { json, bin } = parseGlb(buf);
  if (!bin && json.buffers?.[0]?.uri?.startsWith('data:')) { // embedded base64 buffer
    const b64 = json.buffers[0].uri.split(',')[1], raw = atob(b64), u = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) u[i] = raw.charCodeAt(i);
    return build(json, u.buffer);
  }
  return build(json, bin);
}

function build(json, bin) {
  const ext = json.extensions || {};
  const model = { meshes: [], nodes: json.nodes || [], skin: null, bones: new Map(), springs: [], materials: json.materials || [], vrm: ext.VRMC_vrm ? 1 : ext.VRM ? 0.5 : 0 };
  const sk = json.skins?.[0];
  if (sk) model.skin = { joints: sk.joints, inverseBind: sk.inverseBindMatrices != null ? accessor(json, bin, sk.inverseBindMatrices).data : null };
  // VRM humanoid: human bone name -> node
  const hb = ext.VRMC_vrm?.humanoid?.humanBones || ext.VRM?.humanoid?.humanBones;
  if (hb) { if (Array.isArray(hb)) for (const b of hb) model.bones.set(b.bone, b.node); else for (const k in hb) model.bones.set(k, hb[k].node); }
  // VRM spring bones (1.0 VRMC_springBone / 0.x secondaryAnimation)
  const sb = json.extensions?.VRMC_springBone;
  if (sb) for (const s of sb.springs || []) model.springs.push({ name: s.name, nodes: (s.joints || []).map((j) => j.node), stiffness: s.joints?.[0]?.stiffness ?? 1, drag: s.joints?.[0]?.dragForce ?? 0.4, gravity: s.joints?.[0]?.gravityPower ?? 0, radius: s.joints?.[0]?.hitRadius ?? 0 });
  for (const g of ext.VRM?.secondaryAnimation?.boneGroups || []) model.springs.push({ nodes: g.bones, stiffness: g.stiffiness ?? g.stiffness ?? 1, drag: g.dragForce ?? 0.4, gravity: g.gravityPower ?? 0, radius: g.hitRadius ?? 0 });
  for (const mesh of json.meshes || []) for (const p of mesh.primitives) {
    const A = p.attributes, pos = accessor(json, bin, A.POSITION), nrm = A.NORMAL != null ? accessor(json, bin, A.NORMAL) : null;
    const uv = A.TEXCOORD_0 != null ? accessor(json, bin, A.TEXCOORD_0) : null, jt = A.JOINTS_0 != null ? accessor(json, bin, A.JOINTS_0) : null, wt = A.WEIGHTS_0 != null ? accessor(json, bin, A.WEIGHTS_0) : null;
    const idx = p.indices != null ? accessor(json, bin, p.indices).data : Array.from({ length: pos.count }, (_, i) => i);
    const mb = new MeshBuilder().setBone(0), ramp = toonMaterial(json.materials?.[p.material]).ramp;
    for (let i = 0; i < pos.count; i++) {
      let b0 = 0, b1 = 0, w = 0;
      if (jt && wt) { // two strongest influences
        const ws = [0, 1, 2, 3].map((k) => [wt.data[i * 4 + k], jt.data[i * 4 + k]]).sort((a, b) => b[0] - a[0]);
        b0 = ws[0][1]; b1 = ws[1][1]; w = ws[1][0] / ((ws[0][0] + ws[1][0]) || 1);
      }
      mb.vert([pos.data[i * 3], pos.data[i * 3 + 1], pos.data[i * 3 + 2]], nrm ? [nrm.data[i * 3], nrm.data[i * 3 + 1], nrm.data[i * 3 + 2]] : [0, 1, 0], ramp, { bn: [b0, b1, w], uv: uv ? [uv.data[i * 2], uv.data[i * 2 + 1]] : undefined });
    }
    for (let i = 0; i + 2 < idx.length; i += 3) mb.tri3(idx[i], idx[i + 1], idx[i + 2]);
    model.meshes.push({ mb, material: json.materials?.[p.material] || null });
  }
  return model;
}

const mix = (a, b, f) => a.map((x, i) => x + (b[i] - x) * f);
/** MToon (VRM 0.x `VRM.materialProperties` is read by the caller; 1.0 `VRMC_materials_mtoon`) or PBR -> toon ramp. */
export function toonMaterial(m) {
  if (!m) return { ramp: [[0.3, 0.3, 0.35], [0.7, 0.7, 0.75], [0.9, 0.9, 0.95]], rim: 0.4, outline: 0.6 };
  const mt = m.extensions?.VRMC_materials_mtoon, base = (m.pbrMetallicRoughness?.baseColorFactor || [0.8, 0.8, 0.8]).slice(0, 3);
  const shade = mt?.shadeColorFactor || mix(base, [0.1, 0.05, 0.2], 0.45);
  return { ramp: [shade, base, mix(base, [1, 1, 1], 0.25)], rim: mt?.parametricRimColorFactor ? 0.6 : 0.4, outline: mt?.outlineWidthFactor ? 1 : 0.6, texture: m.pbrMetallicRoughness?.baseColorTexture?.index ?? null };
}
export const modelToMesh = (model) => { const mb = new MeshBuilder().setBone(0); for (const m of model.meshes) mb.add(m.mb); return mb; };
