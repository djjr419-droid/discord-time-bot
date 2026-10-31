// Materials.js — PBR material library with a procedural wear/rust/grime/heat shader layer.
// Every part material is a MeshStandardMaterial / MeshPhysicalMaterial whose fragment shader is
// patched (onBeforeCompile) so a part's condition metrics drive its look without any textures.
import * as THREE from 'three';

const NOISE_GLSL = /* glsl */`
varying vec3 vObjPos;
uniform float uRust;
uniform float uDirt;
uniform float uHeat;
uniform float uWear;
uniform float uGrease;
uniform float uHighlight;
uniform float uGlow;
uniform float uPainted;
uniform float uNoiseScale;
float msHash(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float msNoise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(msHash(i+vec3(0,0,0)),msHash(i+vec3(1,0,0)),f.x),
                 mix(msHash(i+vec3(0,1,0)),msHash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(msHash(i+vec3(0,0,1)),msHash(i+vec3(1,0,1)),f.x),
                 mix(msHash(i+vec3(0,1,1)),msHash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float msFbm(vec3 p){ float a = 0.5, s = 0.0; for(int i=0;i<4;i++){ s += a*msNoise(p); p *= 2.03; a *= 0.5; } return s; }
`;

const COLOR_GLSL = /* glsl */`
#include <color_fragment>
vec3 wp = vObjPos * uNoiseScale;
float nA = msFbm(wp * 9.0);
float nB = msFbm(wp * 23.0 + 7.1);
float dirtMask = smoothstep(0.62 - uDirt*0.55, 0.72 - uDirt*0.5, nA) * min(uDirt*1.6, 1.0);
float greaseMask = smoothstep(0.66 - uGrease*0.45, 0.74 - uGrease*0.4, nB) * min(uGrease*1.5, 1.0);
float rustMask = smoothstep(0.8 - uRust*0.7, 0.88 - uRust*0.66, msFbm(wp*14.0 + 3.3)) * step(0.01, uRust);
float heatMask = uHeat * smoothstep(0.25, 0.75, msFbm(wp*4.0 + 11.0));
float scratch = uWear * smoothstep(0.80, 0.94, msNoise(vec3(wp.x*150.0, wp.y*5.0, wp.z*150.0)));
vec3 heatTint = mix(vec3(0.95,0.70,0.32), vec3(0.30,0.26,0.70), smoothstep(0.3,0.8,nB));
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*heatTint*1.35, heatMask*0.9);
vec3 bare = uPainted > 0.5 ? vec3(0.52,0.53,0.55) : diffuseColor.rgb*1.35 + 0.06;
diffuseColor.rgb = mix(diffuseColor.rgb, bare, scratch);
vec3 rustCol = mix(vec3(0.20,0.07,0.025), vec3(0.50,0.21,0.06), nB);
diffuseColor.rgb = mix(diffuseColor.rgb, rustCol, rustMask);
vec3 grime = mix(vec3(0.045,0.036,0.026), vec3(0.11,0.085,0.06), nB);
diffuseColor.rgb = mix(diffuseColor.rgb, grime, dirtMask * 0.92);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.025,0.02,0.015), greaseMask*0.9);
`;

const ROUGH_GLSL = /* glsl */`
#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.96, rustMask);
roughnessFactor = mix(roughnessFactor, 0.82, dirtMask);
roughnessFactor = mix(roughnessFactor, 0.22, greaseMask);
roughnessFactor = clamp(roughnessFactor + (nA - 0.5) * 0.12, 0.03, 1.0);
`;

const METAL_GLSL = /* glsl */`
#include <metalnessmap_fragment>
metalnessFactor = mix(metalnessFactor, 0.1, rustMask);
metalnessFactor = mix(metalnessFactor, 0.35, dirtMask);
metalnessFactor = mix(metalnessFactor, 0.9, scratch * uPainted);
`;

const EMISSIVE_GLSL = /* glsl */`
#include <emissivemap_fragment>
totalEmissiveRadiance += uHighlight * vec3(0.10, 0.42, 1.0);
totalEmissiveRadiance += uGlow * vec3(1.0, 0.22, 0.04) * (0.4 + heatMask) * 2.5;
`;

