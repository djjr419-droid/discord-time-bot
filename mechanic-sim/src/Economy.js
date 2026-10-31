// Economy.js — wallet, reputation, job board generation, invoicing, shop catalog & persistence.

const SAVE_KEY = 'torque-and-tread-save-v1';

// ------------------------------------------------------------------ catalogs

export const PART_CATALOG = {
  wheel:            { name: 'Alloy wheel + tyre',        price: 240 },
  wheel_truck:      { name: 'Steel wheel + AT tyre',     price: 290 },
  wheel_moto:       { name: 'Spoked wheel + tyre',       price: 210 },
  brake_pads:       { name: 'Ceramic brake pads (axle)', price: 58 },
  brake_pads_moto:  { name: 'Sintered brake pads',       price: 34 },
  rotor:            { name: 'Vented brake rotor',        price: 96 },
  caliper:          { name: 'Brake caliper',             price: 185 },
  strut:            { name: 'Coilover strut',            price: 220 },
  spark_plugs:      { name: 'Iridium spark plugs (3)',   price: 48 },
  spark_plugs_v8:   { name: 'Iridium spark plugs (4)',   price: 62 },
  spark_plug_moto:  { name: 'Spark plug',                price: 12 },
  coil_pack:        { name: 'Ignition coil pack',        price: 140 },
  valve_cover:      { name: 'Valve cover + gasket',      price: 120 },
  cylinder_head:    { name: 'Remanufactured cylinder head', price: 780 },
  head_gasket:      { name: 'MLS head gasket',           price: 75 },
  intake_manifold:  { name: 'Intake manifold',           price: 260 },
  exhaust_manifold: { name: 'Exhaust manifold',          price: 210 },
  turbo:            { name: 'Ball-bearing turbocharger', price: 1150 },
  intake_pipe:      { name: 'Charge pipe',               price: 70 },
  air_filter:       { name: 'Air filter element',        price: 26 },
  airbox_lid:       { name: 'Airbox lid',                price: 45 },
  oil_filter:       { name: 'Oil filter',                price: 14 },
  radiator_hose:    { name: 'Upper radiator hose',       price: 38 },
  battery:          { name: 'AGM battery',               price: 175 },
  battery_moto:     { name: 'Motorcycle battery',        price: 85 },
  wheel_hub:        { name: 'Heavy-duty hub bearing',    price: 230 },
  leaf_spring:      { name: 'Leaf spring pack',          price: 320 },
  tc_seal:          { name: 'Transfer case output seal', price: 28 },
  driveshaft:       { name: 'Rear driveshaft',           price: 410 },
  chain:            { name: 'O-ring drive chain',        price: 95 },
  front_sprocket:   { name: 'Front sprocket',            price: 32 },
  carburetor:       { name: 'Carburetor',                price: 260 },
  air_pod:          { name: 'Pod air filter',            price: 22 },
  exhaust_header:   { name: 'Exhaust header pipe',       price: 180 },
  muffler:          { name: 'Slip-on muffler',           price: 240 },
  seat:             { name: 'Seat',                      price: 140 },
  caliper_moto:     { name: 'Front caliper',             price: 160 },
};

export const CONSUMABLES = {
  oil:     { name: 'Engine oil (5 qt)', price: 32 },
  coolant: { name: 'Coolant (1 gal)',   price: 18 },
};

