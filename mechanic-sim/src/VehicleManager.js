// VehicleManager.js — part dependency graph (DAG), fasteners, wear state, diagnostics,
// vehicle spawn / roll-in / roll-out and job evaluation.
import * as THREE from 'three';
import gsap from 'gsap';
import { makeMat, applyCondition, setHighlight } from './Materials.js';
import { boltGeometry, quatFromY, disposeTree, V3 } from './Kit.js';
import { buildSportsCar } from './vehicles/SportsCar.js';
import { buildTruck } from './vehicles/Truck.js';
import { buildMotorcycle } from './vehicles/Motorcycle.js';

// fastener type -> tools that can loosen / tighten it
export const FASTENER_TOOLS = {
  lug:     { loosen: ['lug_wrench', 'impact'], tighten: ['lug_wrench', 'impact', 'torque'], label: 'Lug nut' },
  bolt:    { loosen: ['socket', 'impact'], tighten: ['socket', 'impact', 'torque'], label: 'Bolt' },
  plug:    { loosen: ['socket', 'impact'], tighten: ['socket', 'torque'], label: 'Drain plug' },
  spark:   { loosen: ['socket'], tighten: ['socket', 'torque'], label: 'Spark plug' },
  screw:   { loosen: ['screwdriver'], tighten: ['screwdriver'], label: 'Screw' },
  clip:    { loosen: ['screwdriver', 'hand'], tighten: ['screwdriver', 'hand'], label: 'Hose clamp' },
  filter:  { loosen: ['hand'], tighten: ['hand'], label: 'Spin-on filter' },
  petcock: { loosen: ['hand'], tighten: ['hand'], label: 'Drain petcock' },
  axle:    { loosen: ['socket', 'impact'], tighten: ['socket', 'impact', 'torque'], label: 'Axle nut' },
  ubolt:   { loosen: ['socket', 'impact'], tighten: ['socket', 'impact', 'torque'], label: 'U-bolt nut' },
};

const FASTENER_GEO = { lug: 'lug', bolt: 'hex', plug: 'plug', spark: 'spark', screw: 'screw', clip: 'clip', filter: 'filter', petcock: 'screw', axle: 'axle', ubolt: 'hex' };
const FASTENER_MAT = { lug: 'chrome', bolt: 'zinc', plug: 'steel', spark: 'ceramic', screw: 'zinc', clip: 'steel', filter: 'filterBlue', petcock: 'plastic', axle: 'steel', ubolt: 'goldZinc' };

let FID = 0;

export class Fastener {
  constructor(part, def, index) {
    this.id = `${part.id}#${index}`;
    this.uid = FID++;
    this.part = part;
    this.index = index;
    this.type = def.type;
    this.localPos = V3(...def.pos);
    this.axis = V3(...(def.axis || [0, 1, 0])).normalize();
    this.size = def.size || 1;
    this.state = 'tight'; // tight | loose | removed
    this.seized = false;
    this.stripped = false;
    this.torqued = false; // tightened with a torque wrench
    this.threadLen = def.threadLen || (def.type === 'filter' ? 0.03 : def.type === 'spark' ? 0.02 : 0.018);
    this.backout = 0; // metres backed out along axis
    this.spin = 0;
    this.group = new THREE.Group();
    this.group.position.copy(this.localPos);
    this.group.quaternion.copy(quatFromY(this.axis));
    const matName = def.mat || FASTENER_MAT[this.type];
    this.material = makeMat(matName, matName === 'ceramic' ? {} : { noiseScale: 3 });
    this.mesh = new THREE.Mesh(boltGeometry(this.size, FASTENER_GEO[this.type]), this.material);
    this.mesh.castShadow = true;
    if (this.type === 'spark') {
      // hex body in steel, insulator in ceramic: tint by using two meshes
      const hex = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.01, 6), makeMat('zinc'));
      hex.position.y = 0.006; this.mesh.add(hex);
    }
    this.group.add(this.mesh);
    // generous invisible hit proxy so small fasteners are easy to target
    const r = this.type === 'filter' ? 0.07 : this.type === 'clip' ? 0.04 : 0.028;
    this.proxy = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), HIT_MAT);
    this.proxy.position.y = this.type === 'filter' ? 0.055 : 0.01;
    this.proxy.visible = false;
    this.proxy.userData.interact = { kind: 'fastener', ref: this };
    this.mesh.userData.interact = { kind: 'fastener', ref: this };
    this.group.add(this.proxy);
  }

  get label() { return FASTENER_TOOLS[this.type].label; }

  /** Applies backout / spin to the visual. */
  sync() {
    this.mesh.position.y = this.backout;
    this.mesh.rotation.y = this.spin;
  }

  worldPos(target = new THREE.Vector3()) { return this.group.getWorldPosition(target); }
  worldAxis(target = new THREE.Vector3()) {
    const q = this.group.getWorldQuaternion(new THREE.Quaternion());
    return target.set(0, 1, 0).applyQuaternion(q).normalize();
  }
}

