// Kit.js — small procedural-geometry toolkit shared by the environment, vehicles and tools.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const geoCache = new Map();
const cachedSet = new WeakSet();
function cached(key, make) {
  if (!geoCache.has(key)) { const g = make(); geoCache.set(key, g); cachedSet.add(g); }
  return geoCache.get(key);
}

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export function mesh(parent, geo, mat, pos, rot, opts = {}) {
  const m = new THREE.Mesh(geo, mat);
  if (pos) m.position.set(pos[0], pos[1], pos[2]);
  if (rot) m.rotation.set(rot[0], rot[1], rot[2], rot[3] || 'XYZ');
  if (opts.scale) Array.isArray(opts.scale) ? m.scale.set(...opts.scale) : m.scale.setScalar(opts.scale);
  m.castShadow = opts.cast !== false;
  m.receiveShadow = opts.receive !== false;
  if (opts.name) m.name = opts.name;
  if (parent) parent.add(m);
  return m;
}

export function box(parent, w, h, d, mat, pos, rot, opts) {
  return mesh(parent, cached(`b${w}_${h}_${d}`, () => new THREE.BoxGeometry(w, h, d)), mat, pos, rot, opts);
}

export function rbox(parent, w, h, d, r, mat, pos, rot, opts) {
  const rr = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  return mesh(parent, cached(`rb${w}_${h}_${d}_${rr}`, () => new RoundedBoxGeometry(w, h, d, 3, rr)), mat, pos, rot, opts);
}

export function cyl(parent, rt, rb, h, seg, mat, pos, rot, opts = {}) {
  const key = `c${rt}_${rb}_${h}_${seg}_${opts.open ? 1 : 0}`;
  return mesh(parent, cached(key, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, !!opts.open)), mat, pos, rot, opts);
}

export function sphere(parent, r, mat, pos, opts = {}) {
  const s = opts.seg || 20;
  return mesh(parent, cached(`s${r}_${s}`, () => new THREE.SphereGeometry(r, s, Math.round(s * 0.7))), mat, pos, null, opts);
}

export function torus(parent, r, tube, mat, pos, rot, opts = {}) {
  const arc = opts.arc || Math.PI * 2;
  return mesh(parent, cached(`t${r}_${tube}_${arc}`, () => new THREE.TorusGeometry(r, tube, 12, 36, arc)), mat, pos, rot, opts);
}

export function capsule(parent, r, len, mat, pos, rot, opts) {
  return mesh(parent, cached(`cap${r}_${len}`, () => new THREE.CapsuleGeometry(r, len, 6, 12)), mat, pos, rot, opts);
}

export function tube(parent, points, r, mat, opts = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : V3(...p))), !!opts.closed, 'catmullrom', opts.tension ?? 0.5);
  const geo = new THREE.TubeGeometry(curve, opts.segments || 48, r, opts.radial || 10, !!opts.closed);
  return mesh(parent, geo, mat, null, null, opts);
}

export function lathe(parent, profile, mat, pos, rot, opts = {}) {
  const pts = profile.map(([x, y]) => new THREE.Vector2(x, y));
  return mesh(parent, new THREE.LatheGeometry(pts, opts.seg || 40), mat, pos, rot, opts);
}

/** Extrudes a 2D (x,y) profile along +z, centered on z. */
export function extrude(parent, shapePts, depth, mat, pos, rot, opts = {}) {
  const shape = shapePts instanceof THREE.Shape ? shapePts : new THREE.Shape(shapePts.map(([x, y]) => new THREE.Vector2(x, y)));
  const bevel = opts.bevel ?? 0.02;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: opts.curveSegments || 16,
  });
  geo.translate(0, 0, -depth / 2);
  return mesh(parent, geo, mat, pos, rot, opts);
}