export const TOOLS = [
  { id: 'hand',        name: 'Hands',              tier: 0, price: 0,    icon: '✋', desc: 'Grab parts, spin off loose fasteners, inspect.' },
  { id: 'socket',      name: 'Ratchet & Sockets',  tier: 1, price: 0,    icon: '🔧', desc: 'Bolts, plugs, spark plugs. Ratcheting strokes.' },
  { id: 'lug_wrench',  name: 'Cross Lug Wrench',   tier: 1, price: 0,    icon: '✚', desc: 'Lug nuts, the slow honest way.' },
  { id: 'screwdriver', name: 'Screwdriver',        tier: 1, price: 0,    icon: '🪛', desc: 'Screws and hose clamps.' },
  { id: 'drain_pan',   name: 'Oil Drain Pan',      tier: 1, price: 0,    icon: '🥘', desc: 'Place under a drain plug before pulling it.' },
  { id: 'impact',      name: 'Pneumatic Impact Gun', tier: 2, price: 650, icon: '🔫', desc: 'Lugs & bolts in a second. May strip small bolts when tightening.' },
  { id: 'torque',      name: 'Click Torque Wrench', tier: 2, price: 280,  icon: '📏', desc: 'Final torque to spec. Quality bonus on every job.' },
  { id: 'multimeter',  name: 'Digital Multimeter', tier: 2, price: 120,  icon: '📟', desc: 'Test batteries & ignition coils in place.' },
  { id: 'floor_jack',  name: 'Floor Jack',         tier: 2, price: 350,  icon: '🛠', desc: 'Supports axles — required for leaf-spring work.' },
  { id: 'ecu',         name: 'ECU Remapper',       tier: 3, price: 2200, icon: '💻', desc: 'Performance tunes from the diagnostic cart.', station: true },
  { id: 'balancer',    name: 'Laser Wheel Balancer', tier: 3, price: 1800, icon: '🎯', desc: 'Balance removed wheels at the bench.', station: true },
  { id: 'ultrasonic',  name: 'Ultrasonic Parts Cleaner', tier: 3, price: 1500, icon: '🫧', desc: 'Restore dirty parts like new in seconds.', station: true },
];

export const UPGRADES = [
  { id: 'cv_sockets',  name: 'Chrome-Vanadium Socket Set', price: 220, level: 1, desc: 'Manual tools work 30% faster.' },
  { id: 'compressor',  name: 'High-Flow Air Compressor',   price: 480, level: 2, desc: 'Impact gun 40% faster; never strips with torque sticks.' },
  { id: 'lift_hydro',  name: 'Lift Hydraulic Pack',        price: 300, level: 1, desc: 'Lift raises & lowers twice as fast.' },
  { id: 'supplier',    name: 'OEM Supplier Contract',      price: 600, level: 2, desc: 'Parts cost 15% less.' },
  { id: 'lounge',      name: 'Customer Lounge',            price: 900, level: 3, desc: 'Customers tip — +10% on every invoice.' },
];

export const COSMETICS = {
  wall: [
    { id: 'gray',   name: 'Shop Gray',     price: 0,   color: '#70757b' },
    { id: 'red',    name: 'Racing Red',    price: 150, color: '#7d2124' },
    { id: 'petrol', name: 'Petrol Blue',   price: 150, color: '#1f4d61' },
    { id: 'green',  name: 'British Green', price: 150, color: '#24402f' },
    { id: 'white',  name: 'Clean Room White', price: 220, color: '#c9cbcd' },
  ],
  floor: [
    { id: 'concrete', name: 'Sealed Concrete', price: 0,   tint: '#7d7f80' },
    { id: 'epoxy',    name: 'Black Epoxy',     price: 400, tint: '#2a2c2e' },
    { id: 'checker',  name: 'Checker Tile',    price: 650 },
  ],
  lighting: [
    { id: 'cool',  name: 'Cool Fluorescent', price: 0,   color: '#e9f3ff', accent: null },
    { id: 'warm',  name: 'Warm Sodium',      price: 120, color: '#ffd29a', accent: null },
    { id: 'neon',  name: 'Neon Accent Strips', price: 350, color: '#e9f3ff', accent: '#19e3ff' },
    { id: 'synth', name: 'Synthwave Strips', price: 450, color: '#f4e9ff', accent: '#ff2bd6' },
  ],
  wrap: [
    { id: 'red',    name: 'Tool Chest: Gloss Red',    price: 0,   color: '#b0141c', metal: 0.3 },
    { id: 'blue',   name: 'Tool Chest: Electric Blue', price: 180, color: '#1747b5', metal: 0.3 },
    { id: 'carbon', name: 'Tool Chest: Carbon Wrap',  price: 260, color: '#1a1b1d', metal: 0.6 },
    { id: 'orange', name: 'Tool Chest: Safety Orange', price: 180, color: '#d4570f', metal: 0.3 },
  ],
};