export const PRESETS = {
  steel:      { color: 0x8c9094, metalness: 0.85, roughness: 0.36 },
  darkSteel:  { color: 0x3c3f43, metalness: 0.8,  roughness: 0.45 },
  castIron:   { color: 0x46474a, metalness: 0.65, roughness: 0.78 },
  aluminum:   { color: 0xb9bdc3, metalness: 0.9,  roughness: 0.32 },
  billet:     { color: 0xd0d3d8, metalness: 1.0,  roughness: 0.18 },
  chrome:     { color: 0xeef0f3, metalness: 1.0,  roughness: 0.06 },
  zinc:       { color: 0xa9aeb2, metalness: 0.9,  roughness: 0.3 },
  goldZinc:   { color: 0xc7a648, metalness: 0.9,  roughness: 0.32 },
  brass:      { color: 0xc49a45, metalness: 1.0,  roughness: 0.28 },
  copper:     { color: 0xb8673e, metalness: 1.0,  roughness: 0.3 },
  blackPaint: { color: 0x141516, metalness: 0.25, roughness: 0.45, painted: true },
  redPaint:   { color: 0xa8121a, metalness: 0.2,  roughness: 0.32, painted: true },
  bluePaint:  { color: 0x1d4fa0, metalness: 0.2,  roughness: 0.32, painted: true },
  enginePaint:{ color: 0x2a2c30, metalness: 0.35, roughness: 0.5,  painted: true },
  rubber:     { color: 0x151515, metalness: 0.0,  roughness: 0.92 },
  hose:       { color: 0x1b1b1c, metalness: 0.0,  roughness: 0.7 },
  plastic:    { color: 0x232427, metalness: 0.0,  roughness: 0.55 },
  greyPlastic:{ color: 0x5b5e63, metalness: 0.0,  roughness: 0.6 },
  ceramic:    { color: 0xf1efe8, metalness: 0.0,  roughness: 0.25 },
  padFriction:{ color: 0x3a3532, metalness: 0.1,  roughness: 0.97 },
  filterBlue: { color: 0x1c3f9a, metalness: 0.3,  roughness: 0.4, painted: true },
  filterOrange:{color: 0xd2621d, metalness: 0.3,  roughness: 0.4, painted: true },
  paper:      { color: 0xd8c690, metalness: 0.0,  roughness: 0.95 },
  chain:      { color: 0x55585c, metalness: 0.9,  roughness: 0.42 },
  spring:     { color: 0xc8a020, metalness: 0.5,  roughness: 0.38, painted: true },
  leaf:       { color: 0x2b2c2e, metalness: 0.55, roughness: 0.6,  painted: true },
};

let cacheId = 0;

/** Creates a part material that reacts to condition uniforms. */
export function makeMat(preset = 'steel', overrides = {}) {
  const p = { ...(PRESETS[preset] || PRESETS.steel), ...overrides };
  const { painted, physical, noiseScale, ...params } = p;
  const Ctor = physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const mat = new Ctor(params);
  const u = {
    uRust: { value: 0 }, uDirt: { value: 0 }, uHeat: { value: 0 }, uWear: { value: 0 },
    uGrease: { value: 0 }, uHighlight: { value: 0 }, uGlow: { value: 0 },
    uPainted: { value: painted ? 1 : 0 }, uNoiseScale: { value: noiseScale || 1 },
  };
  mat.userData.u = u;
  mat.userData.preset = preset;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + NOISE_GLSL)
      .replace('#include <color_fragment>', COLOR_GLSL)
      .replace('#include <roughnessmap_fragment>', ROUGH_GLSL)
      .replace('#include <metalnessmap_fragment>', METAL_GLSL)
      .replace('#include <emissivemap_fragment>', EMISSIVE_GLSL);
  };
  mat.customProgramCacheKey = () => 'wear-v2-' + (physical ? 'p' : 's');
  mat.userData.cacheId = cacheId++;
  return mat;
}

