// ToolController.js — tool switching, procedural tool models, hand reach/grip choreography and
// every fastener / part interaction (ratchet strokes, impact hammering, cross-wrench cranking,
// screwdriver twists, finger unthreading, two-handed part removal & installation, fluids, cleaning).
import * as THREE from 'three';
import gsap from 'gsap';
import { ArmRig } from './ArmRig.js';
import { FASTENER_TOOLS } from './VehicleManager.js';
import { TOOLS, PART_CATALOG, CONSUMABLES } from './Economy.js';
import { box, rbox, cyl, sphere, tube, V3 } from './Kit.js';
import { setGlow } from './Materials.js';

const PI = Math.PI;
const PITCH = 0.0015; // thread pitch (m per revolution) used for visual back-out

const HANDHELD = ['hand', 'socket', 'lug_wrench', 'screwdriver', 'drain_pan', 'impact', 'torque', 'multimeter', 'floor_jack'];

function tween(target, vars) {
  return new Promise((res) => gsap.to(target, { ...vars, onComplete: () => { vars.onComplete && vars.onComplete(); res(); } }));
}
const wait = (s) => new Promise((r) => gsap.delayedCall(s, r));

export class ToolController {
  constructor(ctx) {
    Object.assign(this, ctx); // camera, scene, audio, vfx, vm, economy, garage, hud, cam, events
    this.rig = new ArmRig(this.camera);
    this.models = {};
    for (const id of ['socket', 'lug_wrench', 'screwdriver', 'impact', 'torque', 'multimeter']) this.models[id] = this.makeToolModel(id);
    this.meter = this._makeMeter();
    this.bottle = this._makeBottle();
    this.brush = this._makeBrush();
    this.current = 'hand';
    this.toolObj = null;
    this.busy = false;
    this.grease = 0;
    this._anchors = [];
  }

  get handheld() { return HANDHELD.filter((id) => this.economy.hasTool(id)); }