// ------------------------------------------------------------------ job templates

const NAMES = ['Dana R.', 'Marcus T.', 'Priya S.', 'Jonah K.', 'Lucia M.', 'Theo W.', 'Ana P.', 'Sam O.', 'Rosa V.', 'Kai L.', 'Mo B.', 'Ines F.'];
const MODELS = {
  sports: ['Kestrel GT-6', 'Valkyr RS', 'Corsa Strada T', 'Arden Vento'],
  truck: ['Brute 2500 HD', 'Haulmark Ridge', 'Teton Workline'],
  moto: ['Tempest 650', 'Rondo Café 400', 'Strada Scrambler'],
};
const COLORS = {
  sports: [0xb3121b, 0x0f3d8c, 0xf2f2f2, 0x111214, 0xe0a100, 0x2e6b3e, 0x6b6f74],
  truck: [0x2b3a28, 0x8a1f17, 0xd8d6cf, 0x1d2735, 0x5a4c3a],
  moto: [0xc0151f, 0x0d2c6b, 0x1a1a1a, 0xd77a12, 0x3a5f2a],
};

const TEMPLATES = [
  // sports car
  { v: 'sports', complaint: 'Squealing noise when stopping', hint: 'Front pads near the wear indicator.', book: 1.4, faults: [{ pick: ['pads_FR', 'pads_FL'], mode: 'worn' }] },
  { v: 'sports', complaint: 'Grinding from the front when braking', hint: 'Metal-on-metal: pads gone, rotor scored.', book: 2.2, faults: [{ pick: ['pads_FR'], mode: 'worn' }, { pick: ['rotor_FR'], mode: 'worn' }] },
  { v: 'sports', complaint: 'Engine misfire above 3k RPM', hint: 'Scan for a cylinder-bank misfire code.', book: 1.5, faults: [{ pick: ['plugs_L', 'plugs_R'], mode: 'worn' }] },
  { v: 'sports', complaint: 'Rough idle, check-engine light flashing', hint: 'Ignition coil output weak — multimeter helps.', book: 1.2, faults: [{ pick: ['coils_L', 'coils_R'], mode: 'worn' }] },
  { v: 'sports', complaint: 'Oil change light is on, oil looks black', hint: 'Drain oil, replace filter, refill.', book: 0.8, faults: [{ pick: ['oil'], mode: 'oil' }, { pick: ['oil_filter'], mode: 'worn' }] },
  { v: 'sports', complaint: 'Loss of power and a whistle under boost', hint: 'Turbo shaft play — it lives on the right exhaust manifold.', book: 3.5, level: 2, faults: [{ pick: ['turbo'], mode: 'worn' }] },
  { v: 'sports', complaint: 'Struggles to start on cold mornings', hint: 'Battery resting voltage is low.', book: 0.5, faults: [{ pick: ['battery'], mode: 'worn' }] },
  { v: 'sports', complaint: 'Clunk over bumps, bouncy front end', hint: 'A front strut has blown its damping.', book: 2.0, faults: [{ pick: ['strut_FR', 'strut_FL'], mode: 'worn' }] },
  { v: 'sports', complaint: 'Ticking noise from the engine at cold start', hint: 'Cracked exhaust manifold (look for heat damage).', book: 2.4, level: 2, faults: [{ pick: ['exhaust_manifold_L'], mode: 'worn' }] },
  { v: 'sports', complaint: 'Overheating and white smoke from the exhaust', hint: 'Classic head gasket. Check the upper hose too.', book: 6.0, level: 3, faults: [{ pick: ['head_gasket_L', 'head_gasket_R'], mode: 'worn' }, { pick: ['radiator_hose'], mode: 'worn' }] },
  { v: 'sports', complaint: 'Sluggish acceleration, poor fuel economy', hint: 'Breathing problem — check the intake.', book: 0.5, faults: [{ pick: ['air_filter'], mode: 'dirty' }] },
  { v: 'sports', complaint: 'Customer wants a Stage 1 performance tune', hint: 'Needs the ECU remapper at the diagnostic cart.', book: 1.0, tools: ['ecu'], faults: [{ pick: ['ecu'], mode: 'tune' }] },
  { v: 'sports', complaint: 'Steering wheel shakes at highway speed', hint: 'A front wheel is out of balance.', book: 1.2, tools: ['balancer'], faults: [{ pick: ['wheel_FR', 'wheel_FL'], mode: 'imbalance' }] },
  // truck
  { v: 'truck', complaint: 'Leaking transmission fluid under the middle', hint: 'Transfer case rear output seal.', book: 2.4, faults: [{ pick: ['tc_seal'], mode: 'worn' }] },
  { v: 'truck', complaint: 'Rear sags under load, clunking leaf pack', hint: 'Cracked leaf. Support the axle with a floor jack.', book: 3.0, tools: ['floor_jack'], faults: [{ pick: ['leaf_RL', 'leaf_RR'], mode: 'worn' }] },
  { v: 'truck', complaint: 'Growling noise from a front wheel', hint: 'Front hub bearing is shot.', book: 2.0, faults: [{ pick: ['hub_FR', 'hub_FL'], mode: 'worn' }] },
  { v: 'truck', complaint: 'Brakes squeal and pedal feels soft', hint: 'Front pads.', book: 1.6, faults: [{ pick: ['pads_FR', 'pads_FL'], mode: 'worn' }] },
  { v: 'truck', complaint: 'Fleet oil service due', hint: 'Drain, filter, refill.', book: 0.9, faults: [{ pick: ['oil'], mode: 'oil' }, { pick: ['oil_filter'], mode: 'worn' }] },
  { v: 'truck', complaint: 'Misfire while towing uphill', hint: 'Spark plugs on one bank.', book: 1.8, faults: [{ pick: ['plugs_L', 'plugs_R'], mode: 'worn' }] },
  { v: 'truck', complaint: 'Dead battery after sitting a week', hint: 'Test & replace the battery.', book: 0.5, faults: [{ pick: ['battery'], mode: 'worn' }] },
  { v: 'truck', complaint: 'Engine runs hot when hauling', hint: 'Collapsed upper radiator hose.', book: 0.9, faults: [{ pick: ['radiator_hose'], mode: 'worn' }] },
  // motorcycle
  { v: 'moto', complaint: 'Bogs and hesitates off idle', hint: 'Varnished carburetor jets — clean it.', book: 1.2, faults: [{ pick: ['carburetor'], mode: 'dirty' }] },
  { v: 'moto', complaint: 'Chain slaps and the drive feels clunky', hint: 'Stretched chain + hooked front sprocket.', book: 1.5, faults: [{ pick: ['chain'], mode: 'worn' }, { pick: ['front_sprocket'], mode: 'worn' }] },
  { v: 'moto', complaint: 'Metallic scrape from the front brake', hint: 'Front pads to the backing plate.', book: 1.0, faults: [{ pick: ['front_pads'], mode: 'worn' }] },
  { v: 'moto', complaint: 'Hard starting, spits and pops on overrun', hint: 'Fouled spark plug.', book: 0.5, faults: [{ pick: ['spark_plug'], mode: 'worn' }] },
  { v: 'moto', complaint: 'Exhaust ticking and blowing at the head', hint: 'Cracked header pipe.', book: 1.0, faults: [{ pick: ['exhaust_header'], mode: 'worn' }] },
  { v: 'moto', complaint: 'Annual service: oil and filter', hint: 'Drain, filter, refill.', book: 0.7, faults: [{ pick: ['oil'], mode: 'oil' }, { pick: ['oil_filter'], mode: 'worn' }] },
  { v: 'moto', complaint: 'Clicks but will not crank', hint: 'Battery lives under the seat.', book: 0.5, faults: [{ pick: ['battery'], mode: 'worn' }] },
  { v: 'moto', complaint: 'Front end wobbles above 60 mph', hint: 'Front wheel balance.', book: 0.9, tools: ['balancer'], faults: [{ pick: ['front_wheel'], mode: 'imbalance' }] },
];