const HIT_MAT = new THREE.MeshBasicMaterial({ visible: false });

export class Part {
  constructor(vehicle, id, def) {
    this.vehicle = vehicle;
    this.id = id;
    this.name = def.name;
    this.kind = def.kind || id;
    this.deps = def.deps || [];
    this.fixed = !!def.fixed;
    this.autoRemove = !!def.autoRemove;
    this.requires = def.requires || [];
    this.view = def.view || 'engine';
    this.fluid = def.fluid || null;
    this.electrical = def.electrical || null; // 'battery' | 'coil'
    this.isWheel = !!def.isWheel;
    this.needsRaised = !!def.needsRaised;
    this.needsHood = !!def.needsHood;
    this.removeDir = V3(...(def.removeDir || [0, 1, 0])).normalize();
    this.state = 'installed'; // installed | removed
    this.replaced = false;
    this.cleanedByPlayer = false;
    this.balanced = true;
    this.condition = { wearLevel: 0.1, rust: 0.05, heatDamage: 0, isClean: false, grease: 0.2 };
    this.materials = [];
    this.group = new THREE.Group();
    this.group.name = id;
    if (def.pos) this.group.position.set(...def.pos);
    if (def.rot) this.group.rotation.set(...def.rot);
    this.slotPos = this.group.position.clone();
    this.slotQuat = this.group.quaternion.clone();
    // build visual with a per-part material factory so condition shading is per part
    const mat = (preset, over) => { const m = makeMat(preset, over); this.materials.push(m); return m; };
    def.build(this.group, mat, this);
    this.group.traverse((o) => { if (o.isMesh && !o.userData.interact) o.userData.interact = { kind: 'part', ref: this }; });
    this.fasteners = (def.fasteners || []).map((f, i) => new Fastener(this, f, i));
    for (const f of this.fasteners) this.group.add(f.group);
    this.onCondition = def.onCondition ? (c) => def.onCondition(this.group, c) : null;
    this.pattern = def.pattern || null; // star order for lug tightening
    this.tightenLog = [];
  }

  get faulty() { return this.vehicle.faults.some((f) => f.part === this.id && !this.vehicle.isFaultFixed(f)); }

  setCondition(c) {
    Object.assign(this.condition, c);
    for (const m of this.materials) applyCondition(m, this.condition);
    if (this.onCondition) this.onCondition(this.condition);
  }

  get secured() { return this.state === 'installed' && this.fasteners.every((f) => f.state === 'tight'); }

  conditionGrade() {
    const w = this.condition.wearLevel;
    if (!this.balanced) return { label: 'Out of balance', cls: 'bad' };
    if (w > 0.75) return { label: 'Worn out — replace', cls: 'bad' };
    if (w > 0.5) return { label: 'Serviceable, heavy wear', cls: 'warn' };
    if (w > 0.2) return { label: 'Good', cls: 'ok' };
    return { label: 'Like new', cls: 'good' };
  }
}

