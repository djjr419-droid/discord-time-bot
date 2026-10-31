// Motorcycle.js — air-cooled parallel-twin standard: tubular cradle frame, chain final drive,
// carburetor with pod filter, exposed header/muffler. Sits on a rear paddock stand.
import * as THREE from 'three';
import { box, rbox, cyl, sphere, tube, mesh, V3 } from '../Kit.js';
import { makeMat, carPaint } from '../Materials.js';
import { wheelVisual, lamp } from './common.js';

const PI = Math.PI;

export function buildMotorcycle(v, job) {
  v.engineSpec = { cylinders: 2, idle: 1150, redline: 9000, character: 'twin' };
  v.fluids.coolant = { level: 1, pressurized: false, none: true };
  const paint = (v.paintMat = carPaint(job.color));
  const frameM = makeMat('blackPaint', { roughness: 0.4 });
  const chrome = makeMat('chrome');
  const B = v.body;
  const FX = 0.72, RX = -0.72, R = 0.31;

  // ---------------------------------------------------------------- frame, tank, seat area, forks
  const head = V3(0.5, 0.98, 0);
  for (const s of [-1, 1]) {
    tube(B, [head, V3(0.2, 0.86, s * 0.06), V3(-0.25, 0.8, s * 0.08), V3(-0.62, 0.78, s * 0.09), V3(-0.85, 0.82, s * 0.08)], 0.016, frameM, { segments: 40 });
    tube(B, [head, V3(0.42, 0.6, s * 0.05), V3(0.3, 0.26, s * 0.08), V3(0.0, 0.2, s * 0.09), V3(-0.18, 0.3, s * 0.09), V3(-0.18, 0.62, s * 0.09), V3(-0.25, 0.8, s * 0.08)], 0.016, frameM, { segments: 60 });
    // swingarm
    tube(B, [V3(-0.15, 0.4, s * 0.1), V3(RX, R, s * 0.1)], 0.018, frameM, { segments: 4 });
    // rear shock
    cyl(B, 0.022, 0.022, 0.32, 12, makeMat('spring'), [-0.56, 0.56, s * 0.11], [0, 0, -0.35]);
    cyl(B, 0.01, 0.01, 0.36, 8, chrome, [-0.56, 0.56, s * 0.11], [0, 0, -0.35]);
    // forks
    const fork = V3(FX, R, s * 0.075);
    const top = V3(0.52, 1.02, s * 0.075);
    const d = top.clone().sub(fork);
    const leg = mesh(B, new THREE.CylinderGeometry(0.019, 0.019, d.length(), 14), chrome);
    leg.position.copy(fork).addScaledVector(d, 0.55);
    leg.quaternion.setFromUnitVectors(V3(0, 1, 0), d.clone().normalize());
    const slider = mesh(B, new THREE.CylinderGeometry(0.026, 0.026, 0.3, 14), makeMat('aluminum'));
    slider.position.copy(fork).addScaledVector(d, 0.2);
    slider.quaternion.copy(leg.quaternion);
    // footpegs
    cyl(B, 0.012, 0.012, 0.1, 8, makeMat('rubber'), [-0.12, 0.3, s * 0.17], [PI / 2, 0, 0]);
    // mirrors
    tube(B, [V3(0.48, 1.12, s * 0.3), V3(0.46, 1.25, s * 0.33)], 0.006, chrome, { segments: 3 });
    sphere(B, 0.035, chrome, [0.46, 1.27, s * 0.33], { scale: [0.5, 1, 1] });
  }
  rbox(B, 0.06, 0.04, 0.24, 0.01, makeMat('aluminum'), [0.53, 1.02, 0]); // triple clamp
  tube(B, [V3(0.48, 1.1, -0.36), V3(0.5, 1.08, -0.15), V3(0.52, 1.06, 0), V3(0.5, 1.08, 0.15), V3(0.48, 1.1, 0.36)], 0.011, chrome, { segments: 24 });
  for (const s of [-1, 1]) cyl(B, 0.017, 0.017, 0.12, 10, makeMat('rubber'), [0.48, 1.1, s * 0.33], [PI / 2, 0, 0]);
  sphere(B, 0.085, chrome, [0.66, 0.98, 0], { scale: [0.9, 1, 1] });
  lamp(B, 0.02, 0.12, 0.12, 0xf3f6ff, [0.735, 0.98, 0]);
  const tank = sphere(B, 0.2, paint, [0.18, 0.92, 0], { scale: [1.45, 0.62, 0.7], seg: 32 });
  cyl(B, 0.03, 0.03, 0.015, 16, chrome, [0.12, 1.04, 0]);
  // fenders
  mesh(B, new THREE.TorusGeometry(R + 0.03, 0.05, 8, 24, PI * 0.55), paint, [FX, R, 0], [0, 0, PI * 0.12], { scale: [1, 1, 0.9] });
  mesh(B, new THREE.TorusGeometry(R + 0.04, 0.06, 8, 24, PI * 0.5), paint, [RX, R, 0], [0, 0, PI * 0.45], { scale: [1, 1, 0.9] });
  lamp(B, 0.03, 0.04, 0.1, 0xff1a14, [-0.99, 0.72, 0]);
  v.points.tail_1 = B.children[B.children.length - 1];
  // side covers
  for (const s of [-1, 1]) rbox(B, 0.2, 0.12, 0.02, 0.02, paint, [-0.42, 0.66, s * 0.13]);

  // ---------------------------------------------------------------- engine (static block)
  const eng = makeMat('aluminum', { roughness: 0.42 });
  const fins = makeMat('blackPaint', { roughness: 0.5 });
  const E = new THREE.Group(); E.position.set(0.02, 0, 0); B.add(E);
  rbox(E, 0.38, 0.22, 0.26, 0.04, eng, [0, 0.38, 0]);
  cyl(E, 0.1, 0.1, 0.04, 28, eng, [0.02, 0.38, 0.14], [PI / 2, 0, 0]);
  const cylG = new THREE.Group(); cylG.position.set(0.04, 0.5, 0); cylG.rotation.z = -0.25; E.add(cylG);
  for (let i = 0; i < 13; i++) rbox(cylG, 0.2, 0.008, 0.26, 0.003, fins, [0, 0.01 + i * 0.016, 0], null, { cast: i % 3 === 0 });
  rbox(cylG, 0.17, 0.2, 0.22, 0.02, eng, [0, 0.1, 0]);
  rbox(cylG, 0.2, 0.05, 0.27, 0.02, eng, [0, 0.235, 0]);
  v.points.engine = E;

  // ---------------------------------------------------------------- serviceable parts
  v.addPart('oil_pan', {
    name: 'Engine sump', kind: 'oil_pan', fixed: true, view: 'under',
    pos: [0.02, 0.27, 0],
    build: (g, mat) => rbox(g, 0.3, 0.06, 0.2, 0.02, mat('aluminum'), null),
    fasteners: [{ type: 'plug', pos: [0.06, -0.03, 0.04], axis: [0, -1, 0] }],
  });
  v.points.drainPlug = v.parts.get('oil_pan').fasteners[0].group;
  const oilFill = new THREE.Object3D(); oilFill.position.set(-0.1, 0.5, 0.12); B.add(oilFill); v.points.oilFill = oilFill;

  v.addPart('oil_filter', {
    name: 'Oil filter', kind: 'oil_filter', autoRemove: true, view: 'engine',
    pos: [0.19, 0.36, 0.1],
    build: (g, mat) => cyl(g, 0.025, 0.025, 0.02, 16, mat('aluminum'), null, [PI / 2, 0, 0]),
    fasteners: [{ type: 'filter', pos: [0, 0, 0.01], axis: [0.55, 0, 0.83], size: 0.7, mat: 'blackPaint' }],
    removeDir: [0.5, 0, 0.8],
  });

  v.addPart('spark_plug', {
    name: 'Spark plug', kind: 'spark_plug_moto', autoRemove: true, view: 'engine',
    pos: [0.11, 0.7, 0.13],
    build: (g, mat) => {
      tube(g, [[0.0, 0.07, 0.03], [-0.05, 0.12, 0.0], [-0.15, 0.14, -0.05]], 0.006, mat('hose', { color: 0x111111 }), { segments: 12 });
    },
    fasteners: [{ type: 'spark', pos: [0, 0, 0], axis: [0.15, 0.4, 0.9] }],
    removeDir: [0, 0.4, 0.9],
  });

  v.addPart('carburetor', {
    name: 'Carburetor', kind: 'carburetor', view: 'engine',
    pos: [-0.13, 0.63, 0.04],
    build: (g, mat) => {
      const m = mat('aluminum', { roughness: 0.5 });
      rbox(g, 0.1, 0.09, 0.08, 0.015, m, null);
      cyl(g, 0.035, 0.035, 0.05, 18, m, [0, -0.07, 0]);
      cyl(g, 0.028, 0.028, 0.06, 18, m, [0, 0.07, 0]);
      cyl(g, 0.03, 0.03, 0.06, 18, mat('rubber'), [0.07, 0, 0], [0, 0, PI / 2]);
      cyl(g, 0.012, 0.012, 0.04, 8, mat('brass'), [0, -0.02, 0.05], [PI / 2, 0, 0]);
    },
    fasteners: [
      { type: 'clip', pos: [0.085, 0, 0], axis: [1, 0, 0], size: 1.25 },
      { type: 'clip', pos: [-0.055, 0, 0], axis: [-1, 0, 0], size: 1.25 },
    ],
    removeDir: [0, 0.3, 1],
  });
  v.addPart('air_pod', {
    name: 'Pod air filter', kind: 'air_pod', view: 'engine', deps: ['carburetor'],
    pos: [-0.25, 0.63, 0.04],
    build: (g, mat) => {
      cyl(g, 0.045, 0.06, 0.11, 22, mat('rubber', { color: 0xa8211c, roughness: 0.75 }), null, [0, 0, PI / 2]);
      cyl(g, 0.062, 0.062, 0.01, 22, mat('chrome'), [-0.06, 0, 0], [0, 0, PI / 2]);
    },
    fasteners: [{ type: 'clip', pos: [0.05, 0, 0], axis: [1, 0, 0], size: 1.5 }],
    removeDir: [-0.4, 0, 1],
  });

  v.addPart('exhaust_header', {
    name: 'Exhaust header pipe', kind: 'exhaust_header', view: 'engine',
    pos: [0.17, 0.62, 0.04],
    build: (g, mat) => {
      tube(g, [[0, 0, 0], [0.08, -0.06, 0.03], [0.1, -0.22, 0.07], [0.0, -0.36, 0.09], [-0.25, -0.38, 0.09], [-0.45, -0.35, 0.09]], 0.022, mat('chrome', { roughness: 0.12 }), { segments: 60, radial: 12 });
      box(g, 0.012, 0.07, 0.06, mat('steel'), [0.005, 0, 0]);
    },
    fasteners: [{ type: 'bolt', pos: [0.012, 0.028, 0], axis: [1, 0, 0], size: 0.75 }, { type: 'bolt', pos: [0.012, -0.028, 0], axis: [1, 0, 0], size: 0.75 }],
    removeDir: [0.3, -0.5, 1],
  });
  v.points.manifold_R = v.parts.get('exhaust_header').group;
  v.addPart('muffler', {
    name: 'Muffler', kind: 'muffler', view: 'wheel_R', deps: ['exhaust_header'],
    pos: [-0.56, 0.33, 0.13],
    build: (g, mat) => {
      const d = V3(-0.5, 0.17, 0.0);
      const can = mesh(g, new THREE.CylinderGeometry(0.06, 0.055, d.length(), 22), mat('chrome', { roughness: 0.15 }));
      can.position.copy(d).multiplyScalar(0.5);
      can.quaternion.setFromUnitVectors(V3(0, 1, 0), d.clone().normalize());
      sphere(g, 0.035, mat('darkSteel'), [-0.5, 0.17, 0], { scale: [0.4, 1, 1] });
      box(g, 0.03, 0.12, 0.01, mat('darkSteel'), [-0.25, 0.14, -0.05]);
    },
    fasteners: [
      { type: 'bolt', pos: [0.02, 0.0, 0.06], axis: [0, 0, 1], size: 0.8 },
      { type: 'bolt', pos: [-0.25, 0.19, -0.04], axis: [0, 0, 1], size: 0.8 },
    ],
    removeDir: [-0.4, 0, 1],
  });
  const ex = new THREE.Object3D(); ex.position.set(-1.08, 0.5, 0.13); B.add(ex); v.points.exhaust = ex;

  v.addPart('battery', {
    name: '12V battery', kind: 'battery_moto', electrical: 'battery', view: 'engine',
    pos: [-0.42, 0.68, 0],
    build: (g, mat) => {
      rbox(g, 0.15, 0.1, 0.09, 0.008, mat('plastic', { color: 0x202224 }), null);
      cyl(g, 0.007, 0.007, 0.012, 8, mat('copper'), [0.05, 0.055, 0.02]);
    },
    fasteners: [{ type: 'bolt', pos: [0.05, 0.062, 0.02], axis: [0, 1, 0], size: 0.6 }, { type: 'bolt', pos: [-0.05, 0.055, 0.02], axis: [0, 1, 0], size: 0.6 }],
    removeDir: [0, 1, 0.3],
  });
  v.addPart('seat', {
    name: 'Seat', kind: 'seat', view: 'engine', deps: ['battery'],
    pos: [-0.42, 0.84, 0],
    build: (g, mat) => {
      rbox(g, 0.62, 0.09, 0.26, 0.04, mat('plastic', { color: 0x141414, roughness: 0.85 }), null);
      box(g, 0.6, 0.01, 0.27, mat('chrome'), [0, -0.045, 0]);
    },
    fasteners: [{ type: 'screw', pos: [-0.27, 0.046, 0.08], axis: [0, 1, 0] }, { type: 'screw', pos: [-0.27, 0.046, -0.08], axis: [0, 1, 0] }],
    removeDir: [0, 1, 0],
  });

  // wheels, brake, final drive
  const front = v.addPart('front_wheel', {
    name: 'Front wheel', kind: 'wheel_moto', view: 'wheel_F', isWheel: true, deps: [],
    pos: [FX, R, 0],
    build: (g, mat) => {
      wheelVisual(g, mat, { r: R, w: 0.11, rimR: 0.25, side: 1, style: 'spoke', rim: 'chrome' });
      const disc = cyl(g, 0.14, 0.14, 0.005, 40, mat('steel', { roughness: 0.25 }), [0, 0, 0.062], [PI / 2, 0, 0]);
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * PI * 2;
        cyl(g, 0.006, 0.006, 0.007, 8, mat('darkSteel'), [Math.cos(a) * 0.11, Math.sin(a) * 0.11, 0.062], [PI / 2, 0, 0], { cast: false });
      }
      disc.castShadow = true;
    },
    fasteners: [{ type: 'axle', pos: [0, 0, 0.078], axis: [0, 0, 1] }, { type: 'bolt', pos: [0.0, -0.03, -0.098], axis: [0, 0, -1], size: 0.8 }],
    removeDir: [0, -0.3, 1],
  });
  v.wheels.push({ spinner: front.group, radius: R, part: front });

  const ca = PI * 0.82, cr = 0.125;
  const cx = Math.cos(ca) * cr, cy = Math.sin(ca) * cr;
  v.addPart('front_pads', {
    name: 'Front brake pads', kind: 'brake_pads_moto', view: 'wheel_F',
    pos: [FX, R, 0.062],
    build: (g, mat) => { for (const s of [-1, 1]) box(g, 0.05, 0.03, 0.006, mat('padFriction'), [cx, cy, s * 0.007], [0, 0, ca - PI / 2]); },
    removeDir: [Math.cos(ca), Math.sin(ca), 0],
  });
  v.addPart('front_caliper', {
    name: 'Front brake caliper', kind: 'caliper_moto', view: 'wheel_F', deps: ['front_wheel', 'front_pads'],
    pos: [FX, R, 0.062],
    build: (g, mat) => rbox(g, 0.08, 0.05, 0.05, 0.012, mat('aluminum', { color: 0xd4a017, metalness: 0.6 }), [cx, cy, 0], [0, 0, ca - PI / 2]),
    fasteners: [-1, 1].map((s) => ({ type: 'bolt', pos: [cx + -Math.sin(ca) * s * 0.03 + Math.cos(ca) * 0.03, cy + Math.cos(ca) * s * 0.03 + Math.sin(ca) * 0.03, 0.02], axis: [0, 0, 1], size: 0.7 })),
    removeDir: [Math.cos(ca), Math.sin(ca), 0.6],
  });

  const rear = v.addPart('rear_wheel', {
    name: 'Rear wheel', kind: 'wheel_moto', view: 'wheel_R', isWheel: true,
    pos: [RX, R, 0],
    build: (g, mat) => {
      wheelVisual(g, mat, { r: R, w: 0.14, rimR: 0.24, side: 1, style: 'spoke', rim: 'chrome' });
      sprocket(g, mat('steel', { roughness: 0.35 }), 0.1, 38, [0, 0, 0.085]);
    },
    fasteners: [{ type: 'axle', pos: [0, 0, 0.11], axis: [0, 0, 1] }],
    removeDir: [0, -0.2, 1],
  });
  v.wheels.push({ spinner: rear.group, radius: R, part: rear });

  const FS = V3(-0.1, 0.4, 0.085);
  v.addPart('front_sprocket', {
    name: 'Front sprocket', kind: 'front_sprocket', view: 'engine',
    pos: [FS.x, FS.y, FS.z],
    build: (g, mat) => sprocket(g, mat('steel', { roughness: 0.35 }), 0.042, 15, [0, 0, 0]),
    fasteners: [{ type: 'bolt', pos: [0, 0, 0.008], axis: [0, 0, 1], size: 0.9 }],
    removeDir: [0, 0, 1],
  });

  // chain loop
  const curve = chainCurve(V3(RX, R, 0.085), 0.1, FS, 0.042);
  const chainPart = v.addPart('chain', {
    name: 'Drive chain', kind: 'chain', view: 'wheel_R', deps: ['rear_wheel', 'front_sprocket'],
    pos: [0, 0, 0],
    build: (g, mat) => {
      const n = 120;
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.015, 0.008, 0.016), mat('chain'), n);
      im.castShadow = true;
      g.add(im);
      v.chain = { mesh: im, curve, n, offset: 0 };
      layoutChain(v.chain);
    },
    fasteners: [{ type: 'clip', pos: [...curve.getPointAt(0.25).toArray()], axis: [0, 0, 1], size: 0.35 }],
    removeDir: [0, -0.2, 1],
  });
  chainPart.group.traverse((o) => { if (o.isInstancedMesh) o.userData.interact = { kind: 'part', ref: chainPart }; });

  // paddock stand (static, on the deck)
  const st = makeMat('redPaint');
  for (const s of [-1, 1]) {
    box(B, 0.04, 0.3, 0.04, st, [RX - 0.05, 0.16, s * 0.18]);
    box(B, 0.3, 0.03, 0.04, st, [RX + 0.05, 0.02, s * 0.18]);
  }
  box(B, 0.04, 0.04, 0.4, st, [RX - 0.05, 0.3, 0]);

  v.animators = [(dt, rpm) => {
    if (!v.chain || v.parts.get('chain').state !== 'installed') return;
    const speed = rpm / 9000;
    v.chain.offset = (v.chain.offset + dt * speed * 0.9) % 1;
    layoutChain(v.chain);
    if (rear.state === 'installed') rear.group.rotation.z -= dt * speed * 12;
  }];

  v.focal = {
    engine:  { pos: [0.05, 0.98, 1.3], look: [-0.05, 0.56, 0.02], label: 'Engine' },
    wheel_F: { pos: [0.9, 0.62, 1.1], look: [0.72, 0.33, 0.05], label: 'Front wheel' },
    wheel_R: { pos: [-0.68, 0.62, 1.15], look: [-0.6, 0.36, 0.05], label: 'Rear / chain' },
    under:   { pos: [0.1, 0.32, 1.05], look: [0.05, 0.28, 0], label: 'Low view' },
  };
}