/** Hex head bolt with washer face and threaded stub. Origin at the seating face, axis +Y. */
export function boltGeometry(size = 1, kind = 'hex') {
  return cached(`bolt_${kind}_${size}`, () => {
    const s = size;
    const parts = [];
    if (kind === 'hex') {
      const head = new THREE.CylinderGeometry(0.0105 * s, 0.0105 * s, 0.009 * s, 6); head.translate(0, 0.0065 * s, 0);
      const washer = new THREE.CylinderGeometry(0.013 * s, 0.013 * s, 0.002 * s, 20); washer.translate(0, 0.001 * s, 0);
      const shank = new THREE.CylinderGeometry(0.0055 * s, 0.0055 * s, 0.03 * s, 10); shank.translate(0, -0.015 * s, 0);
      parts.push(head, washer, shank);
    } else if (kind === 'lug') {
      const nut = new THREE.CylinderGeometry(0.0105 * s, 0.0105 * s, 0.014 * s, 6); nut.translate(0, 0.009 * s, 0);
      const cone = new THREE.CylinderGeometry(0.0105 * s, 0.007 * s, 0.004 * s, 18); cone.translate(0, 0.002 * s, 0);
      const cap = new THREE.SphereGeometry(0.0085 * s, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2); cap.translate(0, 0.016 * s, 0);
      const stud = new THREE.CylinderGeometry(0.006 * s, 0.006 * s, 0.03 * s, 10); stud.translate(0, -0.012 * s, 0);
      parts.push(nut, cone, cap, stud);
    } else if (kind === 'screw') {
      const head = new THREE.SphereGeometry(0.008 * s, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2); head.scale(1, 0.45, 1);
      const slotA = new THREE.BoxGeometry(0.013 * s, 0.003 * s, 0.0022 * s); slotA.translate(0, 0.0034 * s, 0);
      const slotB = new THREE.BoxGeometry(0.0022 * s, 0.003 * s, 0.013 * s); slotB.translate(0, 0.0034 * s, 0);
      const shank = new THREE.CylinderGeometry(0.0035 * s, 0.003 * s, 0.022 * s, 8); shank.translate(0, -0.011 * s, 0);
      parts.push(head, slotA, slotB, shank);
    } else if (kind === 'plug') {
      const head = new THREE.CylinderGeometry(0.012 * s, 0.012 * s, 0.008 * s, 6); head.translate(0, 0.006 * s, 0);
      const washer = new THREE.CylinderGeometry(0.015 * s, 0.015 * s, 0.002 * s, 20); washer.translate(0, 0.001 * s, 0);
      const shank = new THREE.CylinderGeometry(0.008 * s, 0.008 * s, 0.016 * s, 12); shank.translate(0, -0.008 * s, 0);
      parts.push(head, washer, shank);
    } else if (kind === 'spark') {
      const hex = new THREE.CylinderGeometry(0.0085, 0.0085, 0.01, 6); hex.translate(0, 0.006, 0);
      const ins = new THREE.CylinderGeometry(0.0055, 0.0065, 0.035, 14); ins.translate(0, 0.03, 0);
      const tip = new THREE.CylinderGeometry(0.0025, 0.0025, 0.012, 8); tip.translate(0, 0.053, 0);
      const thread = new THREE.CylinderGeometry(0.006, 0.006, 0.02, 10); thread.translate(0, -0.01, 0);
      parts.push(hex, ins, tip, thread);
    } else if (kind === 'clip') {
      const band = new THREE.TorusGeometry(0.024 * s, 0.003 * s, 6, 24); band.rotateX(Math.PI / 2);
      const screw = new THREE.CylinderGeometry(0.004 * s, 0.004 * s, 0.014 * s, 6); screw.rotateZ(Math.PI / 2); screw.translate(0.03 * s, 0, 0);
      parts.push(band, screw);
    } else if (kind === 'filter') {
      const g = new THREE.CylinderGeometry(0.045 * s, 0.045 * s, 0.11 * s, 28); g.translate(0, 0.055 * s, 0);
      parts.push(g);
    } else if (kind === 'axle') {
      const nut = new THREE.CylinderGeometry(0.016 * s, 0.016 * s, 0.014 * s, 6); nut.translate(0, 0.008 * s, 0);
      const shaft = new THREE.CylinderGeometry(0.009 * s, 0.009 * s, 0.06 * s, 12); shaft.translate(0, -0.02 * s, 0);
      parts.push(nut, shaft);
    }
    return mergeGeos(parts);
  });
}

export function mergeGeos(geos) {
  // Minimal merge (position/normal/uv only) to avoid pulling BufferGeometryUtils for simple solids.
  const nonIndexed = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let count = 0;
  for (const g of nonIndexed) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), uv = new Float32Array(count * 2);
  let o = 0;
  for (const g of nonIndexed) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}

/** Quaternion that rotates +Y onto the given direction. */
export function quatFromY(dir) {
  return new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), dir.clone().normalize());
}

export function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry && !cachedSet.has(o.geometry)) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
  });
}