const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ------------------------------------------------------------------ Economy

export class Economy {
  constructor() {
    this.listeners = {};
    this.reset();
    this.load();
    if (!this.state.jobs || this.state.jobs.length === 0) this.refreshJobs();
  }

  reset() {
    this.state = {
      cash: 650, rep: 0, jobsDone: 0, day: 1, totalEarned: 0,
      tools: ['hand', 'socket', 'lug_wrench', 'screwdriver', 'drain_pan'],
      upgrades: [],
      cosmetics: { wall: 'gray', floor: 'concrete', lighting: 'cool', wrap: 'red' },
      ownedCosmetics: ['wall:gray', 'floor:concrete', 'lighting:cool', 'wrap:red'],
      stock: { oil: 2, coolant: 1 },
      jobs: [],
      ledger: [],
      jobSeq: 1,
    };
  }

  on(evt, fn) { (this.listeners[evt] ||= []).push(fn); }
  emit(evt, data) { (this.listeners[evt] || []).forEach((f) => f(data)); }

  get cash() { return this.state.cash; }
  get level() { return Math.min(5, 1 + Math.floor(this.state.rep / 6)); }
  get repStars() { return Math.max(0, Math.min(5, this.state.rep / 6)); }

  hasTool(id) { return this.state.tools.includes(id); }
  hasUpgrade(id) { return this.state.upgrades.includes(id); }

