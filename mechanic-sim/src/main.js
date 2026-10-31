// main.js — renderer & post-processing, camera controller (focal swivel / lean / zoom),
// input + raycast interaction, game state machine and per-frame orchestration.
import * as THREE from 'three';
import gsap from 'gsap';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SSRPass } from 'three/addons/postprocessing/SSRPass.js';

import { Garage } from './Environment.js';
import { VehicleManager, FASTENER_TOOLS } from './VehicleManager.js';
import { ToolController } from './ToolController.js';
import { AudioFX } from './AudioFX.js';
import { Economy, TOOLS } from './Economy.js';
import { VFX } from './VFX.js';
import { HUD } from './HUD.js';
import { setGlow } from './Materials.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const IS_TOUCH = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1;
const TAP_SLOP = 10; // px a finger may wander and still count as a tap

export const STATE = {
  BOOT: 'boot', IDLE: 'idle', ARRIVING: 'arriving', SERVICE: 'service',
  TESTING: 'testing', INVOICE: 'invoice', LEAVING: 'leaving',
};

class Emitter {
  constructor() { this.l = {}; }
  on(e, f) { (this.l[e] ||= []).push(f); }
  emit(e, d) { (this.l[e] || []).forEach((f) => f(d)); }
}

// ======================================================================= camera controller
class CameraController {
  constructor(camera, dom) {
    this.camera = camera;
    this.def = { pos: V3(0.5, 1.72, 5.5), look: V3(0, 0.85, 0) };
    this.anchor = null;
    this.from = { pos: this.def.pos.clone(), look: this.def.look.clone() };
    this.t = 1;
    this.lean = { w: 0, pos: V3(), look: V3(), active: false };
    this.yaw = 0; this.pitch = 0;
    this.fov = this.baseFov; this.fovTarget = this.fov;
    this.cur = { pos: this.def.pos.clone(), look: this.def.look.clone() };
    this.breath = 0;
    this._drag = null;
    dom.addEventListener('pointerdown', (e) => {
      if (e.button === 2) { this._drag = { x: e.clientX, y: e.clientY, moved: 0 }; dom.classList.add('grab'); }
    });
    addEventListener('pointermove', (e) => {
      if (!this._drag) return;
      const dx = e.clientX - this._drag.x, dy = e.clientY - this._drag.y;
      this._drag.x = e.clientX; this._drag.y = e.clientY;
      this._drag.moved += Math.abs(dx) + Math.abs(dy);
      this.yaw = THREE.MathUtils.clamp(this.yaw - dx * 0.0035, -1.1, 1.1);
      this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.0035, -0.7, 0.6);
    });
    addEventListener('pointerup', (e) => {
      if (e.button === 2 && this._drag) {
        if (this._drag.moved < 4) this.stepBack();
        this._drag = null; dom.classList.remove('grab');
      }
    });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    // touch: one-finger drag looks around, two-finger pinch zooms
    this.touches = new Map();
    dom.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, look: false });
      if (this.touches.size === 2) this._pinch = this._pinchDist();
    });
    addEventListener('pointermove', (e) => {
      const t = this.touches.get(e.pointerId);
      if (!t) return;
      const dx = e.clientX - t.x, dy = e.clientY - t.y;
      t.x = e.clientX; t.y = e.clientY;
      if (this.touches.size >= 2) {
        const d = this._pinchDist();
        this.fovTarget = THREE.MathUtils.clamp(this.fovTarget - (d - this._pinch) * 0.09, 24, this.baseFov + 14);
        this._pinch = d;
        return;
      }
      if (!t.look && Math.hypot(t.x - t.sx, t.y - t.sy) > TAP_SLOP) t.look = true;
      if (t.look) {
        this.yaw = THREE.MathUtils.clamp(this.yaw + dx * 0.005, -1.1, 1.1);
        this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.005, -0.7, 0.6);
      }
    });
    const end = (e) => this.touches.delete(e.pointerId);
    addEventListener('pointerup', end);
    addEventListener('pointercancel', end);
    dom.addEventListener('wheel', (e) => {
      this.fovTarget = THREE.MathUtils.clamp(this.fovTarget + Math.sign(e.deltaY) * 4, 24, this.baseFov + 14);
    }, { passive: true });
  }

  _focalWorld(out) {
    out.pos.copy(this.def.pos); out.look.copy(this.def.look);
    if (this.anchor) { this.anchor.localToWorld(out.pos); this.anchor.localToWorld(out.look); }
    out.pos.y = Math.max(out.pos.y, 0.32);
    return out;
  }

  setFocal(def, anchor = null, dur = 1.1) {
    this.from.pos.copy(this.cur.pos); this.from.look.copy(this.cur.look);
    this.def = { pos: V3(...def.pos), look: V3(...def.look) };
    this.anchor = anchor;
    this.t = 0;
    gsap.killTweensOf(this);
    gsap.to(this, { t: 1, duration: dur, ease: 'power2.inOut' });
    gsap.to(this, { yaw: 0, pitch: 0, duration: dur * 0.8, ease: 'power2.out' });
    this.stepBack(dur * 0.6);
    this.fovTarget = this.baseFov;
  }

  _pinchDist() {
    const [a, b] = [...this.touches.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  /** Narrow / portrait screens get a wider vertical FOV so the work area still fits. */
  get baseFov() {
    const a = this.camera.aspect;
    return a < 0.8 ? 80 : a < 1.3 ? 68 : 58;
  }

  /** Leans the head/body toward a point so the arms can physically reach it. */
  ensureReach(point, maxDist = 0.66) {
    const d = this.camera.position.distanceTo(point);
    if (d <= maxDist) return Promise.resolve();
    const base = this._focalWorld({ pos: V3(), look: V3() });
    const dir = base.pos.clone().sub(point);
    dir.y = Math.max(dir.y, 0.15);
    dir.normalize();
    const pos = point.clone().addScaledVector(dir, 0.48);
    pos.y = Math.max(pos.y, 0.34);
    const look = point.clone();
    return new Promise((res) => {
      gsap.to(this, { yaw: 0, pitch: 0, duration: 0.35 });
      if (this.lean.active) {
        gsap.to(this.lean.pos, { x: pos.x, y: pos.y, z: pos.z, duration: 0.45, ease: 'power2.inOut' });
        gsap.to(this.lean.look, { x: look.x, y: look.y, z: look.z, duration: 0.45, ease: 'power2.inOut', onComplete: res });
      } else {
        this.lean.pos.copy(pos); this.lean.look.copy(look); this.lean.active = true;
        gsap.to(this.lean, { w: 1, duration: 0.55, ease: 'power2.inOut', onComplete: res });
      }
    });
  }

  stepBack(dur = 0.6) {
    if (!this.lean.active) return;
    gsap.to(this.lean, { w: 0, duration: dur, ease: 'power2.inOut', onComplete: () => { this.lean.active = false; } });
  }

  update(dt) {
    const f = this._focalWorld({ pos: V3(), look: V3() });
    const k = this.t;
    const pos = this.from.pos.clone().lerp(f.pos, k);
    const look = this.from.look.clone().lerp(f.look, k);
    if (this.lean.w > 0) { pos.lerp(this.lean.pos, this.lean.w); look.lerp(this.lean.look, this.lean.w); }
    this.cur.pos.copy(pos); this.cur.look.copy(look);
    // breathing sway
    this.breath += dt;
    pos.y += Math.sin(this.breath * 1.4) * 0.004;
    // swivel offsets
    const dir = look.clone().sub(pos);
    const dist = dir.length();
    dir.normalize();
    const right = V3().crossVectors(dir, V3(0, 1, 0)).normalize();
    dir.applyAxisAngle(V3(0, 1, 0), this.yaw);
    right.applyAxisAngle(V3(0, 1, 0), this.yaw);
    dir.applyAxisAngle(right, this.pitch);
    this.camera.position.copy(pos);
    this.camera.lookAt(pos.clone().addScaledVector(dir, Math.max(0.5, dist)));
    this.fov += (this.fovTarget - this.fov) * (1 - Math.exp(-8 * dt));
    if (Math.abs(this.camera.fov - this.fov) > 0.01) { this.camera.fov = this.fov; this.camera.updateProjectionMatrix(); }
  }
}

// ======================================================================= game
class Game {
  constructor() {
    this.state = STATE.BOOT;
    this.events = new Emitter();
    this.clock = new THREE.Clock();
    this.gameMinutes = 0;
    this.time = 0;
    this.job = null;
    this.mouse = new THREE.Vector2(-9, -9);
    this.mouseClient = { x: 0, y: 0 };
    this.hoverHit = null;
    this.modal = false;
    this.viewKey = 'overview';
    this.flags = {};
  }

  async init() {
    const canvas = document.getElementById('viewport');
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    r.setSize(innerWidth, innerHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d0e10);
    this.scene.fog = new THREE.Fog(0x15171a, 16, 34);
    this.camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.03, 60);
    this.scene.add(this.camera);

    this.hud = new HUD(this);
    this.hud.setLoading(0.1);
    await frame();
    this.economy = new Economy();
    this.audio = new AudioFX();
    this.garage = new Garage(this.scene, r);
    this.hud.setLoading(0.45);
    await frame();
    this.vfx = new VFX(this.scene, this.camera);
    this.cam = new CameraController(this.camera, canvas);
    this.vm = new VehicleManager(this.scene, { lift: this.garage.lift, audio: this.audio, vfx: this.vfx, economy: this.economy, events: this.events });
    this.tools = new ToolController({
      camera: this.camera, scene: this.scene, audio: this.audio, vfx: this.vfx, vm: this.vm,
      economy: this.economy, garage: this.garage, hud: this.hud, cam: this.cam, events: this.events,
    });
    this.garage.stockDrawers((id) => this.tools.makeToolModel(id), this.economy.state.tools);
    this.garage.setOwned(this.economy.state.tools);
    this.garage.applyCosmetics(this.economy.state.cosmetics);
    this.hud.setLoading(0.7);
    await frame();
    this._bindEvents();
    this._bindInput(canvas);
    this.setupComposer('high');
    this.captureEnvironment();
    this.hud.setLoading(0.9);
    // warm up shaders
    r.compile(this.scene, this.camera);
    this.hud.setLoading(1);
    this.hud.refreshStats();
    this.hud.renderHotbar('hand');
    this.drawScreens();
    this.garage.aimLamp(V3(0, 0.6, 0), true);
    addEventListener('resize', () => this.resize());
    this.loop();
    this.hud.ready((q) => this.start(q));
    this.state = STATE.IDLE;
    this.cam.setFocal({ pos: [0.5, 1.72, 5.5], look: [0, 0.85, 0] }, null, 0.01);
  }

  // ---------------------------------------------------------------- rendering
  setupComposer(quality) {
    this.quality = quality;
    const r = this.renderer;
    r.setPixelRatio(Math.min(devicePixelRatio, quality === 'low' ? (IS_TOUCH ? 1.25 : 1) : 1.5));
    // lighter shadows on low / mobile GPUs
    const big = quality === 'low' ? 1024 : 2048;
    for (const l of [this.garage.key, this.garage.lamp.light]) {
      const size = l === this.garage.key ? big : big / 2;
      if (l.shadow.mapSize.x !== size) { l.shadow.mapSize.set(size, size); l.shadow.map?.dispose(); l.shadow.map = null; }
    }
    const w = innerWidth, h = innerHeight;
    const comp = (this.composer = new EffectComposer(r));
    comp.setSize(w, h);
    let usedSSR = false;
    if (quality === 'ultra') {
      try {
        const ssr = new SSRPass({ renderer: r, scene: this.scene, camera: this.camera, width: w, height: h, groundReflector: null, selects: [this.garage.floor] });
        ssr.thickness = 0.018; ssr.infiniteThick = false; ssr.maxDistance = 3; ssr.opacity = 0.35;
        ssr.blur = true; ssr.distanceAttenuation = true; ssr.fresnel = true;
        comp.addPass(ssr);
        usedSSR = true;
      } catch (e) { console.warn('SSR unavailable', e); }
    }
    if (!usedSSR) comp.addPass(new RenderPass(this.scene, this.camera));
    if (quality !== 'low') {
      try {
        const ao = new GTAOPass(this.scene, this.camera, w, h);
        ao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.5, thickness: 1.2, scale: 1.1, samples: 12 });
        ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
        ao.blendIntensity = 0.85;
        comp.addPass(ao);
        this.aoPass = ao;
      } catch (e) { console.warn('GTAO unavailable', e); }
    }
    comp.addPass(this.vfx.heatPass);
    if (quality !== 'low') {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.32, 0.55, 0.9);
      comp.addPass(this.bloom);
    }
    comp.addPass(new OutputPass());
    this.renderer.shadowMap.enabled = true;
  }

  /** Bakes the garage into a PMREM environment for reflections on paint, chrome & epoxy. */
  captureEnvironment() {
    const pm = new THREE.PMREMGenerator(this.renderer);
    const root = this.garage.root;
    const camVis = this.camera.visible;
    this.camera.visible = false;
    const prevEnv = this.scene.environment;
    this.scene.environment = null;
    root.position.set(0, -1.6, -1.0);
    root.updateMatrixWorld(true);
    const vehicle = this.vm.current?.group;
    if (vehicle) vehicle.visible = false;
    const rt = pm.fromScene(this.scene, 0.035, 0.1, 40);
    root.position.set(0, 0, 0);
    root.updateMatrixWorld(true);
    if (vehicle) vehicle.visible = true;
    this.camera.visible = camVis;
    if (prevEnv) prevEnv.dispose();
    this.scene.environment = rt.texture;
    pm.dispose();
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.cam.fovTarget = this.cam.baseFov;
    this.tools.rig.setAspect(this.camera.aspect);
    this.hud.setCompact(IS_TOUCH || innerWidth <= 900);
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer.setSize(innerWidth, innerHeight);
  }

  // ---------------------------------------------------------------- start / state machine
  start(quality) {
    this.audio.init();
    if (quality !== 'high') this.setupComposer(quality);
    this.hud.show();
    this.resize();
    if (IS_TOUCH && innerHeight > innerWidth) setTimeout(() => this.hud.toast('Tip: rotate to landscape for the best view.', '', 3500), 2500);
    this.renderViews();
    this.hud.setToggles({ lift: false, lamp: this.garage.lamp.on });
    this.setView('overview');
    setTimeout(() => {
      this.hud.toast(`Welcome to the shop. Check the job board for work (${IS_TOUCH ? '📋' : 'J'}).`, 'ok', 3500);
      this.openJobBoard();
    }, 900);
  }

  setState(s) {
    this.state = s;
    this.events.emit('state', s);
    this.renderViews();
  }

  get views() {
    const g = this.garage.focal;
    const v = this.vm.current;
    const out = { overview: g.overview };
    if (v && this.state === STATE.SERVICE) for (const [k, f] of Object.entries(v.focal)) out[k] = f;
    out.toolchest = g.toolchest; out.cart = g.cart; out.bench = g.bench; out.machines = g.machines; out.terminal = g.terminal;
    return out;
  }

  renderViews() { this.hud.renderViews(this.views, this.viewKey); }

  setView(key) {
    const views = this.views;
    const def = views[key] || views.overview;
    const v = this.vm.current;
    const vehicleFocal = v && v.focal[key];
    this.viewKey = key;
    this.cam.setFocal(def, vehicleFocal ? v.group : null);
    const look = V3(...def.look);
    if (vehicleFocal) v.group.localToWorld(look);
    if (this.garage.lamp.on) this.garage.aimLamp(look);
    this.renderViews();
    this.audio.play('ui');
  }

  cycleView(dir) {
    const keys = Object.keys(this.views);
    const i = keys.indexOf(this.viewKey);
    this.setView(keys[(i + dir + keys.length) % keys.length]);
  }

  openJobBoard() {
    this.hud.openJobBoard(this.economy.state.jobs, this.state !== STATE.IDLE);
  }

  onModal(open) { this.modal = open; if (open) this.hud.tooltip(null); }

  acceptJob(id) {
    if (this.state !== STATE.IDLE) return;
    const job = this.economy.takeJob(id);
    if (!job) return;
    this.job = job;
    this.gameMinutes = 0;
    this.flags = { scanned: false, tested: false, testPassed: false };
    this.setState(STATE.ARRIVING);
    this.setView('overview');
    this.garage.setDoor(true);
    this.audio.play('hiss', { position: V3(-7.9, 3.3, 0), dur: 1.4 });
    const v = this.vm.spawn(job);
    v.hood && (v.hood.rotation.z = 0);
    this.hud.toast(`${job.customer} is pulling in with a ${job.model}.`, '', 3000);
    setTimeout(() => {
      this.vm.rollIn(() => {
        this.garage.setDoor(false);
        this.setState(STATE.SERVICE);
        this.hud.showJob(job);
        this.hud.renderFluids(v);
        this.hud.renderParts(v);
        this.updateObjectives();
        this.drawScreens();
        const hot = job.arrivedHot ? ' Engine is hot — careful with the cooling system and exhaust.' : '';
        this.hud.toast(`Customer: “${job.complaint}”.${hot}`, job.arrivedHot ? 'warn' : '', 5000);
        if (v.hot > 0) { v.hot = 0.8; }
      });
    }, 1300);
  }

  toggleLift() {
    const L = this.garage.lift;
    const v = this.vm.current;
    if (L.busy || this.tools.busy || ![STATE.SERVICE, STATE.IDLE].includes(this.state)) return;
    const up = !L.raised;
    if (!up && v) {
      const missing = v.wheels.filter((w) => w.part.state !== 'installed');
      if (missing.length) { this.hud.toast('Can\'t lower — wheels are off the vehicle!', 'bad'); this.audio.play('error'); return; }
      if (v.jackPlaced) { v.jackPlaced = false; this.garage.returnEquipment(); }
    }
    L.busy = true;
    const dur = this.economy.hasUpgrade('lift_hydro') ? 1.8 : 3.4;
    const st = { h: L.height };
    const pos = V3(2.9, 0.6, 1.5);
    this.audio.loop('lift', pos, { volume: 0.5 });
    if (v && v.type !== 'moto') gsap.to(v.group.position, { y: L.deckTop + (up ? 0.1 : 0), duration: 0.6, delay: up ? 0.1 : dur - 0.6 });
    gsap.to(this.garage.jackPads.map((p) => p.position), { y: up ? 0.22 : 0.12, duration: 0.6, delay: up ? 0 : dur - 0.6 });
    gsap.to(st, {
      h: up ? 1.15 : 0, duration: dur, ease: 'power1.inOut',
      onUpdate: () => this.garage.setLiftHeight(st.h),
      onComplete: () => {
        L.busy = false; L.raised = up;
        if (v) { v.raised = up; v.stats.liftCycles++; }
        this.audio.stopLoop('lift');
        this.audio.play('clank', { position: pos, freq: 300 });
        this.hud.setToggles({ lift: up, lamp: this.garage.lamp.on });
      },
    });
  }

  toggleLamp() {
    const on = this.garage.toggleLamp();
    this.audio.play('ui');
    this.hud.setToggles({ lift: this.garage.lift.raised, lamp: on });
  }

  scan() {
    const v = this.vm.current;
    if (!v || this.state !== STATE.SERVICE) { this.hud.toast('No vehicle connected.', 'warn'); return; }
    const bat = v.parts.get('battery');
    if (bat && bat.state !== 'installed') { this.hud.toast('Scan tool needs the vehicle battery connected.', 'warn'); return; }
    this.audio.play('scan');
    this.hud.toast('Reading ECU…', '', 1200);
    setTimeout(() => {
      const scan = this.vm.obdScan();
      this.lastScan = scan;
      this.flags.scanned = true;
      this.hud.showScan(scan);
      this.drawScreens();
      this.updateObjectives();
    }, 900);
  }

  ecuTune() {
    const v = this.vm.current;
    if (!this.economy.hasTool('ecu')) { this.hud.toast('Buy the ECU remapper (Tier 3) to tune engines.', 'warn'); return; }
    if (!v || this.state !== STATE.SERVICE) { this.hud.toast('Bring a vehicle in first.', 'warn'); return; }
    if (v.tuned) { this.hud.toast('Already remapped.', 'ok'); return; }
    if (v.type === 'moto') { this.hud.toast('Carbureted bike — nothing to remap.', 'warn'); return; }
    this.hud.toast('Flashing Stage 1 calibration…', '', 2500);
    this.audio.play('scan');
    v.stats.machineUses++;
    let p = 0;
    const iv = setInterval(() => {
      p += 0.1;
      this.garage.drawScreen('laptop', (g, w, h) => this._drawLaptop(g, w, h, { flashing: p }));
      if (p >= 1) {
        clearInterval(iv);
        v.tuned = true;
        this.audio.play('beep', { freq: 1760, dur: 0.3 });
        this.hud.toast('ECU remap complete: +38 hp, +55 Nm.', 'ok', 3000);
        this.drawScreens();
        this.updateObjectives();
      }
    }, 300);
  }

  async partAction(part, action) {
    const v = this.vm.current;
    if (!v || this.tools.busy || this.busyMachine) return;
    if (action === 'install') {
      const ok = await this.tools.installPart(part);
      if (ok) { this.hud.closePartCard(); this.hud.toast(`${part.name} in place — now tighten its fasteners.`, '', 2500); }
    } else if (action === 'clean') {
      const wasDirty = !part.condition.isClean;
      const dur = part.kind === 'carburetor' ? 7 : 3.2;
      this.setView('bench');
      await wait(0.9);
      await this.tools.scrubPart(part, dur);
      if (wasDirty && !v.faults.some((f) => f.part === part.id)) v.stats.cleanedExtra++;
      this.hud.toast(`${part.name} cleaned.`, 'ok');
    } else if (action === 'ultrasonic') {
      await this.ultrasonicClean(part);
    } else if (action === 'balance') {
      await this.balanceWheel(part);
    } else if (action === 'replace') {
      this.replacePart(part);
    } else if (action === 'measure') {
      if (this.tools.current !== 'multimeter') await this.tools.equip('multimeter');
      if (this.tools.current === 'multimeter') await this.tools.measure(part);
    }
    this.hud.refreshPartCard();
    this.hud.renderParts(v);
    this.updateObjectives();
  }

  replacePart(part) {
    const cost = this.economy.partCost(part.kind);
    if (!this.economy.spend(cost, `Part: ${part.name}`)) { this.hud.toast('Not enough cash for that part.', 'bad'); this.audio.play('error'); return; }
    part.replaced = true;
    part.balanced = true;
    part.setCondition({ wearLevel: 0, rust: 0, heatDamage: 0, isClean: true, grease: 0 });
    for (const f of part.fasteners) {
      f.seized = false; f.stripped = false;
      const u = f.material.userData.u;
      u.uRust.value = 0; u.uDirt.value = 0; u.uWear.value = 0; u.uHeat.value = 0;
    }
    this.audio.play('cash');
    this.vfx.sparkBurst(new THREE.Box3().setFromObject(part.group).getCenter(V3()), V3(0, 1, 0), 6, 0.6);
    setGlow(part.group, 0);
    this.hud.refreshStats();
    this.hud.toast(`New ${part.name.toLowerCase()} unboxed (-$${cost}).`, 'ok');
  }

  async ultrasonicClean(part) {
    if (!this.economy.hasTool('ultrasonic')) { this.hud.toast('Buy the ultrasonic parts cleaner first.', 'warn'); return; }
    if (part.isWheel) { this.hud.toast('Wheels don\'t fit in the tank.', 'warn'); return; }
    this.busyMachine = true;
    const v = this.vm.current;
    try {
      this.setView('bench');
      const g = part.group;
      const home = g.position.clone();
      const mount = this.garage.ultrasonicMount.getWorldPosition(V3());
      await tweenP(g.position, { x: mount.x, y: mount.y + 0.35, z: mount.z, duration: 0.8, ease: 'power2.inOut' });
      await tweenP(g.position, { y: mount.y - 0.02, duration: 0.5, ease: 'power2.in' });
      this.audio.play('slosh', { position: mount, dur: 0.6 });
      this.audio.loop('ultrasonic', mount, { volume: 0.4 });
      this.vfx.bubblesAt(() => mount, 3);
      const c0 = part.condition.grease;
      const wash = { k: 0 };
      await tweenP(wash, { k: 1, duration: 3, onUpdate: () => part.setCondition({ grease: c0 * (1 - wash.k) }) });
      this.audio.stopLoop('ultrasonic');
      const wasDirty = !part.condition.isClean;
      part.setCondition({ isClean: true, grease: 0, rust: part.condition.rust * 0.3 });
      if (wasDirty && !v.faults.some((f) => f.part === part.id)) v.stats.cleanedExtra++;
      v.stats.machineUses++;
      await tweenP(g.position, { y: mount.y + 0.35, duration: 0.5 });
      await tweenP(g.position, { x: home.x, y: home.y, z: home.z, duration: 0.8, ease: 'power2.inOut' });
      this.hud.toast(`${part.name} is spotless.`, 'ok');
    } finally { this.busyMachine = false; }
  }

  async balanceWheel(part) {
    if (!this.economy.hasTool('balancer')) { this.hud.toast('Buy the laser wheel balancer first.', 'warn'); return; }
    this.busyMachine = true;
    const v = this.vm.current;
    try {
      this.setView('machines');
      const g = part.group;
      const home = g.position.clone(), homeQ = g.quaternion.clone();
      const mount = this.garage.balancerMount.getWorldPosition(V3());
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0));
      const q0 = g.quaternion.clone();
      const st = { k: 0 };
      const p0 = g.position.clone();
      await tweenP(st, { k: 1, duration: 1.0, ease: 'power2.inOut', onUpdate: () => { g.position.lerpVectors(p0, mount, st.k); g.position.y += Math.sin(st.k * Math.PI) * 0.4; g.quaternion.slerpQuaternions(q0, q, st.k); } });
      this.audio.loop('balancer', mount, { volume: 0.5 });
      this.garage.balancerLaser.visible = true;
      const spin = { a: 0 };
      await tweenP(spin, { a: 60, duration: 3.2, ease: 'power2.inOut', onUpdate: () => { g.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 0, 1), spin.a)); } });
      this.audio.stopLoop('balancer');
      this.garage.balancerLaser.visible = false;
      this.garage.drawScreen('balancer', (c, w, h) => {
        c.fillStyle = '#071018'; c.fillRect(0, 0, w, h);
        c.fillStyle = '#5cff9a'; c.font = 'bold 34px monospace'; c.fillText(part.balanced ? 'OK  0g' : 'ADD 45g', 20, 60);
        c.font = '18px monospace'; c.fillText(part.balanced ? 'within tolerance' : 'weight applied @ 212°', 20, 100);
      });
      part.balanced = true;
      v.stats.machineUses++;
      this.audio.play('beep', { position: mount, freq: 1500 });
      const p1 = g.position.clone(), q1 = g.quaternion.clone();
      st.k = 0;
      await tweenP(st, { k: 1, duration: 1.0, ease: 'power2.inOut', onUpdate: () => { g.position.lerpVectors(p1, home, st.k); g.position.y += Math.sin(st.k * Math.PI) * 0.4; g.quaternion.slerpQuaternions(q1, homeQ, st.k); } });
      this.hud.toast(`${part.name} balanced.`, 'ok');
    } finally { this.busyMachine = false; }
  }

  // ---------------------------------------------------------------- testing & hand-over
  async runTest() {
    const v = this.vm.current;
    if (!v || this.state !== STATE.SERVICE || this.tools.busy) return;
    const reasons = this.vm.notRoadworthyReasons();
    if (reasons.length) {
      this.hud.toast(`Not ready: ${reasons.slice(0, 2).join('; ')}${reasons.length > 2 ? ` (+${reasons.length - 2} more)` : ''}`, 'bad', 4000);
      this.audio.play('error');
      return;
    }
    if (this.garage.lift.raised && v.type !== 'moto') { this.hud.toast('Lower the lift before the road test.', 'warn'); return; }
    if (v.hoodOpen) { await this.tools.toggleHood(); }
    this.setState(STATE.TESTING);
    this.setView('overview');
    const unfixed = v.faults.filter((f) => !v.isFaultFixed(f));
    const ids = unfixed.map((f) => f.part);
    const has = (re) => ids.some((i) => re.test(i));
    const lines = [];
    this.hud.openTest({ title: `${this.job.model} — engine start, rev sweep and test stop.`, lines: ['Cranking…'] });
    const pos = v.points.engine ? v.points.engine.getWorldPosition(V3()) : v.group.getWorldPosition(V3());
    const exhaust = () => v.points.exhaust.getWorldPosition(V3());
    const weakBattery = has(/^battery$/);
    this.audio.crank(pos, weakBattery ? 2.6 : 1.1);
    await wait(weakBattery ? 2.7 : 1.15);
    const eng = this.audio.engine(v.engineSpec, pos);
    eng?.start();
    for (const s of [1, -1]) { const t = v.points[`tail_${s}`]; if (t) t.material.emissiveIntensity = 2.5; }
    if (has(/plugs|coils|spark_plug/)) eng?.setMisfire(0.8);
    if (has(/turbo/) && eng) eng.boostOk = false;
    const smoke = has(/head_gasket/) ? this.vfx.exhaustSmoke(exhaust, 0xf4f4f4, 9, 1.5) : this.vfx.exhaustSmoke(exhaust, 0x9a9a9a, 9, 0.25);
    const anim = { rpm: v.engineSpec.idle };
    const sweep = [v.engineSpec.idle * 1.1, v.engineSpec.redline * 0.55, v.engineSpec.idle, v.engineSpec.redline * 0.8, v.engineSpec.idle * 1.2];
    v.running = true;
    for (const target of sweep) {
      await tweenP(anim, {
        rpm: target, duration: 1.3, ease: 'power2.inOut',
        onUpdate: () => {
          eng?.setRPM(anim.rpm, 0.05);
          this.hud.updateTest(anim.rpm);
          this.runRPM = anim.rpm;
        },
      });
      if (target < sweep[1] && (has(/plugs|coils|spark_plug|carburetor|air_filter/) || v.type === 'moto' && Math.random() < 0.5)) {
        this.audio.play('backfire', { position: exhaust() });
        this.vfx.backfire(exhaust());
      }
    }
    v.running = false;
    eng?.stop();
    smoke();
    for (const s of [1, -1]) { const t = v.points[`tail_${s}`]; if (t) t.material.emissiveIntensity = 0.15; }
    // exhaust is now scorching
    v.hot = 1;
    for (const k of ['manifold_L', 'manifold_R', 'turbo']) if (v.points[k]) setGlow(v.points[k], 0.25);
    const sym = {
      pads: 'Brakes squeal and scrape on the test stop.', rotor: 'Brake pedal pulsates — scored rotor.',
      plugs: 'Stumbling misfire above 3k RPM.', coils: 'Misfire & flashing check-engine light.', spark_plug: 'Spits and pops, hard to start.',
      turbo: 'Boost never builds; turbo whistles.', battery: 'Very slow crank — battery weak.', strut: 'Front end bounces over the speed bump.',
      exhaust_manifold: 'Ticking exhaust leak.', exhaust_header: 'Ticking exhaust leak at the head.', head_gasket: 'White smoke; temperature climbing.',
      radiator_hose: 'Coolant temperature spikes.', air_filter: 'Sluggish, hesitant acceleration.', carburetor: 'Bogs off idle.',
      oil: 'Oil still black — service incomplete.', oil_filter: 'Old oil filter still fitted.', ecu: 'Still on the stock calibration.',
      wheel: 'Vibration through the wheel at speed.', front_wheel: 'Front end wobble at speed.', tc_seal: 'Fluid still dripping from the transfer case.',
      leaf: 'Rear sags and clunks over bumps.', hub: 'Wheel bearing growl.', chain: 'Chain slap and clunky drive.', front_sprocket: 'Clunky final drive.',
      front_pads: 'Front brake scrapes.',
    };
    for (const f of unfixed) {
      const key = Object.keys(sym).find((k) => f.part.startsWith(k));
      lines.push(`✖ ${sym[key] || `Problem persists (${f.part}).`}`);
    }
    const ok = unfixed.length === 0;
    if (ok) lines.push('✔ The original complaint is gone. Smooth idle, clean revs, straight stop.');
    if (v.tuned) lines.push('⚡ Remapped: sharper throttle and a fatter torque curve.');
    this.flags.tested = true;
    this.flags.testPassed = ok;
    this.hud.updateTest(v.engineSpec.idle * 0, lines, true);
    this.setState(STATE.SERVICE);
    this.updateObjectives();
    setTimeout(() => { for (const k of ['manifold_L', 'manifold_R', 'turbo']) if (v.points[k]) setGlow(v.points[k], 0); }, 25000);
  }

  handOver() {
    const v = this.vm.current;
    if (!v || this.state !== STATE.SERVICE || this.tools.busy) return;
    const reasons = this.vm.notRoadworthyReasons();
    if (reasons.length) { this.hud.toast(`Customer won't take it like this: ${reasons[0]}.`, 'bad', 3500); this.audio.play('error'); return; }
    if (!this.flags.tested) { this.hud.toast('Run a road test before handing the vehicle over.', 'warn'); return; }
    this.setState(STATE.INVOICE);
    const result = this.vm.evaluate(this.gameMinutes);
    const inv = this.economy.invoice(this.job, result);
    this.hud.openInvoice(this.job, inv, () => {
      this.economy.settle(inv);
      this.audio.play('cash');
      this.hud.refreshStats();
      this.hud.renderHotbar(this.tools.current);
      this.finishJob();
    });
  }

  async finishJob() {
    const v = this.vm.current;
    this.setState(STATE.LEAVING);
    this.hud.hideJob();
    this.hud.setClock(null);
    this.setView('overview');
    if (v.hoodOpen) await this.tools.toggleHood();
    if (this.garage.lift.raised) { this.toggleLift(); await wait(this.economy.hasUpgrade('lift_hydro') ? 2 : 3.6); }
    this.garage.returnEquipment();
    this.garage.setDoor(true);
    await wait(1.2);
    this.vm.rollOut(() => {
      this.garage.setDoor(false);
      this.garage.clearSlots();
      this.vfx.clearJobMess();
      this.tools.resetGloves();
      this.job = null;
      this.setState(STATE.IDLE);
      this.drawScreens();
      this.hud.toast(`Bay is clear. Grab the next job from the board${IS_TOUCH ? ' (📋)' : ' (J)'}.`, '', 3000);
    });
  }

  // ---------------------------------------------------------------- objectives
  updateObjectives() {
    const v = this.vm.current;
    if (!v || !this.job) return;
    const parts = [...v.parts.values()];
    const diagnosed = this.flags.scanned || parts.some((p) => p.inspected || p.state === 'removed' || p.measured);
    const fixed = v.allFixed();
    const assembled = parts.every((p) => p.state === 'installed' && p.fasteners.every((f) => f.state === 'tight'));
    const fluids = v.fluids.oil.level > 0.95 && v.fluids.coolant.level > 0.95;
    const tested = this.flags.tested;
    const list = [
      { text: 'Diagnose — scan codes or inspect parts', done: diagnosed },
      { text: 'Repair or replace the faulty component(s)', done: fixed },
      { text: 'Reassemble & tighten every fastener', done: assembled && diagnosed },
      { text: 'Fluids topped up', done: fluids && diagnosed },
      { text: 'Start & road test', done: tested },
      { text: 'Hand over & collect payment', done: false },
    ];
    let activeSet = false;
    this.hud.setObjectives(list.map((o) => {
      let state = o.done ? 'done' : '';
      if (!o.done && !activeSet) { state = 'active'; activeSet = true; }
      return { text: o.text, state };
    }));
  }

  // ---------------------------------------------------------------- screens
  drawScreens() {
    this.garage.drawScreen('laptop', (g, w, h) => this._drawLaptop(g, w, h, {}));
    this.garage.drawScreen('terminal', (g, w, h) => {
      g.fillStyle = '#0b1220'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffc21a'; g.fillRect(0, 0, w, 56);
      g.fillStyle = '#1a1400'; g.font = 'bold 30px sans-serif'; g.fillText('SHOP OS  ·  Torque & Tread', 20, 38);
      g.fillStyle = '#cfe3ff'; g.font = '26px sans-serif';
      g.fillText(`Balance   $${Math.round(this.economy.cash).toLocaleString()}`, 30, 110);
      g.fillText(`Shop level ${this.economy.level}  ·  Jobs ${this.economy.state.jobsDone}`, 30, 150);
      g.fillStyle = '#7fa3c8'; g.font = '22px sans-serif';
      g.fillText('▸ Click to open the store: tools, upgrades, garage style', 30, 210);
      g.fillText(`▸ Owned tools: ${this.economy.state.tools.length}/${TOOLS.length}`, 30, 250);
      this.economy.state.ledger.slice(0, 4).forEach((l, i) => {
        g.fillStyle = l.amount < 0 ? '#ff7a6a' : '#5cff9a';
        g.fillText(`${l.amount < 0 ? '-' : '+'}$${Math.abs(l.amount)}  ${l.label}`.slice(0, 48), 30, 310 + i * 32);
      });
    });
    this.garage.drawScreen('jobboard', (g, w, h) => {
      g.fillStyle = '#a77b4f'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2000; i++) { g.fillStyle = `rgba(60,35,15,${Math.random() * 0.15})`; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
      g.fillStyle = '#2a1a0c'; g.font = 'bold 34px sans-serif'; g.fillText('REPAIR ORDERS', 24, 44);
      this.economy.state.jobs.slice(0, 4).forEach((j, i) => {
        const x = 24 + (i % 2) * 370, y = 70 + Math.floor(i / 2) * 215;
        g.save(); g.translate(x + 170, y + 100); g.rotate((i % 2 ? 1 : -1) * 0.025); g.translate(-170, -100);
        g.fillStyle = '#f7f2e3'; g.fillRect(0, 0, 340, 195);
        g.fillStyle = '#c8261e'; g.beginPath(); g.arc(170, 10, 9, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#1a1a1a'; g.font = 'bold 24px sans-serif'; g.fillText(j.model, 16, 48);
        g.font = 'italic 19px sans-serif'; wrap(g, `“${j.complaint}”`, 16, 82, 310, 24);
        g.font = 'bold 20px sans-serif'; g.fillStyle = '#2e6b3e'; g.fillText(`${j.bookHours.toFixed(1)} h · ~$${j.quote}`, 16, 178);
        g.restore();
      });
    });
    this._drawClock();
  }

  _drawLaptop(g, w, h, { flashing }) {
    g.fillStyle = '#05131a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#0fd2a0'; g.fillRect(0, 0, w, 44);
    g.fillStyle = '#022'; g.font = 'bold 24px monospace'; g.fillText('OBD-II SCAN // v4.2', 14, 30);
    const v = this.vm.current;
    g.font = '22px monospace';
    if (!v || this.state === STATE.IDLE) { g.fillStyle = '#7fd'; g.fillText('No vehicle connected.', 20, 100); return; }
    g.fillStyle = '#9ff'; g.fillText(`${this.job?.model || ''}`, 20, 82);
    if (flashing != null) {
      g.fillStyle = '#ffc21a'; g.fillText('FLASHING ECU…', 20, 140);
      g.strokeStyle = '#ffc21a'; g.strokeRect(20, 170, w - 40, 30);
      g.fillRect(20, 170, (w - 40) * Math.min(1, flashing), 30);
      return;
    }
    if (!this.lastScan || !this.flags.scanned) { g.fillStyle = '#7fd'; g.fillText('Click laptop to scan ECU.', 20, 130); return; }
    const s = this.lastScan;
    if (!s.codes.length) { g.fillStyle = '#5f9'; g.fillText('NO DTCs STORED', 20, 130); }
    s.codes.slice(0, 6).forEach(([c, d], i) => {
      g.fillStyle = '#ffb020'; g.fillText(c, 20, 130 + i * 38);
      g.fillStyle = '#cfe'; g.font = '17px monospace'; g.fillText(d.slice(0, 44), 120, 130 + i * 38); g.font = '22px monospace';
    });
  }

  _drawClock() {
    const mins = 8 * 60 + (this.economy.state.jobsDone % 3) * 150 + this.gameMinutes;
    this.garage.drawScreen('clock', (g, w, h) => {
      g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, w, h);
      g.translate(w / 2, h / 2);
      g.strokeStyle = '#111'; g.lineWidth = 6;
      for (let i = 0; i < 12; i++) { g.save(); g.rotate((i / 12) * Math.PI * 2); g.beginPath(); g.moveTo(0, -110); g.lineTo(0, -92); g.stroke(); g.restore(); }
      const hr = ((mins / 60) % 12) / 12 * Math.PI * 2, mn = (mins % 60) / 60 * Math.PI * 2;
      g.save(); g.rotate(hr); g.lineWidth = 9; g.beginPath(); g.moveTo(0, 10); g.lineTo(0, -60); g.stroke(); g.restore();
      g.save(); g.rotate(mn); g.lineWidth = 5; g.beginPath(); g.moveTo(0, 14); g.lineTo(0, -95); g.stroke(); g.restore();
      g.setTransform(1, 0, 0, 1, 0, 0);
    });
  }

  // ---------------------------------------------------------------- events
  _bindEvents() {
    const E = this.events;
    E.on('toolChanged', (id) => this.hud.renderHotbar(id));
    E.on('busy', () => {});
    E.on('fastenerRemoved', () => this._refreshPanels());
    E.on('fastenerTight', () => this._refreshPanels());
    E.on('partRemoved', () => this._refreshPanels());
    E.on('partInstalled', () => this._refreshPanels());
    E.on('fluid', () => this._refreshPanels());
    E.on('hood', () => this._refreshPanels());
    this.economy.on('cash', () => { this.hud.refreshStats(); });
    this.economy.on('tools', (tools) => {
      this.garage.stockDrawers((id) => this.tools.makeToolModel(id), tools);
      this.garage.setOwned(tools);
      this.hud.renderHotbar(this.tools.current);
    });
    this.economy.on('cosmetics', (c) => {
      this.garage.applyCosmetics(c);
      setTimeout(() => this.captureEnvironment(), 50);
    });

    E.on('drainPlugOut', ({ fastener, vehicle: v }) => {
      const reset = () => {
        fastener.state = 'loose'; fastener.backout = fastener.threadLen; fastener.group.visible = true; fastener.mesh.scale.setScalar(1); fastener.sync();
        this._refreshPanels();
      };
      if (v.fluids.oil.level < 0.05) { setTimeout(reset, 500); return; }
      const getPos = () => fastener.group.getWorldPosition(V3()).add(V3(0, -0.02, 0));
      const p = getPos();
      const pan = this.garage.drainPan.position;
      const inPan = v.drainPan && Math.hypot(pan.x - p.x, pan.z - p.z) < 0.4;
      const color = new THREE.Color(v.fluids.oil.quality < 0.5 ? 0x0b0703 : 0x5a3c08);
      this.vfx.stream(getPos, { color, rate: 85, dur: 4.2, speed: 0.25, size: 0.012, spread: 0.012, onLand: inPan });
      this.audio.play('slosh', { position: p, dur: 4.2 });
      gsap.to(v.fluids.oil, { level: 0, duration: 4.2, onUpdate: () => this.hud.renderFluids(v), onComplete: reset });
      if (inPan) {
        const oil = this.garage.panOil;
        oil.visible = true; oil.position.y = 0.012; oil.material.color.copy(color);
        gsap.to(oil.position, { y: 0.07, duration: 4.2 });
        this.hud.toast('Draining old oil into the pan…', 'ok');
      } else {
        v.stats.spills++;
        this.hud.toast('No drain pan! Oil is going all over the floor.', 'bad', 3000);
        this.vfx.puddle(V3(p.x, 0, p.z), 0.12, color.getHex(), 1.0, 0.9);
      }
    });
    E.on('coolantDrain', ({ fastener }) => {
      const v = this.vm.current;
      const getPos = () => fastener.group.getWorldPosition(V3());
      this.vfx.stream(getPos, { color: new THREE.Color(0x2fbf5a), rate: 60, dur: 3, speed: 0.3, size: 0.01 });
      this.audio.play('slosh', { position: getPos(), dur: 3 });
      setTimeout(() => {
        fastener.state = 'loose'; fastener.backout = fastener.threadLen; fastener.group.visible = true; fastener.mesh.scale.setScalar(1); fastener.sync();
        this._refreshPanels();
      }, 3000);
      this.hud.toast('Coolant drained — the system is depressurised.', 'ok');
      void v;
    });
    E.on('autoRemove', (part) => {
      const v = this.vm.current;
      if (part.kind === 'oil_filter' && v.fluids.oil.level > 0.3) {
        const p = new THREE.Box3().setFromObject(part.group).getCenter(V3());
        this.vfx.stream(() => p, { color: new THREE.Color(0x0b0703), rate: 50, dur: 1.8, speed: 0.2, size: 0.01 });
        v.stats.spills++;
        v.fluids.oil.level = Math.max(0, v.fluids.oil.level - 0.15);
        this.hud.toast('Oil pours out of the filter mount — drain the oil first next time!', 'bad', 3200);
      }
      part.state = 'removed';
      this.tools.sendToBench(part).then(() => this._refreshPanels());
      this.events.emit('partRemoved', part);
    });
  }

  _refreshPanels() {
    const v = this.vm.current;
    if (!v) return;
    this.hud.renderFluids(v);
    this.hud.renderParts(v);
    this.hud.refreshPartCard();
    this.updateObjectives();
  }

  // ---------------------------------------------------------------- input
  _bindInput(canvas) {
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 12;
    canvas.addEventListener('pointermove', (e) => {
      this.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      this.mouseClient = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('pointerleave', () => { this.mouse.set(-9, -9); this.hud.tooltip(null); });
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.audio.init();
      this.lastPointer = e.pointerType;
      if (e.pointerType !== 'touch') { this.click(); return; }
      // touch: act on release if it was a tap; holding still shows what's under the finger
      this.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      const tap = (this._tap = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), held: false, moved: false });
      clearTimeout(this._holdTimer);
      this._holdTimer = setTimeout(() => {
        if (this._tap !== tap || tap.moved) return;
        tap.held = true;
        const tg = this._pick();
        const html = tg && this._describe(tg);
        if (html) {
          this.hud.tooltip(html, tap.x - 140, tap.y - 150);
          if (tg.kind === 'fastener' || tg.kind === 'part') this.vm.setHover(tg.ref.group);
          navigator.vibrate?.(12);
          clearTimeout(this._tipTimer);
          this._tipTimer = setTimeout(() => { this.hud.tooltip(null); this.vm.setHover(null); }, 2600);
        }
      }, 480);
    });
    canvas.addEventListener('pointermove', (e) => {
      const tap = this._tap;
      if (tap && tap.id === e.pointerId && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > TAP_SLOP) tap.moved = true;
    });
    canvas.addEventListener('pointerup', (e) => {
      const tap = this._tap;
      if (!tap || tap.id !== e.pointerId) return;
      this._tap = null;
      clearTimeout(this._holdTimer);
      // ignore if this finger dragged/held, or another finger is down (pinch)
      const otherFinger = [...this.cam.touches.keys()].some((id) => id !== e.pointerId);
      if (tap.moved || tap.held || otherFinger) return;
      this.mouse.set((tap.x / innerWidth) * 2 - 1, -(tap.y / innerHeight) * 2 + 1);
      this.hud.tooltip(null);
      this.click();
    });
    canvas.addEventListener('pointercancel', () => { this._tap = null; clearTimeout(this._holdTimer); });
    addEventListener('keydown', (e) => {
      if (this.state === STATE.BOOT || !document.getElementById('title').classList.contains('hidden')) return;
      if (e.key === 'Escape') { if (this.hud.modalOpen && this.hud.modalClosable) this.hud.closeModal(); else this.hud.closePartCard(); return; }
      if (this.hud.modalOpen) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 9) {
        const ids = ['hand', 'socket', 'lug_wrench', 'screwdriver', 'drain_pan', 'impact', 'torque', 'multimeter', 'floor_jack'];
        this.tools.equip(ids[n - 1]);
      }
      const k = e.key.toLowerCase();
      if (k === 'q') this.cycleView(-1);
      if (k === 'e') this.cycleView(1);
      if (k === 'l') this.toggleLift();
      if (k === 'f') this.toggleLamp();
      if (k === 'j') this.openJobBoard();
      if (k === 'b') this.hud.openShop();
      if (k === 'h') this.hud.openHelp();
      if (k === 'm') document.getElementById('btn-mute').click();
      if (e.key === ' ') { e.preventDefault(); this.cam.stepBack(); }
    });
  }

  _pick() {
    if (this.mouse.x < -2 || this.modal) return null;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const targets = [...this.vm.interactables(), ...this.garage.interactables];
    const hits = this.raycaster.intersectObjects(targets, true);
    for (const h of hits) {
      if (!visibleDeep(h.object)) continue;
      let o = h.object;
      while (o && !o.userData.interact) o = o.parent;
      if (!o) continue;
      return { ...o.userData.interact, hit: h };
    }
    return null;
  }

  _describe(t) {
    const tool = this.tools.current;
    const toolName = (id) => TOOLS.find((x) => x.id === id)?.name;
    if (t.kind === 'fastener') {
      const f = t.ref;
      const action = f.state === 'tight' ? 'loosen' : 'tighten';
      const allowed = FASTENER_TOOLS[f.type][action];
      const ok = allowed.includes(tool);
      const block = action === 'loosen' ? this.vm.canLoosen(f) : { ok: true };
      let line = ok ? `<div class="act">Click to ${action}${f.state === 'loose' ? ' (hand-start, then torque)' : ''}</div>` : `<div class="no">Needs ${allowed.filter((a) => a !== 'torque' || action === 'tighten').map(toolName).join(' / ')}</div>`;
      if (!block.ok) line = `<div class="no">${block.reason}</div>`;
      if (tool === 'multimeter' && f.part.electrical) line = '<div class="act">Click to measure</div>';
      const extra = f.seized ? '<div class="hint">Looks rusted solid.</div>' : f.part.pattern && action === 'tighten' ? '<div class="hint">Tighten lugs in a star pattern.</div>' : '';
      return `<b>${f.label}</b>${f.part.name}${line}${extra}`;
    }
    if (t.kind === 'part') {
      const p = t.ref;
      if (p.state === 'removed') return `<b>${p.name}</b><div class="act">Click to inspect</div><div class="hint">On the bench</div>`;
      if (tool === 'multimeter' && p.electrical) return `<b>${p.name}</b><div class="act">Click to measure</div>`;
      if (tool === 'drain_pan' && (p.id === 'oil_pan' || p.id === 'oil_filter')) return `<b>${p.name}</b><div class="act">Place drain pan underneath</div>`;
      if (tool === 'floor_jack') return `<b>${p.name}</b><div class="act">Place floor jack under the axle</div>`;
      const r = this.vm.canRemove(p);
      return `<b>${p.name}</b>${r.ok ? '<div class="act">Click to remove</div>' : `<div class="hint">${r.reason}</div>`}`;
    }
    if (t.kind === 'hood') return `<b>Hood</b><div class="act">Click to ${this.vm.current?.hoodOpen ? 'close' : 'open'}</div>`;
    const env = {
      drawer: () => `<b>Tool chest drawer</b><div class="act">Click to ${t.ref.open ? 'close' : 'open'}</div>`,
      equip: () => `<b>${toolName(t.ref)}</b><div class="act">Click to take</div>`,
      laptop: () => '<b>Diagnostic laptop</b><div class="act">Click to scan the ECU</div>',
      ecu: () => '<b>ECU remapper</b><div class="act">Click to flash a performance tune</div>',
      terminal: () => '<b>Shop terminal</b><div class="act">Buy tools, upgrades & garage style</div>',
      jobboard: () => '<b>Job board</b><div class="act">See repair orders</div>',
      lift: () => `<b>Lift controls</b><div class="act">${this.garage.lift.raised ? 'Lower' : 'Raise'} the lift</div>`,
      lamp: () => `<b>Work lamp</b><div class="act">Turn ${this.garage.lamp.on ? 'off' : 'on'}</div><div class="hint">It follows your work position.</div>`,
      drainpan: () => '<b>Oil drain pan</b><div class="hint">Select it (5) and click the oil pan / drain plug to place it.</div>',
      floorjack: () => '<b>Floor jack</b><div class="hint">Select it (9) and click the rear axle/leaf spring.</div>',
      balancer: () => `<b>Laser wheel balancer</b><div class="hint">${this.economy.hasTool('balancer') ? 'Use “Balance” on a removed wheel.' : 'Locked — Tier 3 shop item.'}</div>`,
      ultrasonic: () => `<b>Ultrasonic cleaner</b><div class="hint">${this.economy.hasTool('ultrasonic') ? 'Use “Ultrasonic” on a removed part.' : 'Locked — Tier 3 shop item.'}</div>`,
    };
    return env[t.id] ? env[t.id]() : null;
  }

  click() {
    if (this.modal || this.tools.busy || this.busyMachine) return;
    const t = this._pick();
    if (!t) return;
    const v = this.vm.current;
    const inService = this.state === STATE.SERVICE;
    if (t.kind === 'fastener') {
      if (!inService) return;
      this.tools.useOnFastener(t.ref);
    } else if (t.kind === 'part') {
      const p = t.ref;
      if (p.state === 'removed') { this.hud.openPartCard(p); this.audio.play('ui'); this._refreshPanels(); return; }
      if (!inService) return;
      if (this.tools.current === 'multimeter') { if (p.electrical) this.tools.measure(p); else this.hud.toast('Probe a battery or ignition coil.', 'warn'); return; }
      if (this.tools.current === 'drain_pan') { this.tools.placePan(); return; }
      if (this.tools.current === 'floor_jack') { this.tools.placeJack(p); return; }
      p.inspected = true;
      this.tools.removePart(p);
      this.updateObjectives();
    } else if (t.kind === 'hood') {
      if (inService) this.tools.toggleHood(t.hit);
    } else if (t.kind === 'env') {
      const id = t.id;
      if (id === 'drawer') this.garage.toggleDrawer(t.ref, this.audio);
      else if (id === 'equip') this.tools.equip(t.ref);
      else if (id === 'laptop') { this.setView('cart'); this.scan(); }
      else if (id === 'ecu') this.ecuTune();
      else if (id === 'terminal') this.hud.openShop();
      else if (id === 'jobboard') this.openJobBoard();
      else if (id === 'lift') this.toggleLift();
      else if (id === 'lamp') this.toggleLamp();
      else if (id === 'drainpan') { this.tools.equip('drain_pan'); }
      else if (id === 'floorjack') { this.tools.equip('floor_jack'); }
      else if (id === 'balancer' || id === 'ultrasonic') this.setView('machines');
    }
    void v;
  }

  // ---------------------------------------------------------------- loop
  loop() {
    const tick = () => {
      requestAnimationFrame(tick);
      const dt = Math.min(0.05, this.clock.getDelta());
      this.time += dt;
      this.update(dt);
      this.composer.render(dt);
    };
    tick();
  }

  update(dt) {
    const t = this.time;
    this.cam.update(dt);
    this.tools.update(dt);
    this.garage.update(dt, t);
    this.vm.update(dt, t);
    this.vfx.update(dt, t);
    this.audio.update(dt);
    this.audio.updateListener(this.camera);
    const v = this.vm.current;
    if (v?.animators && v.running) for (const a of v.animators) a(dt, this.runRPM || 0);
    if (v?.animators && !v.running) for (const a of v.animators) a(dt, 0);
    // labor clock
    if ((this.state === STATE.SERVICE || this.state === STATE.TESTING) && !this.modal) {
      this.gameMinutes += dt;
      this._clockAcc = (this._clockAcc || 0) + dt;
      if (this._clockAcc > 0.5) {
        this._clockAcc = 0;
        this.hud.setClock(this.gameMinutes, this.job.bookHours);
        this._drawClock();
      }
    }
    // heat haze over hot exhaust parts
    if (v) {
      const heat = Math.max(0, v.hot - 0.3) * 1.4;
      this.vfx.setHeatSource(0, v.points.manifold_R || v.points.exhaust, heat);
      this.vfx.setHeatSource(1, v.points.exhaust, v.running ? 0.8 : heat * 0.5);
    } else {
      this.vfx.setHeatSource(0, null); this.vfx.setHeatSource(1, null);
    }
    // hover
    this._hoverAcc = (this._hoverAcc || 0) + dt;
    if (this._hoverAcc > 1 / 30) {
      this._hoverAcc = 0;
      const titleHidden = document.getElementById('title').classList.contains('hidden');
      if (this.lastPointer === 'touch') return; // touch has no hover; long-press shows the tooltip
      const tg = titleHidden && !this.tools.busy ? this._pick() : null;
      const canvas = this.renderer.domElement;
      if (tg) {
        const obj = tg.kind === 'fastener' ? tg.ref.group : tg.kind === 'part' ? tg.ref.group : null;
        this.vm.setHover(obj);
        const html = this._describe(tg);
        this.hud.tooltip(html, this.mouseClient.x, this.mouseClient.y);
        canvas.classList.toggle('target', !!html);
      } else {
        this.vm.setHover(null);
        this.hud.tooltip(null);
        canvas.classList.remove('target');
      }
    }
  }
}

function visibleDeep(o) {
  // invisible hit-proxies count as visible as long as their parents are
  let p = o.userData.interact?.kind === 'fastener' && !o.visible ? o.parent : o;
  while (p) { if (!p.visible) return false; p = p.parent; }
  return true;
}

function wrap(g, text, x, y, maxW, lh) {
  const words = text.split(' ');
  let line = '';
  for (const w of words) {
    const test = line + w + ' ';
    if (g.measureText(test).width > maxW && line) { g.fillText(line, x, y); line = w + ' '; y += lh; }
    else line = test;
  }
  g.fillText(line, x, y);
}

const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
function tweenP(target, vars) {
  return new Promise((res) => gsap.to(target, { ...vars, onComplete: () => { vars.onComplete && vars.onComplete(); res(); } }));
}

const game = new Game();
// debug handles (handy from the devtools console)
window.__game = game;
window.__gsap = gsap;
game.init().catch((e) => {
  console.error(e);
  const b = document.getElementById('btn-start');
  b.textContent = 'Failed to start — see console';
});
