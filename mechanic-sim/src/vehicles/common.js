// common.js — reusable procedural assemblies: wheel corners, brakes, struts and a V-engine
// with a realistic disassembly DAG (intake → coils → plugs/valve cover → manifolds → head → gasket).
import * as THREE from 'three';
import { box, rbox, cyl, sphere, torus, tube, lathe, mesh, V3 } from '../Kit.js';
import { makeMat } from '../Materials.js';

const PI = Math.PI;

/** Tyre + rim visual centred at the origin, axle along Z. side = +1 outboard faces +Z. */
export function wheelVisual(g, mat, { r = 0.33, w = 0.24, rimR = 0.225, spokes = 5, side = 1, rim = 'billet', style = 'alloy' } = {}) {
  const tyre = mat('rubber');
  const h = w / 2;
  const prof = [
    [rimR + 0.004, -h + 0.012], [r - 0.045, -h], [r - 0.012, -h + 0.02], [r, -h + 0.05],
    [r, h - 0.05], [r - 0.012, h - 0.02], [r - 0.045, h], [rimR + 0.004, h - 0.012],
  ];
  const t = lathe(g, prof, tyre, null, [PI / 2, 0, 0], { seg: 48 });
  // tread grooves
  for (const k of [-0.45, 0, 0.45]) torus(g, r + 0.0005, 0.004, mat('rubber', { color: 0x0b0b0b }), [0, 0, k * h], null);
  const rimMat = mat(rim);
  cyl(g, rimR, rimR, w - 0.03, 40, rimMat, null, [PI / 2, 0, 0], { open: true });
  torus(g, rimR, 0.009, rimMat, [0, 0, side * (h - 0.015)], null);
  torus(g, rimR, 0.007, rimMat, [0, 0, -side * (h - 0.015)], null);
  const faceZ = side * (h - 0.035);
  if (style === 'alloy') {
    cyl(g, 0.075, 0.08, 0.04, 28, rimMat, [0, 0, faceZ - side * 0.01], [PI / 2, 0, 0]);
    cyl(g, 0.028, 0.028, 0.045, 20, mat('blackPaint'), [0, 0, faceZ], [PI / 2, 0, 0]);
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * PI * 2;
      const len = rimR - 0.07;
      const sp = rbox(g, len, 0.042, 0.022, 0.008, rimMat, [Math.cos(a) * (0.07 + len / 2), Math.sin(a) * (0.07 + len / 2), faceZ - side * 0.006], [0, 0, a]);
      sp.castShadow = true;
    }
  } else if (style === 'steel') {
    const disc = cyl(g, rimR - 0.01, rimR - 0.01, 0.012, 40, rimMat, [0, 0, faceZ - side * 0.02], [PI / 2, 0, 0]);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * PI * 2 + PI / 8;
      cyl(g, 0.022, 0.022, 0.014, 16, mat('darkSteel'), [Math.cos(a) * 0.15, Math.sin(a) * 0.15, faceZ - side * 0.016], [PI / 2, 0, 0]);
    }
    cyl(g, 0.11, 0.12, 0.05, 32, rimMat, [0, 0, faceZ], [PI / 2, 0, 0]);
  } else if (style === 'spoke') {
    const hubM = mat('aluminum');
    cyl(g, 0.05, 0.05, w * 0.9, 24, hubM, null, [PI / 2, 0, 0]);
    const spokeM = mat('chrome');
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * PI * 2;
      const zz = (i % 2 ? 1 : -1) * w * 0.38;
      const p0 = V3(Math.cos(a) * 0.045, Math.sin(a) * 0.045, zz);
      const a2 = a + (i % 4 < 2 ? 0.35 : -0.35);
      const p1 = V3(Math.cos(a2) * (rimR - 0.008), Math.sin(a2) * (rimR - 0.008), 0);
      const d = p1.clone().sub(p0);
      const s = mesh(g, new THREE.CylinderGeometry(0.0018, 0.0018, d.length(), 4), spokeM, null, null, { cast: false });
      s.position.copy(p0).addScaledVector(d, 0.5);
      s.quaternion.setFromUnitVectors(V3(0, 1, 0), d.normalize());
    }
  }
  return t;
}

