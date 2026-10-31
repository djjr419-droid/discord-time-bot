# Torque & Tread — 3D Mechanic Simulator

A stationary first-person mechanic sim for the browser: Three.js (PBR, GTAO, bloom, optional SSR),
GSAP for every animation, and a fully procedural Web Audio sound engine. All geometry, materials and
sounds are generated at runtime, so there are no model, texture or audio files to load.

## Run it

ES modules need an HTTP server, so opening `index.html` from disk won't work:

```bash
cd mechanic-sim
python3 -m http.server 8080        # or: npx serve .
# open http://localhost:8080
```

Three.js `0.160.0` and GSAP `3.12.5` load from jsDelivr through the import map in `index.html`.
To run offline, `npm i three@0.160.0 gsap@3.12.5` and point the import map at `node_modules`.

## Controls

| Input | Action |
|---|---|
| Left-click | Use the current tool on a fastener, pull a part, or interact with equipment |
| Right-drag | Look around (swivel) · right-click / `Space` step back from a lean |
| Mouse wheel | Focus zoom |
| `1`–`9` | Hands, ratchet, lug wrench, screwdriver, drain pan, impact gun, torque wrench, multimeter, floor jack |
| `Q` / `E` | Cycle work positions (bay, engine, each wheel, underside, tool chest, cart, bench, machines, office) |
| `L` / `F` | Lift up/down · work lamp |
| `J` / `B` / `H` / `M` | Job board · shop terminal · manual · mute |

### Phones & tablets

Touch devices are detected automatically. They get the Low graphics preset, a compact HUD and touch gestures.
Landscape works best, but portrait is supported.

| Gesture | Action |
|---|---|
| Tap | Use the current tool on a fastener / part / equipment |
| Drag | Look around |
| Pinch | Focus zoom |
| Hold | Inspect what's under your finger (tooltip + highlight) |
| Bottom bar / chip strip | Tools / work positions (swipe to scroll) |
| 📝 / 🩺 | Show the job card / diagnostics & removed parts |
| ⬆ Lift · 💡 Lamp · ↩ Step back | Side buttons |

## Gameplay loop

Job board → the vehicle drives in through the roll-up door → OBD scan at the laptop / multimeter / visual inspection →
open the hood or raise the lift → loosen fasteners (seized ones creak, spark and puff rust) → pull parts, which go to the bench →
clean (brush or ultrasonic), balance, or buy new → install and torque (lug nuts in a star pattern) → refill fluids →
start & road test → invoice (flat-rate labor, parts markup, speed and quality bonuses, spill and strip penalties, electricity) →
spend on tools, upgrades and garage cosmetics.

Some mistakes have consequences: pulling a drain plug without the pan, removing the oil filter before draining, pulling a
coolant hose on a hot pressurised engine, grabbing exhaust parts after a test run, impact-gunning small bolts, or skipping
the star pattern.

## Architecture

| File | Responsibility |
|---|---|
| `index.html`, `styles.css` | Import map, HUD layout (stats, job card, hotbar, diagnostics, modals) |
| `src/main.js` | Renderer & post chain, `CameraController` (focal swivel / lean-to-reach / zoom), input & raycasting, game state machine (`IDLE → ARRIVING → SERVICE → TESTING → INVOICE → LEAVING`), test drive, machines |
| `src/VehicleManager.js` | `Part` / `Fastener` / `Vehicle`, the dependency DAG (`deps`: a part can't come off while anything mounted on it is installed), wear injection from job faults, OBD codes, multimeter readings, roll-in/out, job evaluation |
| `src/vehicles/*.js` | Procedural sports car (V6 turbo), 4x4 truck (V8, leaf springs, transfer case, locking hubs), motorcycle (tube frame, chain drive, carb) plus shared corner/engine builders |
| `src/ToolController.js` | Tool models, equip, and every interaction choreography: ratchet strokes with pawl clicks, cross-wrench cranking, impact hammering with recoil, screwdriver twists, finger unthreading, two-handed part removal/installation, fluids, cleaning |
| `src/ArmRig.js` | First-person arms: analytic two-bone IK with pole vectors in camera space, 15-joint gloved hands, grip/pinch/cup poses, anchor following |
| `src/AudioFX.js` | Synthesised, HRTF-spatialised SFX: impact "brrrt-clack", ratchet pawls, socket snaps, thread creaks, engine voice (firing-frequency oscillators, misfire, turbo whine), starter chug, backfire, slosh, spray, ambience + convolution reverb |
| `src/Economy.js` | Wallet, reputation and shop level, job templates & generator, invoicing, tool/upgrade/cosmetic catalog, localStorage save |
| `src/VFX.js` | Spark streaks, oil drips → growing puddles, coolant spray & steam, exhaust smoke, dust motes, bubbles, grease decals, heat-haze post pass |
| `src/Environment.js` | Garage: scissor lift, roll-up door, drawer tool chest, diagnostic cart, bench & slots, terminal, job board, balancer, ultrasonic tank, aimable work lamp, lighting & cosmetics |
| `src/Materials.js` | PBR presets with an `onBeforeCompile` layer that draws rust, grime, grease, heat bluing, scratches and hover highlight procedurally from each part's condition |
| `src/Kit.js` | Geometry helpers and procedural fastener meshes |

`window.__game` exposes the running game in the devtools console for debugging.