export class Vehicle {
  constructor(type, job) {
    this.type = type;
    this.job = job;
    this.group = new THREE.Group();
    this.group.name = 'vehicle';
    this.body = new THREE.Group();
    this.group.add(this.body);
    this.parts = new Map();
    this.faults = job ? job.faults.map((f) => ({ ...f })) : [];
    this.focal = {};
    this.wheels = [];
    this.fluids = { oil: { level: 1, quality: 1 }, coolant: { level: 1, pressurized: false } };
    this.drainPan = null;
    this.jackPlaced = false;
    this.hood = null;
    this.hoodOpen = false;
    this.raised = false;
    this.tuned = false;
    this.engineSpec = { cylinders: 6, idle: 850, redline: 7200, character: 'v6turbo' };
    this.points = {}; // named world-anchor objects: exhaust tip, drain plug, oil fill, obd port
    this.stats = { spills: 0, stripped: 0, burns: 0, patternErrors: 0, machineUses: 0, liftCycles: 0, cleanedExtra: 0, fluids: [] };
    this.paintMat = null;
    this.hot = job?.arrivedHot ? 0.8 : 0;
    this.startTime = performance.now();
    this.pausedMs = 0;
  }

  addPart(id, def) {
    const p = new Part(this, id, def);
    this.parts.set(id, p);
    p.slotParent = def.parent || this.group;
    p.slotParent.add(p.group);
    return p;
  }

  part(id) { return this.parts.get(id); }

  dependents(part) {
    const out = [];
    for (const p of this.parts.values()) if (p.state === 'installed' && p.deps.includes(part.id)) out.push(p);
    return out;
  }

  isFaultFixed(f) {
    if (f.mode === 'oil') return this.fluids.oil.quality > 0.9 && this.fluids.oil.level > 0.95;
    if (f.mode === 'tune') return this.tuned;
    const p = this.parts.get(f.part);
    if (!p) return true;
    if (f.mode === 'worn') return p.replaced;
    if (f.mode === 'dirty') return p.replaced || p.condition.isClean;
    if (f.mode === 'imbalance') return p.balanced;
    return false;
  }

  allFixed() { return this.faults.every((f) => this.isFaultFixed(f)); }
}

export class VehicleManager {
  constructor(scene, ctx) {
    this.scene = scene;
    this.ctx = ctx; // { lift, audio, vfx, economy, bench }
    this.current = null;
    this.hover = null;
  }

  // ---------------------------------------------------------------- spawning

  spawn(job) {
    if (this.current) this.despawn();
    const v = new Vehicle(job.vehicle, job);
    const rng = mulberry(job.seed);
    if (job.vehicle === 'sports') buildSportsCar(v, job);
    else if (job.vehicle === 'truck') buildTruck(v, job);
    else buildMotorcycle(v, job);

    // baseline wear on every part, scaled by a per-vehicle "age"
    const age = 0.25 + rng() * 0.45;
    for (const p of v.parts.values()) {
      const wearLevel = Math.min(0.6, age * (0.4 + rng() * 0.8));
      p.setCondition({
        wearLevel,
        rust: p.isWheel ? 0.05 : Math.max(0, age - 0.25) * (0.3 + rng() * 0.9),
        heatDamage: /exhaust|turbo|header|manifold/.test(p.kind) ? 0.2 + rng() * 0.3 : 0,
        isClean: false,
        grease: /engine|filter|pan|head|cover|manifold|carb|chain|tc|drive/.test(p.kind + p.id) ? 0.3 + rng() * 0.5 : 0.1 + rng() * 0.2,
      });
      for (const f of p.fasteners) {
        f.seized = p.condition.rust > 0.45 && rng() < 0.45 && ['bolt', 'lug', 'ubolt', 'axle'].includes(f.type);
        f.material.userData.u.uRust.value = Math.min(1, p.condition.rust * 1.4);
        f.material.userData.u.uDirt.value = 0.3 + p.condition.wearLevel * 0.5;
      }
    }
    // inject the job's faults
    for (const f of v.faults) {
      if (f.mode === 'oil') { v.fluids.oil.quality = 0.15; continue; }
      if (f.mode === 'tune') continue;
      const p = v.parts.get(f.part);
      if (!p) { console.warn('fault part missing', f.part); continue; }
      if (f.mode === 'worn') p.setCondition({ wearLevel: 0.82 + rng() * 0.16, rust: Math.max(p.condition.rust, 0.25), heatDamage: /exhaust|manifold|header|turbo|gasket/.test(p.kind) ? 0.85 : p.condition.heatDamage });
      if (f.mode === 'dirty') p.setCondition({ wearLevel: 0.35, isClean: false, grease: 0.95 });
      if (f.mode === 'imbalance') p.balanced = false;
    }
    if (v.hot > 0) v.fluids.coolant.pressurized = true;
    this.current = v;
    this.scene.add(v.group);
    return v;
  }