function sprocket(g, m, r, teeth, pos) {
  const s = cyl(g, r, r, 0.006, 32, m, pos, [PI / 2, 0, 0]);
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * PI * 2;
    box(g, 0.008, 0.012, 0.006, m, [pos[0] + Math.cos(a) * (r + 0.005), pos[1] + Math.sin(a) * (r + 0.005), pos[2]], [0, 0, a - PI / 2], { cast: false });
  }
  cyl(g, r * 0.4, r * 0.4, 0.012, 20, m, pos, [PI / 2, 0, 0]);
  return s;
}

function chainCurve(rc, rr, fc, fr) {
  const pts = [];
  // rear sprocket: around the back (90° → 270°)
  for (let i = 0; i <= 12; i++) { const a = PI / 2 + (i / 12) * PI; pts.push(V3(rc.x + Math.cos(a) * (rr + 0.006), rc.y + Math.sin(a) * (rr + 0.006), rc.z)); }
  // bottom run
  for (let i = 1; i < 8; i++) { const t = i / 8; pts.push(V3(rc.x + (fc.x - rc.x) * t, rc.y - rr - 0.006 + ((fc.y - fr) - (rc.y - rr)) * t - Math.sin(t * PI) * 0.015, rc.z)); }
  // front sprocket: around the front (270° → 450°)
  for (let i = 0; i <= 8; i++) { const a = -PI / 2 + (i / 8) * PI; pts.push(V3(fc.x + Math.cos(a) * (fr + 0.006), fc.y + Math.sin(a) * (fr + 0.006), fc.z)); }
  for (let i = 1; i < 8; i++) { const t = i / 8; pts.push(V3(fc.x + (rc.x - fc.x) * t, fc.y + fr + 0.006 + ((rc.y + rr) - (fc.y + fr)) * t, rc.z)); }
  return new THREE.CatmullRomCurve3(pts, true, 'centripetal');
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _t = new THREE.Vector3();
function layoutChain(ch) {
  for (let i = 0; i < ch.n; i++) {
    const u = (i / ch.n + ch.offset) % 1;
    const p = ch.curve.getPointAt(u);
    ch.curve.getTangentAt(u, _t);
    _q.setFromUnitVectors(V3(1, 0, 0), _t);
    _m.compose(p, _q, new THREE.Vector3(1, 1, 1));
    ch.mesh.setMatrixAt(i, _m);
  }
  ch.mesh.instanceMatrix.needsUpdate = true;
  ch.mesh.computeBoundingSphere();
}