function lugPositions(n, radius, faceZ, side) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2 + PI / 2;
    out.push({ type: 'lug', pos: [Math.cos(a) * radius, Math.sin(a) * radius, faceZ], axis: [0, 0, side] });
  }
  return out;
}

/** Star / criss-cross tightening order for n lugs. */
export function starPattern(n) {
  if (n === 5) return [0, 2, 4, 1, 3];
  if (n === 6) return [0, 3, 1, 4, 2, 5];
  if (n === 8) return [0, 4, 2, 6, 1, 5, 3, 7];
  return [...Array(n).keys()];
}

/**
 * Wheel corner: rotor → pads → caliper → (strut) → wheel, with optional rugged hub.
 * opts: { tag:'FR', x, z, r, w, lugs, lugR, wheelKind, style, strut, hub, brakes, view }
 */
export function buildCorner(v, o) {
  const side = Math.sign(o.z) || 1;
  const tag = o.tag;
  const y = o.r;
  const rotorZ = o.z - side * (o.w / 2 - 0.02 + (o.hub ? 0.07 : 0.0));
  const view = o.view || `wheel_${tag}`;
  const deps = [];

  if (o.brakes !== false) {
    const rotorR = o.rotorR || o.r * 0.46;
    v.addPart(`rotor_${tag}`, {
      name: `Brake rotor (${tag})`, kind: 'rotor', view, needsRaised: true,
      pos: [o.x, y, rotorZ],
      build: (g, mat) => {
        const m = mat('castIron', { noiseScale: 2 });
        cyl(g, rotorR, rotorR, 0.028, 48, m, null, [PI / 2, 0, 0]);
        cyl(g, rotorR * 0.5, rotorR * 0.5, 0.05, 32, mat('darkSteel'), [0, 0, side * 0.02], [PI / 2, 0, 0]);
        // vent slots
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * PI * 2;
          box(g, 0.004, rotorR * 0.35, 0.031, mat('darkSteel'), [Math.cos(a) * rotorR * 0.75, Math.sin(a) * rotorR * 0.75, 0], [0, 0, a - PI / 2], { cast: false });
        }
      },
      fasteners: [{ type: 'screw', pos: [rotorR * 0.32, -rotorR * 0.25, side * 0.046], axis: [0, 0, side] }],
      removeDir: [0, 0, side],
    });
    const ca = (3 * PI) / 4; // caliper at top-rear
    const cr = rotorR - 0.012;
    const cx = Math.cos(ca) * cr, cy = Math.sin(ca) * cr;
    const tang = V3(-Math.sin(ca), Math.cos(ca), 0);
    const rad = V3(Math.cos(ca), Math.sin(ca), 0);
    v.addPart(`pads_${tag}`, {
      name: `Brake pads (${tag})`, kind: 'brake_pads', view, needsRaised: true,
      pos: [o.x, y, rotorZ], deps: [`rotor_${tag}`],
      build: (g, mat) => {
        const fr = mat('padFriction'); const bp = mat('steel');
        for (const s of [-1, 1]) {
          const pad = box(g, 0.11, 0.045, 0.012, fr, [cx, cy, s * 0.021], [0, 0, ca - PI / 2]);
          pad.userData.friction = s;
          box(g, 0.115, 0.05, 0.004, bp, [cx, cy, s * 0.03], [0, 0, ca - PI / 2]);
        }
      },
      // friction material visibly thins as the pads wear
      onCondition: (g, c) => g.traverse((o) => {
        if (o.userData.friction) { const k = 1 - c.wearLevel * 0.8; o.scale.z = k; o.position.z = o.userData.friction * (0.027 - 0.006 * k); }
      }),
      removeDir: [rad.x, rad.y, 0],
    });
    v.addPart(`caliper_${tag}`, {
      name: `Brake caliper (${tag})`, kind: 'caliper', view, needsRaised: true,
      pos: [o.x, y, rotorZ], deps: [`pads_${tag}`, `rotor_${tag}`],
      build: (g, mat) => {
        const m = mat(o.caliperPreset || 'redPaint');
        rbox(g, 0.15, 0.07, 0.085, 0.018, m, [cx + rad.x * 0.012, cy + rad.y * 0.012, 0], [0, 0, ca - PI / 2]);
        rbox(g, 0.12, 0.03, 0.02, 0.008, mat('aluminum'), [cx + rad.x * 0.04, cy + rad.y * 0.04, side * 0.03], [0, 0, ca - PI / 2]);
      },
      fasteners: [-1, 1].map((s) => ({
        type: 'bolt', pos: [cx + tang.x * s * 0.06 + rad.x * 0.05, cy + tang.y * s * 0.06 + rad.y * 0.05, -side * 0.01], axis: [rad.x, rad.y, 0],
      })),
      removeDir: [rad.x, rad.y, side * 0.5],
    });
    deps.push(`caliper_${tag}`);
  }

  if (o.hub) {
    v.addPart(`hub_${tag}`, {
      name: `Locking wheel hub (${tag})`, kind: 'wheel_hub', view, needsRaised: true,
      pos: [o.x, y, o.z - side * (o.w / 2 + 0.01)], deps: o.brakes !== false ? [`rotor_${tag}`] : [],
      build: (g, mat) => {
        cyl(g, 0.1, 0.1, 0.06, 32, mat('castIron'), null, [PI / 2, 0, 0]);
        cyl(g, 0.065, 0.07, 0.07, 6, mat('darkSteel'), [0, 0, side * 0.05], [PI / 2, 0, 0]);
        cyl(g, 0.04, 0.04, 0.03, 24, mat('aluminum'), [0, 0, side * 0.09], [PI / 2, 0, 0]);
      },
      fasteners: [0, 1, 2, 3, 4, 5].map((i) => {
        const a = (i / 6) * PI * 2;
        return { type: 'bolt', pos: [Math.cos(a) * 0.082, Math.sin(a) * 0.082, side * 0.031], axis: [0, 0, side] };
      }),
      removeDir: [0, 0, side],
    });
    deps.push(`hub_${tag}`);
  }

  if (o.strut) {
    v.addPart(`strut_${tag}`, {
      name: `Coilover strut (${tag})`, kind: 'strut', view, needsRaised: true,
      pos: [o.x - 0.02, y + 0.3, o.z - side * 0.27],
      build: (g, mat) => {
        cyl(g, 0.026, 0.026, 0.36, 18, mat('blackPaint'), [0, -0.08, 0]);
        cyl(g, 0.012, 0.012, 0.2, 12, mat('chrome'), [0, 0.15, 0]);
        const pts = [];
        for (let i = 0; i <= 140; i++) {
          const a = i * 0.32;
          pts.push(V3(Math.cos(a) * 0.055, -0.12 + i * 0.0018, Math.sin(a) * 0.055));
        }
        tube(g, pts, 0.008, mat('spring'), { segments: 260, radial: 6 });
        cyl(g, 0.075, 0.075, 0.012, 24, mat('aluminum'), [0, 0.135, 0]);
        cyl(g, 0.07, 0.07, 0.01, 24, mat('aluminum'), [0, -0.125, 0]);
        rbox(g, 0.06, 0.06, 0.05, 0.01, mat('darkSteel'), [0, -0.27, 0]);
      },
      fasteners: [-1, 1].map((s) => ({ type: 'bolt', pos: [s * 0.02, -0.27 + s * 0.012, side * 0.026], axis: [0, 0, side] })),
      removeDir: [0, -1, side],
    });
    deps.push(`strut_${tag}`);
  }

  const lugR = o.lugR || 0.055;
  const faceZ = side * (o.w / 2 - 0.035 + 0.012);
  const wheel = v.addPart(`wheel_${tag}`, {
    name: `Wheel & tyre (${tag})`, kind: o.wheelKind || 'wheel', view, isWheel: true, needsRaised: o.needsRaised !== false,
    pos: [o.x, y, o.z], deps,
    build: (g, mat) => wheelVisual(g, mat, { r: o.r, w: o.w, rimR: o.rimR || o.r * 0.68, side, style: o.style || 'alloy', rim: o.rim || 'billet', spokes: o.spokes || 5 }),
    fasteners: lugPositions(o.lugs || 5, lugR, faceZ, side),
    pattern: starPattern(o.lugs || 5),
    removeDir: [0, 0, side],
  });
  v.wheels.push({ spinner: wheel.group, radius: o.r, part: wheel });
  return wheel;
}