/** Pushes a part's condition metrics into its material uniforms. */
export function applyCondition(mat, cond) {
  const u = mat.userData.u;
  if (!u) return;
  const isRubber = mat.userData.preset === 'rubber' || mat.userData.preset === 'hose';
  const isPlastic = /plastic|ceramic|paper/i.test(mat.userData.preset);
  u.uRust.value = isRubber || isPlastic ? 0 : cond.rust;
  u.uDirt.value = cond.isClean ? 0.04 : Math.min(1, 0.25 + cond.wearLevel * 0.55 + cond.grease * 0.2);
  u.uHeat.value = isRubber || isPlastic ? 0 : cond.heatDamage;
  u.uWear.value = cond.wearLevel * (isRubber ? 0.2 : 1);
  u.uGrease.value = cond.isClean ? 0 : cond.grease;
}

export function setHighlight(obj, v) {
  obj.traverse((o) => {
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) if (m.userData.u) m.userData.u.uHighlight.value = v;
  });
}

export function setGlow(obj, v) {
  obj.traverse((o) => {
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) if (m.userData.u) m.userData.u.uGlow.value = v;
  });
}

// ---------------------------------------------------------------- procedural canvas textures

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function rand(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function toTex(c, repeat = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Sealed concrete shop floor with expansion joints, tyre marks and oil stains. */
export function concreteTextures(tint = '#7d7f80', seed = 7) {
  const R = rand(seed);
  const S = 1024;
  const [c, g] = canvas(S, S);
  const [rc, rg] = canvas(S, S);
  g.fillStyle = tint; g.fillRect(0, 0, S, S);
  rg.fillStyle = '#5a5a5a'; rg.fillRect(0, 0, S, S);
  for (let i = 0; i < 26000; i++) {
    const x = R() * S, y = R() * S, r = R() * 2.2;
    const l = Math.floor(90 + R() * 70);
    g.fillStyle = `rgba(${l},${l},${l + 3},${0.08 + R() * 0.12})`;
    g.fillRect(x, y, r, r);
    rg.fillStyle = `rgba(${l},${l},${l},0.15)`;
    rg.fillRect(x, y, r, r);
  }
  for (let i = 0; i < 40; i++) {
    const x = R() * S, y = R() * S, r = 20 + R() * 90;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(20,16,10,${0.15 + R() * 0.25})`);
    grd.addColorStop(1, 'rgba(20,16,10,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    const grr = rg.createRadialGradient(x, y, 0, x, y, r);
    grr.addColorStop(0, 'rgba(25,25,25,0.6)'); grr.addColorStop(1, 'rgba(25,25,25,0)');
    rg.fillStyle = grr; rg.beginPath(); rg.arc(x, y, r, 0, Math.PI * 2); rg.fill();
  }
  g.strokeStyle = 'rgba(30,30,30,0.55)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, S / 2); g.lineTo(S, S / 2); g.moveTo(S / 2, 0); g.lineTo(S / 2, S); g.stroke();
  rg.strokeStyle = '#d0d0d0'; rg.lineWidth = 5;
  rg.beginPath(); rg.moveTo(0, S / 2); rg.lineTo(S, S / 2); rg.moveTo(S / 2, 0); rg.lineTo(S / 2, S); rg.stroke();
  g.lineWidth = 1;
  for (let i = 0; i < 14; i++) {
    let x = R() * S, y = R() * S;
    g.strokeStyle = `rgba(35,35,35,${0.2 + R() * 0.3})`;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 12; k++) { x += (R() - 0.5) * 40; y += (R() - 0.5) * 40; g.lineTo(x, y); }
    g.stroke();
  }
  return { map: toTex(c, 4), roughnessMap: toTex(rc, 4, false) };
}

export function checkerTexture() {
  const [c, g] = canvas(512, 512);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    g.fillStyle = (x + y) % 2 ? '#e8e8e6' : '#151515';
    g.fillRect(x * 64, y * 64, 64, 64);
  }
  const R = rand(3);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(80,70,60,${R() * 0.08})`;
    g.fillRect(R() * 512, R() * 512, 2, 2);
  }
  return toTex(c, 6);
}

/** Diamond tread plate bump map for the lift deck / workbench top. */
export function diamondPlateBump() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#fff';
  const drawDiamond = (x, y, ang) => {
    g.save(); g.translate(x, y); g.rotate(ang);
    g.beginPath(); g.ellipse(0, 0, 18, 4.5, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  };
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
    const ox = x * 64 + (y % 2) * 32, oy = y * 64;
    drawDiamond(ox, oy, (y % 2 ? 1 : -1) * Math.PI / 4);
  }
  const t = toTex(c, 6, false);
  return t;
}

export function painterlyWall(color = '#6e7378', seed = 11) {
  const R = rand(seed);
  const [c, g] = canvas(512, 512);
  g.fillStyle = color; g.fillRect(0, 0, 512, 512);
  // cinder-block mortar lines
  g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 3;
  for (let y = 0; y <= 512; y += 64) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke();
    for (let x = ((y / 64) % 2) * 64; x <= 512; x += 128) {
      g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 64); g.stroke();
    }
  }
  for (let i = 0; i < 14000; i++) {
    g.fillStyle = `rgba(${R() > 0.5 ? 255 : 0},${R() > 0.5 ? 255 : 0},${R() > 0.5 ? 255 : 0},0.025)`;
    g.fillRect(R() * 512, R() * 512, 2, 2);
  }
  // grime fade near the floor (bottom of the texture)
  const grd = g.createLinearGradient(0, 380, 0, 512);
  grd.addColorStop(0, 'rgba(20,18,15,0)'); grd.addColorStop(1, 'rgba(20,18,15,0.35)');
  g.fillStyle = grd; g.fillRect(0, 380, 512, 132);
  return toTex(c, 1);
}

