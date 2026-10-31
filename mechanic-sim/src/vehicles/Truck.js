// Truck.js — body-on-frame 4x4 utility truck: V8, solid axles, leaf springs, transfer case, locking hubs.
import * as THREE from 'three';
import { box, rbox, cyl, sphere, tube, extrude, mesh, V3 } from '../Kit.js';
import { makeMat, carPaint, glassMaterial } from '../Materials.js';
import { buildCorner, buildVEngine, lamp } from './common.js';

const PI = Math.PI;

export function buildTruck(v, job) {
  v.engineSpec = { cylinders: 8, idle: 680, redline: 5600, character: 'v8' };
  const paint = (v.paintMat = carPaint(job.color));
  paint.metalness = 0.35; paint.roughness = 0.38;
  const trim = makeMat('blackPaint', { roughness: 0.7 });
  const chrome = makeMat('chrome');
  const frameM = makeMat('blackPaint', { roughness: 0.55 });
  const B = v.body;

  // ---------------------------------------------------------------- ladder frame & axles
  for (const s of [-1, 1]) box(B, 5.1, 0.16, 0.07, frameM, [0.05, 0.66, s * 0.46]);
  for (const x of [2.45, 1.2, 0.0, -1.2, -2.4]) box(B, 0.08, 0.1, 0.9, frameM, [x, 0.66, 0]);
  const axleM = makeMat('castIron');
  for (const [x, w] of [[1.75, 1.5], [-1.65, 1.6]]) {
    cyl(B, 0.05, 0.05, w, 16, axleM, [x, 0.42, 0], [PI / 2, 0, 0]);
    sphere(B, 0.15, axleM, [x, 0.42, 0.05], { scale: [1, 1, 0.8] });
  }
  // front leaf/coil + steering visuals
  for (const s of [-1, 1]) {
    cyl(B, 0.035, 0.035, 0.32, 12, makeMat('spring'), [1.75, 0.62, s * 0.55]);
    cyl(B, 0.02, 0.02, 1.2, 10, makeMat('darkSteel'), [1.95, 0.4, 0], [PI / 2, 0, 0]);
  }
  // transfer case & front shaft (static) — rear output gets the serviceable seal + shaft
  const tcM = makeMat('aluminum', { roughness: 0.6 });
  rbox(B, 0.7, 0.3, 0.32, 0.05, tcM, [0.9, 0.62, 0]); // transmission
  rbox(B, 0.34, 0.34, 0.36, 0.06, tcM, [0.32, 0.6, 0.12]); // transfer case
  v.points.transferCase = B.children[B.children.length - 1];
  cyl(B, 0.03, 0.03, 1.5, 14, makeMat('darkSteel'), [1.05, 0.5, 0.12], [0, 0, PI / 2 + 0.08]);

  v.addPart('tc_seal', {
    name: 'Transfer case output seal', kind: 'tc_seal', view: 'under', needsRaised: true,
    pos: [0.13, 0.6, 0.12],
    build: (g, mat) => {
      const r = mesh(g, new THREE.TorusGeometry(0.045, 0.012, 10, 28), mat('rubber', { color: 0x3a2a1c }), null, [0, PI / 2, 0]);
      r.castShadow = true;
    },
    removeDir: [-1, 0, 0],
  });
  v.addPart('driveshaft_rear', {
    name: 'Rear driveshaft', kind: 'driveshaft', view: 'under', needsRaised: true, deps: ['tc_seal'],
    pos: [0.08, 0.6, 0.12],
    build: (g, mat) => {
      const m = mat('darkSteel');
      const len = 1.62;
      const a = V3(0, 0, 0), b = V3(-len, -0.16, -0.07);
      const d = b.clone().sub(a);
      const shaft = mesh(g, new THREE.CylinderGeometry(0.038, 0.038, d.length() - 0.1, 18), m);
      shaft.position.copy(a).addScaledVector(d, 0.5);
      shaft.quaternion.setFromUnitVectors(V3(0, 1, 0), d.clone().normalize());
      for (const p of [a, b]) {
        const f = cyl(g, 0.06, 0.06, 0.02, 20, mat('steel'), [p.x, p.y, p.z], [0, 0, PI / 2]);
        f.position.x += p === a ? -0.02 : 0.02;
      }
      sphere(g, 0.04, mat('steel'), [-0.08, -0.008, -0.004]);
      sphere(g, 0.04, mat('steel'), [-len + 0.08, -0.15, -0.066]);
    },
    fasteners: [
      ...[1, -1].map((s) => ({ type: 'bolt', pos: [-0.035, s * 0.04, 0], axis: [-1, 0, 0], size: 0.9 })),
      ...[1, -1].map((s) => ({ type: 'bolt', pos: [-1.6, -0.16 + s * 0.04, -0.07], axis: [1, 0, 0], size: 0.9 })),
    ],
    removeDir: [0, -1, 0],
  });

  // ---------------------------------------------------------------- rear leaf springs (need a floor jack)
  for (const [tag, s] of [['RL', -1], ['RR', 1]]) {
    v.addPart(`leaf_${tag}`, {
      name: `Rear leaf spring (${tag === 'RL' ? 'left' : 'right'})`, kind: 'leaf_spring', view: 'under', needsRaised: true, requires: ['floor_jack'],
      pos: [-1.65, 0, s * 0.62],
      build: (g, mat) => {
        const m = mat('leaf');
        const sy = 0.22;
        for (let i = 0; i < 4; i++) {
          const half = 0.68 - i * 0.13;
          const dy = -i * 0.016;
          const pts = [V3(-half, (0.6 - 0.1 * (1 - (half / 0.68) ** 2) + dy) / sy, 0), V3(-half * 0.5, (0.525 + dy) / sy, 0), V3(0, (0.5 + dy) / sy, 0), V3(half * 0.5, (0.525 + dy) / sy, 0), V3(half, (0.6 - 0.1 * (1 - (half / 0.68) ** 2) + dy) / sy, 0)];
          const t = mesh(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.035, 8), m);
          t.scale.set(1, sy, 1);
        }
        // eyes, shackle, U-bolts and plate
        for (const x of [-0.68, 0.68]) cyl(g, 0.025, 0.025, 0.08, 14, mat('darkSteel'), [x, 0.6, 0], [PI / 2, 0, 0]);
        box(g, 0.03, 0.1, 0.07, mat('darkSteel'), [0.7, 0.64, 0]);
        const ub = mat('goldZinc');
        for (const x of [-0.06, 0.06]) {
          mesh(g, new THREE.TorusGeometry(0.055, 0.009, 8, 20, PI), ub, [x, 0.5, 0], [0, PI / 2, 0]);
          for (const z of [-0.055, 0.055]) cyl(g, 0.009, 0.009, 0.17, 8, ub, [x, 0.415, z]);
        }
        box(g, 0.18, 0.016, 0.14, mat('darkSteel'), [0, 0.33, 0]);
      },
      fasteners: [
        ...[-0.06, 0.06].flatMap((x) => [-0.055, 0.055].map((z) => ({ type: 'ubolt', pos: [x, 0.322, z], axis: [0, -1, 0], size: 1.1 }))),
        { type: 'bolt', pos: [-0.68, 0.6, s * 0.045], axis: [0, 0, s], size: 1.2 },
        { type: 'bolt', pos: [0.7, 0.62, s * 0.04], axis: [0, 0, s], size: 1.1 },
      ],
      removeDir: [0, -1, 0],
    });
  }

  // ---------------------------------------------------------------- cab & front clip
  const cabX = 0.45;
  rbox(B, 1.6, 0.62, 1.96, 0.08, paint, [cabX, 1.17, 0]);
  const gh = new THREE.Shape();
  gh.moveTo(1.18, 1.46); gh.lineTo(0.92, 1.98); gh.lineTo(-0.28, 1.98); gh.lineTo(-0.32, 1.46); gh.closePath();
  extrude(B, gh, 1.84, glassMaterial(), null, null, { bevel: 0.03 });
  rbox(B, 1.26, 0.06, 1.9, 0.03, paint, [0.32, 2.0, 0]);
  for (const s of [-1, 1]) {
    // pillars & door seams
    for (const [x0, y0, x1, y1] of [[1.18, 1.46, 0.92, 1.98], [-0.3, 1.46, -0.28, 1.98], [0.42, 1.46, 0.42, 1.98]]) {
      const a = V3(x0, y0, s * 0.94), b2 = V3(x1, y1, s * 0.94);
      const d = b2.clone().sub(a);
      const p = mesh(B, new THREE.BoxGeometry(0.06, d.length(), 0.05), paint);
      p.position.copy(a).addScaledVector(d, 0.5);
      p.quaternion.setFromUnitVectors(V3(0, 1, 0), d.normalize());
    }
    box(B, 0.004, 0.6, 0.004, trim, [0.42, 1.16, s * 0.985], null, { cast: false });
    rbox(B, 0.2, 0.16, 0.06, 0.02, trim, [1.05, 1.6, s * 1.05]);
    box(B, 1.2, 0.04, 0.16, trim, [cabX, 0.86, s * 0.95]); // running boards
    // fenders + flares
    rbox(B, 1.38, 0.42, 0.36, 0.06, paint, [1.88, 1.13, s * 0.8]);
    rbox(B, 0.95, 0.1, 0.12, 0.04, trim, [1.78, 0.94, s * 1.0]);
    rbox(B, 0.95, 0.1, 0.12, 0.04, trim, [-1.65, 0.97, s * 1.0]);
    lamp(B, 0.05, 0.16, 0.24, 0xe9efff, [2.6, 1.2, s * 0.68]);
    lamp(B, 0.04, 0.3, 0.12, 0xff1a14, [-2.78, 1.2, s * 0.86]);
    v.points[`tail_${s}`] = B.children[B.children.length - 1];
  }
  // grille & bumper
  rbox(B, 0.08, 0.4, 1.1, 0.02, trim, [2.6, 1.13, 0]);
  for (let i = 0; i < 5; i++) box(B, 0.02, 0.02, 1.06, chrome, [2.645, 0.97 + i * 0.075, 0], null, { cast: false });
  rbox(B, 0.18, 0.2, 2.0, 0.03, makeMat('darkSteel', { roughness: 0.5 }), [2.72, 0.78, 0]);
  rbox(B, 0.14, 0.16, 2.0, 0.03, makeMat('darkSteel', { roughness: 0.5 }), [-2.82, 0.8, 0]);
  // engine bay walls
  const bay = makeMat('blackPaint', { roughness: 0.75 });
  for (const s of [-1, 1]) box(B, 1.32, 0.5, 0.03, bay, [1.9, 1.1, s * 0.61]);
  box(B, 0.03, 0.6, 1.3, bay, [1.24, 1.15, 0]);

  // bed
  const bedM = paint;
  box(B, 2.38, 0.05, 1.8, makeMat('blackPaint', { roughness: 0.9 }), [-1.58, 0.98, 0]);
  for (const s of [-1, 1]) rbox(B, 2.4, 0.52, 0.08, 0.025, bedM, [-1.58, 1.22, s * 0.94]);
  rbox(B, 0.08, 0.52, 1.96, 0.025, bedM, [-2.76, 1.22, 0]);
  rbox(B, 0.08, 0.52, 1.96, 0.025, bedM, [-0.4, 1.22, 0]);

  // exhaust
  const exM = makeMat('steel', { roughness: 0.55 });
  mesh(B, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V3(1.75, 0.82, 0.42), V3(1.4, 0.6, 0.42), V3(0.6, 0.5, 0.5), V3(-1.2, 0.55, 0.52), V3(-2.4, 0.58, 0.6), V3(-2.82, 0.55, 0.62)]), 60, 0.04, 10), exM);
  cyl(B, 0.12, 0.12, 0.6, 24, exM, [-0.6, 0.52, 0.48], [0, 0, PI / 2]);
  const ex = new THREE.Object3D(); ex.position.set(-2.9, 0.55, 0.62); B.add(ex); v.points.exhaust = ex;

  // ---------------------------------------------------------------- hood
  const hood = new THREE.Group();
  hood.position.set(1.22, 1.43, 0);
  B.add(hood);
  rbox(hood, 1.4, 0.06, 1.32, 0.03, paint, [0.7, -0.01, 0]);
  rbox(hood, 0.9, 0.03, 0.4, 0.015, paint, [0.6, 0.03, 0]);
  hood.traverse((o) => { if (o.isMesh) o.userData.interact = { kind: 'hood' }; });
  v.hood = hood;

  // ---------------------------------------------------------------- mechanicals
  buildVEngine(v, {
    ex: 1.82, ey: 0.95, cyl: 8, turbo: false, coverPreset: 'blackPaint', filterMat: 'filterOrange',
    airboxPos: [2.2, 1.06, -0.42], batteryPos: [2.2, 1.0, 0.42],
    radiatorX: 2.47, radiatorY: 1.06, radiatorSize: [0.07, 0.48, 0.86],
  });
  for (const [tag, x, z] of [['FR', 1.75, 0.95], ['FL', 1.75, -0.95]]) {
    buildCorner(v, { tag, x, z, r: 0.42, w: 0.3, lugs: 8, lugR: 0.085, hub: true, style: 'steel', rim: 'darkSteel', wheelKind: 'wheel_truck', rotorR: 0.17, caliperPreset: 'blackPaint' });
  }
  for (const [tag, x, z] of [['RR', -1.65, 0.95], ['RL', -1.65, -0.95]]) {
    buildCorner(v, { tag, x, z, r: 0.42, w: 0.3, lugs: 8, lugR: 0.085, brakes: false, style: 'steel', rim: 'darkSteel', wheelKind: 'wheel_truck' });
    cyl(B, 0.2, 0.2, 0.12, 28, makeMat('castIron'), [x, 0.42, z - Math.sign(z) * 0.2], [PI / 2, 0, 0]); // drum
  }

  v.focal = {
    engine:   { pos: [3.45, 2.15, 1.25], look: [1.9, 0.98, 0.05], label: 'Engine bay' },
    wheel_FR: { pos: [1.85, 0.8, 2.3], look: [1.75, 0.45, 0.95], label: 'Front right' },
    wheel_RR: { pos: [-1.55, 0.8, 2.3], look: [-1.65, 0.45, 0.95], label: 'Rear right' },
    wheel_FL: { pos: [1.85, 0.8, -2.3], look: [1.75, 0.45, -0.95], label: 'Front left' },
    wheel_RL: { pos: [-1.55, 0.8, -2.3], look: [-1.65, 0.45, -0.95], label: 'Rear left' },
    under:    { pos: [-0.55, -0.5, 1.7], look: [-0.9, 0.48, 0.15], label: 'Underside' },
  };
}