/** Small helper for a "fixed" component that carries serviceable fasteners (e.g. oil pan drain plug). */
export function fixedPart(v, id, def) {
  return v.addPart(id, { ...def, fixed: true });
}

/**
 * V-engine with full service DAG.
 * o: { ex, ey, cyl (6|8), turbo, needsHood, airboxPos, batteryPos, radiatorX, hoseTo }
 */
export function buildVEngine(v, o) {
  const perBank = o.cyl / 2;
  const spacing = perBank === 3 ? 0.135 : 0.11;
  const xs = [...Array(perBank).keys()].map((i) => (i - (perBank - 1) / 2) * spacing);
  const bankLen = spacing * perBank + 0.06;
  const ex = o.ex, ey = o.ey;
  const needsHood = o.needsHood !== false;
  const base = { needsHood, view: 'engine' };

  // ---- block, timing cover, pulleys, belt (static body)
  const blockMat = makeMat('enginePaint');
  const blk = new THREE.Group();
  blk.position.set(ex, ey, 0);
  v.body.add(blk);
  rbox(blk, bankLen + 0.04, 0.3, 0.34, 0.02, blockMat, [0, 0, 0]);
  for (const s of [-1, 1]) {
    const deck = rbox(blk, bankLen + 0.02, 0.16, 0.16, 0.02, blockMat, [0, 0.14, s * 0.1], [s * PI / 4, 0, 0]);
    deck.castShadow = true;
  }
  rbox(blk, 0.05, 0.36, 0.36, 0.02, makeMat('aluminum'), [bankLen / 2 + 0.04, 0.05, 0]);
  const pulleyM = makeMat('darkSteel');
  const pulleys = [[0.0, -0.08, 0.11], [0.15, 0.08, 0.06], [0.1, -0.05, 0.065], [0.12, 0.12, 0.05], [-0.12, 0.05, 0.05]];
  const belt = [];
  for (const [py, pz, pr] of pulleys) {
    cyl(blk, pr, pr, 0.03, 28, pulleyM, [bankLen / 2 + 0.08, py, pz], [0, 0, PI / 2]);
    belt.push(V3(bankLen / 2 + 0.08, py, pz));
  }
  tube(blk, belt, 0.006, makeMat('rubber'), { closed: true, segments: 80, radial: 4 });
  v.points.engine = blk;

  // ---- oil pan (fixed) with drain plug underneath
  fixedPart(v, 'oil_pan', {
    name: 'Oil pan', kind: 'oil_pan', view: 'under',
    pos: [ex, ey - 0.2, 0],
    build: (g, mat) => {
      rbox(g, bankLen, 0.12, 0.3, 0.025, mat('castIron'), [0, 0, 0]);
      for (let i = -3; i <= 3; i++) box(g, 0.006, 0.02, 0.28, mat('castIron'), [i * 0.05, -0.065, 0]);
    },
    fasteners: [{ type: 'plug', pos: [-bankLen / 2 + 0.06, -0.06, 0.05], axis: [0, -1, 0], size: 1.2 }],
  });

  // ---- oil filter on the right side of the block
  v.addPart('oil_filter', {
    ...base, name: 'Oil filter', kind: 'oil_filter', autoRemove: true,
    pos: [ex - 0.08, ey - 0.06, 0.17],
    build: (g, mat) => {
      cyl(g, 0.03, 0.03, 0.02, 20, mat('aluminum'), [0, 0, -0.005], [PI / 2, 0, 0]);
    },
    fasteners: [{ type: 'filter', pos: [0, 0, 0.005], axis: [0, 0, 1], mat: o.filterMat || 'filterBlue' }],
    removeDir: [0, 0, 1],
  });

  // ---- banks
  const bankFrames = {};
  for (const [tag, s] of [['L', -1], ['R', 1]]) {
    const f = new THREE.Group();
    f.position.set(ex, ey + 0.2, s * 0.15);
    f.rotation.x = s * PI / 4;
    v.group.add(f);
    bankFrames[tag] = f;
    const P = { ...base, parent: f };

    v.addPart(`head_gasket_${tag}`, {
      ...P, name: `Head gasket (bank ${tag})`, kind: 'head_gasket',
      pos: [0, 0.004, 0],
      build: (g, mat) => {
        box(g, bankLen, 0.006, 0.165, mat('steel'), null);
        for (const x of xs) cyl(g, 0.045, 0.045, 0.0065, 24, mat('darkSteel'), [x, 0, 0]);
      },
      removeDir: [0, 1, 0],
    });
    v.addPart(`head_${tag}`, {
      ...P, name: `Cylinder head (bank ${tag})`, kind: 'cylinder_head', deps: [`head_gasket_${tag}`],
      pos: [0, 0.067, 0],
      build: (g, mat) => {
        const m = mat('aluminum', { roughness: 0.55 });
        rbox(g, bankLen, 0.115, 0.17, 0.01, m, null);
        for (const x of xs) cyl(g, 0.012, 0.012, 0.02, 12, mat('aluminum'), [x, 0.06, 0]);
        for (let i = 0; i < 8; i++) box(g, bankLen - 0.02, 0.004, 0.004, m, [0, -0.04 + i * 0.012, s * 0.086]);
      },
      fasteners: [-1, 1].flatMap((a) => [-1, 1].map((b) => ({ type: 'bolt', pos: [a * (bankLen / 2 - 0.05), 0.058, b * 0.06], axis: [0, 1, 0], size: 1.15 }))),
      removeDir: [0, 1, 0],
    });
    v.addPart(`valve_cover_${tag}`, {
      ...P, name: `Valve cover (bank ${tag})`, kind: 'valve_cover', deps: [`head_${tag}`],
      pos: [0, 0.155, 0],
      build: (g, mat) => {
        const m = mat(o.coverPreset || 'redPaint');
        rbox(g, bankLen - 0.01, 0.05, 0.15, 0.02, m, null);
        for (let i = -3; i <= 3; i++) box(g, bankLen - 0.08, 0.008, 0.006, mat('aluminum'), [0, 0.027, i * 0.016]);
        if (tag === 'R') cyl(g, 0.022, 0.022, 0.02, 20, mat('plastic'), [-bankLen / 2 + 0.06, 0.035, -0.04]);
      },
      fasteners: [-1, 1].flatMap((a) => [-1, 1].map((b) => ({ type: 'bolt', pos: [a * (bankLen / 2 - 0.03), 0.025, b * 0.06], axis: [0, 1, 0], size: 0.75 }))),
      removeDir: [0, 1, 0],
    });
    v.addPart(`plugs_${tag}`, {
      ...P, name: `Spark plugs (bank ${tag})`, kind: perBank === 4 ? 'spark_plugs_v8' : 'spark_plugs', deps: [`head_${tag}`], autoRemove: true,
      pos: [0, 0.12, 0],
      build: () => {},
      fasteners: xs.map((x) => ({ type: 'spark', pos: [x, 0.0, 0], axis: [0, 1, 0] })),
      removeDir: [0, 1, 0],
    });
    v.addPart(`coils_${tag}`, {
      ...P, name: `Ignition coil pack (bank ${tag})`, kind: 'coil_pack', deps: [`plugs_${tag}`, `valve_cover_${tag}`], electrical: 'coil',
      pos: [0, 0.205, 0],
      build: (g, mat) => {
        const pm = mat('plastic');
        rbox(g, bankLen - 0.04, 0.03, 0.05, 0.01, pm, null);
        for (const x of xs) {
          cyl(g, 0.017, 0.017, 0.07, 16, mat('plastic', { color: 0x101012 }), [x, -0.03, 0]);
          rbox(g, 0.035, 0.025, 0.04, 0.006, mat('greyPlastic'), [x, 0.022, 0]);
        }
        box(g, 0.03, 0.018, 0.02, mat('greyPlastic'), [bankLen / 2 - 0.02, 0.01, 0.03]);
      },
      fasteners: [-1, 1].map((a) => ({ type: 'bolt', pos: [a * (bankLen / 2 - 0.03), 0.016, 0], axis: [0, 1, 0], size: 0.7 })),
      removeDir: [0, 1, 0],
    });
    v.addPart(`exhaust_manifold_${tag}`, {
      ...P, name: `Exhaust manifold (bank ${tag})`, kind: 'exhaust_manifold', deps: [`head_${tag}`],
      pos: [0, 0.06, s * 0.105],
      build: (g, mat) => {
        const m = mat('castIron', { noiseScale: 2 });
        rbox(g, bankLen - 0.02, 0.05, 0.02, 0.006, m, [0, 0, -s * 0.008]);
        for (const x of xs) tube(g, [[x, 0, 0], [x, -0.02, s * 0.04], [x * 0.8, -0.07, s * 0.06]], 0.018, m, { segments: 12, radial: 10 });
        tube(g, [[-bankLen / 2 + 0.01, -0.08, s * 0.065], [bankLen / 2 - 0.02, -0.07, s * 0.065], [bankLen / 2 + 0.04, -0.1, s * 0.07]], 0.024, m, { segments: 20 });
      },
      fasteners: [...xs.map((x) => ({ type: 'bolt', pos: [x + spacing * 0.4, 0.016, s * 0.004], axis: [0, 0, s], size: 0.9 }))],
      removeDir: [0, -0.2, s],
    });
    v.points[`manifold_${tag}`] = v.parts.get(`exhaust_manifold_${tag}`).group;

    if (o.turbo && tag === 'R') {
      v.addPart('turbo', {
        ...P, name: 'Turbocharger', kind: 'turbo', deps: ['exhaust_manifold_R'],
        pos: [bankLen / 2 + 0.06, -0.08, s * 0.2],
        build: (g, mat) => {
          const hot = mat('castIron', { noiseScale: 3 });
          const cold = mat('aluminum');
          torus(g, 0.05, 0.03, hot, [0, 0, -0.04], null);
          cyl(g, 0.045, 0.045, 0.06, 24, hot, [0, 0, -0.04], [PI / 2, 0, 0]);
          cyl(g, 0.03, 0.035, 0.05, 20, mat('steel'), [0, 0, 0.01], [PI / 2, 0, 0]);
          torus(g, 0.055, 0.032, cold, [0, 0, 0.065], null);
          cyl(g, 0.05, 0.05, 0.05, 28, cold, [0, 0, 0.065], [PI / 2, 0, 0]);
          cyl(g, 0.035, 0.035, 0.07, 20, cold, [0, 0, 0.115], [PI / 2, 0, 0], { open: true });
          tube(g, [[0.05, 0.0, 0.065], [0.09, 0.05, 0.065], [0.1, 0.11, 0.05]], 0.024, cold, { segments: 12 });
        },
        fasteners: [0, 1, 2].map((i) => {
          const a = (i / 3) * PI * 2 + 0.3;
          return { type: 'bolt', pos: [Math.cos(a) * 0.065, Math.sin(a) * 0.065, -0.01], axis: [0, 0, 1], size: 0.85 };
        }),
        removeDir: [0.4, -0.2, s],
      });
      v.points.turbo = v.parts.get('turbo').group;
    }
  }

  // ---- intake manifold in the valley (vehicle space)
  v.addPart('intake_manifold', {
    ...base, name: 'Intake manifold', kind: 'intake_manifold', deps: ['head_L', 'head_R'],
    pos: [ex, ey + 0.39, 0],
    build: (g, mat) => {
      const m = mat('aluminum', { roughness: 0.45 });
      rbox(g, bankLen - 0.02, 0.085, 0.16, 0.03, m, null);
      for (const s of [-1, 1]) for (const x of xs) {
        tube(g, [[x, -0.02, 0], [x, -0.05, s * 0.07], [x, -0.12, s * 0.12]], 0.017, m, { segments: 12, radial: 10 });
      }
      cyl(g, 0.045, 0.045, 0.06, 28, m, [bankLen / 2 + 0.01, 0.0, 0], [0, 0, PI / 2]);
      box(g, bankLen - 0.12, 0.012, 0.09, mat('blackPaint'), [0, 0.045, 0]);
    },
    fasteners: [-1, 1].flatMap((a) => [-1, 1].map((b) => ({ type: 'bolt', pos: [a * (bankLen / 2 - 0.05), 0.043, b * 0.055], axis: [0, 1, 0], size: 0.85 }))),
    removeDir: [0, 1, 0],
  });

  // ---- air box + filter + intake pipe
  const ab = o.airboxPos || [ex + 0.45, ey + 0.25, -0.38];
  const abMat = makeMat('plastic');
  rbox(v.body, 0.24, 0.12, 0.22, 0.02, abMat, [ab[0], ab[1], ab[2]]);
  v.addPart('air_filter', {
    ...base, name: 'Air filter element', kind: 'air_filter',
    pos: [ab[0], ab[1] + 0.065, ab[2]],
    build: (g, mat) => {
      rbox(g, 0.2, 0.025, 0.18, 0.006, mat('rubber', { color: 0xc23a1d, roughness: 0.6 }), null);
      for (let i = -8; i <= 8; i++) box(g, 0.006, 0.02, 0.16, mat('paper'), [i * 0.011, 0.01, 0]);
    },
    removeDir: [0, 1, 0],
  });
  v.addPart('airbox_lid', {
    ...base, name: 'Airbox lid', kind: 'airbox_lid', deps: ['air_filter'],
    pos: [ab[0], ab[1] + 0.09, ab[2]],
    build: (g, mat) => {
      rbox(g, 0.25, 0.04, 0.23, 0.015, mat('plastic'), null);
      cyl(g, 0.04, 0.04, 0.08, 20, mat('plastic'), [-0.12, 0.01, 0], [0, 0, PI / 2]);
    },
    fasteners: [-1, 1].map((a) => ({ type: 'screw', pos: [a * 0.11, 0.02, 0.1], axis: [0, 1, 0] })),
    removeDir: [0, 1, 0],
  });
  const ipDeps = ['intake_manifold'];
  if (o.turbo) ipDeps.push('turbo');
  v.addPart('intake_pipe', {
    ...base, name: o.turbo ? 'Charge pipe' : 'Intake tube', kind: 'intake_pipe', deps: ipDeps,
    pos: [ex, ey, 0],
    build: (g, mat) => {
      const m = o.turbo ? mat('aluminum', { roughness: 0.25 }) : mat('hose');
      const bankLenH = bankLen / 2;
      const pts = o.turbo
        ? [[bankLenH + 0.04, 0.39, 0], [bankLenH + 0.14, 0.38, 0.05], [bankLenH + 0.2, 0.3, 0.22], [bankLenH + 0.18, 0.18, 0.33]]
        : [[bankLenH + 0.04, 0.39, 0], [bankLenH + 0.14, 0.36, -0.1], [ab[0] - ex - 0.15, ab[1] - ey + 0.08, ab[2] + 0.02]];
      tube(g, pts, 0.03, m, { segments: 36, radial: 14 });
    },
    fasteners: o.turbo
      ? [{ type: 'clip', pos: [bankLen / 2 + 0.06, 0.39, 0], axis: [0, 1, 0] }, { type: 'clip', pos: [bankLen / 2 + 0.18, 0.2, 0.32], axis: [0, 0, 1] }]
      : [{ type: 'clip', pos: [bankLen / 2 + 0.06, 0.39, 0], axis: [0, 1, 0] }],
    removeDir: [0.3, 1, 0],
  });

  // ---- cooling: radiator (fixed, petcock) and upper hose
  const rx = o.radiatorX ?? ex + 0.62;
  const rs = o.radiatorSize || [0.06, 0.4, 0.62];
  const ry = o.radiatorY ?? ey + 0.08;
  fixedPart(v, 'radiator', {
    ...base, name: 'Radiator', kind: 'radiator',
    pos: [rx, ry, 0],
    build: (g, mat) => {
      box(g, rs[0], rs[1], rs[2], mat('aluminum', { roughness: 0.6 }), null);
      for (let i = 0; i < 26; i++) box(g, rs[0] + 0.004, 0.003, rs[2] - 0.04, mat('darkSteel'), [0, -rs[1] / 2 + 0.02 + i * (rs[1] - 0.04) / 25, 0], null, { cast: false });
      box(g, rs[0] + 0.02, 0.05, rs[2] + 0.02, mat('plastic'), [0, rs[1] / 2, 0]);
      box(g, rs[0] + 0.02, 0.05, rs[2] + 0.02, mat('plastic'), [0, -rs[1] / 2, 0]);
      cyl(g, 0.02, 0.02, 0.05, 16, mat('plastic'), [-0.03, rs[1] / 2 - 0.01, 0.15], [0, 0, PI / 2]);
    },
    fasteners: [{ type: 'petcock', pos: [-0.03, -rs[1] / 2 - 0.02, -rs[2] / 2 + 0.08], axis: [0, -1, 0] }],
  });
  v.addPart('radiator_hose', {
    ...base, name: 'Upper radiator hose', kind: 'radiator_hose', fluid: 'coolant',
    pos: [0, 0, 0],
    build: (g, mat) => {
      tube(g, [[rx - 0.05, ry + rs[1] / 2 - 0.01, 0.15], [rx - 0.14, ey + 0.3, 0.13], [ex + bankLen / 2 + 0.1, ey + 0.3, 0.06], [ex + bankLen / 2 + 0.05, ey + 0.26, 0.0]], 0.022, mat('hose'), { segments: 40, radial: 12 });
    },
    fasteners: [
      { type: 'clip', pos: [rx - 0.07, ry + rs[1] / 2 + 0.005, 0.15], axis: [-1, 0, 0] },
      { type: 'clip', pos: [ex + bankLen / 2 + 0.06, ey + 0.27, 0.0], axis: [0, 1, 0] },
    ],
    removeDir: [0, 1, 0],
  });

  // ---- battery
  const bp = o.batteryPos || [ex + 0.3, ey + 0.12, 0.5];
  v.addPart('battery', {
    ...base, name: '12V battery', kind: 'battery', electrical: 'battery',
    pos: bp,
    build: (g, mat) => {
      rbox(g, 0.26, 0.18, 0.17, 0.01, mat('plastic', { color: 0x1d1f22 }), null);
      box(g, 0.26, 0.02, 0.17, mat('greyPlastic'), [0, 0.095, 0]);
      cyl(g, 0.012, 0.012, 0.02, 12, mat('copper'), [0.08, 0.11, 0.05]);
      cyl(g, 0.012, 0.012, 0.02, 12, mat('steel'), [-0.08, 0.11, 0.05]);
      box(g, 0.08, 0.004, 0.03, mat('rubber', { color: 0xb51818 }), [0.08, 0.106, 0.05]);
      box(g, 0.3, 0.012, 0.03, mat('darkSteel'), [0, 0.1, -0.05]);
    },
    fasteners: [
      { type: 'bolt', pos: [0.08, 0.12, 0.05], axis: [0, 1, 0], size: 0.7 },
      { type: 'bolt', pos: [0.13, 0.11, -0.05], axis: [0, 1, 0], size: 0.8 },
    ],
    removeDir: [0, 1, 0],
  });

  // oil fill point on the right valve cover
  const fill = new THREE.Object3D();
  fill.position.set(-bankLen / 2 + 0.06, 0.2, -0.04);
  bankFrames.R.add(fill);
  v.points.oilFill = fill;
  const cfill = new THREE.Object3D();
  cfill.position.set(rx - 0.03, ry + rs[1] / 2 + 0.03, 0.15);
  v.group.add(cfill);
  v.points.coolantFill = cfill;
  v.points.drainPlug = v.parts.get('oil_pan').fasteners[0].group;
  return { bankLen, bankFrames };
}

/** Simple emissive lamp lens. */
export function lamp(parent, w, h, d, color, pos, rot) {
  const m = new THREE.MeshPhysicalMaterial({ color, emissive: color, emissiveIntensity: 0.15, roughness: 0.1, clearcoat: 1, metalness: 0.1 });
  const l = rbox(parent, w, h, d, Math.min(w, h, d) * 0.3, m, pos, rot);
  return l;
}