export function pegboardTexture() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#b48a55'; g.fillRect(0, 0, 512, 512);
  g.fillStyle = '#3a2a18';
  for (let y = 16; y < 512; y += 32) for (let x = 16; x < 512; x += 32) {
    g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
  }
  return toTex(c, 2);
}

export function radialAlphaTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128, irregular = false, seed = 1) {
  const [c, g] = canvas(size, size);
  const R = rand(seed);
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, inner); grd.addColorStop(irregular ? 0.55 : 0.4, inner); grd.addColorStop(1, outer);
  g.fillStyle = grd;
  if (irregular) {
    for (let i = 0; i < 9; i++) {
      const x = size / 2 + (R() - 0.5) * size * 0.4, y = size / 2 + (R() - 0.5) * size * 0.4;
      const r = size * (0.18 + R() * 0.2);
      const gg = g.createRadialGradient(x, y, 0, x, y, r);
      gg.addColorStop(0, inner); gg.addColorStop(0.7, inner); gg.addColorStop(1, outer);
      g.fillStyle = gg; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  } else {
    g.fillRect(0, 0, size, size);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function tireTreadBump() {
  const [c, g] = canvas(64, 512);
  g.fillStyle = '#888'; g.fillRect(0, 0, 64, 512);
  g.fillStyle = '#111';
  for (let y = 0; y < 512; y += 16) {
    g.fillRect(4, y, 22, 6); g.fillRect(38, y + 8, 22, 6);
  }
  g.fillRect(29, 0, 6, 512);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Car body paint: clear-coated metallic. */
export function carPaint(color) {
  return new THREE.MeshPhysicalMaterial({
    color, metalness: 0.55, roughness: 0.32, clearcoat: 1.0, clearcoatRoughness: 0.06,
    envMapIntensity: 1.1,
  });
}

export function glassMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0x0b0f14, metalness: 0.1, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02,
    transparent: true, opacity: 0.82, envMapIntensity: 1.4,
  });
}

export function lightLensMaterial(color = 0xffffff, emissive = 0x000000, intensity = 0) {
  return new THREE.MeshPhysicalMaterial({
    color, emissive, emissiveIntensity: intensity, metalness: 0, roughness: 0.05,
    transmission: 0, transparent: true, opacity: 0.9, clearcoat: 1,
  });
}
