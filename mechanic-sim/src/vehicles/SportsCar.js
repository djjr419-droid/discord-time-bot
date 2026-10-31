// SportsCar.js — front-engine V6 twin-cam turbo coupe built entirely from procedural geometry.
import * as THREE from 'three';
import { box, rbox, cyl, torus, extrude, mesh, V3 } from '../Kit.js';
import { makeMat, carPaint, glassMaterial } from '../Materials.js';
import { buildCorner, buildVEngine, lamp } from './common.js';

const PI = Math.PI;

export function buildSportsCar(v, job) {
  v.engineSpec = { cylinders: 6, idle: 850, redline: 7400, character: 'v6turbo' };
  const paint = (v.paintMat = carPaint(job.color));
  const trim = makeMat('blackPaint', { roughness: 0.6 });
  const B = v.body;

  // ---------------------------------------------------------------- body shell
  const rear = new THREE.Shape();
  rear.moveTo(-2.2, 0.3);
  rear.lineTo(-2.12, 0.24);
  rear.lineTo(-1.72, 0.24);
  rear.absarc(-1.3, 0.33, 0.42, PI, 0, true);
  rear.lineTo(-0.88, 0.22);
  rear.lineTo(0.86, 0.22);
  rear.lineTo(0.86, 0.92);
  rear.lineTo(-1.78, 0.985);
  rear.lineTo(-2.16, 0.96);
  rear.lineTo(-2.24, 0.8);
  rear.lineTo(-2.25, 0.5);
  rear.closePath();
  extrude(B, rear, 1.78, paint, [0, 0, 0], null, { bevel: 0.035 });

  const front = new THREE.Shape();
  front.moveTo(0.84, 0.22);
  front.lineTo(0.88, 0.22);
  front.absarc(1.3, 0.33, 0.42, PI, 0, true);
  front.lineTo(1.72, 0.22);
  front.lineTo(2.14, 0.24);
  front.lineTo(2.22, 0.42);
  front.lineTo(2.2, 0.6);
  front.lineTo(2.12, 0.7);
  front.quadraticCurveTo(1.5, 0.86, 0.84, 0.92);
  front.closePath();
  for (const s of [-1, 1]) extrude(B, front, 0.05, paint, [0, 0, s * 0.89], null, { bevel: 0.02 });

  // front fascia, grille, splitter, headlights
  rbox(B, 0.24, 0.42, 1.78, 0.07, paint, [2.09, 0.46, 0]);
  rbox(B, 0.05, 0.16, 1.0, 0.02, trim, [2.2, 0.38, 0]);
  for (let i = 0; i < 6; i++) box(B, 0.02, 0.006, 0.96, makeMat('chrome'), [2.225, 0.32 + i * 0.024, 0], null, { cast: false });
  box(B, 0.3, 0.02, 1.7, trim, [2.08, 0.235, 0]);
  for (const s of [-1, 1]) {
    lamp(B, 0.06, 0.08, 0.36, 0xdfe8ff, [2.17, 0.6, s * 0.62], [0, 0, -0.5]);
    v.points[`headlight_${s}`] = B.children[B.children.length - 1];
  }
  // inner fenders, firewall, radiator support (engine bay)
  const bay = makeMat('blackPaint', { roughness: 0.75 });
  for (const s of [-1, 1]) box(B, 1.08, 0.42, 0.03, bay, [1.42, 0.55, s * 0.62]);
  box(B, 0.03, 0.62, 1.7, bay, [0.87, 0.6, 0]);
  box(B, 0.04, 0.08, 1.4, bay, [1.95, 0.7, 0]);

  // greenhouse, roof, pillars
  const gh = new THREE.Shape();
  gh.moveTo(0.86, 0.9); gh.lineTo(-0.12, 1.255); gh.lineTo(-0.92, 1.235); gh.lineTo(-1.8, 0.975); gh.lineTo(-1.6, 0.94); gh.lineTo(0.6, 0.91); gh.closePath();
  extrude(B, gh, 1.56, glassMaterial(), null, null, { bevel: 0.03 });
  const roof = new THREE.Shape();
  roof.moveTo(-0.08, 1.275); roof.quadraticCurveTo(-0.5, 1.3, -0.96, 1.26); roof.lineTo(-0.96, 1.245); roof.quadraticCurveTo(-0.5, 1.285, -0.08, 1.26); roof.closePath();
  extrude(B, roof, 1.5, paint, null, null, { bevel: 0.025 });
  for (const s of [-1, 1]) {
    const a = V3(0.86, 0.92, s * 0.78), b = V3(-0.1, 1.265, s * 0.74);
    pillar(B, a, b, 0.05, paint);
    pillar(B, V3(-0.95, 1.255, s * 0.74), V3(-1.78, 0.99, s * 0.8), 0.07, paint);
    pillar(B, V3(-0.55, 1.26, s * 0.76), V3(-0.6, 0.95, s * 0.82), 0.03, trim);
    // mirrors
    rbox(B, 0.14, 0.08, 0.1, 0.03, paint, [0.62, 1.0, s * 0.98]);
    box(B, 0.008, 0.06, 0.08, makeMat('chrome'), [0.55, 1.0, s * 0.98]);
    // door shut lines, side skirt
    box(B, 0.004, 0.62, 0.004, trim, [0.82, 0.58, s * 0.935], null, { cast: false });
    box(B, 0.004, 0.62, 0.004, trim, [-0.62, 0.6, s * 0.935], null, { cast: false });
    box(B, 0.06, 0.012, 0.004, makeMat('chrome'), [-0.45, 0.82, s * 0.935], null, { cast: false });
    box(B, 1.6, 0.06, 0.04, trim, [0.0, 0.25, s * 0.92]);
    // tail lamps
    lamp(B, 0.04, 0.06, 0.42, 0xff1a14, [-2.24, 0.84, s * 0.58]);
    v.points[`tail_${s}`] = B.children[B.children.length - 1];
  }
  // rear wing, diffuser, exhaust tips
  for (const s of [-1, 1]) box(B, 0.04, 0.12, 0.03, trim, [-2.0, 1.04, s * 0.5]);
  rbox(B, 0.28, 0.025, 1.6, 0.01, trim, [-2.04, 1.11, 0]);
  rbox(B, 0.3, 0.12, 1.5, 0.02, trim, [-2.15, 0.3, 0]);
  for (const s of [-1, 1]) cyl(B, 0.045, 0.045, 0.14, 20, makeMat('chrome'), [-2.22, 0.3, s * 0.35], [0, 0, PI / 2], { open: true });
  const ex = new THREE.Object3D(); ex.position.set(-2.3, 0.3, 0.35); B.add(ex); v.points.exhaust = ex;

  // underbody tray & interior hints
  box(B, 3.0, 0.03, 1.6, trim, [-0.6, 0.21, 0]);
  const seatM = makeMat('plastic', { color: 0x1b1414, roughness: 0.8 });
  for (const s of [-1, 1]) {
    rbox(B, 0.5, 0.12, 0.5, 0.05, seatM, [-0.35, 0.42, s * 0.38]);
    rbox(B, 0.12, 0.6, 0.48, 0.05, seatM, [-0.65, 0.72, s * 0.38], [0, 0, 0.25]);
  }
  rbox(B, 0.4, 0.2, 1.6, 0.04, trim, [0.55, 0.82, 0]);
  torus(B, 0.17, 0.018, trim, [0.25, 0.86, 0.38], [0, PI / 2, 0.4]);

  // ---------------------------------------------------------------- hood (hinged at the windshield base)
  const hood = new THREE.Group();
  hood.position.set(0.86, 0.925, 0);
  B.add(hood);
  const hs = new THREE.Shape();
  hs.moveTo(0, 0); hs.quadraticCurveTo(0.66, -0.01, 1.27, -0.215); hs.lineTo(1.27, -0.245); hs.quadraticCurveTo(0.66, -0.04, 0, -0.028); hs.closePath();
  const hm = extrude(hood, hs, 1.72, paint, null, null, { bevel: 0.015 });
  box(hood, 0.5, 0.012, 0.3, trim, [0.5, -0.02, 0], [0, 0, -0.08]); // heat extractor vent
  hood.traverse((o) => { if (o.isMesh) o.userData.interact = { kind: 'hood' }; });
  v.hood = hood;
  hm.name = 'hood';

  // ---------------------------------------------------------------- mechanicals
  buildVEngine(v, {
    ex: 1.25, ey: 0.4, cyl: 6, turbo: true,
    airboxPos: [1.6, 0.52, -0.4], batteryPos: [1.58, 0.47, 0.42],
    radiatorX: 1.82, radiatorY: 0.48, radiatorSize: [0.06, 0.3, 0.62],
  });
  // exhaust downpipe (visual) from turbo toward the tail
  const exM = makeMat('steel', { roughness: 0.5 });
  const pipe = new THREE.CatmullRomCurve3([V3(1.5, 0.35, 0.25), V3(1.1, 0.2, 0.2), V3(0, 0.18, 0.2), V3(-1.6, 0.2, 0.3), V3(-2.15, 0.3, 0.35)]);
  mesh(B, new THREE.TubeGeometry(pipe, 60, 0.035, 10), exM);
  const muff = cyl(B, 0.11, 0.11, 0.5, 24, exM, [-1.75, 0.26, 0.25], [0, 0, PI / 2]);
  muff.scale.set(1, 1, 0.6);
  // drivetrain visuals
  rbox(B, 0.6, 0.22, 0.24, 0.04, makeMat('aluminum', { roughness: 0.6 }), [0.7, 0.36, 0]);
  cyl(B, 0.035, 0.035, 1.6, 16, makeMat('darkSteel'), [-0.4, 0.3, 0], [0, 0, PI / 2]);
  rbox(B, 0.26, 0.24, 0.3, 0.05, makeMat('castIron'), [-1.3, 0.33, 0]);
  for (const s of [-1, 1]) {
    cyl(B, 0.03, 0.03, 0.62, 12, makeMat('darkSteel'), [-1.3, 0.33, s * 0.42], [PI / 2, 0, 0]);
    cyl(B, 0.03, 0.03, 0.42, 12, makeMat('darkSteel'), [1.3, 0.33, s * 0.42], [PI / 2, 0, 0]);
    // lower control arms
    box(B, 0.36, 0.025, 0.5, makeMat('blackPaint'), [1.3, 0.26, s * 0.5]);
    box(B, 0.36, 0.025, 0.5, makeMat('blackPaint'), [-1.3, 0.26, s * 0.5]);
  }

  for (const [tag, x, z, strut] of [['FR', 1.3, 0.8, true], ['FL', 1.3, -0.8, true], ['RR', -1.3, 0.8, false], ['RL', -1.3, -0.8, false]]) {
    buildCorner(v, { tag, x, z, r: 0.33, w: 0.245, lugs: 5, strut, style: 'alloy', rim: 'billet', spokes: 5, rotorR: 0.165 });
  }

  v.focal = {
    engine:   { pos: [2.75, 1.62, 1.1], look: [1.3, 0.58, 0.05], label: 'Engine bay' },
    wheel_FR: { pos: [1.35, 0.62, 2.05], look: [1.3, 0.36, 0.8], label: 'Front right' },
    wheel_RR: { pos: [-1.25, 0.62, 2.05], look: [-1.3, 0.36, 0.8], label: 'Rear right' },
    wheel_FL: { pos: [1.35, 0.62, -2.05], look: [1.3, 0.36, -0.8], label: 'Front left' },
    wheel_RL: { pos: [-1.25, 0.62, -2.05], look: [-1.3, 0.36, -0.8], label: 'Rear left' },
    under:    { pos: [0.5, -0.55, 1.45], look: [1.15, 0.12, 0.05], label: 'Underside' },
  };
}

function pillar(parent, a, b, r, mat) {
  const d = b.clone().sub(a);
  const m = mesh(parent, new THREE.BoxGeometry(r, d.length(), r * 0.8), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(V3(0, 1, 0), d.normalize());
  return m;
}