  despawn() {
    const v = this.current;
    if (!v) return;
    v.group.parent?.remove(v.group);
    for (const p of v.parts.values()) p.group.parent?.remove(p.group);
    disposeTree(v.group);
    for (const p of v.parts.values()) disposeTree(p.group);
    if (v.drainPan) v.drainPan.visible = false;
    this.current = null;
  }

  /** Drives the vehicle in from outside the roll-up door onto the lift deck. */
  rollIn(onDone) {
    const v = this.current;
    const lift = this.ctx.lift;
    const deck = lift.deck;
    v.group.position.set(-13, 0, 0);
    v.group.rotation.set(0, 0, 0);
    this.scene.add(v.group);
    const state = { x: -13 };
    const dur = 5.2;
    const eng = this.ctx.audio.engine(v.engineSpec, v.group.position);
    eng?.start();
    eng?.setRPM(v.engineSpec.idle * 1.4, 0.5);
    this.ctx.audio.play('rollIn', { position: V3(-6, 0.3, 0), dur });
    gsap.to(state, {
      x: 0, duration: dur, ease: 'power2.out',
      onUpdate: () => {
        const dx = state.x - v.group.position.x;
        v.group.position.x = state.x;
        v.group.position.y = deckHeightAt(state.x, deck.position.y + lift.deckTop);
        for (const w of v.wheels) w.spinner.rotation.z -= dx / w.radius;
        eng?.setRPM(v.engineSpec.idle * (1 + Math.min(1, Math.abs(dx) * 30)), 0.2);
      },
      onComplete: () => {
        deck.attach(v.group);
        v.group.position.set(0, lift.deckTop, 0);
        eng?.setRPM(v.engineSpec.idle * 2.2, 0.08);
        setTimeout(() => { eng?.stop(); onDone && onDone(); }, 500);
      },
    });
  }

  rollOut(onDone) {
    const v = this.current;
    if (!v) { onDone && onDone(); return; }
    const lift = this.ctx.lift;
    this.scene.attach(v.group);
    const eng = this.ctx.audio.engine(v.engineSpec, v.group.position);
    eng?.start();
    const state = { x: v.group.position.x };
    setTimeout(() => {
      gsap.to(state, {
        x: -14, duration: 4.5, ease: 'power2.in',
        onUpdate: () => {
          const dx = state.x - v.group.position.x;
          v.group.position.x = state.x;
          v.group.position.y = deckHeightAt(state.x, lift.deck.position.y + lift.deckTop);
          for (const w of v.wheels) w.spinner.rotation.z -= dx / w.radius;
          eng?.setRPM(v.engineSpec.idle * (1.2 + Math.min(2, Math.abs(dx) * 40)), 0.2);
        },
        onComplete: () => { eng?.stop(); this.despawn(); onDone && onDone(); },
      });
    }, 900);
  }

  // ---------------------------------------------------------------- rules

  canRemove(part, tools) {
    const v = this.current;
    if (part.fixed) return { ok: false, reason: `${part.name} stays on the vehicle.` };
    if (part.state !== 'installed') return { ok: false, reason: 'Already removed.' };
    if (part.needsHood && v.hood && !v.hoodOpen) return { ok: false, reason: 'Open the hood first.' };
    if (part.needsRaised && !v.raised) return { ok: false, reason: 'Raise the lift so the wheels hang free.' };
    const blockers = v.dependents(part);
    if (blockers.length) return { ok: false, reason: `Remove first: ${blockers.map((b) => b.name).join(', ')}` };
    const tight = part.fasteners.filter((f) => f.state !== 'removed');
    if (tight.length) return { ok: false, reason: `${tight.length} ${tight[0].label.toLowerCase()}${tight.length > 1 ? 's' : ''} still fastened.` };
    for (const r of part.requires) {
      if (r === 'floor_jack' && !v.jackPlaced) return { ok: false, reason: 'Support the axle with a floor jack first.' };
    }
    return { ok: true };
  }

