// VFX.js — CPU-simulated particle systems (spark streaks, oil drips, coolant spray, steam/smoke,
// dust motes, bubbles), floor puddle & grease decals and a screen-space heat-haze post pass.
import * as THREE from 'three';
import gsap from 'gsap';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { radialAlphaTexture } from './Materials.js';

const _v = new THREE.Vector3();

// ------------------------------------------------------------------ soft point sprites
class PointSystem {
  constructor(scene, { max = 600, additive = false, gravity = -9.8, drag = 0.5, floor = true, bounce = 0, onFloor = null, sizeScale = 1, depthTest = true, renderOrder = 10 }) {
    this.max = max; this.gravity = gravity; this.drag = drag; this.floor = floor; this.bounce = bounce; this.onFloor = onFloor;
    this.p = []; // live particles
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 * sizeScale } },
      vertexShader: `
        attribute vec4 aColor; attribute float aSize; varying vec4 vColor; uniform float uScale;
        void main(){ vColor = aColor; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = aSize * uScale / max(0.05, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `
        varying vec4 vColor;
        void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard;
          float a = smoothstep(0.5, 0.0, r); gl_FragColor = vec4(vColor.rgb, vColor.a * a); }`,
      transparent: true, depthWrite: false, depthTest,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = renderOrder;
    scene.add(this.points);
  }

  emit(o) {
    if (this.p.length >= this.max) this.p.shift();
    this.p.push({
      x: o.pos.x, y: o.pos.y, z: o.pos.z,
      vx: o.vel?.x || 0, vy: o.vel?.y || 0, vz: o.vel?.z || 0,
      r: o.color?.r ?? 1, g: o.color?.g ?? 1, b: o.color?.b ?? 1, a: o.alpha ?? 1,
      size: o.size || 0.01, grow: o.grow || 0, life: o.life || 1, age: 0, fade: o.fade ?? true,
      gravity: o.gravity ?? this.gravity, drag: o.drag ?? this.drag, landed: false,
    });
  }

  update(dt) {
    const P = this.p;
    for (let i = P.length - 1; i >= 0; i--) {
      const q = P[i];
      q.age += dt;
      if (q.age >= q.life) { P.splice(i, 1); continue; }
      q.vy += q.gravity * dt;
      const k = Math.exp(-q.drag * dt);
      q.vx *= k; q.vy *= k; q.vz *= k;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      q.size += q.grow * dt;
      if (this.floor && q.y < 0.003) {
        q.y = 0.003;
        if (!q.landed && this.onFloor) this.onFloor(q);
        q.landed = true;
        if (this.bounce > 0 && Math.abs(q.vy) > 0.3) { q.vy = -q.vy * this.bounce; q.vx *= 0.6; q.vz *= 0.6; }
        else { q.vx = q.vy = q.vz = 0; if (!this.bounce) q.life = Math.min(q.life, q.age + 0.15); }
      }
    }
    const n = P.length;
    for (let i = 0; i < n; i++) {
      const q = P[i];
      this.pos[i * 3] = q.x; this.pos[i * 3 + 1] = q.y; this.pos[i * 3 + 2] = q.z;
      const t = q.age / q.life;
      this.col[i * 4] = q.r; this.col[i * 4 + 1] = q.g; this.col[i * 4 + 2] = q.b;
      this.col[i * 4 + 3] = q.a * (q.fade ? 1 - t * t : 1);
      this.size[i] = q.size;
    }
    const g = this.points.geometry;
    g.setDrawRange(0, n);
    g.attributes.position.needsUpdate = true;
    g.attributes.aColor.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ spark streaks (line segments)
class SparkSystem {
  constructor(scene, max = 400) {
    this.max = max;
    this.s = [];
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 6);
    this.col = new Float32Array(max * 6);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 12;
    scene.add(this.lines);
  }

  emit(pos, dir, count = 30, speed = 3) {
    for (let i = 0; i < count; i++) {
      if (this.s.length >= this.max) this.s.shift();
      const v = new THREE.Vector3(dir.x + (Math.random() - 0.5) * 1.6, dir.y + Math.random() * 0.8, dir.z + (Math.random() - 0.5) * 1.6).normalize().multiplyScalar(speed * (0.4 + Math.random()));
      this.s.push({ p: pos.clone(), v, life: 0.35 + Math.random() * 0.6, age: 0, heat: 1 });
    }
  }

  update(dt) {
    const S = this.s;
    for (let i = S.length - 1; i >= 0; i--) {
      const s = S[i];
      s.age += dt;
      if (s.age > s.life) { S.splice(i, 1); continue; }
      s.v.y -= 9.8 * dt;
      s.p.addScaledVector(s.v, dt);
      if (s.p.y < 0.004) { s.p.y = 0.004; s.v.y *= -0.35; s.v.x *= 0.5; s.v.z *= 0.5; }
    }
    for (let i = 0; i < S.length; i++) {
      const s = S[i];
      const t = s.age / s.life;
      const tail = s.p.clone().addScaledVector(s.v, -0.018);
      this.pos.set([s.p.x, s.p.y, s.p.z, tail.x, tail.y, tail.z], i * 6);
      const h = 1 - t;
      const c = [4.0 * h, 1.6 * h * h, 0.35 * h * h * h];
      this.col.set([...c, c[0] * 0.3, c[1] * 0.2, c[2] * 0.1], i * 6);
    }
    const g = this.lines.geometry;
    g.setDrawRange(0, S.length * 2);
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ heat haze pass
export const HeatHazeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uC0: { value: new THREE.Vector3(0.5, 0.5, 0) }, // xy screen uv, z strength
    uC1: { value: new THREE.Vector3(0.5, 0.5, 0) },
    uRadius: { value: 0.12 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uAspect; uniform vec3 uC0; uniform vec3 uC1; uniform float uRadius;
    varying vec2 vUv;
    float mask(vec3 c){
      if (c.z <= 0.0) return 0.0;
      vec2 d = vUv - c.xy; d.x *= uAspect;
      float m = smoothstep(uRadius, 0.0, length(d * vec2(1.0, 0.6)));
      m *= smoothstep(-0.04, 0.06, vUv.y - c.y + 0.02);
      return m * c.z;
    }
    void main(){
      float m = mask(uC0) + mask(uC1);
      vec2 off = vec2(sin(vUv.y * 90.0 - uTime * 7.0 + sin(vUv.x * 40.0)), cos(vUv.x * 75.0 + uTime * 5.0)) * 0.0028 * m;
      vec4 col = texture2D(tDiffuse, vUv + off);
      gl_FragColor = col;
    }`,
};

