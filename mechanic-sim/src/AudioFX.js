// AudioFX.js — fully procedural, spatialised mechanic sound design on the Web Audio API.
// No sample files: every sound is synthesised (metal partials, filtered noise, pulse trains),
// routed through HRTF panners positioned in world space plus a shared garage reverb.
import * as THREE from 'three';

const _fwd = new THREE.Vector3();
const _up = new THREE.Vector3();
const _pos = new THREE.Vector3();

export class AudioFX {
  constructor() {
    this.ctx = null;
    this.engines = new Set();
    this.loops = new Map();
    this.muted = false;
    this.volume = 0.9;
  }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    this.master.connect(comp).connect(ctx.destination);

    // garage reverb: concrete + block walls -> fairly bright, ~1.6s
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(1.7, 2.6);
    this.reverbIn = ctx.createGain();
    this.reverbIn.gain.value = 0.5;
    const wet = ctx.createGain(); wet.gain.value = 0.32;
    this.reverbIn.connect(this.reverb).connect(wet).connect(this.master);

    this.noise = this._noiseBuffer(2.5);
    this.brown = this._brownBuffer(4);
    this._ambience();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : v, this.ctx.currentTime, 0.05);
  }

  toggleMute() { this.muted = !this.muted; this.setVolume(this.volume); return this.muted; }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  updateListener(camera) {
    if (!this.ctx) return;
    const L = this.ctx.listener;
    camera.getWorldPosition(_pos);
    camera.getWorldDirection(_fwd);
    _up.set(0, 1, 0).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
    const t = this.ctx.currentTime;
    if (L.positionX) {
      L.positionX.setTargetAtTime(_pos.x, t, 0.02); L.positionY.setTargetAtTime(_pos.y, t, 0.02); L.positionZ.setTargetAtTime(_pos.z, t, 0.02);
      L.forwardX.setTargetAtTime(_fwd.x, t, 0.02); L.forwardY.setTargetAtTime(_fwd.y, t, 0.02); L.forwardZ.setTargetAtTime(_fwd.z, t, 0.02);
      L.upX.setTargetAtTime(_up.x, t, 0.02); L.upY.setTargetAtTime(_up.y, t, 0.02); L.upZ.setTargetAtTime(_up.z, t, 0.02);
    } else {
      L.setPosition(_pos.x, _pos.y, _pos.z);
      L.setOrientation(_fwd.x, _fwd.y, _fwd.z, _up.x, _up.y, _up.z);
    }
  }

  // ------------------------------------------------------------------ routing helpers

  /** Returns a gain node feeding a positional panner (or the dry bus) + reverb send. */
  _bus(position, volume = 1, reverb = 0.35) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = volume;
    let out = g;
    if (position) {
      const p = ctx.createPanner();
      p.panningModel = 'HRTF'; p.distanceModel = 'inverse';
      p.refDistance = 0.8; p.maxDistance = 40; p.rolloffFactor = 1.1;
      if (p.positionX) { p.positionX.value = position.x; p.positionY.value = position.y; p.positionZ.value = position.z; }
      else p.setPosition(position.x, position.y, position.z);
      g.connect(p); out = p;
    }
    out.connect(this.master);
    if (reverb > 0) {
      const s = ctx.createGain(); s.gain.value = reverb;
      out.connect(s).connect(this.reverbIn);
    }
    return g;
  }

  _noiseBuffer(sec) {
    const ctx = this.ctx;
    const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  _brownBuffer(sec) {
    const ctx = this.ctx;
    const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    return b;
  }

  _impulse(sec, decay) {
    const ctx = this.ctx;
    const len = ctx.sampleRate * sec;
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const early = i < ctx.sampleRate * 0.03 && Math.random() < 0.004 ? 2 : 1;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * early;
      }
    }
    return b;
  }

  _noiseSrc(buf = this.noise, loop = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf; s.loop = loop;
    if (!loop) s.playbackRate.value = 0.9 + Math.random() * 0.2;
    return s;
  }

  /** Short filtered-noise transient. */
  _burst(dest, t, { type = 'bandpass', freq = 3000, q = 4, dur = 0.03, vol = 0.6, attack = 0.001 } = {}) {
    const ctx = this.ctx;
    const src = this._noiseSrc();
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }

  /** Inharmonic metal ring (struck steel). */
  _metal(dest, t, { freq = 1800, decay = 0.25, vol = 0.25, ratios = [1, 2.76, 5.4, 8.93] } = {}) {
    const ctx = this.ctx;
    ratios.forEach((r, i) => {
      if (freq * r > 18000) return;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * r * (1 + (Math.random() - 0.5) * 0.01);
      const g = ctx.createGain();
      const v = vol / (i + 1.2);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay / (1 + i * 0.6));
      o.connect(g).connect(dest);
      o.start(t); o.stop(t + decay + 0.05);
    });
  }

  _thump(dest, t, { freq = 90, dur = 0.15, vol = 0.6 } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(freq * 1.8, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + dur * 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // ------------------------------------------------------------------ public one-shots

  play(name, opts = {}) {
    if (!this.ctx || this.ctx.state === 'closed') return;
    const fn = this['_s_' + name];
    if (fn) fn.call(this, opts.position || null, opts);
  }

  _s_ui(p, o) { const d = this._bus(null, 0.25, 0); this._burst(d, this.now, { freq: 4200, q: 6, dur: 0.025, vol: 0.5 }); }

  _s_hover(p, o) { const d = this._bus(null, 0.06, 0); this._metal(d, this.now, { freq: 2600, decay: 0.06, vol: 0.3, ratios: [1, 2] }); }

  _s_error(p, o) {
    const ctx = this.ctx, t = this.now, d = this._bus(null, 0.22, 0);
    [0, 0.12].forEach((dt) => {
      const osc = ctx.createOscillator(); osc.type = 'square'; osc.frequency.value = 180;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.25, t + dt); g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.1);
      osc.connect(g).connect(d); osc.start(t + dt); osc.stop(t + dt + 0.12);
    });
  }

  _s_cash(p, o) {
    const t = this.now, d = this._bus(null, 0.5, 0.2);
    this._metal(d, t, { freq: 2100, decay: 0.5, vol: 0.3, ratios: [1, 1.5, 3.01] });
    this._metal(d, t + 0.09, { freq: 2800, decay: 0.9, vol: 0.35, ratios: [1, 2.01, 3.0] });
    this._burst(d, t, { freq: 1500, q: 1, dur: 0.12, vol: 0.4 });
  }

  _s_beep(p, o) {
    const ctx = this.ctx, t = this.now, d = this._bus(p, 0.25, 0.1);
    const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = o.freq || 1320;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.0001, t + (o.dur || 0.12));
    osc.connect(g).connect(d); osc.start(t); osc.stop(t + 0.2);
  }

  /** Ratchet pawl clicks: n clicks spread across `dur` seconds. */
  _s_ratchet(p, o) {
    const n = o.clicks || 6, dur = o.dur || 0.35, t0 = this.now, d = this._bus(p, 0.8);
    for (let i = 0; i < n; i++) {
      const t = t0 + (i / n) * dur + Math.random() * 0.006;
      this._burst(d, t, { freq: 5200 + Math.random() * 800, q: 9, dur: 0.012, vol: 0.55 });
      this._metal(d, t, { freq: 3900, decay: 0.035, vol: 0.12, ratios: [1, 1.7] });
    }
  }

  _s_socketSnap(p, o) {
    const t = this.now, d = this._bus(p, 0.9);
    this._metal(d, t, { freq: 1450 + Math.random() * 200, decay: 0.32, vol: 0.32 });
    this._burst(d, t, { freq: 2600, q: 2, dur: 0.02, vol: 0.5 });
  }

  /** Breaking a stuck fastener loose: stressed creak followed by a crack. */
  _s_creak(p, o) {
    const ctx = this.ctx, t = this.now, dur = o.dur || 0.6, d = this._bus(p, 0.8);
    const src = this._noiseSrc();
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 18;
    f.frequency.setValueAtTime(380, t); f.frequency.linearRampToValueAtTime(900, t + dur);
    const am = ctx.createGain(); am.gain.value = 0;
    const lfo = ctx.createOscillator(); lfo.type = 'sawtooth'; lfo.frequency.setValueAtTime(35, t); lfo.frequency.linearRampToValueAtTime(70, t + dur);
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.7;
    lfo.connect(lfoG).connect(am.gain);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1.3, t + dur * 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(am).connect(g).connect(d);
    src.start(t); src.stop(t + dur + 0.1); lfo.start(t); lfo.stop(t + dur + 0.1);
    this._metal(d, t + dur, { freq: 900, decay: 0.25, vol: 0.35 });
    this._burst(d, t + dur, { type: 'highpass', freq: 1800, q: 0.7, dur: 0.05, vol: 0.8 });
  }

  /** Threading: soft rhythmic metal-on-metal rasp. */
  _s_thread(p, o) {
    const n = o.turns || 6, dur = o.dur || 0.8, t0 = this.now, d = this._bus(p, 0.5);
    for (let i = 0; i < n; i++) this._burst(d, t0 + (i / n) * dur, { freq: 3200 + Math.random() * 1500, q: 3, dur: 0.06, vol: 0.2, attack: 0.02 });
  }

  /** Pneumatic impact wrench: motor whine + hammer train, ending in the "clack". */
  _s_impact(p, o) {
    const ctx = this.ctx, t = this.now, dur = o.dur || 0.9, d = this._bus(p, 0.9, 0.45);
    const motor = ctx.createOscillator(); motor.type = 'sawtooth';
    motor.frequency.setValueAtTime(140, t); motor.frequency.exponentialRampToValueAtTime(o.loosen ? 260 : 210, t + 0.15);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1600;
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(0.0001, t); mg.gain.exponentialRampToValueAtTime(0.18, t + 0.05);
    mg.gain.setValueAtTime(0.18, t + dur - 0.05); mg.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.12);
    motor.connect(lp).connect(mg).connect(d);
    motor.start(t); motor.stop(t + dur + 0.2);
    // air exhaust hiss
    const air = this._noiseSrc(); const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3500;
    const ag = ctx.createGain(); ag.gain.setValueAtTime(0.0001, t); ag.gain.exponentialRampToValueAtTime(0.2, t + 0.05); ag.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.3);
    air.connect(hp).connect(ag).connect(d); air.start(t); air.stop(t + dur + 0.4);
    // hammer blows: the "brrrrt"
    const rate = o.loosen ? 22 : 18;
    for (let tt = t + 0.03; tt < t + dur; tt += 1 / rate) {
      this._burst(d, tt, { freq: 2300 + Math.random() * 500, q: 3, dur: 0.025, vol: 0.55 });
      this._thump(d, tt, { freq: 120, dur: 0.035, vol: 0.25 });
    }
    // final clack
    this._metal(d, t + dur, { freq: 1200, decay: 0.2, vol: 0.4 });
    this._burst(d, t + dur, { freq: 3000, q: 1.5, dur: 0.04, vol: 0.7 });
  }

  _s_torqueClick(p, o) {
    const t = this.now, d = this._bus(p, 1);
    this._burst(d, t, { freq: 2600, q: 2, dur: 0.03, vol: 0.9 });
    this._metal(d, t, { freq: 1700, decay: 0.12, vol: 0.3 });
    this._thump(d, t, { freq: 160, dur: 0.05, vol: 0.3 });
  }

  _s_screw(p, o) {
    const n = o.turns || 5, t0 = this.now, d = this._bus(p, 0.6);
    for (let i = 0; i < n; i++) this._burst(d, t0 + i * ((o.dur || 0.8) / n), { freq: 1800, q: 5, dur: 0.08, vol: 0.25, attack: 0.03 });
  }

  _s_clank(p, o) {
    const t = this.now, d = this._bus(p, o.volume || 0.8);
    this._metal(d, t, { freq: o.freq || 620, decay: 0.45, vol: 0.4 });
    this._thump(d, t, { freq: 110, dur: 0.12, vol: 0.5 });
    this._burst(d, t, { freq: 1800, q: 1, dur: 0.05, vol: 0.5 });
  }

  _s_drop(p, o) {
    const t = this.now, d = this._bus(p, 0.7);
    this._metal(d, t, { freq: 2400 + Math.random() * 800, decay: 0.18, vol: 0.3 });
    this._metal(d, t + 0.09, { freq: 2600 + Math.random() * 800, decay: 0.1, vol: 0.14 });
  }

  _s_rubber(p, o) {
    const t = this.now, d = this._bus(p, 0.7);
    this._thump(d, t, { freq: 70, dur: 0.2, vol: 0.7 });
    this._burst(d, t, { type: 'lowpass', freq: 500, q: 1, dur: 0.12, vol: 0.5 });
  }

  _s_drawer(p, o) {
    const ctx = this.ctx, t = this.now, d = this._bus(p, 0.6);
    const src = this._noiseSrc();
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = o.open ? 1400 : 1100; f.Q.value = 2;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    src.connect(f).connect(g).connect(d); src.start(t); src.stop(t + 0.4);
    this._metal(d, t + 0.3, { freq: 900, decay: 0.15, vol: 0.25 });
    this._thump(d, t + 0.3, { freq: 140, dur: 0.06, vol: 0.3 });
  }

  _s_hood(p, o) {
    const t = this.now, d = this._bus(p, 0.8);
    if (o.open) {
      this._burst(d, t, { freq: 900, q: 6, dur: 0.25, vol: 0.2, attack: 0.05 });
      this._metal(d, t, { freq: 700, decay: 0.2, vol: 0.2 });
    } else {
      this._thump(d, t, { freq: 80, dur: 0.25, vol: 0.9 });
      this._metal(d, t, { freq: 520, decay: 0.35, vol: 0.3 });
    }
  }

  _s_spark(p, o) {
    const t = this.now, d = this._bus(p, 0.5);
    for (let i = 0; i < 8; i++) this._burst(d, t + Math.random() * 0.25, { type: 'highpass', freq: 6000, q: 1, dur: 0.01, vol: 0.5 });
  }

  _s_ouch(p, o) {
    const ctx = this.ctx, t = this.now, d = this._bus(null, 0.4, 0.1);
    this._burst(d, t, { type: 'highpass', freq: 4000, q: 0.5, dur: 0.5, vol: 0.4, attack: 0.01 });
    const osc = ctx.createOscillator(); osc.type = 'triangle';
    osc.frequency.setValueAtTime(330, t); osc.frequency.exponentialRampToValueAtTime(180, t + 0.3);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    osc.connect(g).connect(d); osc.start(t); osc.stop(t + 0.4);
  }

  /** Fluid draining / pouring gurgle. */
  _s_slosh(p, o) {
    const ctx = this.ctx, t = this.now, dur = o.dur || 2.5, d = this._bus(p, 0.7);
    const src = this._noiseSrc(this.noise, true);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 7;
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = o.pour ? 9 : 6;
    const lg = ctx.createGain(); lg.gain.value = 260;
    f.frequency.value = o.pour ? 700 : 450;
    lfo.connect(lg).connect(f.frequency);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.2);
    g.gain.setValueAtTime(0.5, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(d);
    src.start(t); src.stop(t + dur + 0.1); lfo.start(t); lfo.stop(t + dur + 0.1);
    for (let k = 0; k < dur * 6; k++) {
      const tt = t + Math.random() * dur;
      const osc = ctx.createOscillator(); osc.type = 'sine';
      osc.frequency.setValueAtTime(300 + Math.random() * 400, tt); osc.frequency.exponentialRampToValueAtTime(900 + Math.random() * 600, tt + 0.05);
      const bg = ctx.createGain(); bg.gain.setValueAtTime(0.08, tt); bg.gain.exponentialRampToValueAtTime(0.0001, tt + 0.07);
      osc.connect(bg).connect(d); osc.start(tt); osc.stop(tt + 0.08);
    }
  }

  /** Pressurised coolant / steam spray. */
  _s_spray(p, o) {
    const ctx = this.ctx, t = this.now, dur = o.dur || 1.6, d = this._bus(p, 0.9);
    const src = this._noiseSrc(this.noise, true);
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1800;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(d); src.start(t); src.stop(t + dur + 0.1);
    this._thump(d, t, { freq: 60, dur: 0.2, vol: 0.6 });
  }

  _s_hiss(p, o) {
    const ctx = this.ctx, t = this.now, dur = o.dur || 0.6, d = this._bus(p, 0.4);
    const src = this._noiseSrc(); const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3000;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(d); src.start(t); src.stop(t + dur);
  }

  _s_backfire(p, o) {
    const ctx = this.ctx, t = this.now, d = this._bus(p, 1.2, 0.6);
    const src = this._noiseSrc();
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(3000, t); f.frequency.exponentialRampToValueAtTime(200, t + 0.25);
    const ws = ctx.createWaveShaper(); ws.curve = this._distCurve(30);
    const g = ctx.createGain(); g.gain.setValueAtTime(1.2, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    src.connect(f).connect(ws).connect(g).connect(d); src.start(t); src.stop(t + 0.4);
    this._thump(d, t, { freq: 55, dur: 0.3, vol: 1 });
  }

  _s_rollIn(p, o) {
    const ctx = this.ctx, t = this.now, dur = o.dur || 4, d = this._bus(p, 0.5);
    const src = this._noiseSrc(this.brown, true);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.6, t + 0.6); g.gain.setValueAtTime(0.6, t + dur - 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(d); src.start(t); src.stop(t + dur + 0.1);
  }

  _s_scan(p, o) {
    const t = this.now;
    for (let i = 0; i < 6; i++) this._s_beepAt(t + i * 0.13, 900 + i * 180);
  }

  _s_beepAt(t, freq) {
    const ctx = this.ctx, d = this._bus(null, 0.15, 0.05);
    const osc = ctx.createOscillator(); osc.type = 'square'; osc.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.15, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    osc.connect(g).connect(d); osc.start(t); osc.stop(t + 0.1);
  }

  _s_brush(p, o) {
    const t = this.now, dur = o.dur || 2, d = this._bus(p, 0.4);
    for (let tt = 0; tt < dur; tt += 0.18) this._burst(d, t + tt, { type: 'bandpass', freq: 5000, q: 1, dur: 0.12, vol: 0.3, attack: 0.04 });
  }

  _distCurve(k) {
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; c[i] = ((1 + k) * x) / (1 + k * Math.abs(x)); }
    return c;
  }

  // ------------------------------------------------------------------ loops

  /** Named looped sound (lift motor, ultrasonic tank, balancer spin, compressor). Returns stop fn. */
  loop(name, position, opts = {}) {
    if (!this.ctx) return () => {};
    this.stopLoop(name);
    const ctx = this.ctx, t = this.now, d = this._bus(position, opts.volume || 0.5);
    const nodes = [];
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + 0.25);
    g.connect(d);
    if (name === 'lift') {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 95;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
      const og = ctx.createGain(); og.gain.value = 0.25;
      o.connect(f).connect(og).connect(g); o.start(); nodes.push(o);
      const n = this._noiseSrc(this.noise, true); const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 2400; nf.Q.value = 2;
      const ng = ctx.createGain(); ng.gain.value = 0.15; n.connect(nf).connect(ng).connect(g); n.start(); nodes.push(n);
    } else if (name === 'ultrasonic') {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 7800;
      const og = ctx.createGain(); og.gain.value = 0.05; o.connect(og).connect(g); o.start(); nodes.push(o);
      const n = this._noiseSrc(this.noise, true); const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 900; nf.Q.value = 1.5;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 13; const lg = ctx.createGain(); lg.gain.value = 0.2;
      const ng = ctx.createGain(); ng.gain.value = 0.25; lfo.connect(lg).connect(ng.gain);
      n.connect(nf).connect(ng).connect(g); n.start(); lfo.start(); nodes.push(n, lfo);
    } else if (name === 'balancer') {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(40, t); o.frequency.exponentialRampToValueAtTime(220, t + 1.5);
      const og = ctx.createGain(); og.gain.value = 0.3; o.connect(og).connect(g); o.start(); nodes.push(o);
      const n = this._noiseSrc(this.noise, true); const nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 800;
      const ng = ctx.createGain(); ng.gain.value = 0.2; n.connect(nf).connect(ng).connect(g); n.start(); nodes.push(n);
    } else if (name === 'grind') {
      const n = this._noiseSrc(this.noise, true); const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 3200; nf.Q.value = 3;
      const ng = ctx.createGain(); ng.gain.value = 0.4; n.connect(nf).connect(ng).connect(g); n.start(); nodes.push(n);
    }
    const stop = () => {
      const tt = ctx.currentTime;
      g.gain.cancelScheduledValues(tt);
      g.gain.setValueAtTime(g.gain.value || 0.0001, tt);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.3);
      nodes.forEach((n) => { try { n.stop(tt + 0.35); } catch (e) { /* already stopped */ } });
      this.loops.delete(name);
    };
    this.loops.set(name, stop);
    return stop;
  }

  stopLoop(name) { const s = this.loops.get(name); if (s) s(); }

  _ambience() {
    const ctx = this.ctx;
    const d = this._bus(null, 0.05, 0.1);
    // fluorescent ballast hum (120 Hz + harmonics)
    [120, 240, 360].forEach((f, i) => {
      const o = ctx.createOscillator(); o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = 0.25 / (i + 1);
      o.connect(g).connect(d); o.start();
    });
    // distant street rumble
    const n = this._noiseSrc(this.brown, true);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 180;
    const g = ctx.createGain(); g.gain.value = 0.6;
    n.connect(f).connect(g).connect(d); n.start();
  }

  // ------------------------------------------------------------------ engine

  /**
   * Synthesised engine voice. spec: { cylinders, idle, redline, character: 'v8'|'v6turbo'|'single'|'twin'|'i6' }
   * Returns a controller with setRPM / setMisfire / stop.
   */
  engine(spec, position) {
    if (!this.ctx) return null;
    const ctx = this.ctx;
    const d = this._bus(position, 0.75, 0.4);
    const out = ctx.createGain(); out.gain.value = 0;
    const shaper = ctx.createWaveShaper(); shaper.curve = this._distCurve(spec.character === 'v8' ? 8 : 4);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 3;
    shaper.connect(lp).connect(out).connect(d);

    const fire = ctx.createOscillator(); fire.type = 'sawtooth';
    const sub = ctx.createOscillator(); sub.type = 'square';
    const subG = ctx.createGain(); subG.gain.value = spec.character === 'v8' ? 0.55 : 0.3;
    const fireG = ctx.createGain(); fireG.gain.value = 0.6;
    fire.connect(fireG).connect(shaper);
    sub.connect(subG).connect(shaper);

    const intake = this._noiseSrc(this.noise, true);
    const inF = ctx.createBiquadFilter(); inF.type = 'bandpass'; inF.Q.value = 1.2;
    const inG = ctx.createGain(); inG.gain.value = 0.12;
    intake.connect(inF).connect(inG).connect(out);

    let whine = null, whineG = null;
    if (spec.character === 'v6turbo') {
      whine = ctx.createOscillator(); whine.type = 'sine';
      whineG = ctx.createGain(); whineG.gain.value = 0;
      whine.connect(whineG).connect(d);
      whine.start();
    }
    fire.start(); sub.start(); intake.start();

    const ctl = {
      rpm: spec.idle, misfire: 0, dead: false,
      setRPM: (rpm, glide = 0.12) => {
        ctl.rpm = rpm;
        const t = ctx.currentTime;
        const f = (rpm / 60) * (spec.cylinders / 2);
        fire.frequency.setTargetAtTime(f, t, glide);
        sub.frequency.setTargetAtTime(f / 2, t, glide);
        lp.frequency.setTargetAtTime(300 + rpm * 0.55, t, glide);
        inF.frequency.setTargetAtTime(600 + rpm * 0.4, t, glide);
        inG.gain.setTargetAtTime(0.08 + (rpm / spec.redline) * 0.25, t, glide);
        if (whine) {
          whine.frequency.setTargetAtTime(2000 + rpm * 2.2, t, glide * 3);
          whineG.gain.setTargetAtTime(Math.max(0, (rpm - 2500) / spec.redline) * 0.05 * (ctl.boostOk ? 1 : 0.15), t, glide * 3);
        }
      },
      setMisfire: (amount) => { ctl.misfire = amount; },
      boostOk: true,
      start: () => {
        const t = ctx.currentTime;
        out.gain.setValueAtTime(0.0001, t);
        out.gain.exponentialRampToValueAtTime(0.55, t + 0.25);
        ctl.setRPM(spec.idle * 1.8, 0.08);
        setTimeout(() => ctl.setRPM(spec.idle, 0.4), 450);
      },
      stop: () => {
        if (ctl.dead) return;
        ctl.dead = true;
        const t = ctx.currentTime;
        ctl.setRPM(spec.idle * 0.4, 0.3);
        out.gain.setTargetAtTime(0.0001, t, 0.25);
        if (whineG) whineG.gain.setTargetAtTime(0, t, 0.1);
        [fire, sub, intake, whine].forEach((n) => n && n.stop(t + 1.5));
        this.engines.delete(ctl);
      },
      _out: out,
    };
    ctl.setRPM(spec.idle, 0.01);
    this.engines.add(ctl);
    return ctl;
  }

  /** Starter motor cranking (chug-chug-chug). */
  crank(position, dur = 1.1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.now, d = this._bus(position, 0.8);
    const whine = ctx.createOscillator(); whine.type = 'sawtooth'; whine.frequency.setValueAtTime(380, t); whine.frequency.linearRampToValueAtTime(520, t + dur);
    const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 900; wf.Q.value = 2;
    const wg = ctx.createGain(); wg.gain.value = 0.08;
    whine.connect(wf).connect(wg).connect(d); whine.start(t); whine.stop(t + dur);
    const n = this._noiseSrc(this.brown, true);
    const nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 400;
    const ng = ctx.createGain(); ng.gain.value = 0;
    n.connect(nf).connect(ng).connect(d); n.start(t); n.stop(t + dur);
    for (let tt = 0; tt < dur; tt += 0.16) {
      ng.gain.setValueAtTime(1.6, t + tt);
      ng.gain.exponentialRampToValueAtTime(0.05, t + tt + 0.13);
      this._thump(d, t + tt, { freq: 75, dur: 0.1, vol: 0.4 });
    }
  }

  /** Called every frame: misfire stutter modulation for running engines. */
  update(dt) {
    if (!this.ctx) return;
    for (const e of this.engines) {
      if (e.misfire > 0 && Math.random() < e.misfire * dt * 9) {
        const t = this.ctx.currentTime;
        e._out.gain.cancelScheduledValues(t);
        e._out.gain.setValueAtTime(0.12, t);
        e._out.gain.linearRampToValueAtTime(0.55, t + 0.09);
      }
    }
  }
}
