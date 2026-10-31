// ArmRig.js — procedural first-person arms: sleeve, forearm, gloved hand with 3-joint fingers,
// analytic two-bone IK in camera space, pole vectors, finger grip poses and anchor following.
import * as THREE from 'three';
import { capsule, rbox, cyl, sphere } from './Kit.js';

const Y = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _s = new THREE.Vector3();

export const POSES = {
  relaxed: [0.25, 0.25, 0.32, 0.38, 0.45],
  open:    [0.05, 0.04, 0.04, 0.05, 0.06],
  grip:    [0.75, 0.82, 0.88, 0.9, 0.9],
  pinch:   [0.62, 0.6, 0.25, 0.35, 0.45],
  point:   [0.6, 0.02, 0.9, 0.92, 0.92],
  cup:     [0.45, 0.48, 0.52, 0.55, 0.6],
  fist:    [0.9, 1.0, 1.0, 1.0, 1.0],
};

const L1 = 0.3;   // upper arm
const L2 = 0.28;  // forearm

export class ArmRig {
  constructor(camera) {
    this.camera = camera;
    this.root = new THREE.Group();
    this.root.name = 'arms';
    camera.add(this.root);
    this.gloveMat = new THREE.MeshPhysicalMaterial({ color: 0x1b1d22, roughness: 0.42, metalness: 0.0, sheen: 0.6, sheenColor: new THREE.Color(0x4a5a7a), sheenRoughness: 0.4, clearcoat: 0.25, clearcoatRoughness: 0.4 });
    this.skinMat = new THREE.MeshPhysicalMaterial({ color: 0xc58b6b, roughness: 0.55, sheen: 0.35, sheenColor: new THREE.Color(0xff9a7a), sheenRoughness: 0.6 });
    this.sleeveMat = new THREE.MeshStandardMaterial({ color: 0x24324a, roughness: 0.92 });
    this.grease = 0;
    this.spread = 1;
    this.arms = {
      R: this._buildArm(1),
      L: this._buildArm(-1),
    };
    this.time = 0;
    this.bob = 0;
  }

  /** Pulls the resting hands inward on narrow / portrait screens so they stay in frame. */
  setAspect(aspect) {
    this.spread = THREE.MathUtils.clamp(aspect / 1.6, 0.5, 1);
  }