  partCost(kind) {
    const p = PART_CATALOG[kind]?.price ?? 50;
    return Math.round(p * (this.hasUpgrade('supplier') ? 0.85 : 1));
  }

  spend(amount, label) {
    if (amount > this.state.cash) return false;
    this.state.cash -= amount;
    this._ledger(-amount, label);
    this.emit('cash', this.state.cash);
    this.save();
    return true;
  }

  earn(amount, label) {
    this.state.cash += amount;
    this.state.totalEarned += Math.max(0, amount);
    this._ledger(amount, label);
    this.emit('cash', this.state.cash);
    this.save();
  }

  _ledger(amount, label) {
    this.state.ledger.unshift({ amount: Math.round(amount), label, day: this.state.day });
    this.state.ledger.length = Math.min(this.state.ledger.length, 40);
  }

  useConsumable(id) {
    if ((this.state.stock[id] || 0) > 0) { this.state.stock[id]--; this.save(); return { ok: true, cost: 0 }; }
    const price = CONSUMABLES[id].price;
    if (!this.spend(price, CONSUMABLES[id].name)) return { ok: false };
    return { ok: true, cost: price };
  }

  // ---------------------------------------------------------------- jobs

  refreshJobs() {
    while (this.state.jobs.length < 4) this.state.jobs.push(this.generateJob());
    this.save();
    this.emit('jobs', this.state.jobs);
  }

  generateJob() {
    const lvl = this.level;
    const pool = TEMPLATES.filter((t) => (t.level || 1) <= lvl + 1);
    // avoid duplicate complaints on the board
    const taken = new Set(this.state.jobs.map((j) => j.complaint));
    let tpl = pickOne(pool);
    for (let i = 0; i < 10 && taken.has(tpl.complaint); i++) tpl = pickOne(pool);
    const faults = tpl.faults.map((f) => ({ part: pickOne(f.pick), mode: f.mode }));
    const rate = 88 + lvl * 6;
    const id = this.state.jobSeq++;
    return {
      id,
      vehicle: tpl.v,
      model: pickOne(MODELS[tpl.v]),
      color: pickOne(COLORS[tpl.v]),
      customer: pickOne(NAMES),
      complaint: tpl.complaint,
      hint: tpl.hint,
      bookHours: tpl.book,
      laborRate: rate,
      quote: Math.round(rate * tpl.book + 40),
      faults,
      tools: tpl.tools || [],
      minLevel: tpl.level || 1,
      arrivedHot: Math.random() < 0.5,
      seed: Math.floor(Math.random() * 1e9),
    };
  }