  // ================================================================ tool models
  /** Builds a tool. Convention: drive/tip at origin, drive axis +Y, userData.grip = right-hand anchor. */
  makeToolModel(id) {
    const g = new THREE.Group();
    g.name = `tool_${id}`;
    const chrome = new THREE.MeshStandardMaterial({ color: 0xe9ecef, metalness: 1, roughness: 0.12 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a1b1d, metalness: 0.4, roughness: 0.5 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.85 });
    const grip = new THREE.Object3D();
    const grip2 = new THREE.Object3D();
    g.add(grip, grip2);
    if (id === 'socket' || id === 'torque') {
      const len = id === 'torque' ? 0.42 : 0.22;
      cyl(g, 0.0135, 0.0135, 0.036, 6, chrome, [0, 0.018, 0]);
      cyl(g, 0.0145, 0.0145, 0.014, 20, chrome, [0, 0.03, 0]);
      cyl(g, 0.02, 0.02, 0.018, 24, chrome, [0, 0.045, 0]);
      cyl(g, 0.008, 0.008, 0.008, 12, dark, [0, 0.057, 0]);
      rbox(g, len, 0.016, 0.011, 0.005, chrome, [len / 2 + 0.012, 0.045, 0]);
      cyl(g, 0.0125, 0.0125, len * 0.45, 16, id === 'torque' ? dark : new THREE.MeshStandardMaterial({ color: 0xb01414, roughness: 0.5 }), [len * 0.78, 0.045, 0], [0, 0, PI / 2]);
      if (id === 'torque') {
        cyl(g, 0.016, 0.016, 0.06, 18, chrome, [len * 0.48, 0.045, 0], [0, 0, PI / 2]);
        box(g, 0.05, 0.004, 0.013, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }), [len * 0.48, 0.055, 0]);
      }
      grip.position.set(len * 0.78, 0.045, 0);
      grip2.position.set(0, 0.075, 0); grip2.rotation.z = PI / 2;
    } else if (id === 'lug_wrench') {
      const m = new THREE.MeshStandardMaterial({ color: 0x4a4e54, metalness: 0.85, roughness: 0.35 });
      cyl(g, 0.016, 0.016, 0.04, 6, m, [0, 0.02, 0]);
      cyl(g, 0.009, 0.009, 0.2, 10, m, [0, 0.12, 0]);
      cyl(g, 0.009, 0.009, 0.4, 10, m, [0, 0.22, 0], [0, 0, PI / 2]);
      cyl(g, 0.009, 0.009, 0.16, 10, m, [0, 0.3, 0]);
      cyl(g, 0.014, 0.014, 0.03, 6, m, [0, 0.38, 0]);
      for (const s of [-1, 1]) cyl(g, 0.017, 0.017, 0.03, 6, m, [s * 0.2, 0.22, 0], [0, 0, PI / 2]);
      grip.position.set(0.16, 0.22, 0);
      grip2.position.set(-0.16, 0.22, 0);
    } else if (id === 'screwdriver') {
      cyl(g, 0.0032, 0.0032, 0.12, 8, chrome, [0, 0.06, 0]);
      box(g, 0.007, 0.006, 0.0015, chrome, [0, 0.002, 0]);
      const hm = new THREE.MeshPhysicalMaterial({ color: 0xd8b318, roughness: 0.25, clearcoat: 1, transmission: 0, metalness: 0 });
      cyl(g, 0.016, 0.013, 0.11, 12, hm, [0, 0.175, 0]);
      cyl(g, 0.0165, 0.0165, 0.012, 12, dark, [0, 0.125, 0]);
      sphere(g, 0.016, hm, [0, 0.23, 0], { scale: [1, 0.5, 1] });
      grip.position.set(0, 0.18, 0); grip.rotation.z = PI / 2;
    } else if (id === 'impact') {
      cyl(g, 0.015, 0.015, 0.04, 6, dark, [0, 0.02, 0]);
      cyl(g, 0.009, 0.009, 0.02, 4, chrome, [0, 0.045, 0]);
      const body = new THREE.MeshStandardMaterial({ color: 0x232528, metalness: 0.5, roughness: 0.35 });
      const acc = new THREE.MeshStandardMaterial({ color: 0xd4570f, roughness: 0.5 });
      cyl(g, 0.034, 0.04, 0.05, 20, chrome, [0, 0.075, 0]);
      cyl(g, 0.042, 0.042, 0.13, 22, body, [0, 0.165, 0]);
      cyl(g, 0.043, 0.043, 0.02, 22, acc, [0, 0.12, 0]);
      rbox(g, 0.13, 0.04, 0.035, 0.012, body, [-0.075, 0.2, 0], [0, 0, -0.12]);
      rbox(g, 0.025, 0.03, 0.012, 0.005, acc, [-0.035, 0.18, 0]);
      cyl(g, 0.009, 0.009, 0.03, 10, chrome, [-0.15, 0.21, 0], [0, 0, PI / 2]);
      tube(g, [V3(-0.16, 0.21, 0), V3(-0.25, 0.17, 0.02), V3(-0.33, 0.02, 0.05), V3(-0.4, -0.25, 0.1)], 0.006, new THREE.MeshStandardMaterial({ color: 0xe0b100, roughness: 0.5 }), { segments: 24 });
      grip.position.set(-0.08, 0.2, 0); grip.rotation.set(0, PI, -0.12);
      grip2.position.set(0, 0.2, 0.0); grip2.rotation.z = PI / 2;
    } else if (id === 'multimeter') {
      const red = new THREE.MeshStandardMaterial({ color: 0xc8261e, roughness: 0.45 });
      cyl(g, 0.0015, 0.0015, 0.02, 6, chrome, [0, 0.01, 0]);
      cyl(g, 0.006, 0.007, 0.11, 12, red, [0, 0.075, 0]);
      tube(g, [V3(0, 0.13, 0), V3(-0.02, 0.2, 0.03), V3(-0.12, 0.2, 0.05)], 0.0025, red, { segments: 12 });
      grip.position.set(0, 0.08, 0); grip.rotation.z = PI / 2;
    }
    g.userData.grip = grip;
    g.userData.grip2 = grip2;
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  _makeMeter() {
    const g = new THREE.Group();
    rbox(g, 0.085, 0.15, 0.032, 0.01, new THREE.MeshStandardMaterial({ color: 0xe0b100, roughness: 0.5 }), [0, 0.05, 0]);
    const c = document.createElement('canvas'); c.width = 128; c.height = 64;
    this.meterCanvas = c;
    this.meterTex = new THREE.CanvasTexture(c);
    this.meterTex.colorSpace = THREE.SRGBColorSpace;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.065, 0.035), new THREE.MeshBasicMaterial({ map: this.meterTex, toneMapped: false }));
    scr.position.set(0, 0.095, 0.017);
    g.add(scr);
    cyl(g, 0.018, 0.018, 0.01, 20, new THREE.MeshStandardMaterial({ color: 0x222222 }), [0, 0.045, 0.017], [PI / 2, 0, 0]);
    this._drawMeter('-.--', 'V');
    const grip = new THREE.Object3D(); grip.position.set(0, 0.02, -0.02); g.add(grip);
    g.userData.grip = grip;
    return g;
  }

  _drawMeter(val, unit) {
    const g = this.meterCanvas.getContext('2d');
    g.fillStyle = '#9fb59a'; g.fillRect(0, 0, 128, 64);
    g.fillStyle = '#132013'; g.font = 'bold 34px monospace'; g.textAlign = 'right';
    g.fillText(val, 100, 44);
    g.font = 'bold 14px monospace'; g.fillText(unit, 124, 58);
    this.meterTex.needsUpdate = true;
  }

  _makeBottle() {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0xf0c419, roughness: 0.4 });
    rbox(g, 0.1, 0.22, 0.06, 0.02, m, [0, 0.13, 0]);
    cyl(g, 0.018, 0.018, 0.04, 14, new THREE.MeshStandardMaterial({ color: 0x111111 }), [0, 0.0, 0]);
    const grip = new THREE.Object3D(); grip.position.set(0, 0.16, 0); grip.rotation.z = PI / 2; g.add(grip);
    g.userData.grip = grip;
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  _makeBrush() {
    const g = new THREE.Group();
    rbox(g, 0.03, 0.18, 0.015, 0.006, new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.7 }), [0, 0.09, 0]);
    box(g, 0.035, 0.04, 0.02, new THREE.MeshStandardMaterial({ color: 0xd8c690, roughness: 1 }), [0, 0.0, 0.0]);
    const grip = new THREE.Object3D(); grip.position.set(0, 0.12, 0); grip.rotation.z = PI / 2; g.add(grip);
    g.userData.grip = grip;
    return g;
  }

  // ================================================================ equip / hold
  _holdInHand(model, side = 'R') {
    const socket = this.rig.socketObject(side, 'grip');
    const grip = model.userData.grip;
    const gm = new THREE.Matrix4().compose(grip.position, grip.quaternion, new THREE.Vector3(1, 1, 1)).invert();
    socket.add(model);
    gm.decompose(model.position, model.quaternion, model.scale);
  }

  async equip(id) {
    if (this.busy || id === this.current) return;
    if (!this.economy.hasTool(id)) { this.hud.toast(`You don't own the ${TOOLS.find((t) => t.id === id)?.name}. Buy it at the shop terminal.`, 'warn'); return; }
    this.busy = true;
    this.audio.play('ui');
    this.rig.setRestOffset('R', 0, -0.25, 0.05);
    if (this.current === 'multimeter') this.rig.setRestOffset('L', 0, -0.25, 0.05);
    await wait(0.18);
    if (this.toolObj) this.toolObj.parent?.remove(this.toolObj);
    if (this.meter.parent) this.meter.parent.remove(this.meter);
    this.toolObj = this.models[id] || null;
    if (this.toolObj) this._holdInHand(this.toolObj);
    if (id === 'multimeter') { this._holdInHand(this.meter, 'L'); this.rig.setRestOffset('L', 0.05, 0.1, 0.02); this.rig.setPose('L', 'grip'); }
    this.current = id;
    this.rig.setRestOffset('R', 0, this.toolObj ? 0.07 : 0.0, 0);
    this.rig.setPose('R', this.toolObj ? 'grip' : 'relaxed');
    this.audio.play('socketSnap', { volume: 0.4 });
    this.events.emit('toolChanged', id);
    await wait(0.15);
    this.busy = false;
  }

  _speed(tool) {
    if (tool === 'impact') return this.economy.hasUpgrade('compressor') ? 1.4 : 1;
    if (['socket', 'lug_wrench', 'screwdriver', 'torque', 'hand'].includes(tool)) return this.economy.hasUpgrade('cv_sockets') ? 1.3 : 1;
    return 1;
  }

  // ================================================================ geometry helpers
  _handleDir(P, A) {
    const toCam = this.camera.position.clone().sub(P);
    let H = toCam.sub(A.clone().multiplyScalar(toCam.dot(A)));
    if (H.lengthSq() < 1e-6) H = new THREE.Vector3(1, 0, 0).sub(A.clone().multiplyScalar(A.x));
    H.normalize();
    // tilt the handle slightly downward & toward the right hand for a natural wrist angle
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    H.addScaledVector(right, 0.6).addScaledVector(new THREE.Vector3(0, -1, 0), 0.25);
    H.sub(A.clone().multiplyScalar(H.dot(A))).normalize();
    return H;
  }

  _poseTool(model, P, A, H, angle, offset, jitter = 0) {
    const x = H.clone().applyAxisAngle(A, angle);
    const z = new THREE.Vector3().crossVectors(x, A);
    const m = new THREE.Matrix4().makeBasis(x, A, z);
    model.quaternion.setFromRotationMatrix(m);
    model.position.copy(P).addScaledVector(A, offset);
    if (jitter) model.position.add(new THREE.Vector3((Math.random() - 0.5) * jitter, (Math.random() - 0.5) * jitter, (Math.random() - 0.5) * jitter));
  }

  async _engageTool(model, P, A, H, offset, dur) {
    this.scene.attach(model);
    this.rig.follow('R', model.userData.grip, { stiffness: 22, pose: 'grip' });
    const p0 = model.position.clone(), q0 = model.quaternion.clone();
    const tmp = new THREE.Object3D();
    this._poseTool(tmp, P, A, H, 0, offset);
    const s = { k: 0 };
    await tween(s, {
      k: 1, duration: dur, ease: 'power2.inOut',
      onUpdate: () => {
        model.position.lerpVectors(p0, tmp.position, s.k);
        model.position.addScaledVector(A, Math.sin(s.k * PI) * 0.06);
        model.quaternion.slerpQuaternions(q0, tmp.quaternion, s.k);
      },
    });
  }

  async _returnTool(model) {
    const socket = this.rig.socketObject('R', 'grip');
    this.rig.rest('R', 'grip');
    // fly the tool back into the resting fist
    const p0 = model.position.clone(), q0 = model.quaternion.clone();
    const s = { k: 0 };
    const target = new THREE.Object3D();
    await tween(s, {
      k: 1, duration: 0.35, ease: 'power2.inOut',
      onUpdate: () => {
        socket.updateMatrixWorld();
        const grip = model.userData.grip;
        const inv = new THREE.Matrix4().compose(grip.position, grip.quaternion, new THREE.Vector3(1, 1, 1)).invert();
        const mw = socket.matrixWorld.clone().multiply(inv);
        mw.decompose(target.position, target.quaternion, target.scale);
        model.position.lerpVectors(p0, target.position, s.k);
        model.quaternion.slerpQuaternions(q0, target.quaternion, s.k);
      },
    });
    this._holdInHand(model);
  }

  _anchor() {
    const a = new THREE.Object3D();
    this.scene.add(a);
    this._anchors.push(a);
    return a;
  }

  _clearAnchors() {
    for (const a of this._anchors) a.parent?.remove(a);
    this._anchors = [];
  }

  /** Orients an anchor so a hand approaching it has fingers along `fingerDir` and back of hand toward `backDir`. */
  _orientAnchor(anchor, fingerDir, backDir, xAxisOverride) {
    const y = fingerDir.clone().normalize();
    let z = backDir.clone().sub(y.clone().multiplyScalar(backDir.dot(y)));
    if (z.lengthSq() < 1e-6) z = new THREE.Vector3(0, 1, 0).sub(y.clone().multiplyScalar(y.y));
    z.normalize();
    let x = new THREE.Vector3().crossVectors(y, z);
    if (xAxisOverride) {
      x = xAxisOverride.clone().normalize();
      const yy = new THREE.Vector3().crossVectors(z, x).normalize();
      z = new THREE.Vector3().crossVectors(x, yy);
      anchor.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, yy, z));
      return;
    }
    anchor.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  }

  // ================================================================ fasteners
  async useOnFastener(f) {
    if (this.busy) return;
    const v = this.vm.current;
    if (!v) return;
    const tool = this.current;
    const action = f.state === 'tight' ? 'loosen' : f.state === 'loose' ? 'tighten' : null;
    if (!action) return;
    if (tool === 'multimeter' && f.part.electrical) return this.measure(f.part);
    if (tool === 'drain_pan') return this.placePan();
    if (tool === 'floor_jack') return this.placeJack(f.part);
    const allowed = FASTENER_TOOLS[f.type][action];
    if (!allowed.includes(tool)) {
      const names = allowed.filter((t) => t !== 'torque' || action === 'tighten').map((t) => TOOLS.find((x) => x.id === t).name);
      this.hud.toast(`${f.label}: use ${names.join(' or ')}.`, 'warn');
      this.audio.play('error');
      return;
    }
    if (action === 'loosen') {
      const c = this.vm.canLoosen(f);
      if (!c.ok) { this.hud.toast(c.reason, 'warn'); this.audio.play('error'); return; }
    }
    this.busy = true;
    this.events.emit('busy', true);
    try {
      await this.cam.ensureReach(f.worldPos());
      this._checkBurn(f.part);
      if (action === 'loosen') await this._loosen(f, tool);
      else await this._tighten(f, tool);
    } finally {
      this._clearAnchors();
      this.rig.rest('L');
      if (this.current === 'multimeter') { this.rig.setPose('L', 'grip'); }
      this.busy = false;
      this.events.emit('busy', false);
    }
  }

  async _loosen(f, tool) {
    const P = f.worldPos();
    const A = f.worldAxis();
    const speed = this._speed(tool);
    if (tool === 'hand') {
      await this._handSpin(f, 'loosen', 'R');
    } else {
      const model = this.toolObj;
      const H = this._handleDir(P, A);
      await this._engageTool(model, P, A, H, f.backout, 0.42 / speed);
      this.audio.play('socketSnap', { position: P });
      if (tool === 'impact') await this._impact(f, model, P, A, H, 'loosen', speed);
      else if (tool === 'lug_wrench') await this._crank(f, model, P, A, H, 'loosen', speed);
      else if (tool === 'screwdriver') await this._twist(f, model, P, A, 'loosen', speed);
      else await this._ratchet(f, model, P, A, H, 'loosen', speed);
      await this._returnTool(model);
      if (f.backout < f.threadLen) await this._handSpin(f, 'loosen', 'L');
    }
    this._finishRemoval(f);
  }

  async _tighten(f, tool) {
    const P0 = f.worldPos();
    const A = f.worldAxis();
    const speed = this._speed(tool);
    // start the thread by hand so it doesn't cross-thread
    if (tool !== 'impact') await this._handSpin(f, 'start', tool === 'hand' ? 'R' : 'L');
    if (tool === 'hand') {
      await this._handSpin(f, 'tighten', 'R');
    } else {
      const P = P0;
      const model = this.toolObj;
      const H = this._handleDir(P, A);
      await this._engageTool(model, P, A, H, f.backout, 0.4 / speed);
      this.audio.play('socketSnap', { position: P });
      if (tool === 'impact') await this._impact(f, model, P, A, H, 'tighten', speed);
      else if (tool === 'lug_wrench') await this._crank(f, model, P, A, H, 'tighten', speed);
      else if (tool === 'screwdriver') await this._twist(f, model, P, A, 'tighten', speed);
      else await this._ratchet(f, model, P, A, H, 'tighten', speed);
      await this._returnTool(model);
    }
    f.backout = 0; f.sync();
    f.state = 'tight';
    f.retightened = true;
    f.torqued = tool === 'torque';
    const r = this.vm.onFastenerTightened(f, tool);
    if (r.warn) this.hud.toast(r.warn, 'warn');
    this.events.emit('fastenerTight', f);
  }

  /** Ratchet / torque wrench: power strokes with the fastener, free return strokes with pawl clicks. */
  async _ratchet(f, model, P, A, H, mode, speed) {
    const sign = mode === 'loosen' ? 1 : -1;
    const swing = 0.9;
    if (mode === 'loosen' && f.seized) await this._breakFree(f, model, P, A, H, speed);
    const strokes = mode === 'loosen' ? 2 : (this.current === 'torque' ? 3 : 2);
    for (let i = 0; i < strokes; i++) {
      const s0 = f.spin, b0 = f.backout;
      const st = { a: 0 };
      const last = mode === 'tighten' && i === strokes - 1;
      await tween(st, {
        a: swing, duration: (last ? 0.55 : 0.32) / speed, ease: last ? 'power1.in' : 'power2.inOut',
        onUpdate: () => {
          f.spin = s0 + sign * st.a;
          f.backout = Math.max(0, b0 + sign * PITCH * (st.a / (2 * PI)) * 4);
          f.sync();
          this._poseTool(model, P, A, H, sign * st.a, f.backout);
        },
      });
      if (last && this.current === 'torque') {
        this.audio.play('torqueClick', { position: P });
        const fl = { a: 0 };
        await tween(fl, { a: 1, duration: 0.18, yoyo: true, repeat: 1, onUpdate: () => this._poseTool(model, P, A, H, sign * (swing + fl.a * 0.04), f.backout) });
        this.hud.toast('Click! Torqued to spec.', 'ok', 900);
      }
      if (i < strokes - 1 || mode === 'loosen') {
        this.audio.play('ratchet', { position: P, clicks: 7, dur: 0.24 / speed });
        await tween(st, { a: 0, duration: 0.24 / speed, ease: 'power1.inOut', onUpdate: () => this._poseTool(model, P, A, H, sign * st.a, f.backout) });
      }
    }
  }

  async _breakFree(f, model, P, A, H, speed) {
    this.audio.play('creak', { position: P, dur: 0.9 / speed });
    this.hud.toast('Seized with rust… leaning on it!', 'warn', 1200);
    const st = { t: 0 };
    await tween(st, {
      t: 1, duration: 0.9 / speed, ease: 'none',
      onUpdate: () => this._poseTool(model, P, A, H, 0.06 * st.t + Math.sin(st.t * 60) * 0.012, f.backout, 0.002),
    });
    f.seized = false;
    this.vfx.rustPuff(P);
    this.vfx.sparkBurst(P, A, 10, 1.4);
    this.audio.play('clank', { position: P, freq: 900 });
  }

  /** Cross lug wrench: both hands crank the bar around the stud axis. */
  async _crank(f, model, P, A, H, mode, speed) {
    const sign = mode === 'loosen' ? 1 : -1;
    this.rig.follow('L', model.userData.grip2, { stiffness: 18, pose: 'grip' });
    if (mode === 'loosen' && f.seized) await this._breakFree(f, model, P, A, H, speed);
    const turns = mode === 'loosen' ? 1.25 : 1.0;
    const s0 = f.spin, b0 = f.backout;
    const st = { a: 0 };
    const total = turns * 2 * PI;
    const target = mode === 'loosen' ? f.threadLen * 0.55 : 0;
    this.audio.play('thread', { position: P, turns: 8, dur: 1.4 / speed });
    await tween(st, {
      a: total, duration: 1.4 / speed, ease: mode === 'loosen' ? 'power1.inOut' : 'power2.in',
      onUpdate: () => {
        const k = st.a / total;
        f.spin = s0 + sign * st.a;
        f.backout = b0 + (target - b0) * k;
        f.sync();
        this._poseTool(model, P, A, H, sign * st.a, f.backout);
      },
    });
    this.audio.play(mode === 'loosen' ? 'socketSnap' : 'clank', { position: P, freq: 800 });
    this.rig.rest('L');
  }

  /** Pneumatic impact: hammering spin with recoil jitter. Seized fasteners throw sparks. */
  async _impact(f, model, P, A, H, mode, speed) {
    const sign = mode === 'loosen' ? 1 : -1;
    this.rig.follow('L', model.userData.grip2, { stiffness: 14, pose: 'cup' });
    this.rig.setStiffness('R', 40);
    const seized = mode === 'loosen' && f.seized;
    const dur = (seized ? 1.6 : mode === 'loosen' ? 0.85 : 0.65) / speed;
    this.audio.play('impact', { position: P, dur, loosen: mode === 'loosen' });
    const s0 = f.spin, b0 = f.backout;
    const end = mode === 'loosen' ? f.threadLen + 0.012 : 0;
    const st = { t: 0 };
    let nextSpark = 0.2;
    await tween(st, {
      t: 1, duration: dur, ease: 'none',
      onUpdate: () => {
        const k = seized ? Math.max(0, (st.t - 0.45) / 0.55) : st.t;
        f.spin = s0 + sign * st.t * 55;
        f.backout = b0 + (end - b0) * k;
        f.sync();
        const kick = -sign * (0.04 + Math.random() * 0.05);
        this._poseTool(model, P, A, H, kick, Math.min(f.backout, f.threadLen), 0.003);
        if (seized && st.t > nextSpark && st.t < 0.6) { nextSpark += 0.15; this.vfx.sparkBurst(P, A, 14, 2.2); this.audio.play('spark', { position: P }); }
      },
    });
    if (seized) { f.seized = false; this.vfx.rustPuff(P); }
    this.rig.setStiffness('R', 22);
    this.rig.rest('L');
    if (mode === 'tighten' && ['bolt', 'axle'].includes(f.type) && f.size < 1 && !this.economy.hasUpgrade('compressor') && Math.random() < 0.15) {
      f.stripped = true;
      this.vm.current.stats.stripped++;
      this.vfx.sparkBurst(P, A, 20, 1.5);
      f.material.userData.u.uWear.value = 1;
      f.material.userData.u.uHeat.value = 0.6;
      this.hud.toast('Over-torqued — stripped the threads! (Use a torque wrench on small bolts.)', 'bad', 3000);
    }
    if (mode === 'loosen') this.audio.play('drop', { position: P });
  }

  /** Screwdriver: twist with the fastener, re-grip, repeat. Fully backs the screw out. */
  async _twist(f, model, P, A, mode, speed) {
    const sign = mode === 'loosen' ? 1 : -1;
    const H = this._handleDir(P, A);
    const n = 4;
    const end = mode === 'loosen' ? f.threadLen + 0.006 : 0;
    const b0 = f.backout;
    for (let i = 0; i < n; i++) {
      const s0 = f.spin, bs = f.backout;
      const bt = b0 + (end - b0) * ((i + 1) / n);
      const st = { a: 0 };
      this.audio.play('screw', { position: P, turns: 2, dur: 0.3 / speed });
      await tween(st, {
        a: 1.35, duration: 0.3 / speed, ease: 'power1.inOut',
        onUpdate: () => {
          f.spin = s0 + sign * st.a;
          f.backout = bs + (bt - bs) * (st.a / 1.35);
          f.sync();
          this._poseTool(model, P, A, H, sign * st.a, f.backout);
        },
      });
      if (i < n - 1) await tween(st, { a: 0, duration: 0.16 / speed, onUpdate: () => this._poseTool(model, P, A, H, sign * st.a, f.backout + 0.01 * Math.sin(st.a * 2)) });
    }
  }

  /**
   * Fingers spin a fastener: 'loosen' backs it fully out, 'start' threads it in a few turns,
   * 'tighten' finishes a hand-tight fastener (clamps, filters, petcocks).
   */
  async _handSpin(f, mode, side) {
    const P = f.worldPos();
    const A = f.worldAxis();
    const isFilter = f.type === 'filter';
    const anchor = this._anchor();
    const back = this._handleDir(P, A);
    const update = (roll) => {
      const base = isFilter ? 0.055 : 0.012;
      anchor.position.copy(P).addScaledVector(A, f.backout + base);
      if (isFilter) this._orientAnchor(anchor, back.clone().negate(), A.clone(), A.clone());
      else this._orientAnchor(anchor, A.clone().negate(), back.clone());
      anchor.rotateOnWorldAxis(A, roll);
    };
    update(0);
    this.rig.follow(side, anchor, { socket: isFilter ? 'grip' : 'pinch', stiffness: 16, pose: 'open' });
    await wait(0.3);
    this.rig.setPose(side, isFilter ? 'cup' : 'pinch');
    await wait(0.12);
    const sign = mode === 'loosen' ? 1 : -1;
    const target = mode === 'loosen' ? f.threadLen + 0.008 : mode === 'start' ? f.threadLen * 0.35 : 0;
    const twists = mode === 'loosen' ? 4 : mode === 'start' ? 2 : 3;
    const b0 = f.backout;
    for (let i = 0; i < twists; i++) {
      const s0 = f.spin, bs = f.backout;
      const bt = b0 + (target - b0) * ((i + 1) / twists);
      const st = { a: 0 };
      this.audio.play('thread', { position: P, turns: 3, dur: 0.22 });
      await tween(st, {
        a: 1.4, duration: 0.24, ease: 'power1.inOut',
        onUpdate: () => {
          f.spin = s0 + sign * st.a;
          f.backout = bs + (bt - bs) * (st.a / 1.4);
          f.sync();
          update(sign * st.a);
        },
      });
      if (i < twists - 1) {
        this.rig.setPose(side, 'open');
        await tween(st, { a: 0, duration: 0.12, onUpdate: () => update(sign * st.a) });
        this.rig.setPose(side, isFilter ? 'cup' : 'pinch');
      }
    }
    if (mode === 'loosen') {
      // pull it free in the fingers
      const st = { k: 0 };
      await tween(st, { k: 1, duration: 0.2, onUpdate: () => { f.backout = target + st.k * 0.03; f.sync(); update(0); } });
    }
    if (side === 'R' && this.current !== 'hand') this.rig.rest('R', 'grip');
    else this.rig.rest(side);
  }

  _finishRemoval(f) {
    f.state = 'removed';
    f.torqued = false;
    const part = f.part;
    if (part.autoRemove) {
      // the fastener *is* the part (spark plugs, spin-on filter): keep it visible, backed out
      f.backout = f.threadLen + 0.01; f.sync();
    } else {
      const P = f.worldPos();
      const s = { k: 0 };
      const m = f.mesh;
      gsap.to(s, {
        k: 1, duration: 0.35, ease: 'power2.in',
        onUpdate: () => { m.scale.setScalar(1 - s.k * 0.9); f.backout += 0.004; f.sync(); },
        onComplete: () => { f.group.visible = false; m.scale.setScalar(1); },
      });
      this.audio.play('drop', { position: P });
    }
    this.vm.onFastenerRemoved(f);
    this.events.emit('fastenerRemoved', f);
  }

  // ================================================================ parts
  _grabAnchors(part) {
    const box3 = new THREE.Box3().setFromObject(part.group);
    const C = box3.getCenter(new THREE.Vector3());
    const size = box3.getSize(new THREE.Vector3());
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0).normalize();
    const fwd = C.clone().sub(this.camera.position).normalize();
    const half = THREE.MathUtils.clamp(Math.max(size.x, size.z) * 0.42, 0.05, 0.22);
    const aR = this._anchor(), aL = this._anchor();
    aR.position.copy(C).addScaledVector(right, half);
    aL.position.copy(C).addScaledVector(right, -half);
    const up = new THREE.Vector3(0, 1, 0);
    this._orientAnchor(aR, fwd.clone().add(right.clone().multiplyScalar(-0.6)), up.clone().add(right));
    this._orientAnchor(aL, fwd.clone().add(right.clone().multiplyScalar(0.6)), up.clone().sub(right));
    part.group.attach(aR); part.group.attach(aL);
    return { aR, aL, C, size };
  }

  /** Two-handed removal: hands grab, wiggle & pull along the part's removal direction, toss to bench. */
  async removePart(part) {
    if (this.busy) return;
    const v = this.vm.current;
    const res = this.vm.canRemove(part);
    if (!res.ok) {
      this.hud.toast(res.reason, 'warn');
      this.audio.play('error');
      this.hud.inspectHint(part);
      return;
    }
    this.busy = true;
    this.events.emit('busy', true);
    try {
      const C0 = new THREE.Box3().setFromObject(part.group).getCenter(new THREE.Vector3());
      await this.cam.ensureReach(C0);
      this._checkBurn(part);
      const heldTool = this.toolObj;
      if (heldTool) heldTool.visible = false;
      const { aR, aL } = this._grabAnchors(part);
      this.rig.follow('R', aR, { stiffness: 12, pose: 'open' });
      this.rig.follow('L', aL, { stiffness: 12, pose: 'open' });
      await wait(0.42);
      this.rig.setPose('R', 'grip'); this.rig.setPose('L', 'grip');
      await wait(0.15);
      this.rig.setStiffness('R', 30); this.rig.setStiffness('L', 30);
      // fluid accidents
      this._fluidAccident(part);
      const dirW = part.removeDir.clone().transformDirection(part.group.parent.matrixWorld);
      this.scene.attach(part.group);
      const p0 = part.group.position.clone();
      const r0 = part.group.rotation.clone();
      const st = { k: 0 };
      this.audio.play(part.isWheel || part.kind === 'seat' ? 'rubber' : 'clank', { position: C0, freq: 500 });
      await tween(st, {
        k: 1, duration: 0.55, ease: 'power2.out',
        onUpdate: () => {
          part.group.position.copy(p0).addScaledVector(dirW, st.k * 0.14);
          part.group.rotation.set(r0.x + Math.sin(st.k * 18) * 0.02 * (1 - st.k), r0.y, r0.z + Math.cos(st.k * 15) * 0.02 * (1 - st.k));
        },
      });
      part.state = 'removed';
      this.rig.rest('R', heldTool ? 'grip' : 'relaxed');
      this.rig.rest('L');
      if (heldTool) heldTool.visible = true;
      this._addGrease(0.04);
      this.events.emit('partRemoved', part);
      await this.sendToBench(part);
    } finally {
      this._clearAnchors();
      this.busy = false;
      this.events.emit('busy', false);
    }
  }

  _fluidAccident(part) {
    const v = this.vm.current;
    if (part.fluid === 'coolant' && !v.fluids.coolant.none && v.fluids.coolant.level > 0.2) {
      const pos = new THREE.Box3().setFromObject(part.group).getCenter(new THREE.Vector3());
      if (v.fluids.coolant.pressurized) {
        this.vfx.coolantSpray(pos, new THREE.Vector3(0.3, 1, 0.4));
        this.audio.play('spray', { position: pos, dur: 1.6 });
        this.hud.flash('rgba(120,255,170,0.25)');
        this.hud.toast('Pressurised coolant spray! Let it cool & open the radiator petcock first.', 'bad', 3500);
        v.stats.burns++;
      } else {
        this.vfx.stream(() => pos, { color: new THREE.Color(0x2fbf5a), rate: 50, dur: 2.5, size: 0.01 });
        this.hud.toast('Coolant all over the floor — drain it at the radiator petcock next time.', 'bad', 3000);
      }
      v.stats.spills++;
      v.fluids.coolant.level = 0;
      v.fluids.coolant.pressurized = false;
    }
  }

  _checkBurn(part) {
    const v = this.vm.current;
    if (!v || v.hot < 0.5) return;
    if (/exhaust|turbo|header|manifold|muffler/.test(part.kind)) {
      this.audio.play('ouch');
      this.hud.flash('rgba(255,60,20,0.35)');
      this.hud.toast('Ouch! That exhaust is still scorching hot.', 'bad', 2200);
      v.stats.burns++;
      v.hot = 0.45;
    }
  }

  /** Arcs a removed part over to a free slot on the bench / floor. */
  async sendToBench(part) {
    const g = part.group;
    this.scene.attach(g);
    const startPos = g.position.clone();
    const startQ = g.quaternion.clone();
    const endQ = new THREE.Quaternion();
    if (part.isWheel) endQ.setFromEuler(new THREE.Euler(PI / 2, 0, 0));
    // measure the part in its resting orientation
    g.quaternion.copy(endQ);
    g.position.set(0, 0, 0);
    g.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(g);
    const size = b.getSize(new THREE.Vector3());
    const slot = this.garage.claimSlot(part, size);
    const endPos = slot.pos.clone().add(new THREE.Vector3(-(b.min.x + b.max.x) / 2, -b.min.y + 0.002, -(b.min.z + b.max.z) / 2));
    g.position.copy(startPos); g.quaternion.copy(startQ);
    const st = { k: 0 };
    const height = Math.max(0.5, startPos.distanceTo(endPos) * 0.25);
    await tween(st, {
      k: 1, duration: 0.95, ease: 'power1.inOut',
      onUpdate: () => {
        g.position.lerpVectors(startPos, endPos, st.k);
        g.position.y += Math.sin(st.k * PI) * height;
        g.quaternion.slerpQuaternions(startQ, endQ, st.k);
      },
    });
    this.audio.play(part.isWheel ? 'rubber' : 'clank', { position: endPos, freq: 700, volume: 0.6 });
    part.benchSlot = slot;
  }

  /** Installs a part from the bench: flies to its staging point, hands push it home, fasteners go in loose. */
  async installPart(part) {
    if (this.busy) return false;
    const res = this.vm.canInstall(part);
    if (!res.ok) { this.hud.toast(res.reason, 'warn'); this.audio.play('error'); return false; }
    this.busy = true;
    this.events.emit('busy', true);
    try {
      const g = part.group;
      const parent = part.slotParent;
      parent.updateMatrixWorld(true);
      const targetM = parent.matrixWorld.clone().multiply(new THREE.Matrix4().compose(part.slotPos, part.slotQuat, new THREE.Vector3(1, 1, 1)));
      const tPos = new THREE.Vector3(), tQ = new THREE.Quaternion(), tS = new THREE.Vector3();
      targetM.decompose(tPos, tQ, tS);
      const dirW = part.removeDir.clone().transformDirection(parent.matrixWorld);
      const stage = tPos.clone().addScaledVector(dirW, 0.16);
      this.garage.releaseSlot(part);
      const p0 = g.position.clone(), q0 = g.quaternion.clone();
      const st = { k: 0 };
      await tween(st, {
        k: 1, duration: 0.9, ease: 'power1.inOut',
        onUpdate: () => {
          g.position.lerpVectors(p0, stage, st.k);
          g.position.y += Math.sin(st.k * PI) * 0.4;
          g.quaternion.slerpQuaternions(q0, tQ, st.k);
        },
      });
      const C = new THREE.Box3().setFromObject(g).getCenter(new THREE.Vector3());
      await this.cam.ensureReach(C);
      const heldTool = this.toolObj;
      if (heldTool) heldTool.visible = false;
      const { aR, aL } = this._grabAnchors(part);
      this.rig.follow('R', aR, { stiffness: 14, pose: 'grip' });
      this.rig.follow('L', aL, { stiffness: 14, pose: 'grip' });
      await wait(0.4);
      const s2 = { k: 0 };
      const sp = g.position.clone();
      await tween(s2, { k: 1, duration: 0.45, ease: 'power2.in', onUpdate: () => g.position.lerpVectors(sp, tPos, s2.k) });
      parent.attach(g);
      g.position.copy(part.slotPos);
      g.quaternion.copy(part.slotQuat);
      this.audio.play(part.isWheel ? 'rubber' : 'clank', { position: tPos, freq: 650 });
      part.state = 'installed';
      for (const f of part.fasteners) {
        f.state = 'loose';
        f.backout = f.threadLen;
        f.group.visible = true;
        f.mesh.scale.setScalar(1);
        f.sync();
      }
      part.tightenLog = [];
      part.patternWarned = false;
      this.rig.rest('R', heldTool ? 'grip' : 'relaxed');
      this.rig.rest('L');
      if (heldTool) heldTool.visible = true;
      this.events.emit('partInstalled', part);
      return true;
    } finally {
      this._clearAnchors();
      this.busy = false;
      this.events.emit('busy', false);
    }
  }

  // ================================================================ special actions
  async toggleHood(hit) {
    const v = this.vm.current;
    if (this.busy || !v?.hood) return;
    this.busy = true;
    try {
      const hood = v.hood;
      const b = new THREE.Box3().setFromObject(hood);
      const front = new THREE.Vector3(b.max.x - 0.08, (b.max.y + b.min.y) / 2, 0.15);
      await this.cam.ensureReach(front, 0.8);
      const anchor = this._anchor();
      anchor.position.copy(front);
      this._orientAnchor(anchor, new THREE.Vector3(1, -0.3, 0), new THREE.Vector3(0, 1, 0));
      hood.attach(anchor);
      this.rig.follow('R', anchor, { socket: 'grip', stiffness: 14, pose: 'open' });
      await wait(0.35);
      this.rig.setPose('R', 'grip');
      const open = !v.hoodOpen;
      this.audio.play('hood', { position: front, open });
      if (hit && this.rig.grease > 0.15) this.vfx.smudge(hit.object, hit.point, hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new THREE.Vector3(0, 1, 0));
      await tween(hood.rotation, { z: open ? 1.12 : 0, duration: open ? 0.9 : 0.55, ease: open ? 'power2.out' : 'power3.in' });
      v.hoodOpen = open;
      this.rig.rest('R', this.toolObj ? 'grip' : 'relaxed');
      this.cam.stepBack(0.8);
      this.events.emit('hood', open);
    } finally {
      this._clearAnchors();
      this.busy = false;
    }
  }

  async measure(part) {
    if (this.busy) return;
    const reading = this.vm.measure(part);
    if (!reading) { this.hud.toast('Nothing to measure here — probe a battery or ignition coil.', 'warn'); return; }
    this.busy = true;
    try {
      const b = new THREE.Box3().setFromObject(part.group);
      const C = b.getCenter(new THREE.Vector3());
      const top = new THREE.Vector3(C.x, b.max.y + 0.005, C.z);
      await this.cam.ensureReach(top);
      const model = this.toolObj;
      const anchor = this._anchor();
      this.scene.attach(model);
      this._poseTool(model, top, new THREE.Vector3(0, 1, 0), this._handleDir(top, new THREE.Vector3(0, 1, 0)), 0, 0);
      this.rig.follow('R', model.userData.grip, { stiffness: 12, pose: 'grip' });
      this.rig.setRestOffset('L', 0.08, 0.16, -0.05);
      await wait(0.5);
      this.audio.play('beep', { position: top, freq: 1800 });
      for (let i = 0; i < 6; i++) { this._drawMeter((reading.value * (0.6 + Math.random() * 0.4)).toFixed(2), reading.unit); await wait(0.06); }
      this._drawMeter(reading.value.toFixed(2), reading.unit.split(' ')[0]);
      this.hud.showReading(part, reading);
      part.measured = reading;
      await wait(0.9);
      await this._returnTool(model);
      this.rig.setRestOffset('L', 0.05, 0.1, 0.02);
      void anchor;
    } finally {
      this._clearAnchors();
      this.busy = false;
    }
  }

  placePan() {
    const v = this.vm.current;
    const plug = v?.points.drainPlug;
    if (!plug) return;
    const p = plug.getWorldPosition(new THREE.Vector3());
    this.garage.placeDrainPan(new THREE.Vector3(p.x, 0, p.z));
    v.drainPan = true;
    this.audio.play('clank', { position: p, freq: 300, volume: 0.6 });
    this.hud.toast('Drain pan placed under the drain plug.', 'ok');
    this.events.emit('panPlaced');
  }

  placeJack(part) {
    const v = this.vm.current;
    if (!v) return;
    if (v.type !== 'truck') { this.hud.toast('The floor jack is only needed for truck axle work.', 'warn'); return; }
    if (!v.raised) { this.hud.toast('Raise the lift first, then support the axle.', 'warn'); return; }
    const axle = new THREE.Vector3(-1.65, 0.36, 0).applyMatrix4(v.group.matrixWorld);
    this.garage.placeFloorJack(axle);
    v.jackPlaced = true;
    this.audio.play('clank', { position: axle, freq: 400 });
    this.hud.toast('Floor jack supporting the rear axle.', 'ok');
    this.events.emit('jackPlaced');
  }

  /** Pours a bottle of oil/coolant at the fill point. */
  async pourFluid(kind) {
    const v = this.vm.current;
    if (this.busy || !v) return;
    const point = kind === 'oil' ? v.points.oilFill : v.points.coolantFill;
    if (!point) return;
    if (kind === 'oil') {
      const plug = v.parts.get('oil_pan').fasteners[0];
      const filter = v.parts.get('oil_filter');
      if (plug.state !== 'tight') { this.hud.toast('Reinstall and tighten the drain plug first!', 'warn'); return; }
      if (!filter || !filter.secured) { this.hud.toast('Install & hand-tighten an oil filter first!', 'warn'); return; }
      if (v.fluids.oil.level > 0.95) { this.hud.toast('Oil is already full.', 'warn'); return; }
    } else {
      const hose = v.parts.get('radiator_hose');
      const cock = v.parts.get('radiator')?.fasteners[0];
      if (!hose?.secured || (cock && cock.state !== 'tight')) { this.hud.toast('Close the petcock and secure the radiator hose first.', 'warn'); return; }
      if (v.fluids.coolant.level > 0.95) { this.hud.toast('Coolant is already full.', 'warn'); return; }
    }
    const use = this.economy.useConsumable(kind);
    if (!use.ok) { this.hud.toast(`Can't afford ${CONSUMABLES[kind].name}.`, 'bad'); return; }
    this.busy = true;
    try {
      const P = point.getWorldPosition(new THREE.Vector3());
      await this.cam.ensureReach(P, 0.75);
      const heldTool = this.toolObj;
      if (heldTool) heldTool.visible = false;
      const bottle = this.bottle;
      bottle.children[0].material.color.set(kind === 'oil' ? 0xf0c419 : 0x2fbf5a);
      this.scene.add(bottle);
      bottle.position.copy(P).add(new THREE.Vector3(0, 0.25, 0.12));
      bottle.rotation.set(0, 0, 0);
      this.rig.follow('R', bottle.userData.grip, { stiffness: 12, pose: 'grip' });
      await wait(0.4);
      await tween(bottle.rotation, { x: -2.2, duration: 0.6, ease: 'power2.inOut', onUpdate: () => bottle.position.lerp(P.clone().add(new THREE.Vector3(0, 0.12, 0.05)), 0.08) });
      this.audio.play('slosh', { position: P, dur: 2.4, pour: true });
      const stop = this.vfx.stream(() => bottle.localToWorld(new THREE.Vector3(0, -0.01, 0)), { color: new THREE.Color(kind === 'oil' ? 0xc79a12 : 0x2fbf5a), rate: 90, dur: 2.2, speed: 0.6, size: 0.007, onLand: true });
      await tween(v.fluids[kind], { level: 1, duration: 2.3 });
      stop();
      if (kind === 'oil') v.fluids.oil.quality = 1;
      v.stats.fluids.push(kind);
      await tween(bottle.rotation, { x: 0, duration: 0.4 });
      this.rig.rest('R', heldTool ? 'grip' : 'relaxed');
      await wait(0.25);
      this.scene.remove(bottle);
      if (heldTool) heldTool.visible = true;
      this.hud.toast(`${kind === 'oil' ? 'Engine oil' : 'Coolant'} topped up.`, 'ok');
      this.events.emit('fluid', kind);
    } finally {
      this.busy = false;
    }
  }

  /** Manual bench cleaning with a brush & solvent. */
  async scrubPart(part, dur = 3.2) {
    if (this.busy) return;
    this.busy = true;
    try {
      const b = new THREE.Box3().setFromObject(part.group);
      const C = b.getCenter(new THREE.Vector3());
      await this.cam.ensureReach(C, 0.7);
      const heldTool = this.toolObj;
      if (heldTool) heldTool.visible = false;
      const brush = this.brush;
      this.scene.add(brush);
      const top = new THREE.Vector3(C.x, b.max.y + 0.02, C.z);
      this.rig.follow('R', brush.userData.grip, { stiffness: 20, pose: 'grip' });
      const st = { t: 0 };
      this.audio.play('brush', { position: C, dur });
      const c0 = { ...part.condition };
      await tween(st, {
        t: 1, duration: dur, ease: 'none',
        onUpdate: () => {
          brush.position.copy(top).add(new THREE.Vector3(Math.sin(st.t * 40) * 0.06, 0.01 + Math.abs(Math.cos(st.t * 40)) * 0.01, Math.cos(st.t * 23) * 0.04));
          brush.rotation.set(0.4, 0, Math.sin(st.t * 40) * 0.3);
          part.setCondition({ grease: c0.grease * (1 - st.t), isClean: st.t > 0.98 });
          if (Math.random() < 0.3) this.vfx.smoke.emit({ pos: top, vel: new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.2, (Math.random() - 0.5) * 0.3), color: new THREE.Color(0x8a7a5a), alpha: 0.15, size: 0.01, grow: 0.04, life: 0.8, gravity: -0.2 });
        },
      });
      part.setCondition({ isClean: true, grease: 0, rust: c0.rust * 0.7 });
      this.scene.remove(brush);
      this.rig.rest('R', heldTool ? 'grip' : 'relaxed');
      if (heldTool) heldTool.visible = true;
      this._addGrease(0.08);
    } finally {
      this.busy = false;
    }
  }

  _addGrease(d) {
    this.grease = Math.min(1, this.grease + d);
    this.rig.setGrease(this.grease);
  }

  resetGloves() { this.grease = 0; this.rig.setGrease(0); }

  update(dt) {
    this.rig.update(dt);
  }
}