  _buildArm(side) {
    const arm = {
      side,
      shoulder: new THREE.Vector3(side * 0.24, -0.33, 0.12),
      pole: new THREE.Vector3(side * 0.9, -1.0, 0.35),
      upper: new THREE.Group(),
      fore: new THREE.Group(),
      hand: new THREE.Group(),
      handInner: new THREE.Group(),
      fingers: [],
      pos: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
      goalPos: new THREE.Vector3(),
      goalQuat: new THREE.Quaternion(),
      mode: 'rest',
      anchor: null,
      stiffness: 10,
      curl: POSES.relaxed.slice(),
      curlGoal: POSES.relaxed.slice(),
      restOffset: new THREE.Vector3(),
      visible: true,
    };
    this.root.add(arm.upper, arm.fore, arm.hand);
    // upper arm: rolled work shirt sleeve
    const up = capsule(arm.upper, 0.048, L1 - 0.04, this.sleeveMat, [0, L1 / 2, 0], null, { cast: false });
    up.scale.set(1, 1, 0.92);
    // forearm: skin + rolled cuff near the elbow
    const fa = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.039, L2 - 0.02, 14), this.skinMat);
    fa.position.y = L2 / 2;
    arm.fore.add(fa);
    cyl(arm.fore, 0.05, 0.05, 0.07, 16, this.sleeveMat, [0, 0.045, 0], null, { cast: false });
    // glove cuff
    cyl(arm.fore, 0.035, 0.033, 0.06, 16, this.gloveMat, [0, L2 - 0.03, 0], null, { cast: false });
    sphere(arm.fore, 0.038, this.skinMat, [0, 0, 0], { cast: false });

    // hand: origin at wrist, fingers along +Y, back of hand +Z, palm -Z
    arm.hand.add(arm.handInner);
    if (side < 0) arm.handInner.scale.x = -1; // mirror geometry for the left hand
    const H = arm.handInner;
    const palm = rbox(H, 0.082, 0.092, 0.03, 0.012, this.gloveMat, [0, 0.05, 0], null, { cast: false });
    palm.scale.set(1, 1, 1);
    // knuckle ridge
    rbox(H, 0.08, 0.02, 0.026, 0.009, this.gloveMat, [0, 0.093, 0.004], null, { cast: false });
    const fingerX = [-0.029, -0.0095, 0.0095, 0.028];
    const fingerLen = [[0.045, 0.028, 0.022], [0.05, 0.031, 0.024], [0.047, 0.03, 0.023], [0.037, 0.024, 0.019]];
    // thumb
    const thumb = new THREE.Group();
    thumb.position.set(-0.036, 0.022, -0.008);
    thumb.rotation.set(-0.5, -0.5, 0.75);
    H.add(thumb);
    arm.fingers.push(this._finger(thumb, [0.038, 0.03, 0.024], 0.0105, true));
    for (let i = 0; i < 4; i++) {
      const base = new THREE.Group();
      base.position.set(fingerX[i], 0.098, 0);
      base.rotation.z = (i - 1.5) * -0.05;
      H.add(base);
      arm.fingers.push(this._finger(base, fingerLen[i], 0.0088 - i * 0.0004, false));
    }
    // grip socket: where a handle sits when the fist closes (handle axis along hand X)
    arm.gripSocket = new THREE.Object3D();
    arm.gripSocket.position.set(0, 0.075, -0.034);
    arm.hand.add(arm.gripSocket);
    // pinch point between thumb & index tips
    arm.pinchPoint = new THREE.Object3D();
    arm.pinchPoint.position.set(side * -0.02, 0.14, -0.03);
    arm.hand.add(arm.pinchPoint);
    arm.hand.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.renderOrder = 1; } });
    arm.upper.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    arm.fore.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this._restGoal(arm);
    arm.pos.copy(arm.goalPos);
    arm.quat.copy(arm.goalQuat);
    return arm;
  }

  _finger(parent, lens, r, isThumb) {
    const joints = [];
    let p = parent;
    for (let j = 0; j < 3; j++) {
      const g = new THREE.Group();
      if (j > 0) g.position.y = lens[j - 1];
      p.add(g);
      capsule(g, r * (1 - j * 0.08), lens[j] - r, this.gloveMat, [0, lens[j] / 2, 0], null, { cast: false });
      joints.push(g);
      p = g;
    }
    return { joints, isThumb };
  }

  _restGoal(arm) {
    const s = arm.side;
    arm.goalPos.set(s * 0.21 * this.spread, -0.27, -0.4).add(arm.restOffset);
    // fingers forward/up slightly, back of hand up & outward
    const yAxis = _a.set(-s * 0.15, 0.25, -1).normalize();
    const zAxis = _b.set(s * 0.25, 1, 0.2).normalize();
    zAxis.sub(_c.copy(yAxis).multiplyScalar(zAxis.dot(yAxis))).normalize();
    const xAxis = _c.crossVectors(yAxis, zAxis).normalize();
    _m.makeBasis(xAxis, yAxis, zAxis);
    arm.goalQuat.setFromRotationMatrix(_m);
  }

  // ---------------------------------------------------------------- public API

  /** Returns arm to its resting pose at the bottom of the view. */
  rest(side, pose = 'relaxed') {
    const arm = this.arms[side];
    arm.mode = 'rest';
    arm.anchor = null;
    arm.stiffness = 8;
    this.setPose(side, pose);
  }

  /**
   * Hand follows an anchor Object3D every frame. `socket` selects which point of the hand
   * coincides with the anchor: 'grip' (handle in fist), 'pinch' (fingertips) or 'wrist'.
   */
  follow(side, anchor, { socket = 'grip', stiffness = 16, pose = 'grip' } = {}) {
    const arm = this.arms[side];
    arm.mode = 'follow';
    arm.anchor = anchor;
    arm.socket = socket;
    arm.stiffness = stiffness;
    this.setPose(side, pose);
  }

  setStiffness(side, k) { this.arms[side].stiffness = k; }

  setPose(side, pose) {
    const arm = this.arms[side];
    arm.curlGoal = (POSES[pose] || POSES.relaxed).slice();
  }

  setRestOffset(side, x, y, z) { this.arms[side].restOffset.set(x, y, z); }

  /** World-space matrix of a socket for an arm (used to snap tools into the fist). */
  socketObject(side, socket = 'grip') {
    const a = this.arms[side];
    return socket === 'pinch' ? a.pinchPoint : a.gripSocket;
  }

  setGrease(v) {
    this.grease = THREE.MathUtils.clamp(v, 0, 1);
    this.gloveMat.color.setRGB(0.105 - this.grease * 0.06, 0.113 - this.grease * 0.07, 0.133 - this.grease * 0.09);
    this.gloveMat.roughness = 0.42 - this.grease * 0.25;
  }

  // ---------------------------------------------------------------- per-frame
  update(dt) {
    this.time += dt;
    this.camera.updateMatrixWorld();
    const camInv = _m2.copy(this.camera.matrixWorld).invert();
    for (const side of ['R', 'L']) {
      const arm = this.arms[side];
      if (arm.mode === 'rest') {
        this._restGoal(arm);
        const sway = Math.sin(this.time * 1.3 + (side === 'R' ? 0 : 1.7)) * 0.006;
        arm.goalPos.y += sway + this.bob;
        arm.goalPos.x += Math.cos(this.time * 0.9 + (side === 'R' ? 0 : 2.1)) * 0.003;
      } else if (arm.mode === 'follow' && arm.anchor) {
        // hand matrix = anchorWorld * inverse(socketLocal)
        arm.anchor.updateMatrixWorld();
        const sock = arm.socket === 'pinch' ? arm.pinchPoint : arm.socket === 'wrist' ? null : arm.gripSocket;
        _m.copy(arm.anchor.matrixWorld);
        if (sock) {
          const local = new THREE.Matrix4().compose(sock.position, sock.quaternion, _s.set(1, 1, 1));
          _m.multiply(local.invert());
        }
        _m.premultiply(camInv);
        _m.decompose(arm.goalPos, arm.goalQuat, _s);
      }
      // critically-damped-ish smoothing toward goal
      const k = 1 - Math.exp(-arm.stiffness * dt);
      arm.pos.lerp(arm.goalPos, k);
      arm.quat.slerp(arm.goalQuat, k);
      // finger curls
      const fk = 1 - Math.exp(-14 * dt);
      for (let i = 0; i < 5; i++) arm.curl[i] += (arm.curlGoal[i] - arm.curl[i]) * fk;
      this._solve(arm);
      this._applyCurl(arm);
    }
  }

  _solve(arm) {
    const S = arm.shoulder;
    const T = arm.pos;
    const d = _a.subVectors(T, S);
    let dist = d.length();
    const dir = d.normalize();
    const reach = L1 + L2;
    let stretch = 1;
    if (dist > reach * 0.995) stretch = Math.min(dist / (reach * 0.995), 1.18);
    const l1 = L1 * stretch, l2 = L2 * stretch;
    dist = Math.min(dist, (l1 + l2) * 0.999);
    dist = Math.max(dist, Math.abs(l1 - l2) + 0.01);
    const cosA = THREE.MathUtils.clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1);
    const sinA = Math.sqrt(1 - cosA * cosA);
    const pole = _b.copy(arm.pole);
    pole.sub(_c.copy(dir).multiplyScalar(pole.dot(dir))).normalize();
    const E = new THREE.Vector3().copy(S).addScaledVector(dir, cosA * l1).addScaledVector(pole, sinA * l1);
    const W = new THREE.Vector3().copy(S).addScaledVector(dir, dist);

    arm.upper.position.copy(S);
    arm.upper.quaternion.setFromUnitVectors(Y, _c.subVectors(E, S).normalize());
    arm.upper.scale.set(1, stretch, 1);
    arm.fore.position.copy(E);
    arm.fore.quaternion.setFromUnitVectors(Y, _c.subVectors(W, E).normalize());
    arm.fore.scale.set(1, stretch, 1);
    arm.hand.position.copy(W);
    arm.hand.quaternion.copy(arm.quat);
  }

  _applyCurl(arm) {
    for (let f = 0; f < 5; f++) {
      const c = arm.curl[f];
      const fin = arm.fingers[f];
      if (fin.isThumb) {
        fin.joints[0].rotation.x = -0.35 * c;
        fin.joints[1].rotation.x = -0.7 * c;
        fin.joints[2].rotation.x = -0.8 * c;
      } else {
        fin.joints[0].rotation.x = -1.35 * c;
        fin.joints[1].rotation.x = -1.55 * c;
        fin.joints[2].rotation.x = -1.0 * c;
      }
    }
  }
}