export class VFX {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.sparks = new SparkSystem(scene);
    this.drips = new PointSystem(scene, { max: 500, gravity: -9.8, drag: 0.1, onFloor: (q) => this._onDripLand(q), sizeScale: 1 });
    this.spray = new PointSystem(scene, { max: 900, gravity: -4, drag: 1.4, sizeScale: 1 });
    this.smoke = new PointSystem(scene, { max: 400, gravity: 0.35, drag: 0.8, floor: false, sizeScale: 1 });
    this.glow = new PointSystem(scene, { max: 200, additive: true, gravity: 0, drag: 2, floor: false });
    this.dust = new PointSystem(scene, { max: 260, additive: true, gravity: 0, drag: 0, floor: false, sizeScale: 1 });
    this.bubbles = new PointSystem(scene, { max: 300, gravity: 0.8, drag: 2, floor: false });
    this.puddles = [];
    this.decals = [];
    this.emitters = new Set();
    this.puddleTex = radialAlphaTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 256, true, 5);
    this.smudgeTex = radialAlphaTexture('rgba(255,255,255,0.85)', 'rgba(255,255,255,0)', 128, true, 9);
    this.flash = new THREE.PointLight(0xff7a2a, 0, 4, 2);
    scene.add(this.flash);
    this.heatPass = new ShaderPass(HeatHazeShader);
    this.heatSources = [null, null];
    for (let i = 0; i < 160; i++) this._spawnDust(true);
  }

  // ---------------------------------------------------------------- emitters
  sparkBurst(pos, dir = new THREE.Vector3(0, 1, 0), count = 40, speed = 3) {
    this.sparks.emit(pos, dir, count, speed);
    this.flash.position.copy(pos);
    this.flash.intensity = 3;
    gsap.to(this.flash, { intensity: 0, duration: 0.25 });
  }

  rustPuff(pos) {
    for (let i = 0; i < 18; i++) {
      this.smoke.emit({
        pos, vel: new THREE.Vector3((Math.random() - 0.5) * 0.4, Math.random() * 0.2, (Math.random() - 0.5) * 0.4),
        color: new THREE.Color(0x6a3a1c), alpha: 0.35, size: 0.012, grow: 0.03, life: 1.2, gravity: -0.4,
      });
    }
  }

  /** Continuous fluid stream from a point (oil drain, leak). Returns stop(). */
  stream(getPos, { color = new THREE.Color(0x150d03), rate = 70, dur = 4, spread = 0.02, speed = 0.4, size = 0.012, onLand } = {}) {
    const e = { getPos, color, rate, t: 0, dur, acc: 0, spread, speed, size, onLand, alive: true, kind: 'stream' };
    this.emitters.add(e);
    return () => { e.alive = false; };
  }

  coolantSpray(pos, dir) {
    const d = dir.clone().normalize();
    const e = { kind: 'spray', pos: pos.clone(), dir: d, t: 0, dur: 1.6, acc: 0, alive: true };
    this.emitters.add(e);
  }

  exhaustSmoke(getPos, color = 0xdddddd, dur = 4, density = 1) {
    const e = { kind: 'smoke', getPos, color: new THREE.Color(color), t: 0, dur, acc: 0, density, alive: true };
    this.emitters.add(e);
    return () => { e.alive = false; };
  }

  bubblesAt(getPos, dur = 3) {
    const e = { kind: 'bubbles', getPos, t: 0, dur, acc: 0, alive: true };
    this.emitters.add(e);
  }

  backfire(pos) {
    for (let i = 0; i < 30; i++) {
      this.glow.emit({
        pos, vel: new THREE.Vector3(-1.5 - Math.random() * 2, (Math.random() - 0.3) * 0.6, (Math.random() - 0.5) * 0.6),
        color: new THREE.Color().setHSL(0.06 + Math.random() * 0.05, 1, 0.55), alpha: 1, size: 0.05 + Math.random() * 0.05, life: 0.18 + Math.random() * 0.15,
      });
    }
    this.flash.position.copy(pos);
    this.flash.intensity = 25;
    gsap.to(this.flash, { intensity: 0, duration: 0.2 });
    this.exhaustSmoke(() => pos, 0x666666, 0.6, 2);
  }

  // ---------------------------------------------------------------- decals
  _onDripLand(q) {
    if (q.noPuddle) return;
    const p = new THREE.Vector3(q.x, 0, q.z);
    // merge into an existing puddle nearby
    for (const pd of this.puddles) {
      if (pd.position.distanceTo(p) < pd.userData.radius * 0.8) {
        pd.userData.radius = Math.min(pd.userData.max, pd.userData.radius + 0.004);
        pd.scale.setScalar(pd.userData.radius);
        return;
      }
    }
    this.puddle(p, 0.05, q.puddleColor || 0x0d0904, 0.45);
  }

  puddle(pos, start = 0.08, color = 0x0d0904, max = 0.6, grow = 0) {
    const mat = new THREE.MeshPhysicalMaterial({
      color, roughness: 0.04, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02,
      alphaMap: this.puddleTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    });
    const m = new THREE.Mesh(new THREE.CircleGeometry(1, 32), mat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.random() * Math.PI * 2;
    m.position.set(pos.x, 0.0025 + this.puddles.length * 0.00005, pos.z);
    m.scale.setScalar(start);
    m.userData.radius = start;
    m.userData.max = max;
    m.receiveShadow = true;
    m.renderOrder = 2;
    this.scene.add(m);
    this.puddles.push(m);
    if (grow > 0) gsap.to(m.scale, { x: grow, y: grow, z: grow, duration: 2.5, ease: 'power2.out', onUpdate: () => { m.userData.radius = m.scale.x; } });
    return m;
  }

  /** Greasy glove print on a mesh surface. */
  smudge(targetMesh, point, normal) {
    if (!targetMesh || !targetMesh.geometry) return;
    try {
      const orient = new THREE.Euler();
      const helper = new THREE.Object3D();
      helper.position.copy(point);
      helper.lookAt(point.clone().add(normal));
      orient.copy(helper.rotation);
      orient.z = Math.random() * Math.PI * 2;
      const s = 0.07 + Math.random() * 0.04;
      const geo = new DecalGeometry(targetMesh, point, orient, new THREE.Vector3(s, s * 0.8, 0.1));
      const mat = new THREE.MeshStandardMaterial({
        color: 0x0b0806, roughness: 0.35, metalness: 0.1, alphaMap: this.smudgeTex, transparent: true, opacity: 0.75,
        depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4,
      });
      const d = new THREE.Mesh(geo, mat);
      // decal geometry is in world space; keep it attached to the target so it follows hood motion
      targetMesh.updateMatrixWorld();
      const inv = targetMesh.matrixWorld.clone().invert();
      d.geometry.applyMatrix4(inv);
      targetMesh.add(d);
      this.decals.push(d);
    } catch (e) { /* degenerate projection — ignore */ }
  }

  clearJobMess() {
    for (const p of this.puddles) { this.scene.remove(p); p.geometry.dispose(); p.material.dispose(); }
    this.puddles = [];
    this.decals = [];
  }

  // ---------------------------------------------------------------- heat haze
  setHeatSource(i, obj, strength) { this.heatSources[i] = obj ? { obj, strength } : null; }

  _updateHeat(t) {
    const u = this.heatPass.uniforms;
    u.uTime.value = t;
    u.uAspect.value = this.camera.aspect;
    const cs = [u.uC0.value, u.uC1.value];
    for (let i = 0; i < 2; i++) {
      const src = this.heatSources[i];
      if (!src || src.strength <= 0.01) { cs[i].z = 0; continue; }
      src.obj.getWorldPosition(_v);
      const dist = _v.distanceTo(this.camera.position);
      _v.project(this.camera);
      if (_v.z > 1) { cs[i].z = 0; continue; }
      cs[i].set(_v.x * 0.5 + 0.5, _v.y * 0.5 + 0.5, src.strength);
      u.uRadius.value = THREE.MathUtils.clamp(0.25 / Math.max(0.4, dist), 0.05, 0.3);
    }
  }

  // ---------------------------------------------------------------- update
  _spawnDust(initial) {
    this.dust.emit({
      pos: new THREE.Vector3((Math.random() - 0.5) * 9, 0.4 + Math.random() * 3.2, (Math.random() - 0.5) * 9),
      vel: new THREE.Vector3((Math.random() - 0.5) * 0.03, (Math.random() - 0.5) * 0.02, (Math.random() - 0.5) * 0.03),
      color: new THREE.Color(1, 0.95, 0.85), alpha: 0.12 + Math.random() * 0.12, size: 0.004 + Math.random() * 0.004,
      life: initial ? Math.random() * 20 + 5 : 20 + Math.random() * 10, fade: false,
    });
  }

  update(dt, t) {
    for (const e of this.emitters) {
      e.t += dt;
      if (!e.alive || e.t > e.dur) { this.emitters.delete(e); continue; }
      if (e.kind === 'stream') {
        e.acc += e.rate * dt;
        const p = e.getPos();
        while (e.acc >= 1) {
          e.acc--;
          this.drips.emit({
            pos: p.clone().add(new THREE.Vector3((Math.random() - 0.5) * e.spread, 0, (Math.random() - 0.5) * e.spread)),
            vel: new THREE.Vector3((Math.random() - 0.5) * 0.05, -e.speed, (Math.random() - 0.5) * 0.05),
            color: e.color, alpha: 0.95, size: e.size, life: 3, fade: false,
          });
          const last = this.drips.p[this.drips.p.length - 1];
          if (e.onLand) last.noPuddle = true;
          last.puddleColor = e.color.getHex();
        }
      } else if (e.kind === 'spray') {
        e.acc += 420 * dt * (1 - e.t / e.dur);
        while (e.acc >= 1) {
          e.acc--;
          const v = e.dir.clone().multiplyScalar(2.5 + Math.random() * 2).add(new THREE.Vector3((Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2));
          this.spray.emit({ pos: e.pos, vel: v, color: new THREE.Color(0x3fd17a), alpha: 0.75, size: 0.008 + Math.random() * 0.01, life: 1.4 });
          if (Math.random() < 0.3) this.smoke.emit({ pos: e.pos, vel: v.clone().multiplyScalar(0.4), color: new THREE.Color(0xf2f2f2), alpha: 0.25, size: 0.04, grow: 0.25, life: 1.6 });
        }
      } else if (e.kind === 'smoke') {
        e.acc += 40 * e.density * dt;
        const p = e.getPos();
        while (e.acc >= 1) {
          e.acc--;
          this.smoke.emit({
            pos: p, vel: new THREE.Vector3(-0.6 - Math.random() * 0.4, 0.1 + Math.random() * 0.15, (Math.random() - 0.5) * 0.2),
            color: e.color, alpha: 0.22, size: 0.05, grow: 0.35, life: 2.4,
          });
        }
      } else if (e.kind === 'bubbles') {
        e.acc += 90 * dt;
        const p = e.getPos();
        while (e.acc >= 1) {
          e.acc--;
          this.bubbles.emit({
            pos: p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.45, -0.05, (Math.random() - 0.5) * 0.3)),
            vel: new THREE.Vector3(0, 0.1 + Math.random() * 0.15, 0), color: new THREE.Color(0xe8f6ff), alpha: 0.8, size: 0.004 + Math.random() * 0.004, life: 0.5,
          });
        }
      }
    }
    this.sparks.update(dt);
    this.drips.update(dt);
    this.spray.update(dt);
    this.smoke.update(dt);
    this.glow.update(dt);
    this.bubbles.update(dt);
    this.dust.update(dt);
    while (this.dust.p.length < 160) this._spawnDust(false);
    this._updateHeat(t);
  }
}
