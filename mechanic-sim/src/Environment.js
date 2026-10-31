// Environment.js — the service bay: scissor lift, roll-up door, rollaway tool chest with sliding drawers,
// diagnostic cart + laptop, workbench & parts rack, shop terminal, job board, machines and lighting.
import * as THREE from 'three';
import gsap from 'gsap';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { box, rbox, cyl, sphere, torus, tube, mesh, V3 } from './Kit.js';
import {
  makeMat, concreteTextures, checkerTexture, diamondPlateBump, painterlyWall, pegboardTexture, radialAlphaTexture,
} from './Materials.js';
import { COSMETICS } from './Economy.js';

const PI = Math.PI;

export class Garage {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.root = new THREE.Group();
    this.root.name = 'garage';
    scene.add(this.root);
    this.interactables = [];
    this.screens = {};
    this.focal = {
      overview:  { pos: [0.5, 1.72, 5.5], look: [0, 0.85, 0], label: 'Bay' },
      toolchest: { pos: [-1.75, 1.6, 4.35], look: [-3.85, 0.8, 3.55], label: 'Tool chest' },
      cart:      { pos: [1.85, 1.55, 4.55], look: [3.45, 0.95, 3.05], label: 'Diagnostics' },
      bench:     { pos: [4.55, 1.72, -3.3], look: [4.6, 0.85, -5.6], label: 'Workbench' },
      terminal:  { pos: [5.3, 1.6, 2.6], look: [7.9, 1.35, 2.4], label: 'Office' },
      machines:  { pos: [5.0, 1.55, -1.6], look: [7.2, 0.8, -3.7], label: 'Machines' },
    };
    RectAreaLightUniformsLib.init();
    this._buildShell();
    this._buildLights();
    this._buildLift();
    this._buildToolChest();
    this._buildCart();
    this._buildBench();
    this._buildOffice();
    this._buildMachines();
    this._buildWorkLamp();
    this._buildProps();
    this._buildMovables();
  }

  _interact(obj, id, ref) {
    obj.traverse((o) => { if (o.isMesh) o.userData.interact = { kind: 'env', id, ref }; });
    this.interactables.push(obj);
  }

  // ---------------------------------------------------------------- shell
  _buildShell() {
    const R = this.root;
    const conc = concreteTextures();
    this.floorTex = conc;
    this.floorMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, map: conc.map, roughnessMap: conc.roughnessMap, roughness: 0.75, metalness: 0.0,
      clearcoat: 0.35, clearcoatRoughness: 0.25,
    });
    this.floor = mesh(R, new THREE.PlaneGeometry(16, 13), this.floorMat, [0, 0, 0], [-PI / 2, 0, 0], { cast: false });
    this.floor.name = 'floor';
    // bay markings
    const yellow = new THREE.MeshStandardMaterial({ color: 0xe0b100, roughness: 0.55 });
    for (const z of [-1.9, 1.9]) box(R, 7.4, 0.002, 0.1, yellow, [0, 0.001, z], null, { cast: false });
    for (let i = 0; i < 12; i++) box(R, 0.25, 0.002, 0.1, yellow, [-3.6 - 0.001, 0.001, -1.6 + i * 0.29], [0, PI / 4, 0], { cast: false });
    // outside apron
    const asphalt = new THREE.MeshStandardMaterial({ color: 0x2a2b2d, roughness: 0.95 });
    mesh(R, new THREE.PlaneGeometry(14, 14), asphalt, [-15, -0.002, 0], [-PI / 2, 0, 0], { cast: false });

    this.wallMat = new THREE.MeshStandardMaterial({ color: 0x70757b, map: painterlyWall('#ffffff'), roughness: 0.92 });
    this.wallMat.map.repeat.set(4, 1);
    const wallH = 4.2;
    const wall = (w, pos, rotY) => mesh(R, new THREE.PlaneGeometry(w, wallH), this.wallMat, pos, [0, rotY, 0], { cast: false });
    wall(16, [0, wallH / 2, -6.5], 0);
    wall(16, [0, wallH / 2, 6.5], PI);
    wall(13, [8, wallH / 2, 0], -PI / 2);
    // left wall with roll-up door opening (z -2.6..2.6, h 3.4)
    wall(3.9, [-8, wallH / 2, -4.55], PI / 2);
    wall(3.9, [-8, wallH / 2, 4.55], PI / 2);
    mesh(R, new THREE.PlaneGeometry(5.2, 0.8), this.wallMat, [-8, 3.8, 0], [0, PI / 2, 0], { cast: false });
    // wainscot / kick plate
    const kick = new THREE.MeshStandardMaterial({ color: 0x2a2c2f, roughness: 0.6, metalness: 0.4 });
    box(R, 16, 0.6, 0.02, kick, [0, 0.3, -6.49], null, { cast: false });
    box(R, 0.02, 0.6, 13, kick, [7.99, 0.3, 0], null, { cast: false });
    // ceiling + trusses
    const ceil = new THREE.MeshStandardMaterial({ color: 0x3b3e42, roughness: 0.9 });
    mesh(R, new THREE.PlaneGeometry(16, 13), ceil, [0, wallH, 0], [PI / 2, 0, 0], { cast: false });
    const truss = new THREE.MeshStandardMaterial({ color: 0x55595e, metalness: 0.6, roughness: 0.5 });
    for (const x of [-6, -3, 0, 3, 6]) box(R, 0.14, 0.3, 13, truss, [x, wallH - 0.15, 0], null, { cast: false });

    // roll-up door (slats) and a bright exterior backdrop
    this.door = new THREE.Group();
    this.door.position.set(-7.95, 0, 0);
    R.add(this.door);
    const slatM = new THREE.MeshStandardMaterial({ color: 0x9aa1a8, metalness: 0.7, roughness: 0.35 });
    for (let i = 0; i < 17; i++) box(this.door, 0.04, 0.2, 5.2, slatM, [0, 0.1 + i * 0.2, 0], null, { cast: true });
    box(R, 0.25, 0.4, 5.6, truss, [-7.9, 3.55, 0]);
    const sky = new THREE.MeshBasicMaterial({ color: 0xcfe2f5 });
    mesh(R, new THREE.PlaneGeometry(30, 12), sky, [-22, 5, 0], [0, PI / 2, 0], { cast: false, receive: false });
    // exterior building across the street
    box(R, 0.5, 6, 18, new THREE.MeshStandardMaterial({ color: 0x8b7c6e, roughness: 0.95 }), [-20, 3, 0]);
  }

  setDoor(open, dur = 1.6) {
    gsap.to(this.door.position, { y: open ? 3.25 : 0, duration: dur, ease: 'power2.inOut' });
    gsap.to(this.door.scale, { y: open ? 0.06 : 1, duration: dur, ease: 'power2.inOut' });
  }

  // ---------------------------------------------------------------- lights
  _buildLights() {
    const R = this.root;
    this.hemi = new THREE.HemisphereLight(0xdfe8f5, 0x3a3631, 0.35);
    R.add(this.hemi);

    this.fixtures = [];
    this.tubeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe9f3ff, emissiveIntensity: 3.2 });
    const housing = new THREE.MeshStandardMaterial({ color: 0xd8dadc, metalness: 0.5, roughness: 0.35 });
    const spots = [[-1.6, -1.6], [-1.6, 1.6], [1.6, -1.6], [1.6, 1.6], [-4.8, 0], [4.8, 0], [4.6, -4.6], [-4, 4.4]];
    for (const [x, z] of spots) {
      const g = new THREE.Group();
      g.position.set(x, 3.6, z);
      R.add(g);
      box(g, 2.5, 0.08, 0.36, housing, [0, 0.05, 0], null, { cast: false });
      for (const dz of [-0.08, 0.08]) cyl(g, 0.022, 0.022, 2.35, 10, this.tubeMat, [0, -0.01, dz], [0, 0, PI / 2], { cast: false });
      for (const s of [-1, 1]) cyl(g, 0.006, 0.006, 0.55, 4, housing, [s * 1.0, 0.33, 0], null, { cast: false });
      // only the four fixtures over the bay carry real area lights; the rest are emissive (bloom) + ambient
      let ra = null;
      if (Math.abs(x) < 3.5 && Math.abs(z) < 2) {
        ra = new THREE.RectAreaLight(0xe9f3ff, 9, 2.35, 0.3);
        ra.position.set(0, -0.03, 0);
        ra.rotation.set(-PI / 2, 0, 0); // RectAreaLight emits along its local -Z → straight down
        g.add(ra);
      }
      this.fixtures.push({ group: g, light: ra });
    }

    // key light for crisp contact shadows (simulates the bank of fluorescents overhead)
    const key = (this.key = new THREE.DirectionalLight(0xf2f6ff, 1.4));
    key.position.set(2.5, 8, 3.5);
    key.target.position.set(0, 0, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera;
    sc.left = -7; sc.right = 7; sc.top = 7; sc.bottom = -7; sc.near = 1; sc.far = 20;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.025;
    R.add(key, key.target);

    // daylight spilling in through the roll-up door
    const day = (this.daylight = new THREE.RectAreaLight(0xfff2dc, 3.5, 5.0, 3.2));
    day.position.set(-7.9, 1.7, 0);
    day.lookAt(0, 1.2, 0);
    R.add(day);

    // accent strips (cosmetic)
    this.accentMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x19e3ff, emissiveIntensity: 4 });
    this.accent = new THREE.Group();
    R.add(this.accent);
    box(this.accent, 15.6, 0.03, 0.03, this.accentMat, [0, 3.05, -6.47], null, { cast: false });
    box(this.accent, 0.03, 0.03, 12.6, this.accentMat, [7.97, 3.05, 0], null, { cast: false });
    box(this.accent, 6.5, 0.03, 0.03, this.accentMat, [0, 0.13, 1.15], null, { cast: false });
    box(this.accent, 6.5, 0.03, 0.03, this.accentMat, [0, 0.13, -1.15], null, { cast: false });
    this.accent.visible = false;
  }

  // ---------------------------------------------------------------- lift
  _buildLift() {
    const R = this.root;
    const lift = (this.lift = { group: new THREE.Group(), deck: new THREE.Group(), deckTop: 0.11, height: 0, raised: false, busy: false });
    R.add(lift.group);
    lift.group.add(lift.deck);
    const plate = new THREE.MeshStandardMaterial({ color: 0x8c9095, metalness: 0.85, roughness: 0.45, bumpMap: diamondPlateBump(), bumpScale: 1.5 });
    plate.bumpMap.repeat.set(10, 4);
    this.liftPaint = new THREE.MeshStandardMaterial({ color: 0xc8261e, metalness: 0.35, roughness: 0.45 });
    // runways + center plate
    for (const z of [-0.78, 0.78]) {
      box(lift.deck, 5.0, 0.07, 0.62, plate, [0, 0.075, z]);
      box(lift.deck, 5.0, 0.12, 0.05, this.liftPaint, [0, 0.07, z + (z > 0 ? 0.33 : -0.33)]);
      // wheel stops
      box(lift.deck, 0.06, 0.06, 0.6, this.liftPaint, [2.45, 0.14, z]);
    }
    box(lift.deck, 5.0, 0.04, 0.94, plate, [0, 0.09, 0]);
    // approach ramps (static, on the floor)
    for (const z of [-0.78, 0.78]) {
      const r = box(R, 1.1, 0.03, 0.62, plate, [-3.05, 0.055, z], [0, 0, 0.1]);
      r.receiveShadow = true;
    }
    // jack pads that lift wheels free when raised
    this.jackPads = [];
    for (const x of [-1.0, 1.0]) for (const z of [-0.6, 0.6]) {
      const p = cyl(lift.deck, 0.07, 0.07, 0.02, 16, new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }), [x, 0.12, z]);
      this.jackPads.push(p);
    }
    // scissor mechanism (two X frames)
    lift.arms = [];
    const armM = this.liftPaint;
    for (const z of [-0.55, 0.55]) for (const s of [-1, 1]) {
      const a = box(lift.group, 3.4, 0.08, 0.06, armM, [0, 0.05, z + s * 0.04]);
      a.userData.sign = s;
      lift.arms.push(a);
    }
    const cylM = new THREE.MeshStandardMaterial({ color: 0xd8dcdf, metalness: 1, roughness: 0.15 });
    lift.ram = cyl(lift.group, 0.05, 0.05, 1.0, 16, cylM, [0.4, 0.2, 0], [0, 0, 1.2]);
    box(R, 4.4, 0.05, 1.5, new THREE.MeshStandardMaterial({ color: 0x2b2d30, metalness: 0.5, roughness: 0.6 }), [0, 0.025, 0]);

    // control pedestal
    const ped = new THREE.Group();
    ped.position.set(2.9, 0, 1.55);
    R.add(ped);
    box(ped, 0.12, 1.0, 0.12, new THREE.MeshStandardMaterial({ color: 0x2d2f33, metalness: 0.6, roughness: 0.5 }), [0, 0.5, 0]);
    rbox(ped, 0.24, 0.3, 0.16, 0.02, new THREE.MeshStandardMaterial({ color: 0xe0b100, roughness: 0.5 }), [0, 1.12, 0]);
    this.liftUpBtn = cyl(ped, 0.035, 0.035, 0.03, 16, new THREE.MeshStandardMaterial({ color: 0x1fae4b, emissive: 0x0a5a24, emissiveIntensity: 0.6 }), [0, 1.18, 0.085], [PI / 2, 0, 0]);
    this.liftDnBtn = cyl(ped, 0.035, 0.035, 0.03, 16, new THREE.MeshStandardMaterial({ color: 0xc8261e, emissive: 0x5a0a0a, emissiveIntensity: 0.6 }), [0, 1.06, 0.085], [PI / 2, 0, 0]);
    this._interact(ped, 'lift');
    this.liftPedestal = ped;
    this.setLiftHeight(0);
  }

  setLiftHeight(h) {
    const L = this.lift;
    L.height = h;
    L.deck.position.y = h;
    const span = 3.4;
    const totalH = h + 0.06;
    const ang = Math.asin(Math.min(0.95, totalH / span));
    for (const a of L.arms) {
      a.rotation.z = a.userData.sign * ang;
      a.position.y = totalH / 2 + 0.03;
    }
    L.ram.position.y = 0.1 + h * 0.4;
    L.ram.rotation.z = 1.2 - h * 0.3;
  }

  // ---------------------------------------------------------------- tool chest
  _buildToolChest() {
    const R = this.root;
    const chest = (this.chest = new THREE.Group());
    chest.position.set(-3.95, 0, 3.55);
    chest.rotation.y = PI / 2;
    R.add(chest);
    this.chestPaint = new THREE.MeshPhysicalMaterial({ color: 0xb0141c, metalness: 0.3, roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.15 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x1c1d1f, metalness: 0.6, roughness: 0.4 });
    const handle = new THREE.MeshStandardMaterial({ color: 0xe8eaee, metalness: 1, roughness: 0.12 });
    // bottom cabinet
    rbox(chest, 1.2, 0.95, 0.55, 0.02, this.chestPaint, [0, 0.58, 0]);
    box(chest, 1.24, 0.04, 0.58, new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 }), [0, 1.07, 0]);
    for (const x of [-0.5, 0.5]) for (const z of [-0.2, 0.2]) {
      cyl(chest, 0.045, 0.045, 0.035, 14, new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 }), [x, 0.05, z], [PI / 2, 0, 0]);
    }
    // top chest + lid
    rbox(chest, 1.2, 0.42, 0.45, 0.02, this.chestPaint, [0, 1.3, -0.04]);
    const lid = rbox(chest, 1.22, 0.04, 0.47, 0.015, this.chestPaint, [0, 1.53, -0.04]);
    lid.castShadow = true;
    // drawers
    this.drawers = [];
    const rows = [
      { y: 0.95, h: 0.11, tray: 'socket' }, { y: 0.82, h: 0.11, tray: 'screwdriver' }, { y: 0.66, h: 0.16, tray: 'torque' },
      { y: 0.46, h: 0.2, tray: 'impact' }, { y: 0.22, h: 0.22, tray: 'multimeter' },
      { y: 1.38, h: 0.09, tray: 'lug_wrench' }, { y: 1.24, h: 0.13, tray: 'hand' },
    ];
    for (const r of rows) {
      const d = new THREE.Group();
      d.position.set(0, r.y, 0.265);
      chest.add(d);
      rbox(d, 1.12, r.h - 0.012, 0.03, 0.006, this.chestPaint, [0, 0, 0]);
      box(d, 0.8, 0.018, 0.03, handle, [0, r.h / 2 - 0.03, 0.025]);
      // drawer box (hidden inside until opened)
      const tray = new THREE.Group();
      tray.position.set(0, -r.h / 2 + 0.015, -0.24);
      d.add(tray);
      box(tray, 1.08, 0.01, 0.46, steel, [0, 0, 0]);
      for (const s of [-1, 1]) box(tray, 0.01, r.h - 0.03, 0.46, steel, [s * 0.54, r.h / 2 - 0.015, 0]);
      box(tray, 1.08, 0.012, 0.44, new THREE.MeshStandardMaterial({ color: 0x8a1010, roughness: 0.95 }), [0, 0.008, 0]); // foam liner
      const drawer = { group: d, tray, open: false, tool: r.tray, toolMesh: null };
      this.drawers.push(drawer);
      this._interact(d, 'drawer', drawer);
    }
  }

  toggleDrawer(drawer, audio) {
    drawer.open = !drawer.open;
    gsap.to(drawer.group.position, { z: drawer.open ? 0.265 + 0.38 : 0.265, duration: 0.45, ease: drawer.open ? 'back.out(1.4)' : 'power3.in' });
    const wp = drawer.group.getWorldPosition(new THREE.Vector3());
    audio?.play('drawer', { position: wp, open: drawer.open });
  }

  /** Puts a display copy of each owned tool into its drawer foam. */
  stockDrawers(makeToolModel, owned) {
    for (const d of this.drawers) {
      if (d.toolMesh) { d.tray.remove(d.toolMesh); d.toolMesh = null; }
      if (d.tool === 'hand') {
        // gloves box + rags
        const g = new THREE.Group();
        rbox(g, 0.22, 0.08, 0.14, 0.01, new THREE.MeshStandardMaterial({ color: 0x1d4fa0, roughness: 0.6 }), [-0.2, 0.05, 0]);
        rbox(g, 0.2, 0.03, 0.18, 0.01, new THREE.MeshStandardMaterial({ color: 0xb33a2a, roughness: 1 }), [0.18, 0.025, 0]);
        d.tray.add(g); d.toolMesh = g;
        continue;
      }
      if (!owned.includes(d.tool)) continue;
      const m = makeToolModel(d.tool);
      m.scale.setScalar(0.85);
      m.rotation.set(-PI / 2, 0, PI / 2);
      m.position.set(0, 0.03, 0);
      d.tray.add(m);
      d.toolMesh = m;
      m.traverse((o) => { if (o.isMesh) o.userData.interact = { kind: 'env', id: 'equip', ref: d.tool }; });
    }
  }

  // ---------------------------------------------------------------- diagnostic cart
  _buildCart() {
    const R = this.root;
    const cart = (this.cart = new THREE.Group());
    cart.position.set(3.45, 0, 3.05);
    cart.rotation.y = -PI / 2 + 0.35;
    R.add(cart);
    const frame = new THREE.MeshStandardMaterial({ color: 0x24272b, metalness: 0.7, roughness: 0.35 });
    const shelf = new THREE.MeshStandardMaterial({ color: 0x3a3e44, metalness: 0.5, roughness: 0.5 });
    for (const x of [-0.32, 0.32]) for (const z of [-0.22, 0.22]) {
      cyl(cart, 0.015, 0.015, 0.9, 8, frame, [x, 0.5, z]);
      cyl(cart, 0.03, 0.03, 0.03, 12, new THREE.MeshStandardMaterial({ color: 0x111111 }), [x, 0.03, z], [PI / 2, 0, 0]);
    }
    for (const y of [0.25, 0.92]) rbox(cart, 0.72, 0.03, 0.5, 0.01, shelf, [0, y, 0]);
    // scan tool box on lower shelf + OBD cable coil
    rbox(cart, 0.3, 0.14, 0.2, 0.02, new THREE.MeshStandardMaterial({ color: 0xe0b100, roughness: 0.4 }), [-0.15, 0.34, 0]);
    torus(cart, 0.07, 0.012, new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 }), [0.18, 0.28, 0], [PI / 2, 0, 0]);
    // laptop
    const lap = new THREE.Group();
    lap.position.set(0, 0.94, 0.02);
    cart.add(lap);
    const alu = new THREE.MeshStandardMaterial({ color: 0x4b4f55, metalness: 0.8, roughness: 0.3 });
    rbox(lap, 0.42, 0.018, 0.29, 0.008, alu, [0, 0.009, 0]);
    box(lap, 0.38, 0.002, 0.15, new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.6 }), [0, 0.019, -0.04]);
    const lidG = new THREE.Group(); lidG.position.set(0, 0.018, -0.145); lidG.rotation.x = -1.85 + PI / 2 + 0.35; lap.add(lidG);
    rbox(lidG, 0.42, 0.27, 0.012, 0.008, alu, [0, 0.135, 0]);
    const scr = this._screen('laptop', 640, 400);
    mesh(lidG, new THREE.PlaneGeometry(0.39, 0.245), scr.material, [0, 0.135, 0.0065], null, { cast: false, receive: false });
    this._interact(lap, 'laptop');
    // ECU remapper dongle (shown when owned)
    this.ecuDongle = rbox(cart, 0.12, 0.03, 0.08, 0.01, new THREE.MeshStandardMaterial({ color: 0x0f8a6a, roughness: 0.4, emissive: 0x053b2c }), [0.26, 0.955, 0.12]);
    this.ecuDongle.visible = false;
    this._interact(this.ecuDongle, 'ecu');
  }

  _screen(name, w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    material.color.setScalar(0.9);
    const s = { canvas: c, ctx: c.getContext('2d'), tex, material };
    this.screens[name] = s;
    return s;
  }

  drawScreen(name, fn) {
    const s = this.screens[name];
    if (!s) return;
    fn(s.ctx, s.canvas.width, s.canvas.height);
    s.tex.needsUpdate = true;
  }

  // ---------------------------------------------------------------- workbench, pegboard, parts rack
  _buildBench() {
    const R = this.root;
    const bench = (this.bench = new THREE.Group());
    bench.position.set(4.6, 0, -5.75);
    R.add(bench);
    const top = new THREE.MeshStandardMaterial({ color: 0x9a9fa4, metalness: 0.85, roughness: 0.38, bumpMap: diamondPlateBump(), bumpScale: 0.6 });
    top.bumpMap.repeat.set(8, 2);
    const legs = new THREE.MeshStandardMaterial({ color: 0x2b2e33, metalness: 0.6, roughness: 0.5 });
    rbox(bench, 3.2, 0.06, 0.85, 0.01, top, [0, 0.9, 0]);
    for (const x of [-1.5, 1.5]) for (const z of [-0.35, 0.35]) box(bench, 0.06, 0.9, 0.06, legs, [x, 0.45, z]);
    box(bench, 3.1, 0.03, 0.8, legs, [0, 0.18, 0]);
    // drawers under bench
    for (const x of [-0.9, 0.9]) rbox(bench, 0.8, 0.5, 0.75, 0.01, this.chestPaint || legs, [x, 0.6, 0]);
    // vise
    const vise = new THREE.Group(); vise.position.set(-1.35, 0.93, 0.32); bench.add(vise);
    const vm = new THREE.MeshStandardMaterial({ color: 0x1f4fa8, metalness: 0.5, roughness: 0.45 });
    rbox(vise, 0.18, 0.12, 0.12, 0.01, vm, [0, 0.06, 0]);
    rbox(vise, 0.18, 0.1, 0.05, 0.01, vm, [0, 0.07, 0.12]);
    cyl(vise, 0.012, 0.012, 0.3, 10, new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 1, roughness: 0.2 }), [0, 0.06, 0.2], [PI / 2, 0, 0]);
    // pegboard
    const peg = new THREE.MeshStandardMaterial({ map: pegboardTexture(), roughness: 0.85 });
    peg.map.repeat.set(3, 1);
    mesh(R, new THREE.PlaneGeometry(3.2, 1.2), peg, [4.6, 1.75, -6.48], null, { cast: false });
    const hang = new THREE.MeshStandardMaterial({ color: 0xaab0b6, metalness: 0.9, roughness: 0.3 });
    for (let i = 0; i < 9; i++) {
      box(R, 0.025, 0.22 + (i % 3) * 0.05, 0.012, hang, [3.3 + i * 0.3, 1.8, -6.45]);
      cyl(R, 0.04, 0.04, 0.02, 6, hang, [3.3 + i * 0.3, 1.95, -6.45], [PI / 2, 0, 0]);
    }
    // bench lamp strip
    box(R, 2.8, 0.03, 0.06, new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xfff4e0, emissiveIntensity: 2.2 }), [4.6, 2.4, -6.4], null, { cast: false });
    const bl = new THREE.RectAreaLight(0xfff4e0, 6, 2.8, 0.1);
    bl.position.set(4.6, 2.38, -6.35); bl.lookAt(4.6, 0.9, -5.6);
    R.add(bl);

    // part slots on the bench top and on the floor beside it
    this.slots = [];
    for (let row = 0; row < 2; row++) for (let i = 0; i < 7; i++) {
      this.slots.push({ pos: V3(3.35 + i * 0.36, 0.935, -5.95 + row * 0.42), cap: 'small', used: null });
    }
    for (let i = 0; i < 5; i++) this.slots.push({ pos: V3(0.6 + i * 0.75, 0.0, -5.6), cap: 'large', used: null });
    for (let i = 0; i < 4; i++) this.slots.push({ pos: V3(6.9, 0.0, -2.0 + i * 0.85), cap: 'large', used: null });

    // parts rack (shelving with boxes)
    const rack = new THREE.Group(); rack.position.set(-2.2, 0, -6.05); R.add(rack);
    const rm = new THREE.MeshStandardMaterial({ color: 0x2f62a8, metalness: 0.5, roughness: 0.5 });
    const sm = new THREE.MeshStandardMaterial({ color: 0x8b8f94, metalness: 0.6, roughness: 0.5 });
    for (const x of [-1.5, 1.5]) for (const z of [-0.3, 0.3]) box(rack, 0.05, 2.6, 0.05, rm, [x, 1.3, z]);
    const boxColors = [0xc9a26b, 0xb8925d, 0xd0b07f, 0x2a5d9c, 0xc33a2a, 0xe0b100];
    for (let s = 0; s < 4; s++) {
      const y = 0.2 + s * 0.68;
      box(rack, 3.05, 0.03, 0.66, sm, [0, y, 0]);
      let x = -1.4;
      let k = s * 7;
      while (x < 1.3) {
        const w = 0.22 + ((k * 37) % 23) / 60;
        const h = 0.18 + ((k * 13) % 17) / 60;
        rbox(rack, w, h, 0.4, 0.008, new THREE.MeshStandardMaterial({ color: boxColors[k % boxColors.length], roughness: 0.85 }), [x + w / 2, y + h / 2 + 0.015, 0.02]);
        x += w + 0.05; k++;
      }
    }
    // tyre stack next to the rack
    const tyreM = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
    for (let i = 0; i < 4; i++) torus(R, 0.27, 0.1, tyreM, [-5.1, 0.1 + i * 0.2, -5.8], [PI / 2, 0, 0]);
    for (let i = 0; i < 3; i++) torus(R, 0.27, 0.1, tyreM, [-5.75, 0.1 + i * 0.2, -5.6], [PI / 2, 0, 0]);
  }

  /** Finds a free slot for a removed part. Returns { pos, slot }. */
  claimSlot(part, size) {
    const large = size.x > 0.55 || size.y > 0.55 || size.z > 0.55;
    const want = large ? 'large' : 'small';
    let slot = this.slots.find((s) => !s.used && s.cap === want) || this.slots.find((s) => !s.used);
    if (!slot) slot = this.slots[Math.floor(Math.random() * this.slots.length)];
    slot.used = part.id;
    return slot;
  }

  releaseSlot(part) {
    for (const s of this.slots) if (s.used === part.id) s.used = null;
  }

  clearSlots() { for (const s of this.slots) s.used = null; }

  // ---------------------------------------------------------------- office: terminal + job board
  _buildOffice() {
    const R = this.root;
    const desk = new THREE.Group();
    desk.position.set(7.45, 0, 2.4);
    desk.rotation.y = -PI / 2;
    R.add(desk);
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.7 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, metalness: 0.5, roughness: 0.4 });
    rbox(desk, 1.4, 0.05, 0.7, 0.01, wood, [0, 0.76, 0]);
    for (const x of [-0.65, 0.65]) box(desk, 0.05, 0.75, 0.65, dark, [x, 0.375, 0]);
    // monitor
    const mon = new THREE.Group(); mon.position.set(0, 0.79, -0.15); desk.add(mon);
    box(mon, 0.25, 0.015, 0.18, dark, [0, 0.008, 0]);
    box(mon, 0.04, 0.32, 0.03, dark, [0, 0.17, 0]);
    rbox(mon, 0.72, 0.43, 0.035, 0.01, dark, [0, 0.47, 0.02]);
    const scr = this._screen('terminal', 768, 448);
    mesh(mon, new THREE.PlaneGeometry(0.68, 0.39), scr.material, [0, 0.47, 0.039], null, { cast: false, receive: false });
    rbox(desk, 0.45, 0.015, 0.15, 0.005, dark, [0, 0.79, 0.15]);
    this._interact(mon, 'terminal');
    // job board (cork) on the wall above-right
    const board = new THREE.Group();
    board.position.set(7.96, 1.75, 4.2);
    board.rotation.y = -PI / 2;
    R.add(board);
    box(board, 1.5, 1.0, 0.03, new THREE.MeshStandardMaterial({ color: 0x5a3b22, roughness: 0.8 }), [0, 0, 0]);
    const jb = this._screen('jobboard', 768, 512);
    mesh(board, new THREE.PlaneGeometry(1.42, 0.92), jb.material, [0, 0, 0.02], null, { cast: false, receive: false });
    jb.material.toneMapped = true;
    jb.material.color.setScalar(1);
    jb.material.dispose();
    board.children[1].material = new THREE.MeshStandardMaterial({ map: jb.tex, roughness: 0.85 });
    this._interact(board, 'jobboard');
    // wall clock
    const clock = new THREE.Group(); clock.position.set(7.96, 3.0, 2.4); clock.rotation.y = -PI / 2; R.add(clock);
    cyl(clock, 0.22, 0.22, 0.04, 32, dark, [0, 0, 0], [PI / 2, 0, 0]);
    const cs = this._screen('clock', 256, 256);
    mesh(clock, new THREE.CircleGeometry(0.2, 32), cs.material, [0, 0, 0.022], null, { cast: false });
    // poster
    const poster = this._screen('poster', 512, 720);
    this.drawScreen('poster', (g, w, h) => {
      const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, '#0d1b2a'); grd.addColorStop(1, '#a3201b');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffd34d'; g.font = 'bold 86px Impact, sans-serif'; g.textAlign = 'center';
      g.fillText('TORQUE', w / 2, 150); g.fillText('& TREAD', w / 2, 250);
      g.fillStyle = '#fff'; g.font = '28px sans-serif';
      g.fillText('SINCE 1987 · HONEST WRENCHES', w / 2, 310);
      g.strokeStyle = '#ffd34d'; g.lineWidth = 10;
      g.beginPath(); g.arc(w / 2, 480, 130, 0, PI * 2); g.stroke();
      for (let i = 0; i < 12; i++) { g.save(); g.translate(w / 2, 480); g.rotate((i / 12) * PI * 2); g.fillStyle = '#ffd34d'; g.fillRect(-14, -160, 28, 36); g.restore(); }
      g.fillStyle = '#fff'; g.font = 'bold 40px sans-serif'; g.fillText('SERVICE', w / 2, 495);
    });
    poster.material.toneMapped = true;
    mesh(R, new THREE.PlaneGeometry(0.8, 1.12), new THREE.MeshStandardMaterial({ map: poster.tex, roughness: 0.6 }), [-1.0, 2.0, -6.47], null, { cast: false });
  }

  // ---------------------------------------------------------------- machines
  _buildMachines() {
    const R = this.root;
    // laser wheel balancer
    const bal = (this.balancer = new THREE.Group());
    bal.position.set(7.2, 0, -3.7);
    bal.rotation.y = -PI / 2;
    R.add(bal);
    const body = new THREE.MeshStandardMaterial({ color: 0x1d4fa0, metalness: 0.4, roughness: 0.4 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, metalness: 0.5, roughness: 0.4 });
    rbox(bal, 0.8, 0.9, 0.6, 0.04, body, [0, 0.45, 0]);
    rbox(bal, 0.5, 0.3, 0.1, 0.02, dark, [0, 1.15, -0.2]);
    const bs = this._screen('balancer', 256, 128);
    mesh(bal, new THREE.PlaneGeometry(0.44, 0.22), bs.material, [0, 1.15, -0.148], null, { cast: false });
    this.balancerShaft = cyl(bal, 0.02, 0.02, 0.4, 12, new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1, roughness: 0.15 }), [0, 0.75, 0.45], [PI / 2, 0, 0]);
    this.balancerLaser = box(bal, 0.004, 0.004, 0.6, new THREE.MeshBasicMaterial({ color: 0xff2222 }), [0, 0.75, 0.45], null, { cast: false });
    this.balancerLaser.visible = false;
    this.balancerMount = new THREE.Object3D(); this.balancerMount.position.set(0, 0.75, 0.55); bal.add(this.balancerMount);
    this._interact(bal, 'balancer');
    // ultrasonic tank on the bench end
    const us = (this.ultrasonic = new THREE.Group());
    us.position.set(6.55, 0, -5.35);
    R.add(us);
    const ss = new THREE.MeshStandardMaterial({ color: 0xc9ced3, metalness: 1, roughness: 0.22 });
    rbox(us, 0.7, 0.8, 0.55, 0.02, ss, [0, 0.4, 0]);
    box(us, 0.6, 0.02, 0.45, new THREE.MeshPhysicalMaterial({ color: 0x6fb7d8, transmission: 0, transparent: true, opacity: 0.75, roughness: 0.05, metalness: 0 }), [0, 0.78, 0]);
    this.ultrasonicFluid = us.children[us.children.length - 1];
    rbox(us, 0.2, 0.08, 0.02, 0.01, dark, [0, 0.6, 0.285]);
    this.ultrasonicMount = new THREE.Object3D(); this.ultrasonicMount.position.set(0, 0.7, 0); us.add(this.ultrasonicMount);
    this._interact(us, 'ultrasonic');
    // locked placards
    this.lockTags = {};
    for (const [id, g, p] of [['balancer', bal, [0, 1.4, -0.2]], ['ultrasonic', us, [0, 1.05, 0]]]) {
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.16), new THREE.MeshBasicMaterial({ map: textTexture('LOCKED · TIER 3', '#c8261e'), transparent: true }));
      tag.position.set(...p); g.add(tag);
      if (id === 'ultrasonic') tag.rotation.y = 0;
      this.lockTags[id] = tag;
    }
  }

  setOwned(tools) {
    this.ecuDongle.visible = tools.includes('ecu');
    this.lockTags.balancer.visible = !tools.includes('balancer');
    this.lockTags.ultrasonic.visible = !tools.includes('ultrasonic');
    this.floorJack.visible = tools.includes('floor_jack');
  }

  // ---------------------------------------------------------------- adjustable work lamp
  _buildWorkLamp() {
    const R = this.root;
    const lamp = (this.lamp = { group: new THREE.Group(), on: true });
    lamp.group.position.set(2.2, 0, 2.3);
    R.add(lamp.group);
    const blk = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, metalness: 0.6, roughness: 0.4 });
    const yel = new THREE.MeshStandardMaterial({ color: 0xe0b100, metalness: 0.3, roughness: 0.45 });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * PI * 2;
      box(lamp.group, 0.35, 0.03, 0.04, blk, [Math.cos(a) * 0.17, 0.04, Math.sin(a) * 0.17], [0, -a, 0]);
    }
    cyl(lamp.group, 0.018, 0.018, 1.7, 10, blk, [0, 0.88, 0]);
    lamp.head = new THREE.Group();
    lamp.head.position.set(0, 1.72, 0);
    lamp.group.add(lamp.head);
    const shade = cyl(lamp.head, 0.07, 0.14, 0.18, 24, yel, [0, 0, 0], [PI / 2, 0, 0], { open: true });
    shade.material.side = THREE.DoubleSide;
    lamp.bulbMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff1d6, emissiveIntensity: 6 });
    sphere(lamp.head, 0.045, lamp.bulbMat, [0, 0, 0.03], { cast: false });
    const spot = (lamp.light = new THREE.SpotLight(0xfff1d6, 30, 12, 0.55, 0.45, 2));
    spot.position.set(0, 0, 0.05);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.bias = -0.0005;
    spot.shadow.normalBias = 0.02;
    spot.shadow.camera.near = 0.1;
    lamp.head.add(spot);
    lamp.target = new THREE.Object3D();
    R.add(lamp.target);
    spot.target = lamp.target;
    lamp.target.position.set(0, 0.6, 0);
    this._interact(lamp.group, 'lamp');
  }

  /** Swings the work lamp stand & head toward a world point. */
  aimLamp(point, immediate = false) {
    const lamp = this.lamp;
    const p = point.clone();
    // stand sits ~1.6m back from the target toward the player side, clear of the vehicle
    const base = V3(p.x + 0.9, 0, p.z + (p.z >= 0 ? 2.0 : -2.0));
    if (Math.abs(base.z) < 1.9) base.z = Math.sign(base.z || 1) * 1.9; // keep clear of the vehicle
    base.x = THREE.MathUtils.clamp(base.x, -6.5, 6.5);
    base.z = THREE.MathUtils.clamp(base.z, -5.5, 5.5);
    const d = immediate ? 0 : 1.1;
    gsap.to(lamp.group.position, { x: base.x, z: base.z, duration: d, ease: 'power2.inOut' });
    gsap.to(lamp.target.position, {
      x: p.x, y: p.y, z: p.z, duration: d, ease: 'power2.inOut',
      onUpdate: () => {
        const hw = lamp.head.getWorldPosition(new THREE.Vector3());
        lamp.head.lookAt(lamp.target.position);
        lamp.head.position.y = THREE.MathUtils.clamp(lamp.target.position.y + 1.0, 1.1, 1.85);
        void hw;
      },
    });
  }

  toggleLamp() {
    const l = this.lamp;
    l.on = !l.on;
    l.light.visible = l.on;
    l.bulbMat.emissiveIntensity = l.on ? 6 : 0.05;
    return l.on;
  }

  // ---------------------------------------------------------------- props
  _buildProps() {
    const R = this.root;
    // air compressor + hose reel
    const comp = new THREE.Group(); comp.position.set(-6.7, 0, -5.5); R.add(comp);
    const red = new THREE.MeshStandardMaterial({ color: 0xb3121b, metalness: 0.4, roughness: 0.4 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, metalness: 0.5, roughness: 0.4 });
    cyl(comp, 0.32, 0.32, 1.5, 28, red, [0, 0.85, 0]);
    sphere(comp, 0.32, red, [0, 1.6, 0], { scale: [1, 0.4, 1] });
    rbox(comp, 0.5, 0.3, 0.4, 0.03, dark, [0, 1.85, 0]);
    cyl(comp, 0.06, 0.06, 0.03, 16, new THREE.MeshStandardMaterial({ color: 0xffffff }), [0.2, 1.3, 0.3], [PI / 2, 0, 0]);
    const reel = new THREE.Group(); reel.position.set(-7.9, 2.2, -3.2); reel.rotation.y = PI / 2; R.add(reel);
    cyl(reel, 0.25, 0.25, 0.15, 24, red, [0, 0, 0], [PI / 2, 0, 0]);
    torus(reel, 0.19, 0.03, new THREE.MeshStandardMaterial({ color: 0xe0b100, roughness: 0.5 }), [0, 0, 0.1], null);
    // oil drums
    const drumM = new THREE.MeshStandardMaterial({ color: 0x1d4fa0, metalness: 0.6, roughness: 0.4 });
    for (const [x, z] of [[-7.3, 5.6], [-6.6, 5.8]]) {
      cyl(R, 0.29, 0.29, 0.88, 28, drumM, [x, 0.44, z]);
      for (const y of [0.25, 0.62]) torus(R, 0.29, 0.012, drumM, [x, y, z], [PI / 2, 0, 0]);
    }
    // fire extinguisher
    const fe = new THREE.Group(); fe.position.set(-7.85, 0.9, 3.4); R.add(fe);
    cyl(fe, 0.08, 0.08, 0.45, 18, red, [0, 0, 0]);
    sphere(fe, 0.08, red, [0, 0.22, 0], { scale: [1, 0.6, 1] });
    box(fe, 0.12, 0.05, 0.03, dark, [0, 0.3, 0]);
    // wall fan
    const fan = new THREE.Group(); fan.position.set(7.9, 3.2, -1.5); fan.rotation.y = -PI / 2; R.add(fan);
    torus(fan, 0.35, 0.02, dark, [0, 0, 0], null);
    this.fanBlades = new THREE.Group(); fan.add(this.fanBlades);
    const bladeM = new THREE.MeshStandardMaterial({ color: 0x8b9096, metalness: 0.6, roughness: 0.3 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * PI * 2;
      box(this.fanBlades, 0.08, 0.32, 0.01, bladeM, [-Math.sin(a) * 0.16, Math.cos(a) * 0.16, 0], [0, 0.3, a, 'ZYX'], { cast: false });
    }
    // trash can + rag bin
    cyl(R, 0.24, 0.22, 0.75, 20, new THREE.MeshStandardMaterial({ color: 0x2f62a8, metalness: 0.3, roughness: 0.6 }), [-5.1, 0.375, 4.9]);
  }

  // ---------------------------------------------------------------- movable equipment
  _buildMovables() {
    const R = this.root;
    // drain pan
    const pan = (this.drainPan = new THREE.Group());
    pan.position.set(-2.7, 0, 3.0);
    R.add(pan);
    const pm = new THREE.MeshStandardMaterial({ color: 0x111214, metalness: 0.2, roughness: 0.55 });
    const panGeo = new THREE.CylinderGeometry(0.3, 0.24, 0.12, 32, 1, true);
    mesh(pan, panGeo, pm, [0, 0.06, 0]).material.side = THREE.DoubleSide;
    cyl(pan, 0.24, 0.24, 0.01, 32, pm, [0, 0.005, 0]);
    torus(pan, 0.3, 0.012, pm, [0, 0.12, 0], [PI / 2, 0, 0]);
    this.panOil = cyl(pan, 0.27, 0.27, 0.005, 32, new THREE.MeshPhysicalMaterial({ color: 0x120c04, roughness: 0.05, clearcoat: 1, metalness: 0.2 }), [0, 0.02, 0], null, { cast: false });
    this.panOil.scale.set(0.85, 1, 0.85);
    this.panOil.visible = false;
    this.drainPanHome = pan.position.clone();
    this._interact(pan, 'drainpan');

    // floor jack
    const jack = (this.floorJack = new THREE.Group());
    jack.position.set(-2.7, 0, 4.4);
    jack.rotation.y = PI / 2;
    R.add(jack);
    const jm = new THREE.MeshStandardMaterial({ color: 0xb3121b, metalness: 0.4, roughness: 0.4 });
    rbox(jack, 0.75, 0.12, 0.3, 0.03, jm, [0, 0.12, 0]);
    for (const [x, z] of [[-0.3, -0.13], [-0.3, 0.13], [0.3, -0.15], [0.3, 0.15]]) cyl(jack, 0.05, 0.05, 0.04, 14, new THREE.MeshStandardMaterial({ color: 0x111111 }), [x, 0.05, z], [PI / 2, 0, 0]);
    jack.arm = new THREE.Group(); jack.arm.position.set(-0.25, 0.15, 0); jack.add(jack.arm);
    box(jack.arm, 0.55, 0.05, 0.1, jm, [0.27, 0, 0]);
    cyl(jack.arm, 0.07, 0.07, 0.04, 20, new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8 }), [0.55, 0.04, 0]);
    tube(jack, [V3(0.35, 0.15, 0), V3(0.8, 0.5, 0), V3(1.1, 0.9, 0)], 0.015, new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 1, roughness: 0.2 }), { segments: 8 });
    this.floorJackHome = jack.position.clone();
    jack.visible = false;
    this._interact(jack, 'floorjack');
  }

  placeDrainPan(worldPoint) {
    gsap.to(this.drainPan.position, { x: worldPoint.x, z: worldPoint.z, y: Math.max(0, worldPoint.y), duration: 0.8, ease: 'power2.out' });
  }

  returnEquipment() {
    gsap.to(this.drainPan.position, { x: this.drainPanHome.x, y: 0, z: this.drainPanHome.z, duration: 0.8 });
    gsap.to(this.floorJack.position, { x: this.floorJackHome.x, y: 0, z: this.floorJackHome.z, duration: 0.8 });
    gsap.to(this.floorJack.arm.rotation, { z: 0, duration: 0.5 });
    this.panOil.visible = false;
  }

  placeFloorJack(worldPoint) {
    const j = this.floorJack;
    j.visible = true;
    gsap.to(j.position, { x: worldPoint.x - 0.3, z: worldPoint.z, y: this.lift.height + this.lift.deckTop, duration: 1.0, ease: 'power2.out' });
    gsap.to(j.arm.rotation, { z: 0.35, duration: 0.8, delay: 0.9 });
  }

  // ---------------------------------------------------------------- cosmetics
  applyCosmetics(c) {
    const wall = COSMETICS.wall.find((w) => w.id === c.wall) || COSMETICS.wall[0];
    this.wallMat.color.set(wall.color);
    const fl = COSMETICS.floor.find((w) => w.id === c.floor) || COSMETICS.floor[0];
    if (fl.id === 'checker') {
      this.floorMat.map = this._checker || (this._checker = checkerTexture());
      this.floorMat.color.set(0xffffff);
      this.floorMat.roughness = 0.4; this.floorMat.clearcoat = 0.8;
    } else {
      this.floorMat.map = this.floorTex.map;
      this.floorMat.color.set(fl.id === 'epoxy' ? 0x3a3d40 : 0xffffff);
      this.floorMat.roughness = fl.id === 'epoxy' ? 0.35 : 0.75;
      this.floorMat.clearcoat = fl.id === 'epoxy' ? 1.0 : 0.35;
      this.floorMat.clearcoatRoughness = fl.id === 'epoxy' ? 0.05 : 0.25;
    }
    this.floorMat.needsUpdate = true;
    const li = COSMETICS.lighting.find((w) => w.id === c.lighting) || COSMETICS.lighting[0];
    const col = new THREE.Color(li.color);
    for (const f of this.fixtures) f.light?.color.copy(col);
    this.tubeMat.emissive.copy(col);
    this.key.color.copy(col).lerp(new THREE.Color(0xffffff), 0.3);
    this.accent.visible = !!li.accent;
    if (li.accent) this.accentMat.emissive.set(li.accent);
    const wr = COSMETICS.wrap.find((w) => w.id === c.wrap) || COSMETICS.wrap[0];
    this.chestPaint.color.set(wr.color);
    this.chestPaint.metalness = wr.metal;
    this.chestPaint.roughness = wr.id === 'carbon' ? 0.5 : 0.28;
    this.liftPaint.color.set(wr.color);
  }

  update(dt, t) {
    if (this.fanBlades) this.fanBlades.rotation.z += dt * 9;
    // subtle fluorescent flicker
    if (Math.random() < 0.004) { this.tubeMat.emissiveIntensity = 1.2; this._flick = 0.06; }
    if (this._flick !== undefined && (this._flick -= dt) < 0) { this.tubeMat.emissiveIntensity = 3.2; this._flick = undefined; }
  }
}

export function textTexture(text, bg = '#222', fg = '#fff', w = 512, h = 160) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.font = `bold ${Math.floor(h * 0.42)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