  canAccept(job) {
    const missing = job.tools.filter((t) => !this.hasTool(t));
    if (missing.length) return { ok: false, reason: 'Requires ' + missing.map((m) => TOOLS.find((t) => t.id === m).name).join(', ') };
    if (job.minLevel > this.level) return { ok: false, reason: `Requires shop level ${job.minLevel}` };
    return { ok: true };
  }

  takeJob(id) {
    const i = this.state.jobs.findIndex((j) => j.id === id);
    if (i < 0) return null;
    const [job] = this.state.jobs.splice(i, 1);
    this.save();
    return job;
  }

  /**
   * Builds the invoice for a completed job.
   * result: { faults:[{part,mode,fixed}], replaced:[{kind,faulty}], cleanedExtra, spills, stripped,
   *           patternErrors, torqueWrenchAll, roadworthy, gameMinutes, machineUses, liftCycles }
   */
  invoice(job, result) {
    const lines = [];
    const markup = 1.35;
    const fixed = result.faults.filter((f) => f.fixed).length;
    const total = result.faults.length || 1;
    const accuracy = fixed / total;

    const labor = Math.round(job.laborRate * job.bookHours * Math.max(0.2, accuracy));
    lines.push({ label: `Labor — ${job.bookHours.toFixed(1)} h book @ $${job.laborRate}/h${accuracy < 1 ? ` (${Math.round(accuracy * 100)}% complete)` : ''}`, amount: labor });

    let partsBilled = 0, partsAbsorbed = 0;
    for (const r of result.replaced) {
      const cost = this.partCost(r.kind);
      if (r.faulty) {
        const billed = Math.round(cost * markup);
        partsBilled += billed;
        lines.push({ label: `Part: ${PART_CATALOG[r.kind]?.name || r.kind} (+35% markup)`, amount: billed });
      } else {
        partsAbsorbed += cost;
        lines.push({ label: `Unneeded part — customer declined: ${PART_CATALOG[r.kind]?.name || r.kind}`, amount: 0, note: true });
      }
    }
    if (result.fluids) for (const f of result.fluids) {
      const billed = Math.round(CONSUMABLES[f].price * markup);
      lines.push({ label: `Fluids: ${CONSUMABLES[f].name}`, amount: billed });
      partsBilled += billed;
    }
    if (result.faults.some((f) => f.mode === 'tune' && f.fixed)) lines.push({ label: 'ECU Stage 1 calibration', amount: 650 });
    if (result.faults.some((f) => f.mode === 'imbalance' && f.fixed)) lines.push({ label: 'Laser wheel balance', amount: 60 });
    if (result.cleanedExtra > 0) lines.push({ label: `Detailing: ${result.cleanedExtra} component(s) cleaned`, amount: result.cleanedExtra * 12 });

    const bookMin = job.bookHours * 60;
    const fast = result.gameMinutes <= bookMin && accuracy === 1;
    if (fast) lines.push({ label: `Speed bonus (${Math.round(result.gameMinutes)} min vs ${Math.round(bookMin)} min book)`, amount: Math.round(labor * 0.2) });
    if (result.torqueWrenchAll && accuracy === 1) lines.push({ label: 'Quality: everything torqued to spec', amount: Math.round(labor * 0.08) });
    if (result.patternErrors > 0) lines.push({ label: `Uneven wheel torque pattern ×${result.patternErrors}`, amount: -Math.round(labor * 0.04 * result.patternErrors) });
    if (result.stripped > 0) lines.push({ label: `Stripped fastener replacement ×${result.stripped}`, amount: -12 * result.stripped });
    if (result.spills > 0) lines.push({ label: `Spill clean-up & absorbent ×${result.spills}`, amount: -15 * result.spills });
    if (result.burns > 0) lines.push({ label: `First-aid kit restock`, amount: -6 * result.burns });
    if (!result.roadworthy) lines.push({ label: 'Vehicle returned not roadworthy — customer refused payment', amount: 0, note: true });

    let gross = lines.reduce((s, l) => s + l.amount, 0);
    if (!result.roadworthy) gross = 0;
    if (this.hasUpgrade('lounge') && gross > 0) {
      const tip = Math.round(gross * 0.1);
      lines.push({ label: 'Customer lounge tip', amount: tip });
      gross += tip;
    }
    const electricity = Math.round(3 + result.liftCycles * 0.6 + result.machineUses * 1.5);
    const expenses = [{ label: 'Shop electricity', amount: -electricity }];

    let stars = 1 + accuracy * 3 + (fast ? 0.5 : 0) + (result.torqueWrenchAll ? 0.5 : 0) - result.patternErrors * 0.25 - result.spills * 0.3 - result.stripped * 0.25;
    if (!result.roadworthy) stars = 0.5;
    stars = Math.max(0.5, Math.min(5, stars));
    const repDelta = Math.round(((stars - 2.5) * 1.2 + (accuracy === 1 ? 1 : -1)) * 10) / 10;

    return {
      lines,
      expenses, gross, electricity,
      net: gross - electricity,
      partsAbsorbed, accuracy, stars, repDelta, fast,
    };
  }