  canInstall(part) {
    const v = this.current;
    if (part.state === 'installed') return { ok: false, reason: 'Already installed.' };
    const missing = part.deps.map((d) => v.parts.get(d)).filter((d) => d && d.state !== 'installed');
    if (missing.length) return { ok: false, reason: `Install first: ${missing.map((m) => m.name).join(', ')}` };
    return { ok: true };
  }

  canLoosen(f) {
    const v = this.current;
    const part = f.part;
    if (part.needsHood && v.hood && !v.hoodOpen) return { ok: false, reason: 'Open the hood first.' };
    if (part.needsRaised && !v.raised && part.isWheel) return { ok: false, reason: 'Raise the lift before pulling the wheel.' };
    // a fastener hidden behind another part cannot be reached
    const blockers = v.dependents(part);
    if (blockers.length && !part.fixed) return { ok: false, reason: `Blocked by ${blockers[0].name} — remove it first.` };
    return { ok: true };
  }

  /** Called by the ToolController when a fastener has been fully backed out. */
  onFastenerRemoved(f) {
    const v = this.current;
    const p = f.part;
    if (f.type === 'plug') this.ctx.events.emit('drainPlugOut', { fastener: f, vehicle: v });
    if (f.type === 'petcock') { v.fluids.coolant.level = 0; v.fluids.coolant.pressurized = false; this.ctx.events.emit('coolantDrain', { fastener: f }); }
    if (p.autoRemove && p.fasteners.every((x) => x.state === 'removed')) this.ctx.events.emit('autoRemove', p);
  }

  onFastenerTightened(f, tool) {
    const p = f.part;
    if (p.pattern && f.type === 'lug') {
      p.tightenLog.push(f.index);
      const n = p.fasteners.length;
      const log = p.tightenLog;
      if (log.length >= 2) {
        const a = log[log.length - 2], b = log[log.length - 1];
        const diff = Math.min((a - b + n) % n, (b - a + n) % n);
        if (diff === 1 && n >= 5) {
          if (!p.patternWarned) { this.current.stats.patternErrors++; p.patternWarned = true; }
          return { warn: 'Adjacent lugs — use a star (criss-cross) pattern to seat the wheel evenly.' };
        }
      }
    }
    return {};
  }

  // ---------------------------------------------------------------- diagnostics

  obdScan() {
    const v = this.current;
    const codes = [];
    for (const f of v.faults) {
      if (v.isFaultFixed(f)) continue;
      const p = v.parts.get(f.part);
      const id = f.part;
      if (/plugs_L|spark_plug/.test(id)) codes.push(['P0301', 'Cylinder 1 misfire detected (bank 1)']);
      if (/plugs_R/.test(id)) codes.push(['P0304', 'Cylinder 4 misfire detected (bank 2)']);
      if (/coils_L/.test(id)) codes.push(['P0351', 'Ignition coil A primary/secondary circuit']);
      if (/coils_R/.test(id)) codes.push(['P0354', 'Ignition coil D primary/secondary circuit']);
      if (id === 'turbo') codes.push(['P0299', 'Turbocharger underboost condition']);
      if (id === 'battery') codes.push(['P0562', 'System voltage low']);
      if (/head_gasket/.test(id)) codes.push(['P0217', 'Engine coolant over-temperature']);
      if (id === 'radiator_hose') codes.push(['P0128', 'Coolant thermostat / temperature below regulating']);
      if (/exhaust_manifold|exhaust_header/.test(id)) codes.push(['P0420', 'Catalyst efficiency below threshold (exhaust leak)']);
      if (id === 'air_filter' || id === 'carburetor') codes.push(['P0101', 'Mass airflow / intake circuit range']);
      if (id === 'oil') codes.push(['P0521', 'Engine oil pressure sensor range / oil life 0%']);
      if (f.mode === 'tune') codes.push(['INFO', 'Calibration: stock. Remap available.']);
      if (id === 'tc_seal') codes.push(['P0711', 'Transfer case fluid temperature / level low']);
      if (p && !codes.length && f.mode !== 'tune') { /* mechanical fault: no code */ }
    }
    const live = {
      rpm: v.engineSpec.idle,
      coolant: v.hot > 0.5 ? 104 : 88,
      voltage: this.measure(v.parts.get('battery'))?.value ?? 12.6,
      oilLife: Math.round(v.fluids.oil.quality * 100),
      boost: v.parts.get('turbo') ? (v.faults.some((f) => f.part === 'turbo' && !v.isFaultFixed(f)) ? 0.3 : 1.1) : null,
    };
    return { codes, live };
  }