  settle(invoice) {
    if (invoice.gross > 0) this.earn(invoice.gross, 'Job payment');
    this.state.cash -= invoice.electricity;
    this._ledger(-invoice.electricity, 'Electricity');
    this.state.rep = Math.max(0, this.state.rep + invoice.repDelta);
    this.state.jobsDone++;
    if (this.state.jobsDone % 3 === 0) this.state.day++;
    this.emit('cash', this.state.cash);
    this.refreshJobs();
    this.save();
  }

  // ---------------------------------------------------------------- shop

  buyTool(id) {
    const t = TOOLS.find((x) => x.id === id);
    if (!t || this.hasTool(id)) return { ok: false, reason: 'Already owned' };
    const needLevel = t.tier === 3 ? 3 : t.tier === 2 ? 2 : 1;
    if (this.level < needLevel) return { ok: false, reason: `Unlocks at shop level ${needLevel}` };
    if (!this.spend(t.price, `Tool: ${t.name}`)) return { ok: false, reason: 'Not enough cash' };
    this.state.tools.push(id);
    this.save();
    this.emit('tools', this.state.tools);
    return { ok: true };
  }

  buyUpgrade(id) {
    const u = UPGRADES.find((x) => x.id === id);
    if (!u || this.hasUpgrade(id)) return { ok: false, reason: 'Already owned' };
    if (this.level < u.level) return { ok: false, reason: `Unlocks at shop level ${u.level}` };
    if (!this.spend(u.price, `Upgrade: ${u.name}`)) return { ok: false, reason: 'Not enough cash' };
    this.state.upgrades.push(id);
    this.save();
    this.emit('upgrades', this.state.upgrades);
    return { ok: true };
  }

  buyCosmetic(cat, id) {
    const key = `${cat}:${id}`;
    const item = COSMETICS[cat].find((c) => c.id === id);
    if (!this.state.ownedCosmetics.includes(key)) {
      if (!this.spend(item.price, `Cosmetic: ${item.name}`)) return { ok: false, reason: 'Not enough cash' };
      this.state.ownedCosmetics.push(key);
    }
    this.state.cosmetics[cat] = id;
    this.save();
    this.emit('cosmetics', this.state.cosmetics);
    return { ok: true };
  }

  buyConsumable(id) {
    if (!this.spend(CONSUMABLES[id].price, CONSUMABLES[id].name)) return { ok: false, reason: 'Not enough cash' };
    this.state.stock[id] = (this.state.stock[id] || 0) + 1;
    this.save();
    return { ok: true };
  }

  // ---------------------------------------------------------------- persistence

  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.state)); } catch (e) { /* storage unavailable */ }
  }

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) this.state = { ...this.state, ...JSON.parse(raw) };
    } catch (e) { /* fresh start */ }
  }

  wipe() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    this.reset();
    this.refreshJobs();
    this.emit('cash', this.state.cash);
    this.emit('cosmetics', this.state.cosmetics);
    this.emit('tools', this.state.tools);
  }
}