  /** Multimeter reading for an electrical part. */
  measure(part) {
    if (!part || !part.electrical) return null;
    const w = part.condition.wearLevel;
    const bad = part.faulty;
    if (part.electrical === 'battery') {
      const value = bad ? 11.2 + Math.random() * 0.4 : 12.5 + (1 - w) * 0.3;
      return { value: +value.toFixed(2), unit: 'V DC', verdict: value < 12.2 ? 'FAIL — will not hold a charge' : 'PASS' };
    }
    if (part.electrical === 'coil') {
      const value = bad ? 2.4 + Math.random() * 3 : 0.6 + w * 0.3;
      return { value: +value.toFixed(2), unit: 'Ω primary', verdict: value > 1.2 ? 'FAIL — winding out of spec' : 'PASS' };
    }
    return null;
  }

  /** Summarises the work for invoicing. */
  evaluate(gameMinutes) {
    const v = this.current;
    const faults = v.faults.map((f) => ({ ...f, fixed: v.isFaultFixed(f) }));
    const faultParts = new Set(v.faults.map((f) => f.part));
    const replaced = [];
    for (const p of v.parts.values()) {
      if (p.replaced) replaced.push({ kind: p.kind, faulty: faultParts.has(p.id) && v.faults.find((f) => f.part === p.id).mode !== 'imbalance' });
    }
    const allParts = [...v.parts.values()];
    const roadworthy = allParts.every((p) => p.state === 'installed' && p.fasteners.every((f) => f.state === 'tight'))
      && v.fluids.oil.level > 0.9 && v.fluids.coolant.level > 0.9;
    const allTight = allParts.flatMap((p) => p.fasteners).filter((f) => ['lug', 'bolt', 'axle', 'ubolt'].includes(f.type) && f.retightened);
    const torqueWrenchAll = allTight.length > 0 && allTight.every((f) => f.torqued);
    return {
      faults, replaced, roadworthy, torqueWrenchAll, gameMinutes,
      cleanedExtra: v.stats.cleanedExtra, spills: v.stats.spills, stripped: v.stats.stripped,
      burns: v.stats.burns, patternErrors: v.stats.patternErrors,
      machineUses: v.stats.machineUses, liftCycles: v.stats.liftCycles, fluids: v.stats.fluids,
    };
  }

  notRoadworthyReasons() {
    const v = this.current;
    const r = [];
    for (const p of v.parts.values()) {
      if (p.state !== 'installed') r.push(`${p.name} is not installed`);
      else if (p.fasteners.some((f) => f.state !== 'tight')) r.push(`${p.name} has loose fasteners`);
    }
    if (v.fluids.oil.level < 0.9) r.push('Engine oil needs refilling');
    if (v.fluids.coolant.level < 0.9) r.push('Coolant needs refilling');
    return r;
  }

  // ---------------------------------------------------------------- interaction helpers

  interactables() {
    const v = this.current;
    if (!v) return [];
    const out = [v.group];
    for (const p of v.parts.values()) if (p.state === 'removed') out.push(p.group);
    return out;
  }

  setHover(obj) {
    if (this.hover === obj) return;
    if (this.hover) setHighlight(this.hover, 0);
    this.hover = obj;
    if (obj) setHighlight(obj, 0.55);
  }

  update(dt, t) {
    const v = this.current;
    if (!v) return;
    if (this.hover) setHighlight(this.hover, 0.35 + Math.sin(t * 6) * 0.2);
    v.hot = Math.max(0, v.hot - dt * 0.006);
  }
}

function deckHeightAt(x, deckTopWorld) {
  // ramp up onto the lift deck between x=-3.6 and -2.5
  if (x < -3.6) return 0;
  if (x < -2.5) return ((x + 3.6) / 1.1) * deckTopWorld;
  return deckTopWorld;
}

export function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
